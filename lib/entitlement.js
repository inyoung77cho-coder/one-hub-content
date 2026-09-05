// [S30-10] 유료 경계 판정 지점 — ★한 곳. 사업자 결정 = "지금은 경계 없음(직접입력이든 KIS든 전부 동일)".
//   나중에 잠글 때 여기만 고친다. 기능 코드 곳곳에 if 를 흩지 말 것.
//   feature 예: "today_decision" · "etf_judgment" · "manual_holdings" · "weekly_report" 등.
//   source 예(allHoldings): "kis" | "manual" | "etf" — 나중에 이 필드 하나로 경계를 그을 수 있다.
export function canUse(/* feature, ctx */) {
  return true; // 지금은 전부 열림. 유료화 시 여기서만 분기.
}

// 편의 별칭 — 호출부 가독성용(전부 canUse 로 위임).
export function isLocked(feature, ctx) { return !canUse(feature, ctx); }
