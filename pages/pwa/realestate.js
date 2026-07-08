// ONE-HUB v10 — 부동산 자산 대시보드 (PWA, onehub-realestate 5002 연동)
// ETF 대시보드와 동일 패턴. ONE Score 랭킹/시장 브리핑/저평가/거시. 확정 데이터는 진한색.
import { useEffect, useState } from "react";
import TopNav from "../../components/TopNav";
import AssetSummaryBar from "../../components/AssetSummaryBar";

const uk = (n) => (n == null ? "-" : `${Number(n).toFixed(2)}억`);
const pct = (n) => (n == null ? "-" : `${n > 0 ? "+" : ""}${Number(n).toFixed(1)}%`);
// [v10 UI §1] 초록=저평가/매수, 빨강=고평가/매도, 회색=중립/관망
const decoColor = (d) => (d?.includes("매수") ? "buy" : d?.includes("매도") ? "sell" : "hold");
const valColor = (v) => (v?.includes("저평가") ? "buy" : v?.includes("고평가") ? "sell" : "hold");

export default function RealEstateDashboard() {
  const [brief, setBrief] = useState(null);
  const [rank, setRank] = useState(null);
  const [macro, setMacro] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    const g = (fn) => fetch(`/api/pwa/re/${fn}`).then((r) => r.json());
    Promise.all([g("briefing"), g("ranking"), g("macro")])
      .then(([b, r, m]) => {
        if (b.error) setErr(b.error);
        setBrief(b); setRank(r); setMacro(m);
      })
      .catch((e) => setErr(e.message));
  }, []);

  const mac = macro?.latest;

  return (
    <div className="re">
      <TopNav active="realestate" />
      <div className="re-title"><h1>부동산 자산</h1><span className="live">LIVE</span></div>

      <AssetSummaryBar />

      {err && <div className="err">데이터 로드 오류: {err}</div>}
      {!brief && !err && <div className="loading">불러오는 중…</div>}

      {/* 1) 시장 브리핑 (확정) */}
      {brief && !brief.error && (
        <section className="card solid">
          <div className="label">시장 브리핑 · {brief.region}</div>
          <div className="phase">{brief.phase}</div>
          <div className="lead">대장 <b>{brief.leader}</b> {uk(brief.leader_price)}</div>
          <div className="chg">
            <span>분기 <b className={brief.chg_q > 0 ? "up" : "down"}>{pct(brief.chg_q)}</b></span>
            <span>연간 <b className={brief.chg_yr > 0 ? "up" : "down"}>{pct(brief.chg_yr)}</b></span>
          </div>
        </section>
      )}

      {/* 2) ONE Score 랭킹 */}
      {rank?.ranking?.length > 0 && (
        <section className="card">
          <div className="label">ONE Score 랭킹 <span className="sub">단지별 종합점수·판정</span></div>
          {rank.ranking.map((c, i) => (
            <div className="rk" key={c.단지명}>
              <span className="rk-no">{i + 1}</span>
              <span className="rk-name">{c.단지명}</span>
              <span className="rk-avm">{uk(c.avm_total_uk)}</span>
              <span className={`rk-val ${valColor(c.valuation)}`}>{c.valuation}</span>
              <span className="rk-score">{c.one_score}</span>
              <span className={`rk-deco ${decoColor(c.decision)}`}>{c.decision}</span>
            </div>
          ))}
          <div className="rk-foot">업데이트 {rank.ranking[0]?.updated} · AVM=자동가치추정, ONE Score는 구성요소 종합(블랙박스 아님)</div>
        </section>
      )}

      {/* 3) 저평가 단지 (briefing.under) */}
      {brief?.under?.length > 0 && (
        <section className="card">
          <div className="label">저평가 후보 <span className="sub">현재가 vs 회귀예측</span></div>
          {brief.under.slice(0, 6).map((u) => (
            <div className="uv" key={u.단지명}>
              <span className="uv-name">{u.단지명}</span>
              <span className="uv-px">{uk(u.cur)} → 예측 {uk(u.pred)}</span>
              <b className="uv-gap up">+{Number(u.gap).toFixed(1)}%</b>
              <span className="uv-r2">R²{Number(u.r2).toFixed(2)}</span>
            </div>
          ))}
          <div className="rk-foot">gap=예측 대비 상승여력(회귀 근사·확정 아님). R²=적합도.</div>
        </section>
      )}

      {/* 4) 거시 */}
      {mac && (
        <section className="card">
          <div className="label">거시 환경 <span className="sub">{mac.연월}</span></div>
          <div className="macro">
            <span className="chip">KOSPI {Math.round(mac.kospi).toLocaleString()}</span>
            <span className="chip">기준금리 {mac.base_rate}%</span>
            <span className="chip">정책 {mac.policy_stance}</span>
          </div>
          <div className="rk-foot">{mac.kospi_src || ""}</div>
        </section>
      )}

      <div className="foot">실거래 기반 확정 지표 + 회귀 예측(근사). 예측치는 참고용이며 투자판단은 본인 책임.</div>

      <style jsx>{`
        .re { max-width: 480px; margin: 0 auto; padding: 0 14px calc(env(safe-area-inset-bottom, 0px) + 24px); font-family: var(--font-sans); color: var(--color-ink); }
        .re-title { display: flex; align-items: center; gap: 10px; padding: 12px 2px 6px; }
        .re-title h1 { font-size: 1.15rem; font-weight: 800; margin: 0; flex: 1; color: var(--color-ink); }
        .live { font-size: 0.62rem; font-weight: 800; color: #fff; background: var(--color-primary); padding: 2px 7px; border-radius: 6px; letter-spacing: 0.05em; }
        .err { background: var(--color-danger-soft); color: var(--color-danger); padding: 10px 12px; border-radius: 10px; font-size: 0.82rem; }
        .loading { color: var(--color-ink-2); padding: 24px; text-align: center; }
        .card { background: var(--color-card); border: 1px solid var(--color-line); border-radius: var(--radius-card); padding: 16px; margin-bottom: 12px; box-shadow: var(--shadow-card); }
        .card.solid { background: linear-gradient(135deg, var(--hero-grad-1), var(--hero-grad-2)); border-color: transparent; color: var(--hero-ink); }
        .card.solid .label { color: var(--hero-ink-sub); }
        .card.solid .phase { color: var(--hero-ink); }
        .card.solid .lead { color: var(--hero-ink-soft); }
        .card.solid .chg { color: var(--hero-ink-soft); }
        .label { font-size: 0.78rem; font-weight: 700; color: var(--color-ink-2); margin-bottom: 8px; }
        .sub { font-weight: 600; color: var(--color-ink-3); font-size: 0.68rem; margin-left: 6px; }
        .phase { font-size: 1.6rem; font-weight: 800; letter-spacing: -0.02em; }
        .lead { font-size: 0.9rem; color: var(--color-ink-2); margin: 4px 0; }
        .lead b { color: var(--hero-ink); }
        .chg { display: flex; gap: 18px; margin-top: 8px; font-size: 0.85rem; color: var(--hero-ink-soft); }
        /* [v10 UI §1] 초록=상승/저평가/매수, 빨강=하락/고평가/매도 */
        .up { color: var(--hero-accent); } .down { color: var(--hero-danger); }
        .rk { display: grid; grid-template-columns: 20px 1fr auto auto auto auto; gap: 8px; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--color-line); font-size: 0.82rem; }
        .rk-no { color: var(--color-ink-3); font-weight: 700; }
        .rk-name { font-weight: 700; }
        .rk-avm { color: var(--color-ink-2); font-size: 0.74rem; }
        .rk-val, .rk-deco { font-size: 0.68rem; font-weight: 700; padding: 2px 6px; border-radius: 6px; }
        .rk-val.buy, .rk-deco.buy { background: var(--color-success-soft); color: var(--color-success-ink); }
        .rk-val.sell, .rk-deco.sell { background: var(--color-danger-soft); color: var(--color-danger); }
        .rk-val.hold, .rk-deco.hold { background: var(--color-card-soft); color: var(--color-ink-2); }
        .rk-score { font-weight: 800; font-size: 0.95rem; }
        .rk-foot { font-size: 0.66rem; color: var(--color-ink-3); margin-top: 8px; line-height: 1.4; }
        .uv { display: grid; grid-template-columns: 1fr auto auto auto; gap: 8px; align-items: center; padding: 7px 0; border-bottom: 1px solid var(--color-line); font-size: 0.82rem; }
        .uv-name { font-weight: 700; }
        .uv-px { color: var(--color-ink-2); font-size: 0.72rem; }
        .uv-gap { font-size: 0.86rem; }
        .uv-gap.up { color: var(--color-success); }
        .uv-r2 { font-size: 0.66rem; color: var(--color-ink-3); }
        .macro { display: flex; flex-wrap: wrap; gap: 8px; }
        .chip { font-size: 0.76rem; font-weight: 600; background: var(--color-primary-soft); color: var(--color-primary); padding: 4px 11px; border-radius: 20px; }
        .foot { font-size: 0.68rem; color: var(--color-ink-3); text-align: center; margin-top: 16px; line-height: 1.5; }
      `}</style>
      <style jsx global>{`body { background: var(--color-bg); margin: 0; }`}</style>
    </div>
  );
}
