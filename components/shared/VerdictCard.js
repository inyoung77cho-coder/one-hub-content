// [S1.5] 공용 VerdictCard — 한 줄 결론 + 근거(아코디언 인라인) + 범위 배지.
//   원칙4: 근거는 별도 버튼/페이지가 아니라 카드 안에서 펼친다.
//   props만으로 재사용(하드코딩 데이터 없음). 색은 디자인 토큰만.
import { useState } from "react";

export default function VerdictCard({ headline, reasonShort, reasonFull, scope = [], tone = "primary" }) {
  const [open, setOpen] = useState(false);
  return (
    <section className={`vc vc-${tone}`}>
      {scope.length > 0 && (
        <div className="vc-scope">
          {scope.map((s, i) => <span className="vc-badge" key={i}>{s}</span>)}
        </div>
      )}
      {headline && <h2 className="vc-headline">{headline}</h2>}
      {reasonShort && <p className="vc-short">{reasonShort}</p>}
      {reasonFull && (
        <>
          <button className="vc-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            <span>왜 이렇게 판단했나?</span>
            <span className={`vc-caret ${open ? "open" : ""}`}>▾</span>
          </button>
          {open && <div className="vc-full">{reasonFull}</div>}
        </>
      )}
      <style jsx>{`
        .vc { background: var(--color-card); border: 1px solid var(--color-line); border-left: 4px solid var(--color-primary); border-radius: var(--radius-card); box-shadow: var(--shadow-card); padding: 16px 17px; }
        .vc-success { border-left-color: var(--color-success); }
        .vc-danger { border-left-color: var(--color-danger); }
        .vc-warning { border-left-color: var(--color-warning); }
        .vc-scope { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
        .vc-badge { font-size: 0.66rem; font-weight: 700; color: var(--color-primary); background: var(--color-primary-soft); border-radius: 999px; padding: 3px 9px; }
        .vc-headline { font-size: 1.02rem; font-weight: 800; color: var(--color-ink); line-height: 1.4; margin: 0; word-break: keep-all; }
        .vc-short { font-size: 0.82rem; color: var(--color-ink-2); line-height: 1.5; margin: 8px 0 0; word-break: keep-all; }
        .vc-toggle { display: flex; align-items: center; justify-content: space-between; width: 100%; margin-top: 12px; background: var(--color-card-soft); border: none; border-radius: 10px; padding: 10px 12px; font-family: var(--font-sans); font-size: 0.8rem; font-weight: 700; color: var(--color-ink-2); cursor: pointer; }
        .vc-caret { transition: transform .2s; } .vc-caret.open { transform: rotate(180deg); }
        .vc-full { margin-top: 10px; font-size: 0.82rem; color: var(--color-ink-2); line-height: 1.6; word-break: keep-all; }
      `}</style>
    </section>
  );
}
