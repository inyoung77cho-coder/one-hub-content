// ONE-HUB v10 — ETF / Asset Intelligence 대시보드 (P7, 작업지시서 §11.2)
// 독립 라우트. 확정값(수익3단분해·세금·중복도)은 진한색/실선. 예측(Forecast)은 시나리오 투영(참고용·확정 아님).
// ★ 단일 점수 블랙박스 금지 — Portfolio Score는 구성요소를 펼쳐 보여준다(§11.2).
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/router";
import BottomNav from "../../components/BottomNav";
import AppHeader from "../../components/AppHeader";
import AssetMapTitle from "../../components/AssetMapTitle";
import EtfDataStatus from "../../components/EtfDataStatus";
import { getTrader } from "../../lib/trader";
import { getHoldings, buyEtf, sellEtf, removeEtf, inferMarket, getPosQtyMap, setPosQty, ACCOUNTS, getOtherAssets, addOtherAsset, removeOtherAsset, updateOtherAsset, sellOtherAsset, OTHER_KINDS, saneEtfAvg } from "../../lib/etfHoldings";
import AvgPriceWarningCard from "../../components/shared/AvgPriceWarningCard"; // [S22-1] 이상 평단 확인 카드(주식·ETF 공용)
import useSwipeTabs from "../../components/shared/useSwipeTabs"; // [S25-5] 보유↔추천 스와이프
import { ensureDailySnapshot } from "../../lib/dailySnapshot"; // [S22-3] 총자산 곡선 적립 backstop
import { taxFocusOf, isTaxSeason, currentMonth } from "../../lib/taxCalendar"; // [S22-8] ETF 세금 달력(평시 접힘)
import { classifyEtf } from "../../lib/etfClassify";
import { useTabState } from "../../lib/pwa/useTabState";
import EtfAllocationPie from "../../components/EtfAllocationPie";
import { recommendEtfs } from "../../lib/etfRecommend";
import { acctTaxNote, TAX_DISCLAIMER, pensionCreditLimit, pensionCreditProgress, pensionCreditLimitCombined, acctRule } from "../../lib/taxRules";
import Term from "../../components/Term";
import REBAL_PRESETS from "../../data/rebalance_presets.json";

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
// [S4] 계좌 필터 칩. [사용자 지시] "전체"는 "일반"과 혼동돼 삭제 — 기본값은 "일반".
const ACCT_FILTERS = [...ACCOUNTS];

// [S18] 해외 보유 판정 — 시장(market) 기준. 통화(avgCcy)로 가르면 안 된다.
//   해외 ETF 를 원화로 매수 기록하면 avgCcy 가 KRW 라 국내로 잡혔다(실측 버그).
//   통화는 "어떻게 샀나", 시장은 "무엇을 샀나" — 다른 축이다.
//   market 이 없는 옛 기록은 티커로 추론한다(inferMarket: 숫자=kr, 그 외=us).
const isOverseasHolding = (h) => (h?.market === "us") || (h?.market !== "kr" && inferMarket(h?.ticker) === "us");

// [2026-08-23] 다음 매수 계좌 추천 — etf_master의 tax_type(실측 3종: KR_DOMESTIC/
// KR_LISTED_OVERSEAS/US_CAPGAIN) 으로 어느 계좌가 유리한지 순위+이유를 낸다.
// 숫자는 전부 data/tax_rules.json에서 읽는다(하드코딩 금지 — 이 파일 기존 원칙과 동일).
// ★해외 현지상장 ETF(US_CAPGAIN)는 연금계좌에 법적으로 담을 수 없다 — 추천에서 제외.
// 소수점 세율이 반올림으로 뭉개지지 않게(9.9%→"10%" 오류 방지) 정수면 그대로, 아니면 1자리.
const pctFmt = (frac) => { const v = frac * 100; return Number.isInteger(v) ? String(v) : v.toFixed(1); };
function recommendAccounts(taxType, market) {
  const gen = acctRule("일반"), isa = acctRule("ISA"), pen = acctRule("연금");
  const genOverseasPct = pctFmt(gen.overseas_capital_gains_rate);
  const genDividendPct = pctFmt(gen.domestic_etf_dividend_rate);
  const isaExcessPct = pctFmt(isa.excess_separate_rate);
  const isaLimit = won(isa.tax_free_limit_won);

  if (taxType === "US_CAPGAIN" || (market === "us" && !taxType)) {
    return [
      { account: "ISA", tone: "good", reason: `해외 현지상장 ETF는 연금계좌엔 법적으로 담을 수 없습니다. ISA(중개형)라면 순이익 ${isaLimit}원까지 비과세 + 초과분 ${isaExcessPct}% 분리과세로, 일반계좌 양도세 ${genOverseasPct}%보다 유리합니다.` },
      { account: "일반", tone: "info", reason: `ISA 한도를 넘거나 중개형이 아니라면 일반계좌뿐입니다 — 양도세 ${genOverseasPct}%(기본공제 ${won(gen.overseas_basic_deduction_won)}원), 배당은 15% 원천징수 후 종합과세 대상입니다.` },
    ];
  }
  if (taxType === "KR_LISTED_OVERSEAS") {
    return [
      { account: "개인연금", tone: "good", reason: `매매차익·분배금 모두 배당소득세 ${genDividendPct}% 대상인 상품입니다. 연금계좌 안에서는 매도해도 과세이연되고, 인출 시에만 저율(${(pen.pension_income_rate_min * 100).toFixed(1)}~${(pen.pension_income_rate_max * 100).toFixed(1)}%)로 과세됩니다.` },
      { account: "퇴직연금", tone: "good", reason: "개인연금과 같은 원리로 유리합니다 — 세액공제 한도는 개인연금과 합산(연 900만원)됩니다." },
      { account: "ISA", tone: "good", reason: `순이익 ${isaLimit}원까지 비과세 + 초과분 ${isaExcessPct}% — 일반계좌 ${genDividendPct}%보다 유리합니다.` },
      { account: "일반", tone: "info", reason: `세제계좌 한도를 다 썼다면 일반계좌도 가능하지만, 매년 배당소득세 ${genDividendPct}%가 발생합니다.` },
    ];
  }
  if (taxType === "KR_DOMESTIC") {
    return [
      { account: "일반", tone: "info", reason: "국내주식형 ETF는 일반계좌에서도 매매차익이 비과세입니다. 분배금(배당)만 배당소득세가 붙으므로, 세제계좌로 옮겨도 차이가 크지 않습니다." },
      { account: "ISA", tone: "info", reason: `그래도 분배금까지 아끼고 싶다면 ISA(초과분 ${isaExcessPct}% 저율) 또는 연금(과세이연)도 검토할 수 있습니다.` },
    ];
  }
  return [{ account: "일반", tone: "info", reason: `이 종목의 세제 분류 정보가 없어 구체적 추천이 어렵습니다 — 일반적으로 해외 개별주는 양도세 ${genOverseasPct}%(기본공제 ${won(gen.overseas_basic_deduction_won)}원) 대상입니다.` }];
}

