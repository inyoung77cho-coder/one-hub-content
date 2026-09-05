// [A1/A2/A3/A4] 종합자산 = 읽기 전용 인덱스(지도). 상세·편집은 자식 페이지로 위임(편집 UI 없음).
//   3층 구조: 1층 판단1문장+총자산+액션3 / 2층 자산지도(도넛+링크) / 3층 상세 아코디언(기본 닫힘).
//   데이터: lib/assetsTotal(단일 소스) + /api/pwa-dashboard. 자체 합산 금지 — 원장 값만 사용.
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import Sparkline from "../../components/shared/Sparkline"; // [S23 T-4] 총자산 스파크라인(오늘 화면과 공용)
import useSwipeTabs from "../../components/shared/useSwipeTabs"; // [S25-4] 자산군 요약 카드 스와이프(페이지 이동 아님)
import { getTrader, useTrader } from "../../lib/trader";
import { getLedger } from "../../lib/ledger";
import { recordSnapshot, getDelta, getHistory, getAssetSeries } from "../../lib/assetHistory";
import AvgPriceWarningCard from "../../components/shared/AvgPriceWarningCard"; // [S22-1] 이상 평단 확인 카드(주식·ETF 공용)
import { getTargetClass, setTargetClass, computeClassDrift, topDriftMessage, CLASS_PRESETS } from "../../lib/targetClass"; // [S22-4] 자산군 목표 배분
import { pickInsight } from "../../lib/crossInsight"; // [S22-10] 자산군 교차 인사이트(하나만)
import { cachedJson } from "../../lib/quoteCache"; // [S29-3] 대시보드 GET 디둡·캐시
import TraderBadge from "../../components/shared/TraderBadge";
import AppHeader from "../../components/AppHeader";
import SegTabs from "../../components/shared/SegTabs";
import SyncStatus from "../../components/SyncStatus";
import BottomNav from "../../components/BottomNav";
import DataState from "../../components/DataState";
import LastUpdated from "../../components/LastUpdated";
import QuickAddSheet from "../../components/shared/QuickAddSheet";
import AssetMapTitle from "../../components/AssetMapTitle";
import KisHoldingsCard, { deriveUrgency } from "../../components/shared/KisHoldingsCard";
import ManualHoldingsCard from "../../components/shared/ManualHoldingsCard";
import FeedbackButton from "../../components/FeedbackButton";

const uk = (v) => (v == null ? "-" : `${Number(v).toFixed(2)}억`);
// 백엔드가 positions를 문자열로 주는 경우가 있어 방어적으로 파싱(today.js와 동일 로직)
function parsePositions(dash) {
  let p = dash?.balance?.positions;
  if (typeof p === "string") { try { p = JSON.parse(p); } catch { p = null; } }
  return Array.isArray(p) ? p : [];
}
// [OS-2] "자산지도" 옆 순환 표시 — 종목변경 버튼으로 순환, 라벨을 탭하면 해당 상세 페이지로 이동.
//   key는 QuickAddSheet의 initialAsset과 동일 값 — 선택된 뷰의 "+"가 그 자산군으로 바로 열리게.
const ASSET_VIEWS = [
  { label: "주식", key: "stock", href: "/pwa?tab=portfolio" },
  { label: "ETF", key: "etf", href: "/pwa/etf" },
  { label: "부동산", key: "realestate", href: "/pwa/realestate" },
];

// 변화액 표기 헬퍼(억). 부호·색 구분.
const dvUk = (v) => (v == null ? null : `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(2)}억`);
const dCls = (v) => (v == null ? "" : v > 0.004 ? "up" : v < -0.004 ? "down" : "flat");

// [S23 T-4] 스파크라인은 오늘 화면과 공용 컴포넌트로 통일(components/shared/Sparkline).

// 자산군 메타(라벨·색·링크) — [순서변경] 주식 hooking → 부동산·주식 AI가 유료 전환점 → ETF → 현금
const CLASSES = [
  ["stock", "📈 주식", "var(--color-primary)", "/pwa?tab=portfolio"],
  ["realestate", "🏠 부동산", "var(--color-success)", "/pwa/realestate"],
  ["etf", "💹 ETF", "var(--color-etf, var(--color-primary))", "/pwa/etf"],
  ["cash", "💵 현금", "var(--color-warning)", null],
];

