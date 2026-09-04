// [S29-7] 이번 주 회차 카드 — 제목·앱 안 재생(임베드)·3줄 요약·근거 숫자·지난 회차.
//   ★유튜브로 내보내지 않는다: 앱 안에서 재생하고, "유튜브에서 보기"는 작은 보조 링크만.
//   회차가 없으면 이 카드를 렌더하지 않음(빈 카드 금지) — 부모가 '쉬어갑니다'를 대신 보여준다.
export default function EpisodeCard({ ep, past = [], onOpenPast, bare = false }) {
  if (!ep) return null;
  return (
    <section className={`ec${bare ? " ec-bare" : ""}`}>
      <div className="ec-badge">📺 이번 주 회차 · {ep.week || ep.date}</div>
      <h2 className="ec-title">{ep.title}</h2>

      {ep.youtube_id ? (
        <div className="ec-embed">
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${ep.youtube_id}`}
            title={ep.title} loading="lazy" allowFullScreen
            allow="accelerometer; encrypted-media; picture-in-picture"
          />
        </div>
      ) : (
        <div className="ec-embed ec-embed-empty">영상은 준비 중입니다 · 아래 요약과 지난 이야기를 먼저 보세요</div>
      )}

      {Array.isArray(ep.summary) && ep.summary.length > 0 && (
        <ul className="ec-sum">{ep.summary.slice(0, 3).map((s, i) => <li key={i}>{s}</li>)}</ul>
      )}

      {Array.isArray(ep.figures) && ep.figures.length > 0 && (
        <div className="ec-figs">
          {ep.figures.map((f, i) => (
            <div className="ec-fig" key={i}>
              <span className="ec-fig-v">{f.value}</span>
              <span className="ec-fig-l">{f.label}{f.source ? ` · ${f.source}` : ""}</span>
            </div>
          ))}
        </div>
      )}

      <div className="ec-links">
        {ep.youtube_id && <a className="ec-yt" href={`https://youtu.be/${ep.youtube_id}`} target="_blank" rel="noopener noreferrer">유튜브에서 보기 ↗</a>}
        {past.length > 0 && <button type="button" className="ec-past" onClick={onOpenPast}>지난 회차 {past.length}편</button>}
      </div>

      <style jsx>{`
        .ec { background: var(--color-card); border: 1px solid var(--color-line); border-radius: var(--radius-card); box-shadow: var(--shadow-card); padding: 16px; margin-bottom: 12px; }
        .ec-bare { background: none; border: 0; border-radius: 0; box-shadow: none; padding: 0; margin-bottom: 0; }
        .ec-badge { font-size: var(--fs-1); font-weight: 800; color: var(--color-primary); }
        .ec-title { font-size: var(--fs-6); font-weight: 800; color: var(--color-ink); margin: 6px 0 12px; line-height: 1.35; word-break: keep-all; }
        .ec-embed { position: relative; width: 100%; aspect-ratio: 16 / 9; border-radius: var(--radius-md); overflow: hidden; background: var(--color-card-soft); }
        .ec-embed :global(iframe) { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; }
        .ec-embed-empty { display: grid; place-items: center; text-align: center; padding: 16px; font-size: var(--fs-2); color: var(--color-ink-3); word-break: keep-all; aspect-ratio: auto; min-height: 96px; }
        .ec-sum { margin: 12px 0 0; padding-left: 18px; }
        .ec-sum li { font-size: var(--fs-3); color: var(--color-ink-2); line-height: 1.6; word-break: keep-all; }
        .ec-figs { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
        .ec-fig { background: var(--color-card-soft); border-radius: var(--radius-sm); padding: 8px 11px; }
        .ec-fig-v { font-size: var(--fs-4); font-weight: 800; color: var(--color-ink); display: block; }
        .ec-fig-l { font-size: var(--fs-1); color: var(--color-ink-3); }
        .ec-links { display: flex; align-items: center; gap: 12px; margin-top: 14px; }
        .ec-yt { font-size: var(--fs-2); color: var(--color-ink-3); }
        .ec-past { border: 1px solid var(--color-line); background: var(--color-card); color: var(--color-primary); border-radius: var(--radius-sm); padding: 7px 12px; font-size: var(--fs-2); font-weight: 700; font-family: var(--font-sans); cursor: pointer; }
      `}</style>
    </section>
  );
}
