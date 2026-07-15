/**
 * [G8] 통일 신선도 배지(FreshnessBadge) — 전 화면 동일 형식.
 *   형식: ⟳ 상대시간(60분 이내: '방금'/'N분 전') / 절대시간(초과: 'MM-DD HH:MM 기준', KST).
 *   기존 'LAST UPDATED · HH:MM:SS KST' + 하드코딩 색상(#94a3b8/#f97316/#22c55e)을 대체.
 *   색은 디자인 토큰(var(--color-*))만 사용. label 미지정 시 라벨 없이 시간만.
 * Props:
 *   timestamp: ISO string or Date
 *   staleAfterSeconds: 숫자(초), 기본 120 — 초과 시 점이 주황(오래됨)
 *   label: string(선택) — 접두 라벨. 미지정 시 생략.
 *   onRefresh: () => void (선택) — 탭 시 재조회
 */
function relTimeKo(ts) {
  const sec = Math.max(0, Math.round((Date.now() - ts.getTime()) / 1000));
  if (sec < 10) return "방금";
  if (sec < 60) return `${sec}초 전`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}분 전`;
  try {
    const d = ts.toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" }); // YYYY-MM-DD
    const t = ts.toLocaleTimeString("en-GB", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false }); // HH:MM
    return `${d.slice(5)} ${t} 기준`; // MM-DD HH:MM 기준
  } catch (e) {
    return "이전 기준";
  }
}

export default function LastUpdated({ timestamp, staleAfterSeconds = 120, label, onRefresh }) {
  if (!timestamp) return null;
  const ts = timestamp instanceof Date ? timestamp : new Date(timestamp);
  if (isNaN(ts.getTime())) return null;

  const stale = Date.now() - ts.getTime() > staleAfterSeconds * 1000;
  const Tag = onRefresh ? "button" : "span";

  return (
    <Tag className="lu" onClick={onRefresh || undefined} type={onRefresh ? "button" : undefined} aria-label={onRefresh ? "새로고침" : undefined}>
      <span className={`lu-dot ${stale ? "stale" : ""}`} aria-hidden="true" />
      {label ? <span className="lu-lbl">{label} </span> : null}⟳ {relTimeKo(ts)}
      <style jsx>{`
        .lu { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; color: var(--color-ink-3, #94a3b8); font-family: var(--font-sans, inherit); font-variant-numeric: tabular-nums; background: none; border: none; padding: 0; cursor: ${onRefresh ? "pointer" : "default"}; }
        .lu-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--color-success, #22c55e); flex-shrink: 0; }
        .lu-dot.stale { background: var(--color-warning, #f97316); }
        .lu-lbl { font-weight: 700; }
      `}</style>
    </Tag>
  );
}
