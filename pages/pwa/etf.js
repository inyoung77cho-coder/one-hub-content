// ONE-HUB v10 — ETF / Asset Intelligence 대시보드 (P7, 작업지시서 §11.2)
// 독립 라우트. 확정값(수익3단분해·세금·중복도)은 진한색/실선. 예측(Forecast)은 시나리오 투영(참고용·확정 아님).
// ★ 단일 점수 블랙박스 금지 — Portfolio Score는 구성요소를 펼쳐 보여준다(§11.2).
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/router";
import TopNav from "../../components/TopNav";
import { getTrader } from "../../lib/trader";
import { getHoldings, buyEtf, sellEtf, removeEtf, inferMarket, getPosQtyMap, setPosQty, ACCOUNTS } from "../../lib/etfHoldings";
import { acctTaxNote, TAX_DISCLAIMER, pensionCreditLimit, pensionCreditProgress, pensionCreditLimitCombined } from "../../lib/taxRules";
import Term from "../../components/Term";
import REBAL_PRESETS from "../../data/rebalance_presets.json";
import EtfBulkImport from "../../components/EtfBulkImport";
import { EtfForm } from "../../components/shared/AssetForms";

const won = (n) => {
  if (n == null) return "-";
  const a = Math.abs(n);
  if (a >= 1e8) return `${(n / 1e8).toFixed(2)}억`;
  if (a >= 1e4) return `${Math.round(n / 1e4).toLocaleString()}만`;
  return Math.round(n).toLocaleString();
};
const pct = (n) => (n == null ? "-" : `${n > 0 ? "+" : ""}${n.toFixed(2)}%`);
const sign = (n) => (n > 0 ? "pos" : n < 0 ? "neg" : "");
// [S4] 계좌 유형별 세제 안내 — data/tax_rules.json 단일 소스에서 로드(세율 하드코딩 제거)
const ACCT_EMOJI = { "일반": "💸", "개인연금": "🏦", "퇴직연금": "🏛️", "ISA": "🧾" };
// [계좌 세분화] 연금 계열(개인연금·퇴직연금) 판별 — 세액공제 한도 합산 대상
const isPensionAcct = (a) => a === "개인연금" || a === "퇴직연금";
const ACCT_TAX = ACCOUNTS.reduce((m, a) => { m[a] = `${ACCT_EMOJI[a] || ""} ${acctTaxNote(a)}`; return m; }, {});
// [S4] 계좌 필터 칩
const ACCT_FILTERS = ["전체", ...ACCOUNTS];

