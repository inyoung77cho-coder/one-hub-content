// [S25-2/3] AI 심판석 판정 카드 — 나와 AI를 '같은 자'로 재서 나란히. 숫자는 getVerdictScorecard 하나에서만.
//   주간 기본(지난주 완료분) + 누적 토글. 주중엔 승패를 매일 갱신하지 않는다(진행 중만). 30건 미만은 승패 단정 금지.
import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { getTrader } from "../lib/trader";
import { getVerdictScorecard } from "../lib/verdictStats";
import { samplePolicy } from "../lib/sampleSize";

const DAY = 86400000;
function weekBounds() {
  const kst = new Date(Date.now() + 9 * 3600000);
  const day = (kst.getUTCDay() + 6) % 7; // 0=월
  const thisMon = Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate()) - day * DAY - 9 * 3600000;
  return { thisMon, lastMon: thisMon - 7 * DAY, isMonday: day === 0 };
}
function isoWeekLabel(ts) {
  const d = new Date(ts + 9 * 3600000);
  const day = (d.getUTCDay() + 6) % 7;
  const th = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day + 3));
  const firstTh = new Date(Date.UTC(th.getUTCFullYear(), 0, 4));
  const wk = 1 + Math.round(((th - firstTh) / DAY - 3 + ((firstTh.getUTCDay() + 6) % 7)) / 7);
  const mon = new Date(ts + 9 * 3600000); mon.setUTCDate(mon.getUTCDate() - day);
  const sun = new Date(mon.getTime() + 6 * DAY);
  const f = (x) => `${x.getUTCMonth() + 1}/${x.getUTCDate()}`;
  return `${th.getUTCFullYear()}년 ${wk}주차 (${f(mon)}~${f(sun)})`;
}
const pctTxt = (v) => (v == null ? "–" : `${v > 0 ? "+" : ""}${v}%`);

