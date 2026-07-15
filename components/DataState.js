// [G7] 데이터 상태 래퍼 — loading/ok/stale/error/offline/empty를 전 화면 동일 형식으로.
//   원칙: 엔진 하나가 죽어도(자산군 독립 상태) 전역 에러로 전체를 덮지 않는다.
//         error여도 lastGood(마지막 성공 데이터)이 있으면 그 위에 배지만 얹어 계속 보여준다.
import Skeleton from "./Skeleton";

export default function DataState({
  status = "ok",          // 'loading' | 'ok' | 'stale' | 'error' | 'offline' | 'empty'
  onRetry,
  skeletonLines = 3,
  skeletonBlock = false,
  emptyText = "표시할 내용이 없습니다.",
  errorText = "연결에 실패했습니다.",
  hasData = true,         // error/offline이라도 마지막 데이터가 있으면 children을 계속 노출
  children,
}) {
  if (status === "loading") return <Skeleton lines={skeletonLines} block={skeletonBlock} />;
  if (status === "empty") return <div className="ds-msg">{emptyText}</div>;

  // error/offline: 데이터가 있으면 배지 + children, 없으면 안내 + 재시도
  if ((status === "error" || status === "offline") && !hasData) {
    return (
      <div className={`ds-msg ds-${status}`}>
        <span className="ds-dot" aria-hidden="true" />
        {status === "offline" ? "오프라인 · 마지막 데이터가 없습니다" : errorText}
        {onRetry && status !== "offline" && (
          <button type="button" className="ds-retry" onClick={onRetry}>다시 시도</button>
        )}
        <style jsx>{stateStyle}</style>
      </div>
    );
  }

  return (
    <div className="ds-wrap">
      {(status === "stale" || status === "offline" || status === "error") && (
        <div className={`ds-banner ds-${status}`}>
          <span className="ds-dot" aria-hidden="true" />
          {status === "stale" ? "갱신 중 · 이전 데이터 표시"
            : status === "offline" ? "오프라인 · 마지막 데이터 표시"
            : "연결 실패 · 이전 데이터 표시"}
          {onRetry && status !== "offline" && (
            <button type="button" className="ds-retry" onClick={onRetry}>다시 시도</button>
          )}
        </div>
      )}
      {children}
      <style jsx>{stateStyle}</style>
    </div>
  );
}

const stateStyle = `
  .ds-wrap { position: relative; }
  .ds-msg { display: flex; align-items: center; gap: 8px; font-size: 0.8rem; color: var(--color-ink-2); padding: 16px 4px; line-height: 1.5; word-break: keep-all; }
  .ds-banner { display: flex; align-items: center; gap: 7px; font-size: 0.72rem; font-weight: 700; padding: 7px 11px; border-radius: 9px; margin-bottom: 10px; }
  .ds-stale { color: var(--color-warning-ink, var(--color-warning)); background: var(--color-warning-soft); }
  .ds-offline { color: var(--color-ink-2); background: var(--color-card-soft); }
  .ds-error { color: var(--color-danger); background: var(--color-danger-soft); }
  .ds-dot { width: 7px; height: 7px; border-radius: 50%; background: currentColor; flex-shrink: 0; }
  .ds-retry { margin-left: auto; border: 1px solid currentColor; background: none; color: inherit; border-radius: 7px; padding: 4px 10px; font-size: 0.7rem; font-weight: 700; cursor: pointer; font-family: var(--font-sans, inherit); min-height: 32px; }
`;
