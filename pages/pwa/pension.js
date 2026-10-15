// [S20-PEN] 연금(개인연금·퇴직연금 DC) 화면 — 단일 소스(snapshot/latest) + 진단·위험게이지·오늘할일·가구.
//   ★UI 통일: 주식/ETF/부동산 페이지와 동일한 pwa-shell + sticky-hdr(AppHeader+AssetMapTitle+SegTabs) + .card 구조·토큰.
//   반자동: 엔진이 '오늘 할 일'을 만들고, 사용자가 MTS 체결 후 [완료]. 자동주문 없음.
import { useState, useEffect, useCallback } from "react";
import AppHeader from "../../components/AppHeader";
import BottomNav from "../../components/BottomNav";
import AssetMapTitle from "../../components/AssetMapTitle";
import SegTabs from "../../components/shared/SegTabs";
import useSwipeTabs from "../../components/shared/useSwipeTabs";
import * as P from "../../lib/pension";
import { pensionCreditLimitCombined } from "../../lib/taxRules"; // [S39 EB-1] 세액공제 합산 한도(원)
import { getTrader } from "../../lib/trader";
// [S41-0 선행-2] 연금 계좌(개인연금·퇴직연금)로 직접 입력한 ETF/펀드 보유를 연금 화면에 표시·수정·삭제·추가.
import { getHoldings, getOtherAssets, removeEtf, updateEtfAvg, removeOtherAsset, updateOtherAsset, addOtherAsset, inferMarket } from "../../lib/etfHoldings";
import { EtfForm } from "../../components/shared/AssetForms";
import { classifyEtf } from "../../lib/etfClassify"; // [S45 SE] 투자지역(국내/해외) 분류

const man = (v) => (v == null ? "-" : `${Math.round(Number(v) / 1e4).toLocaleString()}만`);
const uk = (v, d = 2) => (v == null ? "-" : `${(Number(v) / 1e8).toFixed(d)}억`);
const pct = (v, d = 2) => (v == null ? "-" : `${Number(v).toFixed(d)}%`);

const PRESET_DESC = {
  "안정운영형": "위험자산 55% · 안정과 성장 균형 (분석 권장안)",
  "성장유지형": "위험자산 60%(운영상한) · 미국 성장주 강화",
  "균형형": "위험자산 50% · 채권혼합·채권 비중 확대",
};

// [사용자 지시] 탭 아래 한 줄 설명(2줄 금지·nowrap). 주식 페이지의 as-tabnote 패턴.
const LEAD = {
  PENSION_SAVINGS: { ic: "🏦", t: "과세이연·세액공제 · 진단·오늘 할 일" },
  DC: { ic: "🏛️", t: "위험자산 70% 한도 · 진단·리밸런싱" },
};

// [S41-0 선행-4] 거래 리듬 달력 — role 값은 서버가 주는 그대로(check/trade/review) 한글 라벨만 매핑.
//   지어낸 의미를 덧붙이지 않는다(점검/거래/복기는 role 단어의 직역). role=null 이면 일반 거래일/휴장.
const CAL_ROLE = {
  check:  { label: "점검", ic: "🔎", fg: "var(--color-primary)",  bg: "var(--color-primary-soft)" },
  trade:  { label: "거래", ic: "💱", fg: "var(--color-warning)",  bg: "var(--color-warning-soft, var(--color-primary-soft))" },
  review: { label: "복기", ic: "📋", fg: "var(--color-success)",  bg: "var(--color-success-soft)" },
};
const WD = ["일", "월", "화", "수", "목", "금", "토"];
// "2026-10-14" → {md:"10/14", wd:"화", dow:3, iso}. 시간대 흔들림 방지 위해 분해해서 생성.
const calParse = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
  if (!m) return { md: String(iso || ""), wd: "", dow: -1, iso };
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return { md: `${Number(m[2])}/${Number(m[3])}`, wd: WD[d.getDay()], dow: d.getDay(), iso };
};
const todayISO = () => { const d = new Date(); const p = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };

// 계좌 목록은 /api/pwa/pension/accounts 로 로드. 미도달 시 폴백.
const FALLBACK_ACCOUNTS = [
  { id: "A-PEN-01", label: "개인연금", type: "PENSION_SAVINGS" },
  { id: "A-DC-01", label: "퇴직연금", type: "DC" },
];

