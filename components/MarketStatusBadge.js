// [ⓕ] 지금 장이 어느 세션인지(KRX 정규장/시간외/NXT) 보여주는 배지.
import { useEffect, useState } from "react";
import { marketStatus } from "../lib/marketHours";

const PHASE_COLOR = {
  regular: "var(--color-success)",
  call: "var(--color-warning-ink, #B8860B)",
  after: "var(--purple, #7C5CFC)",
  pre: "var(--purple, #7C5CFC)",
  closed: "var(--color-ink-3)",
};

export default function MarketStatusBadge({ compact = false }) {
  const [status, setStatus] = useState(null);
  useEffect(() => {
    const tick = () => setStatus(marketStatus());
    tick();
    const id = setInterval(tick, 30000); // 30초마다 세션 경계 갱신
    return () => clearInterval(id);
  }, []);
  if (!status) return null;
  const { krx, nxt } = status;

  return (
    <div className={`msb ${compact ? "compact" : ""}`}>
      <div className="msb-row">
        <span className="msb-dot" style={{ background: PHASE_COLOR[krx.phase] }} />
        <span className="msb-ex">KRX</span>
        <span className="msb-label">{krx.label}</span>
      </div>
      {!compact && (
        <div className="msb-row">
          <span className="msb-dot" style={{ background: PHASE_COLOR[nxt.phase] }} />
          <span className="msb-ex">NXT</span>
          <span className="msb-label">{nxt.label}</span>
        </div>
      )}
      <style jsx>{`
        .msb { display: flex; flex-direction: column; gap: 4px; }
        .msb.compact { flex-direction: row; }
        .msb-row { display: flex; align-items: center; gap: 6px; font-size: 11px; }
        .msb-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
        .msb-ex { font-weight: 800; color: var(--color-ink-2); letter-spacing: -.2px; }
        .msb-label { color: var(--color-ink-3); }
      `}</style>
    </div>
  );
}
