// components/HoldingsNews.js
// [FB-2 §2.4] 내 보유종목 관련 뉴스 — 내가 산 주식 중심으로 오늘 뉴스에서 관련분만 모은다.
//   3층 구성(§2.4): macro(거시) / 관련뉴스 / onehub 태그. 단, 근거 없는 'onehub 코멘트'는
//   지어내지 않는다 — 대신 '내 보유 {종목} 관련' 출처 태그 + 카테고리(거시/관련) 배지로 정직하게 표기.
//   매칭되는 뉴스가 없으면 카드 자체를 숨긴다(빈 자리 방지, 원칙1).
import { useEffect, useState } from "react";
import { getStockHoldings } from "../lib/stockHoldings";

const MACRO_CATS = new Set(["global", "macro", "policy"]);

export default function HoldingsNews({ trader = "A", onOpenNews }) {
  const [rows, setRows] = useState([]);

  useEffect(() => {
    let alive = true;
    let names = [];
    try {
      const hs = getStockHoldings(trader) || [];
      // 종목명(한글/영문)만 추출 — 2글자 미만은 오매칭 방지 위해 제외.
      names = hs
        .flatMap((h) => [h.name, h.name_kr].filter(Boolean))
        .map((s) => String(s).trim())
        .filter((s) => s.length >= 2);
      names = Array.from(new Set(names));
    } catch (e) { names = []; }
    if (names.length === 0) { setRows([]); return; }

    fetch("/api/today/news")
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        const items = Array.isArray(d?.items) ? d.items : [];
        const matched = [];
        for (const it of items) {
          const hay = `${it.headline || ""} ${it.summary_md || ""}`;
          const hit = names.find((n) => hay.includes(n));
          if (hit) {
            matched.push({
              ...it,
              hit,
              macro: MACRO_CATS.has(it.category),
              at: it.created_at || null,
            });
          }
        }
        setRows(matched.slice(0, 5));
      })
      .catch(() => { if (alive) setRows([]); });
    return () => { alive = false; };
  }, [trader]);

  if (rows.length === 0) return null;

  return (
    <section className="card hn">
      <div className="hn-h">📌 내 보유종목 뉴스 <span className="hn-sub">내가 산 종목 관련</span></div>
      <div className="hn-list">
        {rows.map((r) => (
          <button type="button" className="hn-row" key={r.id} onClick={() => onOpenNews && onOpenNews(r)}>
            <span className={`hn-badge ${r.macro ? "macro" : "rel"}`}>{r.macro ? "거시" : "관련"}</span>
            <div className="hn-b">
              <div className="hn-t">{r.headline}</div>
              <div className="hn-tag">내 보유 <b>{r.hit}</b> 관련{r.at ? ` · ${String(r.at).slice(5, 10)}` : ""}</div>
            </div>
          </button>
        ))}
      </div>
      <p className="hn-foot">내 보유 주식이 오늘 뉴스에 언급된 경우만 모았습니다. onehub</p>

      <style jsx>{`
        .hn-h { font-size: 0.86rem; font-weight: 800; color: var(--color-ink); margin-bottom: 8px; display: flex; align-items: baseline; gap: 8px; }
        .hn-sub { font-size: 0.66rem; font-weight: 700; color: var(--color-ink-3); }
        .hn-list { display: flex; flex-direction: column; }
        .hn-row { display: flex; width: 100%; text-align: left; gap: 9px; align-items: flex-start; padding: 9px 2px; border: none; border-bottom: 1px solid var(--color-line); background: none; cursor: pointer; font-family: var(--font-sans); }
        .hn-row:last-child { border-bottom: none; }
        .hn-badge { flex: none; font-size: 0.58rem; font-weight: 800; padding: 2px 7px; border-radius: 999px; margin-top: 2px; }
        .hn-badge.macro { color: var(--color-primary); background: var(--color-primary-soft, rgba(47,107,255,.12)); }
        .hn-badge.rel { color: var(--color-ink-2); background: var(--color-card-soft, var(--color-line)); }
        .hn-b { flex: 1; min-width: 0; }
        .hn-t { font-size: 0.8rem; font-weight: 700; color: var(--color-ink); line-height: 1.45; word-break: keep-all; }
        .hn-tag { font-size: 0.68rem; font-weight: 600; color: var(--color-ink-3); margin-top: 3px; }
        .hn-tag b { color: var(--color-ink-2); font-weight: 800; }
        .hn-foot { font-size: 0.62rem; color: var(--color-ink-3); margin-top: 9px; line-height: 1.5; word-break: keep-all; }
      `}</style>
    </section>
  );
}
