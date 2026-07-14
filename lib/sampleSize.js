// [A-7] 전역 소표본 정책(단일 소스) — 3개 탭(나 vs AI · 자기검증 · 리포트 아카이브) 공통.
//   핵심 원칙: 숫자를 숨기거나 지어내지 않는다. 다만 표본이 작을 때는 '판정'이 아니라 '학습 중'으로
//   프레이밍한다. 24건짜리 적중률에 빨강/초록 판정색을 칠하지 않고, 승자를 선언하지 않는다.
//   임계값은 여기 한 곳에서만 관리한다(화면에서 직접 상수를 쓰지 말 것).

export const SAMPLE_THRESHOLDS = {
  LEARNING: 30,   // 미만: 학습 중(판정색·승자선언·극단값 금지)
  REFERENCE: 100, // 미만: 참고(신뢰구간 병기) / 이상: 정식 통계
};

// [A-5] ★핵심 안전장치 — 표본 50건 미만에서는 자동 ML/규칙 자동조정을 금지한다(과적합 방지).
//   24건짜리 데이터로 규칙 가중치를 자동 재학습하면 노이즈에 과적합한다. 그 이하에서는
//   '관찰만' 하고, 규칙 변경은 사람 검토+백테스트를 거친다. 이 상수를 우회하지 말 것.
export const ML_MIN_SAMPLE = 50;

// 자동 ML/규칙 자동조정 허용 여부(코드 레벨 가드). 반드시 이 함수로만 판단한다.
export function canAutoML(count) {
  return (Number(count) || 0) >= ML_MIN_SAMPLE;
}

// tier: 'learning'(<30) | 'reference'(30~99) | 'normal'(100+)
export function sampleTier(count) {
  const n = Number(count) || 0;
  if (n < SAMPLE_THRESHOLDS.LEARNING) return "learning";
  if (n < SAMPLE_THRESHOLDS.REFERENCE) return "reference";
  return "normal";
}

const TIER_META = {
  learning:  { label: "학습 중",  color: "var(--color-ink-2)",        soft: "var(--color-card-soft, var(--inset-bg))" },
  reference: { label: "참고",     color: "var(--color-warning-ink, var(--color-warning))", soft: "var(--color-warning-soft)" },
  normal:    { label: "누적",     color: "var(--color-success)",      soft: "var(--color-success-soft)" },
};

// 화면 렌더에 필요한 정책 묶음. count 하나로 전 탭이 동일하게 동작.
export function samplePolicy(count) {
  const n = Number(count) || 0;
  const tier = sampleTier(n);
  const learning = tier === "learning";
  const reference = tier === "reference";
  const remaining = Math.max(0, SAMPLE_THRESHOLDS.LEARNING - n);
  return {
    tier,
    count: n,
    badge: TIER_META[tier],
    // 판정색(빨강/초록)은 표본이 정식 통계 구간(100+)일 때만. 그 전엔 중립.
    showVerdictColor: tier === "normal",
    // 승자 선언(나 vs AI, AI vs 시장)은 학습 중 구간에서 금지.
    declareWinner: !learning,
    // MDD·손익비 등 극단값은 학습 중이면 접어둔다(단일표본 왜곡 방지).
    collapseExtremes: learning,
    // 30~99: 신뢰구간(참고) 병기.
    showConfidenceInterval: reference,
    // 30까지 남은 표본 수(진행 게이지용).
    target: SAMPLE_THRESHOLDS.LEARNING,
    remaining,
    progressPct: Math.min(100, Math.round((n / SAMPLE_THRESHOLDS.LEARNING) * 100)),
    note: learning
      ? `표본 ${n}건 — 통계로 단정하기엔 이릅니다. 30건까지 학습하며 채점 정확도를 높입니다.`
      : reference
      ? `표본 ${n}건 — 참고 수준입니다. 표본이 늘수록 추정이 안정됩니다.`
      : `표본 ${n}건 — 통계적으로 판단 가능한 구간입니다.`,
  };
}

// 판정색 헬퍼: 학습 중이면 무조건 중립색, 정식 구간에서만 실제 색을 돌려준다.
export function verdictColor(count, actualColor) {
  return sampleTier(count) === "normal" ? actualColor : "var(--color-ink-2)";
}
