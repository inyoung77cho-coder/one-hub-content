// [ⓘ] Market sensing 뉴스 요약 통일 포맷 파서.
//   운영자가 텔레그램 뉴스봇에 아래 템플릿으로 입력하면 PWA가 [기사요약]/[영향도]를 구조화해 보여준다:
//     [기사요약]
//     - 불릿 …
//     [주식 영향도]
//     - 영향도: 85
//   섹션 헤더([...])는 카테고리 배지가 이미 맥락을 주므로 화면엔 표시하지 않고, "영향도: N" 줄은
//   숫자만 뽑아 별도 배지로 렌더한다. 템플릿을 안 지켜도(기존 자유 형식) 그대로 불릿으로 보여 하위호환.
export function parseNewsBody(md) {
  const lines = String(md || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  let impact = null;
  const bullets = [];
  for (const line of lines) {
    if (/^\[[^\]]+\]$/.test(line)) continue; // [기사요약]/[주식 영향도] 같은 섹션 헤더는 스킵
    const m = line.match(/영향도\s*[:：]\s*(-?\d+)/);
    if (m) { impact = Number(m[1]); continue; }
    bullets.push(line.replace(/^[-*]\s*/, ""));
  }
  return { bullets, impact };
}

export function impactTone(score) {
  if (score == null) return null;
  const v = Math.abs(Number(score));
  if (v >= 70) return { label: "높음", color: "var(--color-danger)", bg: "var(--color-danger-soft)" };
  if (v >= 40) return { label: "중간", color: "var(--color-warning-ink, #B8860B)", bg: "var(--color-card-soft)" };
  return { label: "낮음", color: "var(--color-ink-3)", bg: "var(--color-card-soft)" };
}

// [ⓘ] 4대 섹션(주식/부동산/ETF/One-hub AI) — 기존 category 값과 매핑, 신규 값(etf/onehub_ai)도 지원.
export const NEWS_SECTIONS = {
  markets:    { ko: "주식",       bg: "#E7FAF2", fg: "#0E9E6A" },
  realestate: { ko: "부동산",     bg: "#FFF6E5", fg: "#B45309" },
  etf:        { ko: "ETF",        bg: "#EAF1FF", fg: "#2F6BFF" },
  onehub_ai:  { ko: "One-hub AI", bg: "#F6EEFF", fg: "#7A4CE0" },
  global:     { ko: "글로벌",     bg: "#EEF2FF", fg: "#4F5BD5" },
  macro:      { ko: "거시",       bg: "#EAF1FF", fg: "#2F6BFF" },
  policy:     { ko: "정책",       bg: "#F6EEFF", fg: "#7A4CE0" },
  affairs:    { ko: "시사",       bg: "#F1F5F9", fg: "#475569" },
};
