// [리포트 PWA화] 주간 리포트 — content/weekly getStaticProps. 레거시 /weekly의 PWA 버전.
import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { useRouter } from "next/router";
import { useState, useEffect } from "react";
import { earn as earnToken } from "../../lib/activityToken"; // [S24-12] 주간 리포트 열람 토큰(주 1회)
import { getTrader as getTraderWk } from "../../lib/trader";
import ReportShell from "../../components/shared/ReportShell";
import ShareButton from "../../components/ShareButton";

// [S24-11] 부동산 주간 현황 — 기존 :5002 주간 리포트(/api/pwa/re/weekly, weekly_report.py 크론)를 재사용.
//   새 수집기 없음. 실거래가 없던 주도 "없음"을 정직하게. 분기로 움직이는 시장의 '주간 관찰 기록'.
function isoWeekLabel() {
  const d = new Date();
  const day = (d.getDay() + 6) % 7;
  const th = new Date(d); th.setDate(d.getDate() - day + 3);
  const firstTh = new Date(th.getFullYear(), 0, 4);
  const wk = 1 + Math.round(((th - firstTh) / 86400000 - 3 + ((firstTh.getDay() + 6) % 7)) / 7);
  const mon = new Date(d); mon.setDate(d.getDate() - day);
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
  const fmt = (x) => `${x.getMonth() + 1}/${x.getDate()}`;
  return { label: `${th.getFullYear()}년 ${wk}주차`, range: `${fmt(mon)}~${fmt(sun)}` };
}
function RealEstateWeekly() {
  const [re, setRe] = useState(null);
  const [done, setDone] = useState(false);
  useEffect(() => {
    try { earnToken("weekly", getTraderWk()); } catch (e) {} // [S24-12] 주간 리포트 열람(주 1회 상한)
    fetch("/api/pwa/re/weekly")
      .then((r) => r.json())
      .then((d) => {
        setRe(d && !d.error ? d : null); setDone(true);
        try {
          const trades = d && (d.total_trades ?? d.trades ?? (Array.isArray(d.items) ? d.items.length : null));
          if (d && !d.error) localStorage.setItem("onehub_re_weekly", JSON.stringify({ ts: Date.now(), trades: trades ?? null, leader: d.leader || d.leader_apt || null, leaderPrice: d.leader_price ?? d.price84_uk ?? null }));
        } catch (e) {}
      })
      .catch(() => setDone(true));
  }, []);
  const wk = isoWeekLabel();
  const trades = re ? (re.total_trades ?? re.trades ?? (Array.isArray(re.items) ? re.items.length : null)) : null;
  const summary = re ? (re.summary || re.headline || re.note || null) : null;
  return (
    <div className="rew">
      <div className="rew-h">🏠 부동산 주간 현황 <span className="rew-wk">{wk.label} ({wk.range})</span></div>
      {!done ? (
        <div className="rew-q">불러오는 중…</div>
      ) : re ? (
        <>
          {summary && <p className="rew-s">{summary}</p>}
          <div className="rew-row">
            {re.leader || re.leader_apt ? <span>지역 대장 <b>{re.leader || re.leader_apt}</b>{re.leader_price ?? re.price84_uk ? ` ${(re.leader_price ?? re.price84_uk)}억` : ""}</span> : null}
            <span>{trades != null ? (trades > 0 ? `지난주 실거래 ${trades}건` : "지난주 실거래 없음") : "실거래 집계 준비 중"}</span>
          </div>
          <div className="rew-note">부동산은 분기·연 단위로 움직입니다 — 주간은 관찰 기록입니다.</div>
        </>
      ) : (
        <div className="rew-q">이번 주 부동산 리포트가 아직 없습니다. 매주 월요일 갱신됩니다.</div>
      )}
      <style jsx>{`
        .rew { background: var(--color-card); border: 1px solid var(--color-line); border-radius: var(--radius-md); padding: 14px; margin-bottom: 14px; }
        .rew-h { font-size: var(--fs-4); font-weight: 800; color: var(--color-ink); margin-bottom: 8px; }
        .rew-wk { font-size: var(--fs-1); font-weight: 600; color: var(--color-ink-3); margin-left: 4px; }
        .rew-s { font-size: var(--fs-3); color: var(--color-ink-2); line-height: 1.5; margin: 0 0 8px; word-break: keep-all; }
        .rew-row { display: flex; flex-wrap: wrap; gap: 12px; font-size: var(--fs-3); color: var(--color-ink-2); }
        .rew-row b { color: var(--color-ink); }
        .rew-note { margin-top: 8px; font-size: var(--fs-1); color: var(--color-ink-3); }
        .rew-q { font-size: var(--fs-3); color: var(--color-ink-3); }
      `}</style>
    </div>
  );
}

const REGIME = { BULL: { l: "상승장", c: "var(--color-success)" }, BEAR: { l: "하락장", c: "var(--color-danger)" }, SIDEWAYS: { l: "횡보장", c: "var(--color-ink-2)" } };
const rg = (r) => REGIME[r] || REGIME.SIDEWAYS;
const heatColor = (v) => (v >= 75 ? "var(--color-danger)" : v >= 50 ? "var(--color-warning-ink)" : "var(--color-success)");

export default function PwaWeekly({ reports }) {
  const router = useRouter();
  return (
    <ReportShell title="📊 주간 리포트" sub="주간 국면·평균 과열도·매매 요약 · 눌러서 상세 보기">
      <RealEstateWeekly />
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
        .rp-empty { text-align: center; color: var(--color-ink-3); padding: 40px 0; font-size: var(--fs-4); }
        .wc { background: var(--color-card); border: 1px solid var(--color-line); border-radius: var(--radius-card); box-shadow: var(--shadow-card); padding: 16px; margin-bottom: 12px; }
        .wc-body { display: block; width: 100%; text-align: left; background: none; border: none; padding: 0; cursor: pointer; font-family: var(--font-sans); }
        .wc-body:active { opacity: .7; }
        .wc-share { margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--color-line); display: flex; justify-content: flex-end; }
        .wc-top { display: flex; align-items: baseline; gap: 10px; }
        .wc-week { font-size: var(--fs-5); font-weight: 800; font-family: ui-monospace, monospace; }
        .wc-regime { font-size: var(--fs-3); font-weight: 700; }
        .wc-go { margin-left: auto; font-size: var(--fs-4); font-weight: 800; color: var(--color-primary); }
        .wc-range { font-size: var(--fs-2); color: var(--color-ink-3); margin-top: 3px; font-family: ui-monospace, monospace; }
        .wc-stats { display: flex; gap: 10px; margin-top: 12px; }
        .ws { flex: 1; background: var(--color-card-soft); border-radius: var(--radius-sm); padding: 10px 13px; }
        .ws span { display: block; font-size: var(--fs-1); color: var(--color-ink-3); font-weight: 600; margin-bottom: 3px; }
        .ws b { font-size: var(--fs-5); font-weight: 800; color: var(--color-ink); }
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
