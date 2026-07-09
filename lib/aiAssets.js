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
export function liquidScore({ equity, cash, liquid, policy, maxThemePct, domesticPct }) {
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

  const allocation = clamp(100 - (Math.abs(curEquity - tgtEquity) + Math.abs(curCash - tgtCash)) / 2, 0, 100);
  const themePenalty = maxThemePct != null ? Math.max(0, maxThemePct - policy.theme_cap) * 2 : 0;
  const regionPenalty = domesticPct != null ? Math.max(0, Math.abs(domesticPct - policy.domestic)) * 1 : 0;
  const diversification = clamp(100 - themePenalty - regionPenalty, 0, 100);

  return {
    liquid_score: Math.round(0.5 * allocation + 0.5 * diversification),
    subscores: { allocation: Math.round(allocation), diversification: Math.round(diversification) },
  };
}

// ── §4 주식형 통합 노출 (equity = stock + etf) ──
//   region/sectors 실제 값은 ETF/주식 메타 필요 → 없으면 demo 플래그.
//   equityMeta = { region:{domestic,overseas}, sectors:[{theme,pct}], demo? } (선택)
export function equityExposure({ equity }, policy, equityMeta) {
  const base = { total: equity, region: null, sectors: [], warnings: [], demo: true };
  if (!equityMeta) return base;
  const region = equityMeta.region || null;
  const sectors = Array.isArray(equityMeta.sectors) ? [...equityMeta.sectors].sort((a, b) => b.pct - a.pct) : [];
  const warnings = [];
  if (region && region.domestic >= 100) warnings.push("region_concentration");
  const maxTheme = sectors[0];
  if (policy && maxTheme && maxTheme.pct > policy.theme_cap) warnings.push(`theme_cap_exceeded:${maxTheme.theme}`);
  return { total: equity, region, sectors, warnings, demo: !!equityMeta.demo };
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
  const region = equityMeta?.region;
  if (region && typeof region.overseas === "number") {
    const swapPct = policy.overseas - region.overseas; // +면 해외 확대 필요
    if (swapPct > 0) equity_recompose.push({ label: "국내→해외 스왑", amount: round(equity * (swapPct / 100)), tax_flag: "free" });
  }
  const sectors = equityMeta?.sectors || [];
  const maxTheme = [...sectors].sort((a, b) => b.pct - a.pct)[0];
  if (maxTheme && maxTheme.pct > policy.theme_cap) {
    equity_recompose.push({ label: `${maxTheme.theme} 희석`, amount: round(equity * ((maxTheme.pct - policy.theme_cap) / 100)), tax_flag: "free" });
  }
  // 국내기타 ETF 축소는 종합과세 주의 → 후순위·watch (금액은 실현시점 분산, 데모단계 null)
  equity_recompose.push({ label: "국내기타 ETF 축소", amount: null, tax_flag: "watch" });

  return { cash_deploy, equity_recompose, cash_target, realestate: "locked", demo: !equityMeta };
}

// ── §4 통합 조립: 화면이 참조할 단일 summary 객체 ──
//   input = { as_of, assets, tendencyOrStyle, equityMeta? }
export function computeSummary({ as_of, assets, tendencyOrStyle, equityMeta } = {}) {
  const t = deriveTotals(assets);
  const policy = getPolicy(tendencyOrStyle);
  const risk = structuralRisk(t.realestate, t.total);
  const equity = equityExposure(t, policy, equityMeta);

  const maxThemePct = equity.sectors?.[0]?.pct;
  const domesticPct = equity.region?.domestic;
  const scores = liquidScore({ equity: t.equity, cash: t.cash, liquid: t.liquid, policy, maxThemePct, domesticPct });
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
    measurable: t.liquid > 0,
  };
}
