// [S2.4] AI 배지 문구 사전(단일 소스) — 자산군(주식·ETF·부동산) 무관 동일 의미·동일 색.
//   화면에서 문구·색을 직접 쓰지 말고 이 사전을 통해 렌더한다(용어 일관성).
//   color/soft 는 밸류에이션 시맨틱 토큰(globals.css --color-undervalued 등)만 참조.

export const BADGES = {
  UNDERVALUED: { label: "저평가", color: "var(--color-undervalued)", soft: "var(--color-undervalued-soft)" },
  FAIR:        { label: "적정",   color: "var(--color-fair)",        soft: "var(--color-fair-soft)" },
  OVERVALUED:  { label: "고평가", color: "var(--color-overvalued)",  soft: "var(--color-overvalued-soft)" },
  HOLD:        { label: "유지",   color: "var(--color-hold)",        soft: "var(--color-fair-soft)" },
  BUY_REVIEW:  { label: "매수검토", color: "var(--color-primary)",   soft: "var(--color-primary-soft)" },
  REBALANCE:   { label: "리밸런싱", color: "var(--color-warning-ink)", soft: "var(--color-warning-soft)" },
  BLOCKED:     { label: "차단",   color: "var(--color-sell)",        soft: "var(--color-overvalued-soft)" },
};

export function badge(key) {
  return BADGES[key] || BADGES.FAIR;
}

// 한글 평가문구/판단문구 → 배지 키 매핑(백엔드 문자열을 사전 키로 정규화)
export function badgeKeyFromText(text) {
  const t = String(text || "");
  if (t.includes("저평가")) return "UNDERVALUED";
  if (t.includes("고평가")) return "OVERVALUED";
  if (t.includes("차단")) return "BLOCKED";
  if (t.includes("리밸런")) return "REBALANCE";
  if (t.includes("매수")) return "BUY_REVIEW";
  if (t.includes("유지") || t.includes("보유")) return "HOLD";
  if (t.includes("적정")) return "FAIR";
  return null;
}
