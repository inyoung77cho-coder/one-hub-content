// [OS-2] PWA 첫 화면 — "AI 매도/매수 추천 종목 선택" → 완료 → "AI vs 나 대결" 결과로 즉시 이동.
//   앱의 첫 후킹을 "오늘" 피드가 아니라 판단 행동(주식 종목 지식 확대 게임)에 맞춘다(사용자 지시).
//   manifest.json start_url + pages/pwa/index.js의 무탭 진입 리다이렉트가 이 페이지를 가리킨다.
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/router";
import { getTrader } from "../../lib/trader";
import { recordDecision, getTodayDecision } from "../../lib/verdictLedger";
import { getSeed, SEED_OPTIONS, setSeed } from "../../lib/gameWallet";
import { getKrxSession } from "../../lib/marketHours";

export default function PwaPick() {
  const router = useRouter();
  const [trader, setTrader] = useState("A");
  const [cands, setCands] = useState(null); // null=로딩, []=오늘 후보 없음
  const [decTick, setDecTick] = useState(0);
  const [seed, setSeedState] = useState(null);

  useEffect(() => {
    const tr = getTrader();
    setTrader(tr);
    setSeedState(getSeed());
    fetch(`/api/pwa-dashboard?trader=${tr}`)
      .then((r) => r.json())
      .then((d) => {
        const buys = d?.today_buys || [];
        const screen = d?.screening_candidates || [];
        const pool = buys.length ? buys : screen;
        // [버그수정] 주말·휴장 등 일부 응답엔 code가 비어있는 항목이 섞여있어(예: 캐시된 요약행),
        //   그런 카드가 그려지면 recordDecision(code 없으면 no-op)이 조용히 실패해 클릭이 안 먹는 것처럼 보였다.
        const list = pool
          .filter((s) => s.code || s.symbol)
          .slice(0, 6)
          .map((s) => ({
            code: s.code || s.symbol, name: s.stock || s.name || s.code || s.symbol,
            score: Math.round(s.final_score ?? s.score ?? 0),
            reason: s.reason || (Array.isArray(s.reasons) ? s.reasons[0] : "") || "",
            action: buys.length ? "BUY" : "관심",
          }));
        setCands(list);
      })
      .catch(() => setCands([]));
  }, []);

  const decide = useCallback((code, name, decision) => {
    recordDecision({ code, name, decision, trader });
    setDecTick((t) => t + 1);
  }, [trader]);

  const finish = () => {
    router.push("/pwa?tab=report&sec=vs");
  };

  const decidedCount = (cands || []).filter((c) => getTodayDecision(c.code, trader)).length;

  return (
    <div className="pk">
      <div className="pk-top">
        <div className="pk-mark">ONE<span className="pk-dot">·</span>HUB</div>
        <button className="pk-skip" onClick={finish}>건너뛰기 →</button>
      </div>

      <h1 className="pk-title">오늘의 AI 매수·매도 추천</h1>
      <p className="pk-sub">종목을 고르고 완료를 누르면, 3일 뒤 AI와 판단 대결 결과를 바로 확인할 수 있어요.</p>

      {!seed && (
        <section className="pk-card pk-seedcard">
          <div className="pk-seedh">🎮 먼저 가상 대결 시드머니를 골라주세요</div>
          <div className="pk-seedopts">
            {SEED_OPTIONS.map((o) => (
              <button key={o.v} className="pk-seedopt" onClick={() => { setSeed(o.v); setSeedState(o.v); }}>{o.label}</button>
            ))}
          </div>
        </section>
      )}

      {cands === null ? (
        <div className="pk-loading">오늘의 추천을 불러오는 중…</div>
      ) : cands.length === 0 ? (
        <div className="pk-empty">
          {getKrxSession().phase === "closed" ? `😴 ${getKrxSession().label} — 오늘은 새 AI 추천이 없어요.` : "오늘은 새로 나온 AI 추천이 없어요."}
          <br />바로 대결 결과를 확인해보세요.
        </div>
      ) : (
        <div className="pk-list">
          {cands.map((c) => {
            const dec = (decTick, getTodayDecision(c.code, trader));
            return (
              <div className="pk-card" key={c.code}>
                <div className="pk-row">
                  <div className="pk-name">{c.name} <span className="pk-code mono">{c.code}</span></div>
                  <span className="pk-score">관심도 {c.score}</span>
                </div>
                {c.reason && <div className="pk-reason">{c.reason}</div>}
                <div className="pk-acts">
                  <button className={`pk-b buy ${dec === "take" ? "on" : ""}`} onClick={() => decide(c.code, c.name, "take")}>샀어요</button>
                  <button className={`pk-b pass ${dec === "pass" ? "on" : ""}`} onClick={() => decide(c.code, c.name, "pass")}>관망</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <button className="pk-done" onClick={finish} disabled={!seed}>
        완료 · {decidedCount > 0 ? `${decidedCount}건 판단함 → ` : ""}AI 대결 결과 보기 →
      </button>

      <style jsx>{`
        .pk { max-width: 480px; margin: 0 auto; min-height: 100vh; padding: calc(env(safe-area-inset-top, 0px) + 16px) 16px calc(env(safe-area-inset-bottom, 0px) + 24px); font-family: var(--font-sans); color: var(--color-ink); background: var(--color-bg); }
        .pk-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 18px; }
        .pk-mark { font-weight: 800; font-size: 18px; letter-spacing: -.5px; }
        .pk-dot { color: var(--color-success); }
        .pk-skip { border: none; background: none; color: var(--color-ink-3); font-size: 12.5px; font-weight: 700; cursor: pointer; font-family: var(--font-sans); }
        .pk-title { font-size: 22px; font-weight: 800; letter-spacing: -.5px; margin: 0 0 6px; }
        .pk-sub { font-size: 13px; color: var(--color-ink-2); line-height: 1.55; margin: 0 0 18px; }
        .pk-card { background: var(--color-card); border: 1px solid var(--color-line); border-radius: var(--radius-card, 14px); padding: 16px; margin-bottom: 12px; box-shadow: var(--shadow-card); }
        .pk-seedh { font-size: 13.5px; font-weight: 800; margin-bottom: 10px; }
        .pk-seedopts { display: flex; gap: 8px; }
        .pk-seedopt { flex: 1; border: 1px solid var(--color-line); background: var(--color-card-soft); border-radius: 10px; padding: 10px 0; font-size: 12.5px; font-weight: 700; cursor: pointer; font-family: var(--font-sans); }
        .pk-loading, .pk-empty { text-align: center; color: var(--color-ink-3); font-size: 13px; padding: 40px 0; }
        .pk-list { margin-bottom: 16px; }
        .pk-row { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
        .pk-name { font-size: 14.5px; font-weight: 800; }
        .pk-code { font-size: 11px; color: var(--color-ink-3); margin-left: 4px; }
        .mono { font-family: ui-monospace, monospace; }
        .pk-score { font-size: 11px; font-weight: 700; color: var(--color-ink-3); flex-shrink: 0; }
        .pk-reason { font-size: 12px; color: var(--color-ink-2); margin-top: 6px; line-height: 1.5; }
        .pk-acts { display: flex; gap: 8px; margin-top: 12px; }
        .pk-b { flex: 1; border: 1px solid var(--color-line); background: var(--color-card-soft); color: var(--color-ink-2); font-size: 13px; font-weight: 800; padding: 10px 0; border-radius: 10px; cursor: pointer; font-family: var(--font-sans); }
        .pk-b.buy.on { background: var(--color-success); border-color: var(--color-success); color: #fff; }
        .pk-b.pass.on { background: var(--color-ink-3); border-color: var(--color-ink-3); color: #fff; }
        .pk-done { display: block; width: 100%; border: none; background: var(--color-primary); color: #fff; font-size: 14.5px; font-weight: 800; padding: 15px 0; border-radius: 999px; cursor: pointer; font-family: var(--font-sans); box-shadow: var(--shadow-card); }
        .pk-done:disabled { opacity: .5; cursor: not-allowed; }
      `}</style>
      <style jsx global>{`body { background: var(--color-bg); margin: 0; }`}</style>
    </div>
  );
}
