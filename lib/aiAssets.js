// AI자산 재설계 v11.0-ASSET-01 — 단일 소스(SSOT) 클라이언트 계산 코어.
//   백엔드(auto_trade / 54.180.54.132)가 이 환경에서 미도달이므로, 작업지시서 §2~§5의
//   자산 스냅샷·정책·점수·리밸런싱 계산을 모두 브라우저에서 하나의 스냅샷으로 수행한다.
//   화면 렌더는 이 모듈이 만든 summary 객체 하나만 참조 → 섹션 간 스냅샷 불일치(버그) 원천 차단.
//   ⚠️ 지역/섹터(§4 Sprint 4)는 실제 ETF/주식 메타(etf.db) 연결 전까지 demo. summary.equity.demo=true로 표기.

// ── §2-2 온보딩 정책 매핑 (onboarding_policy.json 대체 · 단일 소스) ──
// 투자성향 1개 값 → 자산배분/지역비중/테마상한/현금하한 전부 산출.
export const ONBOARDING_POLICY = {
  "안정형":     { stock: 15, etf: 25, realestate: 50, cash: 10, domestic: 80, overseas: 20, theme_cap: 25, cash_floor: 10 },
  "안정성장형": { stock: 20, etf: 30, realestate: 45, cash: 5,  domestic: 70, overseas: 30, theme_cap: 30, cash_floor: 5 },
  "성장형":     { stock: 30, etf: 30, realestate: 35, cash: 5,  domestic: 60, overseas: 40, theme_cap: 35, cash_floor: 5 },
  "공격형":     { stock: 40, etf: 30, realestate: 25, cash: 5,  domestic: 50, overseas: 50, theme_cap: 40, cash_floor: 3 },
};

// 온보딩 위저드(style: safe/balance/growth …) → 정책 성향 라벨 매핑.
export const STYLE_TO_TENDENCY = {
  safe: "안정형", conservative: "안정형", stable: "안정형",
  balance: "안정성장형", balanced: "안정성장형",
  growth: "성장형",
  aggressive: "공격형", offensive: "공격형",
};

// app_state.investment_tendency 또는 온보딩 style 어느 쪽이든 정책을 찾는다.
export function getPolicy(tendencyOrStyle) {
  if (!tendencyOrStyle) return null;
  if (ONBOARDING_POLICY[tendencyOrStyle]) return { tendency: tendencyOrStyle, ...ONBOARDING_POLICY[tendencyOrStyle] };
  const mapped = STYLE_TO_TENDENCY[String(tendencyOrStyle).toLowerCase()];
  if (mapped && ONBOARDING_POLICY[mapped]) return { tendency: mapped, ...ONBOARDING_POLICY[mapped] };
  return null;
}

// ── §1 금액 만원 변환 유틸 (반복 단위 텍스트 제거, 단위는 상단 1곳만) ──
export function toManwon(won) {
  if (won == null || isNaN(Number(won))) return "—";
  return Math.round(Number(won) / 10000).toLocaleString("ko-KR");
}

// ── 내부 헬퍼 ──
const pctOf = (part, whole) => (whole > 0 ? (Number(part) / Number(whole)) * 100 : 0);
const round = (n, d = 0) => { const f = Math.pow(10, d); return Math.round(Number(n) * f) / f; };
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

// ── §2-1 자산 스냅샷 (단일 소스) ──
// assets: { stock, etf, realestate, cash } (단위: 원)
export function deriveTotals(assets) {
  const stock = Number(assets?.stock) || 0;
  const etf = Number(assets?.etf) || 0;
  const realestate = Number(assets?.realestate) || 0;
  const cash = Number(assets?.cash) || 0;
  const total = stock + etf + realestate + cash;
  const liquid = stock + etf + cash; // 부동산 제외
  const equity = stock + etf;        // 주식형 통합
  return { stock, etf, realestate, cash, total, liquid, equity };
}

// ── §3 부동산 구조 리스크 등급 (부동산/총자산) ──
export function structuralRisk(realestate, total) {
  const ratio = total > 0 ? realestate / total : 0;
  const grade = ratio > 0.70 ? "높음" : ratio >= 0.40 ? "중간" : "낮음";
  return { ratio: round(ratio, 3), grade };
}

