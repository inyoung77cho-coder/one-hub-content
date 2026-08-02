// [리포트 PWA화] 일간 리포트 — content/daily(+daily-b) getStaticProps. 레거시 /daily의 PWA 버전.
import { useState } from "react";
import fs from "fs";
import path from "path";
import matter from "gray-matter";
import ReportShell from "../../components/shared/ReportShell";

const REGIME = { BULL: { l: "상승장", c: "var(--color-success)" }, BEAR: { l: "하락장", c: "var(--color-danger)" }, SIDEWAYS: { l: "횡보장", c: "var(--color-ink-2)" } };
const rg = (r) => REGIME[r] || REGIME.SIDEWAYS;
const heatColor = (v) => (v >= 75 ? "var(--color-danger)" : v >= 50 ? "var(--color-warning-ink)" : "var(--color-success)");

export default function PwaDaily({ posts, postsB }) {
  const [trader, setTrader] = useState("A");
  const [open, setOpen] = useState(null);
  const list = trader === "B" ? postsB : posts;

  return (
    <ReportShell title="📅 일간 리포트" sub="매일 장 마감 AI 판단 요약">
      <div className="tt">
        {["A", "B"].map((t) => (
          <button key={t} className={trader === t ? "on" : ""} onClick={() => { setTrader(t); setOpen(null); }}>Trader {t}</button>
        ))}
      </div>
      {(!list || list.length === 0) ? (
        <div className="rp-empty">아직 일간 리포트가 없습니다.</div>
      ) : (
        list.map((p, i) => {
          const r = rg(p.regime); const isOpen = open === i;
          return (
            <div className="dc" key={p.date || i}>
              <button className="dc-top" onClick={() => setOpen(isOpen ? null : i)} aria-expanded={isOpen}>
                <span className="dc-date">{p.date}</span>
                <span className="dc-regime" style={{ color: r.c }}>{r.l}</span>
                {p.heat_score != null && <span className="dc-heat" style={{ color: heatColor(p.heat_score) }}>Heat {p.heat_score}</span>}
                <span className="dc-trades">매매 {p.trade_count}</span>
                <span className="dc-caret">{isOpen ? "▾" : "▸"}</span>
              </button>
              {isOpen && p.insight && <div className="dc-insight">{p.insight}</div>}
            </div>
          );
        })
      )}
      <style jsx>{`
        .tt { display: flex; gap: 6px; margin-bottom: 14px; }
        .tt button { border: 1px solid var(--color-line); background: var(--color-card); color: var(--color-ink-2); border-radius: 999px; padding: 7px 16px; font-size: 0.8rem; font-weight: 700; font-family: var(--font-sans); cursor: pointer; }
        .tt button.on { background: var(--color-primary); border-color: var(--color-primary); color: #fff; }
        .rp-empty { text-align: center; color: var(--color-ink-3); padding: 40px 0; font-size: 0.85rem; }
        .dc { background: var(--color-card); border: 1px solid var(--color-line); border-radius: var(--radius-card); box-shadow: var(--shadow-card); margin-bottom: 10px; overflow: hidden; }
        .dc-top { width: 100%; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 13px 15px; background: none; border: none; cursor: pointer; font-family: var(--font-sans); text-align: left; }
        .dc-date { font-size: 0.86rem; font-weight: 800; color: var(--color-ink); font-family: ui-monospace, monospace; }
        .dc-regime { font-size: 0.78rem; font-weight: 700; }
        .dc-heat { font-size: 0.74rem; font-weight: 700; }
        .dc-trades { font-size: 0.72rem; color: var(--color-ink-3); }
        .dc-caret { margin-left: auto; color: var(--color-ink-3); }
        .dc-insight { padding: 0 15px 14px; font-size: 0.84rem; color: var(--color-ink-2); line-height: 1.6; word-break: keep-all; white-space: pre-wrap; }
      `}</style>
    </ReportShell>
  );
}

function load(dir) {
  try {
    const d = path.join(process.cwd(), "content", dir);
    return fs.readdirSync(d).filter((f) => f.endsWith(".md")).sort().reverse().map((file) => {
      const { data } = matter(fs.readFileSync(path.join(d, file), "utf-8"));
      return { date: data.date || file.replace(".md", ""), regime: data.regime || "SIDEWAYS", heat_score: data.heat_score ?? null, insight: data.insight || "", trade_count: data.trade_count || 0 };
    });
  } catch (e) { return []; }
}

export async function getStaticProps() {
  return { props: { posts: load("daily"), postsB: load("daily-b") } };
}