export default function EtfDashboard() {
  const router = useRouter();
  const [report, setReport] = useState(null);
  const [tax, setTax] = useState(null);
  const [overlap, setOverlap] = useState(null);
  const [rebal, setRebal] = useState(null);
  const [err, setErr] = useState(null);
  const [liveFx, setLiveFx] = useState(null); // 당일 USD/KRW 실시간 환율(매일 자동 갱신)
  // [내 ETF] 사용자 직접 입력 보유 + 자동 시세
  const [holdings, setHoldings] = useState([]);
  const [quotes, setQuotes] = useState({}); // { TICKER: {price, currency, date} }
  const [form, setForm] = useState({ side: "buy", ticker: "", shares: "", price: "", ccy: "USD", account: "일반", market: "auto" });
  const [formMsg, setFormMsg] = useState("");
  const [posQty, setPosQtyState] = useState({}); // [등록 ETF] 티커별 사용자 입력 수량(백엔드 미제공 보완)
  const [quotesAt, setQuotesAt] = useState(null); // [실시간] 마지막 시세 갱신 시각(ms)
  const [nowTick, setNowTick] = useState(0);      // [실시간] 상대시간 표시용 1초 틱
  const [refreshing, setRefreshing] = useState(false); // [실시간] 수동 새로고침 진행중
  const [acctFilter, setAcctFilter] = useState("전체"); // [S4] 계좌 유형 필터([전체][일반][연금][ISA])
  const [fcOpen, setFcOpen] = useState(false); // [S7.4] 예측 섹션 기본 접기
  const [pensionContrib, setPensionContrib] = useState(""); // [S4] 올해 연금 납입액(원, 세액공제 진행률)
  const [targetAlloc, setTargetAlloc] = useState(null); // [E-4] 목표 배분(onehub_target_alloc)
  const [decompOpen, setDecompOpen] = useState(false); // [E-1] Tier3 수익 분해 접힘(기본)
  const toggleDecomp = () => { const n = !decompOpen; setDecompOpen(n); try { localStorage.setItem("onehub_etf_decomp", n ? "1" : "0"); } catch {} };
  const applyPreset = (key) => {
    const p = REBAL_PRESETS.presets[key];
    if (!p) return;
    const alloc = { region: p.region, asset: p.asset, preset: key };
    try { localStorage.setItem("onehub_target_alloc", JSON.stringify(alloc)); window.dispatchEvent(new Event("onehub-assets-change")); } catch {}
    setTargetAlloc(alloc);
  };

  // [S4] 계좌 필터·연금 납입액·마지막 사용 계좌 기억(localStorage)
  useEffect(() => {
    try {
      const f = localStorage.getItem("onehub_etf_acct_filter");
      if (f && ACCT_FILTERS.includes(f)) setAcctFilter(f);
      const pc = localStorage.getItem("onehub_pension_contrib");
      if (pc != null) setPensionContrib(pc);
      const ta = localStorage.getItem("onehub_target_alloc");
      if (ta) setTargetAlloc(JSON.parse(ta));
      setDecompOpen(localStorage.getItem("onehub_etf_decomp") === "1");
      const last = localStorage.getItem("onehub_etf_last_acct");
      if (last && ACCOUNTS.includes(last)) setForm((prev) => ({ ...prev, account: last }));
    } catch (e) {}
  }, []);
  // [D1] 계좌 필터를 ?acct= URL과 동기화 — 딥링크·뒤로가기 지원(상태를 URL이 소유). localStorage는 폴백.
  const changeAcctFilter = (f) => {
    setAcctFilter(f);
    try { localStorage.setItem("onehub_etf_acct_filter", f); } catch (e) {}
    try {
      const q = { ...router.query };
      if (f && f !== "전체") q.acct = f; else delete q.acct;
      router.replace({ pathname: router.pathname, query: q }, undefined, { shallow: true });
    } catch (e) {}
  };
  // [D1] 진입 시 ?acct= 가 있으면 그 값을 우선(localStorage보다 먼저) 반영.
  useEffect(() => {
    if (!router.isReady) return;
    const a = router.query.acct;
    if (typeof a === "string" && ACCT_FILTERS.includes(a)) setAcctFilter(a);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady, router.query.acct]);
  const changePensionContrib = (v) => { setPensionContrib(v); try { localStorage.setItem("onehub_pension_contrib", v); } catch (e) {} };

  useEffect(() => {
    const load = () => {
      const tr = getTrader(); // [§3-8] 선택된 계좌(A/B) 반영
      const g = (fn) => fetch(`/api/pwa/etf/${fn}?trader=${tr}`).then((r) => r.json());
      Promise.all([g("report"), g("tax"), g("overlap"), g("rebalance")])
        .then(([r, t, o, rb]) => {
          if (r.error || t.error) setErr(r.error || t.error);
          setReport(r); setTax(t); setOverlap(o); setRebal(rb);
        })
        .catch((e) => setErr(e.message));
    };
    const loadFx = () => fetch("/api/fx/usdkrw").then((r) => r.json()).then((d) => { if (d?.ok) setLiveFx(d); }).catch(() => {});
    load();
    loadFx();
    // 백엔드 리포트·환율 주기 재조회(60초). 종목별 실제 최근 종가는 별도 시세 효과가 티커 기준으로 갱신.
    const poll = setInterval(() => { load(); loadFx(); }, 60000);
    // [§3-8] 다른 페이지에서 계좌 전환 시 즉시 재조회
    const onTrader = () => load();
    window.addEventListener("onehub-trader-change", onTrader);
    return () => { clearInterval(poll); window.removeEventListener("onehub-trader-change", onTrader); };
  }, []);

  // [ETF 시세] 티커 기준 최근 종가 조회(공개 소스). 등록 ETF(백엔드 포지션)와 내 보유 모두 대상.
  //   백엔드 평가 종가가 지연되어도, 티커별 '실제 최근 종가'를 여기서 직접 확인해 표기한다.
  const refreshQuotes = useCallback((list) => {
    const uniq = [...new Set(list.map((h) => h.ticker).filter(Boolean))];
    if (!uniq.length) return;
    uniq.forEach((tk) => {
      const mkt = inferMarket(tk, list.find((h) => h.ticker === tk)?.market);
      fetch(`/api/etf/quote?ticker=${encodeURIComponent(tk)}&market=${mkt}&t=${Date.now()}`)
        .then((r) => r.json())
        .then((d) => { if (d?.ok) { setQuotes((q) => ({ ...q, [tk]: { price: d.price, currency: d.currency, date: d.date } })); setQuotesAt(Date.now()); } })
        .catch(() => {});
    });
  }, []);

  // [내 ETF] 로컬 보유 + 등록ETF 수량 로드(60초 폴링) — 시세는 아래 통합 시세 효과가 담당
  useEffect(() => {
    const load = () => { const tr = getTrader(); setHoldings(getHoldings(tr)); setPosQtyState(getPosQtyMap(tr)); };
    load();
    const poll = setInterval(load, 60000);
    window.addEventListener("onehub-trader-change", load);
    window.addEventListener("onehub-assets-change", load); // [S3] 빠른입력 낙관적 갱신
    return () => { clearInterval(poll); window.removeEventListener("onehub-trader-change", load); window.removeEventListener("onehub-assets-change", load); };
  }, []);

  const s = report?.summary;
  const positions = (report?.positions || []).filter((p) => !p.error);

  // [ETF 시세·실시간] 등록 종목 + 내 보유 티커의 최근 종가를 20초 폴링 + 탭 복귀/포커스 시 즉시 갱신.
  const posTickers = positions.map((p) => p.ticker).filter(Boolean).join(",");
  const holdTickers = holdings.map((h) => h.ticker).filter(Boolean).join(",");
  useEffect(() => {
    const all = [...positions, ...holdings];
    if (!all.length) return;
    const doRefresh = () => refreshQuotes([...positions, ...holdings]);
    doRefresh();
    const poll = setInterval(doRefresh, 20000); // 60초 → 20초(실시간 체감)
    // 탭이 다시 보이거나 창 포커스 시 즉시 최신 시세 반영
    const onVisible = () => { if (document.visibilityState === "visible") doRefresh(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", doRefresh);
    return () => { clearInterval(poll); document.removeEventListener("visibilitychange", onVisible); window.removeEventListener("focus", doRefresh); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posTickers, holdTickers, refreshQuotes]);

  // [실시간] 상대 시간("N초 전 갱신")을 위한 1초 틱 — 탭 숨김 시 정지
  useEffect(() => {
    const tick = () => setNowTick((n) => n + 1);
    const iv = setInterval(() => { if (document.visibilityState === "visible") tick(); }, 1000);
    return () => clearInterval(iv);
  }, []);

  // [실시간] 수동 새로고침 — 리포트·환율·시세 즉시 재조회
  const refreshAll = useCallback(() => {
    setRefreshing(true);
    const tr = getTrader();
    const g = (fn) => fetch(`/api/pwa/etf/${fn}?trader=${tr}`).then((r) => r.json());
    Promise.all([g("report"), g("tax"), g("overlap"), g("rebalance")])
      .then(([r, t, o, rb]) => { if (!(r.error || t.error)) { setReport(r); setTax(t); setOverlap(o); setRebal(rb); } })
      .catch(() => {});
    fetch("/api/fx/usdkrw").then((r) => r.json()).then((d) => { if (d?.ok) setLiveFx(d); }).catch(() => {});
    refreshQuotes([...positions, ...holdings]);
    setTimeout(() => setRefreshing(false), 700);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positions, holdings, refreshQuotes]);

  // [실시간] "N초 전 갱신" 표기 문자열
  const freshLabel = (() => {
    void nowTick; // 1초마다 재계산 트리거
    if (!quotesAt) return null;
    const sec = Math.max(0, Math.round((Date.now() - quotesAt) / 1000));
    if (sec < 5) return "방금 갱신";
    if (sec < 60) return `${sec}초 전 갱신`;
    const min = Math.floor(sec / 60);
    return `${min}분 전 갱신`;
  })();

  // 등록 종목 + 내 보유의 실측 최근 종가 중 가장 최신 날짜 — 평가 기준일·실시간 표기용
  const liveCloseDate = [...positions, ...holdings]
    .map((x) => quotes[x.ticker]?.date)
    .filter(Boolean)
    .sort()
    .pop() || null;

  // [내 ETF] 매수/매도 기록 + 티커 삭제
  const submitTrade = () => {
    const tr = getTrader();
    const { side, ticker, shares, price, ccy, account, market } = form;
    setFormMsg("");
    // [E1] 국내/해외 구분 — 사용자가 명시 선택(kr/us)하면 그 값 우선, auto면 티커로 추론
    const mkt = market === "kr" || market === "us" ? market : inferMarket(ticker);
    const res = side === "buy"
      ? buyEtf({ ticker, market: mkt, shares, avgPrice: price, avgCcy: ccy, account, trader: tr })
      : sellEtf({ ticker, shares, account, trader: tr });
    if (!res.ok) { setFormMsg("⚠️ " + (res.error || "입력 오류")); return; }
    try { localStorage.setItem("onehub_etf_last_acct", account); } catch (e) {} // [S4] 마지막 사용 계좌 기억
    const tk = String(ticker).trim().toUpperCase();
    setFormMsg(side === "buy" ? `✓ ${tk} 매수 기록됨` : (res.short > 0 ? `✓ ${tk} 매도(보유수량까지만 반영)` : `✓ ${tk} 매도 반영됨`));
    const l = getHoldings(tr); setHoldings(l); refreshQuotes(l);
    setForm((f) => ({ ...f, ticker: "", shares: "", price: "" }));
  };
  const delHolding = (tk, account) => { const tr = getTrader(); removeEtf({ ticker: tk, account, trader: tr }); setHoldings(getHoldings(tr)); };

  // [등록 ETF] 수량 입력 → 실측 종가로 실시간 평가액 재계산
  const onQtyChange = (ticker, val) => {
    const tr = getTrader();
    setPosQty(ticker, val, tr);
    setPosQtyState((m) => { const n = { ...m }; if (Number(val) > 0) n[ticker.toUpperCase()] = Number(val); else delete n[ticker.toUpperCase()]; return n; });
  };

  // [내 ETF] 티커별 KRW 환산 평가·손익 (현재가 자동 시세 + 오늘 환율)
  const fxRate = liveFx?.rate || report?.as_of?.fx || null;
  const holdingMetrics = (h) => {
    const q = quotes[h.ticker];
    const toKrw = (v, ccy) => (ccy === "KRW" ? v : fxRate ? v * fxRate : null);
    const curPx = q?.price != null ? q.price : null;
    const curKrw = curPx != null ? toKrw(curPx, q.currency) : null;
    const costKrw = toKrw(h.avgPrice, h.avgCcy);
    const valueKrw = curKrw != null ? curKrw * h.shares : null;
    const costTotal = costKrw != null ? costKrw * h.shares : null;
    const pnlKrw = valueKrw != null && costTotal != null ? valueKrw - costTotal : null;
    const pnlPct = curPx != null && q?.currency === h.avgCcy ? (curPx / h.avgPrice - 1) * 100
      : valueKrw != null && costTotal ? (valueKrw / costTotal - 1) * 100 : null;
    return { curPx, curCcy: q?.currency, valueKrw, pnlKrw, pnlPct, date: q?.date };
  };
  const myTotal = holdings.reduce((acc, h) => { const m = holdingMetrics(h); return acc + (m.valueKrw || 0); }, 0);

  // [등록 ETF] 수량(백엔드 제공 우선, 없으면 사용자 입력) + 실측 종가 기반 실시간 평가액
  const posLive = (p) => {
    const qty = p.qty ?? p.shares ?? p.quantity ?? posQty[String(p.ticker).toUpperCase()] ?? null;
    const q = quotes[p.ticker];
    if (!(qty > 0) || !q?.price) return { qty: qty || null, valueKrw: null, pnlPct: null };
    const px = q.currency === "USD" ? (fxRate ? q.price * fxRate : null) : q.price;
    if (px == null) return { qty, valueKrw: null, pnlPct: null };
    const valueKrw = qty * px;
    const invest = p.krw_cost ?? p.invested_krw ?? p.cost_krw ?? null;
    const pnlPct = invest ? (valueKrw / invest - 1) * 100 : null;
    return { qty, valueKrw, pnlPct };
  };
  // 실시간 총평가액 = (수량 아는 등록 포지션) + (내 보유). 하나라도 있으면 표기.
  const liveTotal = (() => {
    let sum = 0, any = false;
    positions.forEach((p) => { const l = posLive(p); if (l.valueKrw != null) { sum += l.valueKrw; any = true; } });
    holdings.forEach((h) => { const v = holdingMetrics(h).valueKrw; if (v != null) { sum += v; any = true; } });
    return any ? sum : null;
  })();
  // [히어로 일원화] 실시간 평가(수량×실측종가)가 있으면 그걸 대표값으로, 없으면 백엔드 평가액.
  //   평가손익·수익률도 같은 base로 재계산해 상단 큰 숫자와 일치시킨다(중복 라인 제거).
  const heroLive = liveTotal != null;
  const heroVal = heroLive ? liveTotal : (s?.value_krw ?? 0);
  const heroCost = s?.krw_cost ?? 0;
  const heroPnl = heroVal - heroCost;
  const heroPnlPct = heroCost > 0 ? (heroVal / heroCost - 1) * 100 : (s?.total_pnl_pct ?? 0);

  // [총자산 동기화] ETF 실시간 평가액(억)을 온보딩 자산(etf_uk)에 반영 → 대시보드 총자산이 최신 ETF 포함.
  //   변화가 있을 때만 기록·방송(루프 방지). 실시간 평가가 없으면 건너뜀.
  useEffect(() => {
    const base = heroLive ? liveTotal : (s?.value_krw ?? null);
    if (base == null || !(base > 0)) return;
    const uk = Math.round((base / 1e8) * 10000) / 10000;
    try {
      const onb = JSON.parse(localStorage.getItem("onehub_onboard_assets") || "{}") || {};
      if (Math.abs(Number(onb.etf_uk || 0) - uk) > 0.0005) {
        onb.etf_uk = uk;
        localStorage.setItem("onehub_onboard_assets", JSON.stringify(onb));
        window.dispatchEvent(new Event("onehub-assets-change"));
      }
    } catch (e) {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveTotal, heroLive, s?.value_krw]);

  // [환율 신선도] 기준일이 오늘(KST)인지 표시 — 오래된 종가 환율이면 사용자에게 명확히 알림
  const asof = report?.as_of;
  const todayKST = (() => { try { return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" }); } catch (e) { return null; } })();
  const fxDate = asof?.fx_date || asof?.price_date || null;
  const fxFresh = fxDate && todayKST ? fxDate === todayKST : null;
  // [종가 신선도] 평가 기준일 = 백엔드 종가일과 실측 시세일 중 '더 최신'(YYYY-MM-DD 정렬).
  //   → 실시간 시세가 갱신되면 헤더 날짜가 오늘로 이동하고 '지연 N일'이 자동으로 사라진다.
  const backendPriceDate = asof?.price_date || null;
  const priceDate = [backendPriceDate, liveCloseDate].filter(Boolean).sort().pop() || null;
  const priceFromLive = !!liveCloseDate && (!backendPriceDate || liveCloseDate >= backendPriceDate); // 실측 시세가 기준일 결정
  const priceDaysAgo = (() => {
    if (!priceDate || !todayKST) return null;
    const diff = Math.round((new Date(todayKST).getTime() - new Date(priceDate).getTime()) / 86400000);
    return Number.isFinite(diff) ? Math.max(0, diff) : null;
  })();
  // 실측 시세가 있으면 항상 '실시간'(최신 가용 종가) — 지연 배지는 실측 시세가 전혀 없을 때만.
  const priceStale = !priceFromLive && priceDaysAgo != null && priceDaysAgo > 2;
  const fxDaysAgo = (() => {
    if (!fxDate || !todayKST) return null;
    const diff = Math.round((new Date(todayKST).getTime() - new Date(fxDate).getTime()) / 86400000);
    return Number.isFinite(diff) ? Math.max(0, diff) : null;
  })();

  // [§3-6 피드백11·12] 핵심 리스크 한 줄 + 리밸런싱 이유(왜) — overlap/tax 데이터에서 산출
  const maxSector = overlap?.sectors?.[0];
  const overlapWarn = overlap?.warnings?.length ? overlap.warnings[0] : null;
  const riskParts = [];
  if (maxSector) riskParts.push(`${maxSector.sector} ${(maxSector.weight * 100).toFixed(0)}% 집중`);
  if (overlapWarn) riskParts.push(overlapWarn);
  const topRisk = riskParts.length ? riskParts.join(" · ") : null;
  const rebalReasons = [];
  if (maxSector && maxSector.weight * 100 >= 25) rebalReasons.push(`${maxSector.sector} ${(maxSector.weight * 100).toFixed(0)}% 집중 — 상한 초과분 축소`);
  if (overlapWarn) rebalReasons.push(`${overlapWarn} — 중복 종목 통합으로 실질 분산 확보`);
  if (tax?.losses?.length) rebalReasons.push(`손실 종목(${tax.losses.map((l) => l.ticker).join("·")}) 손익통산 — 절세 매도 후 재매수 검토`);

  // [E2·E3] 계좌별 '해야 할 일' + 리밸런싱 제안 — 보유·세제·중복·집중·리밸 데이터에서 결정론적으로 산출.
  //   각 항목에 대상 계좌(전체/일반/연금/ISA) 태그를 붙여, 상단 계좌 필터가 곧 '할 일' 필터가 되도록 한다.
  const etfTodos = [];
  if (maxSector && maxSector.weight * 100 >= 25)
    etfTodos.push({ acct: "전체", icon: "📊", title: `${maxSector.sector} ${(maxSector.weight * 100).toFixed(0)}% 집중 축소`, detail: "단일 섹터 비중이 25% 상한을 넘습니다. 초과분을 다른 섹터로 분산해 리스크를 낮추세요.", tone: "warn" });
  if (overlapWarn)
    etfTodos.push({ acct: "전체", icon: "🔁", title: "중복 종목 통합", detail: `${overlapWarn} — 겹치는 종목을 정리하면 같은 금액으로 실질 분산이 늘어납니다.`, tone: "warn" });
  const rebalActs = Array.isArray(rebal?.actions) ? rebal.actions.filter((a) => a.action !== "HOLD") : [];
  if (rebalActs.length)
    etfTodos.push({ acct: "전체", icon: "⚖️", title: `리밸런싱 ${rebalActs.length}건 실행`, detail: `${rebalActs.slice(0, 3).map((a) => `${a.ticker} ${a.action === "SELL" ? "축소" : "확대"} ${a.qty}주`).join(" · ")}${rebalActs.length > 3 ? " 외" : ""} · 예상 양도세 ${won(rebal?.est_tax_krw)}원. 밴드 내 종목은 보유 권장.`, tone: "info" });
  if (tax?.losses?.length)
    etfTodos.push({ acct: "일반", icon: "🧾", title: `손실 종목 손익통산(${tax.losses.map((l) => l.ticker).join("·")})`, detail: "일반계좌는 같은 해 이익·손실을 합산 과세합니다. 손실 종목을 함께 매도(손실수확)하면 과세표준이 줄어 양도세를 아낄 수 있습니다.", tone: "info" });
  if (tax?.dividend_usd > 0)
    etfTodos.push({ acct: "일반", icon: "💵", title: `해외 배당 연 $${tax.dividend_usd} 관리`, detail: "해외상장 ETF 배당은 15% 원천징수 후 지급됩니다. 연 금융소득 2,000만원 초과 시 종합과세 대상이니 규모를 확인하세요.", tone: "info" });
  const hasPension = holdings.some((h) => isPensionAcct(h.account || "일반"));
  if (hasPension) {
    // 세액공제 한도는 개인연금+IRP 합산(연 900만) — 두 계좌 취득액을 함께 본다
    const limit = pensionCreditLimitCombined();
    const penRows = holdings.filter((h) => isPensionAcct(h.account || "일반"));
    const acquired = penRows.reduce((a, h) => a + (h.avgCcy === "KRW" ? h.avgPrice * h.shares : (fxRate ? h.avgPrice * h.shares * fxRate : 0)), 0);
    const contrib = pensionContrib !== "" ? Number(pensionContrib) : acquired;
    const room = Math.max(0, limit - contrib);
    if (room > 0)
      etfTodos.push({ acct: "연금", icon: "🎁", title: `연금 추가납입 여유 ${won(room)}원`, detail: `개인연금+IRP 합산 세액공제 한도(${won(limit)}원)까지 ${won(room)}원 남았습니다. 추가 납입하면 13.2~16.5% 세액공제를 더 받습니다(연금저축 단독 한도 600만).`, tone: "good" });
    else
      etfTodos.push({ acct: "연금", icon: "✅", title: "연금 세액공제 한도 충족", detail: "개인연금+IRP 합산 세액공제 한도를 채웠습니다. 초과 납입분은 내년 이월공제 또는 ISA·일반 활용을 검토하세요.", tone: "good" });
  }
  const todosForAcct = etfTodos.filter((t) => acctFilter === "전체" || t.acct === "전체" || t.acct === acctFilter || (t.acct === "연금" && isPensionAcct(acctFilter)));

  return (
    <div className="etf pwa-shell">
      <TopNav active="etf" />

      {/* 1) HERO — ETF 총평가액 + 원화 실질수익 3분해 (시안: 다크 네이비 히어로) */}
      <section className="hero">
        <div className="eyebrow">
          <span className="lbl">📊 ETF 평가 기준{priceDate ? ` · ${priceDate}` : ""}{priceDate ? <span className={`date-flag ${priceStale ? "stale" : "fresh"}`}>{priceStale ? `지연 ${priceDaysAgo}일` : (priceFromLive ? "실시간" : "최신")}</span> : null}</span>
          <span className="live-wrap">
            {freshLabel && <span className="fresh-ago">{freshLabel}</span>}
            <button className={`refresh-btn ${refreshing ? "spin" : ""}`} onClick={refreshAll} aria-label="시세 새로고침" title="지금 시세 새로고침">↻</button>
            <span className="live"><span className="live-dot" />LIVE</span>
          </span>
        </div>
        {liveFx?.ok ? (
          <div className="fx-note">
            <span className="fx-dot" />
            환율 <b>{liveFx.rate.toLocaleString(undefined, { maximumFractionDigits: 2 })}원</b>
            {liveFx.date === todayKST ? " · 오늘 기준 · 자동 갱신"
              : liveFx.date ? ` · ${liveFx.date} 기준(최신) · 자동 갱신` : " · 최신 · 자동 갱신"}
          </div>
        ) : asof?.fx != null ? (
          <div className={`fx-note ${fxFresh === false ? "stale" : ""}`}>
            <span className="fx-dot" />
            환율 <b>{asof.fx.toLocaleString()}원</b>
            {fxFresh === true ? " · 오늘 기준"
              : fxDaysAgo != null && fxDaysAgo > 0 ? ` · ${fxDaysAgo}일 전 종가 환율`
              : fxDate ? ` · ${fxDate} 종가 환율` : ""}
          </div>
        ) : null}
        {s ? (
          <>
            <div className="big">{won(heroVal)}<span>원</span>{heroLive && <span className="big-live">⚡실시간</span>}</div>
            <div className="hsub">취득 {won(heroCost)} → 평가손익 <b>{won(heroPnl)}원</b> · <b>{pct(heroPnlPct)}</b>{heroLive && <span className="hsub-note"> · 수량×실측종가({liveCloseDate ? liveCloseDate.slice(5) : "최근"})</span>}</div>
            {/* [E-1] Tier 3 — 수익 분해 접힘(헤더에 요약값 노출) */}
            <button className="decomp-head" onClick={toggleDecomp} aria-expanded={decompOpen}>
              <span>📊 수익 분해</span>
              <span className="decomp-sum">환차 기여 <b>{pct((s.fx_pure_pct || 0) + (s.cross_pct || 0))}</b> · 실질 <b>{pct(s.total_pnl_pct)}</b> <span className={`decomp-caret ${decompOpen ? "open" : ""}`}>▾</span></span>
            </button>
            {decompOpen && (<>
              <div className="decomp">
                <div className="drow"><span className="dk"><Term term="자체수익">ETF 자체수익 ($)</Term></span><span className={`dv ${sign(s.etf_self_pct)}`}>{pct(s.etf_self_pct)}</span></div>
                <div className="drow"><span className="dk"><Term term="환차손익">환차손익</Term></span><span className={`dv ${sign(s.fx_pure_pct)}`}>{pct(s.fx_pure_pct)}</span></div>
                <div className="drow"><span className="dk"><Term term="교차항">교차항</Term></span><span className={`dv ${sign(s.cross_pct)}`}>{pct(s.cross_pct)}</span></div>
                <div className="drow total"><span className="dk">실질 원화수익</span><span className={`dv ${sign(s.total_pnl_pct)}`}>{pct(s.total_pnl_pct)}</span></div>
              </div>
              <div className="foot-note">달러 수익 {pct(s.etf_self_pct)} 위에 환율효과 {pct((s.fx_pure_pct || 0) + (s.cross_pct || 0))}가 더해진 원화 실질 수익입니다.</div>
            </>)}
          </>
        ) : (
          <div className="hsub">{err ? "데이터 로드 오류" : "불러오는 중…"}</div>
        )}
      </section>

      {/* [§3-6 피드백11] #1 결론 VerdictCard — 대표지표(실질 원화수익)를 못박고 핵심 리스크 노출 */}
      {s && (
        <div className="etf-verdict">
          <div className="ev-lead">
            <span className="ev-lbl">📌 이 포트폴리오의 결론</span>
            <span className={`ev-metric ${sign(s.total_pnl_pct)}`}>실질 원화수익 {pct(s.total_pnl_pct)}</span>
          </div>
          <div className="ev-decomp">ETF <b>{pct(s.etf_self_pct)}</b> + 환 <b>{pct(s.fx_pure_pct)}</b> + 교차 <b>{pct(s.cross_pct)}</b></div>
          {topRisk && <div className="ev-risk">⚠️ 핵심 리스크 · {topRisk}</div>}
        </div>
      )}

      {/* [S4] 계좌 유형 필터 — 세제가 근본부터 다르므로 계좌별로 보유·세제를 분리해 본다 */}
      <div className="acct-filter" role="tablist" aria-label="계좌 유형 필터">
        {ACCT_FILTERS.map((f) => {
          const cnt = f === "전체" ? holdings.length : holdings.filter((h) => (h.account || "일반") === f).length;
          return (
            <button key={f} role="tab" aria-selected={acctFilter === f}
              className={`acct-chip ${acctFilter === f ? "on" : ""} ${isPensionAcct(f) ? "pension" : f === "ISA" ? "isa" : ""}`}
              onClick={() => changeAcctFilter(f)}>
              {f}{cnt > 0 && <span className="acct-chip-n">{cnt}</span>}
            </button>
          );
        })}
      </div>

      {/* [E2·E3] 해야 할 일 · 리밸런싱 제안 — 계좌 필터가 곧 '할 일' 필터. 조치 없으면 보유 권장 */}
      {s && (
        <section className="card todo-card">
          <div className="label">📋 해야 할 일 · 리밸런싱 제안
            <span className="sub">{acctFilter === "전체" ? "전 계좌" : `${acctFilter} 계좌`}</span>
          </div>
          {todosForAcct.length > 0 ? (
            <div className="todo-list">
              {todosForAcct.map((t, i) => (
                <div className={`todo-item ${t.tone}`} key={i}>
                  <span className="todo-ic">{t.icon}</span>
                  <div className="todo-body">
                    <div className="todo-t">{t.title}<span className={`todo-acct ${(t.acct === "연금" || isPensionAcct(t.acct)) ? "pension" : t.acct === "ISA" ? "isa" : t.acct === "일반" ? "normal" : "all"}`}>{t.acct}</span></div>
                    <div className="todo-d">{t.detail}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="todo-none">✅ {acctFilter === "전체" ? "현재 조정할 항목이 없습니다" : `${acctFilter} 계좌에 조치할 항목이 없습니다`} — 배분·세제 이슈 없이 밴드 내 보유 권장.</div>
          )}
          <div className="todo-foot">집중도·중복·절세·연금 한도·리밸런싱 밴드를 종합해 제안합니다. ⚠ <b>투자자문·세무자문이 아닙니다.</b> 실제 세액은 개인 상황에 따라 다르며, 최종 매매·실행 판단은 본인이 하세요.</div>
        </section>
      )}

      {/* [E-4] 목표 배분 · 국내/해외 이탈도 → 처방(진단 단독 금지). 목표 미설정 시 프리셋 3종. */}
      {holdings.length > 0 && (() => {
        const overseasKrw = holdings.reduce((a, h) => a + ((h.avgCcy === "USD") ? (holdingMetrics(h).valueKrw || 0) : 0), 0);
        const domesticKrw = Math.max(0, myTotal - overseasKrw);
        const curO = myTotal > 0 ? Math.round(overseasKrw / myTotal * 1000) / 10 : null;
        const curD = myTotal > 0 ? Math.round(domesticKrw / myTotal * 1000) / 10 : null;
        const tgt = targetAlloc?.region || null;
        const thr = REBAL_PRESETS.threshold_pp;
        return (
          <section className="card">
            <div className="label">🎯 목표 배분 · 국내/해외 리밸런싱{targetAlloc?.preset ? <span className="sub">{targetAlloc.preset}</span> : null}</div>
            {!tgt ? (
              <>
                <div className="rb-tax sub" style={{ marginBottom: 8 }}>목표 배분을 정하면 이탈도 기준 <b>구체적 실행안(매도·매수 수량)</b>을 제안합니다. 프리셋으로 시작하세요.</div>
                <div className="acct-filter" role="group" aria-label="목표 배분 프리셋">
                  {Object.keys(REBAL_PRESETS.presets).map((k) => (
                    <button key={k} className="acct-chip" onClick={() => applyPreset(k)}>{k}</button>
                  ))}
                </div>
              </>
            ) : (() => {
              const driftO = curO != null ? Math.round((curO - tgt.해외) * 10) / 10 : null;
              const over = driftO != null && Math.abs(driftO) >= thr;
              // 처방: 해외 초과 시 가장 큰 USD 보유 축소 수량 산출
              let rx = null;
              if (over && driftO > 0) {
                const usd = holdings.filter((h) => h.avgCcy === "USD").map((h) => ({ h, v: holdingMetrics(h).valueKrw || 0, px: (quotes[h.ticker]?.price ?? 0) * (fxRate || 0) })).sort((a, b) => b.v - a.v)[0];
                const cutKrw = overseasKrw - (tgt.해외 / 100) * myTotal;
                const qty = usd && usd.px > 0 ? Math.max(1, Math.round(cutKrw / usd.px)) : null;
                if (usd && qty) rx = { name: usd.h.ticker, qty, amt: Math.round(qty * usd.px) };
              } else if (over && driftO < 0) {
                rx = { buyMore: true };
              }
              return (
                <>
                  <div className="rb"><span className="rt">해외</span><span className="rw">{curO}% → 목표 {tgt.해외}%</span><b className={driftO > 0 ? "neg" : driftO < 0 ? "pos" : ""}>{driftO > 0 ? "+" : ""}{driftO}%p</b></div>
                  <div className="rb"><span className="rt">국내</span><span className="rw">{curD}% → 목표 {tgt.국내}%</span><b /></div>
                  {!over ? (
                    <div className="rb-tax" style={{ marginTop: 8 }}>✅ 국내/해외 이탈도 {thr}%p 이내 — 리밸런싱 불필요, 보유 권장.</div>
                  ) : rx?.buyMore ? (
                    <div className="rb-why" style={{ marginTop: 8 }}><div className="rb-why-h">→ 처방</div><div className="rb-why-row"><span className="rb-why-t">해외 비중이 목표보다 <b>{Math.abs(driftO)}%p</b> 낮습니다. 해외 ETF(예: TIGER 미국S&P500)를 추가 매수해 목표에 맞추세요.</span></div></div>
                  ) : rx ? (
                    <div className="rb-why" style={{ marginTop: 8 }}><div className="rb-why-h">→ 처방</div>
                      <div className="rb-why-row"><span className="rb-why-t"><b>{rx.name} {rx.qty}주 매도</b> (약 {won(rx.amt)}원) → 대금을 국내 ETF(KODEX 200 등)로 분산. 해외 {curO}% → {tgt.해외}% 목표.</span></div>
                    </div>
                  ) : null}
                  <button className="acct-chip" style={{ marginTop: 10 }} onClick={() => { try { localStorage.removeItem("onehub_target_alloc"); } catch {} setTargetAlloc(null); }}>목표 다시 설정</button>
                  <div className="rb-tax sub" style={{ marginTop: 8 }}>⚠ 투자자문이 아닙니다. 국내/해외는 통화 기준 근사이며, 국내상장 해외지수 ETF의 실질 노출(look-through)은 구성종목 데이터 연동 시 정밀화됩니다.</div>
                </>
              );
            })()}
          </section>
        );
      })()}

      {/* [E-5] 계좌 배치(asset location) 최적화 — 세제계좌 한도는 희소자원. 세금 큰 자산 우선 배치. */}
      {holdings.length > 1 && (() => {
        const genAcct = holdings.filter((h) => (h.account || "일반") === "일반");
        const taxAcct = holdings.filter((h) => isPensionAcct(h.account || "일반") || (h.account || "일반") === "ISA");
        const overseasInGen = genAcct.filter((h) => h.avgCcy === "USD");
        const domesticInTax = taxAcct.filter((h) => h.avgCcy === "KRW");
        const swap = overseasInGen.length > 0 && domesticInTax.length > 0;
        return (
          <section className="card">
            <div className="label"><Term term="자산 배치">🧮 계좌 배치 최적화</Term></div>
            {swap ? (
              <div className="rb-why">
                <div className="rb-why-h">💡 배치 개선 여지</div>
                <div className="rb-why-row"><span className="rb-why-n">→</span><span className="rb-why-t">세금이 큰 <b>해외 ETF({overseasInGen.map((h) => h.ticker).join("·")})</b>가 일반계좌에, 세금이 작은 <b>국내형({domesticInTax.map((h) => h.ticker).join("·")})</b>이 세제계좌에 있습니다. <b>두 자산의 계좌를 맞바꾸면</b> 세제계좌(ISA·연금) 한도를 세금 큰 자산에 써서 세후 수익을 높일 수 있습니다.</span></div>
              </div>
            ) : (
              <div className="rb-tax sub">현재 계좌 배치에 뚜렷한 개선 여지는 없습니다. 원칙: <b>세제계좌 한도는 세금이 큰 해외·배당형에 우선</b> 배정하고, 매매차익 비과세 성격의 국내주식형은 일반계좌 여지가 큽니다.</div>
            )}
            <div className="rb-tax sub" style={{ marginTop: 8 }}>⚠ 세무자문이 아닙니다. 실제 절세액은 개인 소득·거래·현행 세법에 따라 다릅니다.</div>
          </section>
        );
      })()}

      {/* [§3-2 원칙1] 포트폴리오 합계는 홈·AI자산 2곳에만. ETF 페이지는 ETF 슬라이스만 표시(피드백14) */}
      {err && <div className="err">데이터 로드 오류: {err}</div>}

      {/* 2) Portfolio Score — 블랙박스 금지, 구성요소 공개 */}
      {s && tax && overlap && (
        <section className="card">
          <div className="label"><Term term="Portfolio Score">Portfolio Score</Term> <span className="sub">구성요소</span></div>
          <div className="score-grid">
            <div className="sc"><span>실질 수익률</span><b className={sign(s.total_pnl_pct)}>{pct(s.total_pnl_pct)}</b></div>
            <div className="sc"><span>종목 수</span><b>{positions.length}</b></div>
            <div className="sc"><span>최대 <Term term="집중도">섹터집중</Term></span><b>{overlap.sectors?.[0] ? `${overlap.sectors[0].sector} ${(overlap.sectors[0].weight * 100).toFixed(0)}%` : "-"}</b></div>
            <div className="sc"><span>예상 양도세</span><b className="neg">{won(tax.tax_all)}원</b></div>
            <div className="sc"><span><Term term="손익통산">손익통산</Term> 손실</span><b>{tax.losses?.map((l) => l.ticker).join(", ") || "없음"}</b></div>
            <div className="sc"><span>배당(연)</span><b className="pos">${tax.dividend_usd}</b></div>
          </div>
        </section>
      )}

      {/* 3) Overlap Heat Map — [S7.4] 실 주간수급 전까지 SAMPLE 섹션 숨김(오해 방지) */}
      {overlap && !overlap.error && !overlap.note?.includes("SAMPLE") && (
        <section className="card">
          <div className="label">종목 중복 노출 (Heat Map)
            <span className="sub">실 보유 기반</span>
          </div>
          <div className="heat">
            {overlap.stocks?.slice(0, 8).map((st) => (
              <div className="hrow" key={st.ticker}>
                <span className="ht">{st.ticker}</span>
                <div className="hbar"><div style={{ width: `${Math.min(100, st.weight * 100 * 6)}%` }} /></div>
                <span className="hw">{(st.weight * 100).toFixed(1)}%</span>
              </div>
            ))}
          </div>
          <div className="sectors">
            {overlap.sectors?.slice(0, 5).map((sc) => (
              <span className="chip" key={sc.sector}>{sc.sector} {(sc.weight * 100).toFixed(0)}%</span>
            ))}
          </div>
          {overlap.warnings?.length > 0 && (
            <div className="warn">⚠ {overlap.warnings.join(" · ")}</div>
          )}
        </section>
      )}

      {/* 3.5) 자산 배분 / 리밸런싱 (P4) — [§3-6 피드백12] 왜(조정 이유) 명시 */}
      {rebal && (
        <section className="card">
          <div className="label">자산 배분 · 리밸런싱
            <span className="sub">{rebal.actions ? "현재 → 목표" : "현재 비중"}</span>
          </div>
          {rebalReasons.length > 0 && (
            <div className="rb-why">
              <div className="rb-why-h">🎯 왜 조정하나</div>
              {rebalReasons.map((r, i) => (
                <div className="rb-why-row" key={i}><span className="rb-why-n">{i + 1}</span><span className="rb-why-t">{r}</span></div>
              ))}
            </div>
          )}
          {rebal.actions ? (
            <>
              {rebal.actions.filter((a) => a.action !== "HOLD").map((a) => (
                <div className="rb" key={a.ticker}>
                  <span className="rt">{a.ticker}</span>
                  <span className="rw">{(a.current_weight * 100).toFixed(1)}% → {(a.target_weight * 100).toFixed(0)}%</span>
                  <b className={a.action === "SELL" ? "neg" : "pos"}>{a.action} {a.qty}주</b>
                </div>
              ))}
              <div className="rb-tax">리밸런싱 매도 예상 양도세 <b className="neg">{won(rebal.est_tax_krw)}원</b> · 밴드 내는 보유 권장</div>
            </>
          ) : (
            <>
              {Object.entries(rebal.current || {}).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([t, w]) => (
                <div className="hrow" key={t}>
                  <span className="ht">{t}</span>
                  <div className="hbar"><div style={{ width: `${Math.min(100, w * 100 * 3)}%` }} /></div>
                  <span className="hw">{(w * 100).toFixed(1)}%</span>
                </div>
              ))}
              <div className="rb-tax sub">상위 종목 집중도 확인용. 목표비중 설정 시 실행 가능한 리밸런싱(세금 포함) 제안이 표시됩니다.</div>
            </>
          )}
          <div className="rb-tax sub" style={{ marginTop: 8 }}>⚠ 투자자문이 아닙니다. 제안은 참고용이며, 최종 매매·실행은 본인이 판단합니다.</div>
        </section>
      )}

      {/* [§3-6 피드백13] 시계열·예측(ForecastChart) — 실제 평가액을 기점으로 시나리오 투영. 항상 '참고용·확정 아님' */}
      {s && s.value_krw > 0 && (() => {
        // 가정(투명 공개): 연 기대수익 μ · 변동성 σ. 확정 예측이 아닌 통계적 시나리오.
        const MU = 0.07, SIG = 0.16, MONTHS = 12;
        const V0 = s.value_krw;
        const hist = Array.isArray(report?.timeseries)
          ? report.timeseries.filter((p) => p && p.value > 0).slice(-12) : [];
        const hasHist = hist.length >= 2;
        // 투영: t개월 후 중립/낙관/비관 (선형 확산 콘)
        const proj = [];
        for (let t = 0; t <= MONTHS; t++) {
          const f = t / 12;
          proj.push({
            t,
            med: V0 * (1 + MU * f),
            up: V0 * (1 + (MU + SIG) * f),
            lo: V0 * (1 + (MU - SIG) * f),
          });
        }
        const W = 300, H = 132, PADL = 6, PADR = 6, PADT = 10, PADB = 18;
        const nHist = hasHist ? hist.length : 0;
        const totalPts = nHist + MONTHS; // 과거 점 + 미래 12
        const xAt = (i) => PADL + (i / totalPts) * (W - PADL - PADR);
        const allVals = [
          ...proj.map((p) => p.up), ...proj.map((p) => p.lo),
          ...(hasHist ? hist.map((h) => h.value) : [V0]),
        ];
        const vMin = Math.min(...allVals), vMax = Math.max(...allVals);
        const span = vMax - vMin || 1;
        const yAt = (v) => PADT + (1 - (v - vMin) / span) * (H - PADT - PADB);
        // 미래 x는 과거 마지막 점(=현재, index nHist) 이후로 이어짐
        const fx = (t) => xAt(nHist + t);
        const upPath = proj.map((p, i) => `${i ? "L" : "M"}${fx(p.t).toFixed(1)},${yAt(p.up).toFixed(1)}`).join("");
        const loPathRev = [...proj].reverse().map((p) => `L${fx(p.t).toFixed(1)},${yAt(p.lo).toFixed(1)}`).join("");
        const areaPath = `${upPath}${loPathRev}Z`;
        const medPath = proj.map((p, i) => `${i ? "L" : "M"}${fx(p.t).toFixed(1)},${yAt(p.med).toFixed(1)}`).join("");
        const histPath = hasHist
          ? hist.map((h, i) => `${i ? "L" : "M"}${xAt(i).toFixed(1)},${yAt(h.value).toFixed(1)}`).join("")
          : "";
        const nowX = xAt(nHist), nowY = yAt(V0);
        const end = proj[proj.length - 1];
        return (
          <section className="card">
            {/* [S7.4] 예측 기본 접기 — 접힘 시 한 줄 요약(중립 시나리오)만, 경고문은 배지 1개 */}
            <button className="fc-head" onClick={() => setFcOpen((v) => !v)} aria-expanded={fcOpen}>
              <span className="label" style={{ margin: 0 }}>시계열 · 예측 <span className="sub forecast-tag">참고 시나리오</span></span>
              <span className="fc-summary">중립 {won(end.med)}<span className="fc-caret">{fcOpen ? "▾" : "▸"}</span></span>
            </button>
            {fcOpen && (<>
            <svg className="fc-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="ETF 평가액 시나리오 투영">
              <path d={areaPath} className="fc-area" />
              {hasHist && <path d={histPath} className="fc-hist" />}
              <path d={medPath} className="fc-med" />
              <line x1={nowX} y1={PADT} x2={nowX} y2={H - PADB} className="fc-now" />
              <circle cx={nowX} cy={nowY} r="3.2" className="fc-dot" />
              <text x={nowX} y={H - 5} className="fc-xlbl" textAnchor={hasHist ? "middle" : "start"}>오늘</text>
              <text x={fx(MONTHS)} y={H - 5} className="fc-xlbl" textAnchor="end">+12개월</text>
            </svg>
            <div className="fc-legend">
              <span><i className="fc-lg med" /> 중립</span>
              <span><i className="fc-lg band" /> 낙관~비관 범위</span>
              {hasHist && <span><i className="fc-lg hist" /> 실제 평가액</span>}
            </div>
            <div className="fc-range">
              12개월 후 참고 범위 <b className="pos">{won(end.up)}</b> ~ <b className="neg">{won(end.lo)}</b>
              <span className="fc-mid"> · 중립 {won(end.med)}</span>
            </div>
            <div className="fc-assume">가정: 연 기대수익 <b>+{(MU * 100).toFixed(0)}%</b> · 변동성 <b>{(SIG * 100).toFixed(0)}%</b> (주식형 ETF 통상치). <b>확정 예측이 아닌 통계적 시나리오</b>이며 실제 수익은 시장 상황에 따라 달라집니다.{!hasHist && " 일별 평가액이 쌓이면 실제 추이선이 함께 표시됩니다."}</div>
            </>)}
          </section>
        );
      })()}

      {/* 4) 절세 (확정 계산) — 일반 계좌 기준 · 계좌 유형별 세제는 아래 '내 ETF' 버킷 참고 */}
      {tax && (
        <section className="card">
          <div className="label">세금 · 절세 <span className="sub">일반 계좌 · 확정 계산</span>
            <span className="tax-info" title="일반 계좌(해외상장 ETF) 기준 계산입니다. 연금·ISA 계좌는 세제가 다르므로 아래 '내 ETF' 계좌 버킷에서 확인하세요.">ⓘ</span>
          </div>
          <div className="tax-line"><span>전량 매도 시 양도세</span><b className="neg">{won(tax.tax_all)}원</b></div>
          <div className="tax-hint">
            순이익 {won(tax.net)}원 − 기본공제 250만 = 과세표준 {won(tax.base_all)}원 × 22%
          </div>
          <div className="tax-hint sub">
            손실종목({tax.losses?.map((l) => l.ticker).join("·") || "-"}) <span className="term" title="같은 과세연도 내 이익과 손실을 합산해 순이익에만 과세하는 것. 손실 종목을 함께 매도하면 과세표준이 줄어듭니다.">손익통산</span> 후. <span className="term" title="평가손실 종목을 연내 매도해 손실을 확정(실현)하고, 이익 실현은 다음 해로 미뤄 올해 과세표준을 낮추는 절세 기법.">손실수확</span>+이익이연 시 올해 0원 가능.
          </div>
          <div className="tax-disclaim">⚖️ {TAX_DISCLAIMER}</div>
        </section>
      )}

      {/* 5) 종목별 수익 분해 — 총투자액/총이익금 SummaryBar + 3열 정렬(시안) */}
      {positions.length > 0 && (
        <section className="card">
          <div className="label">종목별 수익 분해</div>
          {s && (
            <div className="ebd-sum">
              <div className="es-item"><span className="es-k">총 투자액</span><span className="es-v">{won(s.krw_cost)}</span></div>
              <div className="es-item"><span className="es-k">총 이익금</span><span className={`es-v ${sign(s.value_krw - s.krw_cost)}`}>{won(s.value_krw - s.krw_cost)}</span></div>
            </div>
          )}
          {[...positions].sort((a, b) => (b.total_pnl_pct ?? b.usd_pnl_pct ?? 0) - (a.total_pnl_pct ?? a.usd_pnl_pct ?? 0)).map((p) => {
            const invest = p.krw_cost ?? p.invested_krw ?? p.cost_krw ?? null;
            const profit = p.pnl_krw ?? p.profit_krw ?? (p.value_krw != null && invest != null ? p.value_krw - invest : null);
            const tot = p.total_pnl_pct ?? p.usd_pnl_pct;
            const live = posLive(p);
            const qtyFromBackend = p.qty ?? p.shares ?? p.quantity ?? null;
            const tkU = String(p.ticker).toUpperCase();
            return (
              <div className="epos" key={p.ticker}>
                <div className="erow">
                  <span className="eleft">
                    <span className="etk">{p.ticker}</span>
                    {invest != null && <span className="einv">{won(invest)}</span>}
                    {(() => { const q = quotes[p.ticker]; return q ? (
                      <span className="ecur">종가 {q.currency === "USD" ? "$" : ""}{q.price.toLocaleString()}{q.currency === "KRW" ? "원" : ""}{q.date ? ` · ${q.date.slice(5)}` : ""}</span>
                    ) : null; })()}
                  </span>
                  <span className="emid">
                    {p.mode === "full" ? (
                      <><span className="eself">{pct(p.etf_self_pct)}</span><span className="echa">환차 {pct(p.fx_pure_pct)}</span></>
                    ) : (
                      <span className="eself sub">USD only</span>
                    )}
                  </span>
                  <span className="eright">
                    <span className={`ett ${sign(tot)}`}>{pct(tot)}</span>
                    {profit != null && <span className={`eprofit ${sign(profit)}`}>{profit >= 0 ? "+" : ""}{won(profit)}</span>}
                  </span>
                </div>
                {/* [실시간 재계산] 수량(백엔드 제공 or 직접 입력) × 실측 종가 → 실시간 평가액 */}
                <div className="eqty">
                  <span className="eqty-lbl">수량</span>
                  {qtyFromBackend != null ? (
                    <span className="eqty-fixed">{qtyFromBackend}주</span>
                  ) : (
                    <input className="eqty-in" type="number" inputMode="decimal" placeholder="입력"
                      value={posQty[tkU] ?? ""} onChange={(e) => onQtyChange(p.ticker, e.target.value)} />
                  )}
                  {live.valueKrw != null ? (
                    <span className="eqty-live">⚡ 실시간 <b>{won(live.valueKrw)}원</b>{live.pnlPct != null && <em className={sign(live.pnlPct)}>{pct(live.pnlPct)}</em>}</span>
                  ) : (
                    <span className="eqty-hint">{quotes[p.ticker] ? "수량 입력 시 실측 평가" : "시세 조회 중"}</span>
                  )}
                </div>
              </div>
            );
          })}
          <div className="ebd-note">왼쪽은 투자액, 가운데는 자체수익(달러)·환차손익, 오른쪽은 원화 실질수익률과 이익금입니다. 수량을 입력하면 실측 종가로 <b>실시간 평가액</b>이 계산됩니다.</div>
        </section>
      )}

      {/* 6) 내 ETF — 직접 매수/매도 입력 + 자동 시세 갱신 */}
      <section className="card myetf">
        <div className="label">🧾 내 ETF · 직접 입력 <span className="sub">시세 자동 갱신</span>
          {myTotal > 0 && <span className="me-total">평가 {won(myTotal)}원</span>}
        </div>
        {/* [폼 일원화] 빠른입력과 동일한 공용 EtfForm 사용 */}
        <EtfForm onSaved={() => { const tr = getTrader(); const l = getHoldings(tr); setHoldings(l); refreshQuotes(l); }} />
        <EtfBulkImport onDone={() => { const tr = getTrader(); const l = getHoldings(tr); setHoldings(l); refreshQuotes(l); }} />
        {holdings.length > 0 ? (
          <div className="me-groups">
            {/* [S4·계좌 세분화] 계좌 유형별 그룹 — 세제가 다르므로 버킷별 평가·세제 안내 분리 · 상단 필터 반영 */}
            {(() => { const presentAccts = ACCOUNTS.filter((a) => (acctFilter === "전체" || acctFilter === a) && holdings.some((h) => (h.account || "일반") === a)); const firstPension = presentAccts.find(isPensionAcct); return presentAccts.map((acct) => {
              const rows = holdings.filter((h) => (h.account || "일반") === acct);
              const sub = rows.reduce((acc, h) => { const v = holdingMetrics(h).valueKrw; return acc + (v || 0); }, 0);
              return (
                <div className="me-grp" key={acct}>
                  <div className="me-grp-h">
                    <span className={`me-acct-badge ${isPensionAcct(acct) ? "pension" : acct === "ISA" ? "isa" : "normal"}`}>{acct}</span>
                    {sub > 0 && <span className="me-grp-sum">평가 {won(sub)}원</span>}
                  </div>
                  <div className="me-list">
                    {rows.map((h) => {
                      const m = holdingMetrics(h);
                      return (
                        <div className="me-row" key={h.id}>
                          <div className="me-l">
                            <span className="me-tk">{h.ticker}{h.broker ? <span className="me-broker">{h.broker}</span> : null}</span>
                            <span className="me-qty">{h.shares}주 · 평단 {h.avgCcy === "USD" ? "$" : ""}{h.avgPrice.toLocaleString()}{h.avgCcy === "KRW" ? "원" : ""}</span>
                          </div>
                          <div className="me-r">
                            <span className="me-px">{m.curPx != null ? `${m.curCcy === "USD" ? "$" : ""}${m.curPx.toLocaleString()}${m.curCcy === "KRW" ? "원" : ""}` : "시세 조회 중…"}</span>
                            <span className="me-sub2">
                              {m.valueKrw != null && <span className="me-val">{won(m.valueKrw)}원</span>}
                              {m.pnlPct != null && <span className={`me-pnl ${sign(m.pnlPct)}`}>{pct(m.pnlPct)}</span>}
                            </span>
                          </div>
                          <button className="me-del" onClick={() => delHolding(h.ticker, h.account)} aria-label={`${h.ticker} 삭제`}>✕</button>
                        </div>
                      );
                    })}
                  </div>
                  <div className="me-tax">{ACCT_TAX[acct]}</div>
                  {/* [계좌 세분화] 연금 세액공제 진행률 — 개인연금+IRP 합산(연 900만) 기준. 첫 연금 그룹에 1회만 표시 */}
                  {acct === firstPension && (() => {
                    const limit = pensionCreditLimitCombined();
                    const penRows = holdings.filter((h) => isPensionAcct(h.account || "일반"));
                    const acquired = penRows.reduce((a, h) => a + (h.avgCcy === "KRW" ? h.avgPrice * h.shares : (fxRate ? h.avgPrice * h.shares * fxRate : 0)), 0);
                    const contrib = pensionContrib !== "" ? Number(pensionContrib) : acquired;
                    const prog = Math.max(0, Math.min(1, contrib / limit));
                    const est = pensionContrib === ""; // 미입력 시 취득원가 기반 추정
                    return (
                      <div className="pen-credit">
                        <div className="pc-h">
                          <span className="pc-lbl">🎁 연금 세액공제 진행률 <span className="pc-scope">개인연금+IRP 합산</span></span>
                          <span className={`pc-tag ${est ? "est" : "fix"}`}>{est ? "추정" : "입력"}</span>
                          <span className="pc-pct">{Math.round(prog * 100)}%</span>
                        </div>
                        <div className="pc-bar"><div className="pc-fill" style={{ width: `${prog * 100}%` }} /></div>
                        <div className="pc-nums">납입 {won(contrib)}원 / 한도 {won(limit)}원 {prog >= 1 ? "· 한도 소진" : `· 여유 ${won(Math.max(0, limit - contrib))}원`}</div>
                        <div className="pc-in-wrap">
                          <span className="pc-in-lbl">올해 연금 납입액 직접 입력(원)</span>
                          <input className="pc-in" type="number" inputMode="numeric" placeholder={`${Math.round(acquired).toLocaleString()} (취득 추정)`}
                            value={pensionContrib} onChange={(e) => changePensionContrib(e.target.value)} />
                        </div>
                        <div className="pc-note">합산 한도(연 {won(limit)}원)는 개인연금+IRP <b>납입액 기준</b>이며 연금저축 단독 한도는 600만원입니다. 미입력 시 연금 계좌 취득원가로 <b>추정</b>합니다.</div>
                      </div>
                    );
                  })()}
                </div>
              );
            }); })()}
          </div>
        ) : (
          <div className="me-empty">보유 ETF를 추가하면 <b>현재가·평가액·손익</b>이 자동으로 갱신됩니다. 미국 ETF는 티커(<b>SCHD</b>), 국내는 숫자코드(<b>069500</b>)로 입력하세요.</div>
        )}
        <div className="me-foot">시세는 공개 소스(stooq)에서 5분 캐시로 자동 갱신 · USD는 오늘 환율({fxRate ? `${Math.round(fxRate).toLocaleString()}원` : "조회 중"})로 원화 환산 · 참고용</div>
      </section>

      <div className="foot">확정 계산(수익·세금·중복도)은 입력값 기반. 예측(Forecast)은 통계적 시나리오(참고용·확정 아님). · 세무자문 아님</div>

      <style jsx>{`
        .etf { max-width: 480px; margin: 0 auto; padding: 0 14px calc(env(safe-area-inset-bottom, 0px) + 24px); font-family: var(--font-sans); color: var(--color-ink); }
        .err { background: var(--color-danger-soft); color: var(--color-danger); padding: 10px 12px; border-radius: 10px; font-size: 0.82rem; margin-bottom: 12px; }
        .loading { color: var(--color-ink-2); padding: 24px; text-align: center; }
        .card { background: var(--color-card); border: 1px solid var(--color-line); border-radius: var(--radius-card); padding: 18px; margin-bottom: 14px; box-shadow: var(--shadow-card); }
        /* HERO */
        .hero { background: linear-gradient(135deg, var(--hero-grad-1), var(--hero-grad-2)); color: var(--hero-ink); border-radius: var(--radius-hero); padding: 20px 18px; box-shadow: var(--shadow-float); margin-bottom: 14px; }
        .hero .eyebrow { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 14px; }
        .hero .lbl { font-size: 12px; font-weight: 700; color: var(--hero-ink-sub); }
        .live { background: var(--color-success); color: #04351f; font-size: 9px; font-weight: 800; padding: 3px 7px; border-radius: 5px; letter-spacing: .5px; display: inline-flex; align-items: center; gap: 4px; }
        /* [실시간] 갱신 표기 · 새로고침 · 라이브 점멸 */
        .live-wrap { display: inline-flex; align-items: center; gap: 8px; }
        .fresh-ago { font-size: 10px; font-weight: 700; color: var(--hero-ink-sub); white-space: nowrap; }
        .refresh-btn { width: 24px; height: 24px; border-radius: 50%; border: 1px solid var(--hero-fill-line); background: var(--hero-fill); color: var(--hero-ink); font-size: 13px; line-height: 1; cursor: pointer; display: grid; place-items: center; font-family: var(--font-sans); }
        .refresh-btn.spin { animation: etf-spin .7s linear; }
        @keyframes etf-spin { from { transform: rotate(0); } to { transform: rotate(360deg); } }
        .live-dot { width: 5px; height: 5px; border-radius: 50%; background: currentColor; animation: etf-pulse 1.4s ease-in-out infinite; }
        @keyframes etf-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.25; } }
        .hero .big { font-size: 32px; font-weight: 800; letter-spacing: -.8px; line-height: 1; }
        .big-live { font-size: 11px; font-weight: 800; color: var(--color-success); background: color-mix(in srgb, var(--color-success) 20%, transparent); padding: 3px 8px; border-radius: 6px; margin-left: 9px; vertical-align: middle; letter-spacing: 0; }
        .hsub-note { color: var(--hero-ink-sub); font-weight: 500; }
        .hero .big span { font-size: 19px; font-weight: 700; }
        .date-flag { display: inline-block; margin-left: 7px; font-size: 10px; font-weight: 800; padding: 2px 7px; border-radius: 6px; letter-spacing: .2px; vertical-align: middle; }
        .date-flag.fresh { background: color-mix(in srgb, var(--color-success) 22%, transparent); color: var(--color-success); }
        .date-flag.stale { background: color-mix(in srgb, var(--color-warning) 22%, transparent); color: var(--color-warning); }
        .fx-note { display: inline-flex; align-items: center; gap: 6px; font-size: 11.5px; color: var(--hero-ink-soft); margin: -6px 0 4px; }
        .fx-note b { color: var(--hero-ink); font-weight: 700; }
        .fx-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--color-success); flex-shrink: 0; }
        .fx-note.stale { color: var(--color-warning); }
        .fx-note.stale .fx-dot { background: var(--color-warning); }
        .fx-note.stale b { color: var(--color-warning); }
        .hero .hsub { font-size: 12.5px; color: var(--hero-ink-soft); margin-top: 9px; }
        .hero .hsub b { color: var(--hero-accent); font-weight: 700; }
        .decomp-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; width: 100%; margin-top: 16px; padding: 11px 13px; background: var(--hero-fill); border: 1px solid var(--hero-fill-line); border-radius: 12px; color: var(--hero-ink); font-family: var(--font-sans); font-size: 13px; font-weight: 700; cursor: pointer; }
        .decomp-sum { font-size: 12px; font-weight: 600; color: var(--hero-ink-faint); }
        .decomp-sum b { color: var(--hero-ink); font-weight: 800; }
        .decomp-caret { display: inline-block; transition: transform .2s; }
        .decomp-caret.open { transform: rotate(180deg); }
        .decomp { background: var(--hero-fill); border: 1px solid var(--hero-fill-line); border-radius: 14px; padding: 14px; margin-top: 8px; }
        .drow { display: flex; align-items: center; justify-content: space-between; padding: 6px 0; }
        .drow .dk { font-size: 12.5px; color: var(--hero-ink-soft); font-weight: 500; }
        .drow .dv { font-size: 13px; font-weight: 700; color: var(--hero-accent); }
        .drow .dv.neg { color: var(--hero-danger); }
        .drow.total { border-top: 1px solid var(--hero-fill-line); margin-top: 6px; padding-top: 11px; }
        .drow.total .dk { color: var(--hero-ink); font-weight: 700; font-size: 13px; }
        .drow.total .dv { font-size: 16px; font-weight: 800; }
        .hero .foot-note { font-size: 11px; color: var(--hero-ink-faint); margin-top: 12px; line-height: 1.5; }
        .label { font-size: 0.9rem; font-weight: 700; color: var(--color-ink); margin-bottom: 12px; display: flex; align-items: center; }
        .label .sub, .sub { font-weight: 600; color: var(--color-ink-3); font-size: 0.68rem; margin-left: 6px; }
        /* [v10 UI §1] 초록=수익, 빨강=손실/비용 */
        .pos { color: var(--color-success); } .neg { color: var(--color-danger); }
        .score-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px 12px; }
        .sc { display: flex; flex-direction: column; gap: 3px; }
        .sc span { font-size: 0.72rem; color: var(--color-ink-3); font-weight: 600; } .sc b { font-size: 1rem; font-weight: 800; }
        .heat { display: flex; flex-direction: column; gap: 6px; }
        .hrow { display: flex; align-items: center; gap: 10px; margin-bottom: 5px; }
        .ht { width: 52px; font-size: 0.78rem; font-weight: 700; }
        .hbar { flex: 1; background: var(--color-line); border-radius: 6px; height: 9px; overflow: hidden; }
        .hbar div { height: 100%; background: var(--color-primary); border-radius: 6px; }
        .hw { width: 44px; text-align: right; font-size: 0.78rem; font-weight: 700; color: var(--color-ink-2); }
        .sectors { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 12px; }
        .chip { font-size: 0.72rem; font-weight: 700; background: var(--color-card-soft); color: var(--color-ink-2); padding: 6px 10px; border-radius: 9px; }
        .warn { margin-top: 10px; font-size: 0.74rem; color: var(--color-warning-ink); background: var(--color-warning-soft); padding: 7px 9px; border-radius: 8px; }
        .tax-line { display: flex; justify-content: space-between; align-items: baseline; font-size: 1.05rem; font-weight: 800; }
        .tax-line b { font-size: 1.3rem; }
        .tax-hint { font-size: 0.78rem; color: var(--color-ink-2); margin-top: 8px; line-height: 1.6; background: var(--color-card-soft); border-radius: 12px; padding: 12px 14px; }
        .tax-hint.sub { background: var(--color-success-soft); color: var(--color-success-ink); font-weight: 600; }
        /* per-ETF SummaryBar + aligned rows */
        .ebd-sum { display: flex; background: var(--color-card-soft); border-radius: 12px; padding: 14px 16px; margin-bottom: 8px; }
        .es-item { flex: 1; display: flex; flex-direction: column; gap: 5px; }
        .es-item + .es-item { border-left: 1px solid var(--color-line); padding-left: 16px; }
        .es-k { font-size: 0.72rem; color: var(--color-ink-3); font-weight: 600; }
        .es-v { font-size: 1.05rem; font-weight: 800; color: var(--color-ink); }
        .es-v.pos { color: var(--color-success); } .es-v.neg { color: var(--color-danger); }
        .erow { display: grid; grid-template-columns: 1fr 84px 92px; align-items: center; gap: 6px; padding: 12px 0; border-top: 1px solid var(--color-line); }
        .erow:first-of-type { border-top: none; }
        .eleft { display: flex; flex-direction: column; gap: 3px; }
        .eleft .etk { font-size: 0.9rem; font-weight: 800; }
        .eleft .einv { font-size: 0.68rem; color: var(--color-ink-3); font-weight: 500; }
        .eleft .ecur { font-size: 0.66rem; color: var(--color-success); font-weight: 700; font-family: ui-monospace, monospace; }
        /* [실시간 평가] 히어로 라인 + 포지션 수량 입력 */
        .live-total { margin-top: 8px; font-size: 0.82rem; color: var(--hero-ink); font-weight: 700; }
        .live-total b { color: var(--hero-accent); font-weight: 800; }
        .live-total .lt-note { font-size: 0.66rem; color: var(--hero-ink-sub); font-weight: 500; }
        .epos { border-bottom: 1px solid var(--color-line); padding-bottom: 8px; margin-bottom: 8px; }
        .epos:last-of-type { border-bottom: none; padding-bottom: 0; margin-bottom: 0; }
        .eqty { display: flex; align-items: center; gap: 8px; margin-top: 6px; flex-wrap: wrap; }
        .eqty-lbl { font-size: 0.66rem; color: var(--color-ink-3); font-weight: 700; }
        .eqty-fixed { font-size: 0.72rem; font-weight: 700; color: var(--color-ink); }
        .eqty-in { width: 74px; border: 1px solid var(--color-line); background: var(--color-bg); border-radius: 8px; padding: 5px 8px; font-size: 0.76rem; color: var(--color-ink); font-family: var(--font-sans); }
        .eqty-in:focus { outline: none; border-color: var(--color-primary); }
        .eqty-live { font-size: 0.72rem; color: var(--color-ink-2); font-weight: 600; display: inline-flex; align-items: center; gap: 6px; }
        .eqty-live b { color: var(--color-ink); font-weight: 800; }
        .eqty-live em { font-style: normal; font-weight: 800; font-family: ui-monospace, monospace; }
        .eqty-live em.pos { color: var(--color-success); } .eqty-live em.neg { color: var(--color-danger); }
        .eqty-hint { font-size: 0.66rem; color: var(--color-ink-3); }
        .emid { display: flex; flex-direction: column; gap: 3px; text-align: right; }
        .emid .eself { font-size: 0.74rem; color: var(--color-ink-2); font-weight: 600; }
        .emid .eself.sub { color: var(--color-ink-3); }
        .emid .echa { font-size: 0.66rem; color: var(--color-ink-3); font-weight: 500; }
        .eright { display: flex; flex-direction: column; gap: 3px; text-align: right; }
        .eright .ett { font-size: 0.9rem; font-weight: 800; }
        .eright .ett.pos { color: var(--color-success); } .eright .ett.neg { color: var(--color-danger); }
        .eright .eprofit { font-size: 0.72rem; font-weight: 700; }
        .eright .eprofit.pos { color: var(--color-success); } .eright .eprofit.neg { color: var(--color-danger); }
        .ebd-note { font-size: 0.66rem; color: var(--color-ink-3); line-height: 1.55; margin-top: 13px; padding-top: 12px; border-top: 1px solid var(--color-line); }
        .rb { display: flex; align-items: center; gap: 8px; padding: 6px 0; border-bottom: 1px solid var(--color-line); font-size: 0.84rem; }
        .rb .rt { width: 56px; font-weight: 700; font-family: ui-monospace, monospace; }
        .rb .rw { flex: 1; color: var(--color-ink-2); font-size: 0.74rem; }
        .rb-tax { font-size: 0.72rem; color: var(--color-ink-2); margin-top: 10px; background: var(--color-card-soft); padding: 7px 9px; border-radius: 8px; }
        /* [§3-6] #1 결론 VerdictCard */
        .etf-verdict { background: var(--color-card); border: 1px solid var(--color-line); border-left: 4px solid var(--color-primary); border-radius: var(--radius-card); box-shadow: var(--shadow-card); padding: 15px 17px; margin-bottom: 14px; }
        .ev-lead { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
        .ev-lbl { font-size: 0.74rem; font-weight: 700; color: var(--color-ink-2); }
        .ev-metric { font-size: 1.05rem; font-weight: 800; }
        .ev-metric.pos { color: var(--color-success); } .ev-metric.neg { color: var(--color-danger); }
        .ev-decomp { font-size: 0.8rem; color: var(--color-ink-2); margin-top: 6px; }
        .ev-decomp b { color: var(--color-ink); font-weight: 700; }
        .ev-risk { font-size: 0.8rem; color: var(--color-warning-ink); background: var(--color-warning-soft); border-radius: 10px; padding: 9px 12px; margin-top: 11px; line-height: 1.45; word-break: keep-all; }
        /* [§3-6] 리밸런싱 왜(조정 이유) */
        .rb-why { background: var(--color-card-soft); border-radius: 12px; padding: 12px 13px; margin-bottom: 12px; }
        .rb-why-h { font-size: 0.74rem; font-weight: 800; color: var(--color-ink-2); margin-bottom: 8px; }
        .rb-why-row { display: flex; gap: 9px; align-items: flex-start; padding: 4px 0; }
        .rb-why-n { flex-shrink: 0; width: 18px; height: 18px; border-radius: 6px; background: var(--color-primary-soft); color: var(--color-primary); font-size: 0.68rem; font-weight: 800; display: grid; place-items: center; margin-top: 1px; }
        .rb-why-t { font-size: 0.78rem; color: var(--color-ink); line-height: 1.5; word-break: keep-all; }
        /* [§3-6] ForecastChart 참고용 */
        .forecast-tag { color: var(--color-warning-ink) !important; background: var(--color-warning-soft); padding: 2px 8px; border-radius: 6px; font-size: 10px; font-weight: 800; }
        /* [S7.4] 예측 접기 헤더 */
        .fc-head { width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 10px; background: none; border: none; padding: 0; cursor: pointer; font-family: var(--font-sans); }
        .fc-summary { font-size: 0.82rem; font-weight: 800; color: var(--color-ink-2); display: inline-flex; align-items: center; gap: 8px; white-space: nowrap; }
        .fc-caret { color: var(--color-ink-3); font-size: 0.8rem; }
        .forecast-empty { text-align: center; padding: 18px 10px; }
        .fe-ic { font-size: 1.5rem; margin-bottom: 6px; }
        .fe-t { font-size: 0.86rem; font-weight: 700; color: var(--color-ink); }
        .fe-s { font-size: 0.74rem; color: var(--color-ink-2); margin-top: 6px; line-height: 1.55; word-break: keep-all; }
        .fe-s b { color: var(--color-ink); font-weight: 700; }
        /* [#13] 시나리오 투영 차트 */
        .fc-svg { width: 100%; height: 132px; display: block; margin: 4px 0 2px; overflow: visible; }
        .fc-area { fill: var(--color-primary-soft); opacity: 0.55; stroke: none; }
        .fc-med { fill: none; stroke: var(--color-primary); stroke-width: 2; stroke-dasharray: 5 3; }
        .fc-hist { fill: none; stroke: var(--color-ink); stroke-width: 2; }
        .fc-now { stroke: var(--color-ink-3); stroke-width: 1; stroke-dasharray: 2 2; }
        .fc-dot { fill: var(--color-primary); stroke: var(--color-card); stroke-width: 1.5; }
        .fc-xlbl { fill: var(--color-ink-3); font-size: 9px; font-weight: 700; }
        .fc-legend { display: flex; gap: 14px; flex-wrap: wrap; font-size: 0.7rem; color: var(--color-ink-2); margin-top: 4px; }
        .fc-legend span { display: inline-flex; align-items: center; gap: 5px; }
        .fc-lg { width: 14px; height: 3px; border-radius: 2px; display: inline-block; }
        .fc-lg.med { background: var(--color-primary); } .fc-lg.hist { background: var(--color-ink); }
        .fc-lg.band { background: var(--color-primary-soft); height: 9px; border-radius: 2px; }
        .fc-range { font-size: 0.82rem; color: var(--color-ink-2); margin-top: 11px; padding-top: 10px; border-top: 1px solid var(--color-line); word-break: keep-all; }
        .fc-range b.pos { color: var(--color-success); } .fc-range b.neg { color: var(--color-danger); }
        .fc-mid { color: var(--color-ink-3); font-size: 0.76rem; }
        .fc-assume { font-size: 0.7rem; color: var(--color-ink-3); margin-top: 8px; line-height: 1.55; word-break: keep-all; }
        .fc-assume b { color: var(--color-ink-2); font-weight: 700; }
        .sample-badge { font-size: 10px; font-weight: 800; color: var(--color-warning-ink); background: var(--color-warning-soft); padding: 3px 8px; border-radius: 6px; margin-left: auto; }
        /* [내 ETF] 직접 입력 + 자동 시세 */
        .myetf .me-total { float: right; font-size: 0.72rem; font-weight: 800; color: var(--color-primary); }
        .me-toggle { display: flex; gap: 4px; background: var(--color-card-soft); border-radius: 10px; padding: 3px; margin-bottom: 10px; }
        .me-toggle button { flex: 1; border: none; background: none; padding: 8px 0; border-radius: 8px; font-family: var(--font-sans); font-size: 0.82rem; font-weight: 700; color: var(--color-ink-2); cursor: pointer; }
        .me-toggle button.on.buy { background: var(--color-primary); color: #fff; }
        .me-toggle button.on.sell { background: var(--color-danger); color: #fff; }
        /* [E1] 국내/해외 구분 세그먼트 */
        .me-mkt { display: flex; gap: 4px; background: var(--color-card-soft); border-radius: 10px; padding: 3px; margin-bottom: 8px; }
        .me-mkt button { flex: 1; border: none; background: none; padding: 7px 0; border-radius: 8px; font-family: var(--font-sans); font-size: 0.78rem; font-weight: 700; color: var(--color-ink-2); cursor: pointer; }
        .me-mkt button.on { background: var(--color-primary); color: #fff; }
        .me-form { display: flex; gap: 6px; flex-wrap: wrap; }
        .me-in { flex: 1 1 70px; min-width: 0; border: 1px solid var(--color-line); background: var(--color-bg); border-radius: 9px; padding: 9px 10px; font-size: 0.84rem; font-family: var(--font-sans); color: var(--color-ink); }
        .me-in.tk { flex: 2 1 120px; text-transform: uppercase; }
        .me-in.ccy { flex: 0 0 68px; }
        .me-in.acct { flex: 0 0 92px; }
        .me-in:focus { outline: none; border-color: var(--color-primary); }
        /* [S4] 계좌 유형 그룹 */
        .me-groups { margin-top: 14px; display: flex; flex-direction: column; gap: 14px; }
        .me-grp-h { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
        .me-acct-badge { font-size: 0.72rem; font-weight: 800; padding: 3px 11px; border-radius: 999px; }
        .me-acct-badge.normal { background: var(--color-card-soft); color: var(--color-ink-2); }
        .me-acct-badge.pension { background: var(--color-success-soft); color: var(--color-success-ink, var(--color-success)); }
        .me-acct-badge.isa { background: var(--color-primary-soft); color: var(--color-primary); }
        .me-grp-sum { font-size: 0.74rem; font-weight: 700; color: var(--color-ink-2); }
        .me-tax { margin-top: 8px; font-size: 0.68rem; color: var(--color-ink-2); background: var(--color-card-soft); border-radius: 9px; padding: 8px 11px; line-height: 1.5; word-break: keep-all; }
        .me-submit { width: 100%; margin-top: 8px; border: none; border-radius: 10px; padding: 11px 0; font-size: 0.88rem; font-weight: 800; color: #fff; cursor: pointer; font-family: var(--font-sans); }
        .me-submit.buy { background: var(--color-primary); } .me-submit.sell { background: var(--color-danger); }
        .me-msg { font-size: 0.76rem; font-weight: 600; color: var(--color-ink-2); margin-top: 8px; text-align: center; }
        .me-list { margin-top: 14px; display: flex; flex-direction: column; gap: 8px; }
        .me-row { display: flex; align-items: center; gap: 8px; padding: 10px 12px; background: var(--color-card-soft); border-radius: 11px; }
        .me-l { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
        .me-tk { font-size: 0.9rem; font-weight: 800; color: var(--color-ink); display: inline-flex; align-items: center; gap: 6px; }
        .me-broker { font-size: 0.6rem; font-weight: 700; color: var(--color-ink-2); background: var(--color-card-soft); border: 1px solid var(--color-line); border-radius: 999px; padding: 1px 7px; }
        .me-qty { font-size: 0.68rem; color: var(--color-ink-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .me-r { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; flex-shrink: 0; }
        .me-px { font-size: 0.82rem; font-weight: 700; color: var(--color-ink); font-family: ui-monospace, monospace; }
        .me-sub2 { display: flex; align-items: center; gap: 8px; }
        .me-val { font-size: 0.7rem; color: var(--color-ink-2); font-family: ui-monospace, monospace; }
        .me-pnl { font-size: 0.76rem; font-weight: 800; font-family: ui-monospace, monospace; }
        .me-pnl.pos { color: var(--color-success); } .me-pnl.neg { color: var(--color-danger); }
        .me-del { flex-shrink: 0; width: 24px; height: 24px; border: none; background: var(--color-card); border-radius: 7px; color: var(--color-ink-3); font-size: 0.8rem; cursor: pointer; }
        .me-empty { margin-top: 12px; font-size: 0.74rem; color: var(--color-ink-2); line-height: 1.6; background: var(--color-card-soft); border-radius: 11px; padding: 12px 14px; word-break: keep-all; }
        .me-empty b { color: var(--color-ink); font-weight: 700; }
        .me-foot { font-size: 0.64rem; color: var(--color-ink-3); margin-top: 12px; line-height: 1.5; word-break: keep-all; }
        .foot { font-size: 0.68rem; color: var(--color-ink-3); text-align: center; margin-top: 16px; line-height: 1.5; }
        /* [S4] 계좌 유형 필터 칩 */
        .acct-filter { display: flex; gap: 6px; margin-bottom: 14px; overflow-x: auto; -webkit-overflow-scrolling: touch; }
        .acct-chip { flex: 0 0 auto; display: inline-flex; align-items: center; gap: 5px; border: 1px solid var(--color-line); background: var(--color-card); color: var(--color-ink-2); border-radius: 999px; padding: 7px 14px; font-size: 0.78rem; font-weight: 700; font-family: var(--font-sans); cursor: pointer; }
        .acct-chip.on { background: var(--color-primary); border-color: var(--color-primary); color: #fff; }
        .acct-chip.on.pension { background: var(--color-success); border-color: var(--color-success); }
        .acct-chip.on.isa { background: var(--color-primary); border-color: var(--color-primary); }
        .acct-chip-n { font-size: 0.66rem; font-weight: 800; background: var(--color-card-soft); color: var(--color-ink-2); border-radius: 999px; padding: 1px 6px; }
        .acct-chip.on .acct-chip-n { background: rgba(255,255,255,0.25); color: #fff; }
        /* [E2·E3] 해야 할 일 · 리밸런싱 카드 */
        .todo-card { border-left: 4px solid var(--color-primary); }
        .todo-list { display: flex; flex-direction: column; gap: 8px; margin-top: 4px; }
        .todo-item { display: flex; gap: 10px; align-items: flex-start; background: var(--color-card-soft); border-radius: 12px; padding: 11px 12px; border-left: 3px solid var(--color-line); }
        .todo-item.warn { border-left-color: var(--color-warning); background: var(--color-warning-soft); }
        .todo-item.info { border-left-color: var(--color-primary); }
        .todo-item.good { border-left-color: var(--color-success); background: var(--color-success-soft); }
        .todo-ic { font-size: 1.05rem; line-height: 1.3; flex-shrink: 0; }
        .todo-body { flex: 1; min-width: 0; }
        .todo-t { font-size: 0.85rem; font-weight: 800; color: var(--color-ink); display: flex; align-items: center; gap: 7px; flex-wrap: wrap; }
        .todo-acct { font-size: 0.62rem; font-weight: 800; padding: 1px 8px; border-radius: 999px; }
        .todo-acct.all { background: var(--color-card); color: var(--color-ink-2); border: 1px solid var(--color-line); }
        .todo-acct.normal { background: var(--color-card); color: var(--color-ink-2); border: 1px solid var(--color-line); }
        .todo-acct.pension { background: var(--color-success-soft); color: var(--color-success); }
        .todo-acct.isa { background: var(--color-primary-soft); color: var(--color-primary); }
        .todo-d { font-size: 0.75rem; color: var(--color-ink-2); line-height: 1.5; margin-top: 3px; word-break: keep-all; }
        .todo-none { font-size: 0.82rem; color: var(--color-ink-2); background: var(--color-success-soft); border-radius: 12px; padding: 13px 14px; line-height: 1.5; word-break: keep-all; }
        .todo-foot { font-size: 0.66rem; color: var(--color-ink-3); margin-top: 10px; line-height: 1.5; word-break: keep-all; }
        /* [S4] 세법 툴팁/면책 */
        .tax-info { margin-left: auto; font-size: 0.8rem; color: var(--color-ink-3); cursor: help; font-weight: 600; }
        .term { border-bottom: 1px dotted var(--color-ink-3); cursor: help; }
        .term.light { border-bottom-color: var(--hero-ink-faint); color: var(--hero-ink-soft); }
        .tax-disclaim { font-size: 0.66rem; color: var(--color-ink-3); margin-top: 10px; line-height: 1.5; word-break: keep-all; padding-top: 9px; border-top: 1px solid var(--color-line); }
        /* [S4] 연금 세액공제 진행률 */
        .pen-credit { margin-top: 10px; background: var(--color-success-soft); border-radius: 11px; padding: 12px 13px; }
        .pc-h { display: flex; align-items: center; gap: 8px; }
        .pc-lbl { font-size: 0.76rem; font-weight: 800; color: var(--color-success-ink, var(--color-success)); }
        .pc-scope { font-size: 0.62rem; font-weight: 700; color: var(--color-ink-3); margin-left: 4px; }
        .pc-tag { font-size: 0.6rem; font-weight: 800; padding: 2px 6px; border-radius: 5px; }
        .pc-tag.est { background: var(--color-warning-soft); color: var(--color-warning-ink); }
        .pc-tag.fix { background: var(--color-card); color: var(--color-success-ink, var(--color-success)); }
        .pc-pct { margin-left: auto; font-size: 0.9rem; font-weight: 800; color: var(--color-success-ink, var(--color-success)); }
        .pc-bar { height: 8px; background: var(--color-card); border-radius: 999px; overflow: hidden; margin: 8px 0 6px; }
        .pc-fill { height: 100%; background: var(--color-success); border-radius: 999px; }
        .pc-nums { font-size: 0.7rem; color: var(--color-ink-2); font-weight: 600; }
        .pc-in-wrap { display: flex; align-items: center; gap: 8px; margin-top: 9px; }
        .pc-in-lbl { font-size: 0.66rem; color: var(--color-ink-3); font-weight: 700; flex-shrink: 0; }
        .pc-in { flex: 1; min-width: 0; border: 1px solid var(--color-line); background: var(--color-bg); border-radius: 8px; padding: 6px 9px; font-size: 0.76rem; color: var(--color-ink); font-family: var(--font-sans); }
        .pc-in:focus { outline: none; border-color: var(--color-success); }
        .pc-note { font-size: 0.64rem; color: var(--color-ink-3); margin-top: 8px; line-height: 1.5; word-break: keep-all; }
        .pc-note b { color: var(--color-ink-2); font-weight: 700; }
      `}</style>
      <style jsx global>{`body { background: var(--color-bg); margin: 0; }`}</style>
    </div>
  );
}
