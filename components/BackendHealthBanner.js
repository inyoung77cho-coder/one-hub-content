// [S33-1] 백엔드가 밖에서 안 닿을 때 전 PWA 화면 상단에 한 줄. 정상이면 아무것도 안 그린다.
//   도달 실패는 이 배너가 전담한다(EngineVersionBanner 는 계약 불일치 전용 — S33-3).
import Link from "next/link";
import { useBackendHealth } from "../lib/backendHealth";

export default function BackendHealthBanner() {
  const h = useBackendHealth();
  // 확인 전 · 정상 · (health 자체 미도달로) 알 수 없음 → 조용히 있는다.
  if (h.loading || h.ok || !h.down.length) return null;

  return (
    <div className="bhb" role="status">
      <span className="bhb-i" aria-hidden="true">⚠</span>
      <span className="bhb-t">
        지금 최신 정보를 받아오지 못하고 있습니다 — 아래 숫자는 마지막으로 확인한 값입니다.
      </span>
      <Link href="/status" className="bhb-link">상태 보기 →</Link>
      <style jsx>{`
        .bhb {
          display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
          margin: 8px 16px 0; padding: 10px 12px;
          background: var(--color-warning-soft); border: 1px solid var(--color-warning);
          border-radius: 10px; word-break: keep-all;
        }
        .bhb-i { color: var(--color-warning-ink, var(--color-warning)); font-weight: 800; flex-shrink: 0; line-height: 1.5; }
        .bhb-t { font-size: 0.74rem; line-height: 1.5; color: var(--color-ink-2); min-width: 0; flex: 1; }
        .bhb-link { font-size: 0.72rem; font-weight: 800; color: var(--color-primary); text-decoration: none; white-space: nowrap; }
      `}</style>
    </div>
  );
}
