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
            // [모바일 수정] 라벨이 길수록 오른쪽 칸이 넓어지고 왼쪽 종목명 칸이 짓눌린다 — 짧게.
            const basisLabel = h.priceBasis === "current" ? "매수기준" : "평단";
            const evalWon = cp != null && !isUsd ? cp * (Number(h.shares) || 0) : null;
            // 평가액은 원 단위로 다 적으면 한 줄을 통째로 먹는다 — 만원/억 단위로 줄여 표기.
            const evalTxt = evalWon == null ? null
              : evalWon >= 1e8 ? `${(evalWon / 1e8).toFixed(2)}억`
              : `${Math.round(evalWon / 1e4).toLocaleString()}만원`;
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
                {/* [모바일 수정] 좌우 2열로 붙여 두면 좁은 폭에서 오른쪽이 안 줄어 왼쪽 종목명이
                    글자 단위로 쪼개진다(실측 375px에서 종목명 칸 24px·행 높이 178px).
                    숫자는 아래 줄 전체 폭을 쓰는 한 줄로 내리고, 넘치면 자연스럽게 접히게 한다. */}
                <div className="mhc-r">
                  {/* 두 덩어리로만 나눈다 — 항목별로 쪼개면 좁은 폭에서 3~4줄로 흩어진다(실측). */}
                  <span className="mhc-num">{h.shares}주 · 현재가 <b>{fmt(cp != null ? cp : buy)}</b></span>
                  <span className="mhc-num">
                    {basisLabel} {fmt(buy)}
                    {pnl != null && <em className={pnl >= 0 ? "up" : "dn"}>{pnl >= 0 ? "+" : ""}{pnl.toFixed(1)}%</em>}
                    {evalTxt && <> · 평가 <b>{evalTxt}</b></>}
                  </span>
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
        /* 2행 그리드: 1행 = 종목명 + 삭제, 2행 = 숫자(전체 폭). 좁은 폭에서도 칸이 짓눌리지 않는다. */
        .mhc-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; grid-template-areas: "name del" "nums nums"; align-items: center; column-gap: 8px; row-gap: 6px; background: var(--color-card-soft, var(--inset-bg, rgba(0,0,0,.02))); border: 1px solid var(--color-line); border-radius: 12px; padding: 9px 11px; }
        .mhc-row.anom { border-color: var(--color-warning); }
        .mhc-l { grid-area: name; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
        .mhc-name { font-size: 0.82rem; font-weight: 800; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .mhc-warn { margin-left: 5px; font-size: 0.62rem; font-weight: 700; color: var(--color-warning); }
        .mhc-meta { font-size: 0.66rem; color: var(--color-ink-3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        /* 숫자 줄 — 넘치면 다음 줄로 접힌다(잘리거나 칸을 밀지 않는다). */
        .mhc-r { grid-area: nums; display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 10px; min-width: 0; }
        /* 각 덩어리는 줄 안에서 끊기지 않고, 다 못 들어가면 통째로 다음 줄로 내려간다 → 최대 2줄. */
        .mhc-num { font-size: 0.7rem; font-weight: 600; color: var(--color-ink-3); font-variant-numeric: tabular-nums; white-space: nowrap; }
        .mhc-num b { font-weight: 800; color: var(--color-ink); }
        .mhc-num em { font-style: normal; margin-left: 4px; font-weight: 800; }
        .up { color: var(--color-success, #0E9E6A); }
        .dn { color: var(--color-danger, #E5484D); }
        .mhc-del { grid-area: del; border: 1px solid var(--color-line); background: var(--color-card); color: var(--color-ink-3); font-size: 0.7rem; font-weight: 700; min-width: 28px; height: 26px; padding: 0 7px; border-radius: 8px; cursor: pointer; font-family: var(--font-sans); }
        .mhc-del.confirm { background: var(--color-danger); border-color: var(--color-danger); color: #fff; }
      `}</style>
    </section>
  );
}
