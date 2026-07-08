// ONE-HUB v10 — ETF / Asset Intelligence 대시보드 (P7, 작업지시서 §11.2)
// 독립 라우트. 확정값(수익3단분해·세금·중복도)은 진한색/실선. 예측(Forecast)은 미구현(P6).
// ★ 단일 점수 블랙박스 금지 — Portfolio Score는 구성요소를 펼쳐 보여준다(§11.2).
import { useEffect, useState } from "react";
import TopNav from "../../components/TopNav";
import AssetSummaryBar from "../../components/AssetSummaryBar";

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
  const [rebal, setRebal] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    const g = (fn) => fetch(`/api/pwa/etf/${fn}?trader=A`).then((r) => r.json());
    Promise.all([g("report"), g("tax"), g("overlap"), g("rebalance")])
      .then(([r, t, o, rb]) => {
        if (r.error || t.error) setErr(r.error || t.error);
        setReport(r); setTax(t); setOverlap(o); setRebal(rb);
      })
      .catch((e) => setErr(e.message));
  }, []);

  const s = report?.summary;
  const positions = (report?.positions || []).filter((p) => !p.error);

  return (
    <div className="etf">
      <TopNav active="etf" />

      {/* 1) HERO — ETF 총평가액 + 원화 실질수익 3분해 (시안: 다크 네이비 히어로) */}
      <section className="hero">
        <div className="eyebrow">
          <span className="lbl">📊 ETF 자산{report?.as_of ? ` · ${report.as_of.price_date || "-"} 기준 · 환율 ${report.as_of.fx?.toLocaleString()}원` : ""}</span>
          <span className="live">LIVE</span>
        </div>
        {s ? (
          <>
            <div className="big">{won(s.value_krw)}<span>원</span></div>
            <div className="hsub">취득 {won(s.krw_cost)} → 평가손익 <b>{won(s.value_krw - s.krw_cost)}원</b> · <b>{pct(s.total_pnl_pct)}</b></div>
            <div className="decomp">
              <div className="drow"><span className="dk">ETF 자체수익 ($)</span><span className={`dv ${sign(s.etf_self_pct)}`}>{pct(s.etf_self_pct)}</span></div>
              <div className="drow"><span className="dk">환차손익</span><span className={`dv ${sign(s.fx_pure_pct)}`}>{pct(s.fx_pure_pct)}</span></div>
              <div className="drow"><span className="dk">교차항</span><span className={`dv ${sign(s.cross_pct)}`}>{pct(s.cross_pct)}</span></div>
              <div className="drow total"><span className="dk">실질 원화수익</span><span className={`dv ${sign(s.total_pnl_pct)}`}>{pct(s.total_pnl_pct)}</span></div>
            </div>
            <div className="foot-note">달러 수익 {pct(s.etf_self_pct)} 위에 환율효과 {pct((s.fx_pure_pct||0) + (s.cross_pct||0))}가 더해진 원화 실질 수익입니다.</div>
          </>
        ) : (
          <div className="hsub">{err ? "데이터 로드 오류" : "불러오는 중…"}</div>
        )}
      </section>

      <AssetSummaryBar />
      {err && <div className="err">데이터 로드 오류: {err}</div>}

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

      {/* 3.5) 자산 배분 / 리밸런싱 (P4) */}
      {rebal && (
        <section className="card">
          <div className="label">자산 배분 · 리밸런싱
            <span className="sub">{rebal.actions ? "목표 대비" : "현재 비중"}</span>
          </div>
          {rebal.actions ? (
            <>
              {rebal.actions.filter((a) => a.action !== "HOLD").map((a) => (
                <div className="rb" key={a.ticker}>
                  <span className="rt">{a.ticker}</span>
                  <span className="rw">{(a.current_weight * 100).toFixed(1)}% → {(a.target_weight * 100).toFixed(0)}%</span>
                  <b className={a.action === "SELL" ? "neg" : "pos"}>{a.action} {a.qty}주</b>
                </div>
              ))}
              <div className="rb-tax">리밸런싱 매도 예상 양도세 <b className="neg">{won(rebal.est_tax_krw)}원</b> · 밴드 내는 보유 권장</div>
            </>
          ) : (
            <>
              {Object.entries(rebal.current || {}).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([t, w]) => (
                <div className="hrow" key={t}>
                  <span className="ht">{t}</span>
                  <div className="hbar"><div style={{ width: `${Math.min(100, w * 100 * 3)}%` }} /></div>
                  <span className="hw">{(w * 100).toFixed(1)}%</span>
                </div>
              ))}
              <div className="rb-tax sub">상위 종목 집중도 확인용. 목표비중 설정 시 실행 가능한 리밸런싱(세금 포함) 제안이 표시됩니다.</div>
            </>
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

      {/* 5) 종목별 수익 분해 — 총투자액/총이익금 SummaryBar + 3열 정렬(시안) */}
      {positions.length > 0 && (
        <section className="card">
          <div className="label">종목별 수익 분해</div>
          {s && (
            <div className="ebd-sum">
              <div className="es-item"><span className="es-k">총 투자액</span><span className="es-v">{won(s.krw_cost)}</span></div>
              <div className="es-item"><span className="es-k">총 이익금</span><span className={`es-v ${sign(s.value_krw - s.krw_cost)}`}>{won(s.value_krw - s.krw_cost)}</span></div>
            </div>
          )}
          {[...positions].sort((a, b) => (b.total_pnl_pct ?? b.usd_pnl_pct ?? 0) - (a.total_pnl_pct ?? a.usd_pnl_pct ?? 0)).map((p) => {
            const invest = p.krw_cost ?? p.invested_krw ?? p.cost_krw ?? null;
            const profit = p.pnl_krw ?? p.profit_krw ?? (p.value_krw != null && invest != null ? p.value_krw - invest : null);
            const tot = p.total_pnl_pct ?? p.usd_pnl_pct;
            return (
              <div className="erow" key={p.ticker}>
                <span className="eleft">
                  <span className="etk">{p.ticker}</span>
                  {invest != null && <span className="einv">{won(invest)}</span>}
                </span>
                <span className="emid">
                  {p.mode === "full" ? (
                    <><span className="eself">{pct(p.etf_self_pct)}</span><span className="echa">환차 {pct(p.fx_pure_pct)}</span></>
                  ) : (
                    <span className="eself sub">USD only</span>
                  )}
                </span>
                <span className="eright">
                  <span className={`ett ${sign(tot)}`}>{pct(tot)}</span>
                  {profit != null && <span className={`eprofit ${sign(profit)}`}>{profit >= 0 ? "+" : ""}{won(profit)}</span>}
                </span>
              </div>
            );
          })}
          <div className="ebd-note">왼쪽은 투자액, 가운데는 자체수익(달러)·환차손익, 오른쪽은 원화 실질수익률과 이익금입니다.</div>
        </section>
      )}

      <div className="foot">확정 계산(수익·세금·중복도)은 입력값 기반. 예측(Forecast)은 미탑재. · 세무자문 아님</div>

      <style jsx>{`
        .etf { max-width: 480px; margin: 0 auto; padding: 0 14px calc(env(safe-area-inset-bottom, 0px) + 24px); font-family: var(--font-sans); color: var(--color-ink); }
        .err { background: var(--color-danger-soft); color: var(--color-danger); padding: 10px 12px; border-radius: 10px; font-size: 0.82rem; margin-bottom: 12px; }
        .loading { color: var(--color-ink-2); padding: 24px; text-align: center; }
        .card { background: var(--color-card); border: 1px solid var(--color-line); border-radius: var(--radius-card); padding: 18px; margin-bottom: 14px; box-shadow: var(--shadow-card); }
        /* HERO */
        .hero { background: linear-gradient(135deg, var(--hero-grad-1), var(--hero-grad-2)); color: var(--hero-ink); border-radius: var(--radius-hero); padding: 20px 18px; box-shadow: var(--shadow-float); margin-bottom: 14px; }
        .hero .eyebrow { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 14px; }
        .hero .lbl { font-size: 12px; font-weight: 700; color: var(--hero-ink-sub); }
        .live { background: var(--color-success); color: #04351f; font-size: 9px; font-weight: 800; padding: 3px 7px; border-radius: 5px; letter-spacing: .5px; }
        .hero .big { font-size: 32px; font-weight: 800; letter-spacing: -.8px; line-height: 1; }
        .hero .big span { font-size: 19px; font-weight: 700; }
        .hero .hsub { font-size: 12.5px; color: var(--hero-ink-soft); margin-top: 9px; }
        .hero .hsub b { color: var(--hero-accent); font-weight: 700; }
        .decomp { background: var(--hero-fill); border: 1px solid var(--hero-fill-line); border-radius: 14px; padding: 14px; margin-top: 16px; }
        .drow { display: flex; align-items: center; justify-content: space-between; padding: 6px 0; }
        .drow .dk { font-size: 12.5px; color: var(--hero-ink-soft); font-weight: 500; }
        .drow .dv { font-size: 13px; font-weight: 700; color: var(--hero-accent); }
        .drow .dv.neg { color: var(--hero-danger); }
        .drow.total { border-top: 1px solid var(--hero-fill-line); margin-top: 6px; padding-top: 11px; }
        .drow.total .dk { color: var(--hero-ink); font-weight: 700; font-size: 13px; }
        .drow.total .dv { font-size: 16px; font-weight: 800; }
        .hero .foot-note { font-size: 11px; color: var(--hero-ink-faint); margin-top: 12px; line-height: 1.5; }
        .label { font-size: 0.9rem; font-weight: 700; color: var(--color-ink); margin-bottom: 12px; display: flex; align-items: center; }
        .label .sub, .sub { font-weight: 600; color: var(--color-ink-3); font-size: 0.68rem; margin-left: 6px; }
        /* [v10 UI §1] 초록=수익, 빨강=손실/비용 */
        .pos { color: var(--color-success); } .neg { color: var(--color-danger); }
        .score-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px 12px; }
        .sc { display: flex; flex-direction: column; gap: 3px; }
        .sc span { font-size: 0.72rem; color: var(--color-ink-3); font-weight: 600; } .sc b { font-size: 1rem; font-weight: 800; }
        .heat { display: flex; flex-direction: column; gap: 6px; }
        .hrow { display: flex; align-items: center; gap: 10px; margin-bottom: 5px; }
        .ht { width: 52px; font-size: 0.78rem; font-weight: 700; }
        .hbar { flex: 1; background: var(--color-line); border-radius: 6px; height: 9px; overflow: hidden; }
        .hbar div { height: 100%; background: var(--color-primary); border-radius: 6px; }
        .hw { width: 44px; text-align: right; font-size: 0.78rem; font-weight: 700; color: var(--color-ink-2); }
        .sectors { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 12px; }
        .chip { font-size: 0.72rem; font-weight: 700; background: var(--color-card-soft); color: var(--color-ink-2); padding: 6px 10px; border-radius: 9px; }
        .warn { margin-top: 10px; font-size: 0.74rem; color: var(--color-warning-ink); background: var(--color-warning-soft); padding: 7px 9px; border-radius: 8px; }
        .tax-line { display: flex; justify-content: space-between; align-items: baseline; font-size: 1.05rem; font-weight: 800; }
        .tax-line b { font-size: 1.3rem; }
        .tax-hint { font-size: 0.78rem; color: var(--color-ink-2); margin-top: 8px; line-height: 1.6; background: var(--color-card-soft); border-radius: 12px; padding: 12px 14px; }
        .tax-hint.sub { background: var(--color-success-soft); color: var(--color-success-ink); font-weight: 600; }
        /* per-ETF SummaryBar + aligned rows */
        .ebd-sum { display: flex; background: var(--color-card-soft); border-radius: 12px; padding: 14px 16px; margin-bottom: 8px; }
        .es-item { flex: 1; display: flex; flex-direction: column; gap: 5px; }
        .es-item + .es-item { border-left: 1px solid var(--color-line); padding-left: 16px; }
        .es-k { font-size: 0.72rem; color: var(--color-ink-3); font-weight: 600; }
        .es-v { font-size: 1.05rem; font-weight: 800; color: var(--color-ink); }
        .es-v.pos { color: var(--color-success); } .es-v.neg { color: var(--color-danger); }
        .erow { display: grid; grid-template-columns: 1fr 84px 92px; align-items: center; gap: 6px; padding: 12px 0; border-top: 1px solid var(--color-line); }
        .erow:first-of-type { border-top: none; }
        .eleft { display: flex; flex-direction: column; gap: 3px; }
        .eleft .etk { font-size: 0.9rem; font-weight: 800; }
        .eleft .einv { font-size: 0.68rem; color: var(--color-ink-3); font-weight: 500; }
        .emid { display: flex; flex-direction: column; gap: 3px; text-align: right; }
        .emid .eself { font-size: 0.74rem; color: var(--color-ink-2); font-weight: 600; }
        .emid .eself.sub { color: var(--color-ink-3); }
        .emid .echa { font-size: 0.66rem; color: var(--color-ink-3); font-weight: 500; }
        .eright { display: flex; flex-direction: column; gap: 3px; text-align: right; }
        .eright .ett { font-size: 0.9rem; font-weight: 800; }
        .eright .ett.pos { color: var(--color-success); } .eright .ett.neg { color: var(--color-danger); }
        .eright .eprofit { font-size: 0.72rem; font-weight: 700; }
        .eright .eprofit.pos { color: var(--color-success); } .eright .eprofit.neg { color: var(--color-danger); }
        .ebd-note { font-size: 0.66rem; color: var(--color-ink-3); line-height: 1.55; margin-top: 13px; padding-top: 12px; border-top: 1px solid var(--color-line); }
        .rb { display: flex; align-items: center; gap: 8px; padding: 6px 0; border-bottom: 1px solid var(--color-line); font-size: 0.84rem; }
        .rb .rt { width: 56px; font-weight: 700; font-family: ui-monospace, monospace; }
        .rb .rw { flex: 1; color: var(--color-ink-2); font-size: 0.74rem; }
        .rb-tax { font-size: 0.72rem; color: var(--color-ink-2); margin-top: 10px; background: var(--color-card-soft); padding: 7px 9px; border-radius: 8px; }
        .sample-badge { font-size: 10px; font-weight: 800; color: var(--color-warning-ink); background: var(--color-warning-soft); padding: 3px 8px; border-radius: 6px; margin-left: auto; }
        .foot { font-size: 0.68rem; color: var(--color-ink-3); text-align: center; margin-top: 16px; line-height: 1.5; }
      `}</style>
      <style jsx global>{`body { background: var(--color-bg); margin: 0; }`}</style>
    </div>
  );
}
