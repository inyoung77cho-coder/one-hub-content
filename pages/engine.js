import { useState, useEffect, useCallback } from "react";
import Head from "next/head";

const STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Noto+Sans+KR:wght@300;400;500;700&display=swap');
  :root {
    --bg:#0a0c10; --bg2:#0f1218; --bg3:#151a22;
    --border:#1e2530; --border2:#2a3344;
    --green:#00d084; --green-dim:#003d26;
    --red:#ff4757; --red-dim:#3d0010;
    --yellow:#ffd700; --yellow-dim:#3d3200;
    --blue:#4fa3e0; --blue-dim:#0d2540;
    --text:#e8edf5; --text2:#8a9ab5; --text3:#4a5568;
    --mono:'Space Mono',monospace; --sans:'Noto Sans KR',sans-serif;
  }
  * { box-sizing:border-box; margin:0; padding:0; }
  body { background:var(--bg); color:var(--text); font-family:var(--sans); -webkit-font-smoothing:antialiased; }
  .page { min-height:100vh; padding:0 0 80px; }
  .grid { max-width:1200px; margin:0 auto; padding:32px 24px; display:grid; grid-template-columns:1fr 1fr; gap:20px; }
  @media(max-width:768px){ .grid{ grid-template-columns:1fr; padding:16px; gap:14px; } }
  .card { background:var(--bg2); border:1px solid var(--border); border-radius:12px; overflow:hidden; transition:border-color .2s; }
  .card:hover { border-color:var(--border2); }
  .card-header { padding:16px 20px 14px; border-bottom:1px solid var(--border); display:flex; align-items:center; justify-content:space-between; gap:10px; }
  .card-title { font-family:var(--mono); font-size:11px; font-weight:700; letter-spacing:0.15em; text-transform:uppercase; color:var(--text2); }
  .card-badge { font-family:var(--mono); font-size:10px; padding:3px 8px; border-radius:4px; font-weight:700; }
  .badge-green { background:var(--green-dim); color:var(--green); }
  .badge-red   { background:var(--red-dim);   color:var(--red); }
  .badge-gray  { background:var(--bg3);        color:var(--text3); }
  .card-body { padding:20px; }
  .engine-main { display:flex; align-items:center; gap:20px; margin-bottom:20px; }
  .engine-orb { width:64px; height:64px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:26px; flex-shrink:0; }
  .engine-orb.on { background:var(--green-dim); box-shadow:0 0 0 6px rgba(0,208,132,.08),0 0 24px rgba(0,208,132,.2); animation:orb-pulse 3s ease-in-out infinite; }
  .engine-orb.off { background:var(--red-dim); }
  @keyframes orb-pulse { 0%,100%{box-shadow:0 0 0 6px rgba(0,208,132,.08),0 0 24px rgba(0,208,132,.2)} 50%{box-shadow:0 0 0 10px rgba(0,208,132,.04),0 0 40px rgba(0,208,132,.3)} }
  .engine-info h2 { font-family:var(--mono); font-size:20px; font-weight:700; margin-bottom:4px; }
  .engine-info h2.on { color:var(--green); } .engine-info h2.off { color:var(--red); }
  .engine-info p { font-size:12px; color:var(--text2); font-family:var(--mono); }
  .engine-meta { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
  .meta-item { background:var(--bg3); border:1px solid var(--border); border-radius:8px; padding:10px 14px; }
  .meta-label { font-family:var(--mono); font-size:9px; letter-spacing:0.15em; color:var(--text3); text-transform:uppercase; margin-bottom:5px; }
  .meta-value { font-family:var(--mono); font-size:14px; font-weight:700; color:var(--text); }
  .meta-value.green { color:var(--green); }
  .holding-row { display:flex; align-items:center; justify-content:space-between; padding:12px 0; border-bottom:1px solid var(--border); gap:12px; }
  .holding-row:last-child { border-bottom:none; padding-bottom:0; }
  .holding-name { font-weight:500; font-size:14px; color:var(--text); min-width:80px; }
  .holding-detail { font-family:var(--mono); font-size:11px; color:var(--text2); flex:1; }
  .holding-qty { font-family:var(--mono); font-size:11px; color:var(--text3); min-width:50px; text-align:right; }
  .pnl-dir { font-size:16px; width:28px; text-align:center; }
  .empty-holdings { text-align:center; padding:32px; color:var(--text3); font-family:var(--mono); font-size:12px; }
  .total-row { margin-top:14px; padding-top:14px; border-top:1px solid var(--border2); display:flex; justify-content:space-between; align-items:center; }
  .total-label { font-family:var(--mono); font-size:10px; letter-spacing:0.12em; color:var(--text3); text-transform:uppercase; }
  .total-value { font-family:var(--mono); font-size:15px; font-weight:700; color:var(--blue); }
  .timeline { display:flex; flex-direction:column; gap:0; position:relative; }
  .timeline::before { content:''; position:absolute; left:34px; top:12px; bottom:12px; width:1px; background:var(--border); }
  .tl-item { display:flex; align-items:center; gap:14px; padding:7px 0; position:relative; }
  .tl-time { font-family:var(--mono); font-size:11px; font-weight:700; width:40px; text-align:right; flex-shrink:0; color:var(--text3); }
  .tl-dot { width:10px; height:10px; border-radius:50%; flex-shrink:0; position:relative; z-index:1; border:2px solid var(--bg); }
  .tl-dot.done { background:var(--text3); }
  .tl-dot.soon { background:var(--yellow); box-shadow:0 0 8px var(--yellow); animation:pulse-yellow 1.5s infinite; }
  .tl-dot.pending { background:var(--border2); }
  @keyframes pulse-yellow { 0%,100%{box-shadow:0 0 4px var(--yellow)} 50%{box-shadow:0 0 12px var(--yellow)} }
  .tl-label { font-size:12px; font-weight:500; flex:1; }
  .tl-item.done .tl-label { color:var(--text3); text-decoration:line-through; }
  .tl-item.soon .tl-label { color:var(--yellow); font-weight:700; }
  .tl-item.pending .tl-label { color:var(--text2); }
  .tl-badge { font-family:var(--mono); font-size:9px; padding:2px 6px; border-radius:3px; }
  .tl-badge.soon { background:var(--yellow-dim); color:var(--yellow); }
  .strategy-list { display:flex; flex-direction:column; gap:14px; }
  .strategy-item { background:var(--bg3); border:1px solid var(--border); border-radius:8px; padding:14px 16px; display:grid; grid-template-columns:36px 1fr auto; gap:12px; align-items:start; }
  .strategy-icon { font-size:22px; line-height:1; }
  .strategy-name { font-family:var(--mono); font-size:12px; font-weight:700; color:var(--text); margin-bottom:4px; }
  .strategy-desc { font-size:11px; color:var(--text2); line-height:1.5; }
  .strategy-weight-wrap { text-align:right; }
  .strategy-pct { font-family:var(--mono); font-size:18px; font-weight:700; color:var(--blue); }
  .strategy-pct-label { font-family:var(--mono); font-size:9px; color:var(--text3); margin-top:2px; }
  .weight-bar-bg { height:3px; background:var(--border); border-radius:2px; margin-top:10px; grid-column:2/4; overflow:hidden; }
  .weight-bar-fill { height:100%; background:var(--blue); border-radius:2px; transition:width 1s ease; }
  .loading-wrap { display:flex; align-items:center; justify-content:center; min-height:200px; color:var(--text3); font-family:var(--mono); font-size:12px; gap:10px; }
  .spinner { width:16px; height:16px; border:2px solid var(--border); border-top-color:var(--green); border-radius:50%; animation:spin .8s linear infinite; }
  @keyframes spin { to{transform:rotate(360deg)} }
  .offline-banner { background:var(--red-dim); border-bottom:1px solid var(--red); padding:8px 32px; font-family:var(--mono); font-size:11px; color:var(--red); text-align:center; }
  .footer-ts { text-align:center; font-family:var(--mono); font-size:10px; color:var(--text3); margin-top:32px; letter-spacing:0.1em; }
  .refresh-bar { display:flex; align-items:center; justify-content:flex-end; gap:8px; padding:12px 24px 0; font-family:var(--mono); font-size:11px; color:var(--text3); max-width:1200px; margin:0 auto; }
  .pulse-dot { width:7px; height:7px; border-radius:50%; background:var(--green); animation:pulse 2s infinite; flex-shrink:0; }
  .pulse-dot.offline { background:var(--red); animation:none; }
  @keyframes pulse { 0%,100%{opacity:1;box-shadow:0 0 0 0 rgba(0,208,132,.4)} 50%{opacity:.7;box-shadow:0 0 0 5px rgba(0,208,132,0)} }
`;

function formatPrice(n) {
  if (!n && n !== 0) return "—";
  return Number(n).toLocaleString("ko-KR") + "원";
}

function getKSTTime(isoStr) {
  if (!isoStr) return "—";
  try {
    return new Date(isoStr).toLocaleString("ko-KR", {
      timeZone: "Asia/Seoul", month: "numeric", day: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return isoStr; }
}

function EngineCard({ engine, version }) {
  const isOn = engine?.is_active;
  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">⚙ Engine Status</span>
        <span className={`card-badge ${isOn ? "badge-green" : "badge-red"}`}>{isOn ? "RUNNING" : "STOPPED"}</span>
      </div>
      <div className="card-body">
        <div className="engine-main">
          <div className={`engine-orb ${isOn ? "on" : "off"}`}>{isOn ? "⚡" : "💤"}</div>
          <div className="engine-info">
            <h2 className={isOn ? "on" : "off"}>{isOn ? "ONLINE" : "OFFLINE"}</h2>
            <p>systemd · onehub.service · {version}</p>
          </div>
        </div>
        <div className="engine-meta">
          <div className="meta-item">
            <div className="meta-label">프로세스 수</div>
            <div className={`meta-value ${isOn ? "green" : ""}`}>{engine?.process_count ?? "—"}개</div>
          </div>
          <div className="meta-item">
            <div className="meta-label">PID</div>
            <div className="meta-value">{engine?.pids?.join(", ") || "—"}</div>
          </div>
          <div className="meta-item" style={{ gridColumn: "1 / -1" }}>
            <div className="meta-label">마지막 시작</div>
            <div className="meta-value" style={{ fontSize: "12px" }}>{getKSTTime(engine?.started_at) || "—"}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function HoldingsCard({ holdings }) {
  const dirStyle = (dir) => {
    if (dir === "▲") return { color: "#ff4757" };
    if (dir === "▼") return { color: "#4fa3e0" };
    return { color: "#8a9ab5" };
  };
  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">📦 보유 종목</span>
        <span className="card-badge badge-gray">{holdings?.length ?? 0}종목</span>
      </div>
      <div className="card-body">
        {!holdings || holdings.length === 0 ? (
          <div className="empty-holdings">보유 종목 없음</div>
        ) : (
          <>
            {holdings.map((h, i) => (
              <div key={i} className="holding-row">
                <span className="holding-name">{h.name}</span>
                <span className="holding-detail">{formatPrice(h.avg_price)}</span>
                <span className="holding-qty">{h.qty}주</span>
                <span className="pnl-dir" style={dirStyle(h.pnl_dir)}>{h.pnl_dir || "➖"}</span>
              </div>
            ))}
            <div className="total-row">
              <span className="total-label">총 자산 (추정)</span>
              <span className="total-value">약 9,787,567원</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ScheduleCard({ schedule }) {
  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">🕐 오늘 스케줄</span>
        <span className="card-badge badge-gray">KST</span>
      </div>
      <div className="card-body">
        <div className="timeline">
          {(schedule || []).map((ev) => (
            <div key={ev.id} className={`tl-item ${ev.status}`}>
              <span className="tl-time">{ev.time_kst}</span>
              <span className={`tl-dot ${ev.status}`} />
              <span className="tl-label">{ev.label}</span>
              {ev.status === "soon" && <span className="tl-badge soon">{ev.diff_minutes}분 후</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StrategyCard({ strategy }) {
  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">🎯 매매 전략</span>
        <span className="card-badge badge-gray">WEIGHT</span>
      </div>
      <div className="card-body">
        <div className="strategy-list">
          {(strategy || []).map((s) => (
            <div key={s.id} className="strategy-item">
              <span className="strategy-icon">{s.icon}</span>
              <div>
                <div className="strategy-name">{s.name}</div>
                <div className="strategy-desc">{s.desc}</div>
              </div>
              <div className="strategy-weight-wrap">
                <div c
