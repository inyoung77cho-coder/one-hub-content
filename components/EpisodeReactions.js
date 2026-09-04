// [S29-9] 회차 낮은-문턱 반응·투표 — 글을 안 써도 참여가 된다.
//   · 이모지 3종(한 번 누르면 끝, 다시 누르면 해제) · 투표 1개(샀다/관망했다, 1회 확정)
//   · 누른 뒤 결과 즉시(참여의 보상). ★참여 10명 미만이면 백분율 대신 건수("3명 중 2명").
//   저장은 :5002(accounts.db) — GitHub 아님. 실패해도 조용히 죽지 않게 문구를 남긴다.
import { useEffect, useState, useCallback } from "react";

const REACTIONS = [
  { key: "useful", emoji: "👍", label: "도움됐어요" },
  { key: "surprise", emoji: "😮", label: "몰랐어요" },
  { key: "curious", emoji: "🤔", label: "더 알고 싶어요" },
];
const VOTE_MIN = 10; // 이 미만이면 백분율 대신 건수

export default function EpisodeReactions({ episode }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!episode) return;
    try {
      const r = await fetch(`/api/pwa/episode-engage?episode=${encodeURIComponent(episode)}`);
      const d = await r.json();
      if (d && d.ok) { setData(d); setErr(false); } else { setErr(true); }
    } catch { setErr(true); }
  }, [episode]);

  useEffect(() => { load(); }, [load]);

  const send = async (kind, value) => {
    if (busy || !episode) return;
    setBusy(true);
    try {
      const r = await fetch("/api/pwa/episode-engage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ episode, kind, value }),
      });
      const d = await r.json();
      if (d && d.ok) { setData(d); setErr(false); } else { setErr(true); }
    } catch { setErr(true); }
    finally { setBusy(false); }
  };

  const reactions = data?.reactions || {};
  const votes = data?.votes || { buy: 0, hold: 0 };
  const mine = data?.mine || {};
  const voteTotal = data?.vote_total || 0;
  const voted = !!mine.vote;

  // 투표 결과 표기: 10명 미만이면 "N명 중 M명", 이상이면 %
  const voteLine = (opt) => {
    const c = votes[opt] || 0;
    if (voteTotal < VOTE_MIN) return `${c}명`;
    return `${Math.round((c / voteTotal) * 100)}%`;
  };

  return (
    <section className="er">
      <div className="er-react">
        {REACTIONS.map((r) => {
          const on = mine.reaction === r.key;
          const c = reactions[r.key] || 0;
          return (
            <button key={r.key} type="button" className={`er-btn${on ? " on" : ""}`}
              onClick={() => send("reaction", r.key)} disabled={busy} aria-pressed={on}>
              <span className="er-emo">{r.emoji}</span>
              <span className="er-lab">{r.label}</span>
              {c > 0 && <span className="er-cnt">{c}</span>}
            </button>
          );
        })}
      </div>

      <div className="er-vote">
        <div className="er-q">이번 주 AI 판단, 당신이라면?</div>
        <div className="er-opts">
          {[{ k: "buy", t: "샀다" }, { k: "hold", t: "관망했다" }].map((o) => {
            const on = mine.vote === o.k;
            const pct = voteTotal >= VOTE_MIN ? Math.round(((votes[o.k] || 0) / voteTotal) * 100) : 0;
            return (
              <button key={o.k} type="button" className={`er-opt${on ? " on" : ""}`}
                onClick={() => send("vote", o.k)} disabled={busy} aria-pressed={on}>
                {voted && voteTotal >= VOTE_MIN && (
                  <span className="er-bar" style={{ width: `${pct}%` }} aria-hidden="true" />
                )}
                <span className="er-opt-t">{o.t}</span>
                {voted && <span className="er-opt-v">{voteLine(o.k)}</span>}
              </button>
            );
          })}
        </div>
        {voted ? (
          <div className="er-note">
            {voteTotal < VOTE_MIN
              ? `아직 ${voteTotal}명 참여 — 조금 더 모이면 비율로 보여드려요`
              : `${voteTotal}명 참여`}
          </div>
        ) : (
          <div className="er-note er-note-dim">누르면 바로 결과가 보여요 · 익명</div>
        )}
      </div>

      {err && <div className="er-err">반응 저장이 잠시 안 돼요 — 잠시 후 다시 눌러 주세요</div>}

      <style jsx>{`
        .er { margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--color-line); }
        .er-react { display: flex; flex-wrap: wrap; gap: 8px; }
        .er-btn { display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--color-line);
          background: var(--color-card); color: var(--color-ink-2); border-radius: var(--radius-pill);
          padding: 7px 12px; font-size: var(--fs-2); font-family: var(--font-sans); cursor: pointer;
          transition: background .12s, border-color .12s; }
        .er-btn.on { background: var(--color-primary-soft); border-color: var(--color-primary); color: var(--color-primary); font-weight: 700; }
        .er-btn:disabled { opacity: .6; }
        .er-emo { font-size: var(--fs-3); }
        .er-cnt { font-weight: 800; font-size: var(--fs-1); }
        .er-vote { margin-top: 14px; }
        .er-q { font-size: var(--fs-3); font-weight: 700; color: var(--color-ink); margin-bottom: 8px; word-break: keep-all; }
        .er-opts { display: flex; gap: 8px; }
        .er-opt { position: relative; flex: 1; overflow: hidden; display: flex; align-items: center; justify-content: space-between;
          border: 1px solid var(--color-line); background: var(--color-card); color: var(--color-ink);
          border-radius: var(--radius-md); padding: 12px 14px; font-family: var(--font-sans); font-size: var(--fs-3);
          cursor: pointer; }
        .er-opt.on { border-color: var(--color-primary); font-weight: 800; }
        .er-opt:disabled { cursor: default; }
        .er-bar { position: absolute; left: 0; top: 0; bottom: 0; background: var(--color-primary-soft); z-index: 0; }
        .er-opt-t, .er-opt-v { position: relative; z-index: 1; }
        .er-opt-v { font-weight: 800; color: var(--color-primary); }
        .er-note { margin-top: 8px; font-size: var(--fs-1); color: var(--color-ink-3); }
        .er-note-dim { color: var(--color-ink-3); }
        .er-err { margin-top: 8px; font-size: var(--fs-1); color: var(--color-danger, #c0392b); }
      `}</style>
    </section>
  );
}
