// [S22-5] 내 판단 성적표 — 증권사가 절대 안 만드는 화면.
//   "지난 판단 중 관망이 몇 번, 관망한 종목의 평균은 얼마였나" 를 나 자신 기준으로만 보여준다.
//   숫자는 전부 lib/verdictStats.getVerdictScorecard(두 원장 통합) 단일 소스. 다른 사용자와 비교 안 함.
import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import AppHeader from "../../components/AppHeader";
import BottomNav from "../../components/BottomNav";
import { getTrader } from "../../lib/trader";
import { getVerdictScorecard } from "../../lib/verdictStats";
import { samplePolicy } from "../../lib/sampleSize";

const pct = (v) => (v == null ? "–" : `${v > 0 ? "+" : ""}${v}%`);

export default function RecordPage() {
  const router = useRouter();
  const [sc, setSc] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const load = () => { try { setSc(getVerdictScorecard(getTrader())); } catch (e) { setSc(null); } setReady(true); };
    load();
    const on = () => load();
    window.addEventListener("onehub-trader-change", on);
    window.addEventListener("onehub-game-change", on);
    return () => { window.removeEventListener("onehub-trader-change", on); window.removeEventListener("onehub-game-change", on); };
  }, []);

  const pol = sc ? samplePolicy(sc.scored) : null;
  const learning = !pol || pol.tier === "learning";

  return (
    <div className="rec-wrap">
      <AppHeader />
      <main className="rec-main">
        <h1 className="rec-title">🧾 내 판단 성적표</h1>
        <p className="rec-lead">AI 제안에 대한 내 응답을 <b>나 자신 기준</b>으로 채점합니다. 다른 사람과 비교하지 않습니다.</p>

        {!ready ? (
          <div className="rec-card"><p className="rec-quiet">불러오는 중…</p></div>
        ) : !sc || sc.total === 0 ? (
          <div className="rec-card">
            <p className="rec-quiet">아직 남긴 판단이 없습니다. 추천·대결 카드에서 <b>샀어요/관망</b>을 누르면 3거래일 뒤부터 채점됩니다.</p>
            <button className="rec-cta" onClick={() => router.push("/pwa?tab=recommend")}>추천 보러 가기 →</button>
          </div>
        ) : (
          <>
            {/* 모수 — getVerdictStats 단일 소스 */}
            <div className="rec-card">
              <div className="rec-row"><span>내 판단</span><b>{sc.total}건</b><span className="rec-sub">추천 {sc.bySource.recommend.total} · 대결 {sc.bySource.duel.total}</span></div>
              <div className="rec-row"><span>채점 완료</span><b>{sc.scored}건</b>{learning && <span className="rec-sub">30건부터 정식 판정</span>}</div>
            </div>

            {sc.scored === 0 ? (
              <div className="rec-card"><p className="rec-quiet">아직 채점된 판단이 없습니다 — 3거래일이 지나면 결과가 쌓입니다.</p></div>
            ) : (
              <>
                {learning && (
                  <div className="rec-note">📚 아직 <b>판단하기 이릅니다</b> — 채점 {sc.scored}건(30건 미만)이라 승패를 단정하지 않고 추이만 보여드립니다.</div>
                )}

                {/* 나 vs AI */}
                <div className="rec-card">
                  <div className="rec-card-h">나 vs AI <span className="rec-sub">채점 {sc.scored}건 평균</span></div>
                  <div className="rec-vs">
                    <div className="rec-vs-c"><span>나</span><b className={sc.myRet > 0 ? "pos" : sc.myRet < 0 ? "neg" : ""}>{pct(sc.myRet)}</b></div>
                    <div className="rec-vs-c"><span>AI(전부 매매)</span><b className={sc.aiRet > 0 ? "pos" : sc.aiRet < 0 ? "neg" : ""}>{pct(sc.aiRet)}</b></div>
                  </div>
                  {pol.declareWinner ? (
                    <p className="rec-verdict">{sc.winner === "tie" ? "AI와 막상막하입니다." : sc.winner === "me" ? `내 판단이 AI보다 ${pct(Math.abs(sc.diff))} 앞섭니다.` : `AI가 ${pct(Math.abs(sc.diff))} 앞섭니다.`}</p>
                  ) : (
                    <p className="rec-verdict quiet">아직 승패를 단정하긴 이릅니다.</p>
                  )}
                </div>

                {/* 승률 · 관망 · 놓친 수익 */}
                <div className="rec-grid">
                  <div className="rec-kpi"><span>승률</span><b>{sc.winRate == null ? "–" : `${sc.winRate}%`}</b><i>산 건 오르고, 관망한 건 내렸으면 정답</i></div>
                  <div className="rec-kpi"><span>관망 비율</span><b>{sc.passRate == null ? "–" : `${sc.passRate}%`}</b><i>{sc.passRate != null ? `10번 중 ${Math.round(sc.passRate / 10)}번 관망` : ""}</i></div>
                  <div className="rec-kpi"><span>놓친 수익</span><b className={sc.missedAvg > 0 ? "neg" : ""}>{sc.missedAvg == null ? "–" : pct(sc.missedAvg)}</b><i>관망한 {sc.missedCount}건이 그 뒤 평균만큼 올랐습니다</i></div>
                  <div className="rec-kpi"><span>판단 성향</span><b>{sc.tendency || "–"}</b><i>관망 비율로 본 내 스타일</i></div>
                </div>

                <p className="rec-foot">채점은 판단 시점 대비 3거래일 뒤 실제 수익 기준입니다. 표본이 쌓일수록 정확해집니다.</p>
              </>
            )}
          </>
        )}
      </main>
      <BottomNav />
      <style jsx>{`
        .rec-wrap { min-height: 100vh; background: var(--color-bg); padding-bottom: 78px; }
        .rec-main { max-width: 560px; margin: 0 auto; padding: 12px 14px 40px; }
        .rec-title { font-size: 1.15rem; font-weight: 800; color: var(--color-ink); margin: 6px 0 4px; }
        .rec-lead { font-size: 0.8rem; color: var(--color-ink-2); line-height: 1.5; margin: 0 0 14px; word-break: keep-all; }
        .rec-card { background: var(--color-card); border: 1px solid var(--color-line); border-radius: 14px; padding: 14px; margin-bottom: 12px; }
        .rec-card-h { font-size: 0.86rem; font-weight: 800; color: var(--color-ink); margin-bottom: 10px; }
        .rec-sub { font-size: 0.7rem; font-weight: 600; color: var(--color-ink-3); margin-left: 6px; }
        .rec-row { display: flex; align-items: center; gap: 8px; font-size: 0.84rem; color: var(--color-ink-2); padding: 4px 0; }
        .rec-row b { color: var(--color-ink); font-variant-numeric: tabular-nums; }
        .rec-quiet { font-size: 0.82rem; color: var(--color-ink-2); line-height: 1.55; margin: 0; }
        .rec-cta { margin-top: 12px; border: 1px solid var(--color-primary); color: var(--color-primary); background: var(--color-card); border-radius: 9px; padding: 9px 14px; font-size: 0.8rem; font-weight: 700; font-family: var(--font-sans); cursor: pointer; }
        .rec-note { background: var(--color-warning-soft, var(--color-card)); border: 1px solid var(--color-line); border-radius: 12px; padding: 11px 13px; font-size: 0.78rem; color: var(--color-ink-2); line-height: 1.5; margin-bottom: 12px; word-break: keep-all; }
        .rec-vs { display: flex; gap: 10px; }
        .rec-vs-c { flex: 1; background: var(--inset-bg, var(--color-card-soft, rgba(0,0,0,0.03))); border-radius: 10px; padding: 12px; text-align: center; }
        .rec-vs-c span { display: block; font-size: 0.72rem; color: var(--color-ink-3); margin-bottom: 4px; }
        .rec-vs-c b { font-size: 1.1rem; font-variant-numeric: tabular-nums; }
        .rec-verdict { font-size: 0.82rem; font-weight: 700; color: var(--color-ink); margin: 10px 0 0; }
        .rec-verdict.quiet { font-weight: 500; color: var(--color-ink-3); }
        .rec-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .rec-kpi { background: var(--color-card); border: 1px solid var(--color-line); border-radius: 12px; padding: 12px; }
        .rec-kpi span { display: block; font-size: 0.72rem; color: var(--color-ink-3); }
        .rec-kpi b { display: block; font-size: 1.15rem; font-weight: 800; color: var(--color-ink); font-variant-numeric: tabular-nums; margin: 2px 0; }
        .rec-kpi i { font-style: normal; font-size: 0.68rem; color: var(--color-ink-3); line-height: 1.4; word-break: keep-all; }
        .rec-foot { font-size: 0.7rem; color: var(--color-ink-3); line-height: 1.5; margin: 12px 2px 0; word-break: keep-all; }
        .pos { color: var(--color-success, #16a34a); }
        .neg { color: var(--color-danger, #dc2626); }
      `}</style>
    </div>
  );
}
