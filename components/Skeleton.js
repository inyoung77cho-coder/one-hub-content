// [G7] 스켈레톤 — 최초 로딩 시 레이아웃 크기를 유지한 채 자리표시(빈 화면 팝인 방지).
//   색은 디자인 토큰만 사용. lines 개수만큼 회색 바를 그린다.
export default function Skeleton({ lines = 3, height = 16, gap = 10, block = false }) {
  const rows = Array.from({ length: Math.max(1, lines) });
  return (
    <div className="sk" aria-hidden="true" role="presentation">
      {rows.map((_, i) => (
        <div
          key={i}
          className="sk-row"
          style={{ height: block ? height * 3 : height, width: i === rows.length - 1 && !block ? "62%" : "100%", marginBottom: i === rows.length - 1 ? 0 : gap }}
        />
      ))}
      <style jsx>{`
        .sk { width: 100%; }
        .sk-row { border-radius: 8px; background: linear-gradient(90deg, var(--color-card-soft, #eef1f5) 25%, var(--color-line, #e3e7ee) 37%, var(--color-card-soft, #eef1f5) 63%); background-size: 400% 100%; animation: sk-shimmer 1.4s ease infinite; }
        @keyframes sk-shimmer { 0% { background-position: 100% 50%; } 100% { background-position: 0 50%; } }
        @media (prefers-reduced-motion: reduce) { .sk-row { animation: none; } }
      `}</style>
    </div>
  );
}
