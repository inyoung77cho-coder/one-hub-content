// System Health Dashboard — 운영 안정성 Sprint (OPS-006)
// 실제 서버 상태(서비스/KIS토큰/Circuit/DB/스케줄러/이벤트로그) 30초 폴링.
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import TopNav from "../../components/TopNav";

// 상태 색은 시맨틱 토큰으로 — 정상=초록, 주의=주황, 오류=빨강, 미상=중립회색
const OK = "var(--color-success)", WARN = "var(--color-warning)", ERR = "var(--color-danger)", MUT = "var(--color-ink-3)";
const COLOR = { ok: OK, active: OK, connected: OK, running: OK, success: OK,
  CLOSED: OK, warning: WARN, HALF_OPEN: WARN, unknown: MUT, missing: WARN,
  error: ERR, OPEN: ERR, stopped: ERR, failed: ERR, inactive: ERR };
const dot = (s) => COLOR[s] || MUT;

export default function SystemHealth() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [adminKey, setAdminKey] = useState("");
  const [authed, setAuthed] = useState(false);
  const [filter, setFilter] = useState({ job: "", status: "" });

  const load = useCallback(async (key) => {
    try {
      const r = await fetch("/api/health/status", { headers: key ? { "X-Admin-Key": key } : {} });
      if (r.status === 401) { setAuthed(false); setErr("Admin 키 불일치"); return; }
      const d = await r.json();
      if (d.error && !d.services) { setErr(d.error); return; }
      setData(d); setAuthed(true); setErr(null);
      try { localStorage.setItem("onehub_admin_key", key || ""); } catch {}
    } catch (e) { setErr(String(e.message || e)); }
  }, []);

  useEffect(() => {
    let k = ""; try { k = localStorage.getItem("onehub_admin_key") || ""; } catch {}
    setAdminKey(k); load(k);
  }, [load]);

  useEffect(() => {
    if (!authed) return;
    const id = setInterval(() => load(adminKey), 30000);
    return () => clearInterval(id);
  }, [authed, adminKey, load]);

  const Dot = ({ s }) => <span className="dt" style={{ background: dot(s) }} />;

  if (!authed && !data) return (
    <div className="gate">
      <h1>🔐 System Health</h1>
      <input type="password" placeholder="Admin 키 (미설정 시 비워두고 접속)" value={adminKey}
        onChange={(e) => setAdminKey(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load(adminKey)} />
      <button onClick={() => load(adminKey)}>접속</button>
      {err && <p className="e">{err}</p>}
      <style jsx>{`
        .gate { max-width: 360px; margin: 80px auto; padding: 0 20px; font-family: var(--font-sans); text-align: center; color: var(--color-ink); }
        h1 { font-size: 1.1rem; margin-bottom: 20px; }
        input { width: 100%; padding: 12px; border: 1px solid var(--color-line); border-radius: 10px; margin-bottom: 10px; font-size: 0.9rem; box-sizing: border-box; background: var(--color-card); color: var(--color-ink); }
        button { width: 100%; padding: 12px; border: none; border-radius: 10px; background: var(--color-primary); color: #fff; font-weight: 700; }
        .e { color: var(--color-danger); font-size: 0.82rem; margin-top: 10px; }
      `}</style>
    </div>
  );

  const evts = (data?.recent_events || []).filter(
    (e) => (!filter.job || e.job_name === filter.job) && (!filter.status || e.status === filter.status));

  return (
    <div className="m">
      <TopNav active="settings" />
      <header className="hd">
        <div><h1>System Health</h1><span className="ts">{data?.timestamp} · {data?.app_version}</span></div>
        <button className="rf" onClick={() => load(adminKey)}>↻</button>
      </header>
      {err && <div className="card ec">{err}</div>}

      {/* 서비스 */}
      <div className="card">
        <div className="k">서비스 (systemd)</div>
        {data && Object.entries(data.services || {}).map(([n, s]) => (
          <div className="row" key={n}>
            <span className="l"><Dot s={s} /> {n.replace(".service", "")}</span>
            <span className="v" style={{ color: dot(s) }}>{s}</span>
          </div>
        ))}
      </div>

      {/* KIS 토큰 */}
      <div className="card">
        <div className="k">KIS 연결 · 토큰</div>
        {data && Object.entries(data.kis || {}).map(([tid, k]) => (
          <div className="row" key={tid}>
            <span className="l"><Dot s={k?.ok ? "ok" : "error"} /> Trader {tid}</span>
            <span className="v" style={{ color: dot(k?.ok ? "ok" : "error") }}>
              {k?.ok ? `${Math.floor((k.remaining_sec || 0) / 60)}분 유효` : (k?.error ? "오류" : "없음")}
            </span>
          </div>
        ))}
        <div className="row"><span className="l">Circuit Breaker</span>
          <span className="v" style={{ color: dot(data?.circuit_state) }}>{data?.circuit_state} (실패 {data?.api_fail_count ?? 0})</span></div>
      </div>

      {/* 스케줄러 / DB / Telegram */}
      <div className="card">
        <div className="k">스케줄러 · DB · Telegram</div>
        <div className="row"><span className="l"><Dot s={data?.scheduler?.status} /> 스케줄러</span>
          <span className="v" style={{ color: dot(data?.scheduler?.status) }}>{data?.scheduler?.status}</span></div>
        {data?.scheduler?.next_job && (
          <div className="row"><span className="l">다음 Job</span>
            <span className="v">{data.scheduler.next_job.name} @ {data.scheduler.next_job.at}</span></div>)}
        <div className="row"><span className="l"><Dot s={data?.database?.status} /> Database</span>
          <span className="v" style={{ color: dot(data?.database?.status) }}>{data?.database?.status} · {data?.database?.total_trades}건</span></div>
        <div className="row"><span className="l"><Dot s={data?.telegram?.status} /> Telegram</span>
          <span className="v" style={{ color: dot(data?.telegram?.status) }}>{data?.telegram?.status}</span></div>
      </div>

      {/* Event Log */}
      <div className="card">
        <div className="k">Event Log (최근 10건)</div>
        <div className="flt">
          <select value={filter.job} onChange={(e) => setFilter((f) => ({ ...f, job: e.target.value }))}>
            <option value="">전체 Job</option>
            {[...new Set((data?.recent_events || []).map((e) => e.job_name).filter(Boolean))].map((j) => <option key={j} value={j}>{j}</option>)}
          </select>
          <select value={filter.status} onChange={(e) => setFilter((f) => ({ ...f, status: e.target.value }))}>
            <option value="">전체 상태</option><option value="success">성공</option><option value="error">오류</option><option value="warning">경고</option><option value="running">실행중</option>
          </select>
        </div>
        {evts.length === 0 && <div className="none">이벤트 없음</div>}
        {evts.map((e, i) => (
          <div className="ev" key={i}>
            <Dot s={e.status} />
            <div className="ev-m">
              <div className="ev-t">{e.job_name || "-"} <span className="ev-s" style={{ color: dot(e.status) }}>{e.status}</span></div>
              <div className="ev-sub">{e.started_at || e.at} {e.duration_sec ? `· ${e.duration_sec}초` : ""}</div>
              {e.error_msg && <div className="ev-err">{e.error_msg}</div>}
            </div>
          </div>
        ))}
      </div>

      <div className="links"><Link href="/pwa" className="lk">← PWA 홈</Link><Link href="/pwa/ai-advisor" className="lk">AI 자산운영</Link></div>

      <style jsx>{`
        .m { max-width: 480px; margin: 0 auto; min-height: 100vh; background: var(--color-bg); padding: 0 14px calc(env(safe-area-inset-bottom, 0px) + 24px); font-family: var(--font-sans); color: var(--color-ink); }
        .hd { display: flex; align-items: center; justify-content: space-between; padding: 12px 2px; }
        .hd h1 { font-size: 1.05rem; font-weight: 800; margin: 0; } .ts { font-size: 0.68rem; color: var(--color-ink-3); }
        .rf { border: 1px solid var(--color-line); background: var(--color-card); border-radius: 8px; width: 34px; height: 34px; font-size: 1rem; color: var(--color-ink); }
        .card { background: var(--color-card); border: 1px solid var(--color-line); border-radius: var(--radius-card); padding: 14px; margin-bottom: 10px; box-shadow: var(--shadow-card); }
        .ec { color: var(--color-danger); font-size: 0.84rem; }
        .k { font-size: 0.76rem; font-weight: 700; color: var(--color-ink-2); margin-bottom: 10px; }
        .row { display: flex; align-items: center; justify-content: space-between; padding: 7px 0; border-bottom: 1px solid var(--color-line); font-size: 0.86rem; }
        .row:last-child { border-bottom: none; } .l { display: flex; align-items: center; color: var(--color-ink); } .v { font-weight: 700; }
        .dt { display: inline-block; width: 9px; height: 9px; border-radius: 50%; margin-right: 8px; }
        .none { color: var(--color-ink-3); font-size: 0.84rem; }
        .flt { display: flex; gap: 6px; margin-bottom: 8px; } .flt select { flex: 1; padding: 6px; border: 1px solid var(--color-line); border-radius: 8px; font-size: 0.74rem; color: var(--color-ink); background: var(--color-card); }
        .ev { display: flex; gap: 8px; padding: 8px 0; border-bottom: 1px solid var(--color-line); align-items: flex-start; } .ev:last-child { border-bottom: none; }
        .ev .dt { margin-top: 5px; } .ev-m { flex: 1; } .ev-t { font-size: 0.82rem; font-weight: 600; } .ev-s { font-size: 0.7rem; font-weight: 700; margin-left: 6px; }
        .ev-sub { font-size: 0.7rem; color: var(--color-ink-3); margin-top: 1px; } .ev-err { font-size: 0.7rem; color: var(--color-danger); margin-top: 2px; }
        .links { display: flex; gap: 8px; } .lk { flex: 1; text-align: center; background: var(--color-card); border: 1px solid var(--color-line); border-radius: var(--radius-card); padding: 12px; text-decoration: none; color: var(--color-primary); font-size: 0.82rem; font-weight: 700; }
      `}</style>
      <style jsx global>{`body { background: var(--color-bg); margin: 0; }`}</style>
    </div>
  );
}