// ── §3 유동 운영 점수 (부동산 제외) ──
//   배분 적합도 = 100 − (Σ|현재%−목표%| over {equity, cash} within liquid) / 2
//   분산도     = 100 − max(0, 최대테마%−theme_cap)·2 − max(0, |국내%−policy.domestic|)·1
//   유동 점수  = round(0.5·배분 + 0.5·분산)
export function liquidScore({ equity, cash, liquid, policy, maxThemePct, domesticPct, sectorComplete, regionComplete }) {
  if (!liquid || liquid <= 0 || !policy) {
    return { liquid_score: null, subscores: { allocation: null, diversification: null } };
  }
  // 정책은 총자산 기준(%) → 유동군(equity+cash) 목표로 재정규화.
  const eqTarget = policy.stock + policy.etf;
  const cashTarget = policy.cash;
  const liqBase = eqTarget + cashTarget || 1;
  const tgtEquity = pctOf(eqTarget, liqBase);
  const tgtCash = pctOf(cashTarget, liqBase);
  const curEquity = pctOf(equity, liquid);
  const curCash = pctOf(cash, liquid);

  // 배분 적합도: equity/cash 비율만으로 항상 계산 가능 → subscore 로 별도 노출.
  const allocation = clamp(100 - (Math.abs(curEquity - tgtEquity) + Math.abs(curCash - tgtCash)) / 2, 0, 100);

  // [2026-09-26 사실성] 분산도는 섹터(테마)와 지역이 '모두 완전'할 때만 계산한다.
  //   하나라도 미측정/부분이면 null(미측정) — 데이터 부재를 100점(쏠림 없음)으로 둔갑시키지 않는다.
  let diversification = null;
  if (sectorComplete && regionComplete && maxThemePct != null && domesticPct != null) {
    const themePenalty = Math.max(0, maxThemePct - policy.theme_cap) * 2;
    const regionPenalty = Math.max(0, Math.abs(domesticPct - policy.domestic)) * 1;
    diversification = Math.round(clamp(100 - themePenalty - regionPenalty, 0, 100));
  }
  // 종합 유동점수: 분산도가 미측정이면 종합도 미측정(null). 컴파일용 0 채우기 금지.
  const liquid_score = diversification == null ? null : Math.round(0.5 * allocation + 0.5 * diversification);

  return {
    liquid_score,
    subscores: { allocation: Math.round(allocation), diversification },
  };
}

// ── §4 주식형 통합 노출 (equity = stock + etf) ──
//   [2026-09-26 사실성] 지역과 섹터는 '각각' 데이터 상태(출처·기준·완전성)를 갖는다.
//   하나의 demo boolean 으로 실제 지역과 예시 섹터를 함께 판정하지 않는다.
//   equityMeta = {
//     region:{domestic,overseas}|null, region_status:'complete'|'partial'|'unmeasured', region_basis?, region_dropped?,
//     sectors:[{theme,pct}], sector_status:'complete'|'unmeasured', sector_note?
//   }
//   ★경고는 해당 축이 '완전(complete)'할 때만 낸다 — 환율 누락(부분) 지역으로 국내100% 확정,
//     미측정 섹터로 테마상한 초과를 판정하지 않는다.
export function equityExposure({ equity }, policy, equityMeta) {
  const base = {
    total: equity, region: null, region_status: "unmeasured", region_basis: null, region_dropped: 0,
    sectors: [], sector_status: "unmeasured", sector_note: null, warnings: [],
  };
  if (!equityMeta) return base;
  const region = equityMeta.region || null;
  const region_status = equityMeta.region_status || (region ? "complete" : "unmeasured");
  const sectors = Array.isArray(equityMeta.sectors) ? [...equityMeta.sectors].sort((a, b) => b.pct - a.pct) : [];
  const sector_status = equityMeta.sector_status || (sectors.length ? "complete" : "unmeasured");
  const warnings = [];
  if (region && region_status === "complete" && region.domestic >= 100) warnings.push("region_concentration");
  const maxTheme = sectors[0];
  if (policy && sector_status === "complete" && maxTheme && maxTheme.pct > policy.theme_cap) warnings.push(`theme_cap_exceeded:${maxTheme.theme}`);
  return {
    total: equity, region, region_status, region_basis: equityMeta.region_basis || null, region_dropped: equityMeta.region_dropped || 0,
    sectors, sector_status, sector_note: equityMeta.sector_note || null, warnings,
  };
}

// ── §5 세금 고려 리밸런싱 (매도 대신 희석 · equity 총량 유지) ──
//   재원 우선순위 ①현금 ②국내주식형 ETF(free) ③해외상장(손익통산) ④국내기타 ETF(watch)
export function rebalancePlan({ equity, cash, liquid }, policy, equityMeta) {
  if (!policy || !liquid) return null;
  const cash_target = round(liquid * (policy.cash_floor / 100));
  // cash_deploy: 현금 하한 초과분을 저노출로 배치(음수=현금에서 유출/투입). 하한 유지.
  const deployable = Math.max(0, cash - cash_target);
  const cash_deploy = deployable > 0 ? -round(deployable) : 0;

  const equity_recompose = [];
  // [2026-09-26 사실성] 해외 스왑액은 지역이 '완전'할 때만(환율 누락 부분 지역으론 전환액 제안 금지).
  const region = equityMeta?.region;
  const regionComplete = equityMeta?.region_status === "complete";
  if (regionComplete && region && typeof region.overseas === "number") {
    const swapPct = policy.overseas - region.overseas; // +면 해외 확대 필요
    if (swapPct > 0) equity_recompose.push({ label: "국내→해외 스왑", amount: round(equity * (swapPct / 100)), tax_flag: "free" });
  }
  // 테마 희석액은 섹터가 '완전'할 때만(미측정 예시 섹터로 희석액을 만들지 않는다).
  const sectors = equityMeta?.sectors || [];
  const sectorComplete = equityMeta?.sector_status === "complete";
  const maxTheme = [...sectors].sort((a, b) => b.pct - a.pct)[0];
  if (sectorComplete && maxTheme && maxTheme.pct > policy.theme_cap) {
    equity_recompose.push({ label: `${maxTheme.theme} 희석`, amount: round(equity * ((maxTheme.pct - policy.theme_cap) / 100)), tax_flag: "free" });
  }
  // 국내기타 ETF 축소는 종합과세 주의 → 후순위·watch (금액은 실현시점 분산, null)
  equity_recompose.push({ label: "국내기타 ETF 축소", amount: null, tax_flag: "watch" });

  return { cash_deploy, equity_recompose, cash_target, realestate: "locked" };
}

