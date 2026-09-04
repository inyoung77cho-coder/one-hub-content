// AI자산 페이지 v11.0-ASSET-01 — 단일 소스(SSOT) 재설계. 목업 ai-assets-v4.html 정본.
//   모든 섹션(총자산/유동점수/구조리스크/오늘할일/주식형균형/리밸런싱)을 computeSummary() 하나로 계산.
//   백엔드(auto_trade) 미도달 환경 → 스냅샷·정책·점수·세금리밸런싱을 브라우저에서 계산(작업지시서 §2~§5).
//   지역/섹터(§4 Sprint 4)는 실제 ETF/주식 메타 연결 전까지 '데모 데이터' 배지 유지(§6).
import { useEffect, useState } from "react";
import Link from "next/link";
import TopNav from "../../components/TopNav";
import { computeSummary, toManwon } from "../../lib/aiAssets";
import { getTrader } from "../../lib/trader";
import { getLedger } from "../../lib/ledger";
import { recordSnapshot } from "../../lib/assetHistory"; // [S22-3] AI 탭 진입 시에도 총자산 곡선 적립
import { cachedJson } from "../../lib/quoteCache"; // [S29-3] GET 디둡·캐시
import { acctRule } from "../../lib/taxRules";
import { getStockHoldings } from "../../lib/stockHoldings";
import EtfDataStatus from "../../components/EtfDataStatus";
import EtfMarketNews from "../../components/EtfMarketNews";
import { getHoldings as getEtfHoldings } from "../../lib/etfHoldings";

const UK = 1e8; // 억 → 원

// [2026-08-10] §6 데모 해제(지역만) — 백엔드 종목 검색 API(/api/stocks/search)의 theme 필드를
//   실제 확인해보니 삼성전자조차 검색이 안 되고 다른 종목도 theme:"" 로 비어 있어(스크리너가
//   훑는 소수 종목만 분류됨, 임의 보유종목 커버리지 없음) 섹터는 데모 유지 — 잘못된 빈 데이터로
//   "실데이터"라고 보여주는 게 데모 배지보다 나쁘다고 판단. 지역(국내/해외)은 보유 종목의
//   market/ccy 필드로 완전히 로컬 계산 가능해(백엔드 의존 없음) 실데이터로 교체.
const DEMO_SECTORS = [
  { theme: "반도체", pct: 37 },
  { theme: "방산", pct: 22 },
  { theme: "시장대표", pct: 21 },
  { theme: "2차전지", pct: 18 },
  { theme: "IT", pct: 2 },
];

// 보유 주식·ETF의 market/ccy 필드로 국내/해외 실비중 계산(평단×수량 기준, 라이브시세 아님 —
//   stockHoldingsValueKrw()와 동일한 간이 환산 규칙). 환율 없으면 해외분 제외(과소평가 대신 누락).
function realRegion(stocks, etfs, fxRate) {
  let dom = 0, ovs = 0;
  for (const h of stocks || []) {
    const isUsd = h.ccy === "USD";
    if (isUsd && !fxRate) continue;
    const v = (Number(h.avgPrice) || 0) * (Number(h.shares) || 0) * (isUsd ? fxRate : 1);
    if (isUsd || h.market === "us") ovs += v; else dom += v;
  }
  for (const h of etfs || []) {
    const isUsd = h.avgCcy === "USD";
    if (isUsd && !fxRate) continue;
    const v = (Number(h.avgPrice) || 0) * (Number(h.shares) || 0) * (isUsd ? fxRate : 1);
    if (isUsd || h.market === "us") ovs += v; else dom += v;
  }
  const total = dom + ovs;
  if (total <= 0) return null;
  return { domestic: Math.round((dom / total) * 1000) / 10, overseas: Math.round((ovs / total) * 1000) / 10 };
}

const SECTOR_COLOR = {
  반도체: "var(--color-primary)", 방산: "var(--ob)", 시장대표: "var(--color-ink-3)",
  "2차전지": "var(--color-etf)", IT: "var(--color-success)", 배당: "var(--color-success)", 채권: "var(--color-ink-3)",
};
const sColor = (t) => SECTOR_COLOR[t] || "var(--color-ink-3)";

// [N1] 단일 소스 스냅샷 — ta(getLedger)는 '이미' 단일 원장이 낸 결과다.
//   여기서 온보딩값을 또 더하면 이중(주식·ETF·부동산은 삼중) 합산이 된다. 그대로 사용한다.
//   예수금(주식계좌 cash)만 원장에 없으므로 별도 합산.
function buildAssets(ta, dash) {
  const b = ta?.breakdown || {};
  const won = (uk) => (uk != null ? Number(uk) * UK : 0);
  const acctCash = dash?.balance?.cash != null ? Number(dash.balance.cash) : 0;
  return {
    stock: won(b.stock_uk),
    etf: won(b.etf_uk),
    realestate: won(b.realestate_uk),
    cash: won(b.cash_uk) + acctCash,
  };
}