export default function PensionPage() {
  const [accountList, setAccountList] = useState(FALLBACK_ACCOUNTS);
  const [acct, setAcct] = useState(FALLBACK_ACCOUNTS[0]);
  const [snap, setSnap] = useState(null);
  const [risk, setRisk] = useState(null);
  const [cards, setCards] = useState(null);
  const [actions, setActions] = useState(null);
  const [household, setHousehold] = useState(null);
  const [loading, setLoading] = useState(true);
  const [snapStatus, setSnapStatus] = useState("loading"); // [S39 EA-3] loading|ok|empty|error — 조회 실패와 '데이터 없음'을 구분
  const [cardsStatus, setCardsStatus] = useState("loading");   // [S38 EF-05] 진단 요청 상태(ok|error)
  const [actionsStatus, setActionsStatus] = useState("loading"); // [S38 EF-05] 오늘 할 일 요청 상태(ok|error)
  // [S39 EB-1] 올해 세액공제 납입액(개인연금+퇴직연금 합산, 만원). 연도 태깅 저장 → 작년 값은 '올해 확인 필요'.
  const [contribMan, setContribMan] = useState("");
  const [contribYear, setContribYear] = useState(null);
  const [contribEditing, setContribEditing] = useState(false);
  // [S41-0 선행-2] 로컬 보유(직접 입력) 표시·편집 상태. SSR 불일치 방지 위해 mounted 후에만 localStorage 읽기.
  const [mounted, setMounted] = useState(false);
  const [holdTick, setHoldTick] = useState(0);       // 수정/삭제/추가 후 재읽기 트리거
  const [editKey, setEditKey] = useState(null);      // "etf:<id>" | "oth:<id>"
  const [editVal, setEditVal] = useState("");
  const [addMode, setAddMode] = useState(null);      // null | "etf" | "fund"
  const [fundName, setFundName] = useState("");
  const [fundMan, setFundMan] = useState("");        // 펀드 평가금액(만원)
  // [S41-0 선행-4] 연금 거래 리듬 달력 — /api/pwa/pension/<계좌>/calendar 응답(days:[{date,role,trading,post_holiday}]).
  //   조회 실패를 '없음'으로 바꾸지 않는다: loading|ok|empty|error 구분(EA-3와 동일 원칙).
  const [cal, setCal] = useState(null);
  const [calStatus, setCalStatus] = useState("loading");
  // [S45 SE] 연금 리밸런싱 — 계좌 ETF를 현재가로 평가해 국내/해외 배분 vs 목표 → 조정 금액.
  const [penQuotes, setPenQuotes] = useState({}); // ticker → { price, currency }
  const [penFx, setPenFx] = useState(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [preview, setPreview] = useState(null);
  const [msg, setMsg] = useState("");
  const [goalOpen, setGoalOpen] = useState(false);
  const [presets, setPresets] = useState([]);
  const [curPreset, setCurPreset] = useState(null);
  const [allocating, setAllocating] = useState(false);

  // [S39 EA-3] 요청별 상태 구분 — 로딩 / 조회 실패(네트워크 reject·HTTP·JSON) / 정상 빈 응답 / 정상 데이터.
  //   ★ 과거 Promise.all 은 한 요청만 reject 돼도 setLoading(false)에 영영 도달하지 못해 화면이
  //     영구 로딩에 빠졌다. allSettled 로 바꿔 한 요청 실패가 전체를 막지 않게 한다.
  //   ★ 조회 실패를 '데이터 없음'으로 바꾸지 않는다 — 실패는 '불러오지 못함'(재시도), 없음은 '붙여넣기 시작'.
  const load = useCallback(async () => {
    setSnapStatus("loading"); setCardsStatus("loading"); setActionsStatus("loading"); setLoading(true);
    const [sR, cR, aR] = await Promise.allSettled([
      P.getSnapshot(acct.id), P.getDiagnose(acct.id), P.getActions(acct.id),
    ]);
    // [S38 EF-05] 정상 성공은 'ok:true 를 명시한 응답'만 인정한다. HTTP 200 이어도 {}·계약 누락은 성공이 아니라 error 로 본다.
    const okResp = (r) => r.status === "fulfilled" && r.value.status >= 200 && r.value.status < 300 && r.value.data?.ok === true;
    // 스냅샷(주 게이트): 성공(ok:true)+값 → ok, 성공+빈값 → empty, 그 외(reject·HTTP실패·계약누락·ok:false) → error.
    if (!okResp(sR)) { setSnap(null); setSnapStatus("error"); }
    else if (!sR.value.data.snapshot) { setSnap(null); setSnapStatus("empty"); }
    else { setSnap(sR.value.data.snapshot); setSnapStatus("ok"); }
    // [S38 EF-05] 진단·행동도 요청별 상태 구분 — 실패를 '없음'(빈 배열)으로 바꾸지 않는다. 실패 시 null+error.
    if (okResp(cR)) { setCards(cR.value.data.cards || []); setCardsStatus("ok"); }
    else { setCards(null); setCardsStatus("error"); }
    if (okResp(aR)) { setActions(aR.value.data.actions || []); setActionsStatus("ok"); }
    else { setActions(null); setActionsStatus("error"); }
    if (acct.type === "DC") {
      const r = await P.getRisk(acct.id).catch(() => null);
      setRisk(r && r.data?.ok ? r.data : null);
    } else setRisk(null);
    const h = await P.getHousehold("HH-A").catch(() => null);
    setHousehold(h && h.data?.ok ? h.data : null);
    setLoading(false);
  }, [acct]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    P.getHouseholdPolicy("HH-A").then((r) => {
      if (r.data?.ok) { setPresets(r.data.presets || []); setCurPreset(r.data.policy?.preset || null); }
    });
  }, []);

  // [S41-0 선행-4] 선택 계좌의 거래 리듬 달력 로드(8주). 호출부가 없던 getCalendar 를 연결.
  //   ★ 실패/빈값/정상 구분(EA-3): reject·HTTP실패·ok:false → error, days 없음/빈배열 → empty, 그 외 → ok.
  useEffect(() => {
    let alive = true;
    setCalStatus("loading");
    P.getCalendar(acct.id, 8)
      .then((r) => {
        if (!alive) return;
        const okResp = r && r.status >= 200 && r.status < 300 && r.data?.ok === true;
        if (!okResp) { setCal(null); setCalStatus("error"); return; }
        const days = Array.isArray(r.data.days) ? r.data.days : [];
        setCal(days);
        setCalStatus(days.length ? "ok" : "empty");
      })
      .catch(() => { if (alive) { setCal(null); setCalStatus("error"); } });
    return () => { alive = false; };
  }, [acct]);

  useEffect(() => {
    let alive = true;
    P.getAccounts().then((r) => {
      if (!alive || !r.data?.ok || !r.data.accounts?.length) return;
      const list = r.data.accounts.map((a) => ({ id: a.account_id, label: a.label, type: a.account_type }));
      setAccountList(list);
      setAcct((cur) => list.find((x) => x.id === cur.id) || list[0]);
    });
    return () => { alive = false; };
  }, []);

  const applyPreset = async (name) => {
    setAllocating(true); setMsg("");
    const r = await P.allocateHousehold("HH-A", { preset: name });
    setAllocating(false);
    if (r.data?.ok) { setCurPreset(name); setGoalOpen(false); setMsg(`가구 목표 '${name}' 적용 — 계좌별 DRAFT 계획 재생성`); load(); }
    else setMsg(r.data?.error || "적용 실패");
  };
  const doPreview = async () => {
    setMsg("");
    const r = await P.pastePreview(acct.id, pasteText);
    if (r.data?.ok) setPreview(r.data);
    else { setPreview(null); setMsg(r.data?.error || "미리보기 실패"); }
  };
  const doSave = async () => {
    const r = await P.pasteSave(acct.id, pasteText);
    if (r.data?.ok) { setMsg("저장됨"); setPasteOpen(false); setPasteText(""); setPreview(null); load(); }
    else setMsg(r.data?.error || "저장 실패");
  };
  const complete = async (id) => {
    const r = await P.setActionStatus(id, { status: "DONE" });
    if (r.data?.ok) load();
  };
  const makePlanNow = async () => {
    setMsg("계획 생성 중…");
    const r = await P.makePlan(acct.id, {});
    if (r.data?.ok) { setMsg(`리밸런싱 계획 생성됨 (조정 ${r.data.moves?.length || 0}건, 액션 ${r.data.actions})`); load(); }
    else setMsg(r.data?.error || "계획 생성 실패");
  };

  // [S39 EB-1] 납입액 로드 — 연도 태깅 JSON({year,amount}). 올해 값만 채우고, 레거시(단일 문자열)·작년 값은 '확인 필요'로 비운다.
  useEffect(() => {
    try {
      const raw = localStorage.getItem("onehub_pension_contrib");
      if (!raw) return;
      let obj = null; try { obj = JSON.parse(raw); } catch (e) { obj = null; }
      if (obj && typeof obj === "object" && obj.amount != null) {
        const y = Number(obj.year) || null;
        setContribYear(y);
        if (y === new Date().getFullYear()) setContribMan(String(obj.amount));
      }
    } catch (e) {}
  }, []);
  const saveContrib = () => {
    // [S38 EF-02b] 빈 입력 = 지우기 — 저장값을 제거해 재접속 시 복원되지 않게 한다(이전엔 삭제 불가였음).
    if (contribMan === "") {
      try { localStorage.removeItem("onehub_pension_contrib"); } catch (e) {}
      setContribYear(null); setContribEditing(false); return;
    }
    const n = Number(contribMan);
    if (!(n >= 0)) return;
    const y = new Date().getFullYear();
    try { localStorage.setItem("onehub_pension_contrib", JSON.stringify({ year: y, amount: n })); } catch (e) {}
    setContribYear(y); setContribEditing(false);
  };

  // [S41-0 선행-2] 로컬 보유(onehub_etf_holdings / onehub_etf_other)를 계좌별로 읽어 표시·편집.
  //   ★ getLedger()·합산은 건드리지 않는다 — etfLive 가 이미 전 계좌를 합산 중(표시 복원일 뿐).
  useEffect(() => { setMounted(true); }, []);
  const tr = mounted ? getTrader() : "A";
  const refreshHold = () => { setHoldTick((t) => t + 1); try { window.dispatchEvent(new Event("onehub-assets-change")); } catch (e) {} };
  const localEtf = mounted ? (getHoldings(tr) || []).filter((h) => (h.account || "일반") === acct.label) : [];
  const localOther = mounted ? (getOtherAssets(tr) || []).filter((o) => (o.account || "일반") === acct.label) : [];
  const saveLocalEdit = (kind, id) => {
    const v = Number(editVal);
    if (kind === "etf") { if (v > 0) updateEtfAvg({ id, avgPrice: v, trader: tr }); }
    else { if (v >= 0) updateOtherAsset(id, { valueKrw: Math.round(v * 1e4) }, tr); }
    setEditKey(null); setEditVal(""); refreshHold();
  };
  const delLocal = (kind, row) => {
    if (kind === "etf") removeEtf({ ticker: row.ticker, account: acct.label, trader: tr });
    else removeOtherAsset({ id: row.id, trader: tr });
    refreshHold();
  };
  const addFund = () => {
    const v = Number(fundMan);
    if (!fundName.trim() || !(v >= 0)) return;
    addOtherAsset({ name: fundName.trim(), account: acct.label, valueKrw: Math.round(v * 1e4), kind: "fund", trader: tr });
    setFundName(""); setFundMan(""); setAddMode(null); refreshHold();
  };
  void holdTick; // 재읽기 트리거(상태 변경 시 재렌더 → getHoldings 재호출)

  // [S45 SE] 이 계좌 ETF 티커의 현재가(원)를 조회 — 국내/해외 배분 평가용. etf.js 와 같은 공개 소스.
  useEffect(() => {
    if (!mounted) return;
    const tickers = [...new Set(localEtf.map((h) => h.ticker).filter(Boolean))];
    if (!tickers.length) { setPenQuotes({}); return; }
    let alive = true;
    (async () => {
      const fx = await fetch("/api/fx/usdkrw").then((r) => r.json()).catch(() => null);
      if (alive) setPenFx(fx?.ok ? fx.rate : null);
      const byMkt = {};
      localEtf.forEach((h) => { const m = inferMarket(h.ticker, h.market); (byMkt[m] = byMkt[m] || []).push(h.ticker); });
      const q = {};
      await Promise.all(Object.entries(byMkt).map(async ([m, tks]) => {
        const uniq = [...new Set(tks)];
        const d = await fetch(`/api/etf/quote?tickers=${encodeURIComponent(uniq.join(","))}&market=${m}`).then((r) => r.json()).catch(() => null);
        if (d?.ok && d.quotes) uniq.forEach((tk) => { const raw = d.quotes[String(tk).toUpperCase()] || d.quotes[tk]; if (raw && Number(raw.price) > 0) q[tk] = { price: raw.price, currency: raw.currency }; });
      }));
      if (alive) setPenQuotes(q);
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, acct.label, holdTick]);

  // [S45 SE] 계좌 ETF를 현재가로 평가해 국내/해외 금액을 집계(시세 못 받은 종목은 '평가 보류'로 제외·단정 금지).
  const seEval = (() => {
    let dm = 0, os = 0, priced = 0, pending = 0;
    localEtf.forEach((h) => {
      const qt = penQuotes[h.ticker];
      if (!qt) { pending += 1; return; }
      const krw = qt.currency === "USD" ? (penFx ? qt.price * penFx : null) : qt.price;
      if (krw == null) { pending += 1; return; }
      const val = krw * (Number(h.shares) || 0);
      const c = classifyEtf(h.ticker);
      const region = c ? c.r : null;
      if (region === "국내") dm += val; else if (region === "해외") os += val; else { /* 미분류 ETF는 국내/해외 배분에서 제외 */ }
      priced += 1;
    });
    return { dm, os, tot: dm + os, priced, pending };
  })();
  // [S45 SE] 국내/해외 목표(onehub_target_alloc.region). 미설정이면 null → '목표 미설정'.
  const seTarget = (() => {
    if (!mounted) return null;
    try { const t = JSON.parse(localStorage.getItem("onehub_target_alloc") || "null"); const r = t?.region || t || null; return r && (Number(r.국내) > 0 || Number(r.해외) > 0) ? r : null; } catch { return null; }
  })();

  const acctIdx = Math.max(0, accountList.findIndex((x) => x.id === acct.id));
  // [사용자 지시] 개인연금↔퇴직연금 탭 스와이프(ETF·부동산과 통일)
  const acctSwipe = useSwipeTabs({ index: acctIdx, count: accountList.length, onChange: (i) => setAcct(accountList[i]) });

  return (
    <div className="pension pwa-shell" onTouchStart={acctSwipe.onTouchStart} onTouchMove={acctSwipe.onTouchMove} onTouchEnd={acctSwipe.onTouchEnd}>
      {/* [사용자 지시] 상위 메뉴 고정 — 다른 자산 페이지와 동일한 sticky 헤더 */}
      <div className="sticky-hdr">
        <AppHeader />
        <AssetMapTitle current="연금" />
        <SegTabs items={accountList.map((a) => ({ key: a.id, label: a.label }))}
          index={acctIdx} onChange={(i) => setAcct(accountList[i])} ariaLabel="연금 계좌" />
        <div className="pen-lead">{(LEAD[acct.type] || {}).ic} <b>{acct.label}</b> · {(LEAD[acct.type] || {}).t || "진단·오늘 할 일·리밸런싱"}</div>
      </div>

      {/* [S39 EB-1] 올해 세액공제 납입액 입력 — 개인연금+퇴직연금 '합산'·연도 태깅. 계좌/스냅샷 상태와 무관하게 항상 표시. */}
      {(() => {
        const y = new Date().getFullYear();
        const limitMan = Math.round(pensionCreditLimitCombined() / 1e4);
        const known = contribYear === y && contribMan !== "";
        const amt = known ? Number(contribMan) : null;
        const room = amt != null ? Math.max(0, limitMan - amt) : null;
        const pctDone = amt != null && limitMan > 0 ? Math.min(100, Math.round((amt / limitMan) * 100)) : null;
        const inBox = { flex: "1 1 120px", minWidth: 0, border: "1px solid var(--color-line)", background: "var(--color-bg)", borderRadius: 8, padding: "10px 11px", fontSize: "0.9rem", color: "var(--color-ink)" };
        return (
          <section className="card" style={{ marginTop: 10 }}>
            <div style={{ fontSize: "0.86rem", fontWeight: 800, marginBottom: 8 }}>💳 올해({y}년) 세액공제 납입액 <span style={{ fontWeight: 600, fontSize: "0.72rem", color: "var(--color-ink-3)" }}>개인연금 + 퇴직연금 합산</span></div>
            {(contribEditing || !known) ? (
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <input type="number" inputMode="numeric" placeholder={`올해 납입액 (한도 ${limitMan.toLocaleString()}만원)`} value={contribMan} onChange={(e) => setContribMan(e.target.value)} style={inBox} />
                <span style={{ fontSize: "0.82rem", color: "var(--color-ink-2)", fontWeight: 700 }}>만원</span>
                {(() => {
                  const isClear = contribMan === "";                 // 빈 입력 = 지우기
                  const canAct = isClear ? contribYear != null : Number(contribMan) >= 0; // 지울 값이 있거나 유효 숫자
                  return (
                    <button onClick={saveContrib} disabled={!canAct} style={{ border: "none", borderRadius: 8, padding: "10px 16px", fontSize: "0.85rem", fontWeight: 800, color: "var(--color-on-primary)", background: isClear ? "var(--color-ink-3)" : "var(--color-primary)", cursor: "pointer", opacity: canAct ? 1 : 0.5 }}>{isClear ? "지우기" : "저장"}</button>
                  );
                })()}
              </div>
            ) : (
              <>
                <div style={{ height: 8, borderRadius: 999, background: "var(--color-card-soft, rgba(0,0,0,0.06))", overflow: "hidden", marginBottom: 8 }}>
                  <div style={{ width: `${pctDone}%`, height: "100%", background: "var(--color-primary)", borderRadius: 999 }} />
                </div>
                <div style={{ display: "flex", fontSize: "0.85rem", color: "var(--color-ink-2)" }}>
                  <span>올해 납입 <b style={{ color: "var(--color-ink)" }}>{amt.toLocaleString()}만원</b></span>
                  <b style={{ marginLeft: "auto", color: "var(--color-primary)" }}>세액공제 여유 {room.toLocaleString()}만원</b>
                </div>
                <button onClick={() => setContribEditing(true)} style={{ marginTop: 8, border: "1px solid var(--color-line)", background: "var(--color-card)", color: "var(--color-ink-2)", borderRadius: 8, padding: "7px 12px", fontSize: "0.78rem", fontWeight: 700, cursor: "pointer" }}>수정</button>
              </>
            )}
            {contribYear != null && contribYear !== y && (
              <div style={{ marginTop: 8, fontSize: "0.7rem", color: "var(--color-warning-ink, var(--color-warning))", lineHeight: 1.4 }}>⚠ 마지막 입력은 {contribYear}년 값입니다. 올해({y}년) 납입액을 다시 입력해 주세요.</div>
            )}
            <div style={{ marginTop: 8, fontSize: "0.68rem", color: "var(--color-ink-3)", lineHeight: 1.4 }}>세액공제 한도(개인연금+퇴직연금 합산) {limitMan.toLocaleString()}만원 기준. 총 납입 가능 한도와는 다릅니다. 참고용 · 세무자문 아님.</div>
          </section>
        );
      })()}

      {/* [S41-0 선행-2] 직접 입력한 ETF/펀드 보유(계좌별·로컬) — 서버 스냅샷과 출처 구분. 수정·삭제·추가 그 자리에서. */}
      {mounted && (() => {
        const rows = [
          ...localEtf.map((h) => ({ kind: "etf", id: h.id, ticker: h.ticker, name: h.ticker, meta: `${h.shares}주 · 평단 ${Number(h.avgPrice).toLocaleString()}${h.avgCcy === "USD" ? "$" : "원"}`, cur: h.avgPrice })),
          ...localOther.map((o) => ({ kind: "oth", id: o.id, name: o.name, meta: `평가 ${man(o.valueKrw)}원`, cur: Math.round((Number(o.valueKrw) || 0) / 1e4) })),
        ];
        return (
          <section className="card" style={{ marginTop: 10 }}>
            <div style={{ fontSize: "0.86rem", fontWeight: 800, marginBottom: 2 }}>🧾 직접 입력 보유 <span style={{ fontWeight: 600, fontSize: "0.72rem", color: "var(--color-ink-3)" }}>{acct.label} · 로컬</span></div>
            <div style={{ fontSize: "0.68rem", color: "var(--color-ink-3)", marginBottom: 8, lineHeight: 1.4 }}>아래 증권사 붙여넣기(서버 스냅샷)와 <b>출처가 다른</b>, 직접 입력한 보유입니다. 종합자산에는 이미 합산돼 있습니다.</div>
            {rows.length === 0 ? (
              <div style={{ fontSize: "0.76rem", color: "var(--color-ink-3)", lineHeight: 1.5 }}>이 계좌로 직접 입력한 ETF·펀드가 없습니다. 아래에서 추가하세요.</div>
            ) : rows.map((r) => (
              <div key={`${r.kind}:${r.id}`} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: "1px solid var(--color-line)" }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--color-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</div>
                  <div style={{ fontSize: "0.7rem", color: "var(--color-ink-3)" }}>{r.meta}</div>
                </div>
                {editKey === `${r.kind}:${r.id}` ? (
                  <>
                    <input type="number" inputMode="decimal" value={editVal} onChange={(e) => setEditVal(e.target.value)} style={{ width: 92, border: "1px solid var(--color-line)", borderRadius: 8, padding: "6px 8px", fontSize: "0.78rem" }} placeholder={r.kind === "etf" ? "평단" : "만원"} />
                    <button onClick={() => saveLocalEdit(r.kind, r.id)} style={{ border: "none", background: "var(--color-primary)", color: "var(--color-on-primary)", borderRadius: 8, padding: "6px 10px", fontSize: "0.72rem", fontWeight: 700, cursor: "pointer" }}>저장</button>
                    <button onClick={() => { setEditKey(null); setEditVal(""); }} style={{ border: "1px solid var(--color-line)", background: "var(--color-card)", color: "var(--color-ink-2)", borderRadius: 8, padding: "6px 8px", fontSize: "0.72rem", cursor: "pointer" }}>취소</button>
                  </>
                ) : (
                  <>
                    <button onClick={() => { setEditKey(`${r.kind}:${r.id}`); setEditVal(String(r.cur ?? "")); }} style={{ border: "1px solid var(--color-line)", background: "var(--color-card)", color: "var(--color-primary)", borderRadius: 8, padding: "6px 10px", fontSize: "0.72rem", fontWeight: 700, cursor: "pointer" }}>수정</button>
                    <button onClick={() => delLocal(r.kind, r)} style={{ border: "1px solid var(--color-line)", background: "var(--color-card)", color: "var(--color-ink-3)", borderRadius: 8, padding: "6px 9px", fontSize: "0.72rem", cursor: "pointer" }}>삭제</button>
                  </>
                )}
              </div>
            ))}
            <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              <button onClick={() => setAddMode(addMode === "etf" ? null : "etf")} style={{ border: "1px solid var(--color-primary)", background: addMode === "etf" ? "var(--color-primary-soft)" : "var(--color-card)", color: "var(--color-primary)", borderRadius: 999, padding: "6px 12px", fontSize: "0.74rem", fontWeight: 700, cursor: "pointer" }}>＋ ETF 추가</button>
              <button onClick={() => setAddMode(addMode === "fund" ? null : "fund")} style={{ border: "1px solid var(--color-line)", background: addMode === "fund" ? "var(--color-primary-soft)" : "var(--color-card)", color: "var(--color-ink-2)", borderRadius: 999, padding: "6px 12px", fontSize: "0.74rem", fontWeight: 700, cursor: "pointer" }}>＋ 펀드·기타 추가</button>
            </div>
            {addMode === "etf" && (
              <div style={{ marginTop: 10 }}>
                <EtfForm fixedAccount={acct.label} onSaved={() => { setAddMode(null); refreshHold(); }} />
              </div>
            )}
            {addMode === "fund" && (
              <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <input value={fundName} onChange={(e) => setFundName(e.target.value)} placeholder="상품명(예: 미래에셋 디폴트옵션)" style={{ flex: "1 1 160px", minWidth: 0, border: "1px solid var(--color-line)", borderRadius: 8, padding: "9px 10px", fontSize: "0.85rem" }} />
                <input type="number" inputMode="numeric" value={fundMan} onChange={(e) => setFundMan(e.target.value)} placeholder="평가금액(만원)" style={{ flex: "1 1 120px", minWidth: 0, border: "1px solid var(--color-line)", borderRadius: 8, padding: "9px 10px", fontSize: "0.85rem" }} />
                <button onClick={addFund} disabled={!fundName.trim() || !(Number(fundMan) >= 0)} style={{ border: "none", background: "var(--color-primary)", color: "var(--color-on-primary)", borderRadius: 8, padding: "9px 14px", fontSize: "0.8rem", fontWeight: 800, cursor: "pointer", opacity: (fundName.trim() && Number(fundMan) >= 0) ? 1 : 0.5 }}>추가</button>
              </div>
            )}
          </section>
        );
      })()}

      {/* [S45 SE] 연금 리밸런싱 — 이 계좌 ETF의 국내/해외 현재 배분 vs 목표 → 자산군 단위 조정 금액.
          ★종목 지정 추천 안 함. ★목표 미설정이면 '미설정'. ★시세 못 받은 종목은 평가 보류(단정 금지). */}
      {mounted && localEtf.length > 0 && (() => {
        const e = seEval;
        return (
          <section className="card" style={{ marginTop: 10 }}>
            <div style={{ fontSize: "0.86rem", fontWeight: 800, marginBottom: 2 }}>⚖️ 리밸런싱 <span style={{ fontWeight: 600, fontSize: "0.72rem", color: "var(--color-ink-3)" }}>{acct.label} · 국내/해외</span></div>
            {e.tot <= 0 ? (
              <div style={{ fontSize: "0.74rem", color: "var(--color-ink-3)", lineHeight: 1.5 }}>
                {e.pending > 0 ? "ETF 시세를 불러오는 중입니다 — 잠시 후 배분이 표시됩니다." : "국내/해외로 분류되는 ETF가 없어 배분을 계산할 수 없습니다."}
              </div>
            ) : !seTarget ? (
              <div style={{ fontSize: "0.74rem", color: "var(--color-ink-3)", lineHeight: 1.5 }}>
                목표 배분이 <b>미설정</b>입니다. ETF 화면에서 국내/해외 목표를 정하면 조정 금액을 계산해 드립니다.
              </div>
            ) : (
              <>
                {[["국내", e.dm, Number(seTarget.국내) || 0], ["해외", e.os, Number(seTarget.해외) || 0]].map(([label, val, tgtPct]) => {
                  const curPct = e.tot > 0 ? (val / e.tot) * 100 : 0;
                  const deltaWon = Math.round(e.tot * (tgtPct - curPct) / 100);
                  const near = Math.abs(tgtPct - curPct) < 3;
                  return (
                    <div key={label} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 0", borderBottom: "1px solid var(--color-line)", fontSize: "0.8rem" }}>
                      <span style={{ minWidth: 40, fontWeight: 700 }}>{label}</span>
                      <span style={{ flex: 1, color: "var(--color-ink-2)" }}>{curPct.toFixed(0)}% <span style={{ color: "var(--color-ink-3)", fontSize: "0.72rem" }}>(목표 {tgtPct}%)</span></span>
                      <span style={{ fontWeight: 800, color: near ? "var(--color-ink-3)" : deltaWon >= 0 ? "var(--color-primary)" : "var(--color-warning)" }}>
                        {near ? "맞음" : `${deltaWon >= 0 ? "+" : "−"}${man(Math.abs(deltaWon))}원`}
                      </span>
                    </div>
                  );
                })}
                <div style={{ fontSize: "0.68rem", color: "var(--color-ink-3)", marginTop: 8, lineHeight: 1.5 }}>
                  평가 {man(e.tot)}원 기준 · <b>자산군(국내/해외) 단위 조정 금액</b>까지만 안내합니다(종목은 지정하지 않습니다).{e.pending > 0 ? ` · 시세 미확보 ${e.pending}종목은 평가에서 제외했습니다.` : ""}
                  <br />연금 계좌 안에서 ETF를 갈아타는 것은 인출이 아니라 <b>교체</b>라 일반계좌와 세금 취급이 다릅니다(구체 세액은 계산하지 않습니다).
                </div>
              </>
            )}
          </section>
        );
      })()}

      {/* [S41-0 선행-4] 거래 리듬 달력 — getCalendar 연결. 실패는 '없음'으로 바꾸지 않고 조용히 숨긴다(주 정보 아님). */}
      {calStatus === "ok" && Array.isArray(cal) && cal.length > 0 && (() => {
        const today = todayISO();
        const roleDays = cal.filter((d) => d.role && CAL_ROLE[d.role]);
        return (
          <section className="card" style={{ marginTop: 10 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, marginBottom: 2 }}>
              <div style={{ fontSize: "0.86rem", fontWeight: 800 }}>🗓️ 거래 리듬</div>
              <div style={{ fontSize: "0.68rem", color: "var(--color-ink-3)" }}>{acct.label} · 앞으로 {Math.round(cal.length / 7)}주</div>
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
              {Object.entries(CAL_ROLE).map(([k, v]) => (
                <span key={k} style={{ fontSize: "0.66rem", color: "var(--color-ink-3)", display: "inline-flex", alignItems: "center", gap: 3 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 3, background: v.fg, display: "inline-block" }} />{v.label}
                </span>
              ))}
              <span style={{ fontSize: "0.66rem", color: "var(--color-ink-3)", display: "inline-flex", alignItems: "center", gap: 3 }}>
                <span style={{ width: 8, height: 8, borderRadius: 3, background: "var(--color-line)", display: "inline-block" }} />휴장
              </span>
            </div>
            {/* 가로 스크롤 스트립(의도적) — 날짜 셀. 휴장=흐리게, role 있으면 색 점. 오늘=테두리. */}
            <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 6, WebkitOverflowScrolling: "touch" }}>
              {cal.map((d) => {
                const p = calParse(d.date);
                const r = d.role && CAL_ROLE[d.role] ? CAL_ROLE[d.role] : null;
                const isToday = d.date === today;
                const closed = !d.trading;
                return (
                  <div key={d.date} title={`${p.md} (${p.wd})${r ? " · " + r.label : ""}${closed ? " · 휴장" : ""}${d.post_holiday ? " · 연휴 후" : ""}`}
                    style={{ flex: "0 0 auto", width: 42, textAlign: "center", padding: "6px 2px", borderRadius: 8,
                      border: isToday ? "2px solid var(--color-primary)" : "1px solid var(--color-line)",
                      background: r ? r.bg : "var(--color-card)", opacity: closed ? 0.45 : 1 }}>
                    <div style={{ fontSize: "0.6rem", color: "var(--color-ink-3)" }}>{p.wd}</div>
                    <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--color-ink)" }}>{p.md}</div>
                    <div style={{ height: 6, marginTop: 3, display: "flex", justifyContent: "center", alignItems: "center" }}>
                      {r ? <span style={{ width: 6, height: 6, borderRadius: 2, background: r.fg, display: "inline-block" }} /> : null}
                    </div>
                  </div>
                );
              })}
            </div>
            {roleDays.length > 0 && (
              <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                {roleDays.slice(0, 4).map((d) => {
                  const p = calParse(d.date); const r = CAL_ROLE[d.role];
                  return (
                    <div key={`r-${d.date}`} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.76rem" }}>
                      <span style={{ fontSize: "0.72rem", fontWeight: 700, color: d.date === today ? "var(--color-primary)" : "var(--color-ink-2)", minWidth: 58 }}>{p.md} ({p.wd}){d.date === today ? " · 오늘" : ""}</span>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 999, background: r.bg, color: r.fg, fontSize: "0.72rem", fontWeight: 700 }}>{r.ic} {r.label}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        );
      })()}

      {snapStatus === "loading" ? (
        <div className="pen-skel" aria-busy="true">불러오는 중…</div>
      ) : snapStatus === "error" ? (
        /* [S39 EA-3] 조회 실패 — '데이터 없음'으로 바꾸지 않는다. 재시도 경로를 준다. */
        <section className="card pen-empty">
          <p><b>{acct.label}</b> 정보를 불러오지 못했습니다. 네트워크·서버 상태 때문일 수 있어요.</p>
          <button className="pen-btn" onClick={() => load()}>다시 시도</button>
        </section>
      ) : !snap ? (
        <section className="card pen-empty">
          <p>아직 <b>{acct.label}</b> 스냅샷이 없습니다. 증권사 화면을 붙여넣어 시작하세요.</p>
          <button className="pen-btn" onClick={() => setPasteOpen(true)}>증권사 화면 붙여넣기</button>
        </section>
      ) : (
        <>
          {/* 요약 히어로 — 다른 자산 페이지 히어로와 동일 스타일 */}
          <section className="hero">
            <div className="pen-eyebrow"><span>📊 {acct.label} 평가</span><span className="pen-asof">기준일 {snap.base_date || snap.as_of} · {snap.source}</span></div>
            <div className="pen-total">{uk(snap.total_value)}<span>원</span></div>
            <div className="pen-sub">{man(snap.total_value)}원</div>
            <div className="pen-rets">
              <span>누적 {pct(snap.ret_cum_pct)}</span>
              <span>연평균 {pct(snap.ret_annual_pct)}</span>
              <span>올해 {pct(snap.ret_ytd_pct)}</span>
            </div>
          </section>

          {/* 위험자산 게이지(DC) */}
          {risk && (
            <section className="card">
              <h2 className="pen-h">위험자산 한도</h2>
              <RiskGauge risk={risk} />
              <div className="pen-hint">법정 70% · 운영 {Math.round((risk.cap_operating || 0.6) * 100)}% · 여유 {man(risk.headroom_legal)}원</div>
              {risk.mismatch && <p className="pen-warn">⚠ 상품 분류가 화면값과 어긋나 계획을 활성화하지 않습니다.</p>}
            </section>
          )}

          {/* 오늘 할 일 */}
          <section className="card">
            <h2 className="pen-h">오늘 할 일</h2>
            {actions && actions.length ? actions.map((a) => (
              <div key={a.action_id} className="pen-todo">
                <div className="pen-todo-main">
                  <b>{a.action_type}</b> {a.name || ""} {a.qty ? `${a.qty}주` : (a.amount ? man(a.amount) + "원" : "")}
                  {a.reason && <div className="pen-todo-why">{a.reason}</div>}
                </div>
                {a.status === "PENDING" && a.action_type !== "CHECK" && a.action_type !== "REVIEW" && (
                  <button className="pen-btn sm" onClick={() => complete(a.action_id)}>완료</button>
                )}
                {a.status !== "PENDING" && <span className="pen-badge">{a.status}</span>}
              </div>
            )) : actionsStatus === "error" ? (
              /* [S38 EF-05] 조회 실패를 '계획 없음'으로 바꾸지 않는다 — 재시도 경로 제공. */
              <div className="pen-plan-cta">
                <p className="pen-muted">오늘 할 일을 불러오지 못했습니다(네트워크·서버 상태).</p>
                <button className="pen-btn sm" onClick={() => load()}>다시 시도</button>
              </div>
            ) : (
              <div className="pen-plan-cta">
                <p className="pen-muted">아직 리밸런싱 계획이 없습니다. 목표 배분으로 분할 실행 계획을 세워보세요.</p>
                <button className="pen-btn sm" onClick={makePlanNow}>리밸런싱 계획 세우기</button>
              </div>
            )}
          </section>

          {/* 진단 카드 */}
          <section className="card">
            <h2 className="pen-h">진단</h2>
            {cards && cards.length ? cards.map((c, i) => (
              <div key={i} className="pen-diag" style={{ borderLeftColor: P.SEV_COLOR[c.severity] }}>
                <div className="pen-diag-h"><b>{c.title}</b><span className="pen-sev" style={{ color: P.SEV_COLOR[c.severity] }}>{c.severity}</span></div>
                <div className="pen-diag-v">{c.value_label}</div>
                {c.why && <div className="pen-muted">{c.why}</div>}
              </div>
            )) : cardsStatus === "error" ? (
              /* [S38 EF-05] 조회 실패를 '데이터 없음'으로 바꾸지 않는다. */
              <div className="pen-plan-cta"><p className="pen-muted">진단을 불러오지 못했습니다(네트워크·서버 상태).</p><button className="pen-btn sm" onClick={() => load()}>다시 시도</button></div>
            ) : <p className="pen-muted">진단할 데이터가 없습니다.</p>}
          </section>
        </>
      )}

      {/* 가구 요약 */}
      {household && (
        <section className="card">
          <div className="pen-house-h">
            <h2 className="pen-h">가구 합산</h2>
            <button className="pen-btn sm ghost" onClick={() => setGoalOpen(true)}>목표 설정{curPreset ? ` · ${curPreset}` : ""}</button>
          </div>
          <div className="pen-total sm">{man(household.total_value)}<span>원</span></div>
          <div className="pen-muted">기준일 {household.base_date || "-"}</div>
          {(household.cards || []).slice(0, 3).map((c, i) => (
            <div key={i} className="pen-hcard"><span style={{ color: P.SEV_COLOR[c.severity] }}>●</span> {c.title} · {c.value_label}</div>
          ))}
        </section>
      )}

      <button className="pen-btn wide" onClick={() => setPasteOpen(true)}>증권사 화면 붙여넣기</button>
      {msg && <div className="pen-msg">{msg}</div>}

      {pasteOpen && (
        <div className="pen-sheet" role="dialog">
          <div className="pen-sheet-in">
            <h3>{acct.label} 화면 붙여넣기</h3>
            <textarea value={pasteText} onChange={(e) => setPasteText(e.target.value)} rows={6}
              placeholder="MTS 자산현황 화면을 복사해 붙여넣으세요" />
            {preview && (
              <div className="pen-prev">
                <div>총자산 {man(preview.total_value)}원 · 보유 {preview.holdings}종</div>
                {preview.unmatched?.length > 0 && <div className="pen-warn">미등록 {preview.unmatched.length}종: {preview.unmatched.join(", ")}</div>}
                <div className="pen-muted">합계 검증 {preview.verify?.ok ? "통과" : "실패"}</div>
              </div>
            )}
            <div className="pen-sheet-btns">
              <button className="pen-btn ghost" onClick={() => { setPasteOpen(false); setPreview(null); }}>닫기</button>
              <button className="pen-btn ghost" onClick={doPreview}>미리보기</button>
              <button className="pen-btn" onClick={doSave} disabled={!preview?.verify?.ok}>저장</button>
            </div>
          </div>
        </div>
      )}

      {goalOpen && (
        <div className="pen-sheet" role="dialog">
          <div className="pen-sheet-in">
            <h3>가구 목표 설정</h3>
            <p className="pen-muted">프리셋을 고르면 두 계좌에 맞춰 자산을 배치하고(DC 안전자산 먼저), 계좌별 리밸런싱 계획(DRAFT)을 다시 만듭니다.</p>
            <div className="pen-presets">
              {(presets.length ? presets : Object.keys(PRESET_DESC)).map((name) => (
                <button key={name} className={`pen-preset ${curPreset === name ? "on" : ""}`}
                  disabled={allocating} onClick={() => applyPreset(name)}>
                  <b>{name}{curPreset === name ? " ✓" : ""}</b>
                  <span>{PRESET_DESC[name] || ""}</span>
                </button>
              ))}
            </div>
            <div className="pen-muted" style={{ marginTop: 8 }}>{allocating ? "배치 계산 중…" : "적용하면 DRAFT 계획이 생성되고, 계좌 화면에서 [완료]로 실행합니다(반자동)."}</div>
            <div className="pen-sheet-btns">
              <button className="pen-btn ghost" onClick={() => setGoalOpen(false)}>닫기</button>
            </div>
          </div>
        </div>
      )}

      <p className="pen-disc">⚠ 투자자문·세무자문이 아닙니다. 매매·실행 판단은 본인이 합니다.</p>

      <BottomNav active="assets" />

      <style jsx>{`
        /* ── 다른 자산 페이지(etf.js)와 동일한 컨테이너·헤더·카드 ── */
        .pension { max-width: 480px; margin: 0 auto; padding: 0 14px var(--nav-clearance-fab); font-family: var(--font-sans); color: var(--color-ink); min-height: 100vh; background: var(--color-bg); }
        .sticky-hdr { position: sticky; top: 0; z-index: 140; background: var(--color-bg); margin: 0 -14px; padding: 0 14px; }
        /* 히어로 카드 — etf.js .hero 와 동일 */
        .hero { background: var(--color-card); color: var(--color-ink); border: 1px solid var(--color-line); border-radius: var(--radius-card, 14px); padding: 16px; box-shadow: var(--shadow-card); margin-bottom: 12px; }
        .pen-sub { font-size: var(--fs-2); color: var(--color-ink-3); font-weight: 600; margin-top: 2px; }
        /* [사용자 지시] 탭 아래 한 줄 설명 — 2줄 금지(nowrap+생략) */
        .pen-lead { margin: 8px 2px 12px; font-size: var(--fs-2); line-height: 1.5; color: var(--color-ink-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .pen-lead b { color: var(--color-ink); font-weight: 800; }
        .card { background: var(--color-card); border: 1px solid var(--color-line); border-radius: var(--radius-card); padding: 16px; margin-bottom: 12px; box-shadow: var(--shadow-card); }
        .pen-h { font-size: var(--fs-2); margin: 0 0 10px; color: var(--color-ink-3); font-weight: 700; }
        .pen-eyebrow { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; font-size: var(--fs-1); font-weight: 700; color: var(--color-ink-3); }
        .pen-total { font-size: var(--fs-8); font-weight: 800; letter-spacing: -.8px; line-height: 1; color: var(--color-ink); }
        .pen-total.sm { font-size: var(--fs-5); }
        .pen-total span { font-size: var(--fs-2); color: var(--color-ink-3); margin-left: 4px; font-weight: 700; }
        .pen-rets { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 10px; color: var(--color-ink-2); font-size: var(--fs-2); }
        .pen-asof, .pen-hint, .pen-muted { font-size: var(--fs-1); color: var(--color-ink-3); }
        .pen-hint { margin-top: 8px; }
        .pen-warn { color: var(--color-warning); font-size: var(--fs-1); margin-top: 6px; }
        .pen-todo { display: flex; align-items: center; gap: 10px; padding: 10px 0; border-top: 1px solid var(--color-line); }
        .pen-todo:first-of-type { border-top: none; padding-top: 0; }
        .pen-todo-main { flex: 1; min-width: 0; font-size: var(--fs-3); }
        .pen-todo-why { font-size: var(--fs-1); color: var(--color-ink-3); word-break: keep-all; margin-top: 2px; }
        .pen-badge { font-size: var(--fs-1); color: var(--color-ink-3); border: 1px solid var(--color-line); border-radius: 6px; padding: 2px 6px; }
        .pen-plan-cta { display: flex; flex-direction: column; gap: 10px; align-items: flex-start; }
        .pen-diag { border-left: 3px solid var(--color-line); padding: 4px 0 4px 10px; margin-bottom: 10px; }
        .pen-diag:last-child { margin-bottom: 0; }
        .pen-diag-h { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
        .pen-diag-h b { font-size: var(--fs-3); }
        .pen-sev { font-size: var(--fs-1); font-weight: 800; }
        .pen-diag-v { font-size: var(--fs-2); margin: 2px 0; color: var(--color-ink-2); }
        .pen-hcard { font-size: var(--fs-2); margin-top: 8px; color: var(--color-ink-2); }
        .pen-house-h { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; }
        .pen-house-h .pen-h { margin: 0; }
        .pen-presets { display: flex; flex-direction: column; gap: 8px; margin-top: 10px; }
        .pen-preset { text-align: left; background: var(--color-bg); border: 1px solid var(--color-line); border-radius: var(--radius-sm); padding: 10px 12px; color: var(--color-ink); display: flex; flex-direction: column; gap: 2px; }
        .pen-preset.on { border-color: var(--color-primary); }
        .pen-preset b { font-size: var(--fs-3); }
        .pen-preset span { font-size: var(--fs-1); color: var(--color-ink-3); }
        .pen-preset:disabled { opacity: 0.6; }
        .pen-btn { background: var(--color-primary); color: var(--color-on-primary); border: none; border-radius: var(--radius-sm); padding: 10px 14px; font-weight: 800; font-family: var(--font-sans); font-size: var(--fs-3); cursor: pointer; }
        .pen-btn.sm { padding: 6px 10px; font-size: var(--fs-1); }
        .pen-btn.wide { width: 100%; margin: 2px 0 12px; }
        .pen-btn.ghost { background: var(--color-card); color: var(--color-ink-2); border: 1px solid var(--color-line); font-weight: 700; }
        .pen-btn:disabled { opacity: 0.5; }
        .pen-empty { text-align: center; }
        .pen-skel { padding: 40px; text-align: center; color: var(--color-ink-3); }
        .pen-msg { text-align: center; color: var(--color-primary); font-size: var(--fs-1); margin-bottom: 12px; }
        .pen-sheet { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: flex-end; z-index: 160; }
        .pen-sheet-in { background: var(--color-card); width: 100%; max-width: 480px; margin: 0 auto; border-radius: 16px 16px 0 0; padding: 16px; }
        .pen-sheet-in h3 { margin: 0 0 10px; font-size: var(--fs-4); }
        .pen-sheet-in textarea { width: 100%; box-sizing: border-box; border: 1px solid var(--color-line); border-radius: var(--radius-sm); padding: 10px; background: var(--color-bg); color: var(--color-ink); font-family: var(--font-sans); font-size: var(--fs-3); }
        .pen-sheet-btns { display: flex; gap: 8px; margin-top: 12px; }
        .pen-sheet-btns .pen-btn { flex: 1; }
        .pen-prev { margin-top: 8px; font-size: var(--fs-2); }
        .pen-disc { font-size: var(--fs-1); color: var(--color-ink-3); text-align: center; margin: 16px 0; word-break: keep-all; }
      `}</style>
    </div>
  );
}

function RiskGauge({ risk }) {
  const ratio = risk.risky_ratio || 0;
  const cap = risk.cap_operating || 0.6;
  const pctW = Math.min(100, ratio * 100);
  return (
    <div className="rg">
      <div className="rg-bar">
        <div className="rg-fill" style={{ width: `${pctW}%`, background: ratio > cap ? "var(--color-warning)" : "var(--color-primary)" }} />
        <div className="rg-mark op" style={{ left: `${cap * 100}%` }} title="운영 상한" />
        <div className="rg-mark legal" style={{ left: "70%" }} title="법정 70%" />
      </div>
      <div className="rg-lbl">현재 위험자산 <b>{(ratio * 100).toFixed(2)}%</b></div>
      <style jsx>{`
        .rg-bar { position: relative; height: 16px; background: var(--color-line); border-radius: 8px; overflow: hidden; }
        .rg-fill { height: 100%; }
        .rg-mark { position: absolute; top: -3px; width: 2px; height: 22px; }
        .rg-mark.op { background: var(--color-ink-3); }
        .rg-mark.legal { background: var(--color-danger, var(--color-warning)); }
        .rg-lbl { font-size: var(--fs-2); margin-top: 6px; }
      `}</style>
    </div>
  );
}
