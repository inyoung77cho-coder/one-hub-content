// [ETF Phase4] 영어 ETF·마켓 뉴스/리서치 — 영어학습 엔진의 economy 트랙 뉴스 재사용.
//   BBC Business·CNBC 등 영어 원문 헤드라인 + 한국어 요약(이미 매일 생성됨). 새 수집기·비용 없음.
import { useEffect, useState } from "react";
import { useRouter } from "next/router";

export default function EtfMarketNews({ limit = 6 }) {
  const router = useRouter();
  const [items, setItems] = useState(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let alive = true;
    fetch(`/api/english/lessons?medium=news&track=economy&language=en&limit=${limit}`)
      .then((r) => r.json())
      .then((d) => { if (alive) setItems(Array.isArray(d.items) ? d.items : []); })
      .catch(() => { if (alive) setItems([]); });
    return () => { alive = false; };
  }, [limit]);

  if (items != null && items.length === 0) return null; // 조용히 숨김
  const shown = open ? items : (items || []).slice(0, 3);

  return (
    <section className="emn">
      <div className="emn-h">🌐 영어 ETF·마켓 뉴스 <span className="emn-sub">글로벌 경제 · 영어 원문 + 요약</span></div>
      {items == null ? (
        <div className="emn-load">불러오는 중…</div>
      ) : (
        <>
          <div className="emn-list">
            {shown.map((n) => (
              <div className="emn-row" key={n.id}>
                <div className="emn-top">
                  <span className="emn-en">{n.title_en}</span>
                  {n.lesson_date && <span className="emn-date">{String(n.lesson_date).slice(5, 10)}</span>}
                </div>
                {n.title_ko && <div className="emn-ko">{n.title_ko}</div>}
                {n.summary_ko && <div className="emn-sum">{String(n.summary_ko).split("\n")[0]}</div>}
              </div>
            ))}
          </div>
          {items.length > 3 && (
            <button className="emn-more" onClick={() => setOpen((v) => !v)}>{open ? "접기" : `+${items.length - 3}건 더보기`}</button>
          )}
          <button className="emn-cta" onClick={() => router.push("/pwa/english")}>영어로 자세히 읽기(경제영어) →</button>
          <div className="emn-note">영어학습 엔진이 매일 수집·요약한 글로벌 경제 뉴스입니다(원문 영어 + 한국어 요약). 투자자문 아님.</div>
        </>
      )}
      <style jsx>{`
        .emn { background: var(--color-card); border: 1px solid var(--color-line); border-radius: var(--radius-card, 14px); padding: 16px; margin-bottom: 12px; box-shadow: var(--shadow-card); }
        .emn-h { font-size: 0.9rem; font-weight: 700; color: var(--color-ink); }
        .emn-sub { font-size: 0.66rem; font-weight: 700; color: var(--color-ink-3); margin-left: 6px; }
        .emn-load { font-size: 0.8rem; color: var(--color-ink-3); margin-top: 10px; }
        .emn-list { margin-top: 12px; display: flex; flex-direction: column; gap: 12px; }
        .emn-row { border-left: 3px solid var(--color-primary); padding-left: 10px; }
        .emn-top { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
        .emn-en { font-size: 0.82rem; font-weight: 800; color: var(--color-ink); line-height: 1.4; }
        .emn-date { flex-shrink: 0; font-size: 0.64rem; color: var(--color-ink-3); font-family: ui-monospace, monospace; }
        .emn-ko { font-size: 0.74rem; font-weight: 700; color: var(--color-ink-2); margin-top: 3px; }
        .emn-sum { font-size: 0.72rem; color: var(--color-ink-3); line-height: 1.5; margin-top: 3px; word-break: keep-all; }
        .emn-more { width: 100%; margin-top: 10px; border: 1px solid var(--color-line); background: var(--color-card-soft); color: var(--color-ink-2); border-radius: 9px; padding: 8px; font-size: 0.74rem; font-weight: 700; cursor: pointer; font-family: var(--font-sans); }
        .emn-cta { width: 100%; margin-top: 8px; border: none; background: var(--color-primary-soft); color: var(--color-primary); border-radius: 9px; padding: 9px; font-size: 0.76rem; font-weight: 800; cursor: pointer; font-family: var(--font-sans); }
        .emn-note { margin-top: 10px; font-size: 0.64rem; color: var(--color-ink-3); line-height: 1.5; word-break: keep-all; }
      `}</style>
    </section>
  );
}
