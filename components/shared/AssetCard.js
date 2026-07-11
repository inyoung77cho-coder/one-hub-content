// [S2.3] 공통 자산 카드 — 주식·ETF·부동산이 같은 4블록 문법을 공유한다.
//   ① 헤더(이름 + 손익%/국면) ② 핵심수치 ③ AI 배지(사전) ④ 액션(CTA)
//   색/문구는 디자인 토큰과 배지 사전만 사용(하드코딩 0). variant는 좌측 악센트 색만 바꾼다.
import { badge } from "../../lib/badges";

const VARIANT_ACCENT = {
  stock: "var(--color-primary)",
  etf: "var(--color-etf)",
  realestate: "var(--color-success)",
};

export default function AssetCard({
  variant = "stock",
  name,
  sub,            // 헤더 보조(코드/평형 등)
  change,         // 손익% 또는 국면 문자열
  changeTone,     // 'pos' | 'neg' | 'neutral'
  metrics = [],   // [{k, v, tone?}]
  badgeKey,       // 배지 사전 키(UNDERVALUED 등)
  badgeText,      // 배지 대신 직접 문구(있으면 우선)
  onAction,
  actionLabel,
  children,
}) {
  const accent = VARIANT_ACCENT[variant] || VARIANT_ACCENT.stock;
  const bd = badgeKey ? badge(badgeKey) : null;
  const toneColor = (t) => (t === "pos" ? "var(--color-success)" : t === "neg" ? "var(--color-danger)" : "var(--color-ink-2)");
  return (
    <div className="ac" style={{ borderLeftColor: accent }}>
      {/* ① 헤더 */}
      <div className="ac-h">
        <div className="ac-name">{name}{sub && <span className="ac-sub">{sub}</span>}</div>
        {change != null && <div className="ac-chg" style={{ color: toneColor(changeTone) }}>{change}</div>}
      </div>
      {/* ② 핵심수치 */}
      {metrics.length > 0 && (
        <div className="ac-metrics">
          {metrics.map((m, i) => (
            <div className="ac-m" key={i}>
              <span className="ac-mk">{m.k}</span>
              <b className="ac-mv" style={{ color: toneColor(m.tone) }}>{m.v}</b>
            </div>
          ))}
        </div>
      )}
      {children}
      {/* ③ AI 배지 + ④ 액션 */}
      {(bd || badgeText || actionLabel) && (
        <div className="ac-foot">
          {(bd || badgeText) && (
            <span className="ac-badge" style={{ background: bd ? bd.soft : "var(--color-card-soft)", color: bd ? bd.color : "var(--color-ink-2)" }}>
              {badgeText || bd.label}
            </span>
          )}
          {actionLabel && <button className="ac-cta" onClick={onAction}>{actionLabel}</button>}
        </div>
      )}
      <style jsx>{`
        .ac { background: var(--color-card); border: 1px solid var(--color-line); border-left: 4px solid var(--color-primary); border-radius: var(--radius-card); box-shadow: var(--shadow-card); padding: 15px 16px; margin-bottom: 12px; }
        .ac-h { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
        .ac-name { font-size: 0.95rem; font-weight: 800; color: var(--color-ink); display: flex; align-items: baseline; gap: 7px; min-width: 0; }
        .ac-sub { font-size: 0.7rem; font-weight: 600; color: var(--color-ink-3); }
        .ac-chg { font-size: 0.92rem; font-weight: 800; white-space: nowrap; font-variant-numeric: tabular-nums; }
        .ac-metrics { display: flex; flex-wrap: wrap; gap: 8px 18px; margin-top: 10px; }
        .ac-m { display: flex; flex-direction: column; gap: 2px; }
        .ac-mk { font-size: 0.64rem; color: var(--color-ink-3); font-weight: 600; }
        .ac-mv { font-size: 0.86rem; font-weight: 800; font-variant-numeric: tabular-nums; }
        .ac-foot { display: flex; align-items: center; gap: 8px; margin-top: 12px; }
        .ac-badge { font-size: 0.68rem; font-weight: 800; padding: 4px 10px; border-radius: 7px; }
        .ac-cta { margin-left: auto; background: none; border: 1px solid var(--color-line); color: var(--color-primary); border-radius: 9px; padding: 7px 13px; font-size: 0.74rem; font-weight: 700; font-family: var(--font-sans); cursor: pointer; }
      `}</style>
    </div>
  );
}