// [2026-08-23] 이름으로 티커 검색 — "TIGER 미국S&P500"·"삼성전자" 같은 이름을 몰라도
// 티커를 몰라도 입력할 수 있게 한다. 기존에 있었지만 아무 화면에도 안 붙어있던
// /api/input/etf-search(국내상장 ETF·펀드, etf_master)와 /api/input/master-search
// (국내 개별주, stock_master)를 그대로 재사용 — 새 백엔드 없이 프론트만 붙인다.
function TickerSearchBox({ value, placeholder, onChange, onSelect }) {
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const q = String(value || "").trim();
    if (q.length < 1) { setResults([]); return; }
    let alive = true;
    const t = setTimeout(() => {
      Promise.all([
        fetch(`/api/input/etf-search?q=${encodeURIComponent(q)}`).then((r) => r.json()).catch(() => null),
        fetch(`/api/input/master-search?q=${encodeURIComponent(q)}`).then((r) => r.json()).catch(() => null),
      ]).then(([etfRes, stockRes]) => {
        if (!alive) return;
        // [2026-08-23] tax_type(etf_master 분류: KR_DOMESTIC/KR_LISTED_OVERSEAS/US_CAPGAIN)도
        // 같이 들고 나온다 — 아래 "다음 매수 계좌 추천"이 이 값으로 세제를 판단한다.
        const etfItems = (etfRes?.results || []).map((r) => ({ ticker: r.ticker, name: r.name, market: r.market === "KR" ? "kr" : "us", kind: "ETF", taxType: r.tax_type || null }));
        const stockItems = (stockRes?.results || []).map((r) => ({ ticker: r.ticker, name: r.name, market: "kr", kind: "주식", taxType: null }));
        setResults([...etfItems, ...stockItems].slice(0, 10));
      }).catch(() => {});
    }, 250);
    return () => { alive = false; clearTimeout(t); };
  }, [value]);
  return (
    <div className="tk-search">
      <input className="bulk-in bulk-tk" placeholder={placeholder} value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)} />
      {open && results.length > 0 && (
        <div className="tk-dropdown">
          {results.map((r, i) => (
            <button type="button" key={`${r.kind}-${r.ticker}-${i}`} className="tk-opt"
              onMouseDown={() => { onSelect(r); setOpen(false); }}>
              <span className="tk-opt-tk">{r.ticker}</span>
              <span className="tk-opt-nm" title={r.name}>{r.name}</span>
              <span className="tk-opt-kind">{r.kind}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

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
  const [otherAssets, setOtherAssets] = useState([]); // [2026-08-23] 티커 없는 펀드·디폴트옵션 등
  const [nbTicker, setNbTicker] = useState(""); // [2026-08-23] 다음 매수 계좌 추천 — 검색 입력값
  const [nbSel, setNbSel] = useState(null); // 검색에서 고른 종목(ticker/name/market/taxType)
  const [quotes, setQuotes] = useState({}); // { TICKER: {price, currency, date} }
  const [form, setForm] = useState({ side: "buy", ticker: "", shares: "", price: "", ccy: "USD", account: "일반", market: "auto" });
  const [formMsg, setFormMsg] = useState("");
  const [editingHolding, setEditingHolding] = useState(null); // [사용자 지시] 수정 클릭 시에만 인라인 폼 노출
  // [2026-08-23] 증권사 계좌내역(.xls=HTML) 파일로 일괄 입력 — 미래에셋 등 "계좌별잔고" 내보내기 형식.
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkRows, setBulkRows] = useState([]); // [{id,name,ticker,account,shares,avgPrice,ccy,market,skip}]
  const [bulkMsg, setBulkMsg] = useState("");
  // [양도세 올해 실현 누계] 브로커 매도내역 기준 실현 양도차익 기록(클라 원장) — 연 250만 공제 추적.
  const [realized, setRealized] = useState([]); // [{id, ticker, gainKrw, date}]
  const [addReal, setAddReal] = useState(false);
  const [rTicker, setRTicker] = useState(""); const [rGain, setRGain] = useState(""); const [rDate, setRDate] = useState("");
  useEffect(() => { try { const v = JSON.parse(localStorage.getItem("onehub_etf_realized") || "[]"); if (Array.isArray(v)) setRealized(v); } catch (e) {} }, []);
  const saveRealized = (list) => { setRealized(list); try { localStorage.setItem("onehub_etf_realized", JSON.stringify(list)); } catch (e) {} };
  const addRealized = () => {
    const t = String(rTicker || "").trim().toUpperCase();
    const g = Math.round(Number(rGain) * 10000); // 입력은 만원 → 원
    const d = rDate || new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
    if (!t || !Number.isFinite(g) || g === 0) return;
    saveRealized([...realized, { id: Date.now(), ticker: t, gainKrw: g, date: d }]);
    setRTicker(""); setRGain(""); setRDate(""); setAddReal(false);
  };
  const delRealized = (id) => saveRealized(realized.filter((r) => r.id !== id));
  const [posQty, setPosQtyState] = useState({}); // [등록 ETF] 티커별 사용자 입력 수량(백엔드 미제공 보완)
  const [quotesAt, setQuotesAt] = useState(null); // [실시간] 마지막 시세 갱신 시각(ms)
  const [nowTick, setNowTick] = useState(0);      // [실시간] 상대시간 표시용 1초 틱
  const [refreshing, setRefreshing] = useState(false); // [실시간] 수동 새로고침 진행중
  const [acctFilter, setAcctFilter] = useState("일반"); // [S4] 계좌 유형 필터([일반][개인연금][퇴직연금][ISA])
  const [detailOpen, setDetailOpen] = useState(false); // [D4] 종목별 수익 분해 접기(페이지 길이 축약)
  const [fcOpen, setFcOpen] = useState(false); // [S7.4] 예측 섹션 기본 접기
  const [pensionContrib, setPensionContrib] = useState(""); // [S4] 올해 연금 납입액(원, 세액공제 진행률)
  const [targetAlloc, setTargetAlloc] = useState(null); // [E-4] 목표 배분(onehub_target_alloc)
  const [decompOpen, setDecompOpen] = useState(false); // [E-1] Tier3 수익 분해 접힘(기본)
  const toggleDecomp = () => { const n = !decompOpen; setDecompOpen(n); try { localStorage.setItem("onehub_etf_decomp", n ? "1" : "0"); } catch {} };
  // [ETF 재구성 Phase1] 보유 | 추천 상위 탭(URL ?etf= 동기화)
  const [etfTab, setEtfTab] = useTabState("etf", ["hold", "rec"], "hold");
  const etfSwipe = useSwipeTabs({ index: etfTab === "rec" ? 1 : 0, count: 2, onChange: (i) => setEtfTab(["hold", "rec"][i]) }); // [S25-5] 보유↔추천 스와이프
  // [ETF 재구성 Phase1] 기타 금융자산 카드 — 추가 폼 + 인라인 수정/매도 상태
  const [oaForm, setOaForm] = useState({ name: "", valueKrw: "", account: "일반", kind: "fund" });
  const [oaActId, setOaActId] = useState(null); // 인라인 액션(수정/매도) 열린 행
  const [oaActMode, setOaActMode] = useState("edit"); // 'edit' | 'sell'
  const [oaActVal, setOaActVal] = useState("");
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

  // [S22-3] ETF만 보고 나가도 그날 총자산 곡선에 1건 남긴다(backstop).
  useEffect(() => { ensureDailySnapshot(); }, []);

  // [S22-8] 세금 영역은 평시 접힘, 세금 시즌(11·12·1·5월)에만 기본 펼침. SSR 불일치 방지 위해 마운트 후 결정.
  const [taxOpen, setTaxOpen] = useState(false);
  const [taxFocus, setTaxFocus] = useState(null);
  useEffect(() => { const m = currentMonth(); setTaxFocus(taxFocusOf(m)); setTaxOpen(isTaxSeason(m)); }, []);

  // [내 ETF] 로컬 보유 + 등록ETF 수량 로드(60초 폴링) — 시세는 아래 통합 시세 효과가 담당
  useEffect(() => {
    const load = () => { const tr = getTrader(); setHoldings(getHoldings(tr)); setPosQtyState(getPosQtyMap(tr)); setOtherAssets(getOtherAssets(tr)); };
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
  // [S18 D-1] 삭제는 되돌릴 수 없다 — 확인 다이얼로그를 거친다.
  //   종합자산은 onehub-assets-change 이벤트로 즉시 반영된다(원장이 구독 중).
  const delHolding = (h) => {
    const label = `${h.ticker} (${h.shares}주 · ${h.account || "일반"})`;
    if (!window.confirm(`${label} 보유 기록을 삭제할까요?\n되돌릴 수 없습니다.`)) return;
    const tr = getTrader();
    removeEtf({ ticker: h.ticker, account: h.account, trader: tr });
    setHoldings(getHoldings(tr));
    try { window.dispatchEvent(new Event("onehub-assets-change")); } catch (e) {}
  };
  // [S18 D-1] 수정 = 기존값 프리필 후 매수 폼 재사용. 재입력을 요구하지 않는다.
  //   buyEtf 는 같은 티커+통화+계좌+증권사를 가중평균으로 합친다 → 값을 "대체"하려면
  //   삭제 후 재입력이 맞다. 그래서 프리필과 함께 그 사실을 안내한다(조용히 합쳐지면 오해).
  // [사용자 지시] 신규 매수/매도 등록은 "+" 버튼(EtfForm)으로 옮기고, 이 인라인 폼은
  //   기존 보유 "수정" 전용으로만 남긴다 — 평소엔 숨어 있다가 수정 클릭 시에만 나타난다.
  const editHolding = (h) => {
    setEditingHolding(h.id);
    setForm({ side: "buy", ticker: h.ticker, shares: String(h.shares), price: String(h.avgPrice),
              ccy: h.avgCcy || "USD", account: h.account || "일반", market: h.market || "auto" });
    setFormMsg("수정: 값을 고쳐 기록하면 가중평균으로 합쳐집니다. 값을 대체하려면 먼저 삭제하세요.");
    setTimeout(() => { try { document.querySelector(".me-form")?.scrollIntoView({ behavior: "smooth", block: "center" }); } catch (e) {} }, 0);
  };
  const closeEditForm = () => { setEditingHolding(null); setFormMsg(""); };

  // ══════════════════════════════════════════════════════
  // [2026-08-23] 증권사 계좌내역 일괄 입력 — 미래에셋증권 "계좌별잔고" 내보내기(.xls, 실제론 HTML).
  //   1) 상단 "전체 계좌현황" 표에서 계좌번호→계좌유형을 읽고
  //   2) "[계좌번호] 상품보유현황" 표에서 종목명·수량·매입금액·평가금액을 읽는다.
  //   ★상품명만 있고 티커가 없다(수기 확인 필요) — 그래서 결과는 바로 저장하지 않고
  //     리뷰 표로 보여준 뒤 사용자가 티커를 채우고 확인해야 저장된다.
  //   ★매입가는 파일 자체가 "원화로 환산한" 값이라고 명시한다 — 미국 현지상장이어도
  //     avgCcy를 KRW로 둔다(원 데이터를 왜곡 없이 그대로 담는다). 시세갱신은 시장 통화로 별도 처리.
  const _mapAcctType = (t) => {
    if (!t) return "일반";
    if (t.includes("연금저축")) return "개인연금";
    if (t.includes("퇴직연금")) return "퇴직연금";
    if (t.includes("ISA")) return "ISA";
    return "일반";
  };
  const parseAccountExport = (html) => {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const tables = Array.from(doc.querySelectorAll("table"));
    const acctMap = {}; // 계좌번호(하이픈 제거) -> 계좌유형
    const holdingRows = [];
    for (const t of tables) {
      const heads = Array.from(t.querySelectorAll("th")).map((th) => th.textContent.trim());
      const headText = heads.join("|");
      if (headText.includes("계좌번호") && headText.includes("계좌유형")) {
        Array.from(t.querySelectorAll("tr")).forEach((tr) => {
          const tds = Array.from(tr.querySelectorAll("td")).map((td) => td.textContent.trim());
          if (tds.length >= 2 && /\d/.test(tds[0])) acctMap[tds[0].replace(/-/g, "")] = tds[1];
        });
      }
      if (headText.includes("상품명") && headText.includes("보유수량")) {
        Array.from(t.querySelectorAll("tr")).forEach((tr) => {
          const tds = Array.from(tr.querySelectorAll("td")).map((td) => td.textContent.trim());
          // 상품명 | 보유수량 | 현재가 | 평균매입가 | 매입금액 | 평가금액 | 평가손익 | 손익률
          if (tds.length >= 6 && tds[0] && !/^더 보기$/.test(tds[0])) {
            holdingRows.push({ name: tds[0], qty: tds[1], buyAmt: tds[4], evalAmt: tds[5] });
          }
        });
      }
    }
    const m = doc.body.textContent.match(/\[([\d-]+)\]\s*상품보유현황/);
    const acctType = m ? acctMap[m[1].replace(/-/g, "")] || null : null;
    return { acctType, holdingRows, truncated: /더\s*보기/.test(doc.body.textContent) };
  };
  const num = (s) => Number(String(s).replace(/,/g, "")) || 0;
  const onBulkFiles = async (fileList) => {
    setBulkMsg("");
    const files = Array.from(fileList || []);
    if (!files.length) return;
    let rows = [];
    let anyTruncated = false;
    let nextId = 0;
    for (const f of files) {
      try {
        const html = await f.text();
        const { acctType, holdingRows, truncated } = parseAccountExport(html);
        if (truncated) anyTruncated = true;
        const account = _mapAcctType(acctType);
        holdingRows.forEach((r) => {
          const qty = num(r.qty);
          const buyAmt = num(r.buyAmt);
          const hasQty = /\d/.test(String(r.qty)) && qty > 0;
          const isKrName = !/^[A-Z0-9 &.'\-]+$/.test(r.name.replace(/\s/g, " "));
          // [2026-08-23] 현금성 잔고(원화·달러 등)는 티커가 없어 매수기록 모델엔 안 맞지만,
          // "방치된 현금" 진단(연금 운영 제안)에 필요해서 기타자산으로는 등록할 수 있게 한다.
          const isCashLike = /^(미국달러|원화|현금성자산|외화현금|.*현금성자산.*)$/.test(r.name.trim());
          rows.push({
            id: nextId++, name: r.name, ticker: "", account,
            shares: hasQty ? String(qty) : "", avgPrice: hasQty && qty > 0 ? String(Math.round(buyAmt / qty)) : "",
            ccy: "KRW", market: isKrName ? "kr" : "us",
            // 티커 매수기록 대상에서는 항상 제외(현금·펀드 모두) — 아래 기타자산 경로로만 등록.
            skip: !hasQty || isCashLike,
            // [2026-08-23] 수량 없는 항목 = 펀드/디폴트옵션 또는 현금 — 티커 대신
            // "펀드/기타자산으로 등록"(또는 "현금으로 등록") 옵션을 보여준다.
            isFundCandidate: !hasQty,
            isCash: isCashLike,
            evalAmt: num(r.evalAmt), buyAmt,
            registered: false,
          });
        });
      } catch (e) {
        setBulkMsg((m) => `${m}${m ? " · " : ""}${f.name}: 읽기 실패`);
      }
    }
    setBulkRows(rows);
    if (anyTruncated) setBulkMsg((m) => `${m}${m ? " · " : ""}"더 보기"로 안 펼친 파일이 있어 일부 종목이 빠졌을 수 있습니다 — 웹에서 더 보기를 눌러 다시 받아주세요.`);
  };
  const updateBulkRow = (id, patch) => setBulkRows((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  // [2026-08-23] 티커 없는 펀드/디폴트옵션 행 — 이름+평가금액만으로 기타자산 등록.
  const registerBulkRowAsFund = (row) => {
    const tr = getTrader();
    const res = addOtherAsset({ name: row.name, account: row.account, valueKrw: row.evalAmt, costKrw: row.buyAmt, isCash: row.isCash, trader: tr });
    if (res.ok) {
      updateBulkRow(row.id, { registered: true });
      setOtherAssets(getOtherAssets(tr));
      try { window.dispatchEvent(new Event("onehub-assets-change")); } catch (e) {}
    } else {
      setBulkMsg((m) => `${m}${m ? " · " : ""}${row.name}: ${res.error || "등록 실패"}`);
    }
  };
  const delOtherAsset = (o) => {
    if (!window.confirm(`${o.name} (${o.account}) 기록을 삭제할까요?\n되돌릴 수 없습니다.`)) return;
    const tr = getTrader();
    removeOtherAsset({ id: o.id, trader: tr });
    setOtherAssets(getOtherAssets(tr));
    try { window.dispatchEvent(new Event("onehub-assets-change")); } catch (e) {}
  };
  // [ETF 재구성 Phase1] 기타 금융자산 추가(간편 입력) — 이름·평가액·계좌·종류
  const OA_KIND_LABEL = { etf: "ETF", fund: "펀드", bond: "채권", cash: "현금" };
  const submitOtherAsset = () => {
    const tr = getTrader();
    const val = Math.round(Number(oaForm.valueKrw) * 10000); // 입력은 만원 → 원
    const res = addOtherAsset({ name: oaForm.name, account: oaForm.account, valueKrw: val, kind: oaForm.kind, isCash: oaForm.kind === "cash", trader: tr });
    if (!res.ok) return;
    setOtherAssets(getOtherAssets(tr));
    setOaForm({ name: "", valueKrw: "", account: oaForm.account, kind: oaForm.kind });
    try { window.dispatchEvent(new Event("onehub-assets-change")); } catch (e) {}
  };
  // 인라인 수정(평가액 갱신) / 매도·인출(금액 차감) 액션 열기
  const openOaAct = (o, mode) => {
    setOaActId(o.id); setOaActMode(mode);
    setOaActVal(mode === "edit" ? String(Math.round((Number(o.valueKrw) || 0) / 10000)) : "");
  };
  const closeOaAct = () => { setOaActId(null); setOaActVal(""); };
  const commitOaAct = (o) => {
    const tr = getTrader();
    const won10k = Math.round(Number(oaActVal) * 10000); // 입력은 만원 → 원
    if (!Number.isFinite(won10k)) return;
    if (oaActMode === "edit") {
      if (won10k < 0) return;
      updateOtherAsset(o.id, { valueKrw: won10k }, tr);
    } else {
      if (!(won10k > 0)) return;
      sellOtherAsset(o.id, won10k, tr);
    }
    setOtherAssets(getOtherAssets(tr));
    closeOaAct();
    try { window.dispatchEvent(new Event("onehub-assets-change")); } catch (e) {}
  };
  const submitBulkRows = () => {
    const tr = getTrader();
    let ok = 0, skipped = 0, failed = 0;
    bulkRows.forEach((r) => {
      if (r.skip) { skipped++; return; }
      const ticker = String(r.ticker || "").trim();
      if (!ticker || !r.shares || !r.avgPrice) { skipped++; return; }
      const mkt = r.market === "kr" || r.market === "us" ? r.market : inferMarket(ticker);
      const res = buyEtf({ ticker, market: mkt, shares: r.shares, avgPrice: r.avgPrice, avgCcy: r.ccy, account: r.account, trader: tr });
      if (res.ok) ok++; else failed++;
    });
    setBulkMsg(`✓ ${ok}건 등록 · 건너뜀 ${skipped}건${failed ? ` · 실패 ${failed}건` : ""}`);
    if (ok > 0) {
      const l = getHoldings(tr); setHoldings(l); refreshQuotes(l);
      try { window.dispatchEvent(new Event("onehub-assets-change")); } catch (e) {}
      setBulkRows((rows) => rows.filter((r) => r.skip || !r.ticker));
    }
  };

  // [등록 ETF] 수량 입력 → 실측 종가로 실시간 평가금액 재계산
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
    return { curPx, curCcy: q?.currency, curKrw, valueKrw, costTotal, pnlKrw, pnlPct, date: q?.date };
  };
  // [S22-1] 평단이 현재가와 10배 이상 어긋난 보유 → 파생계산(평가·손익·도넛·연금취득가)에서 제외하고
  //   "확인 필요" 카드로 물어본다(앱은 값을 고치지 않는다). 시세 없으면 판정 보류=정상 취급.
  const holdingBad = (h) => !saneEtfAvg(h, holdingMetrics(h).curKrw, fxRate);
  const okHoldings = holdings.filter((h) => !holdingBad(h));
  const badHoldings = holdings.filter(holdingBad);
  const etfAvgWarnings = badHoldings.map((h) => ({
    code: "AVG_PRICE_OUT_OF_RANGE", source: "etf", id: h.id, name: h.ticker,
    avgPrice: Number(h.avgPrice), avgCcy: h.avgCcy,
  }));
  const myTotal = okHoldings.reduce((acc, h) => { const m = holdingMetrics(h); return acc + (m.valueKrw || 0); }, 0);

  // [등록 ETF] 수량(백엔드 제공 우선, 없으면 사용자 입력) + 실측 종가 기반 실시간 평가금액
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
  // 실시간 총평가금액 = (수량 아는 등록 포지션) + (내 보유). 하나라도 있으면 표기.
  const liveTotal = (() => {
    let sum = 0, any = false;
    positions.forEach((p) => { const l = posLive(p); if (l.valueKrw != null) { sum += l.valueKrw; any = true; } });
    okHoldings.forEach((h) => { const v = holdingMetrics(h).valueKrw; if (v != null) { sum += v; any = true; } });
    return any ? sum : null;
  })();
  // [히어로 일원화] 실시간 평가(수량×실측종가)가 있으면 그걸 대표값으로, 없으면 백엔드 평가액.
  //   평가손익·수익률도 같은 base로 재계산해 상단 큰 숫자와 일치시킨다(중복 라인 제거).
  const heroLive = liveTotal != null;
  const heroVal = heroLive ? liveTotal : (s?.value_krw ?? 0);
  const heroCost = s?.krw_cost ?? 0;
  const heroPnl = heroVal - heroCost;
  const heroPnlPct = heroCost > 0 ? (heroVal / heroCost - 1) * 100 : (s?.total_pnl_pct ?? 0);
  // [2026-08-23] 기타 금융자산(펀드·디폴트옵션)은 위 P&L(수익률) 계산에 안 섞는다 —
  // 원가 이력이 없어 넣으면 수익률이 왜곡된다. 대신 별도 줄로 합계만 보여준다.
  const otherAssetsSum = otherAssets.reduce((acc, o) => acc + (Number(o.valueKrw) || 0), 0);

  // [ETF 재구성 Phase1] 테마 도넛·추천에 넘길 '티커+원화평가액' 목록.
  //   목표배분 섹션과 동일한 평가규칙(백엔드 value_krw 우선, 없으면 실측종가 기반 holdingMetrics).
  const pieItems = [...positions, ...okHoldings]
    .map((x) => ({ ticker: x.ticker, valueKrw: x.value_krw ?? x.eval_krw ?? (holdingMetrics(x).valueKrw || 0) }))
    .filter((x) => x.ticker && x.valueKrw > 0);
  // [ETF 분석] 보유 종목별 성과(평가액+수익률) — 등록 포지션 + 내 보유를 티커로 합산.
  const perfItems = (() => {
    const m = {};
    const push = (ticker, name, valueKrw, pnlPct, costKrw, pnlKrw) => {
      if (!ticker || !(valueKrw > 0)) return;
      const k = String(ticker).toUpperCase();
      if (!m[k]) m[k] = { ticker, name: name || ticker, valueKrw, pnlPct: pnlPct != null ? pnlPct : null, costKrw: costKrw != null ? costKrw : null, pnlKrw: pnlKrw != null ? pnlKrw : null };
      else {
        m[k].valueKrw += valueKrw;
        if (costKrw != null) m[k].costKrw = (m[k].costKrw || 0) + costKrw;
        if (pnlKrw != null) m[k].pnlKrw = (m[k].pnlKrw || 0) + pnlKrw;
        if (m[k].pnlPct == null && pnlPct != null) m[k].pnlPct = pnlPct;
      }
    };
    positions.forEach((p) => {
      const l = posLive(p);
      const cost = p.krw_cost ?? p.invested_krw ?? p.cost_krw ?? null;
      const val = l.valueKrw != null ? l.valueKrw : (p.value_krw ?? null);
      const pnlK = (val != null && cost != null) ? val - cost : (p.pnl_krw ?? null);
      push(p.ticker, p.name, val, l.pnlPct != null ? l.pnlPct : (p.pnl_pct ?? null), cost, pnlK);
    });
    okHoldings.forEach((h) => { const mm = holdingMetrics(h); push(h.ticker, h.name, mm.valueKrw, mm.pnlPct, mm.costTotal, mm.pnlKrw); });
    // 비율만 아는 항목은 costKrw가 없을 수 있음 → 총수익률(pnlPct)로 매수금액 역산 보조.
    return Object.values(m).map((x) => {
      if (x.costKrw == null && x.pnlPct != null && x.valueKrw != null) x.costKrw = x.valueKrw / (1 + x.pnlPct / 100);
      if (x.pnlKrw == null && x.costKrw != null) x.pnlKrw = x.valueKrw - x.costKrw;
      return x;
    });
  })();
  // [ETF 보유 분석] 기간 등락률(1주/1개월, NAV) — 보유 종목 티커로 조회(보유 탭 진입 시).
  const [perfMap, setPerfMap] = useState({});
  const perfKey = perfItems.map((x) => x.ticker).join(",");
  useEffect(() => {
    if (etfTab !== "hold" || !perfKey) return;
    let alive = true;
    fetch(`/api/pwa/etf-perf?tickers=${encodeURIComponent(perfKey)}`)
      .then((r) => r.json()).then((d) => { if (alive && d && d.perf) setPerfMap(d.perf); })
      .catch(() => {});
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perfKey, etfTab]);
  // [ETF 재구성 Phase1] 규칙기반 추천 후보(순수함수).
  const etfRecs = recommendEtfs({ holdings, positions: pieItems, target: targetAlloc, overlap });
  // [ETF Phase2] 후보 '이유'를 Claude로 다듬어 채운다(추천 탭 진입 시 1회, 실패 시 규칙문구 폴백).
  const [recReasons, setRecReasons] = useState([]);
  const recKey = etfRecs.map((r) => r.name).join("|");
  useEffect(() => {
    if (etfTab !== "rec" || !etfRecs.length) return;
    let alive = true;
    const holdSummary = holdings && holdings.length
      ? `${holdings.slice(0, 5).map((h) => h.ticker).filter(Boolean).join(", ")} 등 ${holdings.length}종목`
      : "보유 ETF 없음";
    fetch("/api/pwa/etf-reason", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        candidates: etfRecs.map((r) => ({ name: r.name, bucket: r.bucket, axis: r.axis, reasonRule: r.reasonRule })),
        holdings_summary: holdSummary, target: targetAlloc || null,
      }),
    }).then((r) => r.json()).then((d) => {
      if (alive && Array.isArray(d.reasons) && d.reasons.length === etfRecs.length) setRecReasons(d.reasons);
    }).catch(() => {});
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recKey, etfTab]);

  // [N1] onboard(etf_uk) 미러링 제거 — ETF 평가액은 lib/ledger가 lib/etfLive로 직접 계산한다.
  //   과거엔 이 미러가 onboard를 오염시켜 폴백 병합에서 ETF가 두 번 더해졌다(5.15+5.19=10.34억).
  //   저장/시세 변동은 onehub-assets-change 이벤트로만 알린다(원장이 다시 계산).

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
  // [S18 C-5] 섹터 상한은 목표 배분에서 파생된다. 숫자를 코드에 박지 않는다.
  //   사용자는 목표 배분을 한 번도 고른 적이 없다(2026-07-17 확인) — 그런데도
  //   상한 초과라고 지시하고 있었다. 근거 없는 지시는 신뢰를 깎는다.
  //   목표가 없으면 제안 자체를 만들지 않는다(잠금). 상한값은 프리셋 파일에서 읽는다.
  const sectorCap = Number(REBAL_PRESETS.sector_cap_pct) || null;
  const hasTarget = !!targetAlloc;
  const sectorOver = hasTarget && sectorCap && maxSector && maxSector.weight * 100 >= sectorCap;
  const rebalReasons = [];
  if (sectorOver) rebalReasons.push(`${maxSector.sector} ${(maxSector.weight * 100).toFixed(0)}% 집중 — 상한 ${sectorCap}% 초과분 축소`);
  if (overlapWarn) rebalReasons.push(`${overlapWarn} — 중복 종목 통합으로 실질 분산 확보`);
  if (tax?.losses?.length) rebalReasons.push(`손실 종목(${tax.losses.map((l) => l.ticker).join("·")}) 손익통산 — 절세 매도 후 재매수 검토`);

  // [E2·E3] 계좌별 '해야 할 일' + 리밸런싱 제안 — 보유·세제·중복·집중·리밸 데이터에서 결정론적으로 산출.
  //   각 항목에 대상 계좌(전체/일반/연금/ISA) 태그를 붙여, 상단 계좌 필터가 곧 '할 일' 필터가 되도록 한다.
  const etfTodos = [];
  // [S18 C-5] 목표 배분이 있을 때만 제안한다. 상한·근거를 함께 밝힌다.
  if (sectorOver)
    etfTodos.push({ acct: "전체", icon: "📊", title: `${maxSector.sector} ${(maxSector.weight * 100).toFixed(0)}% 집중 축소`, detail: `단일 섹터 비중이 상한 ${sectorCap}%를 넘습니다. 초과분을 다른 섹터로 분산해 리스크를 낮추세요.`, why: `근거: ${targetAlloc?.label || "목표 배분"} · 섹터 상한 ${sectorCap}%`, tone: "warn" });
  if (overlapWarn)
    etfTodos.push({ acct: "전체", icon: "🔁", title: "중복 종목 통합", detail: `${overlapWarn} — 겹치는 종목을 정리하면 같은 금액으로 실질 분산이 늘어납니다.`, tone: "warn" });
  const rebalActs = Array.isArray(rebal?.actions) ? rebal.actions.filter((a) => a.action !== "HOLD") : [];
  // [S18 C-5] 리밸런싱은 '목표가 있어야' 만들 수 있는 제안이다. 목표 없이 조정을 지시하지 않는다.
  //   반면 손익통산·해외배당은 목표와 무관한 '세제 사실'이라 잠그지 않는다(아래 유지).
  if (hasTarget && rebalActs.length)
    etfTodos.push({ acct: "전체", icon: "⚖️", title: `리밸런싱 ${rebalActs.length}건 실행`, detail: `${rebalActs.slice(0, 3).map((a) => `${a.ticker} ${a.action === "SELL" ? "축소" : "확대"} ${a.qty}주`).join(" · ")}${rebalActs.length > 3 ? " 외" : ""} · 예상 양도세 ${won(rebal?.est_tax_krw)}원. 밴드 내 종목은 보유 권장.`, tone: "info" });
  if (tax?.losses?.length)
    etfTodos.push({ acct: "일반", icon: "🧾", title: `손실 종목 손익통산(${tax.losses.map((l) => l.ticker).join("·")})`, detail: "일반계좌는 같은 해 이익·손실을 합산 과세합니다. 손실 종목을 함께 매도(손실수확)하면 과세표준이 줄어 양도세를 아낄 수 있습니다.", tone: "info" });
  if (tax?.dividend_usd > 0)
    etfTodos.push({ acct: "일반", icon: "💵", title: `해외 배당 연 $${tax.dividend_usd} 관리`, detail: "해외상장 ETF 배당은 15% 원천징수 후 지급됩니다. 연 금융소득 2,000만원 초과 시 종합과세 대상이니 규모를 확인하세요.", tone: "info" });
  // [2026-08-22] 미국 ETF 매매 시 거래시간·환율 참고 — 보유 중일 때만, 목표 배분과 무관한 사실이라 안 잠금.
  if (holdings.some(isOverseasHolding))
    etfTodos.push({ acct: "일반", icon: "🕐", title: "미국 ETF 매매 시간·환율 참고", detail: "미국 정규장은 한국시간 기준 밤 22:30~05:00(서머타임) 또는 23:30~06:00(그 외)에 열립니다. 원화→달러 환전이 필요해 환율 변동분도 실질 매수단가에 영향을 줍니다.", tone: "info" });
  const hasPension = holdings.some((h) => isPensionAcct(h.account || "일반")) || otherAssets.some((o) => isPensionAcct(o.account || "일반"));
  if (hasPension) {
    // 세액공제 한도는 개인연금+IRP 합산(연 900만) — 두 계좌 취득액을 함께 본다
    const limit = pensionCreditLimitCombined();
    const penRows = okHoldings.filter((h) => isPensionAcct(h.account || "일반"));
    const acquired = penRows.reduce((a, h) => a + (h.avgCcy === "KRW" ? h.avgPrice * h.shares : (fxRate ? h.avgPrice * h.shares * fxRate : 0)), 0);
    const contrib = pensionContrib !== "" ? Number(pensionContrib) : acquired;
    const room = Math.max(0, limit - contrib);
    if (room > 0)
      etfTodos.push({ acct: "연금", icon: "🎁", title: `연금 추가납입 여유 ${won(room)}원`, detail: `개인연금+IRP 합산 세액공제 한도(${won(limit)}원)까지 ${won(room)}원 남았습니다. 추가 납입하면 13.2~16.5% 세액공제를 더 받습니다(연금저축 단독 한도 600만).`, tone: "good" });
    else
      etfTodos.push({ acct: "연금", icon: "✅", title: "연금 세액공제 한도 충족", detail: "개인연금+IRP 합산 세액공제 한도를 채웠습니다. 초과 납입분은 내년 이월공제 또는 ISA·일반 활용을 검토하세요.", tone: "good" });

    // [2026-08-23] 연금 운영 제안 — 디폴트옵션 방치·같은 지수 중복 보유·현금 방치를
    // 실제 보유(티커+기타자산) 데이터에서 감지한다. 세 가지 다 '사실 감지'라 목표
    // 배분과 무관하게(잠금 없이) 보여준다 — 위 손익통산·해외배당과 같은 원칙.
    const pensionItems = [
      ...holdings.filter((h) => isPensionAcct(h.account || "일반"))
        .map((h) => ({ name: h.ticker, account: h.account, valueKrw: holdingMetrics(h).valueKrw || 0, isCash: false })),
      ...otherAssets.filter((o) => isPensionAcct(o.account || "일반"))
        .map((o) => ({ name: o.name, account: o.account, valueKrw: Number(o.valueKrw) || 0, isCash: !!o.isCash })),
    ];

    // 1) 디폴트옵션 방치 — DC 미지정 가입자용 자동 상품에 큰 금액이 남아있는 경우.
    const defaultOptItems = pensionItems.filter((x) => /디폴트\s*옵션|default\s*option/i.test(x.name));
    const defaultOptSum = defaultOptItems.reduce((a, x) => a + x.valueKrw, 0);
    if (defaultOptSum > 0)
      etfTodos.push({ acct: "연금", icon: "⚙️", title: `디폴트옵션 방치 ${won(defaultOptSum)}원`, detail: `${[...new Set(defaultOptItems.map((x) => x.account))].join("·")} 계좌에 자동배정(디폴트옵션) 상태로 ${won(defaultOptSum)}원이 있습니다. 가입자가 직접 운용을 지시하지 않았을 때 자동 배정되는 보수적 상품이라, 직접 투자상품을 선택하면 본인 성향에 맞게 조정할 수 있습니다.`, tone: "warn" });

    // 2) 같은 지수를 여러 상품으로 중복 보유 — 계좌별로 그룹핑, 같은 지수 2개 이상이면 표시.
    const INDEX_KEYWORDS = [
      { key: "나스닥100", re: /나스닥\s*100|nasdaq\s*100/i },
      { key: "S&P500", re: /S&P\s*500|에스앤피\s*500/i },
      { key: "코스피200", re: /코스피\s*200|kospi\s*200/i },
    ];
    const detectIndex = (name) => { for (const k of INDEX_KEYWORDS) if (k.re.test(name)) return k.key; return null; };
    const byIndex = {};
    pensionItems.filter((x) => !x.isCash).forEach((x) => {
      const idx = detectIndex(x.name);
      if (!idx) return;
      const gkey = `${x.account}::${idx}`;
      (byIndex[gkey] = byIndex[gkey] || []).push(x);
    });
    Object.entries(byIndex).forEach(([gkey, items]) => {
      if (items.length < 2) return;
      const [account, idx] = gkey.split("::");
      const sum = items.reduce((a, x) => a + x.valueKrw, 0);
      etfTodos.push({ acct: "연금", icon: "🔁", title: `${account} ${idx} 중복 보유 ${items.length}개`, detail: `${items.map((x) => x.name).join(" · ")} — 같은 지수를 여러 상품으로 나눠 보유 중입니다(합계 ${won(sum)}원). 하나로 통합하면 보수(수수료) 중복을 줄일 수 있습니다.`, tone: "warn" });
    });

    // 3) 계좌 안 현금 방치 — 투자상품으로 옮기지 않으면 사실상 수익이 안 난다.
    const cashByAcct = {};
    pensionItems.filter((x) => x.isCash && x.valueKrw > 0).forEach((x) => { cashByAcct[x.account] = (cashByAcct[x.account] || 0) + x.valueKrw; });
    Object.entries(cashByAcct).forEach(([account, sum]) => {
      etfTodos.push({ acct: "연금", icon: "💰", title: `${account} 현금 방치 ${won(sum)}원`, detail: `${account} 계좌에 투자되지 않은 현금이 ${won(sum)}원 있습니다. 계좌 안에서는 투자상품으로 옮기지 않으면 수익이 나지 않습니다.`, tone: "warn" });
    });
  }
  const todosForAcct = etfTodos.filter((t) => acctFilter === "전체" || t.acct === "전체" || t.acct === acctFilter || (t.acct === "연금" && isPensionAcct(acctFilter)));

  return (
    <div className="etf pwa-shell" onTouchStart={etfSwipe.onTouchStart} onTouchMove={etfSwipe.onTouchMove} onTouchEnd={etfSwipe.onTouchEnd}>
      {/* [사용자 지시] 상위 메뉴는 고정하고 그 아래 내용만 스크롤 — 헤더+타이틀바를 하나의
          sticky 블록으로 묶는다. */}
      <div className="sticky-hdr">
        <AppHeader />
        {/* [사용자 지시] "종합자산 자산지도" 탭에서 이 페이지로 direct 연결되므로, 상위 메뉴바가
            사라진 것처럼 보이지 않도록 동일한 타이틀 바를 여기도 얹는다. */}
        <AssetMapTitle current="ETF" />
        {/* [ETF 재구성 Phase1] 보유 | 추천 상위 탭 — 주식(보유/추천) 미러. 계좌필터는 두 탭 공통 렌즈. */}
        <nav className="etf-subtabs" role="tablist" aria-label="ETF 보유/추천">
          {[["hold", "보유"], ["rec", "추천"]].map(([t, label]) => (
            <button key={t} role="tab" aria-selected={etfTab === t}
              className={`etf-subtab ${etfTab === t ? "active" : ""}`} onClick={() => setEtfTab(t)}>
              {label}
            </button>
          ))}
        </nav>
      </div>

      {/* 1) HERO — ETF 총평가액 + 원화 실질수익 3분해. [사용자 지시] 다른 페이지처럼 밝은 카드로 통일 */}
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
            {/* [2026-08-23] 위 큰 숫자·수익률은 티커 보유(ETF/주식)만의 것 — 펀드·디폴트옵션은
                원가 이력이 없어 수익률 계산에 못 섞는다. 그래서 합계만 별도로 밝힌다. */}
            {otherAssetsSum > 0 && (
              <div className="hsub hsub-other">+ 기타 금융자산(펀드·디폴트옵션 등) {won(otherAssetsSum)}원 별도 <span className="hsub-note">· 위 수익률에는 미포함</span></div>
            )}
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
                <div className="drow total"><span className="dk"><Term term="환율 반영 실제 수익">환율 반영 수익</Term></span><span className={`dv ${sign(s.total_pnl_pct)}`}>{pct(s.total_pnl_pct)}</span></div>
              </div>
              <div className="foot-note">달러 수익 {pct(s.etf_self_pct)} 위에 환율효과 {pct((s.fx_pure_pct || 0) + (s.cross_pct || 0))}가 더해진 원화 실질 수익입니다.</div>
            </>)}
          </>
        ) : (
          <div className="hsub">{err ? "데이터 로드 오류" : "불러오는 중…"}</div>
        )}
      </section>

      {/* [§3-6 피드백11] #1 결론 VerdictCard — 대표지표(실질 원화수익)를 못박고 핵심 리스크 노출.
          [사용자 지시] 분해 내역(ETF/환/교차)은 위 히어로 "수익 분해" 아코디언과 중복이라 삭제. */}
      {s && (
        <div className="etf-verdict">
          <div className="ev-lead">
            <span className="ev-lbl">📌 이 포트폴리오의 결론</span>
            <span className={`ev-metric ${sign(s.total_pnl_pct)}`}>환율 반영 수익 {pct(s.total_pnl_pct)} <span className="ev-period">(누적)</span></span>
          </div>
          {topRisk && <div className="ev-risk">⚠️ 핵심 리스크 · {topRisk}</div>}
        </div>
      )}

      {/* [S4] 계좌 유형 필터 — 세제가 근본부터 다르므로 계좌별로 보유·세제를 분리해 본다 */}
      <div className="acct-filter" role="tablist" aria-label="계좌 유형 필터">
        {ACCT_FILTERS.map((f) => {
          // [2026-08-23] 기타 금융자산(펀드 등)도 계좌 보유 개수에 포함 — 종목수는 다르지만
          // "이 계좌에 뭔가 있다"는 게 안 보이던 문제라 카운트에는 반드시 넣는다.
          const cnt = f === "전체"
            ? holdings.length + otherAssets.length
            : holdings.filter((h) => (h.account || "일반") === f).length + otherAssets.filter((o) => (o.account || "일반") === f).length;
          return (
            <button key={f} role="tab" aria-selected={acctFilter === f}
              className={`acct-chip ${acctFilter === f ? "on" : ""} ${isPensionAcct(f) ? "pension" : f === "ISA" ? "isa" : ""}`}
              onClick={() => changeAcctFilter(f)}>
              {f}{cnt > 0 && <span className="acct-chip-n">{cnt}</span>}
            </button>
          );
        })}
      </div>

      {/* [S22-1] 이상 평단 확인 — 평단이 현재가와 10배 이상 어긋난 보유는 평가·손익에서 뺐음을 묻는다(주식과 공용 카드). */}
      {etfTab === "hold" && <AvgPriceWarningCard warnings={etfAvgWarnings} onReload={() => { const tr = getTrader(); const l = getHoldings(tr); setHoldings(l); refreshQuotes(l); }} />}

      {/* [ETF 재구성 Phase1] 보유 탭 상단 — 테마별 분배 도넛(지역/섹터) */}
      {etfTab === "hold" && <EtfAllocationPie items={perfItems} overlap={overlap} perfMap={perfMap} />}

      {/* [ETF 재구성 Phase1] 추천 탭 상단 — 규칙기반 ETF 종목 추천 + 이유 */}
      {etfTab === "rec" && (
        <section className="card etf-reco">
          <div className="label">💡 ETF 종목 추천 <span className="sub">규칙 기반 · 이유</span></div>
          <div className="reco-list">
            {etfRecs.map((r, i) => (
              <div className={`reco-item ${r.axis}`} key={i}>
                <div className="reco-top">
                  <span className="reco-nm">{r.name}</span>
                  <span className={`reco-axis ${r.axis}`}>{r.axis === "region" ? "지역" : "섹터"} · {r.bucket}</span>
                </div>
                <div className="reco-why">{recReasons[i] ? <><span className="reco-ai">AI</span>{recReasons[i]}</> : r.reasonRule}</div>
              </div>
            ))}
          </div>
          <div className="reco-note">규칙 기반 후보 + <b>AI 이유설명</b>입니다. 특정 종목 매수 권유가 아니며 최종 판단은 본인이 하세요.</div>
        </section>
      )}

      {/* [E2·E3] 해야 할 일 · 리밸런싱 제안 — 계좌 필터가 곧 '할 일' 필터. 조치 없으면 보유 권장 */}
      {etfTab === "rec" && s && (
        <section className="card todo-card">
          <div className="label">📋 해야 할 일 · 리밸런싱 제안
            <span className="sub">{acctFilter === "전체" ? "전 계좌" : `${acctFilter} 계좌`}</span>
          </div>
          {/* [S18 C-5] 목표 배분이 없으면 '목표 기반 제안'은 잠근다.
              근거 없는 지시는 신뢰를 깎는다 — 이 앱의 전부가 근거 투명성이다.
              세제 사실(손익통산·해외배당)은 목표와 무관하므로 계속 표시된다. */}
          {!hasTarget && (
            <div className="todo-locked">
              🔒 <b>리밸런싱 제안은 목표 배분을 정한 뒤 표시됩니다.</b>
              <span>목표가 있어야 “무엇을 얼마나 조정할지”를 만들 수 있습니다. 아래 세제 알림은 목표와 무관해 그대로 표시됩니다.</span>
              {/* [2026-08-22] 핵심 리스크는 보이는데 다음 행동이 안 보인다는 피드백 —
                  아래 "🎯 목표 배분" 카드와 동일한 프리셋 버튼을 여기 바로 둬서, 스크롤 없이
                  한 번의 탭으로 잠금을 풀 수 있게 한다(가짜 기본값을 만들지는 않는다 — 이전에
                  사용자가 고른 적 없는 상한을 지시해 신뢰가 깎인 사고가 있어 그 원칙은 유지). */}
              <div className="acct-filter" role="group" aria-label="목표 배분 프리셋" style={{ marginTop: 10 }}>
                {Object.keys(REBAL_PRESETS.presets).map((k) => (
                  <button key={k} className="acct-chip" onClick={() => applyPreset(k)}>{k}</button>
                ))}
              </div>
            </div>
          )}
          {todosForAcct.length > 0 ? (
            <div className="todo-list">
              {todosForAcct.map((t, i) => (
                <div className={`todo-item ${t.tone}`} key={i}>
                  <span className="todo-ic">{t.icon}</span>
                  <div className="todo-body">
                    <div className="todo-t">{t.title}<span className={`todo-acct ${(t.acct === "연금" || isPensionAcct(t.acct)) ? "pension" : t.acct === "ISA" ? "isa" : t.acct === "일반" ? "normal" : "all"}`}>{t.acct}</span></div>
                    <div className="todo-d">{t.detail}</div>
                    {t.why && <div className="todo-why">{t.why}</div>}
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
      {etfTab === "rec" && (positions.length > 0 || holdings.length > 0) && (() => {
        // [투자지역] 국내/해외는 '투자대상 지역'(classifyEtf: tax_type 기반)으로 가른다.
        //   ★기존 버그: holdings(직접입력)만 + 상장시장(market) 기준으로 판정 → 서버 등록
        //     positions(포트폴리오 대부분)를 무시하고, 국내상장 해외추종을 '국내'로 잡아
        //     "해외 0% 국내 100%" 처럼 실제와 정반대로 표시됐다.
        //   이제: positions(서버) + holdings(직접입력) 모두 포함, classifyEtf(투자지역) 우선.
        const evalKrw = (p) => p.value_krw ?? p.eval_krw ?? (holdingMetrics(p).valueKrw || 0);
        const isOs = (p) => { const c = classifyEtf(p.ticker); return c ? c.r === "해외" : isOverseasHolding(p); };
        const allEtf = [...positions, ...holdings];
        const totalKrw = allEtf.reduce((a, p) => a + evalKrw(p), 0);
        const overseasKrw = allEtf.reduce((a, p) => a + (isOs(p) ? evalKrw(p) : 0), 0);
        const domesticKrw = Math.max(0, totalKrw - overseasKrw);
        const myTotal = totalKrw;   // 이 섹션 분모는 전체 ETF(서버+직접입력)
        const curO = totalKrw > 0 ? Math.round(overseasKrw / totalKrw * 1000) / 10 : null;
        const curD = totalKrw > 0 ? Math.round(domesticKrw / totalKrw * 1000) / 10 : null;
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
              // 처방: 해외 초과 시 가장 큰 해외 보유 축소 수량 산출(서버+직접입력 통합)
              let rx = null;
              if (over && driftO > 0) {
                const usd = allEtf.filter(isOs).map((h) => ({ h, v: evalKrw(h), px: (quotes[h.ticker]?.price ?? 0) * (fxRate || 0) })).sort((a, b) => b.v - a.v)[0];
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

      {/* [ETF 재구성 Phase1] 연금 운영 제안 — 계좌 배치 최적화(구 E-5) + 연금 세액공제 진행률을 묶음 */}
      {etfTab === "rec" && (() => {
        const genAcct = holdings.filter((h) => (h.account || "일반") === "일반");
        const taxAcct = okHoldings.filter((h) => isPensionAcct(h.account || "일반") || (h.account || "일반") === "ISA");
        const overseasInGen = genAcct.filter(isOverseasHolding);   // [S18] 통화가 아니라 시장으로
        const domesticInTax = taxAcct.filter((h) => h.avgCcy === "KRW");
        const swap = overseasInGen.length > 0 && domesticInTax.length > 0;
        const hasPen = holdings.some((h) => isPensionAcct(h.account || "일반")) || otherAssets.some((o) => isPensionAcct(o.account || "일반"));
        const limit = pensionCreditLimitCombined();
        const penRows = okHoldings.filter((h) => isPensionAcct(h.account || "일반"));
        const acquired = penRows.reduce((a, h) => a + (h.avgCcy === "KRW" ? h.avgPrice * h.shares : (fxRate ? h.avgPrice * h.shares * fxRate : 0)), 0);
        const contrib = pensionContrib !== "" ? Number(pensionContrib) : acquired;
        const prog = Math.max(0, Math.min(1, limit ? contrib / limit : 0));
        const est = pensionContrib === "";
        return (
          <section className="card">
            <div className="label"><Term term="자산 배치">🏛️ 연금 운영 제안</Term> <span className="sub">계좌 배치 · 세액공제</span></div>
            {/* 계좌 배치 최적화 */}
            <div className="op-h">🧮 계좌 배치 최적화</div>
            {holdings.length > 1 ? (
              swap ? (
                <div className="rb-why">
                  <div className="rb-why-h">💡 배치 개선 여지</div>
                  <div className="rb-why-row"><span className="rb-why-n">→</span><span className="rb-why-t">세금이 큰 <b>해외 ETF({overseasInGen.map((h) => h.ticker).join("·")})</b>가 일반계좌에, 세금이 작은 <b>국내형({domesticInTax.map((h) => h.ticker).join("·")})</b>이 세제계좌에 있습니다. <b>두 자산의 계좌를 맞바꾸면</b> 세제계좌(ISA·연금) 한도를 세금 큰 자산에 써서 세후 수익을 높일 수 있습니다.</span></div>
                </div>
              ) : (
                <div className="rb-tax sub">현재 계좌 배치에 뚜렷한 개선 여지는 없습니다. 원칙: <b>세제계좌 한도는 세금이 큰 해외·배당형에 우선</b> 배정하고, 매매차익 비과세 성격의 국내주식형은 일반계좌 여지가 큽니다.</div>
              )
            ) : (
              <div className="rb-tax sub">보유 종목이 2개 이상이면 계좌 간 배치 개선 여지를 진단합니다.</div>
            )}
            {/* 연금 세액공제 진행률(개인연금+IRP 합산) */}
            <div className="op-h" style={{ marginTop: 14 }}>🎁 연금 세액공제 진행률 <span className="pc-scope">개인연금+IRP 합산</span></div>
            {hasPen ? (
              <div className="pen-credit">
                <div className="pc-h">
                  <span className="pc-lbl">납입 대비 한도</span>
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
            ) : (
              <div className="rb-tax sub">개인연금·퇴직연금 보유를 입력하면 세액공제 진행률(연 900만 합산 한도)을 추적합니다.</div>
            )}
            <div className="rb-tax sub" style={{ marginTop: 8 }}>⚠ 세무자문이 아닙니다. 실제 절세액은 개인 소득·거래·현행 세법에 따라 다릅니다.</div>
          </section>
        );
      })()}

      {/* [2026-08-23] 다음 매수 계좌 추천 — 종목을 검색하면 세제 분류(etf_master.tax_type)
          기반으로 어느 계좌가 유리한지 순위+이유를 보여준다. "이미 산 것"이 아니라
          "앞으로 살 것"을 위한 도구라 위 계좌 배치 최적화와 다르다. */}
      {etfTab === "rec" && (
      <section className="card">
        <div className="label">💡 다음 매수, 어느 계좌가 유리할까 <span className="sub">종목 검색</span></div>
        <TickerSearchBox value={nbTicker} placeholder="티커/이름 검색(SCHD, TIGER 미국S&P500)"
          onChange={(v) => { setNbTicker(v); setNbSel(null); }}
          onSelect={(r) => { setNbTicker(`${r.name} (${r.ticker})`); setNbSel(r); }} />
        {nbSel && (() => {
          const recs = recommendAccounts(nbSel.taxType, nbSel.market);
          // 연금 추천이 있으면 세액공제 여유도 같이 보여준다(있는 데이터만, 추측 없음).
          const limit = pensionCreditLimitCombined();
          const penRows = okHoldings.filter((h) => isPensionAcct(h.account || "일반"));
          const acquired = penRows.reduce((a, h) => a + (h.avgCcy === "KRW" ? h.avgPrice * h.shares : (fxRate ? h.avgPrice * h.shares * fxRate : 0)), 0);
          const contrib = pensionContrib !== "" ? Number(pensionContrib) : acquired;
          const room = Math.max(0, limit - contrib);
          return (
            <div className="nb-recs">
              {recs.map((rec, i) => (
                <div className={`nb-rec ${rec.tone}`} key={i}>
                  <span className="nb-rec-rank">{i + 1}순위</span>
                  <span className="nb-rec-acct">{ACCT_EMOJI[rec.account] || ""} {rec.account}</span>
                  <span className="nb-rec-why">{rec.reason}{isPensionAcct(rec.account) && i === 0 ? ` (현재 세액공제 여유 ${won(room)}원)` : ""}</span>
                </div>
              ))}
              <div className="rb-tax sub" style={{ marginTop: 8 }}>⚠ 투자자문·세무자문이 아닙니다. 실제 유불리는 개인 소득·보유기간·거래 규모에 따라 다르며, 최종 계좌 선택은 본인이 판단하세요.</div>
            </div>
          );
        })()}
      </section>
      )}

      {/* [§3-2 원칙1] 포트폴리오 합계는 홈·AI자산 2곳에만. ETF 페이지는 ETF 슬라이스만 표시(피드백14) */}
      {err && <div className="err">데이터 로드 오류: {err}</div>}

      {/* 2) Portfolio Score — 블랙박스 금지, 구성요소 공개 */}
      {etfTab === "hold" && s && tax && overlap && (
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
      {etfTab === "hold" && overlap && !overlap.error && !overlap.note?.includes("SAMPLE") && (
        <section className="card">
          <div className="label">종목 중복 노출 (Heat Map)
            <span className="sub">실 보유 기반</span>
          </div>
          {/* [PI-6] 겉보기 vs 실효 — 여러 ETF가 같은 섹터에 겹치면 실제 노출은 겉보기보다 높다 */}
          {overlap.sectors?.[0] && (
            <div style={{ background: "var(--color-warning-soft)", border: "1px solid var(--color-warning-ink, var(--color-warning))", borderRadius: 10, padding: "10px 12px", margin: "0 0 12px", fontSize: "0.76rem", color: "var(--color-ink-2)", lineHeight: 1.55, wordBreak: "keep-all" }}>
              ⚠️ 여러 ETF가 <b>{overlap.sectors[0].sector}</b>에 겹칩니다 — <b>실효 비중 {(overlap.sectors[0].weight * 100).toFixed(0)}%</b>. 개별 ETF 라벨의 겉보기 비중이 아니라, <b>같은 섹터에 실제로 얼마나 노출됐는지</b>입니다(겉보기보다 높을 수 있음).
            </div>
          )}
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
      {etfTab === "rec" && rebal && (
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
      {etfTab === "rec" && s && s.value_krw > 0 && (() => {
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

      {/* [S22-8] 세금 영역 접기/펼치기 — 평시 접힘(소음 방지), 세금 시즌엔 기본 펼침 + 이번 달 포커스 표시. */}
      {etfTab === "rec" && (
        <button className="card" onClick={() => setTaxOpen((o) => !o)}
          style={{ width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: 8, cursor: "pointer", border: taxFocus ? "1px solid var(--color-primary)" : "1px solid var(--color-line)", background: "var(--color-card)", fontFamily: "var(--font-sans)" }}>
          <span style={{ fontSize: "0.86rem", fontWeight: 800, color: "var(--color-ink)" }}>🧾 세금·절세</span>
          {taxFocus && <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--color-primary)", background: "var(--color-primary-soft)", borderRadius: 999, padding: "2px 8px" }}>이번 달 · {taxFocus.title}</span>}
          <span style={{ marginLeft: "auto", fontSize: "0.76rem", color: "var(--color-ink-3)" }}>{taxOpen ? "접기 ▲" : "펼치기 ▼"}</span>
        </button>
      )}
      {taxFocus && etfTab === "rec" && taxOpen && (
        <p style={{ margin: "0 0 8px", fontSize: "0.76rem", color: "var(--color-ink-2)", lineHeight: 1.5, padding: "0 4px" }}>{taxFocus.desc}</p>
      )}

      {/* [ETF 재구성 Phase1] 연도별 개인투자 절세 방안 — 기존 '세금·절세'(미실현 전량매도)와
          '올해 실현 양도차익'을 연도 기준 한 카드로 묶음. 일반계좌 250만 공제·손익통산. */}
      {etfTab === "rec" && taxOpen && (() => {
        const yr = new Date(Date.now() + 9 * 3600 * 1000).getUTCFullYear();
        const yrItems = realized.filter((r) => String(r.date).startsWith(String(yr)));
        const net = yrItems.reduce((s, r) => s + (Number(r.gainKrw) || 0), 0);
        const DED = 2500000;
        const used = Math.min(DED, Math.max(0, net));
        const remain = Math.max(0, DED - Math.max(0, net));
        const taxY = Math.max(0, Math.round((net - DED) * 0.22));
        return (
          <section className="card">
            <div className="label">🧾 연도별 개인투자 절세 방안 <span className="sub">일반계좌 · 250만 공제·손익통산</span></div>

            {/* (1) 올해 실현 양도차익 — 브로커 매도내역 기준 직접 입력 */}
            <div className="op-h">📆 올해({yr}) 실현 양도차익
              <button className="rz-add" onClick={() => setAddReal((v) => !v)}>{addReal ? "취소" : "＋ 기록"}</button>
            </div>
            {addReal && (
              <div className="rz-form">
                <input className="rz-in" placeholder="종목(예: SMH)" value={rTicker} onChange={(e) => setRTicker(e.target.value)} />
                <input className="rz-in num" type="number" inputMode="decimal" placeholder="실현손익(만원, 손실 -)" value={rGain} onChange={(e) => setRGain(e.target.value)} />
                <input className="rz-in" type="date" value={rDate} onChange={(e) => setRDate(e.target.value)} />
                <button className="rz-save" onClick={addRealized}>추가</button>
              </div>
            )}
            {yrItems.length > 0 ? (
              <div className="rz-list">
                {yrItems.map((r) => (
                  <div className="rz-row" key={r.id}>
                    <span className="rz-t">{r.ticker}</span>
                    <span className={`rz-g ${r.gainKrw >= 0 ? "up" : "dn"}`}>{r.gainKrw >= 0 ? "+" : ""}{won(r.gainKrw)}원</span>
                    <span className="rz-d">{String(r.date).slice(5)}</span>
                    <button className="rz-x" onClick={() => delRealized(r.id)} aria-label="삭제">✕</button>
                  </div>
                ))}
              </div>
            ) : <div className="rz-empty">올해 실현 매도 기록이 없습니다. 브로커에서 판 ETF의 실현손익(만원)을 기록하면 <b>연 250만 공제 사용액</b>과 <b>올해 낼 양도세</b>를 추적합니다.</div>}
            {yrItems.length > 0 && (
              <div className="rz-sum">
                <div className="rz-srow"><span>실현 누계(손익통산)</span><b className={net >= 0 ? "up" : "dn"}>{net >= 0 ? "+" : ""}{won(net)}원</b></div>
                <div className="rz-srow"><span>연 250만 공제</span><b>사용 {won(used)} · 남은 {won(remain)}</b></div>
                <div className="rz-srow big"><span>올해 실현 기준 양도세</span><b className="neg">{won(taxY)}원</b></div>
              </div>
            )}

            {/* (2) 미실현 — 지금 전량 매도 시(확정 계산) */}
            {tax && (
              <>
                <div className="op-h" style={{ marginTop: 16 }}>💰 지금 전량 매도 시(미실현)
                  <span className="tax-info" title="일반 계좌(해외상장 ETF) 기준 계산입니다. 연금·ISA 계좌는 세제가 다르므로 '보유' 탭 '내 ETF' 계좌 버킷에서 확인하세요.">ⓘ</span>
                </div>
                <div className="tax-line"><span>전량 매도 시 양도세</span><b className="neg">{won(tax.tax_all)}원</b></div>
                <div className="tax-hint">순이익 {won(tax.net)}원 − 기본공제 250만 = 과세표준 {won(tax.base_all)}원 × 22%</div>
                <div className="tax-hint sub">
                  손실종목({tax.losses?.map((l) => l.ticker).join("·") || "-"}) <span className="term" title="같은 과세연도 내 이익과 손실을 합산해 순이익에만 과세하는 것. 손실 종목을 함께 매도하면 과세표준이 줄어듭니다.">손익통산</span> 후. <span className="term" title="평가손실 종목을 연내 매도해 손실을 확정(실현)하고, 이익 실현은 다음 해로 미뤄 올해 과세표준을 낮추는 절세 기법.">손실수확</span>+이익이연 시 올해 0원 가능.
                </div>
              </>
            )}
            <div className="tax-disclaim">※ 실현분은 브로커 매도내역 기준 직접 입력이며, 미실현(현재 보유)은 별개입니다. ⚖️ {TAX_DISCLAIMER}</div>
          </section>
        );
      })()}

      {/* 5) 종목별 수익 분해 — 총투자액/총이익금 SummaryBar + 3열 정렬(시안) */}
      {etfTab === "hold" && positions.length > 0 && (
        <section className="card">
          {/* [D4] 상세는 기본 접힘 — 페이지 길이 축약(A1 동일 원칙) */}
          <button className="etf-acc-h" onClick={() => setDetailOpen((o) => !o)} aria-expanded={detailOpen}>
            <span className="label" style={{ margin: 0 }}>종목별 수익 분해 <span className="sub">{positions.length}종목</span></span>
            <span className="etf-caret">{detailOpen ? "▾" : "▸"}</span>
          </button>
          {detailOpen && (<>
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
                {/* [실시간 재계산] 수량(백엔드 제공 or 직접 입력) × 실측 종가 → 실시간 평가금액 */}
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
          <div className="ebd-note">왼쪽은 투자액, 가운데는 자체수익(달러)·환차손익, 오른쪽은 원화 실질수익률과 이익금입니다. 수량을 입력하면 실측 종가로 <b>실시간 평가금액</b>이 계산됩니다.</div>
          </>)}
        </section>
      )}

      {/* 6) 내 ETF — 자동 시세 갱신. [사용자 지시] 신규 매수/매도 입력(대량가져오기·매수매도
          기록 폼)은 우측 하단 "+" 버튼과 중복이라 삭제 — 목록·수정·삭제는 이 카드에 유지. */}
      {etfTab === "hold" && (
      <section className="card myetf">
        <div className="label">🧾 내 ETF <span className="sub">시세 자동 갱신</span>
          {myTotal > 0 && <span className="me-total">평가 {won(myTotal)}원</span>}
        </div>
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
                            <span className="me-tk">
                              {h.ticker}{h.broker ? <span className="me-broker">{h.broker}</span> : null}
                              {(() => {
                                // [투자지역] 상장시장(market)과 별개로, 실제 투자대상 지역을 표기.
                                //   국내상장 해외추종(예: TIGER 미국나스닥)이 '국내'로 보이던 문제 해소.
                                const c = classifyEtf(h.ticker);
                                if (!c) return null;
                                const overseas = c.r === "해외";
                                return (
                                  <span className={`me-region ${overseas ? "os" : "dm"}`}>
                                    {overseas ? "🌏" : "🇰🇷"} {c.a}
                                  </span>
                                );
                              })()}
                            </span>
                            <span className="me-qty">{h.shares}주 · 평단 {h.avgCcy === "USD" ? "$" : ""}{h.avgPrice.toLocaleString()}{h.avgCcy === "KRW" ? "원" : ""}</span>
                          </div>
                          <div className="me-r">
                            <span className="me-px">{m.curPx != null ? `${m.curCcy === "USD" ? "$" : ""}${m.curPx.toLocaleString()}${m.curCcy === "KRW" ? "원" : ""}` : "시세 조회 중…"}</span>
                            <span className="me-sub2">
                              {m.valueKrw != null && <span className="me-val">{won(m.valueKrw)}원</span>}
                              {m.pnlPct != null && <span className={`me-pnl ${sign(m.pnlPct)}`}>{pct(m.pnlPct)}</span>}
                            </span>
                          </div>
                          <div className="me-act">
                            <button className="me-edit" onClick={() => editHolding(h)} aria-label={`${h.ticker} 수정`}>수정</button>
                            <button className="me-del" onClick={() => delHolding(h)} aria-label={`${h.ticker} 삭제`}>삭제</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="me-tax">{ACCT_TAX[acct]}</div>
                  {/* [계좌 세분화] 연금 세액공제 진행률 — 개인연금+IRP 합산(연 900만) 기준. 첫 연금 그룹에 1회만 표시 */}
                  {acct === firstPension && (() => {
                    const limit = pensionCreditLimitCombined();
                    const penRows = okHoldings.filter((h) => isPensionAcct(h.account || "일반"));
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

        {/* [2026-08-23] 증권사 계좌내역 파일로 일괄 입력 */}
        <button type="button" className="bulk-toggle" onClick={() => setBulkOpen((v) => !v)}>
          {bulkOpen ? "일괄 입력 닫기" : "📥 계좌내역 파일로 일괄 입력"}
        </button>
        {bulkOpen && (
          <div className="bulk-panel">
            <div className="bulk-help">증권사 "계좌별잔고" 내보내기 파일(.xls, 여러 개 선택 가능)을 올리면 종목명·수량·매입금액을 읽어옵니다. <b>티커는 자동으로 못 채우니 아래에서 직접 입력</b>한 뒤 등록하세요. 수량이 없는 항목은 펀드/디폴트옵션 또는 현금으로 보고 이름+평가금액만으로 따로 등록할 수 있습니다. 국내/해외 구분은 이름으로 추측한 값이라, 국문 표기된 해외 개별주(예: "팔란티어 테크")는 직접 "해외상장"으로 바꿔주세요.</div>
            <input type="file" accept=".xls,.html,.htm" multiple onChange={(e) => onBulkFiles(e.target.files)} />
            {bulkRows.length > 0 && (
              <>
                <div className="bulk-rows">
                  {bulkRows.map((r) => (
                    <div key={r.id} className={`bulk-row ${r.skip && !r.isFundCandidate ? "skip" : ""}`}>
                      {r.isFundCandidate ? (
                        <div className="bulk-fund">
                          <span className="bulk-name" title={r.name}>{r.isCash ? "💰 " : ""}{r.name}</span>
                          <span className="bulk-fund-val">평가금액 {r.evalAmt.toLocaleString()}원</span>
                          <select className="bulk-in" value={r.account} onChange={(e) => updateBulkRow(r.id, { account: e.target.value })} disabled={r.registered}>
                            {ACCOUNTS.map((a) => <option key={a} value={a}>{a}</option>)}
                          </select>
                          {r.registered ? (
                            <span className="bulk-fund-done">✓ {r.isCash ? "현금으로" : "기타자산으로"} 등록됨</span>
                          ) : (
                            <button type="button" className="bulk-fund-btn" onClick={() => registerBulkRowAsFund(r)}>{r.isCash ? "현금으로 등록" : "펀드/기타자산으로 등록"}</button>
                          )}
                        </div>
                      ) : (
                        <>
                          <label className="bulk-skip">
                            <input type="checkbox" checked={!r.skip} onChange={(e) => updateBulkRow(r.id, { skip: !e.target.checked })} />
                            <span className="bulk-name" title={r.name}>{r.name}</span>
                          </label>
                          {!r.skip && (
                            <div className="bulk-fields">
                              <TickerSearchBox value={r.ticker} placeholder="티커/이름 검색(SCHD, 삼성전자)"
                                onChange={(v) => updateBulkRow(r.id, { ticker: v })}
                                onSelect={(sel) => updateBulkRow(r.id, { ticker: sel.ticker, market: sel.market })} />
                              <input className="bulk-in" type="number" placeholder="수량" value={r.shares}
                                onChange={(e) => updateBulkRow(r.id, { shares: e.target.value })} />
                              <input className="bulk-in" type="number" placeholder="평균매입가" value={r.avgPrice}
                                onChange={(e) => updateBulkRow(r.id, { avgPrice: e.target.value })} />
                              <select className="bulk-in" value={r.ccy} onChange={(e) => updateBulkRow(r.id, { ccy: e.target.value })}>
                                <option value="KRW">KRW</option><option value="USD">USD</option>
                              </select>
                              <select className="bulk-in" value={r.market} onChange={(e) => updateBulkRow(r.id, { market: e.target.value })}>
                                <option value="kr">국내상장</option><option value="us">해외상장</option>
                              </select>
                              <select className="bulk-in" value={r.account} onChange={(e) => updateBulkRow(r.id, { account: e.target.value })}>
                                {ACCOUNTS.map((a) => <option key={a} value={a}>{a}</option>)}
                              </select>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  ))}
                </div>
                <button type="button" className="bulk-submit" onClick={submitBulkRows}>선택한 종목 일괄 등록</button>
              </>
            )}
            {bulkMsg && <div className="bulk-msg">{bulkMsg}</div>}
          </div>
        )}

        {/* [ETF 재구성 Phase1] 기타 금융자산은 아래 별도 카드(추가·수정·매도)로 분리 */}

        {/* [사용자 지시] 신규 매수/매도 등록용 상시 노출 폼은 "+" 버튼과 중복이라 삭제하고,
            기존 보유 "수정" 전용으로만 남긴다 — editHolding 클릭 시에만 나타난다.
            보유 목록(이 보유 탭)에서만 트리거되므로 이 카드 안에 유지한다. */}
        {editingHolding && (
        <div className="me-form">
          <div className="mf-tabs">
            <span className="mf-editing">✎ 보유 수정 중</span>
            {[["buy", "매수 기록"], ["sell", "매도 기록"]].map(([k, l]) => (
              <button key={k} type="button" className={`mf-tab ${form.side === k ? "on" : ""}`}
                onClick={() => { setForm((f) => ({ ...f, side: k })); setFormMsg(""); }}>{l}</button>
            ))}
            <button type="button" className="mf-close" onClick={closeEditForm} aria-label="수정 닫기">✕</button>
          </div>
          <div className="mf-grid">
            <label className="mf-f mf-tk">
              <span>티커 또는 이름 검색</span>
              <TickerSearchBox value={form.ticker} placeholder="SCHD / 069500 / 삼성전자"
                onChange={(v) => setForm((f) => ({ ...f, ticker: v }))}
                onSelect={(r) => setForm((f) => ({ ...f, ticker: r.ticker, market: r.market }))} />
            </label>
            <label className="mf-f">
              <span>수량</span>
              <input type="number" inputMode="decimal" value={form.shares} placeholder="10"
                onChange={(e) => setForm((f) => ({ ...f, shares: e.target.value }))} />
            </label>
            {form.side === "buy" && (
              <label className="mf-f">
                <span>평단</span>
                <input type="number" inputMode="decimal" value={form.price} placeholder="78"
                  onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} />
              </label>
            )}
            {form.side === "buy" && (
              <label className="mf-f">
                <span>통화</span>
                <select value={form.ccy} onChange={(e) => setForm((f) => ({ ...f, ccy: e.target.value }))}>
                  <option value="USD">USD</option><option value="KRW">KRW</option>
                </select>
              </label>
            )}
            <label className="mf-f">
              <span>계좌</span>
              <select value={form.account} onChange={(e) => setForm((f) => ({ ...f, account: e.target.value }))}>
                {ACCOUNTS.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </label>
            {form.side === "buy" && (
              <label className="mf-f">
                <span>상장 시장</span>
                <select value={form.market} onChange={(e) => setForm((f) => ({ ...f, market: e.target.value }))}>
                  <option value="auto">자동(티커로 판단)</option>
                  <option value="kr">국내 상장</option>
                  <option value="us">해외 상장</option>
                </select>
              </label>
            )}
          </div>
          <button className="mf-submit" onClick={submitTrade}>
            {form.side === "buy" ? "매수 기록" : "매도 기록"}
          </button>
          {formMsg && <div className="mf-msg">{formMsg}</div>}
        </div>
        )}
        <div className="me-foot">시세는 공개 소스(stooq)에서 5분 캐시로 자동 갱신 · USD는 오늘 환율({fxRate ? `${Math.round(fxRate).toLocaleString()}원` : "조회 중"})로 원화 환산 · 참고용 · 신규 매수/매도는 우측 하단 “+”</div>
      </section>
      )}

      {/* [ETF 재구성 Phase1] 기타 금융자산 — 추가·수정(평가액 갱신)·매도/인출(차감)·삭제. 계좌별 그룹. */}
      {etfTab === "hold" && (
        <section className="card oa-card">
          <div className="label">💼 기타 금융자산 <span className="sub">펀드·채권·현금·디폴트옵션</span>
            {otherAssetsSum > 0 && <span className="me-total">합계 {won(otherAssetsSum)}원</span>}
          </div>
          <div className="oa-add">
            <input className="oa-in oa-nm" placeholder="이름(예: 디폴트옵션 성장형)" value={oaForm.name}
              onChange={(e) => setOaForm((f) => ({ ...f, name: e.target.value }))} />
            <input className="oa-in oa-val" type="number" inputMode="decimal" placeholder="평가액(만원)" value={oaForm.valueKrw}
              onChange={(e) => setOaForm((f) => ({ ...f, valueKrw: e.target.value }))} />
            <select className="oa-in" value={oaForm.account} onChange={(e) => setOaForm((f) => ({ ...f, account: e.target.value }))}>
              {ACCOUNTS.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
            <select className="oa-in" value={oaForm.kind} onChange={(e) => setOaForm((f) => ({ ...f, kind: e.target.value }))}>
              {OTHER_KINDS.map((k) => <option key={k} value={k}>{OA_KIND_LABEL[k]}</option>)}
            </select>
            <button className="oa-add-btn" onClick={submitOtherAsset} disabled={!oaForm.name.trim() || !(Number(oaForm.valueKrw) >= 0)}>추가</button>
          </div>
          {otherAssets.length > 0 ? (
            <div className="oa-groups">
              {ACCOUNTS.filter((a) => otherAssets.some((o) => (o.account || "일반") === a)).map((acct) => {
                const rows = otherAssets.filter((o) => (o.account || "일반") === acct);
                const sub = rows.reduce((s, o) => s + (Number(o.valueKrw) || 0), 0);
                return (
                  <div className="oa-grp" key={acct}>
                    <div className="oa-grp-h">
                      <span className={`me-acct-badge ${isPensionAcct(acct) ? "pension" : acct === "ISA" ? "isa" : "normal"}`}>{acct}</span>
                      <span className="me-grp-sum">{won(sub)}원</span>
                    </div>
                    {rows.map((o) => (
                      <div className="oa-row" key={o.id}>
                        <div className="oa-main">
                          <span className="oa-name">{o.kind === "cash" ? "💰 " : ""}{o.name}<span className="oa-kind">{OA_KIND_LABEL[o.kind] || "펀드"}</span></span>
                          <span className="oa-val">{Number(o.valueKrw).toLocaleString()}원</span>
                        </div>
                        <div className="oa-act">
                          <button className="oa-btn" onClick={() => openOaAct(o, "edit")}>수정</button>
                          <button className="oa-btn" onClick={() => openOaAct(o, "sell")}>매도/인출</button>
                          <button className="oa-btn del" onClick={() => delOtherAsset(o)} aria-label="삭제">✕</button>
                        </div>
                        {oaActId === o.id && (
                          <div className="oa-edit">
                            <input className="oa-in" type="number" inputMode="decimal"
                              placeholder={oaActMode === "edit" ? "새 평가액(만원)" : "차감 금액(만원)"}
                              value={oaActVal} onChange={(e) => setOaActVal(e.target.value)} />
                            <button className="oa-commit" onClick={() => commitOaAct(o)}>{oaActMode === "edit" ? "평가액 갱신" : "인출 반영"}</button>
                            <button className="oa-cancel" onClick={closeOaAct}>취소</button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="me-empty">티커 없는 펀드·디폴트옵션·채권·현금을 등록하면 <b>계좌별 운용결과</b>가 보이고 총자산에 반영됩니다. 개인연금·퇴직연금 계좌로 넣으면 연금 운용현황도 함께 집계됩니다.</div>
          )}
          <div className="other-note">시세 자동 갱신이 안 되는 자산입니다 — 평가금액이 바뀌면 <b>수정</b>으로 갱신하거나 <b>매도/인출</b>로 차감하세요. 변경은 총자산(원장)에 즉시 반영됩니다.</div>
        </section>
      )}

      {etfTab === "hold" && <EtfDataStatus />}

      <div className="foot">확정 계산(수익·세금·중복도)은 입력값 기반. 예측(Forecast)은 통계적 시나리오(참고용·확정 아님). · 세무자문 아님</div>

      <BottomNav active="assets" />

      <style jsx>{`
        .etf { max-width: 480px; margin: 0 auto; padding: 0 14px calc(env(safe-area-inset-bottom, 0px) + 84px); font-family: var(--font-sans); color: var(--color-ink); }
        /* [사용자 지시] 상위 메뉴 고정 — 헤더+타이틀바를 뷰포트 상단에 붙인다 */
        .sticky-hdr { position: sticky; top: 0; z-index: 140; background: var(--color-bg); margin: 0 -14px; padding: 0 14px; }
        /* [ETF 재구성 Phase1] 보유|추천 상위 탭 (index.js .pwa-subtabs 패턴 복제) */
        .etf-subtabs { display: flex; gap: 6px; margin: 8px 0 6px; background: var(--color-card); border: 1px solid var(--color-line); border-radius: 12px; padding: 4px; box-shadow: var(--shadow-card); }
        .etf-subtab { flex: 1; min-height: 36px; padding: 0; background: none; border: none; border-radius: 9px; cursor: pointer; color: var(--color-ink-2); font-family: var(--font-sans); font-size: 0.8rem; font-weight: 700; }
        .etf-subtab.active { background: var(--color-primary); color: #fff; }
        /* [ETF 재구성 Phase1] 종목 추천 카드 */
        .etf-reco .reco-list { display: flex; flex-direction: column; gap: 8px; }
        .reco-item { border-left: 3px solid var(--color-primary); background: var(--color-card-soft); border-radius: 10px; padding: 10px 12px; }
        .reco-item.sector { border-left-color: var(--color-warning); }
        .reco-top { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
        .reco-nm { font-size: 0.84rem; font-weight: 800; color: var(--color-ink); }
        .reco-axis { font-size: 0.62rem; font-weight: 800; color: var(--color-ink-3); background: var(--color-card); border: 1px solid var(--color-line); border-radius: 999px; padding: 1px 8px; white-space: nowrap; }
        .reco-why { font-size: 0.76rem; color: var(--color-ink-2); line-height: 1.55; margin-top: 5px; word-break: keep-all; }
        .reco-ai { display: inline-block; font-size: 0.56rem; font-weight: 800; color: #fff; background: var(--color-primary); border-radius: 4px; padding: 1px 5px; margin-right: 6px; vertical-align: middle; letter-spacing: .3px; }
        .reco-note { font-size: 0.66rem; color: var(--color-ink-3); margin-top: 12px; line-height: 1.5; word-break: keep-all; }
        .reco-note b { color: var(--color-ink-2); }
        /* [ETF 재구성 Phase1] 연금운영/절세 카드 소제목 */
        .op-h { font-size: 0.8rem; font-weight: 800; color: var(--color-ink); margin: 4px 0 8px; display: flex; align-items: center; gap: 6px; }
        .op-h .rz-add { margin-left: auto; float: none; }
        .op-h .pc-scope { font-weight: 700; }
        /* [ETF 재구성 Phase1] 기타 금융자산 카드 */
        .oa-card .me-total { float: right; font-size: 0.72rem; font-weight: 800; color: var(--color-primary); }
        .oa-add { display: grid; grid-template-columns: 1.6fr 1fr; gap: 6px; margin-bottom: 12px; }
        .oa-in { border: 1px solid var(--color-line); background: var(--color-bg); border-radius: 9px; padding: 9px 10px; font-size: 0.82rem; font-family: var(--font-sans); color: var(--color-ink); min-width: 0; }
        .oa-in:focus { outline: none; border-color: var(--color-primary); }
        .oa-add-btn { grid-column: 1 / -1; border: none; border-radius: 10px; padding: 10px 0; background: var(--color-primary); color: #fff; font-size: 0.82rem; font-weight: 800; font-family: var(--font-sans); cursor: pointer; }
        .oa-add-btn:disabled { opacity: 0.5; cursor: default; }
        .oa-groups { display: flex; flex-direction: column; gap: 14px; }
        .oa-grp-h { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
        .oa-row { background: var(--color-card-soft); border-radius: 11px; padding: 9px 12px; margin-bottom: 6px; }
        .oa-main { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
        .oa-name { font-size: 0.8rem; font-weight: 700; color: var(--color-ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
        .oa-kind { margin-left: 6px; font-size: 0.6rem; font-weight: 700; color: var(--color-ink-3); background: var(--color-card); border: 1px solid var(--color-line); border-radius: 999px; padding: 1px 7px; }
        .oa-val { font-size: 0.8rem; font-weight: 700; color: var(--color-ink); font-family: ui-monospace, monospace; white-space: nowrap; flex-shrink: 0; }
        .oa-act { display: flex; gap: 6px; margin-top: 8px; }
        .oa-btn { border: 1px solid var(--color-line); background: var(--color-card); color: var(--color-ink-2); border-radius: 7px; padding: 4px 9px; font-size: 0.68rem; font-weight: 700; font-family: var(--font-sans); cursor: pointer; }
        .oa-btn.del { margin-left: auto; color: var(--color-danger); border-color: var(--color-danger); }
        .oa-edit { display: flex; gap: 6px; margin-top: 8px; flex-wrap: wrap; }
        .oa-edit .oa-in { flex: 1 1 120px; }
        .oa-commit { border: none; background: var(--color-primary); color: #fff; border-radius: 8px; padding: 8px 12px; font-size: 0.74rem; font-weight: 800; font-family: var(--font-sans); cursor: pointer; }
        .oa-cancel { border: 1px solid var(--color-line); background: var(--color-card); color: var(--color-ink-2); border-radius: 8px; padding: 8px 12px; font-size: 0.74rem; font-weight: 700; font-family: var(--font-sans); cursor: pointer; }
        /* [D4] 접기 헤더 — 라벨 전체가 44px 타깃 */
        .etf-acc-h { width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 44px; background: none; border: none; padding: 0; cursor: pointer; font-family: var(--font-sans); text-align: left; }
        .etf-caret { color: var(--color-ink-3); font-size: 0.9rem; flex-shrink: 0; }
        .err { background: var(--color-danger-soft); color: var(--color-danger); padding: 10px 12px; border-radius: 10px; font-size: 0.82rem; margin-bottom: 12px; }
        .loading { color: var(--color-ink-2); padding: 24px; text-align: center; }
        .card { background: var(--color-card); border: 1px solid var(--color-line); border-radius: var(--radius-card); padding: 16px; margin-bottom: 12px; box-shadow: var(--shadow-card); }
        /* HERO — [사용자 지시] 다른 페이지처럼 밝은 카드로 통일(짙은 네이비 배경 삭제) */
        .hero { background: var(--color-card); color: var(--color-ink); border: 1px solid var(--color-line); border-radius: var(--radius-card, 14px); padding: 16px; box-shadow: var(--shadow-card); margin-bottom: 12px; }
        .hero .eyebrow { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 14px; }
        .hero .lbl { font-size: 12px; font-weight: 700; color: var(--color-ink-2); }
        .live { background: var(--color-success); color: #04351f; font-size: 9px; font-weight: 800; padding: 3px 7px; border-radius: 5px; letter-spacing: .5px; display: inline-flex; align-items: center; gap: 4px; }
        /* [실시간] 갱신 표기 · 새로고침 · 라이브 점멸 */
        .live-wrap { display: inline-flex; align-items: center; gap: 8px; }
        .fresh-ago { font-size: 10px; font-weight: 700; color: var(--color-ink-2); white-space: nowrap; }
        .refresh-btn { width: 24px; height: 24px; border-radius: 50%; border: 1px solid var(--color-line); background: var(--color-card-soft); color: var(--color-ink); font-size: 13px; line-height: 1; cursor: pointer; display: grid; place-items: center; font-family: var(--font-sans); }
        .refresh-btn.spin { animation: etf-spin .7s linear; }
        @keyframes etf-spin { from { transform: rotate(0); } to { transform: rotate(360deg); } }
        .live-dot { width: 5px; height: 5px; border-radius: 50%; background: currentColor; animation: etf-pulse 1.4s ease-in-out infinite; }
        @keyframes etf-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.25; } }
        .hero .big { font-size: 32px; font-weight: 800; letter-spacing: -.8px; line-height: 1; color: var(--color-ink); }
        .big-live { font-size: 11px; font-weight: 800; color: var(--color-success); background: color-mix(in srgb, var(--color-success) 20%, transparent); padding: 3px 8px; border-radius: 6px; margin-left: 9px; vertical-align: middle; letter-spacing: 0; }
        .hsub-note { color: var(--color-ink-3); font-weight: 500; }
        .hero .big span { font-size: 19px; font-weight: 700; }
        .date-flag { display: inline-block; margin-left: 7px; font-size: 10px; font-weight: 800; padding: 2px 7px; border-radius: 6px; letter-spacing: .2px; vertical-align: middle; }
        .date-flag.fresh { background: color-mix(in srgb, var(--color-success) 22%, transparent); color: var(--color-success); }
        .date-flag.stale { background: color-mix(in srgb, var(--color-warning) 22%, transparent); color: var(--color-warning); }
        .fx-note { display: inline-flex; align-items: center; gap: 6px; font-size: 11.5px; color: var(--color-ink-2); margin: -6px 0 4px; }
        .fx-note b { color: var(--color-ink); font-weight: 700; }
        .fx-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--color-success); flex-shrink: 0; }
        .fx-note.stale { color: var(--color-warning); }
        .fx-note.stale .fx-dot { background: var(--color-warning); }
        .fx-note.stale b { color: var(--color-warning); }
        .hero .hsub { font-size: 12.5px; color: var(--color-ink-2); margin-top: 9px; }
        .hero .hsub-other { margin-top: 4px; opacity: 0.85; }
        .hero .hsub b { color: var(--color-success); font-weight: 700; }
        .decomp-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; width: 100%; margin-top: 16px; padding: 11px 13px; background: var(--color-card-soft); border: 1px solid var(--color-line); border-radius: 12px; color: var(--color-ink); font-family: var(--font-sans); font-size: 13px; font-weight: 700; cursor: pointer; }
        .decomp-sum { font-size: 12px; font-weight: 600; color: var(--color-ink-3); }
        .decomp-sum b { color: var(--color-ink); font-weight: 800; }
        .decomp-caret { display: inline-block; transition: transform .2s; }
        .decomp-caret.open { transform: rotate(180deg); }
        .decomp { background: var(--color-card-soft); border: 1px solid var(--color-line); border-radius: 14px; padding: 14px; margin-top: 8px; }
        .drow { display: flex; align-items: center; justify-content: space-between; padding: 6px 0; }
        .drow .dk { font-size: 12.5px; color: var(--color-ink-2); font-weight: 500; }
        .drow .dv { font-size: 13px; font-weight: 700; color: var(--color-success); }
        .drow .dv.neg { color: var(--color-danger); }
        .drow.total { border-top: 1px solid var(--color-line); margin-top: 6px; padding-top: 11px; }
        .drow.total .dk { color: var(--color-ink); font-weight: 700; font-size: 13px; }
        .drow.total .dv { font-size: 16px; font-weight: 800; }
        .hero .foot-note { font-size: 11px; color: var(--color-ink-3); margin-top: 12px; line-height: 1.5; }
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
        /* [#1] 올해 실현 양도차익 추적 */
        .rz-add { float: right; border: 1px solid var(--color-primary); background: var(--color-card); color: var(--color-primary); border-radius: 8px; padding: 4px 10px; font-size: 0.7rem; font-weight: 700; cursor: pointer; font-family: var(--font-sans); }
        .rz-form { display: flex; flex-wrap: wrap; gap: 6px; margin: 4px 0 12px; }
        .rz-in { flex: 1 1 100%; border: 1px solid var(--color-line); border-radius: 8px; padding: 8px 10px; font-size: 0.82rem; font-family: var(--font-sans); background: var(--color-card); color: var(--color-ink); }
        .rz-in.num { flex: 1 1 45%; }
        .rz-save { flex: 1 1 100%; border: none; background: var(--color-primary); color: #fff; border-radius: 8px; padding: 9px 0; font-size: 0.8rem; font-weight: 800; cursor: pointer; font-family: var(--font-sans); }
        .rz-list { display: flex; flex-direction: column; margin-bottom: 4px; }
        .rz-row { display: flex; align-items: center; gap: 8px; padding: 8px 0; border-bottom: 1px solid var(--color-line); font-size: 0.8rem; }
        .rz-t { flex: 1; font-weight: 800; color: var(--color-ink); font-family: ui-monospace, monospace; }
        .rz-g { font-weight: 800; font-family: ui-monospace, monospace; } .rz-g.up { color: var(--color-success); } .rz-g.dn { color: var(--color-danger); }
        .rz-d { font-size: 0.7rem; color: var(--color-ink-3); font-family: ui-monospace, monospace; }
        .rz-x { border: none; background: none; color: var(--color-ink-3); cursor: pointer; font-size: 0.78rem; }
        .rz-empty { font-size: 0.76rem; color: var(--color-ink-2); line-height: 1.55; padding: 6px 0; word-break: keep-all; }
        .rz-sum { margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--color-line); display: flex; flex-direction: column; gap: 6px; }
        .rz-srow { display: flex; justify-content: space-between; align-items: baseline; font-size: 0.8rem; color: var(--color-ink-2); }
        .rz-srow b { font-family: ui-monospace, monospace; font-weight: 800; color: var(--color-ink); }
        .rz-srow b.up { color: var(--color-success); } .rz-srow b.dn { color: var(--color-danger); } .rz-srow b.neg { color: var(--color-danger); }
        .rz-srow.big { font-size: 0.92rem; font-weight: 800; } .rz-srow.big span { font-weight: 800; color: var(--color-ink); }
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
        .ev-risk { font-size: 0.8rem; color: var(--color-warning-ink); background: var(--color-warning-soft); border-radius: 10px; padding: 9px 12px; margin-top: 11px; line-height: 1.45; word-break: keep-all; }
        /* [§3-6] 리밸런싱 왜(조정 이유) */
        .rb-why { background: var(--color-card-soft); border-radius: 12px; padding: 12px 13px; margin-bottom: 12px; }
        .rb-why-h { font-size: 0.74rem; font-weight: 800; color: var(--color-ink-2); margin-bottom: 8px; }
        .rb-why-row { display: flex; gap: 9px; align-items: flex-start; padding: 4px 0; }
        .rb-why-n { flex-shrink: 0; width: 18px; height: 18px; border-radius: 6px; background: var(--color-primary-soft); color: var(--color-primary); font-size: 0.68rem; font-weight: 800; display: grid; place-items: center; margin-top: 1px; }
        .rb-why-t { font-size: 0.78rem; color: var(--color-ink); line-height: 1.5; word-break: keep-all; }
        /* [2026-08-23] 다음 매수 계좌 추천 */
        .nb-recs { margin-top: 12px; display: flex; flex-direction: column; gap: 8px; }
        .nb-rec { border-left: 3px solid var(--color-line); border-radius: 8px; padding: 8px 10px; background: var(--color-card-soft); display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 8px; }
        .nb-rec.good { border-left-color: var(--color-success); background: var(--color-success-soft); }
        .nb-rec.info { border-left-color: var(--color-primary); }
        .nb-rec-rank { font-size: 0.66rem; font-weight: 800; color: var(--color-ink-3); }
        .nb-rec-acct { font-size: 0.8rem; font-weight: 800; color: var(--color-ink); }
        .nb-rec-why { flex-basis: 100%; font-size: 0.76rem; color: var(--color-ink-2); line-height: 1.55; word-break: keep-all; }
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
        .me-region { font-size: 0.6rem; font-weight: 800; border-radius: 999px; padding: 1px 7px; white-space: nowrap; }
        .me-region.os { color: #2F6BFF; background: #EAF1FF; border: 1px solid #CFE0FF; }
        .me-region.dm { color: #0E9E6A; background: #E7FAF2; border: 1px solid #C7EFDD; }
        .me-qty { font-size: 0.68rem; color: var(--color-ink-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .me-r { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; flex-shrink: 0; }
        .me-px { font-size: 0.82rem; font-weight: 700; color: var(--color-ink); font-family: ui-monospace, monospace; }
        .me-sub2 { display: flex; align-items: center; gap: 8px; }
        .me-val { font-size: 0.7rem; color: var(--color-ink-2); font-family: ui-monospace, monospace; }
        .me-pnl { font-size: 0.76rem; font-weight: 800; font-family: ui-monospace, monospace; }
        .me-pnl.pos { color: var(--color-success); } .me-pnl.neg { color: var(--color-danger); }
        /* [S18 D-1] 보유 편집 — 수정·삭제를 한 쌍으로 */
        .me-act { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
        .me-edit { border: 1px solid var(--color-line); background: var(--color-card); color: var(--color-ink-2); border-radius: 7px; padding: 4px 8px; font-size: 0.68rem; font-weight: 700; font-family: var(--font-sans); cursor: pointer; }
        .me-del { flex-shrink: 0; border: 1px solid var(--color-danger, #E5484D); background: var(--color-card); color: var(--color-danger, #E5484D); border-radius: 7px; padding: 4px 8px; font-size: 0.68rem; font-weight: 700; font-family: var(--font-sans); cursor: pointer; }
        .me-empty { margin-top: 12px; font-size: 0.74rem; color: var(--color-ink-2); line-height: 1.6; background: var(--color-card-soft); border-radius: 11px; padding: 12px 14px; word-break: keep-all; }
        .me-empty b { color: var(--color-ink); font-weight: 700; }
        /* [2026-08-23] 계좌내역 일괄 입력 */
        .bulk-toggle { width: 100%; margin-top: 10px; padding: 10px; border-radius: 10px; border: 1px dashed var(--color-line); background: var(--color-card-soft); color: var(--color-ink-2); font-size: 0.78rem; font-weight: 700; cursor: pointer; font-family: var(--font-sans); }
        .bulk-panel { margin-top: 10px; padding: 12px; border-radius: 11px; background: var(--color-card-soft); }
        .bulk-help { font-size: 0.72rem; color: var(--color-ink-2); line-height: 1.6; margin-bottom: 10px; word-break: keep-all; }
        .bulk-help b { color: var(--color-ink); }
        .bulk-rows { display: flex; flex-direction: column; gap: 8px; margin-top: 12px; max-height: 420px; overflow-y: auto; }
        .bulk-row { padding: 8px; border-radius: 9px; background: var(--color-card); border: 1px solid var(--color-line); }
        .bulk-row.skip { opacity: 0.55; }
        .bulk-skip { display: flex; align-items: center; gap: 7px; cursor: pointer; }
        .bulk-name { font-size: 0.76rem; font-weight: 700; color: var(--color-ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .bulk-fields { display: grid; grid-template-columns: 1.4fr 1fr 1fr 0.8fr 1fr 1fr; gap: 5px; margin-top: 7px; }
        .bulk-in { font-size: 0.72rem; padding: 5px 6px; border-radius: 6px; border: 1px solid var(--color-line); background: var(--color-bg); color: var(--color-ink); font-family: var(--font-sans); min-width: 0; }
        .bulk-tk { font-weight: 700; }
        /* [2026-08-23] 이름으로 티커 검색 */
        .tk-search { position: relative; min-width: 0; }
        .tk-search .bulk-in { width: 100%; }
        .tk-dropdown { position: absolute; z-index: 20; top: calc(100% + 2px); left: 0; right: 0; max-height: 240px; overflow-y: auto; background: var(--color-card); border: 1px solid var(--color-line); border-radius: 8px; box-shadow: var(--shadow-card); }
        .tk-opt { display: flex; align-items: center; gap: 7px; width: 100%; padding: 7px 9px; border: none; background: none; cursor: pointer; text-align: left; font-family: var(--font-sans); border-bottom: 1px solid var(--color-line); }
        .tk-opt:last-child { border-bottom: none; }
        .tk-opt:hover { background: var(--color-card-soft); }
        .tk-opt-tk { font-size: 0.7rem; font-weight: 800; color: var(--color-primary); font-family: ui-monospace, monospace; flex-shrink: 0; }
        .tk-opt-nm { flex: 1 1 0; font-size: 0.72rem; color: var(--color-ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .tk-opt-kind { font-size: 0.6rem; font-weight: 700; color: var(--color-ink-3); background: var(--color-card-soft); border-radius: 999px; padding: 1px 6px; flex-shrink: 0; }
        .bulk-submit { width: 100%; margin-top: 12px; padding: 11px; border-radius: 10px; border: none; background: var(--color-primary); color: #fff; font-size: 0.84rem; font-weight: 800; cursor: pointer; font-family: var(--font-sans); }
        .bulk-msg { margin-top: 9px; font-size: 0.74rem; color: var(--color-ink-2); line-height: 1.6; word-break: keep-all; }
        .bulk-fund { display: flex; flex-wrap: wrap; align-items: center; gap: 7px; }
        .bulk-fund-val { font-size: 0.72rem; font-weight: 700; color: var(--color-ink-2); font-family: ui-monospace, monospace; }
        .bulk-fund-btn { font-size: 0.7rem; font-weight: 800; padding: 5px 10px; border-radius: 7px; border: none; background: var(--color-primary); color: #fff; cursor: pointer; font-family: var(--font-sans); }
        .bulk-fund-done { font-size: 0.72rem; font-weight: 700; color: var(--color-success, #0E9E6A); }
        /* [2026-08-23] 기타 금융자산 목록 */
        .other-assets { margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--color-line); }
        .other-h { font-size: 0.78rem; font-weight: 800; color: var(--color-ink); margin-bottom: 8px; }
        .other-sub { font-size: 0.66rem; font-weight: 600; color: var(--color-ink-3); margin-left: 6px; }
        .other-row { display: flex; align-items: center; gap: 8px; padding: 7px 0; border-bottom: 1px solid var(--color-line); }
        .other-name { flex: 1 1 0; font-size: 0.76rem; font-weight: 700; color: var(--color-ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .other-acct { margin-left: 6px; font-size: 0.62rem; font-weight: 700; color: var(--color-ink-3); background: var(--color-card-soft); border-radius: 999px; padding: 1px 7px; }
        .other-val { font-size: 0.78rem; font-weight: 700; color: var(--color-ink); font-family: ui-monospace, monospace; white-space: nowrap; }
        .other-del { border: none; background: none; color: var(--color-ink-3); font-size: 0.8rem; cursor: pointer; padding: 2px 4px; }
        .other-note { font-size: 0.68rem; color: var(--color-ink-3); margin-top: 8px; line-height: 1.6; word-break: keep-all; }
        /* [S18 D-1] 매수·매도 기록 폼 */
        .me-form { border-top: 1px solid var(--color-line); margin-top: 12px; padding-top: 12px; }
        .mf-tabs { display: flex; align-items: center; gap: 6px; margin-bottom: 10px; }
        .mf-editing { font-size: 0.76rem; font-weight: 800; color: var(--color-ink-2); }
        .mf-close { flex: none; width: 26px; height: 26px; border: none; background: var(--color-card-soft, var(--color-line)); border-radius: 50%; color: var(--color-ink-2); font-size: 12px; cursor: pointer; }
        .mf-tab { flex: 1 1 0; min-height: 36px; border: 1px solid var(--color-line); background: var(--color-card); color: var(--color-ink-2); border-radius: 9px; font-size: 0.78rem; font-weight: 700; font-family: var(--font-sans); cursor: pointer; }
        .mf-tab.on { border-color: var(--color-primary); color: var(--color-primary); background: var(--color-card-soft); }
        .mf-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
        .mf-f { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
        .mf-f.mf-tk { grid-column: 1 / -1; }
        .mf-f span { font-size: 0.68rem; font-weight: 700; color: var(--color-ink-3); }
        .mf-f input, .mf-f select { width: 100%; min-height: 40px; box-sizing: border-box; border: 1px solid var(--color-line); border-radius: 9px; padding: 8px 10px; font-size: 0.82rem; font-family: var(--font-sans); background: var(--color-card); color: var(--color-ink); }
        .mf-submit { width: 100%; min-height: 44px; margin-top: 10px; border: none; border-radius: 10px; background: var(--color-primary); color: var(--color-on-primary, #fff); font-size: 0.85rem; font-weight: 800; font-family: var(--font-sans); cursor: pointer; }
        .mf-msg { margin-top: 8px; font-size: 0.74rem; line-height: 1.5; color: var(--color-ink-2); word-break: keep-all; }
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
        /* [S18 C-5] 제안 근거 배지 · 목표 미설정 잠금 안내 */
        .todo-why { font-size: 0.68rem; font-weight: 700; color: var(--color-ink-3); margin-top: 4px; word-break: keep-all; }
        .todo-locked { display: flex; flex-direction: column; gap: 4px; background: var(--color-card-soft); border: 1px solid var(--color-line); border-radius: 10px; padding: 11px 12px; margin-bottom: 10px; }
        .todo-locked b { font-size: 0.78rem; color: var(--color-ink); }
        .todo-locked span { font-size: 0.72rem; color: var(--color-ink-3); line-height: 1.5; word-break: keep-all; }
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
