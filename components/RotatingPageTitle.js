// [OS-2] 전 페이지 공통 상단 타이틀 패턴 — 고정 단어(예: "오늘")는 그대로, 뒤에 붙는 단어만
//   "종목변경" 버튼 클릭 시 회색 페이드 애니메이션으로 자연스럽게 순환 전환된다.
//   버튼은 항상 라벨만 순환시킨다(그 자체로 이동하지 않음) — 이동이 필요하면 onLabelClick으로
//   현재 라벨 텍스트 자체를 탭했을 때만 이동시킨다(오늘 페이지처럼 순수 표시용으로도 쓸 수 있게 분리).
import { useState } from "react";

export default function RotatingPageTitle({ fixed = "", items, buttonLabel = "종목변경", onLabelClick, compact = false }) {
  const [idx, setIdx] = useState(0);
  const [anim, setAnim] = useState(false);
  const cur = items[idx % items.length];

  const advance = () => {
    setAnim(true);
    setTimeout(() => {
      setIdx((i) => (i + 1) % items.length);
      setAnim(false);
    }, 180);
  };

  const label = (
    <span
      className={`rpt-suffix ${anim ? "fade" : ""} ${onLabelClick ? "clickable" : ""}`}
      onClick={onLabelClick ? () => onLabelClick(cur, idx) : undefined}
      role={onLabelClick ? "button" : undefined}
      tabIndex={onLabelClick ? 0 : undefined}
    >
      {cur?.suffix || ""}
    </span>
  );

  return (
    <div className={`rpt ${compact ? "compact" : ""}`}>
      {compact ? label : (
        <h1 className="rpt-title">
          <span className="rpt-fixed">{fixed}</span>
          {label}
        </h1>
      )}
      {items.length > 1 && (
        <button type="button" className="rpt-btn" onClick={advance}>{buttonLabel}</button>
      )}
      <style jsx>{`
        .rpt { display: inline-flex; align-items: center; gap: 8px; }
        .rpt-title { margin: 0; font-size: 20px; font-weight: 800; letter-spacing: -.4px; font-family: var(--font-display, var(--font-sans)); display: flex; }
        .rpt-fixed { color: var(--color-ink); }
        .rpt-suffix { color: var(--color-ink-3); transition: opacity .18s ease, transform .18s ease; opacity: 1; transform: translateY(0); }
        .rpt-suffix.fade { opacity: 0; transform: translateY(3px); }
        .rpt-suffix.clickable { cursor: pointer; text-decoration: underline; text-underline-offset: 2px; }
        .rpt.compact .rpt-suffix { font-size: 12px; font-weight: 700; }
        .rpt-btn {
          flex-shrink: 0; border: 1px solid var(--color-line); background: var(--color-card);
          color: var(--color-ink-2); font-weight: 700; padding: 6px 12px; border-radius: 999px;
          cursor: pointer; font-family: var(--font-sans);
        }
        .rpt:not(.compact) .rpt-btn { margin-left: auto; font-size: 11.5px; }
        .rpt.compact .rpt-btn { font-size: 10px; padding: 3px 9px; }
      `}</style>
    </div>
  );
}