export default function AiJudgeCard() {
  const router = useRouter();
  const [mode, setMode] = useState("week"); // week | cum
  // [S38 ST-01] 판단 저장·matureLedger 갱신(onehub-game-change) 시 성적표를 즉시 다시 읽는다.
  //   부모 시드가 같아 재렌더가 보장되지 않는 경우에도, 이 카드가 직접 이벤트를 듣고 재계산한다.
  //   getVerdictScorecard 는 매 렌더 localStorage 를 다시 읽으므로 tick 증가만으로 최신값이 반영된다.
  const [, bumpTick] = useState(0);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const h = () => bumpTick((t) => t + 1);
    window.addEventListener("onehub-game-change", h);
    return () => window.removeEventListener("onehub-game-change", h);
  }, []);
  const tr = (() => { try { return getTrader(); } catch (e) { return "A"; } })();
  const { thisMon, lastMon, isMonday } = weekBounds();

  const week = (() => { try { return getVerdictScorecard(tr, { sinceTs: lastMon, untilTs: thisMon }); } catch (e) { return null; } })();
  const prev = (() => { try { return getVerdictScorecard(tr, { sinceTs: lastMon - 7 * DAY, untilTs: lastMon }); } catch (e) { return null; } })();
  const thisWk = (() => { try { return getVerdictScorecard(tr, { sinceTs: thisMon }); } catch (e) { return null; } })();
  const cum = (() => { try { return getVerdictScorecard(tr); } catch (e) { return null; } })();

  const sc = mode === "cum" ? cum : week;
  const pol = sc ? samplePolicy(sc.scored) : null;
  const periodLabel = mode === "cum" ? "누적" : `지난주 ${isoWeekLabel(lastMon)}`;

  const verdictLine = (() => {
    if (!sc || !pol) return null;
    if (!pol.declareWinner) return `아직 판단하기 이릅니다 · 채점 ${sc.scored}건 / 30건`;
    if (sc.winner === "tie") return "나와 AI가 막상막하였습니다.";
    if (sc.winner === "me") return `${mode === "cum" ? "누적" : "지난주"}는 당신이 나았습니다${sc.missedCount ? ` · 관망 ${sc.missedCount}건 중 오른 게 있었지만 전체로는 앞섰습니다` : ""}.`;
    return `${mode === "cum" ? "누적" : "지난주"}는 AI가 나았습니다${sc.missedCount ? ` · 당신이 관망한 ${sc.missedCount}종목이 평균 ${pctTxt(sc.missedAvg)} 올랐습니다` : ""}.`;
  })();

  const deltaLine = (() => {
    if (mode !== "week" || !week || !prev || week.winRate == null || prev.winRate == null || prev.total === 0) return null;
    return `지난주 승률 ${week.winRate}% (직전 주 ${prev.winRate}%)`;
  })();

  return (
    <section className="ajc">
      <div className="ajc-h">⚖️ AI 심판석 <span className="ajc-wk">{periodLabel}</span>
        <div className="ajc-toggle">
          <button className={mode === "week" ? "on" : ""} onClick={() => setMode("week")}>주간</button>
          <button className={mode === "cum" ? "on" : ""} onClick={() => setMode("cum")}>누적</button>
        </div>
      </div>

      {/* [S25-3] 주중엔 승패를 매일 갱신하지 않는다 — 진행 중만. 판정 표는 완료된 지난주 기준(안정). */}
      {mode === "week" && !isMonday && thisWk && thisWk.total > 0 && (
        <div className="ajc-prog">이번 주 진행 중 · 판단 {thisWk.total}건 · 월요일에 채점됩니다</div>
      )}

      {!sc || sc.total === 0 ? (
        <p className="ajc-q">{mode === "cum" ? "아직 남긴 판단이 없습니다." : "지난주엔 남긴 판단이 없습니다."} 오늘 화면에서 매도/보유/관망을 누르면 여기서 나와 AI를 나란히 채점합니다.</p>
      ) : (
        <>
          <table className="ajc-tbl">
            <thead><tr><th></th><th>나</th><th>AI <span className="ajc-asm">전체 추천<br />매수 가정</span></th></tr></thead>
            <tbody>
              <tr><td>판단 건수</td><td>{sc.total}건</td><td>{sc.total}건</td></tr>
              <tr><td>승률</td><td>{sc.winRate == null ? "–" : `${sc.winRate}%`}</td><td>{sc.aiWinRate == null ? "–" : `${sc.aiWinRate}%`}</td></tr>
              <tr><td>평균 수익</td><td className={sc.myRet >= 0 ? "pos" : "neg"}>{pctTxt(sc.myRet)}</td><td className={sc.aiRet >= 0 ? "pos" : "neg"}>{pctTxt(sc.aiRet)}</td></tr>
              <tr><td>관망 비율</td><td>{sc.passRate == null ? "–" : `${sc.passRate}%`}</td><td>0%</td></tr>
            </tbody>
          </table>
          {verdictLine && <p className={`ajc-verdict ${pol.declareWinner ? "" : "quiet"}`}>{verdictLine}</p>}
          {deltaLine && <p className="ajc-delta">{deltaLine}</p>}
          {/* [S38 DA-2] 성적표의 'AI' 는 엔진의 실제 체결 성과가 아니라 '추천을 전부 샀다고 가정'한 값이다.
              계산식(verdictStats)은 그대로 두고, 그 가정을 화면에 드러내 오인을 막는다. */}
          <p className="ajc-foot">AI 수익은 엔진이 추천한 종목을 모두 샀다고 가정한 수익률입니다.</p>
          {/* [S38 DB / ST-01] 저장→채점 체인을 드러낸다. 채점 대기/불가를 조용히 비워두지 않는다. */}
          {(sc.recPending > 0 || sc.recUngradable > 0) && (
            <p className="ajc-scoring">
              {sc.recPending > 0 && <span>채점 대기 {sc.recPending}건</span>}
              {sc.recPending > 0 && sc.recUngradable > 0 && <span> · </span>}
              {sc.recUngradable > 0 && <span className="ajc-ung">채점 불가 {sc.recUngradable}건</span>}
              <span className="ajc-scoring-note">
                {sc.recUngradable > 0
                  ? "‘채점 불가’는 결과 확인 시점(판단 3거래일 뒤)의 가격을 정확히 확보하지 못한 판단입니다. 지난 가격을 현재가로 추정하지 않습니다."
                  : "판단한 종목은 3거래일 뒤 접속할 때 그 무렵 가격으로 채점됩니다."}
              </span>
            </p>
          )}
        </>
      )}
      <button className="ajc-more" onClick={() => router.push("/pwa/record")}>내 판단 성적표 자세히 →</button>

      <style jsx>{`
        .ajc { background: var(--color-card); border: 1.5px solid var(--color-primary); border-radius: 14px; padding: 15px; margin-bottom: 14px; box-shadow: 0 10px 28px rgba(10,22,44,0.12); }
        .ajc-h { display: flex; align-items: center; gap: 8px; font-size: 0.9rem; font-weight: 800; color: var(--color-ink); margin-bottom: 12px; flex-wrap: wrap; }
        .ajc-wk { font-size: 0.7rem; font-weight: 600; color: var(--color-ink-3); }
        .ajc-toggle { margin-left: auto; display: flex; gap: 2px; background: var(--inset-bg, rgba(0,0,0,0.04)); border-radius: 8px; padding: 2px; }
        .ajc-toggle button { border: none; background: transparent; color: var(--color-ink-3); border-radius: 6px; padding: 4px 10px; font-size: 0.72rem; font-weight: 700; font-family: var(--font-sans); cursor: pointer; }
        .ajc-toggle button.on { background: var(--color-card); color: var(--color-ink); }
        .ajc-prog { font-size: 0.78rem; color: var(--color-ink-2); background: var(--inset-bg, rgba(0,0,0,0.04)); border-radius: 9px; padding: 9px 11px; margin-bottom: 10px; }
        .ajc-q { font-size: 0.82rem; color: var(--color-ink-2); line-height: 1.55; margin: 0 0 8px; word-break: keep-all; }
        .ajc-tbl { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
        .ajc-tbl th, .ajc-tbl td { padding: 7px 4px; text-align: center; border-bottom: 1px solid var(--color-line); font-variant-numeric: tabular-nums; }
        .ajc-tbl th:first-child, .ajc-tbl td:first-child { text-align: left; color: var(--color-ink-2); font-weight: 600; }
        .ajc-tbl thead th { color: var(--color-ink-3); font-weight: 700; font-size: 0.74rem; }
        .ajc-asm { display: block; font-size: 0.6rem; font-weight: 600; color: var(--color-ink-3); line-height: 1.2; margin-top: 2px; }
        .ajc-foot { font-size: 0.68rem; color: var(--color-ink-3); margin: 8px 0 0; line-height: 1.5; word-break: keep-all; }
        .ajc-scoring { font-size: 0.74rem; font-weight: 700; color: var(--color-ink-2); margin: 8px 0 0; word-break: keep-all; }
        .ajc-scoring .ajc-ung { color: var(--color-warning-ink, var(--color-warning)); }
        .ajc-scoring-note { display: block; font-size: 0.68rem; font-weight: 500; color: var(--color-ink-3); margin-top: 3px; line-height: 1.5; }
        .ajc-tbl .pos { color: var(--color-success, #16a34a); }
        .ajc-tbl .neg { color: var(--color-danger, #dc2626); }
        .ajc-verdict { font-size: 0.84rem; font-weight: 700; color: var(--color-ink); margin: 10px 0 0; word-break: keep-all; }
        .ajc-verdict.quiet { font-weight: 500; color: var(--color-ink-3); }
        .ajc-delta { font-size: 0.74rem; color: var(--color-ink-3); margin: 4px 0 0; }
        .ajc-more { width: 100%; margin-top: 12px; border: 1px solid var(--color-line); background: var(--color-card); color: var(--color-primary); border-radius: 9px; padding: 9px; font-size: 0.8rem; font-weight: 700; font-family: var(--font-sans); cursor: pointer; }
      `}</style>
    </section>
  );
}
