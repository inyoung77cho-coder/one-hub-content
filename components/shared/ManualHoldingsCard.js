// [사용자 지시 2026-08-30] "직접 입력 보유 · KIS 외 증권사" 카드 — 종합자산 › 주식 › 보유 탭에서
//   KIS 보유 종목 카드 바로 아래에 오는 두 번째 카드. 추가·확인·삭제를 이 자리에서 끝낸다.
//   ★ index.js(portfolio 탭)의 같은 카드와 한 파일을 공유한다 — 손으로 복제하면 반드시 어긋난다.
//   ★ 시세는 이 컴포넌트가 직접 조회한다(lib/stockLive) — 부모마다 다른 값을 넘겨 두 화면의
//     숫자가 갈라지는 일을 막기 위해서다. 저장/삭제 후에는 즉시 재조회한다.
import { useCallback, useEffect, useRef, useState } from "react";
import { getStockHoldings, removeStock } from "../../lib/stockHoldings";
import { fetchStockQuotes } from "../../lib/stockLive";
import { StockForm } from "./AssetForms";

export default function ManualHoldingsCard({ trader = "A", onChanged }) {
  const [mounted, setMounted] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [tick, setTick] = useState(0);
  const [quotes, setQuotes] = useState({});
  const [confirmId, setConfirmId] = useState(null);
  const alive = useRef(true);

  useEffect(() => { setMounted(true); return () => { alive.current = false; }; }, []);

  const list = mounted ? (getStockHoldings(trader) || []) : [];

  // 시세 조회 — 목록이 바뀔 때마다. 실패해도 저장값으로 표시되므로 조용히 넘어간다.
  useEffect(() => {
    if (!mounted) return;
    const holdings = getStockHoldings(trader) || [];
    if (!holdings.length) { setQuotes({}); return; }
    let cancelled = false;
    fetchStockQuotes(holdings)
      .then(({ quotes: q }) => { if (!cancelled) setQuotes(q || {}); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [mounted, trader, tick]);

  const changed = useCallback(() => {
    setTick((t) => t + 1);
    try { window.dispatchEvent(new Event("onehub-assets-change")); } catch (e) {}
    if (onChanged) onChanged();
  }, [onChanged]);

  const del = (h) => {
    if (confirmId !== h.id) {
      setConfirmId(h.id);
      setTimeout(() => setConfirmId((c) => (c === h.id ? null : c)), 4000);
      return;
    }
    setConfirmId(null);
    removeStock({ id: h.id, trader });
    changed();
  };

  return (
    <section className="mhc">
      <div className="mhc-head">
        <span className="mhc-title">🧾 직접 입력 보유 <span className="mhc-sub">KIS 외 증권사</span></span>
        <button className="mhc-add" onClick={() => setFormOpen((o) => !o)}>{formOpen ? "닫기" : "＋ 추가"}</button>
      </div>

      {formOpen && (
        <div className="mhc-form">
          <StockForm onSaved={() => { setFormOpen(false); changed(); }} />
        </div>
      )}

      {!list.length ? (
        <div className="mhc-empty">미래에셋·삼성 등 KIS 외 증권사 보유를 <b>＋ 추가</b>로 입력하면 여기에 표시됩니다.</div>
      ) : (
        <div className="mhc-list">
          {list.map((h) => {
            const q = quotes[h.id];
            const cp = q?.price;                       // 현재가(해당 통화, 라이브)
            const isUsd = h.ccy === "USD";
            const buy = Number(h.avgPrice) || 0;
            // 평단이 현재가와 10배 이상 벌어지면 총매수금액을 평단 칸에 넣었을 가능성이 크다.
            const anomaly = cp && buy > 0 && !isUsd && (buy > cp * 10 || buy < cp / 10);
            const fmt = (v) => `${isUsd ? "$" : ""}${isUsd ? Number(v).toLocaleString() : Math.round(Number(v)).toLocaleString()}${isUsd ? "" : "원"}`;
            const pnl = cp && buy > 0 ? (cp / buy - 1) * 100 : null;
            // [사용자 지적] '지금'과 '현재가'가 한 카드에서 서로 다른 값으로 보이던 라벨 혼선 정정.
            //   왼쪽 큰 값 = 현재가(라이브), 아래 작은 값 = 매수 기준(평단).
            const basisLabel = h.priceBasis === "current" ? "매수 기준(현재가로 입력)" : "매수 평단";
            const evalWon = cp != null && !isUsd ? cp * (Number(h.shares) || 0) : null;
            return (
              <div className={`mhc-row ${anomaly ? "anom" : ""}`} key={h.id}>
                <div className="mhc-l">
                  <b className="mhc-name">
                    {h.name}
                    {anomaly && <span className="mhc-warn" title={`평단 ${buy.toLocaleString()}원이 현재가 ${Number(cp).toLocaleString()}원과 크게 차이납니다. 총매수금액을 평단에 넣었는지 확인해 주세요.`}>⚠ 확인 필요</span>}
                  </b>
                  <span className="mhc-meta">
                    {h.broker} · {h.account} · {h.market === "us" ? "🇺🇸 해외" : "🇰🇷 국내"}
                    {q?.date ? ` · 시세 ${String(q.date).slice(5)}` : ""}
                  </span>
                </div>
                <div className="mhc-r">
                  <span className="mhc-cur">{h.shares}주 · 현재가 {fmt(cp != null ? cp : buy)}</span>
                  <span className="mhc-basis">
                    {basisLabel} {fmt(buy)}
                    {pnl != null && <em className={pnl >= 0 ? "up" : "dn"}>{pnl >= 0 ? "+" : ""}{pnl.toFixed(1)}%</em>}
                  </span>
                  {evalWon != null && <span className="mhc-eval">평가 {Math.round(evalWon).toLocaleString()}원</span>}
                </div>
                <button
                  className={`mhc-del${confirmId === h.id ? " confirm" : ""}`}
                  onClick={() => del(h)}
                  aria-label={`${h.name} 삭제`}
                >
                  {confirmId === h.id ? "삭제?" : "✕"}
                </button>
              </div>
            );
          })}
        </div>
      )}

      <style jsx>{`
        .mhc { background: var(--color-card); border: 1px solid var(--color-line); border-radius: var(--radius-card, 14px); padding: 16px; margin-bottom: 12px; box-shadow: var(--shadow-card); font-family: var(--font-sans); color: var(--color-ink); }
        .mhc-head { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
        .mhc-title { font-size: 0.86rem; font-weight: 800; letter-spacing: -.3px; }
        .mhc-sub { font-size: 0.68rem; font-weight: 600; color: var(--color-ink-3); margin-left: 4px; }
        .mhc-add { margin-left: auto; flex-shrink: 0; border: 1px solid var(--color-line); background: var(--color-card); color: var(--color-primary); font-size: 0.7rem; font-weight: 800; padding: 5px 11px; border-radius: 999px; cursor: pointer; font-family: var(--font-sans); }
        .mhc-form { margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px dashed var(--color-line); }
        .mhc-empty { font-size: 0.76rem; color: var(--color-ink-3); line-height: 1.6; }
        .mhc-list { display: flex; flex-direction: column; gap: 8px; }
        .mhc-row { display: flex; align-items: flex-start; gap: 8px; background: var(--color-card-soft, var(--inset-bg, rgba(0,0,0,.02))); border: 1px solid var(--color-line); border-radius: 12px; padding: 9px 11px; }
        .mhc-row.anom { border-color: var(--color-warning); }
        .mhc-l { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
        .mhc-name { font-size: 0.82rem; font-weight: 800; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .mhc-warn { margin-left: 5px; font-size: 0.62rem; font-weight: 700; color: var(--color-warning); }
        .mhc-meta { font-size: 0.66rem; color: var(--color-ink-3); }
        .mhc-r { display: flex; flex-direction: column; align-items: flex-end; gap: 1px; flex-shrink: 0; text-align: right; }
        .mhc-cur { font-size: 0.78rem; font-weight: 700; font-variant-numeric: tabular-nums; }
        .mhc-basis { font-size: 0.68rem; font-weight: 600; color: var(--color-ink-3); font-variant-numeric: tabular-nums; }
        .mhc-basis em { font-style: normal; margin-left: 5px; font-weight: 700; }
        .mhc-eval { font-size: 0.66rem; color: var(--color-ink-3); font-variant-numeric: tabular-nums; }
        .up { color: var(--color-success, #0E9E6A); }
        .dn { color: var(--color-danger, #E5484D); }
        .mhc-del { flex-shrink: 0; align-self: center; border: 1px solid var(--color-line); background: var(--color-card); color: var(--color-ink-3); font-size: 0.7rem; font-weight: 700; min-width: 28px; height: 26px; padding: 0 7px; border-radius: 8px; cursor: pointer; font-family: var(--font-sans); }
        .mhc-del.confirm { background: var(--color-danger); border-color: var(--color-danger); color: #fff; }
      `}</style>
    </section>
  );
}
