// [T1] 트레이더 A/B 표시 — 사용자 결정: A(기본)는 최소 표시, B일 때만 눈에 띄는 배지.
//   기본 계정(A)에선 헤더를 어지럽히지 않고, 지인 계정(B)일 때만 '지금 B다'를 분명히 알린다.
//   탭하면 전역 단일 소스(lib/trader)로 토글 → 전 페이지 즉시 반영(설정 토글과 양방향 동기).
import { useTrader } from "../../lib/trader";

export default function TraderSwitcher() {
  const [trader, choose] = useTrader();
  const isB = trader === "B";
  return (
    <button
      type="button"
      className={`tsw ${isB ? "b" : "a"}`}
      onClick={() => choose(isB ? "A" : "B")}
      aria-label={`트레이더 ${trader} 계정 · 탭하면 ${isB ? "A" : "B"}로 전환`}
      title={`트레이더 ${trader} · 탭하면 전환`}
    >
      {isB ? "트레이더 B" : "A"}
      <style jsx>{`
        .tsw { display: inline-flex; align-items: center; justify-content: center; height: 30px; border-radius: 8px; cursor: pointer; font-family: var(--font-sans, inherit); font-weight: 800; line-height: 1; transition: background .12s, color .12s, border-color .12s; }
        /* A(기본): 최소 — 작은 회색 아웃라인 'A' */
        .tsw.a { min-width: 30px; padding: 0 8px; font-size: 12px; background: none; border: 1px solid var(--color-line); color: var(--color-ink-3); }
        /* B: 눈에 띄는 배지 — 경고색 채움 '트레이더 B' */
        .tsw.b { padding: 0 12px; font-size: 12px; background: var(--color-warning, #f59e0b); border: 1px solid var(--color-warning, #f59e0b); color: #000; }
      `}</style>
    </button>
  );
}