// ── §4 통합 조립: 화면이 참조할 단일 summary 객체 ──
//   input = { as_of, assets, tendencyOrStyle, equityMeta? }
export function computeSummary({ as_of, assets, tendencyOrStyle, equityMeta, ledgerFailed = false } = {}) {
  const t = deriveTotals(assets);
  const policy = getPolicy(tendencyOrStyle);
  const risk = structuralRisk(t.realestate, t.total);
  const equity = equityExposure(t, policy, equityMeta);

  // [2026-09-26 사실성] 완전한 축의 값만 점수 입력으로 넘긴다(부분/미측정은 null → 분산도 미측정).
  const sectorComplete = equity.sector_status === "complete";
  const regionComplete = equity.region_status === "complete";
  const maxThemePct = sectorComplete ? equity.sectors?.[0]?.pct : null;
  const domesticPct = regionComplete ? equity.region?.domestic : null;
  const scores = liquidScore({ equity: t.equity, cash: t.cash, liquid: t.liquid, policy, maxThemePct, domesticPct, sectorComplete, regionComplete });
  const rebalance = rebalancePlan(t, policy, equityMeta);

  return {
    as_of: as_of || null,
    unit: "KRW",
    assets: { stock: t.stock, etf: t.etf, realestate: t.realestate, cash: t.cash },
    total: t.total,
    liquid: t.liquid,
    equity_won: t.equity,
    policy, // null이면 온보딩 미완료 → 목표 산출 불가
    liquid_score: scores.liquid_score,
    subscores: scores.subscores,
    structural_risk: risk,
    equity,
    rebalance,
    onboarding_complete: !!policy,
    // [2026-09-26 사실성] 원장 실패는 0원 정상자산으로 두지 않는다 — data_ok=false 로 전달해 UI가 정상 진단을 만들지 않게 한다.
    data_ok: !ledgerFailed,
    equity_measured: t.equity > 0,   // 주식형(주식+ETF) 0 → '분산 평가 대상 없음'
    // measurable: 유동자산이 있고 원장이 정상일 때만 점수/진단을 낸다.
    measurable: !ledgerFailed && t.liquid > 0,
  };
}

// ── 보유 종목의 market/ccy 로 국내/해외 실비중 계산(ai-advisor 데이터 준비 · 순수함수라 테스트 가능) ──
//   ★평단×수량 기준(라이브 시세 아님). 환율 없으면 해외분을 제외하되 그 사실을 status/dropped 로 알린다.
//   반환: { domestic, overseas, status:'complete'|'partial'|'unmeasured', dropped, counted } · 대상 없으면 null.
export function realRegion(stocks, etfs, fxRate) {
  let dom = 0, ovs = 0, dropped = 0, counted = 0;
  const add = (isUsd, isOverseas, avgPrice, shares) => {
    if (isUsd && !fxRate) { dropped++; return; }
    const v = (Number(avgPrice) || 0) * (Number(shares) || 0) * (isUsd ? fxRate : 1);
    if (v <= 0) return;
    counted++;
    if (isOverseas) ovs += v; else dom += v;
  };
  for (const h of stocks || []) add(h.ccy === "USD", h.ccy === "USD" || h.market === "us", h.avgPrice, h.shares);
  for (const h of etfs || []) add(h.avgCcy === "USD", h.avgCcy === "USD" || h.market === "us", h.avgPrice, h.shares);
  const total = dom + ovs;
  if (total <= 0 && dropped === 0) return null;
  if (total <= 0) return { domestic: null, overseas: null, status: "unmeasured", dropped, counted };
  return {
    domestic: Math.round((dom / total) * 1000) / 10,
    overseas: Math.round((ovs / total) * 1000) / 10,
    status: dropped > 0 ? "partial" : "complete",
    dropped, counted,
  };
}
