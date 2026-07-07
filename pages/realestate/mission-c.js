// 미션 C — AI 지역 탐색 (지역 랭킹). 데이터: /api/realestate/v2/region-ranking
import { useEffect, useState } from "react";
import Link from "next/link";

function Stars({ n = 3 }) { return <span style={{ color: "#f59e0b", letterSpacing: "1px" }}>{"★".repeat(n)}{"☆".repeat(5 - n)}</span>; }

export default function MissionC() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(false);
  const load = () => { setData(null); setErr(false); fetch("/api/realestate/v2/region-ranking").then((r) => r.json()).then(setData).catch(() => setErr(true)); };
  useEffect(load, []);
  const rk = data?.ranking || [];
  const top = rk[0];

  return (
    <div className="m">
      <header className="hd"><Link href="/realestate" className="bk">←</Link><h1>AI 지역 탐색</h1></header>
      {err && <div className="err">데이터를 불러올 수 없습니다. <button onClick={load}>재시도</button></div>}
      {!data && !err && <div className="card sk big" />}
      {top && (
        <div className="card win">
          <div className="win-rank">🥇 1위</div>
          <div className="win-name">{top.dong}</div>
          <div className="win-score">ONE Score {top.one_score} <Stars n={top.stars} /></div>
          <div className="tags">{(top.reasons || []).map((t, i) => <span className="tag" key={i}>{t}</span>)}</div>
        </div>
      )}
      {rk.slice(1).map((r, i) => (
        <div className="card row" key={r.dong}>
          <span className="rk">{i + 2}</span>
          <span className="dong">{r.dong}</span>
          <div className="tags sm">{(r.reasons || []).slice(0, 2).map((t, k) => <span className="tag" key={k}>{t}</span>)}</div>
          <span className="sc">{r.one_score}</span>
        </div>
      ))}
      {data && <div className="upd">업데이트: {data.updated_at} 기준</div>}
      <style jsx>{`
        .m { max-width: 480px; margin: 0 auto; min-height: 100vh; background: #f7f9fc; padding: 0 14px 40px; font-family: -apple-system, sans-serif; color: #111827; }
        .hd { display: flex; align-items: center; gap: 10px; padding: 14px 2px; position: sticky; top: 0; background: #f7f9fc; }
        .bk { text-decoration: none; color: #2563eb; font-size: 1.2rem; font-weight: 700; }
        .hd h1 { font-size: 1.05rem; font-weight: 800; margin: 0; }
        .card { background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 14px; margin-bottom: 10px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
        .sk.big { height: 110px; background: #eceff3; border: none; animation: p 1.4s infinite; } @keyframes p { 50% { opacity: .5; } }
        .win { background: linear-gradient(135deg,#fffbeb,#fef9c3); border-color: #fde68a; }
        .win-rank { font-size: 0.75rem; font-weight: 700; color: #b45309; }
        .win-name { font-size: 1.5rem; font-weight: 800; margin: 4px 0; }
        .win-score { font-size: 0.85rem; color: #374151; }
        .tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
        .tag { font-size: 0.68rem; font-weight: 600; background: #e0f2fe; color: #0369a1; padding: 2px 8px; border-radius: 12px; }
        .row { display: flex; align-items: center; gap: 10px; }
        .rk { color: #9ca3af; font-weight: 700; width: 16px; }
        .dong { font-weight: 700; font-size: 0.92rem; }
        .tags.sm { flex: 1; }
        .sc { font-weight: 800; color: #2563eb; }
        .err { padding: 16px; color: #b45309; } .err button { margin-left: 8px; text-decoration: underline; }
        .upd { text-align: center; font-size: 0.68rem; color: #9ca3af; margin-top: 8px; }
      `}</style>
      <style jsx global>{`body { background: #f7f9fc; margin: 0; }`}</style>
    </div>
  );
}
