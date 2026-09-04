// [S27] 기기 동기화(push) 실패를 화면에 노출 — 지금까진 syncManager.pushLocal 이 catch{} 로 조용히 죽어
//   "입력했는데 다른 기기·주간 리포트에 반영 안 됨"을 사용자가 알 수 없었다. 실패 시에만 렌더(정상이면 null).
import { useEffect, useState } from "react";
import { getPushError, SYNC_PUSH_EVENT } from "../lib/syncManager";

export default function SyncStatus() {
  const [err, setErr] = useState(null);
  useEffect(() => {
    const read = () => setErr(getPushError());
    read();
    const on = (e) => setErr((e && e.detail && "error" in e.detail) ? e.detail.error : getPushError());
    window.addEventListener(SYNC_PUSH_EVENT, on);
    return () => window.removeEventListener(SYNC_PUSH_EVENT, on);
  }, []);
  if (!err) return null;
  const msg = err === "offline"
    ? "지금 오프라인이라 이 기기에만 저장됐어요. 연결되면 다음 입력 때 자동으로 다시 보냅니다."
    : "서버 저장에 실패했어요. 이 기기에만 저장됐고 다른 기기·주간 리포트엔 아직 반영되지 않았습니다.";
  return (
    <div className="sync-warn" role="status">
      <span className="sync-warn-ic" aria-hidden="true">⚠️</span>
      <span className="sync-warn-tx">입력이 아직 동기화되지 않았어요 — {msg}</span>
      <style jsx>{`
        .sync-warn { display: flex; align-items: flex-start; gap: 8px; margin: 0 2px 10px; padding: 10px 12px; border-radius: var(--radius-sm); background: var(--color-warning-soft); border: 1px solid var(--color-warning); color: var(--color-ink); font-size: var(--fs-2); line-height: 1.5; word-break: keep-all; }
        .sync-warn-ic { flex: none; }
      `}</style>
    </div>
  );
}
