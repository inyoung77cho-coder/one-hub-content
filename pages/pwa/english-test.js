// [S24-12] 외국어 테스트 — 그날 들은 기사(오늘 학습)에서 출제. 일반 어휘 시험이 아니라
//   '오늘 들은 내용의 이해도 확인'(목적: 외국어로 직접 이해). 1차는 규칙 기반(뜻→표현 4지선다).
//   응시 비용 10토큰. 결과는 성적표(/pwa/record)에 외국어 항목으로 쌓인다.
//   한계: 규칙 기반이라 문항이 오늘 학습의 표현·단어 수에 의존한다(부족하면 출제 불가). LLM 미사용.
import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import AppHeader from "../../components/AppHeader";
import BottomNav from "../../components/BottomNav";
import { getTrader } from "../../lib/trader";
import { getTokens, spend, TOKEN_DISCLAIMER } from "../../lib/activityToken";

const COST = 10;
function shuffle(a) { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; }

export default function EnglishTest() {
  const router = useRouter();
  const [pool, setPool] = useState(null);
  const [started, setStarted] = useState(false);
  const [qs, setQs] = useState([]);
  const [ans, setAns] = useState({});
  const [done, setDone] = useState(false);
  const [score, setScore] = useState(0);
  const [bal, setBal] = useState(0);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    try { setBal(getTokens(getTrader())); } catch (e) {}
    Promise.all(["en", "zh", "gen"].map((l) => fetch(`/api/english/today?medium=news&language=${l === "gen" ? "en" : l}`).then((r) => r.json()).catch(() => null)))
      .then((res) => {
        const pairs = [];
        res.forEach((d) => (d?.items || []).forEach((les) => {
          (les.expressions || []).forEach((e) => { if (e && e.expr && e.meaning_ko) pairs.push({ term: e.expr, meaning: e.meaning_ko }); });
          (les.words || []).forEach((w) => { if (w && w.word && w.meaning_ko) pairs.push({ term: w.word, meaning: w.meaning_ko }); });
        }));
        // 중복 term 제거
        const seen = {}; const uniq = pairs.filter((p) => (seen[p.term] ? false : (seen[p.term] = true)));
        setPool(uniq);
      })
      .catch(() => setPool([]));
  }, []);

  const start = () => {
    setMsg("");
    if (!pool || pool.length < 4) { setMsg("오늘 들은 학습이 부족해 출제할 수 없어요 — 현장경제에서 오늘 학습을 먼저 들어보세요."); return; }
    const r = spend(COST, getTrader());
    if (!r.ok) { setMsg(`토큰이 부족합니다 (필요 ${COST}, 보유 ${r.balance}). 판단 기록·청취로 모을 수 있어요.`); return; }
    setBal(r.balance);
    const picks = shuffle(pool).slice(0, Math.min(5, pool.length));
    const built = picks.map((p) => {
      const others = shuffle(pool.filter((x) => x.term !== p.term)).slice(0, 3).map((x) => x.term);
      return { q: p.meaning, correct: p.term, choices: shuffle([p.term, ...others]) };
    });
    setQs(built); setAns({}); setDone(false); setStarted(true);
  };

  const submit = () => {
    let s = 0; qs.forEach((q, i) => { if (ans[i] === q.correct) s++; });
    setScore(s); setDone(true);
    try { const key = `onehub_lang_tests_${getTrader()}`; const arr = JSON.parse(localStorage.getItem(key) || "[]"); arr.push({ date: new Date().toISOString().slice(0, 10), score: s, total: qs.length }); localStorage.setItem(key, JSON.stringify(arr.slice(-50))); } catch (e) {}
  };

  return (
    <div className="et-wrap">
      <AppHeader />
      <main className="et-main">
        <h1 className="et-title">📝 오늘 들은 내용 테스트</h1>
        <p className="et-lead">오늘 학습한 표현·단어의 <b>뜻</b>을 보고 맞는 외국어를 고릅니다. 비용 {COST}토큰 · 결과는 성적표에 쌓입니다. <span className="et-disc">{TOKEN_DISCLAIMER}</span></p>

        {!started ? (
          <div className="et-card">
            <div className="et-bal">🪙 보유 {bal}토큰</div>
            {pool == null ? <p className="et-q">오늘 학습을 불러오는 중…</p> : <p className="et-q">오늘 학습에서 <b>{pool.length}개</b> 표현·단어를 찾았습니다.</p>}
            {msg && <p className="et-msg">{msg}</p>}
            <button className="et-b p" onClick={start} disabled={!pool}>응시하기 ({COST}토큰)</button>
          </div>
        ) : done ? (
          <div className="et-card">
            <div className="et-result">{qs.length}문제 중 <b>{score}개</b> 정답</div>
            <div className="et-review">
              {qs.map((q, i) => (
                <div key={i} className={`et-rv ${ans[i] === q.correct ? "ok" : "no"}`}>
                  <span className="et-rv-q">{q.q}</span>
                  <span className="et-rv-a">{ans[i] === q.correct ? "✓" : `✗ 정답: ${q.correct}`}</span>
                </div>
              ))}
            </div>
            <div className="et-cta">
              <button className="et-b" onClick={() => { setStarted(false); setDone(false); }}>다시</button>
              <button className="et-b p" onClick={() => router.push("/pwa/record")}>성적표 보기 →</button>
            </div>
          </div>
        ) : (
          <div className="et-card">
            {qs.map((q, i) => (
              <div key={i} className="et-item">
                <div className="et-item-q"><b>{i + 1}.</b> “{q.q}”에 맞는 표현은?</div>
                <div className="et-choices">
                  {q.choices.map((c) => (
                    <button key={c} type="button" className={`et-choice ${ans[i] === c ? "on" : ""}`} onClick={() => setAns((m) => ({ ...m, [i]: c }))}>{c}</button>
                  ))}
                </div>
              </div>
            ))}
            <button className="et-b p" onClick={submit} disabled={Object.keys(ans).length < qs.length}>제출</button>
          </div>
        )}
      </main>
      <BottomNav />
      <style jsx>{`
        .et-wrap { min-height: 100vh; background: var(--color-bg); padding-bottom: var(--nav-clearance-fab); }
        .et-main { max-width: 560px; margin: 0 auto; padding: 12px 14px 40px; }
        .et-title { font-size: 1.1rem; font-weight: 800; color: var(--color-ink); margin: 6px 0 4px; }
        .et-lead { font-size: 0.8rem; color: var(--color-ink-2); line-height: 1.5; margin: 0 0 14px; word-break: keep-all; }
        .et-disc { color: var(--color-ink-3); font-size: 0.7rem; }
        .et-card { background: var(--color-card); border: 1px solid var(--color-line); border-radius: 14px; padding: 16px; }
        .et-bal { font-size: 0.82rem; font-weight: 700; color: var(--color-ink-2); margin-bottom: 8px; }
        .et-q { font-size: 0.84rem; color: var(--color-ink-2); }
        .et-msg { font-size: 0.8rem; color: var(--color-danger, #dc2626); margin: 8px 0; }
        .et-b { border: 1px solid var(--color-line); background: var(--color-card); color: var(--color-ink-2); border-radius: 10px; padding: 11px 16px; font-size: 0.84rem; font-weight: 700; font-family: var(--font-sans); cursor: pointer; margin-top: 12px; }
        .et-b.p { border-color: var(--color-primary); background: var(--color-primary); color: var(--color-on-primary); }
        .et-b:disabled { opacity: 0.5; cursor: default; }
        .et-item { margin-bottom: 16px; }
        .et-item-q { font-size: 0.86rem; color: var(--color-ink); margin-bottom: 8px; }
        .et-choices { display: flex; flex-direction: column; gap: 6px; }
        .et-choice { text-align: left; border: 1px solid var(--color-line); background: var(--color-card); color: var(--color-ink-2); border-radius: 9px; padding: 10px 12px; font-size: 0.82rem; font-family: var(--font-sans); cursor: pointer; }
        .et-choice.on { border-color: var(--color-primary); background: var(--color-primary-soft); color: var(--color-primary); font-weight: 700; }
        .et-result { font-size: 1rem; font-weight: 800; color: var(--color-ink); margin-bottom: 12px; }
        .et-rv { display: flex; justify-content: space-between; gap: 8px; font-size: 0.78rem; padding: 6px 0; border-bottom: 1px solid var(--color-line); }
        .et-rv-q { color: var(--color-ink-2); }
        .et-rv.ok .et-rv-a { color: var(--color-success, #16a34a); font-weight: 700; }
        .et-rv.no .et-rv-a { color: var(--color-danger, #dc2626); font-weight: 700; }
        .et-cta { display: flex; gap: 8px; }
      `}</style>
    </div>
  );
}
