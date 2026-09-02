// [S22-1] 이상 평단 확인 카드 — 주식·ETF 공용(복제 금지, 한 곳에서만 정의).
//   앱은 값을 고치지 않는다(N6). 원본이 평단인지 총매입액인지·액면분할 전 가격인지는 입력한 사람만 안다.
//   warnings 중 code === "AVG_PRICE_OUT_OF_RANGE" 만 그린다. source('stock'|'etf')로 확인/수정 대상 원장을 가른다.
//   스타일은 전역 토큰(var(--color-*))만 쓰는 자기완결 <style jsx> — 어느 페이지에서 써도 동일하게 렌더된다.
import { useState } from "react";
import { getTrader } from "../../lib/trader";
import { verifyStockAvg, updateStockAvg } from "../../lib/stockHoldings";
import { verifyEtfAvg, updateEtfAvg } from "../../lib/etfHoldings";

export default function AvgPriceWarningCard({ warnings = [], onReload }) {
  const [fixId, setFixId] = useState(null);
  const [fixVal, setFixVal] = useState("");
  const list = (warnings || []).filter((w) => w.code === "AVG_PRICE_OUT_OF_RANGE");
  if (!list.length) return null;

  const trader = getTrader();
  const isEtf = (w) => w.source === "etf";
  const unit = (w) => (w.avgCcy === "USD" ? "$" : "원");
  const reload = () => { try { onReload && onReload(); } catch (e) {} };
  const doVerify = (w) => { (isEtf(w) ? verifyEtfAvg : verifyStockAvg)({ id: w.id, trader }); reload(); };
  const doFix = (w, v) => {
    const r = (isEtf(w) ? updateEtfAvg : updateStockAvg)({ id: w.id, avgPrice: v, trader });
    if (r && r.ok) { setFixId(null); setFixVal(""); reload(); }
  };

  return (
    <>
      {list.map((w) => (
        <section className="card apw" key={w.id || w.name}>
          <div className="apw-h">확인이 필요합니다</div>
          <p className="apw-q">
            <b>{w.name}</b>의 평단이 <b>{Number(w.avgPrice).toLocaleString()}{unit(w)}</b>으로 입력돼 있습니다.
            흔한 원인은 <b>총매입액이나 {isEtf(w) ? "액면분할 전 가격" : "총매입액"}을 평단 칸에 넣은 경우</b>지만, 실제로 맞는 값일 수도 있습니다.
            {w.dup_with_kis
              ? <> 이 종목은 증권사 연동에도 있어 <b>총자산 합산에는 쓰지 않지만</b>, 목록·수익률에는 이 값이 그대로 보입니다.</>
              : <> 그래서 <b>총자산·손익에서 잠시 뺐습니다</b>.</>}
            {" "}어느 쪽인지는 입력하신 분만 아셔서 저희가 임의로 고치지 않았습니다.
          </p>
          {fixId === w.id ? (
            <div className="apw-edit">
              <input className="apw-in" type="number" inputMode="numeric" value={fixVal}
                placeholder={`1주당 평단(${unit(w)})`} onChange={(e) => setFixVal(e.target.value)} aria-label="평단 입력" />
              <button className="apw-b p" onClick={() => doFix(w, fixVal)}>저장</button>
              <button className="apw-b" onClick={() => { setFixId(null); setFixVal(""); }}>취소</button>
            </div>
          ) : (
            <div className="apw-cta">
              <button className="apw-b p" onClick={() => { setFixId(w.id); setFixVal(""); }}>평단 수정</button>
              <button className="apw-b" onClick={() => doVerify(w)}>이 값이 맞습니다</button>
            </div>
          )}
        </section>
      ))}
      <style jsx>{`
        .apw { border-color: var(--color-warn, #d97706); }
        .apw-h { font-size: 0.86rem; font-weight: 800; color: var(--color-ink); margin-bottom: 12px; }
        .apw-q { font-size: 0.8rem; line-height: 1.55; color: var(--color-ink-2); margin: 0 0 10px; word-break: keep-all; }
        .apw-cta, .apw-edit { display: flex; gap: 8px; align-items: center; }
        .apw-b { flex: 0 0 auto; border: 1px solid var(--color-line); background: var(--color-card); color: var(--color-ink-2); border-radius: 9px; padding: 9px 14px; font-size: 0.78rem; font-weight: 700; font-family: var(--font-sans); cursor: pointer; }
        .apw-b.p { border-color: var(--color-primary); color: var(--color-primary); }
        .apw-in { flex: 1 1 0; min-width: 0; border: 1px solid var(--color-line); border-radius: 9px; padding: 9px 10px; font-size: 0.82rem; font-family: var(--font-sans); background: var(--color-card); color: var(--color-ink); font-variant-numeric: tabular-nums; }
      `}</style>
    </>
  );
}
