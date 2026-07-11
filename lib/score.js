// [S2.4] 점수 0~100 정규화 유틸 — 관심도(0~15)·Portfolio Score·ONE Score를 공통 스케일로.
//   원값(raw)은 툴팁에서 유지하고, 화면 게이지/색은 정규화값을 쓴다.

export function normalizeScore(raw, scaleMax = 100) {
  const n = Number(raw);
  if (!isFinite(n) || !(scaleMax > 0)) return 0;
  return Math.max(0, Math.min(100, Math.round((n / scaleMax) * 100)));
}

// 정규화 점수 → 시맨틱 색(80+ 초록 / 50+ 앰버 / 미만 빨강)
export function scoreColor(norm) {
  const n = Number(norm);
  if (n >= 80) return "var(--color-success)";
  if (n >= 50) return "var(--color-warning)";
  return "var(--color-danger)";
}
