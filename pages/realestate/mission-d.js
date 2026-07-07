// 미션 D — 저평가 단지 찾기 (ONE Score + AVM 괴리율). 데이터: /api/realestate/v2/undervalue
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";

const decoColor = (d) => (d?.includes("적극") || d?.includes("매수") ? "#dc2626" : d?.includes("매도") ? "#2563eb" : "#64748b");
const valColor = (v) => (v?.includes("저평가") ? "#16a34a" : v?.includes("고평가") ? "#dc2626" : "#64748b");

export default function MissionD() {
  const router = useRouter();
  const [data, setData] = useState(null);
  const [err, setErr] = useState(false);
  const [minScore, setMinScore] = useState(50);

  const load = (ms) => {
    setData(null); setErr(false);
    fetch(`/api/realestate/v2/undervalue?dong=서현동&min_score=${ms}&area=84`)
      .then((r) => r.json()).then(setData).catch(() => setErr(true));
  };
  useEffect(() => { load(minScore); }, [minScore]);

  return (
    <div className="m">
      <header className="hd"><Link href="/realestate" className="bk">←</Link><h1>저평가 단지 찾기</h1></header>
      <div className="filter">
        <span>ONE Score 최저</span>
        {[50, 60, 70].map((v) => (
          <button key={v} className={minScore === v ? "on" : ""} onClick={() => setMinScore(v)}>{v}+</button>
        ))}
      </div>
      {err && <div className="err">데이터를 불러올 수 없습니다. <button onClick={() => load(minScore)}>재시도</button></div>}
      {!data && !err && [0, 1, 2].map((i) => <div className="card sk" key={i} />)}
      {data?.complexes?.map((c) => (
        <div className="card row" key={c.complex}>
          <div className="left">
            <div className="name">{c.complex}</div>
            <div className="meta">
              {c.avm_ready ? <>AVM {c.avm_uk}억{c.diff_pct != null && <span style={{ color: c.diff_pct < 0 ? "#16a34a" : "#dc2626" }}> · 괴리 {c.diff_pct > 0 ? "+" : ""}{c.diff_pct}%</span>}</>
                : <span className="muted">AI 적정가 준비 중</span>}
            </div>
          </div>
          <div className="right">
            <div className="score">{c.one_score}</div>
            <span className="val" style={{ color: valColor(c.valuation) }}>{c.valuation || "-"}</span>
            <span className="deco" style={{ color: decoColor(c.decision) }}>{c.decision}</span>
          </div>
        </div>
      ))}
      {data && <div className="upd">업데이트: {data.updated_at} · {data.total}개 단지</div>}
      <style jsx>{`
        .m { max-width: 480px; margin: 0 auto; min-height: 100vh; background: #f7f9fc; padding: 0 14px 40px; font-family: -apple-system, sans-serif; color: #111827; }
        .hd { display: flex; align-items: center; gap: 10px; padding: 14px 2px; position: sticky; top: 0; background: #f7f9fc; }
        .bk { text-decoration: none; color: #2563eb; font-size: 1.2rem; font-weight: 700; }
        .hd h1 { font-size: 1.05rem; font-weight: 800; margin: 0; }
        .filter { display: flex; align-items: center; gap: 8px; padding: 4px 2px 12px; font-size: 0.78rem; color: #6b7280; }
        .filter button { padding: 5px 12px; border-radius: 16px; border: 1px solid #e5e7eb; background: #fff; font-weight: 600; font-size: 0.78rem; }
        .filter button.on { background: #2563eb; color: #fff; border-color: #2563eb; }
        .card { background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 14px; margin-bottom: 10px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
        .sk { height: 64px; background: #eceff3; border: none; animation: p 1.4s infinite; } @keyframes p { 50% { opacity: .5; } }
        .row { display: flex; justify-content: space-between; align-items: center; }
        .name { font-weight: 800; font-size: 0.95rem; }
        .meta { font-size: 0.74rem; color: #6b7280; margin-top: 3px; } .muted { color: #9ca3af; }
        .right { text-align: right; display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
        .score { font-size: 1.3rem; font-weight: 800; color: #2563eb; }
        .val, .deco { font-size: 0.7rem; font-weight: 700; }
        .err { padding: 16px; color: #b45309; } .err button { margin-left: 8px; text-decoration: underline; }
        .upd { text-align: center; font-size: 0.68rem; color: #9ca3af; margin-top: 8px; }
      `}</style>
      <style jsx global>{`body { background: #f7f9fc; margin: 0; }`}</style>
    </div>
  );
}