export default function AssetsMapPage() {
  const router = useRouter();
  const [trader] = useTrader();
  const [assets, setAssets] = useState(null);
  const [dash, setDash] = useState(null);
  const [status, setStatus] = useState("loading");
  const [at, setAt] = useState(null);
  const [qaOpen, setQaOpen] = useState(false);
  const [delta, setDelta] = useState(null);      // [추세] 전일 대비 총자산·자산별 변화(브라우저 스냅샷 기반)
  const [hist, setHist] = useState([]);          // [추세] 총자산 일별 스냅샷 시계열
  const [exRes, setExRes] = useState(true);      // [§3.1] 실거주(대표단지) 제외 보기 — 기본 켜짐(운용가능 먼저)
  const [invProps, setInvProps] = useState([]);  // [§3.1] 추가 보유 부동산(투자용) = onehub_re_properties
  const [myComplex, setMyComplex] = useState(""); // [§3.1] 대표단지(실거주)명
  const [view, setView] = useState(0); // [OS-2] 0=주식 1=ETF 2=부동산 — 종목변경 순환에 맞춰 아래 카드 필터
  // [사용자 지시] 보유/추천 "자세히" 페이지에서 back·"주식" 탭 클릭으로 돌아왔을 때 원래 보던
  //   탭 그대로 복귀하도록 localStorage에 기억(이 페이지는 라우트 이동이라 리마운트되며 state가
  //   초기화되므로, 컴포넌트 state가 아니라 localStorage로 넘겨야 살아남는다).
  const [stockTab, setStockTabState] = useState(() => {
    if (typeof window === "undefined") return "hold";
    try { return localStorage.getItem("onehub_assets_stocktab") === "recommend" ? "recommend" : "hold"; } catch { return "hold"; }
  });
  const setStockTab = (v) => {
    setStockTabState(v);
    try { localStorage.setItem("onehub_assets_stocktab", v); } catch {}
  };

  const load = useCallback(() => {
    const tr = getTrader();
    setStatus((s) => (assets ? "stale" : "loading"));
    // [§3.1] 추가 보유 부동산(투자용)만 별도로 읽어 실거주(대표단지)와 분리한다.
    try {
      const rp = JSON.parse(localStorage.getItem("onehub_re_properties") || "null");
      setInvProps(Array.isArray(rp) ? rp : []);
      const mp = JSON.parse(localStorage.getItem("onehub_re_my_property") || "null");
      setMyComplex(mp?.name || "");
    } catch (e) { setInvProps([]); }
    Promise.all([
      getLedger(tr, { awaitSync: !assets }).catch(() => ({ ok: false })),
      cachedJson(`/api/pwa-dashboard?trader=${tr}`).then((d) => d || { ok: false }).catch(() => ({ ok: false })),
    ]).then(([a, d]) => {
      setAssets(a); setDash(d); setAt(new Date());
      setStatus(a && a.ok ? "ok" : "error");
      // [추세] 총자산이 유효할 때만 오늘치 스냅샷을 적립하고, 전일 대비/시계열을 읽는다.
      if (a && a.ok && a.total_uk != null) {
        recordSnapshot(tr, a);
        setDelta(getDelta(tr));
        setHist(getHistory(tr));
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assets]);

  useEffect(() => {
    load();
    const onChange = () => load();
    window.addEventListener("onehub-trader-change", onChange);
    window.addEventListener("onehub-assets-change", onChange);
    // [ⓖ] KIS 외 증권사(직접입력) 종목도 실시간에 가깝게 — getLedger()가 내부적으로 lib/stockLive를
    //   호출해 매번 최신 시세를 반영하므로, 화면을 오래 켜둬도 낡지 않게 1분 주기로 재조회한다.
    //   백그라운드 탭은 건너뛰고, 탭이 다시 보이면 즉시 갱신.
    // [S19-1] 주기 재조회는 동기화를 다시 기다릴 이유가 없다(이미 확정됐거나 offline).
    const id = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      load();
    }, 60000);
    const onVisible = () => { if (document.visibilityState === "visible") load(); };
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("onehub-trader-change", onChange);
      window.removeEventListener("onehub-assets-change", onChange);
      clearInterval(id);
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const bd = assets?.breakdown || {};
  const rows = CLASSES.map(([k, label, color, href]) => ({
    k, label, color, href,
    val: bd[`${k}_uk`] != null ? Number(bd[`${k}_uk`]) : null,
  }));
  const total = assets?.total_uk != null ? Number(assets.total_uk) : rows.reduce((s, r) => s + (r.val || 0), 0);
  // [§3.1] 실거주(대표단지) 분리 — realestate_uk = 대표단지 + 추가부동산. 추가부동산(투자용)만 빼면 실거주값.
  // [사용자 지시] bd.realestate_uk는 이제 lib/ledger.js에서 전세보증금을 뺀 순자산 기준이므로,
  //   여기서 분리해내는 투자용 부동산 값도 동일하게 순액(평가−보증금)으로 맞춰야 실거주 잔여값이
  //   맞게 계산된다(양쪽 다 총액이면 상관없지만 한쪽만 순액이면 실거주가 부풀어 보인다).
  const realtyUk = bd.realestate_uk != null ? Number(bd.realestate_uk) : 0;
  const invRealtyUk = invProps.reduce((s, p) => s + Math.max(0, (Number(p.valueUk) || 0) - (Number(p.deposit) || 0)), 0);
  // [S23 T-2] 실거주/운용은 lib/ledger.js 가 낸 필드를 읽는다(오늘 페이지와 같은 소스). 없으면 로컬 폴백(무회귀).
  const residenceUk = bd.residence_uk != null ? Number(bd.residence_uk) : Math.max(0, realtyUk - invRealtyUk); // 실거주(못 파는 자산)
  const hasResidence = residenceUk > 0.005;
  const opTotal = bd.operating_uk != null ? Number(bd.operating_uk) : Math.max(0, total - residenceUk);        // 운용 가능 자산
  const useEx = exRes && hasResidence;                        // 실거주 제외 뷰 활성
  // [S22-4] 자산군 목표 배분 — 운용 breakdown(실거주 제외)으로 이탈(%p) 계산.
  const opClass = {
    stock: bd.stock_uk != null ? Number(bd.stock_uk) : 0,
    etf: bd.etf_uk != null ? Number(bd.etf_uk) : 0,
    realestate: invRealtyUk,
    cash: bd.cash_uk != null ? Number(bd.cash_uk) : 0,
  };
  const targetClass = getTargetClass();
  const classDrift = computeClassDrift(opClass, targetClass);
  const classDriftMsg = topDriftMessage(classDrift);
  // [S25-4] 자산군 요약 카드 3장 — 좌우 스와이프로 이 카드만 전환(페이지 이동은 '상세 보기' 클릭만).
  const summaryCards = [
    { key: "stock", label: "📈 주식", val: bd.stock_uk != null ? Number(bd.stock_uk) : null, delta: delta?.stock, drift: (classDrift || []).find((d) => d.key === "stock"), series: (hist || []).map((h) => h.stock), href: "/pwa?tab=portfolio" },
    { key: "etf", label: "💹 ETF", val: bd.etf_uk != null ? Number(bd.etf_uk) : null, delta: delta?.etf, drift: (classDrift || []).find((d) => d.key === "etf"), series: (hist || []).map((h) => h.etf), href: "/pwa/etf" },
    { key: "realestate", label: "🏠 부동산(투자)", val: invRealtyUk > 0.005 ? invRealtyUk : null, delta: delta?.realty, drift: (classDrift || []).find((d) => d.key === "realestate"), series: (hist || []).map((h) => h.realty), href: "/pwa/realestate" },
  ];
  const [sumIdx, setSumIdx] = useState(0);
  const sumSwipe = useSwipeTabs({ index: sumIdx, count: summaryCards.length, onChange: setSumIdx });
  // [S22-10] 자산군 교차 인사이트 — 세 자산을 다 아는 앱만 할 수 있는 한 줄(가장 강한 것 하나).
  //   (환노출 규칙용 overseasPct 는 보유 실시세 환산이 필요해 후속 — 지금은 자산군 집중·유동성 규칙이 동작.)
  const overseasPct = 0;
  const crossInsight = (() => {
    try { return pickInsight(assets, { ...(dash?.market || {}), blockedCount: dash?.blockedCount, overseasPct }); }
    catch (e) { return null; }
  })();

  // 자산 지도/쏠림 진단만 뷰에 따라 분모가 바뀐다(총자산 헤드라인은 항상 total 유지 = 단일 소스).
  const mapDenom = useEx ? opTotal : total;
  const mapRows = (useEx
    ? rows.map((r) => (r.k === "realestate"
        ? { ...r, label: "🏠 부동산(투자)", val: invRealtyUk > 0.005 ? invRealtyUk : null }
        : r))
    : rows
  ).filter((r) => !(useEx && r.k === "realestate" && !(invRealtyUk > 0.005)));
  const pctOf = (v) => (mapDenom > 0 && v != null ? (v / mapDenom) * 100 : 0);
  // [S19-1] 값이 없다고 다 '미입력'이 아니다. 실거주만 있고 투자용 부동산이 없으면 '미입력'이 아니라
  //   설계상 운용자산에서 뺀 것이다 — 그 차이를 라벨로 구분한다(사용자 지적: 실거주는 투자자산 제외).
  const emptyLabel = (k) => {
    if (k === "realestate" && hasResidence) return "실거주만 · 운용 제외";
    return "미입력";
  };

  // [사용자 지시] "주식" 뷰 — 주식 페이지(보유·추천)와 연결되는 계좌현황 요약 카드용 데이터.
  const positions = parsePositions(dash);
  // [사용자 지적] 탭 전환이 눈에 보이도록 '보유' 탭에서만 나오는 한 줄 요약용 값.
  //   직접입력 건수는 원장이 이미 세어둔 값이 없어 localStorage 를 직접 세지 않고 목록 길이만 쓴다.
  const holdActionCnt = positions.filter((p) => deriveUrgency(p).rank <= 2).length;
  const [manualCount, setManualCount] = useState(0);
  useEffect(() => {
    const count = () => {
      try {
        const raw = JSON.parse(localStorage.getItem("onehub_stock_holdings") || "[]");
        const tr = getTrader();
        setManualCount(Array.isArray(raw) ? raw.filter((h) => (h.trader || "A") === tr).length : 0);
      } catch (e) { setManualCount(0); }
    };
    count();
    window.addEventListener("onehub-assets-change", count);
    return () => window.removeEventListener("onehub-assets-change", count);
  }, []);

  // 도넛(stroke-dasharray) — 뷰 분모(mapDenom) 기준
  const donut = (() => {
    const R = 42, C = 2 * Math.PI * R;
    let acc = 0;
    return mapRows.filter((r) => (r.val || 0) > 0).map((r) => {
      const frac = mapDenom > 0 ? (r.val || 0) / mapDenom : 0;
      const seg = { color: r.color, dash: frac * C, offset: -acc * C, k: r.k };
      acc += frac;
      return seg;
    });
  })();

  return (
    <div className="as">
      {/* [사용자 지시] 상위 메뉴는 고정하고 그 아래 내용만 스크롤 */}
      <div className="sticky-hdr">
        <AppHeader />

        {/* [사용자 지시] ETF·부동산 페이지로 이동해도 이 타이틀 바가 그대로 이어지도록 공용 컴포넌트로 통일 */}
        <AssetMapTitle current="주식" onChangeView={(i) => setView(i)} />

        {/* [사용자 지시] 주식 페이지의 보유/추천을 상위 메뉴바 바로 아래 탭으로 — "주식" 뷰에서만 노출 */}
        {view === 0 && (
          <>
          <div style={{ margin: "0 2px 12px" }}>
            <SegTabs
              items={[{ key: "hold", label: "보유" }, { key: "recommend", label: "추천" }]}
              index={stockTab === "recommend" ? 1 : 0}
              onChange={(i) => setStockTab(i === 1 ? "recommend" : "hold")}
              ariaLabel="주식 보유/추천"
            />
          </div>
          {/* [사용자 지적] 보유↔추천을 눌러도 첫 화면(자산 지도 카드)이 똑같아 '탭이 바뀌었나'를
              알 수 없었다. 탭 바로 아래에 그 탭에서만 달라지는 한 줄을 둬 전환을 눈으로 확인시킨다. */}
          <div className={`as-tabnote ${stockTab}`}>
            {stockTab === "hold"
              ? <>📊 <b>보유</b> · KIS {positions.length}종목{manualCount > 0 ? ` + 직접입력 ${manualCount}종목` : ""}{holdActionCnt > 0 ? ` · 오늘 조치 ${holdActionCnt}건` : " · 오늘 조치 없음"}</>
              : <>🔍 <b>추천</b> · AI 추천 종목과 매수 판단(샀어요·관망)을 이 탭에서 기록합니다</>}
          </div>
          </>
        )}
      </div>

      <SyncStatus />
      <DataState status={status} hasData={!!assets} onRetry={load} skeletonLines={5} skeletonBlock>
        {/* ── [사용자 지시] 자산 지도 카드를 맨 위로 — "주식" 뷰에서는 계좌현황 요약을 카드 맨 위에 병합 ── */}
        <section className="card">
          <div className="as-h">자산 지도</div>
          {/* [버그 수정] dash.balance.total_asset은 증권사(KIS) 연동 잔고만 — 직접입력 등 KIS外
              보유가 빠져 있었다. 단일 원장(bd.stock_uk, 이미 KIS+직접입력 통합)으로 교체 — 아래
              범례의 "📈 주식" 행과 항상 같은 수를 보게 된다. */}
          {view === 0 && (
            <div className="as-vc-acct">
              {/* [사용자 지시] 아래 범례(억 단위)와 달리 이 큰 숫자는 원 단위로 정확히 표기 —
                  자산군 라벨도 함께 표시해 무엇의 금액인지 분명히 한다. */}
              <div className="as-vc-acct-lbl">📈 주식</div>
              <div className="as-vc-acct-total">{bd.stock_uk != null ? `${(bd.stock_won ?? Math.round(Number(bd.stock_uk) * 1e8)).toLocaleString()}원` : "-"}</div>
              {dash?.balance?.unrealized_pnl != null && (
                <div className="as-vc-acct-sub">
                  평가손익(KIS 연동) <b className={dash.balance.unrealized_pnl >= 0 ? "up" : "dn"}>{dash.balance.unrealized_pnl >= 0 ? "+" : ""}{dash.balance.unrealized_pnl.toLocaleString()}원</b>
                </div>
              )}
            </div>
          )}
          <div className="as-map">
            <svg className="as-donut" viewBox="0 0 100 100" role="img" aria-label="자산 구성 도넛">
              <circle cx="50" cy="50" r="42" fill="none" stroke="var(--color-line)" strokeWidth="12" />
              {donut.map((s) => (
                <circle key={s.k} cx="50" cy="50" r="42" fill="none" stroke={s.color} strokeWidth="12"
                  strokeDasharray={`${s.dash} ${2 * Math.PI * 42 - s.dash}`} strokeDashoffset={s.offset}
                  transform="rotate(-90 50 50)" />
              ))}
              <text x="50" y="47" textAnchor="middle" className="as-donut-t">{useEx ? "운용" : "총"}</text>
              <text x="50" y="60" textAnchor="middle" className="as-donut-v">{uk(mapDenom)}</text>
            </svg>
            {/* [사용자 지시] 주식/부동산/ETF/현금 링크 삭제 — 이제 클릭해 이동하는 용도가 아니라
                순수 배분 정보 표시로만 쓴다. */}
            <div className="as-legend">
              {mapRows.map((r) => (
                <div className="as-row" key={r.k}>
                  <span className="as-dotc" style={{ background: r.color }} />
                  <span className="as-rl">{r.label}</span>
                  <span className="as-rv">
                    {r.val != null ? uk(r.val) : <em>{emptyLabel(r.k)}</em>}
                    {(() => {
                      // CLASSES 키(stock/realestate/etf/cash) → delta 키(stock/realty/etf/cash)
                      const dk = r.k === "realestate" ? "realty" : r.k;
                      const dv = delta ? delta[dk] : null;
                      return dv != null && Math.abs(dv) >= 0.005
                        ? <span className={`as-rd ${dCls(dv)}`}>{dvUk(dv)}</span> : null;
                    })()}
                  </span>
                  <span className="as-rp">{r.val != null ? `${pctOf(r.val).toFixed(1)}%` : ""}</span>
                </div>
              ))}
              {/* [§3.1] 실거주는 운용 분모에서 빠진 '못 파는 자산'으로 별도 표기(회색). */}
              {useEx && (
                <div className="as-row ex">
                  <span className="as-dotc ex" />
                  <span className="as-rl">🔑 실거주{myComplex ? ` ${myComplex}` : ""}</span>
                  <span className="as-rv">{uk(residenceUk)}</span>
                  <span className="as-rp">제외</span>
                </div>
              )}
            </div>
          </div>
          <button className="as-add" onClick={() => setQaOpen(true)}>＋ 자산 추가·수정</button>
        </section>

        {/* ── 총자산+추세(공통) — [사용자 지시] 자산군 쏠림/국면 코멘트 문구 삭제(주식 탭은 주식
            이야기만) + 운용자산(실거주 제외 토글) 섹션도 삭제 ── */}
        <section className="card as-hero">
          {/* [S22-7] 위계 전환 — 실제 판단 대상인 '운용자산'을 헤드라인으로. 총자산·실거주는 그 아래.
              (실거주가 없으면 운용=총자산이라 종전과 동일하게 총자산만 크게 보인다.) */}
          <div className="as-total">
            <span>{hasResidence ? <>운용자산 <span style={{ fontWeight: 600, fontSize: "0.62rem", color: "var(--color-ink-3)" }}>실거주 제외</span></> : "총자산"}</span>
            <b>{uk(hasResidence ? opTotal : total)}</b>
            {at && <span className="as-fresh"><LastUpdated timestamp={at} onRefresh={load} /></span>}
          </div>
          {hasResidence && (
            <div className="as-subtotals" style={{ display: "flex", gap: 12, flexWrap: "wrap", margin: "2px 0 4px", fontSize: "0.74rem", color: "var(--color-ink-3)" }}>
              <span>총자산 <b style={{ color: "var(--color-ink-2)", fontVariantNumeric: "tabular-nums" }}>{uk(total)}</b></span>
              <span>🔑 실거주 {uk(residenceUk)} · <span style={{ color: "var(--color-ink-3)" }}>못 파는 자산</span></span>
            </div>
          )}
          {/* [S22-7] 오늘의 한 수 — 가장 급한 신호 하나만(지금은 목표 배분 이탈 기준, S22-4). 없으면 침묵. */}
          {classDriftMsg && classDriftMsg.tone === "warn" && classDriftMsg.top && (
            <p className="as-onemove" style={{ margin: "6px 0 2px", fontSize: "0.8rem", fontWeight: 700, color: "var(--color-ink)" }}>
              🎯 오늘의 한 수 — {classDriftMsg.text}. <Link href="/pwa/etf" style={{ color: "var(--color-primary)" }}>리밸런싱 보기 →</Link>
            </p>
          )}
          {/* [S24-1] 전일 대비(운용 우선·구스냅샷은 총자산 폴백+라벨) + 단위 일관 30일 곡선. */}
          {(() => {
            const dv = hasResidence ? (delta?.operating ?? delta?.total ?? null) : (delta?.total ?? null);
            const basis = (hasResidence && delta?.operating == null && dv != null) ? " · 총자산 기준" : "";
            const series = getAssetSeries(getTrader(), hasResidence).slice(-30);
            if (dv != null) return (
              <div className="as-trend">
                <span className={`as-dchip ${dCls(dv)}`}>{dv >= 0 ? "▲" : "▼"} {dvUk(dv)}</span>
                <span className="as-dlabel">{delta.days > 1 ? `${delta.days}일 전 대비` : "어제 대비"}{basis}</span>
                {series.length >= 2 && <Sparkline data={series} className="as-spark" />}
              </div>
            );
            const n = hist.length;
            return <p className="as-dnew">📈 {n >= 1 ? `기록 중 · ${n}일째 — 내일부터 전일 대비 변화가 표시됩니다.` : "오늘부터 총자산 추이를 기록합니다."}</p>;
          })()}
          {/* [N1] 총자산이 불완전하면 숫자와 같은 카드에서 말한다. 다른 화면으로 미루지 않는다. */}
          {(assets?.warnings || []).some((w) => w.code === "BACKEND_UNAVAILABLE") && (
            <p className="as-incomplete">⚠ 증권사 연동 자산을 불러오지 못했습니다 — 이 총자산은 <b>실제보다 적습니다</b>. 잠시 후 다시 시도해 주세요.</p>
          )}
          {/* [S19-1] 기기 동기화가 아직 안 끝난 채로 확정된 총자산이면 숫자 옆에서 바로 말한다.
              (이 경고가 뜨는 상태에서는 다른 기기 입력분이 빠져 있을 수 있다.) */}
          {(assets?.warnings || []).some((w) => w.code === "SYNC_PENDING") && (
            <p className="as-incomplete">⏳ 다른 기기에서 입력한 자산을 아직 불러오는 중입니다 — 이 총자산은 <b>실제보다 적을 수 있습니다</b>. <button className="as-sync-retry" onClick={load}>다시 불러오기</button></p>
          )}
          {/* [버그 수정 후 투명성] 증권사 연동과 동일 계좌로 판단해 직접입력분을 총자산에서
              제외한 종목이 있으면 그 사실을 여기서 바로 알린다 — "왜 총액이 예상보다 적지?"를
              사용자가 스스로 추적하지 않아도 되게. 실제로 다른 증권사 보유라면 입력 시 해당
              증권사를 선택하면 합산된다(한국투자/기타만 중복으로 간주). */}
          {(assets?.warnings || []).filter((w) => w.code === "DUPLICATE_WITH_KIS").map((w, i) => (
            <p className="as-incomplete" key={i}>ℹ️ <b>{w.name}</b>은 증권사 연동 계좌와 같은 종목코드라 직접입력분은 총자산에 더하지 않았습니다. 실제로 다른 증권사 계좌라면 보유 목록에서 해당 증권사를 선택해 주세요.</p>
          ))}
        </section>

        {/* [S25-4] 자산군 요약 카드 — 좌우 스와이프로 주식↔ETF↔부동산 전환. 스와이프는 이 카드 안에서만,
            페이지 이동은 '상세 보기' 버튼 클릭으로만(하단 탭 원칙: 페이지끼리는 클릭). */}
        <section className="card as-sumcard" onTouchStart={sumSwipe.onTouchStart} onTouchMove={sumSwipe.onTouchMove} onTouchEnd={sumSwipe.onTouchEnd}>
          {(() => {
            const c = summaryCards[sumIdx];
            const ser = (c.series || []).filter((v) => v != null).slice(-30);
            return (
              <>
                <div className="as-sum-h"><span>{c.label}</span>
                  <span className="as-sum-dots">{summaryCards.map((_, i) => <i key={i} className={i === sumIdx ? "on" : ""} onClick={() => setSumIdx(i)} />)}</span>
                </div>
                <div className="as-sum-val">{c.val != null ? uk(c.val) : "미입력"}</div>
                <div className="as-sum-row">
                  {c.delta != null && Math.abs(c.delta) > 0.004 && <span className={`as-dchip ${dCls(c.delta)}`}>{c.delta >= 0 ? "▲" : "▼"} {dvUk(c.delta)}</span>}
                  {c.drift && <span className="as-sum-drift">목표 대비 {c.drift.drift >= 0 ? "+" : ""}{c.drift.drift}%p</span>}
                  {ser.length >= 2 && <Sparkline data={ser} className="as-spark" />}
                </div>
                <button className="as-sum-more" onClick={() => router.push(c.href)}>상세 보기 →</button>
              </>
            );
          })()}
        </section>

        {/* [S22-10] 자산군 교차 인사이트 — 세 자산을 묶어야 할 수 있는 한 줄. 가장 강한 것 하나만. */}
        {crossInsight && (
          <section className="card" style={{ borderLeft: "3px solid var(--color-primary)" }}>
            <div style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--color-ink)", lineHeight: 1.55, wordBreak: "keep-all" }}>💡 {crossInsight.text}</div>
            <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 10 }}>
              {crossInsight.cta && <Link href={crossInsight.cta.href} style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--color-primary)" }}>{crossInsight.cta.label}</Link>}
              <span style={{ marginLeft: "auto", fontSize: "0.66rem", color: "var(--color-ink-3)" }}>{crossInsight.disclaimer}</span>
            </div>
          </section>
        )}

        {/* [S22-4] 자산군 목표 배분 — 미설정이면 설정 유도(추측 기본값 없음), 설정 시 이탈(%p) 표시.
            분모는 운용자산(실거주 제외). '비중'이 아니라 '차이'를 말한다. */}
        <section className="card">
          <div style={{ fontSize: "0.86rem", fontWeight: 800, marginBottom: 10 }}>🎯 목표 배분 <span style={{ fontWeight: 600, color: "var(--color-ink-3)", fontSize: "0.72rem" }}>운용자산 기준 · 실거주 제외</span></div>
          {targetClass ? (
            <>
              {classDriftMsg && <p style={{ margin: "0 0 10px", fontSize: "0.82rem", fontWeight: 700, color: classDriftMsg.tone === "warn" ? "var(--color-warn, #d97706)" : "var(--color-ink-2)" }}>{classDriftMsg.tone === "warn" ? "⚠ " : "✓ "}{classDriftMsg.text}</p>}
              {classDrift ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {classDrift.map((d) => (
                    <div key={d.key} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.78rem" }}>
                      <span style={{ width: 52, color: "var(--color-ink-2)" }}>{d.label}</span>
                      <span style={{ fontVariantNumeric: "tabular-nums", width: 44 }}>{d.curPct}%</span>
                      <span style={{ color: "var(--color-ink-3)" }}>목표 {d.tgtPct}%</span>
                      <span style={{ marginLeft: "auto", fontWeight: 700, color: Math.abs(d.drift) < 3 ? "var(--color-ink-3)" : d.drift > 0 ? "var(--color-danger)" : "var(--color-primary)" }}>{d.drift > 0 ? "+" : ""}{d.drift}%p</span>
                    </div>
                  ))}
                </div>
              ) : <p style={{ margin: 0, fontSize: "0.78rem", color: "var(--color-ink-3)" }}>운용자산이 아직 없어 이탈을 계산할 수 없습니다.</p>}
              <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                {Object.keys(CLASS_PRESETS).map((p) => (
                  <button key={p} onClick={() => { setTargetClass(CLASS_PRESETS[p], p); load(); }} style={{ border: "1px solid var(--color-line)", background: targetClass._preset === p ? "var(--color-primary-soft)" : "var(--color-card)", color: targetClass._preset === p ? "var(--color-primary)" : "var(--color-ink-2)", borderRadius: 8, padding: "6px 12px", fontSize: "0.76rem", fontWeight: 700, cursor: "pointer" }}>{p}</button>
                ))}
              </div>
            </>
          ) : (
            <>
              <p style={{ margin: "0 0 10px", fontSize: "0.82rem", color: "var(--color-ink-2)", lineHeight: 1.5 }}>목표 배분을 정하면 <b>어느 자산군이 목표에서 얼마나 벗어났는지</b> 알려드립니다.</p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {Object.keys(CLASS_PRESETS).map((p) => (
                  <button key={p} onClick={() => { setTargetClass(CLASS_PRESETS[p], p); load(); }} style={{ border: "1px solid var(--color-primary)", background: "var(--color-card)", color: "var(--color-primary)", borderRadius: 8, padding: "8px 14px", fontSize: "0.78rem", fontWeight: 700, cursor: "pointer" }}>{p}</button>
                ))}
              </div>
            </>
          )}
        </section>

        {/* [N6] 이상 평단 확인 — 총자산에서 뺀 사실은 총자산이 보이는 곳에서 설명한다.
            앱은 값을 고치지 않는다. 원본이 평단인지 총매입액인지는 입력한 사람만 알기 때문이다.
            [OS-2] 평단 이슈는 주로 직접입력 주식이라 "주식" 뷰에서만. */}
        {view === 0 && <AvgPriceWarningCard warnings={assets?.warnings} onReload={load} />}

        {/* ── 뷰별 전용 카드 ── */}
        {/* [사용자 지시] "주식" 뷰 — 상단 탭(보유/추천) 선택에 따라 실제 목록을 보여준다.
            핵심 정보만 간결하게(종목명·수익률/점수) — 승인·거절 등 실제 조작은 자식 페이지로 위임. */}
        {/* [사용자 지시 2026-08-30] 보유 탭은 페이지를 옮기지 않고 여기서 끝난다.
            ① KIS 보유 종목 — 이름을 'KIS 보유 종목'으로 명확히 하고, 기존 '보유 자세히·매도 →'가
               열던 상세(매수가·현재가·목표가·손절가·AI 스탠스·다음 트리거·매도)를 카드 안에서 편다.
            ② 그 아래 '직접 입력 보유 · KIS 외 증권사' 카드 — 추가·확인·삭제를 이 자리에서.
            두 카드는 index.js(portfolio 탭)와 같은 공용 컴포넌트라 두 화면이 갈라지지 않는다. */}
        {view === 0 && stockTab === "hold" && (<>
          {/* [사용자 지시] KIS 투자 현황 요약 — 현금+보유주식 총액·평가손익·전일 대비 변화(lively) */}
          {(() => {
            const bal = dash?.balance || {};
            const cash = Number(bal.cash) || 0;
            let kisTotal = Number(bal.total_asset) || 0;
            const stockEval = positions.reduce((s, p) => s + ((Number(p.current_price) || 0) * (Number(p.qty) || 0)), 0);
            let stockVal = kisTotal > 0 ? Math.max(0, kisTotal - cash) : stockEval;
            if (!(kisTotal > 0)) kisTotal = stockVal + cash;
            if (!(kisTotal > 0) && positions.length === 0) return null;
            const upnl = bal.unrealized_pnl != null ? Number(bal.unrealized_pnl) : (positions.length ? positions.reduce((s, p) => s + (Number(p.pnl_amount) || 0), 0) : null);
            const cost = upnl != null ? stockVal - upnl : null;
            const upnlPct = (upnl != null && cost > 0) ? (upnl / cost) * 100 : null;
            const dStock = delta ? delta.stock : null; // 억 단위 전일 대비 주식 변화
            const sPct = kisTotal > 0 ? (stockVal / kisTotal) * 100 : 0;
            const winners = positions.filter((p) => (Number(p.pnl_rate) || 0) > 0).length;
            const losers = positions.filter((p) => (Number(p.pnl_rate) || 0) < 0).length;
            return (
              <section className="card kis-sum">
                <div className="ks-h">💳 KIS 투자 현황 <span className="ks-sub">주식 + 현금</span>
                  {at && <span className="ks-fresh"><LastUpdated timestamp={at} onRefresh={load} /></span>}
                </div>
                <div className="ks-total">{Math.round(kisTotal).toLocaleString()}<em>원</em></div>
                <div className="ks-chips">
                  {dStock != null && Math.abs(dStock) >= 0.005 && (
                    <span className={`ks-dchip ${dCls(dStock)}`}>{dStock >= 0 ? "▲" : "▼"} {dvUk(dStock)} <i>전일 대비 주식</i></span>
                  )}
                  {upnl != null && (
                    <span className={`ks-dchip ${upnl >= 0 ? "up" : "down"}`}>평가손익 {upnl >= 0 ? "+" : ""}{Math.round(upnl).toLocaleString()}원{upnlPct != null ? ` (${upnlPct >= 0 ? "+" : ""}${upnlPct.toFixed(1)}%)` : ""}</span>
                  )}
                </div>
                {/* 주식/현금 split 바 */}
                <div className="ks-split" role="img" aria-label={`주식 ${sPct.toFixed(0)}% 현금 ${(100 - sPct).toFixed(0)}%`}>
                  <i className="stk" style={{ width: `${sPct}%` }} />
                  <i className="csh" style={{ width: `${100 - sPct}%` }} />
                </div>
                <div className="ks-cells">
                  <div className="ks-cell">
                    <span className="ks-ck">📈 보유 주식</span>
                    <b>{Math.round(stockVal).toLocaleString()}원</b>
                    <span className="ks-cs">{positions.length}종목{winners + losers > 0 ? ` · 수익 ${winners}·손실 ${losers}` : ""}</span>
                  </div>
                  <div className="ks-cell">
                    <span className="ks-ck">💵 현금(예수금)</span>
                    <b>{Math.round(cash).toLocaleString()}원</b>
                    <span className="ks-cs">{sPct < 100 ? `비중 ${(100 - sPct).toFixed(0)}%` : "—"}</span>
                  </div>
                </div>
                <div className="ks-note">증권사(KIS) 연동은 <b>계좌 하나</b>를 불러옵니다. <b>다른 증권사·개인연금·퇴직연금·ISA 계좌는 아래 '직접 입력 보유'</b>로 넣으면 종목·계좌 라벨과 함께 총자산·판단에 똑같이 반영됩니다.</div>
              </section>
            );
          })()}
          <KisHoldingsCard positions={positions} trader={trader} onSold={load} />
          <ManualHoldingsCard trader={trader} onChanged={load} />
        </>)}
        {view === 0 && stockTab === "recommend" && (
          <section className="card as-stocklist">
            <div className="as-h">추천 종목</div>
            {/* 추천 목록은 판단 기록(샀어요·관망)·기술 분석까지 딸린 큰 화면이라 자산지도에서
                다시 그리지 않는다. 다만 예전 안내문은 지금 보고 있는 탭을 그대로 다시 가리켰다
                (자기참조). 무엇이 있는지 말해 주고 곧장 그 화면으로 보낸다. */}
            <div className="as-vc-empty">AI 추천 종목·기술 분석·매수 판단(샀어요·관망) 기록은 추천 화면에서 이어집니다.</div>
            <button className="as-vc-cta" onClick={() => router.push("/pwa?tab=recommend")}>추천 종목 보기 · 판단 남기기 →</button>
          </section>
        )}
        {/* [사용자 지시] ETF·부동산은 이제 탭 선택 즉시 해당 페이지로 이동하므로(RotatingPageTitle onChange
            참고) 여기엔 요약 카드를 두지 않는다 — view는 실질적으로 항상 0(주식)만 남는다.
            [사용자 지시] "시장 맥락·내 position"/"오늘의 브리핑" 아코디언 삭제 — 판단 근거는
            AI 페이지에서 다룬다. 이 탭은 주식 이야기만. */}

        <div className="as-note">상세 확인·수정은 각 자산 페이지에서 이어집니다.</div>
      </DataState>

      {/* [OS-2] "+"는 현재 선택된 뷰(주식/ETF/부동산)의 자산군으로 바로 열림 */}
      {qaOpen && <QuickAddSheet initialAsset={ASSET_VIEWS[view].key} onClose={() => setQaOpen(false)} onSaved={() => { setQaOpen(false); load(); }} />}
      <BottomNav active="assets" />

      <style jsx>{`
        /* [N5-3] 하단 여백 = 하단탭(56) + FAB 상단(68+52) 여유. 88px이면 FAB가 마지막 문구를 가렸다. */
        .as { max-width: 480px; margin: 0 auto; padding: 0 14px var(--nav-clearance-fab); font-family: var(--font-sans); color: var(--color-ink); min-height: 100vh; background: var(--color-bg); }
        /* [사용자 지시] 상위 메뉴 고정 */
        .sticky-hdr { position: sticky; top: 0; z-index: 140; background: var(--color-bg); margin: 0 -14px; padding: 0 14px; }
        .as-row.ex { opacity: 0.72; }
        .as-dotc.ex { background: repeating-linear-gradient(45deg, var(--color-ink-3) 0 2px, transparent 2px 4px); }
        .as-hd { display: flex; align-items: center; justify-content: space-between; padding: calc(env(safe-area-inset-top, 0px) + 12px) 2px 10px; }
        .as-logo { font-weight: 800; font-size: var(--fs-6); letter-spacing: -.5px; color: var(--color-ink); background: none; border: none; padding: 0; cursor: pointer; font-family: var(--font-sans); }
        .as-dot { color: var(--color-success); }
        .as-ic { display: flex; align-items: center; gap: 8px; }
        .as-search { width: 34px; height: 34px; border-radius: 50%; background: var(--color-card); border: none; display: grid; place-items: center; font-size: var(--fs-5); cursor: pointer; box-shadow: var(--shadow-card); }
        .as-title { display: flex; align-items: center; gap: 8px; font-size: var(--fs-6); font-weight: 800; letter-spacing: -.4px; margin: 6px 2px 14px; }
        .as-fixed { flex-shrink: 0; }
        .as-sub { font-size: var(--fs-2); font-weight: 600; color: var(--color-ink-3); }
        .as-fresh { margin-left: auto; font-size: var(--fs-1); }
        /* [사용자 지시] "주식" 뷰 전용 보유/추천 탭 — 상위 메뉴바(타이틀) 바로 아래 */
        /* [S26-5] as-stocktabs → 공용 SegTabs 로 이관(정본). 죽은 규칙 제거. */
        /* [사용자 지적] 탭 전용 한 줄 — 탭을 눌렀을 때 첫 화면에서 무엇이 달라졌는지 보여주는 유일한 줄 */
        .as-tabnote { margin: -6px 4px 12px; font-size: var(--fs-2); line-height: 1.5; color: var(--color-ink-2); word-break: keep-all; }
        .as-tabnote b { color: var(--color-ink); font-weight: 800; }
        .card { background: var(--color-card); border: 1px solid var(--color-line); border-radius: var(--radius-card, 14px); padding: 16px; margin-bottom: 12px; box-shadow: var(--shadow-card); }
        /* [S25-4] 자산군 요약 카드 캐러셀 */
        .as-sumcard { touch-action: pan-y; }
        .as-sum-h { display: flex; align-items: center; font-size: var(--fs-4); font-weight: 800; color: var(--color-ink); margin-bottom: 8px; }
        .as-sum-dots { margin-left: auto; display: flex; gap: 5px; }
        .as-sum-dots i { width: 7px; height: 7px; border-radius: 50%; background: var(--color-line); cursor: pointer; }
        .as-sum-dots i.on { background: var(--color-primary); }
        .as-sum-val { font-size: var(--fs-7); font-weight: 800; color: var(--color-ink); font-variant-numeric: tabular-nums; }
        .as-sum-row { display: flex; align-items: center; gap: 10px; margin-top: 6px; flex-wrap: wrap; }
        .as-sum-drift { font-size: var(--fs-2); color: var(--color-ink-2); }
        .as-sum-more { margin-top: 10px; border: 1px solid var(--color-line); background: var(--color-card); color: var(--color-primary); border-radius: var(--radius-sm); padding: 8px 14px; font-size: var(--fs-2); font-weight: 700; font-family: var(--font-sans); cursor: pointer; }
        .as-total { display: flex; align-items: baseline; gap: 8px; }
        .as-total span { font-size: var(--fs-2); font-weight: 600; color: var(--color-ink-3); }
        .as-total b { font-size: var(--fs-7); font-weight: 800; color: var(--color-ink); }
        .as-trend { display: flex; align-items: center; gap: 8px; margin-top: 6px; }
        .as-trend .as-dchip { font-size: var(--fs-3); font-weight: 800; font-variant-numeric: tabular-nums; }
        .as-trend .as-dchip.up { color: var(--color-success, #0E9E6A); }
        .as-trend .as-dchip.down { color: var(--color-danger, #E5484D); }
        .as-trend .as-dchip.flat { color: var(--color-ink-3); }
        .as-trend .as-dlabel { font-size: var(--fs-1); color: var(--color-ink-3); font-weight: 600; }
        .as-spark { width: 84px; height: 26px; flex: 0 0 auto; margin-left: auto; }
        .as-dnew { font-size: var(--fs-2); color: var(--color-ink-3); line-height: 1.5; margin: 6px 0 0; word-break: keep-all; }
        /* [KIS 투자 현황] */
        .kis-sum { border-left: 4px solid var(--color-primary); }
        .ks-h { display: flex; align-items: center; gap: 8px; font-size: var(--fs-4); font-weight: 800; color: var(--color-ink); }
        .ks-sub { font-size: var(--fs-1); font-weight: 700; color: var(--color-primary); background: var(--color-primary-soft); border-radius: 999px; padding: 1px 8px; }
        .ks-fresh { margin-left: auto; font-size: var(--fs-1); }
        .ks-total { font-size: var(--fs-8); font-weight: 800; color: var(--color-ink); letter-spacing: -.5px; margin-top: 8px; font-variant-numeric: tabular-nums; }
        .ks-total em { font-style: normal; font-size: var(--fs-4); font-weight: 700; color: var(--color-ink-3); margin-left: 2px; }
        .ks-chips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
        .ks-dchip { font-size: var(--fs-2); font-weight: 800; font-variant-numeric: tabular-nums; display: inline-flex; align-items: center; gap: 4px; background: var(--color-card-soft); border-radius: var(--radius-sm); padding: 4px 9px; }
        .ks-dchip i { font-style: normal; font-size: var(--fs-1); font-weight: 600; color: var(--color-ink-3); }
        .ks-dchip.up { color: var(--color-success, #0E9E6A); } .ks-dchip.down { color: var(--color-danger, #E5484D); } .ks-dchip.flat { color: var(--color-ink-3); }
        .ks-split { display: flex; height: 10px; border-radius: 999px; overflow: hidden; margin-top: 14px; background: var(--color-card-soft); }
        .ks-split i { display: block; height: 100%; }
        .ks-split i.stk { background: var(--color-primary); }
        .ks-split i.csh { background: var(--color-warning, #E8A33D); }
        .ks-cells { display: flex; gap: 10px; margin-top: 12px; }
        .ks-cell { flex: 1; background: var(--color-card-soft); border-radius: var(--radius-md); padding: 11px 12px; }
        .ks-ck { display: block; font-size: var(--fs-1); font-weight: 700; color: var(--color-ink-2); }
        .ks-cell b { display: block; font-size: var(--fs-5); font-weight: 800; color: var(--color-ink); margin-top: 4px; font-variant-numeric: tabular-nums; }
        .ks-cs { display: block; font-size: var(--fs-1); color: var(--color-ink-3); margin-top: 3px; }
        .ks-note { font-size: var(--fs-1); color: var(--color-ink-3); line-height: 1.5; margin-top: 12px; word-break: keep-all; }
        .as-rd { font-size: var(--fs-1); font-weight: 700; font-variant-numeric: tabular-nums; }
        .as-rd.up { color: var(--color-success, #0E9E6A); }
        .as-rd.down { color: var(--color-danger, #E5484D); }
        .as-rd.flat { color: var(--color-ink-3); }
        .as-arrow { color: var(--color-primary); font-weight: 800; flex-shrink: 0; }
        .as-arrow.sm { font-size: var(--fs-3); }
        .as-h { font-size: var(--fs-4); font-weight: 800; color: var(--color-ink); margin-bottom: 12px; }
        .as-map { display: flex; align-items: center; gap: 14px; }
        /* [N5] 좁은 화면에서 도넛과 범례가 나란히 서면 범례 폭이 ~183px로 눌려
           '🏠 부동산'이 52px 필요한데 40px만 받아 잘린다(실측 375px).
           ellipsis 는 잘림을 감출 뿐 없애지 못한다 → 도넛을 위로 올려 폭을 되돌려준다. */
        @media (max-width: 430px) {
          .as-map { flex-direction: column; align-items: stretch; gap: 10px; }
          .as-donut { align-self: center; }
          .as-legend { width: 100%; }
        }
        .as-donut { width: 92px; height: 92px; flex-shrink: 0; }
        .as-donut-t { font-size: var(--fs-1); fill: var(--color-ink-3); font-weight: 700; }
        .as-donut-v { font-size: var(--fs-1); fill: var(--color-ink); font-weight: 800; }
        .as-legend { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
        /* [N5-2] 범례 잘림 — 그리드 아이템 기본 min-width:auto 라 이름 칸이 안 줄어 잘렸다(M1과 동일 원인).
           min-width:0 을 줘야 ellipsis 가 실제로 동작한다. 숫자는 tabular-nums 로 자릿수 정렬. */
        .as-row { display: grid; grid-template-columns: 12px minmax(0, 1fr) auto auto; align-items: center; gap: 7px; padding: 7px 2px; border-bottom: 1px solid var(--color-line); }
        .as-row:last-child { border-bottom: none; }
        .as-row:last-child { border-bottom: none; }
        .as-dotc { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; }
        .as-rl { min-width: 0; font-size: var(--fs-2); font-weight: 700; color: var(--color-ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .as-rv { display: inline-flex; flex-direction: column; align-items: flex-end; line-height: 1.2; font-size: var(--fs-2); font-weight: 800; color: var(--color-ink); font-variant-numeric: tabular-nums; text-align: right; white-space: nowrap; }
        .as-rv em { font-style: normal; font-weight: 600; color: var(--color-ink-3); font-size: var(--fs-2); }
        .as-rp { font-size: var(--fs-1); color: var(--color-ink-3); font-variant-numeric: tabular-nums; text-align: right; white-space: nowrap; min-width: 38px; }
        .as-add { width: 100%; margin-top: 14px; min-height: 44px; border: 1px dashed var(--color-line); background: var(--color-card-soft, var(--color-bg)); color: var(--color-ink-2); border-radius: var(--radius-sm); font-size: var(--fs-3); font-weight: 700; cursor: pointer; font-family: var(--font-sans); }
        /* [N1] 총자산 불완전 고지 — 숫자 바로 아래. 눈에 띄되 공포를 팔지 않는다. */
        .as-incomplete { margin: 8px 0 0; font-size: var(--fs-2); line-height: 1.5; color: var(--color-warning); word-break: keep-all; }
        /* [S19-1] 동기화 대기 안내 안의 재시도 — 문장 흐름을 끊지 않는 인라인 버튼 */
        .as-sync-retry { border: none; background: none; padding: 0; margin-left: 4px; color: var(--color-primary); font-size: var(--fs-2); font-weight: 700; text-decoration: underline; text-underline-offset: 2px; cursor: pointer; font-family: var(--font-sans); }
        /* [N6] 이상 평단 확인 — 경고색(빨강) 아님. 사용자 잘못이라 단정하지 않는다. */
        .as-fix-q { font-size: var(--fs-3); line-height: 1.55; color: var(--color-ink-2); margin: 0 0 10px; word-break: keep-all; }
        .as-fix-cta, .as-fix-edit { display: flex; gap: 8px; align-items: center; }
        .as-fix-b { flex: 0 0 auto; border: 1px solid var(--color-line); background: var(--color-card); color: var(--color-ink-2); border-radius: var(--radius-sm); padding: 9px 14px; font-size: var(--fs-2); font-weight: 700; font-family: var(--font-sans); cursor: pointer; }
        .as-fix-b.p { border-color: var(--color-primary); color: var(--color-primary); }
        .as-fix-in { flex: 1 1 0; min-width: 0; border: 1px solid var(--color-line); border-radius: var(--radius-sm); padding: 9px 10px; font-size: var(--fs-3); font-family: var(--font-sans); background: var(--color-card); color: var(--color-ink); font-variant-numeric: tabular-nums; }
        .as-vc-cta { width: 100%; min-height: 42px; border: 1px solid var(--color-line); background: var(--color-card-soft, var(--color-bg)); color: var(--color-primary); border-radius: var(--radius-sm); font-size: var(--fs-3); font-weight: 700; cursor: pointer; font-family: var(--font-sans); }
        /* [사용자 지시] "주식" 뷰 — 계좌현황 + 보유/추천 분할 요약 */
        .as-vc-acct { margin-bottom: 12px; }
        .as-vc-acct-lbl { font-size: var(--fs-2); font-weight: 700; color: var(--color-ink-3); margin-bottom: 2px; }
        .as-vc-acct-total { font-size: var(--fs-6); font-weight: 900; font-family: ui-monospace, monospace; color: var(--color-ink); }
        .as-vc-acct-sub { font-size: var(--fs-2); color: var(--color-ink-2); margin-top: 2px; }
        .as-vc-acct-sub b { font-weight: 800; }
        .as-vc-acct-sub b.up { color: var(--color-success); } .as-vc-acct-sub b.dn { color: var(--color-danger); }
        .as-vc-empty { font-size: var(--fs-2); color: var(--color-ink-2); padding: 6px 2px; }
        /* [사용자 지시] 보유/추천 탭 전체 목록(핵심 정보만 간결하게) */
        .as-sl-list { display: flex; flex-direction: column; margin-bottom: 12px; }
        .as-sl-row { display: flex; align-items: baseline; gap: 8px; padding: 8px 2px; border-bottom: 1px solid var(--color-line); font-size: var(--fs-3); }
        .as-sl-row:last-child { border-bottom: none; }
        .as-sl-name { color: var(--color-ink); font-weight: 700; flex: none; max-width: 40%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .as-sl-mid { flex: 1; min-width: 0; color: var(--color-ink-3); font-size: var(--fs-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .as-sl-row .up { color: var(--color-success); font-weight: 700; flex: none; }
        .as-sl-row .dn { color: var(--color-danger); font-weight: 700; flex: none; }
        .as-note { font-size: var(--fs-1); color: var(--color-ink-3); text-align: center; margin-top: 6px; line-height: 1.5; word-break: keep-all; }
      `}</style>
      <style jsx global>{`body { background: var(--color-bg); margin: 0; }`}</style>
    </div>
  );
}
