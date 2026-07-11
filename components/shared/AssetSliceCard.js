// [S1.5] 공용 AssetSliceCard — 자기 자산군만 표시(금액·비중·당일변동).
//   피드백14: 각 페이지는 총자산을 반복하지 않고 자기 슬라이스만 보여준다.
//   props만으로 재사용. 색은 디자인 토큰만. pct/dayChange는 없으면 자동 생략.
const won = (n) => {
  if (n == null) return "-";
  const a = Math.abs(n);
  if (a >= 1e8) return `${(n / 1e8).toFixed(2)}억`;
  if (a >= 1e4) return `${Math.round(n / 1e4).toLocaleString()}만`;
  return Math.round(n).toLocaleString();
};

export default function AssetSliceCard({ asset, amount, pct, dayChange, icon }) {
  const dc = dayChange == null ? null : Number(dayChange);
  const dcCls = dc == null ? "" : dc > 0 ? "up" : dc < 0 ? "down" : "";
  return (
    <section className="asc">
      <div className="asc-head">
        <span className="asc-name">{icon ? `${icon} ` : ""}{asset}</span>
        {pct != null && <span className="asc-pct">전체의 {Number(pct).toFixed(1)}%</span>}
      </div>
      <div className="asc-amt">{won(amount)}<span>원</span></div>
      {dc != null && (
        <div className={`asc-day ${dcCls}`}>당일 {dc > 0 ? "+" : ""}{dc.toFixed(2)}%</div>
      )}
      <style jsx>{`
        .asc { background: var(--color-card); border: 1px solid var(--color-line); border-radius: var(--radius-card); box-shadow: var(--shadow-card); padding: 15px 17px; }
        .asc-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
        .asc-name { font-size: 0.82rem; font-weight: 800; color: var(--color-ink); }
        .asc-pct { font-size: 0.7rem; font-weight: 700; color: var(--color-ink-3); background: var(--color-card-soft); border-radius: 999px; padding: 2px 9px; }
        .asc-amt { font-size: 1.5rem; font-weight: 800; color: var(--color-ink); font-family: var(--font-display, var(--font-sans)); margin-top: 6px; }
        .asc-amt span { font-size: 0.9rem; font-weight: 700; color: var(--color-ink-2); margin-left: 2px; }
        .asc-day { font-size: 0.76rem; font-weight: 700; color: var(--color-ink-3); margin-top: 4px; font-family: ui-monospace, monospace; }
        .asc-day.up { color: var(--color-success); } .asc-day.down { color: var(--color-danger); }
      `}</style>
    </section>
  );
}