export default function AIAdvisor() {
  const [s, setS] = useState(null); // computeSummary 결과(단일 소스)
  const [err, setErr] = useState(false);
  const [realtyState, setRealtyState] = useState(null); // [S1.1] 단일소스 부동산 입력상태
  const [ovTarget, setOvTarget] = useState(null); // [S6] 배분 실행: 해외 목표 비중(%) 슬라이더
  const [fundSrc, setFundSrc] = useState("cash"); // [S6] 스왑 재원(세금 효과가 달라짐)

  useEffect(() => {
    const load = () => {
      let goal = "";
      try { goal = localStorage.getItem("onehub_profile_goal") || ""; } catch (e) {}
      const tr = getTrader(); // [§3-8] 선택된 계좌(A/B) 반영
      // [N1] 총자산 소스를 getLedger(단일 원장)로 교체 — 기존엔 원시 total-asset을 직접 받아
      //   자체 규칙으로 온보딩을 또 더해(이중합산) 홈과 총자산이 달랐다. 부동산 입력상태도 같은 응답에서.
      Promise.all([
        getLedger(tr).catch(() => null),
        cachedJson(`/api/pwa-dashboard?trader=${tr}`).catch(() => null),
        cachedJson(`/api/fx/usdkrw`).catch(() => null),
      ]).then(([a, dash, fxj]) => {
        if (a && a.ok && a.total_uk != null) recordSnapshot(tr, a); // [S22-3] 곡선 적립(같은 날 병합)
        setRealtyState(a?.realty_state || null);
        const assets = buildAssets(a, dash);
        const fxRate = fxj?.ok ? fxj.rate : null;
        const region = realRegion(getStockHoldings(tr), getEtfHoldings(tr), fxRate);
        const equityMeta = { demo: false, region, sectors: DEMO_SECTORS };
        setS(computeSummary({ as_of: new Date().toISOString(), assets, tendencyOrStyle: goal, equityMeta }));
      }).catch(() => setErr(true));
    };
    load();
    // [§3-8] 다른 페이지에서 계좌 전환 시 즉시 재계산
    const onTrader = () => load();
    window.addEventListener("onehub-trader-change", onTrader);
    window.addEventListener("onehub-assets-change", onTrader); // [S3] 빠른입력 낙관적 갱신
    return () => { window.removeEventListener("onehub-trader-change", onTrader); window.removeEventListener("onehub-assets-change", onTrader); };
  }, []);

  const p = s?.policy;
  const eq = s?.equity;
  const risk = s?.structural_risk;

  // [S6] 배분 실행 슬라이더 기본값 = 온보딩 해외 목표(최초 1회)
  useEffect(() => {
    if (ovTarget == null && p?.overseas != null) setOvTarget(p.overseas);
  }, [p?.overseas, ovTarget]);
  const measured = s?.measurable && s?.liquid_score != null;
  // §3 유동 점수 색: 80+ 초록 / 50+ 앰버 / 미만 빨강 / 미측정 회색
  const scoreColor = !measured ? "var(--color-ink-3)"
    : s.liquid_score >= 80 ? "var(--color-success)"
    : s.liquid_score >= 50 ? "var(--color-warning)" : "var(--color-danger)";

  // 파생 표시값(§5 리밸런싱·오늘할일 금액 — equity + 데모 메타 기반)
  const overseasSwapWon = p && eq?.region ? Math.max(0, s.equity_won * ((p.overseas - eq.region.overseas) / 100)) : 0;
  const maxTheme = eq?.sectors?.[0];
  const diluteWon = p && maxTheme && maxTheme.pct > p.theme_cap ? s.equity_won * ((maxTheme.pct - p.theme_cap) / 100) : 0;
  const cashFloorTgtPct = p ? p.cash_floor : 0; // §5 현금 목표 = liquid × cash_floor (하한 유지)
  const curCashPct = s && s.liquid > 0 ? (s.assets.cash / s.liquid) * 100 : 0;
  const cashDeltaWon = s ? s.liquid * (cashFloorTgtPct / 100) - s.assets.cash : 0;
  const pctOfTotal = (v) => (s && s.total > 0 ? Math.round((v / s.total) * 1000) / 10 : 0);

  // [§3-2 피드백6] 지금 가장 큰 문제 한 줄(top_issue) — 점수 바로 아래 최상단 노출
  const curCashPctR = Math.round(curCashPct * 10) / 10;
  const topIssue = (() => {
    if (!measured || !p) return null;
    if (maxTheme && maxTheme.pct > p.theme_cap)
      return { txt: `${maxTheme.theme} ${maxTheme.pct}% 쏠림`, sub: `단일 테마 상한 ${p.theme_cap}% 초과 — 신규 매수를 타섹터로 희석하세요.`, color: "var(--color-danger)" };
    if (eq?.region && eq.region.domestic >= 100)
      return { txt: `주식형 국내 100% 쏠림`, sub: `목표 국내 ${p.domestic}% — 해외상장 ETF로 지역 분산이 필요합니다.`, color: "var(--color-danger)" };
    if (Math.abs(curCashPctR - p.cash_floor) > 3)
      return { txt: `현금 비중 ${curCashPctR}%`, sub: `현금 하한 ${p.cash_floor}% 대비 ${curCashPctR > p.cash_floor ? "초과 — 저노출 자산에 배치" : "부족 — 확보 권장"}.`, color: "var(--color-warning)" };
    return { txt: `배분 균형 양호`, sub: `유동자산 배분이 목표 범위 안에 있습니다.`, color: "var(--color-success)" };
  })();
  // [§3-2] 부동산 입력/미입력 상태 — 점수 스코프 오해(이미지1↔6) 방지 배너
  // [S1.1] 단일소스 realty_state 우선, 없으면 계산값 폴백 → 배너·총자산 일치
  const realtyEntered = realtyState ? realtyState === "entered" : !!(s && s.assets.realestate > 0);
  const realtyPct = risk ? Math.round(risk.ratio * 1000) / 10 : null;

  const CHIPS = s ? [
    ["주식", "var(--color-primary)", s.assets.stock],
    ["ETF", "var(--color-etf)", s.assets.etf],
    ["부동산", "var(--color-success)", s.assets.realestate],
    ["현금", "var(--color-warning)", s.assets.cash],
  ] : [];

  // [S6] 오늘 할 일 실행 건수(0~3 밴드) — 실제 조정이 필요한 액션만 카운트
  const todoCount = Math.min(3, (overseasSwapWon > 0 ? 1 : 0) + (diluteWon > 0 ? 1 : 0) + (Math.abs(cashDeltaWon) > s?.total * 0.01 ? 1 : 0));

  // [S6] 배분 제안 실행 카드 — 해외 목표비중 슬라이더 → 실시간 스왑액·세금·환효과(추정)
  const curOverseasPct = eq?.region ? eq.region.overseas : 0;
  const swapExecWon = eq && ovTarget != null ? s.equity_won * ((ovTarget - curOverseasPct) / 100) : 0; // +매수해외 / −회수국내
  const swapAbsWon = Math.abs(swapExecWon);
  // 세금(추정·전액 차익 가정 최대치): 재원별 세율 — 현금/국내주식형ETF=비과세, 국내기타=배당 15.4%, 해외=양도 22%
  const FUND = {
    cash: { label: "현금", rate: 0, note: "현금 재원 — 매도 없음·세금 0" },
    kr_equity_etf: { label: "국내주식형 ETF", rate: 0, note: "매매차익 비과세 — 세금 0" },
    kr_other_etf: { label: "국내 기타 ETF", rate: acctRule("일반").domestic_etf_dividend_rate || 0.154, note: "배당소득세 + 금융소득종합과세 주의" },
    overseas_etf: { label: "해외상장 ETF", rate: acctRule("일반").overseas_capital_gains_rate || 0.22, note: "양도세(250만 공제·손익통산 가능)" },
  };
  const fund = FUND[fundSrc] || FUND.cash;
  const swapTaxWon = swapExecWon > 0 ? swapAbsWon * fund.rate : 0; // 매수 방향일 때 재원 매도분 과세(최대 추정)
  const fxSensWon = swapExecWon > 0 ? swapAbsWon * 0.10 : 0; // 환효과: 신규 해외노출 × 환율 ±10% 민감도(추정)

  return (
    <div className="m pwa-shell">
      <TopNav active="ai" />

      {/* §1 금액 단위 — 페이지 전역 1곳만 */}
      <div className="unit-note">금액 단위 · <b>만원</b></div>

      {err && <div className="card err">AI 엔진 연결에 실패했습니다. 잠시 후 다시 시도하세요.</div>}

      {/* HERO — §3-2 AI 유동자산 배분 건강도 (부동산 제외). 점수 정의·스코프 상시 노출 */}
      <section className="hero">
        <div className="hero-top"><span className="t">🩺 AI 유동자산 배분 건강도</span></div>
        <div className="hero-cap">부동산(실물) 제외 · 유동자산 <span className="num">{s ? toManwon(s.liquid) : "—"}</span> 만원 기준 · 내 배분이 건강한지 진단합니다</div>
        {measured ? (
          <>
            <div className="score-row">
              <div className="score" style={{ color: scoreColor }}>{s.liquid_score}<small>점</small></div>
              <div className="score-def">배분적합도 <b>{s.subscores.allocation}</b> × 분산도 <b>{s.subscores.diversification}</b> 결합</div>
            </div>
            <div className="subscores">
              <div className="sub">
                <div className="k"><span>배분 적합도 <em>목표 대비</em></span><b>{s.subscores.allocation}</b></div>
                <div className="b"><i style={{ width: `${s.subscores.allocation}%`, background: "var(--color-warning)" }} /></div>
              </div>
              <div className="sub">
                <div className="k"><span>분산도 <em>쏠림 없음</em></span><b>{s.subscores.diversification}</b></div>
                <div className="b"><i style={{ width: `${s.subscores.diversification}%`, background: "var(--color-danger)" }} /></div>
              </div>
            </div>
          </>
        ) : (
          <div className="hero-pending">{!s ? "측정 준비 중…" : !p ? "온보딩 미완료 → 목표 산출 불가" : "유동자산 없음 → 측정 불가"}</div>
        )}
      </section>

      {/* [§3-2 피드백6] 지금 가장 큰 문제 — 점수 바로 아래 최상단 결론(VerdictCard) */}
      {topIssue && (
        <div className="verdict" style={{ borderLeftColor: topIssue.color }}>
          <div className="verdict-h"><span className="verdict-lbl">🎯 지금 가장 큰 문제</span><span className="verdict-key" style={{ color: topIssue.color }}>{topIssue.txt}</span></div>
          <div className="verdict-sub">{topIssue.sub}</div>
        </div>
      )}

      {/* [§3-2] 부동산 입력/미입력 상태 배너 — 점수 스코프 오해 방지 */}
      {s && (
        realtyEntered ? (
          <div className="realty-banner entered">
            🏠 부동산 실물 <b>{realtyPct}%</b> 보유 — AI 배분 점수는 <b>유동자산(주식·ETF·현금)만</b> 평가합니다. 부동산은 아래 구조 리스크로 별도 진단합니다.
          </div>
        ) : (
          <div className="realty-banner none">
            <div>🏠 <b>부동산 미입력</b> — 총자산·리밸런싱에서 제외 중입니다. 등록하면 자산 전체 진단에 반영됩니다.</div>
            <button className="realty-cta" onClick={() => { window.location.href = "/pwa/onboarding"; }}>부동산 등록 →</button>
          </div>
        )
      )}

      {/* §2 온보딩 기준 — 모든 목표의 단일 소스 */}
      {p ? (
        <div className="onboard">
          <div className="ob-top">🧬 온보딩 투자성향 <span className="ob-tag">{p.tendency}</span></div>
          <div className="ob-grid">
            <div><span className="obk">자산배분</span>주식 {p.stock} · ETF {p.etf} · 부동산 {p.realestate} · 현금 {p.cash}</div>
            <div><span className="obk">지역(주식형)</span>국내 {p.domestic} · 해외 {p.overseas}</div>
            <div><span className="obk">단일 테마 상한</span>{p.theme_cap}%</div>
            <div><span className="obk">현금 하한</span>{p.cash_floor}%</div>
          </div>
          <div className="ob-note">아래 모든 목표·상한은 이 결과에서 자동 산출됩니다. 성향 변경 시 설정 &gt; 온보딩 재실행.</div>
        </div>
      ) : (
        <div className="onboard">
          <div className="ob-top">🧬 온보딩 투자성향 <span className="ob-tag">미완료</span></div>
          <div className="ob-note" style={{ borderTop: "none", paddingTop: 0, marginTop: 4 }}>투자성향을 입력하면 목표·상한이 자동 산출됩니다. <Link href="/pwa/onboarding" className="ob-link">온보딩 하기 →</Link></div>
        </div>
      )}

      {/* §3 부동산 구조 리스크 (별도·앰버 좌측 보더) */}
      {s && risk && (
        <div className="risk">
          <div className="risk-top"><span style={{ fontSize: 18 }}>🏠</span><div className="t">부동산 구조 리스크</div><div className={`risk-badge g-${risk.grade}`}>{risk.grade}</div></div>
          <div className="risk-body">총자산의 <b>{(risk.ratio * 100).toFixed(1)}%(<span className="num">{toManwon(s.assets.realestate)}</span>)</b>가 실물 부동산. 즉시 조정 불가라 운영 점수에서 분리합니다. <b>신규 자금·매매 수익은 부동산 외 자산으로만.</b></div>
          <div className="risk-bar"><div className="real" style={{ width: `${(risk.ratio * 100).toFixed(1)}%` }} /><div className="liq" style={{ width: `${(100 - risk.ratio * 100).toFixed(1)}%` }} /></div>
          <div className="risk-legend"><span><i style={{ background: "var(--color-warning)" }} />부동산 {(risk.ratio * 100).toFixed(1)}%</span><span><i style={{ background: "var(--color-primary)" }} />유동자산 {(100 - risk.ratio * 100).toFixed(1)}%</span></div>
        </div>
      )}

      {/* 총자산 — 단일 소스 */}
      {s && (
        <div className="card">
          <div className="total-head"><div className="lbl">총자산</div><div className="val num">{toManwon(s.total)}</div></div>
          {!realtyEntered && <div className="total-note">🏠 부동산 미입력 · 총자산 = <b>주식+ETF+현금 확정합</b></div>}
          <div className="grid4">
            {CHIPS.map(([label, color, val]) => {
              // [B10] 부동산 미입력 → 회색 placeholder + 지금 등록 CTA
              const missing = label === "부동산" && !realtyEntered;
              return (
                <div className={`chip ${missing ? "missing" : ""}`} key={label}>
                  <div className="k"><i style={{ background: missing ? "var(--color-ink-3)" : color }} />{label}</div>
                  {missing ? (
                    <button className="chip-cta" onClick={() => { window.location.href = "/pwa/realestate"; }}>미입력 · 지금 등록 →</button>
                  ) : (
                    <>
                      <div className="v num">{toManwon(val)}</div>
                      <div className="p">{pctOfTotal(val)}%</div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 오늘 할 일 — §5 주식형 재구성·세금 고려 (단일 소스) */}
      {s && p && (
        <div className="card">
          <div className="sec-title">📋 오늘 할 일 <span className="sec-sub">주식형 재구성 · 세금 고려</span></div>
          {/* [S6] 오늘 할 일 0~3 밴드 — 실행이 필요한 액션 건수 */}
          <div className="todo-band">
            <div className="tb-count"><b>{todoCount}</b><span>/3</span></div>
            <div className="tb-steps">
              {[1, 2, 3].map((n) => <i key={n} className={n <= todoCount ? "on" : ""} />)}
            </div>
            <div className="tb-label">{todoCount === 0 ? "오늘은 조정 불필요 — 목표 범위 내" : `${todoCount}건의 배분 조정 권장`}</div>
          </div>
          <ul className="todo">
            {overseasSwapWon > 0 && (
              <li><div className="n">1</div>
                <div className="body"><div className="act">해외 노출 추가 · 매수</div><div className="desc">국내 {eq.region.domestic}% → <b>해외 {p.overseas}%</b>(온보딩 기준). 해외상장 ETF, 양도세 분리과세</div></div>
                <div className="amt buy">+{toManwon(overseasSwapWon)}</div></li>
            )}
            <li><div className="n tax">₩</div>
              <div className="body"><div className="act ob-c">재원은 비과세부터</div><div className="desc">현금 <b>{toManwon(s.assets.cash)}</b> + 매매차익 <b>비과세</b>인 국내주식형 ETF 매도로 충당</div></div>
              <div className="amt hold">세금 0</div></li>
            {diluteWon > 0 && (
              <li><div className="n warn">!</div>
                <div className="body"><div className="act warn-c">{maxTheme.theme} 쏠림 완화</div><div className="desc">합산 {maxTheme.pct}% → <b>{p.theme_cap}% 이하</b>(상한). 매도 대신 신규 매수를 타섹터로 희석</div></div>
                <div className="amt warn">−약 {toManwon(diluteWon)}</div></li>
            )}
            <li><div className="n tax">₩</div>
              <div className="body"><div className="act ob-c">국내 기타 ETF 축소는 신중</div><div className="desc">배당소득세·<b>금융소득종합과세</b> 대상 — 실현 시점 분산</div></div>
              <div className="amt hold">검토</div></li>
            <li><div className="n warn">🔒</div>
              <div className="body"><div className="act hold-c">부동산 추가 매입 금지</div><div className="desc">구조 리스크 '{risk?.grade}'</div></div>
              <div className="amt hold">대기</div></li>
          </ul>
        </div>
      )}

      {/* 주식형 자산 균형 — §4 (데모) */}
      {s && eq && (
        <div className="card">
          <div className="sec-title">🧭 주식형 자산 균형</div>
          <div className="eq-head"><div className="l">주식 + ETF 합산 (주식형)</div><div className="v num">{toManwon(s.equity_won)}</div></div>
          <div className="eq-note">ETF도 주식형이라 개별주식과 합쳐 하나의 주식 노출로 봅니다. 축소가 아니라 <b>국내/해외·섹터 균형</b>이 목표.</div>

          {eq.region && (
            <>
              <div className="mini-h">🌏 지역{p && <span className="goal">온보딩 · 국내{p.domestic} 해외{p.overseas}</span>}</div>
              <div className="seg"><span style={{ width: `${eq.region.domestic}%`, background: "var(--color-primary)" }} /><span style={{ width: `${eq.region.overseas}%`, background: "var(--color-warning)" }} /></div>
              <div className="legend"><span className="it"><i style={{ background: "var(--color-primary)" }} />국내 <b>{eq.region.domestic}%</b></span><span className="it"><i style={{ background: "var(--color-warning)" }} />해외 <b>{eq.region.overseas}%</b></span></div>
              {eq.warnings.includes("region_concentration") && (
                <div className="callout down"><div className="h">🚨 지역 쏠림</div>주식형 전액 국내. 원화·국내 경기 단일 리스크에 노출. 해외상장 ETF로 <b>{p ? p.overseas : 30}%p 분산</b> 필요.</div>
              )}
            </>
          )}

          {eq.sectors?.length > 0 && (
            <>
              <div className="mini-h">🎯 섹터 (합산)<span className="demo">데모 데이터</span>{p && <span className="goal">온보딩 · 단일테마 ≤{p.theme_cap}%</span>}</div>
              <div className="seg">{eq.sectors.map((x) => <span key={x.theme} style={{ width: `${x.pct}%`, background: sColor(x.theme) }} />)}</div>
              <div className="legend">{eq.sectors.filter((x) => x.pct >= 5).map((x) => <span className="it" key={x.theme}><i style={{ background: sColor(x.theme) }} />{x.theme} <b>{x.pct}%</b></span>)}</div>
              {maxTheme && p && maxTheme.pct > p.theme_cap && (
                <div className="callout warn"><div className="h">⚠️ 섹터 쏠림</div>{maxTheme.theme} <b>{maxTheme.pct}%</b>가 상한({p.theme_cap}%) 초과. ETF와 개별주식이 {maxTheme.theme}에 겹쳐 실질 분산 낮음.</div>
              )}
            </>
          )}

          <div className="tax">
            <div className="h">💡 세금 관점 밸런싱</div>
            <div className="row"><span className="dot">·</span><span><span className="k">국내주식형 ETF</span> — 매매차익 <b>비과세</b>. 조정 재원 1순위.</span></div>
            <div className="row"><span className="dot">·</span><span><span className="k">국내 기타 ETF</span>(해외지수·채권 등) — 배당소득세 15.4% + <b>금융소득종합과세</b>. 축소 신중.</span></div>
            <div className="row"><span className="dot">·</span><span><span className="k">해외상장 ETF</span> — 양도세 22%, 연 <b>250만원 공제</b>, 분리과세. 지역 분산 + 손익통산.</span></div>
          </div>
          <div className="tax-foot">※ 실제 세액은 개인 금융소득 총액·연도에 따라 달라집니다. 세무 상담 권고.</div>
        </div>
      )}

      {/* 리밸런싱 플랜 — §5 세금 고려 (매도 대신 희석) */}
      {s && p && (
        <div className="card">
          <div className="sec-title">⚖️ 리밸런싱 플랜 <span className="sec-sub">세금 고려</span></div>
          {s.rebalance?.cash_deploy < 0 && (
            <div className="reb-row"><div className="a">💵 <b>현금 투입</b></div><div className="r buy">−{toManwon(-s.rebalance.cash_deploy)}</div></div>
          )}
          <div className="reb-row dashed"><div className="a">📊 <b>주식형 {toManwon(s.equity_won)}</b> — 총량 유지, 내부 재구성</div></div>
          {overseasSwapWon > 0 && (
            <div className="reb-row sub-row"><div className="a">국내 → 해외 스왑<span className="pill-tax free">비과세분 우선</span></div><div className="r swap">≈{toManwon(overseasSwapWon)}</div></div>
          )}
          {diluteWon > 0 && (
            <div className="reb-row sub-row"><div className="a">{maxTheme.theme} → 방어·배당 희석</div><div className="r sell">≈{toManwon(diluteWon)}</div></div>
          )}
          <div className="reb-row sub-row"><div className="a">국내 기타 ETF 축소<span className="pill-tax watch">종합과세 주의</span></div><div className="r lock">시점 분산</div></div>
          <div className="reb-row"><div className="a">💰 <b>현금 비중</b> {curCashPct.toFixed(1)}% → {cashFloorTgtPct.toFixed(1)}%</div><div className={`r ${cashDeltaWon >= 0 ? "buy" : "sell"}`}>{cashDeltaWon >= 0 ? "+" : "−"}{toManwon(Math.abs(cashDeltaWon))}</div></div>
          <div className="reb-row"><div className="a">🏠 <b>부동산</b> 구조 리스크·실물</div><div className="r lock">🔒 장기</div></div>
          <div className="foot-note">📌 <b>확장 예정:</b> ETF 룩스루(개별종목↔ETF 중복), 기초지수 중복, 손익통산 시뮬레이션(해외상장 250만원 공제·손실 종목 매칭)을 리밸런싱 엔진이 자동 산출. 목표·상한은 모두 온보딩 투자성향 기준.</div>
        </div>
      )}

      {/* [S6] 배분 제안 실행 카드 — 목표비중 슬라이더 + 실시간 세금·환효과(추정) */}
      {s && p && eq && ovTarget != null && (
        <div className="card exec-card">
          <div className="sec-title">🎚️ 배분 제안 실행 <span className="sec-sub">해외 목표비중 · 실시간 세금·환</span></div>
          <div className="exec-lead">주식형 <b>{toManwon(s.equity_won)}</b> 중 해외 노출을 조정합니다. 현재 국내 {curOverseasPct === 0 ? 100 : 100 - curOverseasPct}% · 해외 {curOverseasPct}%.</div>
          <div className="exec-slider">
            <div className="es-top"><span>해외 목표</span><b>{ovTarget}%</b><span className="es-goal">온보딩 {p.overseas}%</span></div>
            <input type="range" min="0" max="100" step="5" value={ovTarget} onChange={(e) => setOvTarget(Number(e.target.value))} />
            <div className="es-scale"><span>0%</span><span>50%</span><span>100%</span></div>
          </div>
          <div className="exec-src">
            <span className="src-lbl">스왑 재원</span>
            <select value={fundSrc} onChange={(e) => setFundSrc(e.target.value)}>
              {Object.entries(FUND).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <div className="exec-out">
            <div className="eo-row"><span className="eo-k">스왑 금액</span><b className={swapExecWon > 0 ? "buy" : swapExecWon < 0 ? "sell" : ""}>{swapExecWon > 0 ? "해외 매수 +" : swapExecWon < 0 ? "국내 회수 −" : ""}{toManwon(swapAbsWon)}</b></div>
            <div className="eo-row"><span className="eo-k">예상 세금<em>추정·최대</em></span><b className={swapTaxWon > 0 ? "sell" : "free"}>{swapTaxWon > 0 ? toManwon(swapTaxWon) : "0"}</b></div>
            <div className="eo-row"><span className="eo-k">환 민감도<em>±10% 환율</em></span><b className="fx">±{toManwon(fxSensWon)}</b></div>
          </div>
          <div className="exec-note">재원: <b>{fund.note}</b>. 세금은 <b>전액 차익 가정 최대치(추정)</b>이며 실제는 취득가·공제·손익통산에 따라 낮아집니다. 환 민감도는 신규 해외노출에 환율 ±10% 적용한 <b>참고 범위</b>입니다. <b>확정 아님 · 세무자문 아님.</b></div>
        </div>
      )}

      {/* [S6] 유동 / 비유동 2트랙 — 조정 가능(유동) vs 즉시 조정 불가(비유동·부동산) */}
      {s && (
        <div className="card track-card">
          <div className="sec-title">🛤️ 유동 · 비유동 2트랙 <span className="sec-sub">조정 가능성 기준</span></div>
          <div className="track">
            <div className="tk-h"><span className="tk-name">💧 유동 트랙</span><b>{toManwon(s.liquid)}</b><span className="tk-pct">{pctOfTotal(s.liquid)}%</span></div>
            <div className="tk-bar liquid">
              {[["주식", s.assets.stock, "var(--color-primary)"], ["ETF", s.assets.etf, "var(--color-etf)"], ["현금", s.assets.cash, "var(--color-warning)"]].map(([n, v, c]) => (
                s.liquid > 0 ? <i key={n} style={{ width: `${(v / s.liquid) * 100}%`, background: c }} title={`${n} ${toManwon(v)}`} /> : null
              ))}
            </div>
            <div className="tk-sub">주식·ETF·현금 — 신규 자금·매매 수익은 여기서만 재배분합니다.</div>
          </div>
          <div className="track">
            <div className="tk-h"><span className="tk-name">🏠 비유동 트랙</span><b>{toManwon(s.assets.realestate)}</b><span className="tk-pct">{pctOfTotal(s.assets.realestate)}%</span></div>
            <div className="tk-bar solid">
              {s.assets.realestate > 0 ? <i style={{ width: "100%", background: "var(--color-success)" }} /> : <i className="empty" style={{ width: "100%" }} />}
            </div>
            <div className="tk-sub">{s.assets.realestate > 0 ? "부동산 실물 — 즉시 조정 불가(장기·구조 리스크로 별도 진단)." : "부동산 미입력 — 등록 시 비유동 트랙에 반영됩니다."}</div>
          </div>
        </div>
      )}

      {/* [ETF Phase4] 데이터 갱신현황 + 영어 ETF·마켓 뉴스/리서치 */}
      <EtfDataStatus />
      <EtfMarketNews />

      <div className="cta-row">
        <Link href="/pwa/assets" className="cta">💼 통합 포트폴리오</Link>
        <Link href="/pwa/etf" className="cta">📊 ETF 상세</Link>
      </div>

      <style jsx>{`
        .m { max-width: 480px; margin: 0 auto; min-height: 100vh; background: var(--color-bg); padding: 0 14px calc(env(safe-area-inset-bottom, 0px) + 24px); font-family: var(--font-sans); color: var(--color-ink); }
        .num { font-variant-numeric: tabular-nums; letter-spacing: -.2px; }
        .unit-note { text-align: right; font-size: var(--fs-1); color: var(--color-ink-2); font-weight: 600; padding: 2px 6px 12px; }
        .unit-note b { color: var(--color-ink); }
        .card { background: var(--color-card); border: 1px solid var(--color-line); border-radius: var(--radius-card); padding: 16px; margin-bottom: 12px; box-shadow: var(--shadow-card); }
        .err { color: var(--color-danger); font-size: var(--fs-4); }
        .sec-title { font-size: var(--fs-5); font-weight: 800; margin-bottom: 16px; display: flex; align-items: center; gap: 7px; }
        .sec-sub { font-size: var(--fs-2); color: var(--color-ink-2); font-weight: 600; background: var(--color-bg); padding: 3px 9px; border-radius: var(--radius-sm); margin-left: auto; }
        .demo { font-size: var(--fs-1); font-weight: 800; color: var(--color-warning-ink); background: var(--color-warning-soft); padding: 3px 8px; border-radius: var(--radius-sm); margin-left: auto; letter-spacing: .3px; }

        .hero { background: linear-gradient(160deg, var(--hero-grad-1), var(--hero-grad-2)); color: var(--hero-ink); border-radius: var(--radius-hero); padding: 22px; margin-bottom: 16px; box-shadow: var(--shadow-float); }
        .hero-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
        .hero-top .t { font-size: var(--fs-4); font-weight: 600; opacity: .92; }
        .live { background: var(--color-success); color: #04351f; font-size: var(--fs-1); font-weight: 700; padding: 4px 9px; border-radius: var(--radius-sm); letter-spacing: .4px; }
        .hero-cap { font-size: var(--fs-2); opacity: .68; margin-bottom: 14px; }
        .score-row { display: flex; align-items: baseline; gap: 8px; }
        .score { font-size: 46px; font-weight: 800; letter-spacing: -1px; line-height: 1; }
        .score small { font-size: var(--fs-6); font-weight: 600; opacity: .8; margin-left: 3px; }
        .score-tag { margin-left: auto; font-size: var(--fs-3); font-weight: 700; background: rgba(255,255,255,.14); padding: 6px 12px; border-radius: var(--radius-sm); }
        .score-def { margin-left: auto; font-size: var(--fs-2); font-weight: 600; color: var(--hero-ink-soft); text-align: right; line-height: 1.4; }
        .score-def b { color: var(--hero-ink); font-weight: 800; }
        .subscores { display: flex; gap: 10px; margin-top: 16px; }
        .sub { flex: 1; background: rgba(255,255,255,.08); border-radius: var(--radius-md); padding: 11px 12px; }
        .sub .k { font-size: var(--fs-2); opacity: .85; display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 7px; gap: 6px; }
        .sub .k em { font-style: normal; font-size: var(--fs-1); opacity: .7; font-weight: 500; }
        .sub .k b { font-weight: 800; opacity: 1; }
        /* [§3-2] top_issue VerdictCard */
        .verdict { background: var(--color-card); border: 1px solid var(--color-line); border-left: 4px solid var(--color-danger); border-radius: var(--radius-card); box-shadow: var(--shadow-card); padding: 14px 16px; margin-bottom: 14px; }
        .verdict-h { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
        .verdict-lbl { font-size: var(--fs-2); font-weight: 700; color: var(--color-ink-2); }
        .verdict-key { font-size: var(--fs-5); font-weight: 800; }
        .verdict-sub { font-size: var(--fs-3); color: var(--color-ink-2); line-height: 1.55; margin-top: 6px; }
        /* [§3-2] 부동산 상태 배너 */
        .realty-banner { border-radius: var(--radius-card); padding: 12px 15px; margin-bottom: 14px; font-size: var(--fs-3); line-height: 1.6; }
        .realty-banner b { font-weight: 800; }
        .realty-banner.entered { background: var(--color-card-soft); border: 1px solid var(--color-line); color: var(--color-ink-2); }
        .realty-banner.entered b { color: var(--color-ink); }
        .realty-banner.none { background: var(--color-warning-soft); border: 1px solid var(--color-warning); color: var(--color-warning-ink); display: flex; align-items: center; gap: 10px; justify-content: space-between; }
        .realty-cta { flex-shrink: 0; background: var(--color-warning); color: var(--color-on-primary); border: none; border-radius: var(--radius-sm); padding: 9px 12px; font-family: var(--font-sans); font-size: var(--fs-2); font-weight: 800; cursor: pointer; }
        .sub .b { height: 6px; border-radius: var(--radius-sm); background: rgba(255,255,255,.16); overflow: hidden; }
        .sub .b > i { display: block; height: 100%; border-radius: var(--radius-sm); }
        .hero-pending { font-size: var(--fs-6); font-weight: 800; color: var(--hero-ink); opacity: .8; margin-top: 4px; }

        .onboard { background: var(--ob-soft); border-radius: var(--radius-card); padding: 16px 18px; margin-bottom: 16px; }
        .ob-top { display: flex; align-items: center; gap: 8px; font-weight: 800; font-size: var(--fs-4); margin-bottom: 12px; color: var(--ob-ink); }
        .ob-tag { margin-left: auto; font-size: var(--fs-1); font-weight: 800; color: var(--color-on-primary); background: var(--ob); padding: 4px 11px; border-radius: var(--radius-sm); }
        .ob-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 9px 12px; }
        .ob-grid > div { font-size: var(--fs-2); color: var(--color-ink); }
        .obk { display: block; font-size: var(--fs-1); color: var(--ob); font-weight: 700; margin-bottom: 1px; }
        .ob-note { font-size: var(--fs-2); color: var(--ob); margin-top: 12px; padding-top: 10px; border-top: 1px solid var(--ob); }
        .ob-link { color: var(--ob); font-weight: 800; text-decoration: none; }

        .risk { background: var(--color-card); border: 1px solid var(--color-line); border-left: 5px solid var(--color-warning); border-radius: var(--radius-card); box-shadow: var(--shadow-card); padding: 18px 20px; margin-bottom: 16px; }
        .risk-top { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
        .risk-top .t { font-weight: 800; font-size: var(--fs-5); }
        .risk-badge { margin-left: auto; font-size: var(--fs-1); font-weight: 800; color: var(--color-on-primary); background: var(--color-warning); padding: 4px 10px; border-radius: var(--radius-sm); }
        .risk-badge.g-낮음 { background: var(--color-success); }
        .risk-badge.g-중간 { background: var(--color-warning); }
        .risk-badge.g-높음 { background: var(--color-danger); }
        .risk-body { font-size: var(--fs-3); color: var(--color-ink-2); line-height: 1.6; }
        .risk-body b { color: var(--color-ink); }
        .risk-bar { height: 10px; border-radius: var(--radius-sm); background: var(--color-bg); margin: 12px 0 6px; overflow: hidden; display: flex; }
        .risk-bar .real { background: var(--color-warning); height: 100%; }
        .risk-bar .liq { background: var(--color-primary); height: 100%; }
        .risk-legend { display: flex; gap: 16px; font-size: var(--fs-2); color: var(--color-ink-2); }
        .risk-legend i { width: 8px; height: 8px; border-radius: var(--radius-sm); display: inline-block; margin-right: 5px; vertical-align: middle; }

        .total-head { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 14px; }
        .total-head .lbl { color: var(--color-ink-2); font-weight: 600; font-size: var(--fs-5); }
        .total-head .val { font-size: var(--fs-8); font-weight: 800; }
        .grid4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
        .chip { background: var(--color-bg); border-radius: var(--radius-md); padding: 12px 6px; text-align: center; }
        .chip .k { font-size: var(--fs-2); color: var(--color-ink-2); font-weight: 600; display: flex; align-items: center; justify-content: center; gap: 4px; }
        .chip .k i { width: 7px; height: 7px; border-radius: 50%; display: inline-block; }
        /* [B10] 부동산 미입력 placeholder */
        .total-note { font-size: var(--fs-1); color: var(--color-ink-3); margin: -6px 0 12px; }
        .total-note b { color: var(--color-ink-2); font-weight: 700; }
        .chip.missing { background: var(--color-card-soft); border: 1px dashed var(--color-line); }
        .chip-cta { margin-top: 6px; background: none; border: none; color: var(--color-primary); font-size: var(--fs-1); font-weight: 700; cursor: pointer; font-family: var(--font-sans); padding: 0; line-height: 1.3; }
        .chip .v { font-size: var(--fs-4); font-weight: 800; margin-top: 6px; }
        .chip .p { font-size: var(--fs-1); color: var(--color-ink-2); margin-top: 2px; }

        .todo { list-style: none; padding: 0; margin: 0; }
        .todo li { display: flex; gap: 12px; align-items: flex-start; padding: 14px 0; border-bottom: 1px solid var(--color-line); }
        .todo li:last-child { border-bottom: 0; padding-bottom: 0; }
        .todo .n { flex: 0 0 26px; height: 26px; border-radius: var(--radius-sm); background: var(--color-primary-soft); color: var(--color-primary); font-weight: 800; font-size: var(--fs-3); display: flex; align-items: center; justify-content: center; margin-top: 1px; }
        .todo .n.warn { background: var(--color-warning-soft); color: var(--color-warning-ink); }
        .todo .n.tax { background: var(--ob-soft); color: var(--ob); }
        .todo .body { flex: 1; }
        .todo .act { font-size: var(--fs-5); font-weight: 700; }
        .todo .act.ob-c { color: var(--ob); } .todo .act.warn-c { color: var(--color-warning-ink); } .todo .act.hold-c { color: var(--color-ink-3); }
        .todo .desc { font-size: var(--fs-2); color: var(--color-ink-2); margin-top: 3px; }
        .todo .desc b { color: var(--color-ink); }
        .todo .amt { font-weight: 800; font-size: var(--fs-3); white-space: nowrap; margin-top: 2px; }
        .amt.buy { color: var(--color-success); } .amt.hold { color: var(--color-ink-3); } .amt.warn { color: var(--color-warning-ink); }

        .eq-head { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 2px; }
        .eq-head .l { font-weight: 700; font-size: var(--fs-3); color: var(--color-ink-2); }
        .eq-head .v { font-weight: 800; font-size: var(--fs-5); }
        .eq-note { font-size: var(--fs-2); color: var(--color-ink-2); margin-bottom: 14px; }
        .eq-note b { color: var(--color-ink); }
        .mini-h { font-size: var(--fs-3); font-weight: 800; margin: 16px 0 4px; display: flex; align-items: center; gap: 6px; }
        .mini-h .goal { margin-left: auto; font-size: var(--fs-1); font-weight: 700; color: var(--ob); background: var(--ob-soft); padding: 2px 9px; border-radius: var(--radius-sm); }
        .seg { height: 15px; border-radius: var(--radius-sm); overflow: hidden; display: flex; margin: 7px 0 10px; }
        .seg > span { height: 100%; }
        .legend { display: flex; flex-wrap: wrap; gap: 9px 15px; font-size: var(--fs-2); color: var(--color-ink-2); }
        .legend .it { display: flex; align-items: center; gap: 6px; }
        .legend i { width: 9px; height: 9px; border-radius: var(--radius-sm); display: inline-block; }
        .legend b { color: var(--color-ink); font-weight: 700; }

        .tax { font-size: var(--fs-2); color: var(--color-ink-2); background: var(--color-bg); border-radius: var(--radius-md); padding: 12px 14px; line-height: 1.65; margin-top: 14px; }
        .tax .h { font-weight: 800; color: var(--color-ink); margin-bottom: 6px; display: flex; align-items: center; gap: 6px; }
        .tax .row { display: flex; gap: 8px; padding: 3px 0; }
        .tax .row .dot { flex: 0 0 auto; font-weight: 800; }
        .tax .k { color: var(--color-ink); font-weight: 700; }
        .tax-foot { font-size: var(--fs-1); color: var(--color-ink-3); margin-top: 8px; }
        .callout { border-radius: var(--radius-md); padding: 13px 15px; margin-top: 14px; font-size: var(--fs-2); line-height: 1.6; }
        .callout.warn { background: var(--color-warning-soft); } .callout.down { background: var(--color-danger-soft); }
        .callout .h { font-weight: 800; display: flex; align-items: center; gap: 6px; margin-bottom: 4px; }
        .callout.warn .h { color: var(--color-warning-ink); } .callout.down .h { color: var(--color-danger); }
        .foot-note { font-size: var(--fs-2); color: var(--color-ink-2); margin-top: 14px; padding-top: 14px; border-top: 1px dashed var(--color-line); }
        .foot-note b { color: var(--color-ink); }

        .reb-row { display: flex; align-items: center; padding: 13px 0; border-bottom: 1px solid var(--color-line); font-size: var(--fs-3); }
        .reb-row.dashed { border-bottom: 1px dashed var(--color-line); }
        .reb-row.sub-row { padding: 9px 0 9px 14px; font-size: var(--fs-2); border-bottom: 1px dashed var(--color-line); }
        .reb-row:last-child { border-bottom: 0; padding-bottom: 2px; }
        .reb-row .a { flex: 1; font-weight: 700; } .reb-row .a b { font-weight: 800; }
        .reb-row .r { font-weight: 800; font-size: var(--fs-2); text-align: right; white-space: nowrap; flex: 0 0 auto; margin-left: 10px; }
        .reb-row .r.buy { color: var(--color-success); } .reb-row .r.sell { color: var(--color-danger); } .reb-row .r.lock { color: var(--color-ink-3); } .reb-row .r.swap { color: var(--color-primary); }
        .pill-tax { font-size: var(--fs-1); font-weight: 800; padding: 2px 7px; border-radius: var(--radius-sm); margin-left: 6px; vertical-align: middle; }
        .pill-tax.free { background: var(--color-success-soft); color: var(--color-success-ink); }
        .pill-tax.watch { background: var(--color-warning-soft); color: var(--color-warning-ink); }

        /* [S6] 오늘 할 일 0~3 밴드 */
        .todo-band { display: flex; align-items: center; gap: 12px; background: var(--color-bg); border-radius: var(--radius-md); padding: 11px 14px; margin-bottom: 14px; }
        .tb-count { font-size: var(--fs-3); color: var(--color-ink-3); font-weight: 700; }
        .tb-count b { font-size: var(--fs-7); font-weight: 800; color: var(--color-primary); }
        .tb-steps { display: flex; gap: 5px; }
        .tb-steps i { width: 26px; height: 6px; border-radius: var(--radius-sm); background: var(--color-line); display: inline-block; }
        .tb-steps i.on { background: var(--color-primary); }
        .tb-label { font-size: var(--fs-2); color: var(--color-ink-2); font-weight: 600; margin-left: auto; text-align: right; }
        /* [S6] 배분 제안 실행 카드 */
        .exec-lead { font-size: var(--fs-2); color: var(--color-ink-2); line-height: 1.55; margin-bottom: 14px; }
        .exec-lead b { color: var(--color-ink); font-weight: 800; }
        .exec-slider { margin-bottom: 14px; }
        .es-top { display: flex; align-items: baseline; gap: 8px; font-size: var(--fs-2); color: var(--color-ink-2); font-weight: 600; margin-bottom: 6px; }
        .es-top b { font-size: var(--fs-6); color: var(--color-primary); font-weight: 800; }
        .es-goal { margin-left: auto; font-size: var(--fs-1); font-weight: 700; color: var(--ob); background: var(--ob-soft); padding: 2px 9px; border-radius: var(--radius-sm); }
        .exec-slider input[type="range"] { width: 100%; accent-color: var(--color-primary); }
        .es-scale { display: flex; justify-content: space-between; font-size: var(--fs-1); color: var(--color-ink-3); font-weight: 600; margin-top: 2px; }
        .exec-src { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
        .src-lbl { font-size: var(--fs-2); font-weight: 700; color: var(--color-ink-2); }
        .exec-src select { flex: 1; border: 1px solid var(--color-line); background: var(--color-bg); border-radius: var(--radius-sm); padding: 9px 10px; font-size: var(--fs-3); font-family: var(--font-sans); color: var(--color-ink); }
        .exec-src select:focus { outline: none; border-color: var(--color-primary); }
        .exec-out { display: flex; flex-direction: column; gap: 2px; background: var(--color-bg); border-radius: var(--radius-md); padding: 6px 14px; }
        .eo-row { display: flex; align-items: center; justify-content: space-between; padding: 9px 0; border-bottom: 1px solid var(--color-line); font-size: var(--fs-3); }
        .eo-row:last-child { border-bottom: none; }
        .eo-k { color: var(--color-ink-2); font-weight: 600; }
        .eo-k em { font-style: normal; font-size: var(--fs-1); font-weight: 800; color: var(--color-warning-ink); background: var(--color-warning-soft); padding: 1px 6px; border-radius: var(--radius-sm); margin-left: 6px; }
        .eo-row b { font-weight: 800; font-size: var(--fs-4); }
        .eo-row b.buy { color: var(--color-primary); } .eo-row b.sell { color: var(--color-danger); }
        .eo-row b.free { color: var(--color-success); } .eo-row b.fx { color: var(--color-ink); }
        .exec-note { font-size: var(--fs-1); color: var(--color-ink-3); margin-top: 12px; line-height: 1.55; word-break: keep-all; }
        .exec-note b { color: var(--color-ink-2); font-weight: 700; }
        /* [S6] 유동/비유동 2트랙 */
        .track { margin-bottom: 16px; }
        .track:last-of-type { margin-bottom: 0; }
        .tk-h { display: flex; align-items: baseline; gap: 8px; margin-bottom: 7px; }
        .tk-name { font-size: var(--fs-3); font-weight: 700; color: var(--color-ink); }
        .tk-h b { font-size: var(--fs-5); font-weight: 800; color: var(--color-ink); }
        .tk-pct { margin-left: auto; font-size: var(--fs-2); font-weight: 700; color: var(--color-ink-2); }
        .tk-bar { height: 14px; border-radius: var(--radius-sm); overflow: hidden; display: flex; background: var(--color-bg); }
        .tk-bar i { height: 100%; display: block; }
        .tk-bar i.empty { background: var(--color-line); }
        .tk-sub { font-size: var(--fs-2); color: var(--color-ink-2); margin-top: 7px; line-height: 1.5; word-break: keep-all; }
        .cta-row { display: flex; gap: 10px; margin-top: 4px; }
        .cta { flex: 1; background: var(--color-card); border: 1px solid var(--color-line); border-radius: var(--radius-md); box-shadow: var(--shadow-card); padding: 15px; text-align: center; font-weight: 700; font-size: var(--fs-4); text-decoration: none; color: var(--color-ink); }
      `}</style>
      <style jsx global>{`body { background: var(--color-bg); margin: 0; }`}</style>
    </div>
  );
}
