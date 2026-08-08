// [리포트 PWA화] 주간 리포트 — content/weekly getStaticProps. 레거시 /weekly의 PWA 버전.
import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { useRouter } from "next/router";
import ReportShell from "../../components/shared/ReportShell";
import ShareButton from "../../components/ShareButton";

const REGIME = { BULL: { l: "상승장", c: "var(--color-success)" }, BEAR: { l: "하락장", c: "var(--color-danger)" }, SIDEWAYS: { l: "횡보장", c: "var(--color-ink-2)" } };
const rg = (r) => REGIME[r] || REGIME.SIDEWAYS;
const heatColor = (v) => (v >= 75 ? "var(--color-danger)" : v >= 50 ? "var(--color-warning-ink)" : "var(--color-success)");

export default function PwaWeekly({ reports }) {
  const router = useRouter();
  return (
    <ReportShell title="📊 주간 리포트" sub="주간 국면·평균 과열도·매매 요약 · 눌러서 상세 보기">
      {(!reports || reports.length === 0) ? (
        <div className="rp-empty">아직 주간 리포트가 없습니다.</div>
      ) : (
        reports.map((w, i) => {
          const r = rg(w.dominant_regime);
          return (
            <div className="wc" key={w.week || i}>
              <button className="wc-body" onClick={() => router.push(`/weekly/${w.week}`)}>
                <div className="wc-top">
                  <span className="wc-week">{w.week}</span>
                  <span className="wc-regime" style={{ color: r.c }}>{r.l}</span>
                  <span className="wc-go">→</span>
                </div>
                {(w.monday || w.friday) && <div className="wc-range">{w.monday}{w.friday ? ` ~ ${w.friday}` : ""}</div>}
                <div className="wc-stats">
                  <div className="ws"><span>평균 과열도</span><b style={w.avg_heat != null ? { color: heatColor(w.avg_heat) } : undefined}>{w.avg_heat != null ? w.avg_heat : "—"}</b></div>
                  <div className="ws"><span>매매</span><b>{w.total_trades}건</b></div>
                </div>
              </button>
              <div className="wc-share"><ShareButton title={`ONE-HUB 주간 리포트 ${w.week}`} text={`${w.week} · ${r.l} · 평균 과열도 ${w.avg_heat ?? "-"}`} url={`https://one-hub-content.vercel.app/weekly/${w.week}`} /></div>
            </div>
          );
        })
      )}
      <style jsx>{`
        .rp-empty { text-align: center; color: var(--color-ink-3); padding: 40px 0; font-size: 0.85rem; }
        .wc { background: var(--color-card); border: 1px solid var(--color-line); border-radius: var(--radius-card); box-shadow: var(--shadow-card); padding: 16px; margin-bottom: 12px; }
        .wc-body { display: block; width: 100%; text-align: left; background: none; border: none; padding: 0; cursor: pointer; font-family: var(--font-sans); }
        .wc-body:active { opacity: .7; }
        .wc-share { margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--color-line); display: flex; justify-content: flex-end; }
        .wc-top { display: flex; align-items: baseline; gap: 10px; }
        .wc-week { font-size: 0.95rem; font-weight: 800; font-family: ui-monospace, monospace; }
        .wc-regime { font-size: 0.8rem; font-weight: 700; }
        .wc-go { margin-left: auto; font-size: 0.9rem; font-weight: 800; color: var(--color-primary); }
        .wc-range { font-size: 0.72rem; color: var(--color-ink-3); margin-top: 3px; font-family: ui-monospace, monospace; }
        .wc-stats { display: flex; gap: 10px; margin-top: 12px; }
        .ws { flex: 1; background: var(--color-card-soft); border-radius: 11px; padding: 10px 13px; }
        .ws span { display: block; font-size: 0.66rem; color: var(--color-ink-3); font-weight: 600; margin-bottom: 3px; }
        .ws b { font-size: 1.05rem; font-weight: 800; color: var(--color-ink); }
      `}</style>
    </ReportShell>
  );
}

export async function getStaticProps() {
  const dir = path.join(process.cwd(), "content", "weekly");
  if (!fs.existsSync(dir)) return { props: { reports: [] } };
  const seen = new Set();
  const reports = fs.readdirSync(dir).filter((f) => f.endsWith(".md")).sort().reverse().reduce((acc, f) => {
    const { data } = matter(fs.readFileSync(path.join(dir, f), "utf8"));
    const week = data.week || data.slug || f.replace(".md", "");
    if (seen.has(week)) return acc;
    seen.add(week);
    acc.push({ week, monday: data.monday || data.mon || "", friday: data.friday || data.fri || "", dominant_regime: data.dominant_regime || "SIDEWAYS", avg_heat: data.avg_heat ?? null, total_trades: data.total_trades || data.trade_count || 0 });
    return acc;
  }, []);
  return { props: { reports } };
}
