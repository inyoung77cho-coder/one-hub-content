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
import { getTokens, TOKEN_DISCLAIMER } from "../../lib/activityToken"; // [S24-12] 외국어 항목·토큰

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
  // [S24-12] 외국어 테스트 항목 + 활동 토큰(성적표·현장경제에만 표시).
  const [langTests, setLangTests] = useState([]);
  const [tokens, setTokens] = useState(0);
  useEffect(() => {
    const readTok = () => {
      try { setTokens(getTokens(getTrader())); } catch (e) {}
      try { setLangTests(JSON.parse(localStorage.getItem(`onehub_lang_tests_${getTrader()}`) || "[]") || []); } catch (e) {}
    };
    readTok();
    window.addEventListener("onehub-tokens-change", readTok);
    window.addEventListener("onehub-trader-change", readTok);
    return () => { window.removeEventListener("onehub-tokens-change", readTok); window.removeEventListener("onehub-trader-change", readTok); };
  }, []);

  return (
    <div className="rec-wrap">
      <AppHeader />
      <main className="rec-main">
        <h1 className="rec-title">🧾 내 판단 성적표</h1>
        <p className="rec-lead">AI 제안에 대한 내 응답을 <b>나 자신 기준</b>으로 채점합니다. 다른 사람과 비교하지 않습니다.</p>

        {!ready ? (
          <div className="rec-card"><p className="rec-quiet">불러오는 중…</p></div>
        ) : !sc || sc.total === 0 ? (
          /* [S24-8] 0건이어도 빈 화면 대신 '무엇이 보이게 될지'를 예시로. 실제인 척하지 않는다. */
          <>
            <div className="rec-card">
              <p className="rec-quiet">아직 남긴 판단이 없습니다. 오늘 화면·추천·대결 카드에서 <b>매도/보유/관망</b>을 누르면 3거래일 뒤부터 채점됩니다.</p>
              <button className="rec-cta" onClick={() => router.push("/pwa/today")}>오늘 화면에서 판단 남기기 →</button>
            </div>
            <div className="rec-ex-badge">아래는 <b>예시</b>입니다 · 실제 데이터가 아닙니다</div>
            <div className="rec-card rec-ex">
              <div className="rec-card-h">나 vs AI <span className="rec-sub">채점된 판단 평균</span></div>
              <div className="rec-vs">
                <div className="rec-vs-c"><span>나</span><b className="pos">+3.4%</b></div>
                <div className="rec-vs-c"><span>AI(전부 매매)</span><b className="pos">+1.1%</b></div>
              </div>
              <p className="rec-verdict">내 판단이 AI보다 +2.3% 앞섭니다.</p>
            </div>
            <div className="rec-grid rec-ex">
              <div className="rec-kpi"><span>승률</span><b>58%</b><i>산 건 오르고, 관망한 건 내렸으면 정답</i></div>
              <div className="rec-kpi"><span>관망 비율</span><b>70%</b><i>10번 중 7번 관망</i></div>
              <div className="rec-kpi"><span>놓친 수익</span><b className="neg">+2.1%</b><i>관망한 3건이 그 뒤 올랐습니다</i></div>
              <div className="rec-kpi"><span>판단 성향</span><b>신중형</b><i>관망 비율로 본 스타일</i></div>
            </div>
            <p className="rec-foot">판단을 남기면 위 화면이 <b>내 실제 숫자</b>로 채워집니다.</p>
          </>
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

        {/* [S24-12] 외국어 항목 + 활동 토큰 — 성적표(와 현장경제)에만. 잔액을 홈 상단에 띄우지 않음. */}
        <section className="rec-card">
          <div className="rec-card-h">🌏 외국어 · 활동 토큰</div>
          <div className="rec-row"><span>활동 토큰</span><b>{tokens}</b><span className="rec-sub">{TOKEN_DISCLAIMER}</span></div>
          {langTests.length > 0 ? (
            <>
              <div className="rec-row"><span>외국어 테스트</span><b>{langTests.length}회</b></div>
              {langTests.slice(-3).reverse().map((t, i) => (
                <div className="rec-row" key={i}><span>{t.date}</span><b>{t.score}/{t.total} 정답</b></div>
              ))}
            </>
          ) : (
            <p className="rec-quiet">아직 외국어 테스트 기록이 없습니다. 현장경제에서 오늘 들은 내용을 테스트해 보세요.</p>
          )}
          <button className="rec-cta" onClick={() => router.push("/pwa/english-test")}>오늘 들은 내용 테스트 →</button>
        </section>
      </main>
      <BottomNav />
      <style jsx>{`
        .rec-wrap { min-height: 100vh; background: var(--color-bg); padding-bottom: var(--nav-clearance-fab); }
        .rec-main { max-width: 560px; margin: 0 auto; padding: 12px 14px 40px; }
        .rec-title { font-size: var(--fs-6); font-weight: 800; color: var(--color-ink); margin: 6px 0 4px; }
        .rec-lead { font-size: var(--fs-3); color: var(--color-ink-2); line-height: 1.5; margin: 0 0 14px; word-break: keep-all; }
        .rec-card { background: var(--color-card); border: 1px solid var(--color-line); border-radius: var(--radius-md); padding: 14px; margin-bottom: 12px; }
        .rec-card-h { font-size: var(--fs-4); font-weight: 800; color: var(--color-ink); margin-bottom: 10px; }
        .rec-sub { font-size: var(--fs-1); font-weight: 600; color: var(--color-ink-3); margin-left: 6px; }
        .rec-row { display: flex; align-items: center; gap: 8px; font-size: var(--fs-3); color: var(--color-ink-2); padding: 4px 0; }
        .rec-row b { color: var(--color-ink); font-variant-numeric: tabular-nums; }
        .rec-quiet { font-size: var(--fs-3); color: var(--color-ink-2); line-height: 1.55; margin: 0; }
        .rec-cta { margin-top: 12px; border: 1px solid var(--color-primary); color: var(--color-primary); background: var(--color-card); border-radius: var(--radius-sm); padding: 9px 14px; font-size: var(--fs-3); font-weight: 700; font-family: var(--font-sans); cursor: pointer; }
        .rec-note { background: var(--color-warning-soft, var(--color-card)); border: 1px solid var(--color-line); border-radius: var(--radius-md); padding: 11px 13px; font-size: var(--fs-2); color: var(--color-ink-2); line-height: 1.5; margin-bottom: 12px; word-break: keep-all; }
        .rec-vs { display: flex; gap: 10px; }
        .rec-vs-c { flex: 1; background: var(--inset-bg, var(--color-card-soft, rgba(0,0,0,0.03))); border-radius: var(--radius-sm); padding: 12px; text-align: center; }
        .rec-vs-c span { display: block; font-size: var(--fs-2); color: var(--color-ink-3); margin-bottom: 4px; }
        .rec-vs-c b { font-size: var(--fs-6); font-variant-numeric: tabular-nums; }
        .rec-verdict { font-size: var(--fs-3); font-weight: 700; color: var(--color-ink); margin: 10px 0 0; }
        .rec-verdict.quiet { font-weight: 500; color: var(--color-ink-3); }
        .rec-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .rec-kpi { background: var(--color-card); border: 1px solid var(--color-line); border-radius: var(--radius-md); padding: 12px; }
        .rec-kpi span { display: block; font-size: var(--fs-2); color: var(--color-ink-3); }
        .rec-kpi b { display: block; font-size: var(--fs-6); font-weight: 800; color: var(--color-ink); font-variant-numeric: tabular-nums; margin: 2px 0; }
        .rec-kpi i { font-style: normal; font-size: var(--fs-1); color: var(--color-ink-3); line-height: 1.4; word-break: keep-all; }
        .rec-foot { font-size: var(--fs-1); color: var(--color-ink-3); line-height: 1.5; margin: 12px 2px 0; word-break: keep-all; }
        .rec-ex-badge { font-size: var(--fs-2); font-weight: 700; color: var(--color-ink-2); background: var(--color-warning-soft, var(--inset-bg, rgba(0,0,0,0.04))); border-radius: var(--radius-sm); padding: 7px 11px; margin: 4px 0 10px; text-align: center; }
        .rec-ex { border-style: dashed; opacity: 0.9; }
        .pos { color: var(--color-success, #16a34a); }
        .neg { color: var(--color-danger, #dc2626); }
      `}</style>
    </div>
  );
}
