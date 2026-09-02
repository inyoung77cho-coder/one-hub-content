// [S23 T-4] 총자산 시계열 미니 스파크라인(SVG) — 종합자산·오늘 화면 공용(복제 금지).
//   끝점만 강조(원), 축·격자 없음. 값이 2개 미만이면 렌더하지 않는다(호출측이 안내 문구 처리).
export default function Sparkline({ data, width = 84, height = 26, className = "" }) {
  const pts = (data || []).filter((v) => v != null);
  if (pts.length < 2) return null;
  const W = 120, H = 30, min = Math.min(...pts), max = Math.max(...pts);
  const span = max - min || 1;
  const yOf = (v) => H - ((v - min) / span) * (H - 4) - 2;
  const coords = pts.map((v, i) => `${((i / (pts.length - 1)) * W).toFixed(1)},${yOf(v).toFixed(1)}`);
  const rising = pts[pts.length - 1] >= pts[0];
  const color = rising ? "var(--color-success, #0E9E6A)" : "var(--color-danger, #E5484D)";
  return (
    <svg className={className} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true" style={{ width, height, flex: "0 0 auto" }}>
      <polyline points={coords.join(" ")} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={W} cy={yOf(pts[pts.length - 1])} r="2.4" fill={color} />
    </svg>
  );
}
