// [A1/A2/A3/A4] 종합자산 = 읽기 전용 인덱스(지도). 상세·편집은 자식 페이지로 위임(편집 UI 없음).
//   3층 구조: 1층 판단1문장+총자산+액션3 / 2층 자산지도(도넛+링크) / 3층 상세 아코디언(기본 닫힘).
//   데이터: lib/assetsTotal(단일 소스) + /api/pwa-dashboard. 자체 합산 금지 — 원장 값만 사용.
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/router";
import { getTrader, useTrader } from "../../lib/trader";
import { getLedger } from "../../lib/ledger";
import { recordSnapshot, getDelta, getHistory } from "../../lib/assetHistory";
import { verifyStockAvg, updateStockAvg } from "../../lib/stockHoldings";
import TraderBadge from "../../components/shared/TraderBadge";
import BottomNav from "../../components/BottomNav";
import DataState from "../../components/DataState";
import LastUpdated from "../../components/LastUpdated";
import QuickAddSheet from "../../components/shared/QuickAddSheet";
import AssetMapTitle from "../../components/AssetMapTitle";
import FeedbackButton from "../../components/FeedbackButton";

const uk = (v) => (v == null ? "-" : `${Number(v).toFixed(2)}억`);
const pctTxt = (v) => `${Number(v) >= 0 ? "+" : ""}${Number(v).toFixed(2)}%`;
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

