// ONE-HUB v10 — 부동산 자산 대시보드 (PWA, onehub-realestate 5002 연동)
// ETF 대시보드와 동일 패턴. ONE Score 랭킹/시장 브리핑/저평가/거시. 확정 데이터는 진한색.
import { useEffect, useState } from "react";
import TopNav from "../../components/TopNav";
import AssetSummaryBar from "../../components/AssetSummaryBar";

const uk = (n) => (n == null ? "-" : `${Number(n).toFixed(2)}억`);
const pct = (n) => (n == null ? "-" : `${n > 0 ? "+" : ""}${Number(n).toFixed(1)}%`);
// [v10 UI §1] 시맨틱: 저평가=초록(under), 고평가=빨강(over), 적정=회색(fair)
//   매수검토=파랑(buy·주요액션), 관망=회색(watch·중립)
const vtag = (v) => (v?.includes("저평가") ? "under" : v?.includes("고평가") ? "over" : "fair");
const jtag = (d) => (d?.includes("매수") ? "buy" : "watch");

export default function RealEstateDashboard() {
  const [brief, setBrief] = useState(null);
  const [rank, setRank] = useState(null);
  const [macro, setMacro] = useState(null);
  const [feed, setFeed] = useState(null); // [v11 #16] 최근 실거래 피드
  const [err, setErr] = useState(null);

  useEffect(() => {
    const g = (fn) => fetch(`/api/pwa/re/${fn}`).then((r) => r.json());
    Promise.all([g("briefing"), g("ranking"), g("macro"), g("feed")])
      .then(([b, r, m, f]) => {
        if (b.error) setErr(b.error);
        setBrief(b); setRank(r); setMacro(m); setFeed(f);
      })
      .catch((e) => setErr(e.message));
  }, []);

  const mac = macro?.latest;

  return (
    <div className="re">
      <TopNav active="realestate" />

      {/* 1) HERO — 시장 브리핑 (다크 네이비 히어로) */}
      <section className="hero">
        <div className="eyebrow">
          <span className="lbl">🏢 시장 브리핑{brief?.region ? ` · ${brief.region}` : ""}</span>
          <span className="live">LIVE</span>
        </div>
        {brief && !brief.error ? (
          <>
            <div className="big">{brief.phase}</div>
            <div className="brief-lead">대장 단지 <b>{brief.leader}</b> · {uk(brief.leader_price)}</div>
            <div className="brief-stats">
              <div className="bstat"><span>분기</span><b>{pct(brief.chg_q)}</b></div>
              <div className="bstat"><span>연간</span><b>{pct(brief.chg_yr)}</b></div>
            </div>
          </>
        ) : (
          <div className="brief-lead">{err ? "데이터 로드 오류" : "불러오는 중…"}</div>
        )}
      </section>

      {/* slim CTA — 내 단지 등록 유도 (§5③ 미입력=회색 중립, 위험 아님) */}
      <div className="cta-slim">🏠 이 지역에 내 단지가 있나요? <b>등록하면 총자산·리밸런싱에 반영돼요</b><span className="arr">→</span></div>

      <AssetSummaryBar />

      {/* 2) ONE Score 랭킹 */}
      {rank?.ranking?.length > 0 && (
        <section className="card">
          <div className="label">🏆 ONE Score 랭킹 <span className="sub">단지별 종합점수</span></div>
          {rank.ranking.map((c, i) => (
            <div className="rrow" key={c.단지명}>
              <span className="rk">{i + 1}</span>
              <span className="rmid">
                <span className="rname">{c.단지명} <span className={`vtag ${vtag(c.valuation)}`}>{c.valuation}</span></span>
                <span className="rsub">{uk(c.avm_total_uk)}</span>
              </span>
              <span className="rright">
                <span className="rscore">{c.one_score}</span>
                <span className={`jtag ${jtag(c.decision)}`}>{c.decision}</span>
              </span>
            </div>
          ))}
          <div className="note">업데이트 {rank.ranking[0]?.updated} · AVM=자동가치추정. ONE Score는 구성요소 종합이며 블랙박스가 아닙니다.</div>
        </section>
      )}

      {/* 2.5) 최근 실거래 피드 (#16) — raw_transactions 기반, 동일 단지·평형 직전 대비 변동률 */}
      {feed?.feed?.length > 0 && (
        <section className="card">
          <div className="label">📈 최근 실거래 <span className="sub">동일 단지·평형 직전 거래 대비</span></div>
          {feed.feed.slice(0, 8).map((f, i) => (
            <div className="frow" key={`${f.단지명}-${f.거래일}-${i}`}>
              <div className="fmid">
                <div className="fname">{f.단지명}</div>
                <div className="fsub">{f.전용면적}㎡ · {f.층 ? `${f.층}층` : "-"} · {f.건축연도 ? `${f.건축연도}년` : "-"} · {f.거래일?.slice(5)}</div>
              </div>
              <div className="fright">
                <div className="fprice">{f.거래금액_억}억</div>
                {f.변동률 != null && (
                  <div className={`fchg ${f.변동률 > 0 ? "up" : f.변동률 < 0 ? "dn" : "fl"}`}>
                    {f.변동률 > 0 ? "▲" : f.변동률 < 0 ? "▼" : "−"}{Math.abs(f.변동률)}%
                  </div>
                )}
              </div>
            </div>
          ))}
          <div className="note">{feed.note}{feed.updated ? ` · 업데이트 ${feed.updated}` : ""}</div>
        </section>
      )}

      {/* 3) 저평가 후보 */}
      {brief?.under?.length > 0 && (
        <section className="card">
          <div className="label">💎 저평가 후보 <span className="sub">현재가 vs 회귀예측</span></div>
          {brief.under.slice(0, 6).map((u) => (
            <div className="urow" key={u.단지명}>
              <div>
                <div className="uname">{u.단지명}</div>
                <div className="usub">{uk(u.cur)} → 예측 <b>{uk(u.pred)}</b> · R² {Number(u.r2).toFixed(2)}</div>
              </div>
              <div className="ugap">+{Number(u.gap).toFixed(1)}%</div>
            </div>
          ))}
          <div className="note">gap = 예측 대비 상승여력(회귀 근사·확정 아님). R² = 적합도.</div>
        </section>
      )}

      {/* 4) 거시 */}
      {mac && (
        <section className="card">
          <div className="label">🌐 거시 환경 <span className="sub">{mac.연월}</span></div>
          <div className="chips">
            <span className="chip">KOSPI <b>{Math.round(mac.kospi).toLocaleString()}</b></span>
            <span className="chip">기준금리 <b>{mac.base_rate}%</b></span>
            <span className="chip">정책 <b>{mac.policy_stance}</b></span>
          </div>
          <div className="note">{mac.kospi_src || "연말 종가 보간(근사·월별 정밀치 아님)."}</div>
        </section>
      )}

      <div className="foot">실거래 기반 확정 지표 + 회귀 예측(근사). 예측치는 참고용이며 투자판단은 본인 책임.</div>

      <style jsx>{`
        .re { max-width: 480px; margin: 0 auto; padding: 0 14px calc(env(safe-area-inset-bottom, 0px) + 24px); font-family: var(--font-sans); color: var(--color-ink); }
        .err { background: var(--color-danger-soft); color: var(--color-danger); padding: 10px 12px; border-radius: 10px; font-size: 0.82rem; margin-bottom: 12px; }
        .card { background: var(--color-card); border: 1px solid var(--color-line); border-radius: var(--radius-card); padding: 18px; margin-bottom: 14px; box-shadow: var(--shadow-card); }
        /* HERO — 시장 브리핑 */
        .hero { background: linear-gradient(135deg, var(--hero-grad-1), var(--hero-grad-2)); color: var(--hero-ink); border-radius: var(--radius-hero); padding: 20px 18px; box-shadow: var(--shadow-float); margin-bottom: 14px; }
        .hero .eyebrow { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 14px; }
        .hero .lbl { font-size: 12px; font-weight: 700; color: var(--hero-ink-sub); }
        .live { background: var(--color-success); color: #04351f; font-size: 9px; font-weight: 800; padding: 3px 7px; border-radius: 5px; letter-spacing: .5px; }
        .hero .big { font-size: 28px; font-weight: 800; letter-spacing: -.6px; line-height: 1; }
        .brief-lead { font-size: 12.5px; color: var(--hero-ink-soft); margin-top: 11px; }
        .brief-lead b { color: var(--hero-ink); font-weight: 700; }
        .brief-stats { display: flex; gap: 9px; margin-top: 16px; }
        .bstat { flex: 1; background: var(--hero-fill); border: 1px solid var(--hero-fill-line); border-radius: 13px; padding: 11px 13px; }
        .bstat span { display: block; font-size: 11px; color: var(--hero-ink-sub); font-weight: 600; margin-bottom: 4px; }
        .bstat b { font-size: 15px; font-weight: 800; color: var(--hero-accent); }
        /* slim CTA */
        .cta-slim { display: flex; align-items: center; gap: 8px; background: var(--color-primary-soft); border-radius: 14px; padding: 13px 15px; margin-bottom: 14px; font-size: 12.5px; color: var(--color-ink-2); font-weight: 600; cursor: pointer; line-height: 1.45; }
        .cta-slim b { color: var(--color-primary); font-weight: 700; }
        .cta-slim .arr { margin-left: auto; color: var(--color-primary); font-weight: 800; flex-shrink: 0; }
        .label { font-size: 0.9rem; font-weight: 700; color: var(--color-ink); margin-bottom: 12px; }
        .sub { font-weight: 600; color: var(--color-ink-3); font-size: 0.68rem; margin-left: 6px; }
        /* ONE Score 랭킹 */
        .rrow { display: grid; grid-template-columns: 22px 1fr auto; align-items: center; gap: 10px; padding: 12px 0; border-top: 1px solid var(--color-line); }
        .rrow:first-of-type { border-top: none; }
        .rk { font-size: 13px; font-weight: 800; color: var(--color-ink-3); text-align: center; }
        .rmid { min-width: 0; }
        .rname { font-size: 14px; font-weight: 700; letter-spacing: -.2px; display: flex; align-items: center; gap: 6px; }
        .vtag { font-size: 10px; font-weight: 800; padding: 2px 7px; border-radius: 6px; flex-shrink: 0; }
        .vtag.fair { background: var(--color-card-soft); color: var(--color-ink-2); }
        .vtag.under { background: var(--color-success-soft); color: var(--color-success-ink); }
        .vtag.over { background: var(--color-danger-soft); color: var(--color-danger); }
        .rsub { font-size: 11.5px; color: var(--color-ink-3); font-weight: 500; margin-top: 3px; }
        .rright { text-align: right; display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }
        .rscore { font-size: 16px; font-weight: 800; color: var(--color-primary); line-height: 1; }
        .jtag { font-size: 10.5px; font-weight: 800; padding: 3px 9px; border-radius: 7px; }
        .jtag.buy { background: var(--color-primary-soft); color: var(--color-primary); }
        .jtag.watch { background: var(--color-card-soft); color: var(--color-ink-3); }
        /* 최근 실거래 피드 (#16) */
        .frow { display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 10px; padding: 11px 0; border-top: 1px solid var(--color-line); }
        .frow:first-of-type { border-top: none; }
        .fmid { min-width: 0; }
        .fname { font-size: 13.5px; font-weight: 700; letter-spacing: -.2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .fsub { font-size: 11px; color: var(--color-ink-3); font-weight: 500; margin-top: 3px; }
        .fright { text-align: right; flex-shrink: 0; }
        .fprice { font-size: 14px; font-weight: 800; color: var(--color-ink); line-height: 1.1; }
        .fchg { font-size: 11px; font-weight: 800; margin-top: 2px; }
        .fchg.up { color: var(--color-danger); }
        .fchg.dn { color: var(--color-primary); }
        .fchg.fl { color: var(--color-ink-3); }
        /* 저평가 후보 */
        .urow { display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 10px; padding: 13px 0; border-top: 1px solid var(--color-line); }
        .urow:first-of-type { border-top: none; }
        .uname { font-size: 14px; font-weight: 700; }
        .usub { font-size: 11.5px; color: var(--color-ink-3); font-weight: 500; margin-top: 4px; }
        .usub b { color: var(--color-ink-2); font-weight: 600; }
        .ugap { font-size: 17px; font-weight: 800; color: var(--color-success); text-align: right; }
        /* 거시 chips */
        .chips { display: flex; flex-wrap: wrap; gap: 8px; }
        .chip { font-size: 12px; font-weight: 700; color: var(--color-ink-2); background: var(--color-card-soft); border-radius: 11px; padding: 9px 13px; }
        .chip b { color: var(--color-primary); margin-left: 3px; }
        .note { font-size: 11px; color: var(--color-ink-3); line-height: 1.55; margin-top: 13px; padding-top: 12px; border-top: 1px solid var(--color-line); }
        .foot { font-size: 0.68rem; color: var(--color-ink-3); text-align: center; margin-top: 16px; line-height: 1.5; }
      `}</style>
      <style jsx global>{`body { background: var(--color-bg); margin: 0; }`}</style>
    </div>
  );
}
