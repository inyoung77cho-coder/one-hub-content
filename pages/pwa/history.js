// [리포트 PWA화] AI 히스토리 — /api/pwa-history. 레거시 /history의 PWA 버전.
import { useState, useEffect } from "react";
import ReportShell from "../../components/shared/ReportShell";
import { getTrader } from "../../lib/trader";

const ACT = {
  BUY: { label: "🟢 매수", color: "var(--color-success)" },
  SELL: { label: "🔴 매도", color: "var(--color-danger)" },
};
const act = (a) => ACT[a] || { label: "⚪ 관망", color: "var(--color-ink-3)" };
const REGIME = { BULL: "상승장", BEAR: "하락장", SIDEWAYS: "횡보장" };
const confColor = (c) => (c === "HIGH" ? "var(--color-success)" : c === "MEDIUM" ? "var(--color-warning-ink)" : "var(--color-ink-3)");

export default function PwaHistory() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [ok, setOk] = useState(true);
  const [trader, setTrader] = useState("A");

  useEffect(() => { try { setTrader((getTrader() || "A").toUpperCase()); } catch (e) {} }, []);
  useEffect(() => {
    setLoading(true);
    fetch(`/api/pwa-history?trader=${trader}&limit=30`)
      .then((r) => r.json())
      .then((d) => { setItems(d.items || []); setOk(d.ok !== false); setLoading(false); })
      .catch(() => { setOk(false); setLoading(false); });
  }, [trader]);

  return (
    <ReportShell title="🤖 AI 히스토리" sub="AI가 언제·무엇을·왜 분석했는지 판단 기록">
      <div className="tt">
        {["A", "B"].map((t) => (
          <button key={t} className={trader === t ? "on" : ""} onClick={() => setTrader(t)}>Trader {t}</button>
        ))}
      </div>
      {loading ? (
        <div className="rp-empty">불러오는 중…</div>
      ) : !ok ? (
        <div className="rp-empty">데이터를 불러올 수 없습니다.</div>
      ) : items.length === 0 ? (
        <div className="rp-empty">아직 분석 기록이 없습니다.</div>
      ) : (
        items.map((it, i) => {
          const a = act(it.action);
          return (
            <div className="hc" key={i}>
              <div className="hc-top">
                <span className="hc-name">{it.stock}</span>
                <span className="hc-act" style={{ color: a.color }}>{a.label}</span>
                <span className="hc-date">{it.date}</span>
              </div>
              <div className="hc-meta">
                <span>점수 <b>{it.ai_score}pt</b></span>
                <span style={{ color: confColor(it.confidence) }}>신뢰도 {it.confidence}</span>
                <span>시장 {REGIME[it.global_risk] || it.global_risk || "-"}</span>
                {it.key_signal && <span className="hc-sig">신호 {it.key_signal}</span>}
              </div>
              {it.reason && <div className="hc-reason">{it.reason}</div>}
            </div>
          );
        })
      )}
      <style jsx>{`
        .tt { display: flex; gap: 6px; margin-bottom: 14px; }
        .tt button { border: 1px solid var(--color-line); background: var(--color-card); color: var(--color-ink-2); border-radius: 999px; padding: 7px 16px; font-size: var(--fs-3); font-weight: 700; font-family: var(--font-sans); cursor: pointer; }
        .tt button.on { background: var(--color-primary); border-color: var(--color-primary); color: var(--color-on-primary); }
        .rp-empty { text-align: center; color: var(--color-ink-3); padding: 40px 0; font-size: var(--fs-4); }
        .hc { background: var(--color-card); border: 1px solid var(--color-line); border-radius: var(--radius-card); box-shadow: var(--shadow-card); padding: 16px; margin-bottom: 12px; }
        .hc-top { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
        .hc-name { font-size: var(--fs-5); font-weight: 800; }
        .hc-act { font-size: var(--fs-3); font-weight: 800; }
        .hc-date { margin-left: auto; font-size: var(--fs-2); color: var(--color-ink-3); font-family: ui-monospace, monospace; }
        .hc-meta { display: flex; flex-wrap: wrap; gap: 6px 12px; margin-top: 8px; font-size: var(--fs-2); color: var(--color-ink-2); }
        .hc-meta b { color: var(--color-ink); font-weight: 800; }
        .hc-sig { color: var(--color-ink-3); }
        .hc-reason { font-size: var(--fs-3); color: var(--color-ink-2); margin-top: 8px; line-height: 1.55; word-break: keep-all; }
      `}</style>
    </ReportShell>
  );
}