// 총자산 시계열 미니 스파크라인(SVG). 최근 데이터가 오른쪽. 값이 2개 미만이면 렌더 안 함.
function Sparkline({ data }) {
  const pts = (data || []).filter((v) => v != null);
  if (pts.length < 2) return null;
  const W = 120, H = 30, min = Math.min(...pts), max = Math.max(...pts);
  const span = max - min || 1;
  const coords = pts.map((v, i) => {
    const x = (i / (pts.length - 1)) * W;
    const y = H - ((v - min) / span) * (H - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const rising = pts[pts.length - 1] >= pts[0];
  const color = rising ? "var(--color-success, #0E9E6A)" : "var(--color-danger, #E5484D)";
  return (
    <svg className="as-spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      <polyline points={coords.join(" ")} fill="none" stroke={color} strokeWidth="1.6"
        strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

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
  const [fixId, setFixId] = useState(null);      // [N6] 평단 수정 중인 종목 id
  const [fixVal, setFixVal] = useState("");      // [N6] 사용자가 직접 입력하는 평단(앱이 추정하지 않는다)
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
      getLedger(tr).catch(() => ({ ok: false })),
      fetch(`/api/pwa-dashboard?trader=${tr}`).then((r) => r.json()).catch(() => ({ ok: false })),
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
  const realtyUk = bd.realestate_uk != null ? Number(bd.realestate_uk) : 0;
  const invRealtyUk = invProps.reduce((s, p) => s + (Number(p.valueUk) || 0), 0);
  const residenceUk = Math.max(0, realtyUk - invRealtyUk);   // 실거주(못 파는 자산)
  const hasResidence = residenceUk > 0.005;
  const opTotal = Math.max(0, total - residenceUk);           // 운용 가능 자산
  const useEx = exRes && hasResidence;                        // 실거주 제외 뷰 활성

  // 자산 지도/쏠림 진단만 뷰에 따라 분모가 바뀐다(총자산 헤드라인은 항상 total 유지 = 단일 소스).
  const mapDenom = useEx ? opTotal : total;
  const mapRows = (useEx
    ? rows.map((r) => (r.k === "realestate"
        ? { ...r, label: "🏠 부동산(투자)", val: invRealtyUk > 0.005 ? invRealtyUk : null }
        : r))
    : rows
  ).filter((r) => !(useEx && r.k === "realestate" && !(invRealtyUk > 0.005)));
  const pctOf = (v) => (mapDenom > 0 && v != null ? (v / mapDenom) * 100 : 0);

  // [사용자 지시] "주식" 뷰 — 주식 페이지(보유·추천)와 연결되는 계좌현황 요약 카드용 데이터.
  const positions = parsePositions(dash);
  const recAll = [...(dash?.recommend_stocks ?? [])].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

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
        <header className="as-hd">
          <button className="as-logo" onClick={() => router.push("/pwa/today")} aria-label="오늘">ONE<span className="as-dot">·</span>HUB</button>
          <div className="as-ic">
            <TraderBadge />
            <button className="as-search" onClick={() => router.push("/pwa?tab=analyze")} aria-label="AI 종목 검색">🔍</button>
            <FeedbackButton variant="icon" />
            <button className="as-search" onClick={() => router.push("/pwa/settings")} aria-label="설정">⚙️</button>
          </div>
        </header>

        {/* [사용자 지시] ETF·부동산 페이지로 이동해도 이 타이틀 바가 그대로 이어지도록 공용 컴포넌트로 통일 */}
        <AssetMapTitle current="주식" onChangeView={(i) => setView(i)} />

        {/* [사용자 지시] 주식 페이지의 보유/추천을 상위 메뉴바 바로 아래 탭으로 — "주식" 뷰에서만 노출 */}
        {view === 0 && (
          <div className="as-stocktabs">
            <button type="button" className={`as-st-btn ${stockTab === "hold" ? "on" : ""}`} onClick={() => setStockTab("hold")}>보유</button>
            <button type="button" className={`as-st-btn ${stockTab === "recommend" ? "on" : ""}`} onClick={() => setStockTab("recommend")}>추천</button>
          </div>
        )}
      </div>

      <DataState status={status} hasData={!!assets} onRetry={load} skeletonLines={5} skeletonBlock>
        {/* ── [사용자 지시] 자산 지도 카드를 맨 위로 — "주식" 뷰에서는 계좌현황 요약을 카드 맨 위에 병합 ── */}
        <section className="card">
          <div className="as-h">자산 지도</div>
          {/* [버그 수정] dash.balance.total_asset은 증권사(KIS) 연동 잔고만 — 직접입력 등 KIS外
              보유가 빠져 있었다. 단일 원장(bd.stock_uk, 이미 KIS+직접입력 통합)으로 교체 — 아래
              범례의 "📈 주식" 행과 항상 같은 수를 보게 된다. */}
          {view === 0 && (
            <div className="as-vc-acct">
              <div className="as-vc-acct-total">{bd.stock_uk != null ? `${Math.round(Number(bd.stock_uk) * 1e8).toLocaleString()}원` : "-"}</div>
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
                    {r.val != null ? uk(r.val) : <em>미입력</em>}
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
          <div className="as-total">
            <span>총자산</span>
            <b>{uk(total)}</b>
            {at && <span className="as-fresh"><LastUpdated timestamp={at} onRefresh={load} /></span>}
          </div>
          {/* [추세] 전일 대비 변화 + 스파크라인을 별도 줄에. 데이터가 하루뿐이면 '기록 시작' 안내. */}
          {delta && delta.total != null ? (
            <div className="as-trend">
              <span className={`as-dchip ${dCls(delta.total)}`}>{delta.total >= 0 ? "▲" : "▼"} {dvUk(delta.total)}</span>
              <span className="as-dlabel">{delta.prevDate} 대비</span>
            </div>
          ) : (
            <p className="as-dnew">📈 오늘부터 총자산 추이를 기록합니다 — 내일부터 전일 대비 변화가 표시됩니다.</p>
          )}
          {/* [N1] 총자산이 불완전하면 숫자와 같은 카드에서 말한다. 다른 화면으로 미루지 않는다. */}
          {(assets?.warnings || []).some((w) => w.code === "BACKEND_UNAVAILABLE") && (
            <p className="as-incomplete">⚠ 증권사 연동 자산을 불러오지 못했습니다 — 이 총자산은 <b>실제보다 적습니다</b>. 잠시 후 다시 시도해 주세요.</p>
          )}
          {/* [버그 수정 후 투명성] 증권사 연동과 동일 계좌로 판단해 직접입력분을 총자산에서
              제외한 종목이 있으면 그 사실을 여기서 바로 알린다 — "왜 총액이 예상보다 적지?"를
              사용자가 스스로 추적하지 않아도 되게. 실제로 다른 증권사 보유라면 입력 시 해당
              증권사를 선택하면 합산된다(한국투자/기타만 중복으로 간주). */}
          {(assets?.warnings || []).filter((w) => w.code === "DUPLICATE_WITH_KIS").map((w, i) => (
            <p className="as-incomplete" key={i}>ℹ️ <b>{w.name}</b>은 증권사 연동 계좌와 같은 종목코드라 직접입력분은 총자산에 더하지 않았습니다. 실제로 다른 증권사 계좌라면 보유 목록에서 해당 증권사를 선택해 주세요.</p>
          ))}
        </section>

        {/* [N6] 이상 평단 확인 — 총자산에서 뺀 사실은 총자산이 보이는 곳에서 설명한다.
            앱은 값을 고치지 않는다. 원본이 평단인지 총매입액인지는 입력한 사람만 알기 때문이다.
            [OS-2] 평단 이슈는 주로 직접입력 주식이라 "주식" 뷰에서만. */}
        {view === 0 && (assets?.warnings || []).filter((w) => w.code === "AVG_PRICE_OUT_OF_RANGE").map((w) => (
          <section className="card as-fix" key={w.id || w.name}>
            <div className="as-h">확인이 필요합니다</div>
            <p className="as-fix-q">
              <b>{w.name}</b>의 평단이 <b>{Number(w.avgPrice).toLocaleString()}원</b>으로 입력돼 있습니다.
              흔한 원인은 <b>총매입액을 평단 칸에 넣은 경우</b>지만, 실제로 맞는 값일 수도 있습니다.
              {w.dup_with_kis
                ? <> 이 종목은 증권사 연동에도 있어 <b>총자산 합산에는 쓰지 않지만</b>, 목록·수익률에는 이 값이 그대로 보입니다.</>
                : <> 그래서 <b>총자산에서 잠시 뺐습니다</b>.</>}
              {" "}어느 쪽인지는 입력하신 분만 아셔서 저희가 임의로 고치지 않았습니다.
            </p>
            {fixId === w.id ? (
              <div className="as-fix-edit">
                <input className="as-fix-in" type="number" inputMode="numeric" value={fixVal} placeholder="1주당 평단(원)"
                  onChange={(e) => setFixVal(e.target.value)} aria-label="평단 입력" />
                <button className="as-fix-b p" onClick={() => {
                  const r = updateStockAvg({ id: w.id, avgPrice: fixVal, trader: getTrader() });
                  if (r.ok) { setFixId(null); setFixVal(""); load(); }
                }}>저장</button>
                <button className="as-fix-b" onClick={() => { setFixId(null); setFixVal(""); }}>취소</button>
              </div>
            ) : (
              <div className="as-fix-cta">
                <button className="as-fix-b p" onClick={() => { setFixId(w.id); setFixVal(""); }}>평단 수정</button>
                <button className="as-fix-b" onClick={() => { verifyStockAvg({ id: w.id, trader: getTrader() }); load(); }}>이 값이 맞습니다</button>
              </div>
            )}
          </section>
        ))}

        {/* ── 뷰별 전용 카드 ── */}
        {/* [사용자 지시] "주식" 뷰 — 상단 탭(보유/추천) 선택에 따라 실제 목록을 보여준다.
            핵심 정보만 간결하게(종목명·수익률/점수) — 승인·거절 등 실제 조작은 자식 페이지로 위임. */}
        {view === 0 && (
          <section className="card as-stocklist">
            <div className="as-h">{stockTab === "hold" ? "보유 종목" : "추천 종목"}</div>
            {stockTab === "hold" ? (
              positions.length === 0 ? (
                <div className="as-vc-empty">보유 종목이 없어요</div>
              ) : (
                <div className="as-sl-list">
                  {positions.map((p) => (
                    <div className="as-sl-row" key={p.code}>
                      <span className="as-sl-name">{p.name}</span>
                      <span className="as-sl-mid">{Number(p.current_price || 0).toLocaleString()}원 · {p.qty}주</span>
                      <span className={p.pnl_rate >= 0 ? "up" : "dn"}>{pctTxt(p.pnl_rate)}</span>
                    </div>
                  ))}
                </div>
              )
            ) : (
              recAll.length === 0 ? (
                <div className="as-vc-empty">추천 종목이 없어요</div>
              ) : (
                <div className="as-sl-list">
                  {recAll.map((s) => (
                    <div className="as-sl-row" key={s.code}>
                      <span className="as-sl-name">{s.name}</span>
                      {s.reason && <span className="as-sl-mid">{s.reason}</span>}
                      <span className="as-vc-score">{Math.round(s.score ?? 0)}</span>
                    </div>
                  ))}
                </div>
              )
            )}
            <button className="as-vc-cta" onClick={() => router.push(stockTab === "hold" ? "/pwa?tab=portfolio" : "/pwa?tab=recommend")}>{stockTab === "hold" ? "보유 자세히 · 매도 →" : "추천 자세히 · 승인 →"}</button>
          </section>
        )}
        {/* [사용자 지시] ETF·부동산은 이제 탭 선택 즉시 해당 페이지로 이동하므로(RotatingPageTitle onChange
            참고) 여기엔 요약 카드를 두지 않는다 — view는 실질적으로 항상 0(주식)만 남는다.
            [사용자 지시] "시장 맥락·내 position"/"오늘의 브리핑" 아코디언 삭제 — 판단 근거는
            AI 페이지에서 다룬다. 이 탭은 주식 이야기만. */}

        <div className="as-note">종합자산은 읽기 전용 지도예요. 상세 확인·수정은 각 자산 페이지에서 이어집니다.</div>
      </DataState>

      {/* [OS-2] "+"는 현재 선택된 뷰(주식/ETF/부동산)의 자산군으로 바로 열림 */}
      {qaOpen && <QuickAddSheet initialAsset={ASSET_VIEWS[view].key} onClose={() => setQaOpen(false)} onSaved={() => { setQaOpen(false); load(); }} />}
      <BottomNav active="assets" />

      <style jsx>{`
        /* [N5-3] 하단 여백 = 하단탭(56) + FAB 상단(68+52) 여유. 88px이면 FAB가 마지막 문구를 가렸다. */
        .as { max-width: 480px; margin: 0 auto; padding: 0 14px calc(env(safe-area-inset-bottom, 0px) + 140px); font-family: var(--font-sans); color: var(--color-ink); min-height: 100vh; background: var(--color-bg); }
        /* [사용자 지시] 상위 메뉴 고정 */
        .sticky-hdr { position: sticky; top: 0; z-index: 140; background: var(--color-bg); margin: 0 -14px; padding: 0 14px; }
        .as-row.ex { opacity: 0.72; }
        .as-dotc.ex { background: repeating-linear-gradient(45deg, var(--color-ink-3) 0 2px, transparent 2px 4px); }
        .as-hd { display: flex; align-items: center; justify-content: space-between; padding: calc(env(safe-area-inset-top, 0px) + 12px) 2px 10px; }
        .as-logo { font-weight: 800; font-size: 20px; letter-spacing: -.5px; color: var(--color-ink); background: none; border: none; padding: 0; cursor: pointer; font-family: var(--font-sans); }
        .as-dot { color: var(--color-success); }
        .as-ic { display: flex; align-items: center; gap: 8px; }
        .as-search { width: 34px; height: 34px; border-radius: 50%; background: var(--color-card); border: none; display: grid; place-items: center; font-size: 15px; cursor: pointer; box-shadow: var(--shadow-card); }
        .as-title { display: flex; align-items: center; gap: 8px; font-size: 20px; font-weight: 800; letter-spacing: -.4px; margin: 6px 2px 14px; }
        .as-fixed { flex-shrink: 0; }
        .as-sub { font-size: 12px; font-weight: 600; color: var(--color-ink-3); }
        .as-fresh { margin-left: auto; font-size: 0.68rem; }
        /* [사용자 지시] "주식" 뷰 전용 보유/추천 탭 — 상위 메뉴바(타이틀) 바로 아래 */
        .as-stocktabs { display: flex; gap: 6px; margin: 0 2px 12px; background: var(--color-card); border: 1px solid var(--color-line); border-radius: 12px; padding: 4px; box-shadow: var(--shadow-card); }
        .as-st-btn { flex: 1; min-height: 36px; border: none; background: none; border-radius: 9px; color: var(--color-ink-2); font-size: 0.8rem; font-weight: 700; cursor: pointer; font-family: var(--font-sans); }
        .as-st-btn.on { background: var(--color-primary); color: #fff; }
        .card { background: var(--color-card); border: 1px solid var(--color-line); border-radius: var(--radius-card, 14px); padding: 16px; margin-bottom: 12px; box-shadow: var(--shadow-card); }
        .as-total { display: flex; align-items: baseline; gap: 8px; }
        .as-total span { font-size: 0.78rem; font-weight: 600; color: var(--color-ink-3); }
        .as-total b { font-size: 1.5rem; font-weight: 800; color: var(--color-ink); }
        .as-trend { display: flex; align-items: center; gap: 8px; margin-top: 6px; }
        .as-trend .as-dchip { font-size: 0.84rem; font-weight: 800; font-variant-numeric: tabular-nums; }
        .as-trend .as-dchip.up { color: var(--color-success, #0E9E6A); }
        .as-trend .as-dchip.down { color: var(--color-danger, #E5484D); }
        .as-trend .as-dchip.flat { color: var(--color-ink-3); }
        .as-trend .as-dlabel { font-size: 0.7rem; color: var(--color-ink-3); font-weight: 600; }
        .as-spark { width: 84px; height: 26px; flex: 0 0 auto; margin-left: auto; }
        .as-dnew { font-size: 0.72rem; color: var(--color-ink-3); line-height: 1.5; margin: 6px 0 0; word-break: keep-all; }
        .as-rd { font-size: 0.66rem; font-weight: 700; font-variant-numeric: tabular-nums; }
        .as-rd.up { color: var(--color-success, #0E9E6A); }
        .as-rd.down { color: var(--color-danger, #E5484D); }
        .as-rd.flat { color: var(--color-ink-3); }
        .as-arrow { color: var(--color-primary); font-weight: 800; flex-shrink: 0; }
        .as-arrow.sm { font-size: 0.8rem; }
        .as-h { font-size: 0.86rem; font-weight: 800; color: var(--color-ink); margin-bottom: 12px; }
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
        .as-donut-t { font-size: 8px; fill: var(--color-ink-3); font-weight: 700; }
        .as-donut-v { font-size: 11px; fill: var(--color-ink); font-weight: 800; }
        .as-legend { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
        /* [N5-2] 범례 잘림 — 그리드 아이템 기본 min-width:auto 라 이름 칸이 안 줄어 잘렸다(M1과 동일 원인).
           min-width:0 을 줘야 ellipsis 가 실제로 동작한다. 숫자는 tabular-nums 로 자릿수 정렬. */
        .as-row { display: grid; grid-template-columns: 12px minmax(0, 1fr) auto auto; align-items: center; gap: 7px; padding: 7px 2px; border-bottom: 1px solid var(--color-line); }
        .as-row:last-child { border-bottom: none; }
        .as-row:last-child { border-bottom: none; }
        .as-dotc { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; }
        .as-rl { min-width: 0; font-size: 0.78rem; font-weight: 700; color: var(--color-ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .as-rv { display: inline-flex; flex-direction: column; align-items: flex-end; line-height: 1.2; font-size: 0.78rem; font-weight: 800; color: var(--color-ink); font-variant-numeric: tabular-nums; text-align: right; white-space: nowrap; }
        .as-rv em { font-style: normal; font-weight: 600; color: var(--color-ink-3); font-size: 0.72rem; }
        .as-rp { font-size: 0.68rem; color: var(--color-ink-3); font-variant-numeric: tabular-nums; text-align: right; white-space: nowrap; min-width: 38px; }
        .as-add { width: 100%; margin-top: 14px; min-height: 44px; border: 1px dashed var(--color-line); background: var(--color-card-soft, var(--color-bg)); color: var(--color-ink-2); border-radius: 11px; font-size: 0.84rem; font-weight: 700; cursor: pointer; font-family: var(--font-sans); }
        /* [N1] 총자산 불완전 고지 — 숫자 바로 아래. 눈에 띄되 공포를 팔지 않는다. */
        .as-incomplete { margin: 8px 0 0; font-size: 0.74rem; line-height: 1.5; color: var(--color-warning); word-break: keep-all; }
        /* [N6] 이상 평단 확인 — 경고색(빨강) 아님. 사용자 잘못이라 단정하지 않는다. */
        .as-fix-q { font-size: 0.8rem; line-height: 1.55; color: var(--color-ink-2); margin: 0 0 10px; word-break: keep-all; }
        .as-fix-cta, .as-fix-edit { display: flex; gap: 8px; align-items: center; }
        .as-fix-b { flex: 0 0 auto; border: 1px solid var(--color-line); background: var(--color-card); color: var(--color-ink-2); border-radius: 9px; padding: 9px 14px; font-size: 0.78rem; font-weight: 700; font-family: var(--font-sans); cursor: pointer; }
        .as-fix-b.p { border-color: var(--color-primary); color: var(--color-primary); }
        .as-fix-in { flex: 1 1 0; min-width: 0; border: 1px solid var(--color-line); border-radius: 9px; padding: 9px 10px; font-size: 0.82rem; font-family: var(--font-sans); background: var(--color-card); color: var(--color-ink); font-variant-numeric: tabular-nums; }
        .as-vc-cta { width: 100%; min-height: 42px; border: 1px solid var(--color-line); background: var(--color-card-soft, var(--color-bg)); color: var(--color-primary); border-radius: 10px; font-size: 0.8rem; font-weight: 700; cursor: pointer; font-family: var(--font-sans); }
        /* [사용자 지시] "주식" 뷰 — 계좌현황 + 보유/추천 분할 요약 */
        .as-vc-acct { margin-bottom: 12px; }
        .as-vc-acct-total { font-size: 1.2rem; font-weight: 900; font-family: ui-monospace, monospace; color: var(--color-ink); }
        .as-vc-acct-sub { font-size: 0.78rem; color: var(--color-ink-2); margin-top: 2px; }
        .as-vc-acct-sub b { font-weight: 800; }
        .as-vc-acct-sub b.up { color: var(--color-success); } .as-vc-acct-sub b.dn { color: var(--color-danger); }
        .as-vc-empty { font-size: 0.78rem; color: var(--color-ink-2); padding: 6px 2px; }
        .as-vc-score { color: var(--color-primary); font-weight: 800; flex: none; }
        /* [사용자 지시] 보유/추천 탭 전체 목록(핵심 정보만 간결하게) */
        .as-sl-list { display: flex; flex-direction: column; margin-bottom: 12px; }
        .as-sl-row { display: flex; align-items: baseline; gap: 8px; padding: 8px 2px; border-bottom: 1px solid var(--color-line); font-size: 0.8rem; }
        .as-sl-row:last-child { border-bottom: none; }
        .as-sl-name { color: var(--color-ink); font-weight: 700; flex: none; max-width: 40%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .as-sl-mid { flex: 1; min-width: 0; color: var(--color-ink-3); font-size: 0.72rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .as-sl-row .up { color: var(--color-success); font-weight: 700; flex: none; }
        .as-sl-row .dn { color: var(--color-danger); font-weight: 700; flex: none; }
        .as-note { font-size: 0.7rem; color: var(--color-ink-3); text-align: center; margin-top: 6px; line-height: 1.5; word-break: keep-all; }
      `}</style>
      <style jsx global>{`body { background: var(--color-bg); margin: 0; }`}</style>
    </div>
  );
}
