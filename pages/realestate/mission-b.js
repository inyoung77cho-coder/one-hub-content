// 미션 B — 상급지 이동 (격차). 데이터: /api/realestate/v2/upgrade-gap
import { useEffect, useState } from "react";
import Link from "next/link";

function Stars({ n = 3 }) { return <span style={{ color: "#f59e0b", letterSpacing: "2px" }}>{"★".repeat(n)}{"☆".repeat(5 - n)}</span>; }

export default function MissionB() {
  const [complex, setComplex] = useState("");
  const [data, setData] = useState(null);
  const [err, setErr] = useState(false);
  const [sel, setSel] = useState(0);

  useEffect(() => {
    try { const p = JSON.parse(localStorage.getItem("onehub_profile") || "{}"); setComplex(p.current_complex || "시범우성"); } catch { setComplex("시범우성"); }
  }, []);
  const load = () => {
    if (!complex) return;
    setData(null); setErr(false); setSel(0);
    fetch(`/api/realestate/v2/upgrade-gap?from_complex=${encodeURIComponent(complex)}&dong=서현동&area=84`)
      .then((r) => r.json()).then(setData).catch(() => setErr(true));
  };
  useEffect(() => { load(); }, [complex]);
  const cands = data?.candidates || [];
  const cur = cands[sel];

  return (
    <div className="m">
      <header className="hd"><Link href="/realestate" className="bk">←</Link><h1>상급지 이동</h1></header>
      <div className="cfg"><span className="from">기준: </span><input value={complex} onChange={(e) => setComplex(e.target.value)} placeholder="현재 단지" /></div>
      {err && <div className="err">데이터를 불러올 수 없습니다. <button onClick={load}>재시도</button></div>}
      {!data && !err && <div className="card sk" />}
      {data && cands.length === 0 && <div className="card"><div className="none">추천 상급지가 없습니다 (기준 단지가 최상위이거나 데이터 부족)</div></div>}
      {cands.length > 0 && (
        <>
          <div className="chips">
            {cands.map((c, i) => <button key={c.complex} className={`chip ${i === sel ? "on" : ""}`} onClick={() => setSel(i)}>{c.complex}</button>)}
          </div>
          <div className="card gap">
            <div className="gap-label">{complex} → {cur.complex} 현재 격차</div>
            <div className="gap-big">{cur.current_gap_uk}억</div>
          </div>
          <div className="card ai">
            <Stars n={cur.ai?.stars ?? 3} />
            <div className="ai-msg">{cur.ai?.decision}</div>
            <ul className="reasons">{(cur.ai?.reasons || []).map((r, i) => <li key={i}>{r}</li>)}</ul>
          </div>
          {cur.history?.length > 0 && (
            <div className="card">
              <div className="tbl-h">격차 추이 (최근 6개월)</div>
              {cur.history.slice(-6).map((h) => (
                <div className="tbl-r" key={h.ym}><span>{h.ym.slice(0, 4)}.{h.ym.slice(4)}</span><b>{h.gap_uk}억</b></div>
              ))}
            </div>
          )}
        </>
      )}
      {data && <div className="upd">업데이트: {data.updated_at}</div>}
      <style jsx>{`
        .m { max-width: 480px; margin: 0 auto; min-height: 100vh; background: #f7f9fc; padding: 0 14px 40px; font-family: -apple-system, sans-serif; color: #111827; }
        .hd { display: flex; align-items: center; gap: 10px; padding: 14px 2px; position: sticky; top: 0; background: #f7f9fc; }
        .bk { text-decoration: none; color: #2563eb; font-size: 1.2rem; font-weight: 700; } .hd h1 { font-size: 1.05rem; font-weight: 800; margin: 0; }
        .cfg { display: flex; align-items: center; gap: 6px; padding: 0 2px 12px; font-size: 0.8rem; color: #6b7280; }
        .cfg input { flex: 1; padding: 9px 12px; border: 1px solid #e5e7eb; border-radius: 10px; font-size: 0.85rem; }
        .chips { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 10px; }
        .chip { white-space: nowrap; padding: 7px 14px; border-radius: 18px; border: 1px solid #e5e7eb; background: #fff; font-weight: 600; font-size: 0.8rem; }
        .chip.on { background: #2563eb; color: #fff; border-color: #2563eb; }
        .card { background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px; margin-bottom: 10px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
        .sk { height: 90px; background: #eceff3; border: none; animation: p 1.4s infinite; } @keyframes p { 50% { opacity: .5; } }
        .gap { background: linear-gradient(135deg,#f0f9ff,#e0f2fe); border-color: #bae6fd; }
        .gap-label { font-size: 0.75rem; color: #475569; } .gap-big { font-size: 2rem; font-weight: 800; }
        .ai-msg { font-weight: 800; margin-top: 6px; }
        .reasons { margin: 8px 0 0; padding-left: 16px; font-size: 0.78rem; color: #475569; }
        .tbl-h { font-size: 0.75rem; font-weight: 700; color: #6b7280; margin-bottom: 8px; }
        .tbl-r { display: flex; justify-content: space-between; padding: 5px 0; font-size: 0.84rem; border-bottom: 1px solid #f1f5f9; }
        .none { color: #9ca3af; font-size: 0.85rem; }
        .err { padding: 16px; color: #b45309; } .err button { margin-left: 8px; text-decoration: underline; }
        .upd { text-align: center; font-size: 0.68rem; color: #9ca3af; margin-top: 8px; }
      `}</style>
      <style jsx global>{`body { background: #f7f9fc; margin: 0; }`}</style>
    </div>
  );
}
