// [S3] 전역 빠른입력 시트 — 4자산(주식/ETF/부동산/현금) 통합 폼.
//   [폼 일원화] 주식/ETF/부동산은 공용 AssetForms(페이지와 동일 양식)를 그대로 사용해
//   빠른입력과 상세 페이지의 입력 양식이 어긋나지 않게 한다. 현금만 간단 인라인.
import { useState } from "react";
import { StockForm, EtfForm, ReForm } from "./AssetForms";

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

        <div className="qa-note">저장 즉시 총자산·해당 자산군 카드에 반영됩니다(낙관적 갱신). 상세는 각 페이지에서 이어서 편집할 수 있습니다.</div>
      </div>
      <style jsx>{`
        .qa-scrim { position: fixed; inset: 0; background: rgba(0,0,0,0.45); z-index: 300; display: flex; align-items: flex-end; justify-content: center; }
        .qa { width: 100%; max-width: 480px; background: var(--color-card); border-radius: 20px 20px 0 0; padding: 20px 18px calc(env(safe-area-inset-bottom, 0px) + 20px); box-shadow: var(--shadow-float); font-family: var(--font-sans); color: var(--color-ink); max-height: 90vh; overflow-y: auto; }
        .qa-h { display: flex; align-items: center; justify-content: space-between; font-size: 1rem; font-weight: 800; margin-bottom: 14px; }
        .qa-x { border: none; background: var(--color-card-soft); color: var(--color-ink-2); width: 30px; height: 30px; border-radius: 50%; font-size: 0.9rem; cursor: pointer; }
        .qa-chips { display: flex; gap: 6px; margin-bottom: 14px; }
        .qa-chip { flex: 1; border: 1px solid var(--color-line); background: var(--color-card); color: var(--color-ink-2); border-radius: 10px; padding: 9px 0; font-size: 0.82rem; font-weight: 700; font-family: var(--font-sans); cursor: pointer; }
        .qa-chip.on { color: #fff; }
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
