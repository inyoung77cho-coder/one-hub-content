// 미션 A — 우리집 갈아타기 (Gap Tracker). 데이터: /api/realestate/v2/gap-tracker
import { useEffect, useState } from "react";
import Link from "next/link";

const AREAS = [59, 84, 109, 129];
function Stars({ n = 3 }) { return <span style={{ color: "#f59e0b", letterSpacing: "2px" }}>{"★".repeat(n)}{"☆".repeat(5 - n)}</span>; }

export default function MissionA() {
  const [complex, setComplex] = useState("");
  const [fromA, setFromA] = useState(84);
  const [toA, setToA] = useState(109);
  const [data, setData] = useState(null);
  const [err, setErr] = useState(false);
  const [why, setWhy] = useState(false);

  useEffect(() => {
    try { const p = JSON.parse(localStorage.getItem("onehub_profile") || "{}"); setComplex(p.current_complex || "시범삼성"); } catch { setComplex("시범삼성"); }
  }, []);
  const load = () => {
    if (!complex) return;
    setData(null); setErr(false);
    fetch(`/api/realestate/v2/gap-tracker?complex=${encodeURIComponent(complex)}&from_area=${fromA}&to_area=${toA}`)
      .then((r) => r.json()).then(setData).catch(() => setErr(true));
  };
  useEffect(() => { load(); }, [complex, fromA, toA]);
  const ai = data?.ai;

  return (
    <div className="m">
      <header className="hd"><Link href="/realestate" className="bk">←</Link><h1>우리집 갈아타기</h1></header>
      <div className="cfg">
        <input value={complex} onChange={(e) => setComplex(e.target.value)} placeholder="단지명" />
        <div className="areas">
          <select value={fromA} onChange={(e) => setFromA(+e.target.value)}>{AREAS.map((a) => <option key={a} value={a}>{a}㎡</option>)}</select>
          <span>→</span>
          <select value={toA} onChange={(e) => setToA(+e.target.value)}>{AREAS.map((a) => <option key={a} value={a}>{a}㎡</option>)}</select>
        </div>
      </div>
      {err && <div className="err">데이터를 불러올 수 없습니다. <button onClick={load}>재시도</button></div>}
      {!data && !err && <div className="card sk" />}
      {data && (
        <>
          <div className="card gap">
            <div className="gap-label">{fromA}㎡ → {toA}㎡ 현재 Gap</div>
            {data.current_gap_uk != null ? (
              <>
                <div className="gap-big">{data.current_gap_uk}억</div>
                {data.change_uk != null && <div className="gap-chg" style={{ color: data.change_uk < 0 ? "#16a34a" : "#dc2626" }}>
                  6개월 전 대비 {data.change_uk < 0 ? "▼" : "▲"} {Math.abs(data.change_uk)}억</div>}
              </>
            ) : <div className="gap-none">해당 평형 실거래 데이터 부족</div>}
          </div>
          <div className="card ai">
            <div className="ai-top"><Stars n={ai?.stars ?? 3} /> <button className="why" onClick={() => setWhy(!why)}>왜?</button></div>
            <div className="ai-msg">{ai?.decision}</div>
            {why && <ul className="reasons">{(ai?.reasons || []).map((r, i) => <li key={i}>{r}</li>)}</ul>}
          </div>
          {data.area_table?.length > 0 && (
            <div className="card">
              <div className="tbl-h">전 평형 현재가 (6개월 변화)</div>
              {data.area_table.map((r) => (
                <div className="tbl-r" key={r.area}>
                  <span>{r.area}㎡</span><b>{r.price_uk}억</b>
                  <span style={{ color: r.change_pct > 0 ? "#dc2626" : "#16a34a" }}>{r.change_pct != null ? `${r.change_pct > 0 ? "+" : ""}${r.change_pct}%` : "-"}</span>
                  <span className="cnt">{r.deal_count}건</span>
                </div>
              ))}
            </div>
          )}
          <div className="upd">업데이트: {data.updated_at}</div>
        </>
      )}
      <style jsx>{`
        .m { max-width: 480px; margin: 0 auto; min-height: 100vh; background: #f7f9fc; padding: 0 14px 40px; font-family: -apple-system, sans-serif; color: #111827; }
        .hd { display: flex; align-items: center; gap: 10px; padding: 14px 2px; position: sticky; top: 0; background: #f7f9fc; }
        .bk { text-decoration: none; color: #2563eb; font-size: 1.2rem; font-weight: 700; } .hd h1 { font-size: 1.05rem; font-weight: 800; margin: 0; }
        .cfg { display: flex; gap: 8px; padding: 0 2px 12px; }
        .cfg input { flex: 1; padding: 9px 12px; border: 1px solid #e5e7eb; border-radius: 10px; font-size: 0.85rem; }
        .areas { display: flex; align-items: center; gap: 6px; } .areas select { padding: 8px; border: 1px solid #e5e7eb; border-radius: 10px; }
        .card { background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px; margin-bottom: 10px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
        .sk { height: 90px; background: #eceff3; border: none; animation: p 1.4s infinite; } @keyframes p { 50% { opacity: .5; } }
        .gap { background: linear-gradient(135deg,#f0f9ff,#e0f2fe); border-color: #bae6fd; }
        .gap-label { font-size: 0.75rem; color: #475569; } .gap-big { font-size: 2rem; font-weight: 800; }
        .gap-chg { font-size: 0.85rem; font-weight: 700; } .gap-none { color: #9ca3af; font-size: 0.85rem; margin-top: 6px; }
        .ai-top { display: flex; align-items: center; justify-content: space-between; }
        .why { border: 1px solid #e5e7eb; background: #fff; border-radius: 8px; padding: 3px 10px; font-size: 0.72rem; }
        .ai-msg { font-weight: 800; margin-top: 6px; }
        .reasons { margin: 8px 0 0; padding-left: 16px; font-size: 0.78rem; color: #475569; }
        .tbl-h { font-size: 0.75rem; font-weight: 700; color: #6b7280; margin-bottom: 8px; }
        .tbl-r { display: grid; grid-template-columns: 50px 1fr auto 44px; align-items: center; gap: 8px; padding: 5px 0; font-size: 0.84rem; border-bottom: 1px solid #f1f5f9; }
        .cnt { text-align: right; font-size: 0.7rem; color: #9ca3af; }
        .err { padding: 16px; color: #b45309; } .err button { margin-left: 8px; text-decoration: underline; }
        .upd { text-align: center; font-size: 0.68rem; color: #9ca3af; margin-top: 8px; }
      `}</style>
      <style jsx global>{`body { background: #f7f9fc; margin: 0; }`}</style>
    </div>
  );
}
