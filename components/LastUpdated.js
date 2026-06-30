/**
 * [v8.8] LastUpdated — 마지막 갱신 시각 표시 + 상태 점 (녹색=신선 / 주황=오래됨)
 * Props:
 *   timestamp: ISO string or Date (UTC or KST)
 *   staleAfterSeconds: 숫자(초), 기본 120 — 이 시간 초과 시 주황 점
 *   label: string, 기본 "LAST UPDATED"
 */
export default function LastUpdated({ timestamp, staleAfterSeconds = 120, label = "LAST UPDATED" }) {
  if (!timestamp) return null;

  const ts = timestamp instanceof Date ? timestamp : new Date(timestamp);
  if (isNaN(ts.getTime())) return null;

  const ageMs = Date.now() - ts.getTime();
  const stale = ageMs > staleAfterSeconds * 1000;

  const kstStr = ts.toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });

  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      fontSize: 11, color: "#94a3b8", fontFamily: "monospace",
    }}>
      <span style={{
        width: 7, height: 7, borderRadius: "50%",
        background: stale ? "#f97316" : "#22c55e",
        display: "inline-block", flexShrink: 0,
      }} />
      {label} · {kstStr} KST
    </div>
  );
}
