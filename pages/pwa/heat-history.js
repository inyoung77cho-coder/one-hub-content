// [리포트 PWA화] 히트 히스토리 — /api/pwa-heat-history. 레거시 /heat-history의 PWA 버전.
import { useState, useEffect } from "react";
import ReportShell from "../../components/shared/ReportShell";
import { getTrader } from "../../lib/trader";

const REGIME = { BULL: "상승장", BEAR: "하락장", SIDEWAYS: "횡보장" };
const gradeColor = (g) => {
  if (g === "EXTREME" || g === "HIGH") return "var(--color-danger)";
  if (g === "ELEVATED" || g === "MEDIUM") return "var(--color-warning-ink)";
  return "var(--color-success)";
};
const heatColor = (v) => (v >= 75 ? "var(--color-danger)" : v >= 50 ? "var(--color-warning-ink)" : "var(--color-success)");
const fmt = (d) => (d ? String(d).replace("T", " ").slice(5, 16) : "-");

export default function PwaHeatHistory() {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [ok, setOk] = useState(true);
  const [trader, setTrader] = useState("A");

  useEffect(() => { try { setTrader((getTrader() || "A").toUpperCase()); } catch (e) {} }, []);
  useEffect(() => {
    setLoading(true);
    fetch(`/api/pwa-heat-history?trader=${trader}&limit=50`)
      .then((r) => r.json())
      .then((d) => { setHistory(d.history || d.items || []); setOk(d.ok !== false); setLoading(false); })
      .catch(() => { setOk(false); setLoading(false); });
  }, [trader]);

  const sorted = [...history].sort((a, b) => (b.date > a.date ? 1 : -1));
  const latest = sorted[0];

  return (
    <ReportShell title="🌡️ 히트 히스토리" sub="시장 과열도(Heat)·공포탐욕 추이">
      <div className="tt">
        {["A", "B"].map((t) => (
          <button key={t} className={trader === t ? "on" : ""} onClick={() => setTrader(t)}>Trader {t}</button>
        ))}
      </div>
      {loading ? (
        <div className="rp-empty">불러오는 중…</div>
      ) : !ok ? (
        <div className="rp-empty">데이터를 불러올 수 없습니다.</div>
      ) : sorted.length === 0 ? (
        <div className="rp-empty">아직 기록이 없습니다.</div>
      ) : (
        <>
          {latest && (
            <div className="hh-now">
              <div className="hh-now-lbl">현재 과열도</div>
              <div className="hh-now-val" style={{ color: heatColor(latest.heat_score) }}>{latest.heat_score}<small>/100</small></div>
              <div className="hh-now-meta">
                <span style={{ color: gradeColor(latest.heat_grade) }}>{latest.heat_grade}</span>
                <span>· {REGIME[latest.regime] || latest.regime}</span>
                <span>· 공포탐욕 {latest.fear_greed}</span>
              </div>
            </div>
          )}
          <div className="hh-list">
            <div className="hh-h"><span>시각</span><span>Heat</span><span>등급</span><span>시장</span><span>F&G</span></div>
            {sorted.map((it, i) => (
              <div className="hh-row" key={i}>
                <span className="hh-t">{fmt(it.date)}</span>
                <span className="hh-heat" style={{ color: heatColor(it.heat_score) }}>{it.heat_score}</span>
                <span style={{ color: gradeColor(it.heat_grade) }}>{it.heat_grade}</span>
                <span>{REGIME[it.regime] || it.regime}</span>
                <span>{it.fear_greed}</span>
              </div>
            ))}
          </div>
        </>
      )}
      <style jsx>{`
        .tt { display: flex; gap: 6px; margin-bottom: 14px; }
        .tt button { border: 1px solid var(--color-line); background: var(--color-card); color: var(--color-ink-2); border-radius: 999px; padding: 7px 16px; font-size: 0.8rem; font-weight: 700; font-family: var(--font-sans); cursor: pointer; }
        .tt button.on { background: var(--color-primary); border-color: var(--color-primary); color: #fff; }
        .rp-empty { text-align: center; color: var(--color-ink-3); padding: 40px 0; font-size: 0.85rem; }
        .hh-now { background: var(--color-card); border: 1px solid var(--color-line); border-radius: var(--radius-card); box-shadow: var(--shadow-card); padding: 16px 18px; margin-bottom: 14px; text-align: center; }
        .hh-now-lbl { font-size: 0.72rem; color: var(--color-ink-3); font-weight: 700; }
        .hh-now-val { font-size: 2.4rem; font-weight: 800; line-height: 1.1; margin: 4px 0; }
        .hh-now-val small { font-size: 1rem; font-weight: 600; color: var(--color-ink-3); }
        .hh-now-meta { font-size: 0.78rem; font-weight: 700; display: flex; gap: 5px; justify-content: center; flex-wrap: wrap; }
        .hh-list { background: var(--color-card); border: 1px solid var(--color-line); border-radius: var(--radius-card); box-shadow: var(--shadow-card); padding: 6px 14px; }
        .hh-h, .hh-row { display: grid; grid-template-columns: 1.4fr 0.7fr 1fr 0.9fr 0.6fr; gap: 6px; align-items: center; }
        .hh-h { font-size: 0.64rem; color: var(--color-ink-3); font-weight: 700; padding: 8px 0; border-bottom: 1px solid var(--color-line); }
        .hh-row { padding: 9px 0; border-bottom: 1px solid var(--color-line); font-size: 0.76rem; font-weight: 600; }
        .hh-row:last-child { border-bottom: none; }
        .hh-t { color: var(--color-ink-2); font-family: ui-monospace, monospace; font-size: 0.7rem; }
        .hh-heat { font-weight: 800; }
      `}</style>
    </ReportShell>
  );
}
