// [S3] 전역 빠른입력 시트 — 4자산(주식/ETF/부동산/현금) 통합 폼.
//   [폼 일원화] 주식/ETF/부동산은 공용 AssetForms(페이지와 동일 양식)를 그대로 사용해
//   빠른입력과 상세 페이지의 입력 양식이 어긋나지 않게 한다. 현금만 간단 인라인.
import { useEffect, useState } from "react";
import { StockForm, EtfForm, ReForm } from "./AssetForms";
import { getLedger } from "../../lib/ledger";
import { getTrader } from "../../lib/trader";

const ASSETS = [
  ["stock", "주식", "var(--color-primary)"],
  ["etf", "ETF", "var(--color-etf)"],
  ["realestate", "부동산", "var(--color-success)"],
  ["cash", "현금", "var(--color-warning)"],
];

function readOnb() {
  try { return JSON.parse(localStorage.getItem("onehub_onboard_assets") || "{}") || {}; } catch (e) { return {}; }
}
function writeOnb(next) {
  try { localStorage.setItem("onehub_onboard_assets", JSON.stringify(next)); } catch (e) {}
}
function broadcast() {
  try { window.dispatchEvent(new Event("onehub-assets-change")); } catch (e) {}
}

export default function QuickAddSheet({ initialAsset = "stock", onClose, onSaved }) {
  const [asset, setAsset] = useState(initialAsset);
  const [amount, setAmount] = useState("");
  const [msg, setMsg] = useState("");
  // [I1] 2단 구조 — ① 현재 등록 상태 확인 ② 추가/수정. write-only 폼 위에 현재값을 먼저 보여준다.
  const [cur, setCur] = useState({ stock: null, etf: null, realestate: null, cash: null, reName: "" });
  useEffect(() => {
    // [N1] '현재 등록'도 단일 원장에서 읽는다 — 시트와 자산 지도의 숫자가 어긋나지 않게.
    //   (과거엔 onboard만 읽어 직접입력 주식이 '미등록'으로 보였다.)
    let alive = true;
    let reName = "";
    try { const mp = JSON.parse(localStorage.getItem("onehub_re_my_property") || "null"); reName = mp?.name || ""; } catch (e) {}
    getLedger(getTrader())
      .then((L) => {
        if (!alive) return;
        const b = L?.breakdown || {};
        setCur({
          stock: b.stock_uk ?? null,
          etf: b.etf_uk ?? null,
          realestate: b.realestate_uk ?? null,
          cash: b.cash_uk ?? null,
          reName,
        });
        // 현금 탭 진입 시 현재값 프리필(수정 맥락 제공)
        if (initialAsset === "cash" && b.cash_uk != null) setAmount(String(b.cash_uk));
      })
      .catch(() => { if (alive) setCur((c) => ({ ...c, reName })); });
    return () => { alive = false; };
  }, [initialAsset]);

  const ukTxt = (v) => (v == null ? "미등록" : `${Number(v).toFixed(2)}억`);

  const done = (key) => { if (onSaved) onSaved(key); if (onClose) onClose(); };

  const saveCash = () => {
    const amt = Number(amount);
    if (!(amt >= 0) || amount === "") { setMsg("금액을 입력하세요"); return; }
    const onb = readOnb(); onb.cash_uk = amt; writeOnb(onb); broadcast();
    done("cash");
  };

  return (
    <div className="qa-scrim" onClick={onClose}>
      <div className="qa" onClick={(e) => e.stopPropagation()}>
        <div className="qa-h">➕ 빠른 입력<button className="qa-x" onClick={onClose} aria-label="닫기">✕</button></div>
        <div className="qa-chips">
          {ASSETS.map(([k, l, c]) => (
            <button key={k} className={`qa-chip ${asset === k ? "on" : ""}`} style={asset === k ? { background: c, borderColor: c } : null} onClick={() => { setAsset(k); setMsg(""); }}>{l}</button>
          ))}
        </div>

        {/* [I1] ① 현재 등록 상태 — 무엇을 추가/수정하는지 먼저 확인(write-only → 2단 구조) */}
        <div className="qa-cur">
          <span className="qa-cur-k">현재 등록</span>
          <span className={`qa-cur-v ${asset === "stock" ? "hot" : ""}`}>주식 {ukTxt(cur.stock)}</span>
          <span className={`qa-cur-v ${asset === "etf" ? "hot" : ""}`}>ETF {ukTxt(cur.etf)}</span>
          <span className={`qa-cur-v ${asset === "realestate" ? "hot" : ""}`}>부동산 {cur.reName ? `${cur.reName} ` : ""}{ukTxt(cur.realestate)}</span>
          <span className={`qa-cur-v ${asset === "cash" ? "hot" : ""}`}>현금 {ukTxt(cur.cash)}</span>
        </div>

        {asset === "stock" && <StockForm onSaved={done} autofocusName />}
        {asset === "etf" && <EtfForm onSaved={done} />}
        {asset === "realestate" && <ReForm onSaved={done} />}
        {asset === "cash" && (
          <>
            <label className="qa-f"><span>금액(억)</span>
              <input type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="예: 1.5" /></label>
            {msg && <div className="qa-msg">{msg}</div>}
            <button className="qa-save" onClick={saveCash}>저장 · 즉시 반영</button>
          </>
        )}

        <div className="qa-note">저장하면 총자산·해당 자산군 카드에 바로 반영됩니다. 상세는 각 페이지에서 이어서 편집할 수 있습니다.</div>
      </div>
      <style jsx>{`
        .qa-scrim { position: fixed; inset: 0; background: rgba(0,0,0,0.45); z-index: 300; display: flex; align-items: flex-end; justify-content: center; }
        .qa { width: 100%; max-width: 480px; background: var(--color-card); border-radius: 20px 20px 0 0; padding: 20px 18px calc(env(safe-area-inset-bottom, 0px) + 20px); box-shadow: var(--shadow-float); font-family: var(--font-sans); color: var(--color-ink); max-height: 90vh; overflow-y: auto; }
        .qa-h { display: flex; align-items: center; justify-content: space-between; font-size: 1rem; font-weight: 800; margin-bottom: 14px; }
        .qa-x { border: none; background: var(--color-card-soft); color: var(--color-ink-2); width: 30px; height: 30px; border-radius: 50%; font-size: 0.9rem; cursor: pointer; }
        .qa-chips { display: flex; gap: 6px; margin-bottom: 14px; }
        .qa-chip { flex: 1; border: 1px solid var(--color-line); background: var(--color-card); color: var(--color-ink-2); border-radius: 10px; padding: 9px 0; font-size: 0.82rem; font-weight: 700; font-family: var(--font-sans); cursor: pointer; }
        .qa-chip.on { color: #fff; }
        /* [I1] 현재 등록 상태 readout */
        .qa-cur { display: flex; flex-wrap: wrap; align-items: center; gap: 5px 8px; background: var(--color-card-soft, var(--inset-bg)); border-radius: 10px; padding: 9px 11px; margin-bottom: 12px; }
        .qa-cur-k { font-size: 0.62rem; font-weight: 800; color: var(--color-ink-3); letter-spacing: -.2px; }
        .qa-cur-v { font-size: 0.68rem; font-weight: 600; color: var(--color-ink-3); }
        .qa-cur-v.hot { color: var(--color-ink); font-weight: 800; }
        .qa-f { display: flex; flex-direction: column; gap: 5px; font-size: 0.7rem; color: var(--color-ink-3); font-weight: 700; margin-bottom: 11px; }
        .qa-f input { border: 1px solid var(--color-line); background: var(--color-bg); border-radius: 10px; padding: 11px 12px; font-size: 0.9rem; font-family: var(--font-sans); color: var(--color-ink); }
        .qa-f input:focus { outline: none; border-color: var(--color-primary); }
        .qa-msg { font-size: 0.76rem; color: var(--color-danger); font-weight: 600; margin-bottom: 8px; }
        .qa-save { width: 100%; margin-top: 4px; border: none; border-radius: 12px; padding: 13px 0; font-size: 0.92rem; font-weight: 800; color: #fff; background: var(--color-primary); cursor: pointer; font-family: var(--font-sans); }
        .qa-note { font-size: 0.66rem; color: var(--color-ink-3); margin-top: 11px; line-height: 1.5; word-break: keep-all; text-align: center; }
      `}</style>
    </div>
  );
}
