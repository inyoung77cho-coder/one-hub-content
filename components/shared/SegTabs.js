// [S26-5] 공용 세그먼트 탭 — 18종 탭 구현체의 정본. S23 T-3의 today `td-seg` 를 추출.
//   계약은 useSwipeTabs(S24-5)와 동일: index(현재) / onChange(i). 둘이 짝이다.
//   배지: 값이 0/빈값이면 렌더하지 않는다(S23 T-3 규칙). 값은 페이지가 첫 화면에서 넘겨야 한다.
//   2·3·4칸 모두 같은 높이·같은 글자 크기(flex 1 1 0).
export default function SegTabs({ items = [], index = 0, onChange, className = "", ariaLabel }) {
  return (
    <div className={`seg-tabs${className ? " " + className : ""}`} role="tablist" aria-label={ariaLabel}>
      {items.map((it, i) => (
        <button
          key={it.key != null ? it.key : i}
          type="button"
          role="tab"
          aria-selected={i === index}
          className={`seg-tabs-b${i === index ? " on" : ""}`}
          onClick={() => onChange && onChange(i)}
        >
          <span className="seg-tabs-label">{it.label}</span>
          {it.badge ? <span className="seg-tabs-badge">{it.badge}</span> : null}
        </button>
      ))}
      <style jsx>{`
        .seg-tabs { display: flex; gap: 4px; width: 100%; background: var(--inset-bg, var(--color-card-soft, rgba(0,0,0,0.04))); border: 1px solid var(--color-line); border-radius: var(--radius-md); padding: 3px; }
        .seg-tabs-b { flex: 1 1 0; min-height: 38px; display: inline-flex; align-items: center; justify-content: center; gap: 5px; border: none; background: transparent; color: var(--color-ink-2); border-radius: 9px; padding: 8px 4px; font-size: var(--fs-3); font-weight: 700; font-family: var(--font-sans); cursor: pointer; }
        .seg-tabs-b.on { background: var(--color-card); color: var(--color-ink); box-shadow: var(--shadow-card); }
        .seg-tabs-label { white-space: nowrap; }
        .seg-tabs-badge { min-width: 18px; height: 18px; padding: 0 5px; display: inline-flex; align-items: center; justify-content: center; font-size: var(--fs-1); font-weight: 800; color: var(--color-on-primary); background: var(--color-primary); border-radius: 999px; }
      `}</style>
    </div>
  );
}
