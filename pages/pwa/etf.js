// ONE-HUB v10 — ETF / Asset Intelligence 대시보드 (P7, 작업지시서 §11.2)
// 독립 라우트. 확정값(수익3단분해·세금·중복도)은 진한색/실선. 예측(Forecast)은 미구현(P6).
// ★ 단일 점수 블랙박스 금지 — Portfolio Score는 구성요소를 펼쳐 보여준다(§11.2).
import { useEffect, useState } from "react";
import Link from "next/link";

const won = (n) => {
  if (n == null) return "-";
  const a = Math.abs(n);
  if (a >= 1e8) return `${(n / 1e8).toFixed(2)}억`;
  if (a >= 1e4) return `${Math.round(n / 1e4).toLocaleString()}만`;
  return Math.round(n).toLocaleString();
};
const pct = (n) => (n == null ? "-" : `${n > 0 ? "+" : ""}${n.toFixed(2)}%`);
const sign = (n) => (n > 0 ? "pos" : n < 0 ? "neg" : "");

export default function EtfDashboard() {
  const [report, setReport] = useState(null);
  const [tax, setTax] = useState(null);
  const [overlap, setOverlap] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    const g = (fn) => fetch(`/api/pwa/etf/${fn}?trader=A`).then((r) => r.json());
    Promise.all([g("report"), g("tax"), g("overlap")])
      .then(([r, t, o]) => {
        if (r.error || t.error) setErr(r.error || t.error);
        setReport(r); setTax(t); setOverlap(o);
      })
      .catch((e) => setErr(e.message));
  }, []);

  const s = report?.summary;
  const positions = (report?.positions || []).filter((p) => !p.error);

  return (
    <div className="etf">
      <header className="etf-hdr">
        <Link href="/pwa" className="back">← ONE-HUB</Link>
        <h1>ETF 자산</h1>
        <span className="live">LIVE</span>
      </header>

      {err && <div className="err">데이터 로드 오류: {err}</div>}
      {!report && !err && <div className="loading">불러오는 중…</div>}

      {/* 1) 자산총액 + 수익 3단 분해 (확정값) */}
      {s && (
        <section className="card solid">
          <div className="label">총 평가액 (원화, 확정)</div>
          <div className="big">{won(s.value_krw)}원</div>
          <div className={`change ${sign(s.total_pnl_pct)}`}>
            {pct(s.total_pnl_pct)} · 취득 {won(s.krw_cost)}원 → 평가손익 {won(s.value_krw - s.krw_cost)}원
          </div>
          <div className="decomp">
            <div className="drow"><span>ETF 자체수익</span><b className="pos">{pct(s.etf_self_pct)}</b></div>
            <div className="drow"><span>환차손익</span><b className={sign(s.fx_pure_pct)}>{pct(s.fx_pure_pct)}</b></div>
            <div className="drow"><span>교차항</span><b className={sign(s.cross_pct)}>{pct(s.cross_pct)}</b></div>
            <div className="drow total"><span>실질 원화수익</span><b className={sign(s.total_pnl_pct)}>{pct(s.total_pnl_pct)}</b></div>
          </div>
          <div className="hint">달러 수익 {pct(s.etf_self_pct)} 위에 환율효과 {pct(s.fx_pure_pct + s.cross_pct)}가 더해진 원화 실질 수익</div>
        </section>
      )}

      {/* 2) Portfolio Score — 블랙박스 금지, 구성요소 공개 */}
      {s && tax && overlap && (
        <section className="card">
          <div className="label">Portfolio Score <span className="sub">구성요소</span></div>
          <div className="score-grid">
            <div className="sc"><span>실질 수익률</span><b className={sign(s.total_pnl_pct)}>{pct(s.total_pnl_pct)}</b></div>
            <div className="sc"><span>종목 수</span><b>{positions.length}</b></div>
            <div className="sc"><span>최대 섹터집중</span><b>{overlap.sectors?.[0] ? `${overlap.sectors[0].sector} ${(overlap.sectors[0].weight * 100).toFixed(0)}%` : "-"}</b></div>
            <div className="sc"><span>예상 양도세</span><b className="neg">{won(tax.tax_all)}원</b></div>
            <div className="sc"><span>손익통산 손실</span><b>{tax.losses?.map((l) => l.ticker).join(", ") || "없음"}</b></div>
            <div className="sc"><span>배당(연)</span><b className="pos">${tax.dividend_usd}</b></div>
          </div>
        </section>
      )}

      {/* 3) Overlap Heat Map (확정, SAMPLE holdings) */}
      {overlap && !overlap.error && (
        <section className="card">
          <div className="label">종목 중복 노출 (Heat Map)
            <span className="sub">{overlap.note?.includes("SAMPLE") ? "SAMPLE·주간수집 축적중" : ""}</span>
          </div>
          <div className="heat">
            {overlap.stocks?.slice(0, 8).map((st) => (
              <div className="hrow" key={st.ticker}>
                <span className="ht">{st.ticker}</span>
                <div className="hbar"><div style={{ width: `${Math.min(100, st.weight * 100 * 6)}%` }} /></div>
                <span className="hw">{(st.weight * 100).toFixed(1)}%</span>
              </div>
            ))}
          </div>
          <div className="sectors">
            {overlap.sectors?.slice(0, 5).map((sc) => (
              <span className="chip" key={sc.sector}>{sc.sector} {(sc.weight * 100).toFixed(0)}%</span>
            ))}
          </div>
          {overlap.warnings?.length > 0 && (
            <div className="warn">⚠ {overlap.warnings.join(" · ")}</div>
          )}
        </section>
      )}

      {/* 4) 절세 (확정 계산) */}
      {tax && (
        <section className="card">
          <div className="label">세금 · 절세 <span className="sub">확정 계산</span></div>
          <div className="tax-line"><span>전량 매도 시 양도세</span><b className="neg">{won(tax.tax_all)}원</b></div>
          <div className="tax-hint">
            순이익 {won(tax.net)}원 − 기본공제 250만 = 과세표준 {won(tax.base_all)}원 × 22%
          </div>
          <div className="tax-hint sub">
            손실종목({tax.losses?.map((l) => l.ticker).join("·") || "-"}) 손익통산 후. 손실수확+이익이연 시 올해 0원 가능.
          </div>
        </section>
      )}

      {/* 5) 종목별 3단 분해 */}
      {positions.length > 0 && (
        <section className="card">
          <div className="label">종목별 수익 분해</div>
          {[...positions].sort((a, b) => (b.total_pnl_pct ?? b.usd_pnl_pct ?? 0) - (a.total_pnl_pct ?? a.usd_pnl_pct ?? 0)).map((p) => (
            <div className="prow" key={p.ticker}>
              <span className="pt">{p.ticker}</span>
              {p.mode === "full" ? (
                <span className="pd">ETF {pct(p.etf_self_pct)} · 환차 {pct(p.fx_pure_pct)}</span>
              ) : (
                <span className="pd sub">USD only</span>
              )}
              <b className={sign(p.total_pnl_pct ?? p.usd_pnl_pct)}>{pct(p.total_pnl_pct ?? p.usd_pnl_pct)}</b>
            </div>
          ))}
        </section>
      )}

      <div className="foot">확정 계산(수익·세금·중복도)은 입력값 기반. 예측(Forecast)은 미탑재. · 세무자문 아님</div>

      <style jsx>{`
        .etf { max-width: 480px; margin: 0 auto; padding: 0 14px 40px; font-family: -apple-system, "Segoe UI", sans-serif; color: #1e293b; }
        .etf-hdr { display: flex; align-items: center; gap: 10px; padding: 16px 2px 10px; position: sticky; top: 0; background: #f8fafc; z-index: 5; }
        .etf-hdr h1 { font-size: 1.15rem; font-weight: 800; margin: 0; flex: 1; }
        .back { color: #0284c7; text-decoration: none; font-size: 0.82rem; font-weight: 600; }
        .live { font-size: 0.62rem; font-weight: 800; color: #fff; background: #0ea5e9; padding: 2px 7px; border-radius: 6px; letter-spacing: 0.05em; }
        .err { background: #fef2f2; color: #b91c1c; padding: 10px 12px; border-radius: 10px; font-size: 0.82rem; }
        .loading { color: #64748b; padding: 24px; text-align: center; }
        .card { background: #fff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 16px; margin-bottom: 12px; box-shadow: 0 1px 3px rgba(15,23,42,0.04); }
        .card.solid { background: linear-gradient(135deg, #f0f9ff, #e0f2fe); border-color: #bae6fd; }
        .label { font-size: 0.78rem; font-weight: 700; color: #475569; margin-bottom: 8px; }
        .label .sub, .sub { font-weight: 600; color: #94a3b8; font-size: 0.68rem; margin-left: 6px; }
        .big { font-size: 1.9rem; font-weight: 800; letter-spacing: -0.02em; }
        .change { font-size: 0.8rem; color: #475569; margin: 2px 0 12px; }
        .decomp { border-top: 1px dashed #cbd5e1; padding-top: 8px; }
        .drow { display: flex; justify-content: space-between; padding: 4px 0; font-size: 0.9rem; }
        .drow span { color: #475569; }
        .drow.total { border-top: 1px solid #e2e8f0; margin-top: 4px; padding-top: 8px; font-weight: 800; }
        .hint { font-size: 0.72rem; color: #0369a1; margin-top: 8px; background: #f0f9ff; padding: 7px 9px; border-radius: 8px; }
        .pos { color: #dc2626; } .neg { color: #2563eb; }
        .score-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        .sc { background: #f8fafc; border-radius: 10px; padding: 8px 10px; display: flex; flex-direction: column; gap: 2px; }
        .sc span { font-size: 0.68rem; color: #64748b; } .sc b { font-size: 0.92rem; }
        .heat { display: flex; flex-direction: column; gap: 6px; }
        .hrow { display: flex; align-items: center; gap: 8px; }
        .ht { width: 54px; font-size: 0.78rem; font-weight: 700; font-family: ui-monospace, monospace; }
        .hbar { flex: 1; background: #f1f5f9; border-radius: 5px; height: 14px; overflow: hidden; }
        .hbar div { height: 100%; background: linear-gradient(90deg, #0ea5e9, #0284c7); border-radius: 5px; }
        .hw { width: 44px; text-align: right; font-size: 0.76rem; font-weight: 700; color: #0369a1; }
        .sectors { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
        .chip { font-size: 0.7rem; font-weight: 600; background: #e0f2fe; color: #0369a1; padding: 3px 9px; border-radius: 20px; }
        .warn { margin-top: 10px; font-size: 0.74rem; color: #b45309; background: #fffbeb; padding: 7px 9px; border-radius: 8px; }
        .tax-line { display: flex; justify-content: space-between; font-size: 1rem; font-weight: 700; }
        .tax-hint { font-size: 0.72rem; color: #64748b; margin-top: 6px; }
        .prow { display: flex; align-items: center; gap: 8px; padding: 6px 0; border-bottom: 1px solid #f1f5f9; font-size: 0.84rem; }
        .prow .pt { width: 56px; font-weight: 700; font-family: ui-monospace, monospace; }
        .prow .pd { flex: 1; color: #64748b; font-size: 0.74rem; }
        .prow b { font-size: 0.86rem; }
        .foot { font-size: 0.68rem; color: #94a3b8; text-align: center; margin-top: 16px; line-height: 1.5; }
      `}</style>
      <style jsx global>{`body { background: #f8fafc; margin: 0; }`}</style>
    </div>
  );
}
