// [ETF Phase4] 데이터 갱신현황 — 수집기별 마지막 실행(성공/실패)·시세/환율/마스터 최신성.
//   /api/pwa/etf/status(onehub-etf collection_log) 를 읽어 정직하게 표시(실패도 노출).
import { useEffect, useState } from "react";

const COLLECTOR_KO = {
  daily_price: "해외 ETF 시세(KIS)",
  manual_price: "해외 ETF 시세(수동)",
  domestic_price: "국내 ETF 시세",
  manual_fx: "환율(USD/KRW)",
  sample_holdings: "샘플 보유",
  etf_master: "ETF 마스터",
};

function ago(ts) {
  if (!ts) return "";
  try {
    const t = new Date(String(ts).replace(" ", "T") + "Z").getTime();
    const d = Math.floor((Date.now() - t) / 86400000);
    if (d <= 0) return "오늘";
    if (d === 1) return "어제";
    return `${d}일 전`;
  } catch (e) { return ""; }
}

export default function EtfDataStatus() {
  const [st, setSt] = useState(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    let alive = true;
    fetch("/api/pwa/etf/status")
      .then((r) => r.json())
      .then((d) => { if (alive) { if (d && d.collectors) setSt(d); else setErr(true); } })
      .catch(() => { if (alive) setErr(true); });
    return () => { alive = false; };
  }, []);

  if (err) return null;
  const cols = (st?.collectors || []).filter((c) => c.collector !== "sample_holdings");

  return (
    <section className="eds">
      <div className="eds-h">📡 데이터 갱신현황 <span className="eds-sub">ETF 시세·환율·마스터</span></div>
      {!st ? (
        <div className="eds-load">불러오는 중…</div>
      ) : (
        <>
          <div className="eds-top">
            <div className="eds-chip"><span>ETF 시세</span><b>{st.nav_date || "-"}</b><em>{ago(st.nav_date + " 00:00:00")}</em></div>
            <div className="eds-chip"><span>환율</span><b>{st.fx_date || "-"}</b><em>{ago(st.fx_date + " 00:00:00")}</em></div>
            <div className="eds-chip"><span>종목 마스터</span><b>{st.master_count?.toLocaleString?.() || st.master_count || "-"}</b><em>종목</em></div>
          </div>
          <div className="eds-list">
            {cols.map((c, i) => (
              <div className={`eds-row ${c.status === "OK" ? "ok" : "fail"}`} key={i}>
                <span className="eds-dot" />
                <span className="eds-nm">{COLLECTOR_KO[c.collector] || c.collector}</span>
                <span className="eds-when">{String(c.run_at || "").slice(5, 16)} <em>{ago(c.run_at)}</em></span>
                <span className="eds-st">{c.status === "OK" ? `✓ ${c.rows || 0}건` : "⚠ 실패"}</span>
              </div>
            ))}
          </div>
          {cols.some((c) => c.status !== "OK") && (
            <div className="eds-warn">일부 수집이 실패했습니다 — 실시간 시세는 조회 시 별도 보정되지만, 최신 종가 반영이 지연될 수 있습니다.</div>
          )}
          <div className="eds-note">시세는 화면 조회 시 실시간 재조회됩니다. 위 날짜는 서버 수집 기준 · {st.server_time}.</div>
        </>
      )}
      <style jsx>{`
        .eds { background: var(--color-card); border: 1px solid var(--color-line); border-radius: var(--radius-card, 14px); padding: 16px; margin-bottom: 12px; box-shadow: var(--shadow-card); }
        .eds-h { font-size: 0.9rem; font-weight: 700; color: var(--color-ink); }
        .eds-sub { font-size: 0.68rem; font-weight: 700; color: var(--color-ink-3); margin-left: 6px; }
        .eds-load { font-size: 0.8rem; color: var(--color-ink-3); margin-top: 10px; }
        .eds-top { display: flex; gap: 8px; margin-top: 12px; }
        .eds-chip { flex: 1; background: var(--color-card-soft); border-radius: 11px; padding: 9px 10px; text-align: center; }
        .eds-chip span { display: block; font-size: 0.64rem; color: var(--color-ink-3); font-weight: 700; }
        .eds-chip b { display: block; font-size: 0.9rem; font-weight: 800; color: var(--color-ink); font-family: ui-monospace, monospace; margin-top: 2px; }
        .eds-chip em { font-style: normal; font-size: 0.6rem; color: var(--color-ink-3); }
        .eds-list { margin-top: 12px; display: flex; flex-direction: column; gap: 4px; }
        .eds-row { display: flex; align-items: center; gap: 8px; font-size: 0.74rem; padding: 6px 0; }
        .eds-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
        .eds-row.ok .eds-dot { background: var(--color-success); }
        .eds-row.fail .eds-dot { background: var(--color-danger); }
        .eds-nm { flex: 1; color: var(--color-ink); font-weight: 700; }
        .eds-when { color: var(--color-ink-3); font-family: ui-monospace, monospace; font-size: 0.68rem; }
        .eds-when em { font-style: normal; margin-left: 4px; }
        .eds-st { font-weight: 800; font-size: 0.7rem; }
        .eds-row.ok .eds-st { color: var(--color-success); }
        .eds-row.fail .eds-st { color: var(--color-danger); }
        .eds-warn { margin-top: 10px; font-size: 0.72rem; color: var(--color-danger); background: var(--color-danger-soft); border-radius: 9px; padding: 8px 10px; line-height: 1.5; word-break: keep-all; }
        .eds-note { margin-top: 10px; font-size: 0.64rem; color: var(--color-ink-3); line-height: 1.5; word-break: keep-all; }
      `}</style>
    </section>
  );
}
