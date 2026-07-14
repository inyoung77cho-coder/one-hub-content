// [A-7] 소표본 배지 — 3개 탭 공통. <SampleSizeBadge count={24} /> 하나로 학습중/참고/누적을 일관 표기.
//   size="lg" 는 자기검증 탭에서 적중률보다 크게(A-2) 쓰는 강조용.
import { samplePolicy } from "../lib/sampleSize";

export default function SampleSizeBadge({ count = 0, showGauge = false, size = "md", label }) {
  const p = samplePolicy(count);
  const big = size === "lg";
  return (
    <span style={{ display: "inline-flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}>
      <span
        style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          background: p.badge.soft, color: p.badge.color,
          fontWeight: 800, borderRadius: 999,
          fontSize: big ? "0.92rem" : "0.68rem",
          padding: big ? "5px 13px" : "2px 9px",
          lineHeight: 1.2, whiteSpace: "nowrap",
        }}
      >
        {p.tier === "learning" ? "🌱" : p.tier === "reference" ? "📎" : "📊"} {label || p.badge.label}
        <span style={{ opacity: 0.7, fontWeight: 700, fontSize: big ? "0.74rem" : "0.62rem" }}>표본 {p.count}건</span>
      </span>
      {showGauge && p.tier === "learning" && (
        <span style={{ display: "inline-flex", flexDirection: "column", gap: 2, width: "100%", minWidth: 130 }}>
          <span style={{ display: "flex", justifyContent: "space-between", fontSize: "0.6rem", color: "var(--text-tertiary)" }}>
            <span>학습 진행</span><span>{p.count}/{p.target}건</span>
          </span>
          <span style={{ height: 5, borderRadius: 3, background: "var(--inset-bg)", overflow: "hidden", display: "block" }}>
            <span style={{ display: "block", height: "100%", width: `${p.progressPct}%`, background: "var(--color-warning-ink, var(--color-warning))", borderRadius: 3 }} />
          </span>
        </span>
      )}
    </span>
  );
}
