// [E-3] ETF 일괄 입력 — CSV/붙여넣기 → 행 단위 검증(마스터 대조) → 미리보기 → 확정 저장.
//   실패 행만 사유와 함께 표기(전체 롤백 없음). 마스터에 없는 티커는 거부.
import { useState } from "react";
import { buyEtf } from "../lib/etfHoldings";
import { getTrader } from "../lib/trader";

const ACCTS = ["일반", "ISA", "개인연금", "퇴직연금"];
const TEMPLATE = "티커/종목명, 증권사, 계좌(일반/ISA/개인연금/퇴직연금), 수량, 평단가, 통화(KRW/USD), 매수일(YYYY-MM-DD)\n069500, 미래에셋, ISA, 50, 38000, KRW, 2026-01-15\nSCHD, 삼성, 일반, 100, 78, USD, 2026-02-10";

async function resolve(q) {
  try {
    const d = await fetch(`/api/input/etf-search?q=${encodeURIComponent(q)}`).then((r) => r.json());
    const list = d?.results || [];
    // 코드 정확 일치 우선, 없으면 이름 첫 매치
    return list.find((x) => x.ticker.toUpperCase() === String(q).toUpperCase()) || list[0] || null;
  } catch { return null; }
}

export default function EtfBulkImport({ onDone }) {
  const [text, setText] = useState("");
  const [rows, setRows] = useState(null); // 미리보기 행
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(null);

  const parse = async () => {
    setBusy(true); setSaved(null);
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
      .filter((l) => !/^티커|^ticker/i.test(l)); // 헤더 제거
    const out = [];
    for (const line of lines.slice(0, 100)) {
      const c = line.split(/\s*,\s*|\t/).map((x) => x.trim());
      const [q, broker, account, shares, price, ccy, buyDate] = c;
      const shN = Number(shares), prN = Number(price);
      if (!q) { out.push({ line, error: "빈 티커/종목명" }); continue; }
      if (!(shN > 0)) { out.push({ line, error: "수량 오류" }); continue; }
      if (!(prN > 0)) { out.push({ line, error: "평단가 오류" }); continue; }
      const m = await resolve(q);
      if (!m) { out.push({ line, error: `마스터에 없는 종목: ${q}` }); continue; }
      out.push({
        ok: true, ticker: m.ticker, name: m.name, market: m.market,
        broker: broker || "기타", account: ACCTS.includes(account) ? account : "일반",
        shares: shN, price: prN, ccy: (ccy === "USD" ? "USD" : "KRW"), buyDate: buyDate || "",
      });
    }
    setRows(out); setBusy(false);
  };

  const confirm = () => {
    const tr = getTrader();
    let n = 0;
    (rows || []).filter((r) => r.ok).forEach((r) => {
      const res = buyEtf({ ticker: r.ticker, market: r.market === "US" ? "us" : "kr", shares: r.shares, avgPrice: r.price, avgCcy: r.ccy, account: r.account, broker: r.broker, buyDate: r.buyDate, trader: tr });
      if (res?.ok) n++;
    });
    try { window.dispatchEvent(new Event("onehub-assets-change")); } catch {}
    setSaved(n); setRows(null); setText("");
    if (onDone) onDone(n);
  };

  const okCnt = (rows || []).filter((r) => r.ok).length;
  const errCnt = (rows || []).filter((r) => !r.ok).length;

  return (
    <div className="bulk">
      <div className="bulk-h">📥 일괄 입력 <span>CSV·거래내역 붙여넣기</span></div>
      <textarea className="bulk-ta" rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder={"티커, 증권사, 계좌, 수량, 평단가, 통화, 매수일\n069500, 미래에셋, ISA, 50, 38000, KRW, 2026-01-15"} />
      <div className="bulk-row">
        <button className="bulk-btn ghost" onClick={() => setText(TEMPLATE)}>템플릿 채우기</button>
        <button className="bulk-btn" onClick={parse} disabled={busy || !text.trim()}>{busy ? "검증 중…" : "미리보기"}</button>
      </div>
      {saved != null && <div className="bulk-msg ok">✅ {saved}건 저장 완료</div>}
      {rows && (
        <div className="bulk-prev">
          <div className="bulk-sum">미리보기 — 성공 <b className="ok">{okCnt}</b> · 실패 <b className="err">{errCnt}</b></div>
          <div className="bulk-tbl">
            {rows.map((r, i) => (
              <div className={`bulk-tr ${r.ok ? "" : "bad"}`} key={i}>
                {r.ok
                  ? <><span className="bt-nm">{r.name} <em>{r.ticker}</em></span><span className="bt-meta">{r.account} · {r.shares}주 · {r.ccy === "USD" ? "$" : ""}{r.price.toLocaleString()}</span></>
                  : <><span className="bt-nm err">⚠ {r.error}</span><span className="bt-meta dim">{r.line.slice(0, 30)}</span></>}
              </div>
            ))}
          </div>
          <button className="bulk-btn wide" onClick={confirm} disabled={okCnt === 0}>성공 {okCnt}건 저장 {errCnt > 0 ? `(실패 ${errCnt}건 제외)` : ""}</button>
        </div>
      )}
      <style jsx>{`
        .bulk { margin-top: 12px; border: 1px dashed var(--color-line, #e3ebf3); border-radius: 12px; padding: 12px; }
        .bulk-h { font-size: 0.82rem; font-weight: 800; color: var(--color-ink, #1f2a37); margin-bottom: 8px; }
        .bulk-h span { font-weight: 500; font-size: 0.68rem; color: var(--color-muted, #7b8794); margin-left: 6px; }
        .bulk-ta { width: 100%; box-sizing: border-box; border: 1px solid var(--color-line, #e3ebf3); border-radius: 10px; padding: 9px 11px; font-size: 0.78rem; font-family: var(--font-mono, monospace); background: var(--color-bg, #fff); color: var(--color-ink, #1f2a37); resize: vertical; }
        .bulk-row { display: flex; gap: 8px; margin-top: 8px; }
        .bulk-btn { flex: 1; border: none; border-radius: 9px; padding: 9px 0; font-size: 0.78rem; font-weight: 800; background: var(--color-primary, #2f80ed); color: #fff; cursor: pointer; font-family: var(--font-sans, inherit); }
        .bulk-btn.ghost { background: var(--color-primary-soft, #e4eefe); color: var(--color-primary, #2f80ed); }
        .bulk-btn.wide { width: 100%; margin-top: 10px; }
        .bulk-btn:disabled { opacity: .5; cursor: default; }
        .bulk-msg.ok { margin-top: 8px; font-size: 0.76rem; font-weight: 700; color: var(--color-success, #16a34a); }
        .bulk-prev { margin-top: 10px; }
        .bulk-sum { font-size: 0.76rem; font-weight: 700; margin-bottom: 6px; color: var(--color-ink-2, #4b5563); }
        .bulk-sum .ok { color: var(--color-success, #16a34a); } .bulk-sum .err { color: var(--color-danger, #dc2626); }
        .bulk-tbl { max-height: 200px; overflow-y: auto; border: 1px solid var(--color-line, #e3ebf3); border-radius: 9px; }
        .bulk-tr { display: flex; justify-content: space-between; gap: 8px; padding: 7px 10px; font-size: 0.74rem; border-bottom: 1px solid var(--color-line, #eef2f7); }
        .bulk-tr:last-child { border-bottom: none; }
        .bulk-tr.bad { background: var(--color-danger-soft, #fff1f1); }
        .bt-nm { font-weight: 700; color: var(--color-ink, #1f2a37); }
        .bt-nm.err { color: var(--color-danger, #dc2626); font-weight: 600; }
        .bt-nm em { font-style: normal; color: var(--color-muted, #7b8794); font-size: 0.66rem; }
        .bt-meta { color: var(--color-muted, #7b8794); font-size: 0.7rem; white-space: nowrap; }
        .bt-meta.dim { opacity: .7; }
      `}</style>
    </div>
  );
}
