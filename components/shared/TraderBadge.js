// [T1] 트레이더 컨텍스트 배지 — 사용자 결정: A(기본)는 렌더하지 않고, B일 때만 노출.
//   A는 본인 계좌라 상시 표기 불필요. B(지인 계좌)일 때만 '지금 남의 계좌를 보고 있다'를 알린다.
//   전역 단일 소스(lib/trader useTrader) 사용 — 새 state 없음. 탭하면 설정에서 전환.
import { useRouter } from "next/router";
import { useTrader } from "../../lib/trader";

export default function TraderBadge() {
  const router = useRouter();
  const [trader] = useTrader();
  if (trader !== "B") return null; // ← A는 미표시

  return (
    <button
      className="trader-badge"
      onClick={() => router.push("/pwa/settings")}
      aria-label="트레이더 B 화면을 보는 중입니다. 설정에서 바꿀 수 있어요"
    >
      트레이더 B 보는 중
      <style jsx>{`
        .trader-badge {
          display: inline-flex; align-items: center; gap: 4px;
          min-height: 28px; padding: 4px 10px;
          border-radius: 999px;
          border: 1px solid var(--color-warning);
          background: var(--color-card-soft);
          color: var(--color-warning-ink, var(--color-warning));
          font-size: 0.68rem; font-weight: 800;
          font-family: var(--font-sans);
          white-space: nowrap; cursor: pointer;
        }
      `}</style>
    </button>
  );
}
