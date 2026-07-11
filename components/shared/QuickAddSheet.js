// [S3] 전역 빠른입력 시트 — 4자산(주식/ETF/부동산/현금) 통합 폼(단일 컴포넌트).
//   자산군별 최소 필드만. 저장은 실제 스토어(온보딩 합계·ETF 보유·부동산 단지)에 쓰고
//   낙관적 갱신 이벤트(onehub-assets-change)를 브로드캐스트해 총자산·카드가 즉시 반영된다.
//   자동완성은 /api/search/* 를 쓰되 미배포 시 자유입력으로 폴백(코드 암기 불필요).
import { useEffect, useState } from "react";
import { buyEtf, inferMarket, ACCOUNTS } from "../../lib/etfHoldings";
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

// 자동완성 — 백엔드 읽기 엔드포인트(미배포 시 빈 배열 폴백)
function useSuggest(kind, q) {
  const [opts, setOpts] = useState([]);
  useEffect(() => {
    const t = String(q || "").trim();
    if (t.length < 1) { setOpts([]); return; }
    const url = kind === "stock" ? `/api/search/stock?q=${encodeURIComponent(t)}`
      : kind === "etf" ? `/api/search/etf?q=${encodeURIComponent(t)}`
      : `/api/re/search-complex?q=${encodeURIComponent(t)}`;
    let alive = true;
    fetch(url).then((r) => r.json()).then((d) => {
      if (!alive) return;
      const list = Array.isArray(d) ? d : (d?.items || d?.results || []);
      setOpts(list.map((x) => (typeof x === "string" ? x : x.name || x.단지명 || x.ticker || x.code)).filter(Boolean).slice(0, 8));
    }).catch(() => { if (alive) setOpts([]); });
    return () => { alive = false; };
  }, [kind, q]);
  return opts;
}

export default function QuickAddSheet({ initialAsset = "stock", onClose, onSaved }) {
  const [asset, setAsset] = useState(initialAsset);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");   // 억(주식/현금/부동산 평가·매수가)
  const [shares, setShares] = useState("");    // ETF 수량
  const [price, setPrice] = useState("");      // ETF 평단
  const [ccy, setCcy] = useState("USD");
  const [account, setAccount] = useState("일반");
  const [pyeong, setPyeong] = useState("");
  const [buyMonth, setBuyMonth] = useState("");
  const [msg, setMsg] = useState("");

  const suggest = useSuggest(asset === "cash" ? "stock" : asset, name);

  const save = () => {
    const tr = getTrader();
    if (asset === "cash") {
      const amt = Number(amount);
      if (!(amt >= 0) || amount === "") { setMsg("금액을 입력하세요"); return; }
      const onb = readOnb(); onb.cash_uk = amt; writeOnb(onb); broadcast();
    } else if (asset === "stock") {
      // 정확 입력: 종목 + 수량 + 평단(원) → 평가액 = 수량×평단(억 환산). 국내주식 원화 기준.
      const q = Number(shares), px = Number(price);
      if (!(q > 0) || !(px > 0)) { setMsg("수량과 평단(원)을 입력하세요"); return; }
      const amtUk = (q * px) / 1e8;
      const onb = readOnb(); onb.stock_uk = Number((amtUk).toFixed(4)); writeOnb(onb);
      try {
        if (name.trim()) localStorage.setItem("onehub_stock_last", name.trim());
        // 최근 수동 종목 1건 기록(참고용)
        localStorage.setItem("onehub_stock_manual", JSON.stringify({ name: name.trim(), shares: q, price: px, at: new Date().toISOString().slice(0,10) }));
      } catch (e) {}
      broadcast();
    } else if (asset === "etf") {
      const tk = String(name || "").trim().toUpperCase();
      if (!tk) { setMsg("티커를 입력하세요"); return; }
      const res = buyEtf({ ticker: tk, market: inferMarket(tk), shares, avgPrice: price, avgCcy: ccy, account, trader: tr });
      if (!res?.ok) { setMsg("⚠️ " + (res?.error || "입력 오류(수량·평단 확인)")); return; }
      // 총자산 합계에도 대략 반영(평단×수량, KRW 근사) — 확정은 ETF 페이지 실측
      const approxUk = ccy === "KRW" ? (Number(price) * Number(shares)) / 1e8 : null;
      if (approxUk != null) { const onb = readOnb(); onb.etf_uk = Number(onb.etf_uk || 0) + approxUk; writeOnb(onb); }
      broadcast();
    } else if (asset === "realestate") {
      const nm = String(name || "").trim();
      if (!nm) { setMsg("단지명을 입력하세요"); return; }
      const buyUk = Number(amount) || 0;
      const obj = { name: nm, pyeong, dongfloor: "", buyUk: amount, buyMonth };
      try { localStorage.setItem("onehub_re_my_property", JSON.stringify(obj)); localStorage.setItem("onehub_re_my", nm); } catch (e) {}
      const onb = readOnb(); if (buyUk > 0) onb.realestate_uk = buyUk; writeOnb(onb); broadcast();
    }
    if (onSaved) onSaved(asset);
    if (onClose) onClose();
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

        {(asset === "stock" || asset === "etf" || asset === "realestate") && (
          <label className="qa-f"><span>{asset === "etf" ? "티커" : asset === "realestate" ? "단지명" : "종목명"}<em>자동완성</em></span>
            <input list="qa-suggest" value={name} onChange={(e) => setName(e.target.value)} placeholder={asset === "etf" ? "SCHD / 069500" : asset === "realestate" ? "단지명 입력·선택" : "종목명 입력·선택"} />
            <datalist id="qa-suggest">{suggest.map((o) => <option key={o} value={o} />)}</datalist>
          </label>
        )}

        {asset === "etf" ? (
          <>
            <div className="qa-row">
              <label className="qa-f"><span>수량</span><input type="number" inputMode="decimal" value={shares} onChange={(e) => setShares(e.target.value)} placeholder="10" /></label>
              <label className="qa-f"><span>평단</span><input type="number" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="78" /></label>
            </div>
            <div className="qa-row">
              <label className="qa-f"><span>통화</span>
                <select value={ccy} onChange={(e) => setCcy(e.target.value)}><option value="USD">USD</option><option value="KRW">KRW</option></select></label>
              <label className="qa-f"><span>계좌</span>
                <select value={account} onChange={(e) => setAccount(e.target.value)}>{ACCOUNTS.map((a) => <option key={a} value={a}>{a}</option>)}</select></label>
            </div>
          </>
        ) : asset === "stock" ? (
          <>
            <div className="qa-row">
              <label className="qa-f"><span>수량(주)</span><input type="number" inputMode="numeric" value={shares} onChange={(e) => setShares(e.target.value)} placeholder="10" /></label>
              <label className="qa-f"><span>평단(원)</span><input type="number" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="70000" /></label>
            </div>
            {Number(shares) > 0 && Number(price) > 0 && (
              <div className="qa-calc">평가액 ≈ <b>{((Number(shares) * Number(price)) / 1e8).toFixed(2)}억</b> <span>(수량 × 평단)</span></div>
            )}
          </>
        ) : asset === "realestate" ? (
          <div className="qa-row">
            <label className="qa-f"><span>평형(평)</span><input type="number" inputMode="numeric" value={pyeong} onChange={(e) => setPyeong(e.target.value)} placeholder="34" /></label>
            <label className="qa-f"><span>매수 시점</span><input type="month" value={buyMonth} onChange={(e) => setBuyMonth(e.target.value)} /></label>
          </div>
        ) : null}

        {(asset === "cash" || asset === "realestate") && (
          <label className="qa-f"><span>{asset === "cash" ? "금액(억)" : "매수가(억)"}</span>
            <input type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="예: 1.5" /></label>
        )}

        {msg && <div className="qa-msg">{msg}</div>}
        <button className="qa-save" onClick={save}>저장 · 즉시 반영</button>
        <div className="qa-note">저장 즉시 총자산·해당 자산군 카드에 반영됩니다(낙관적 갱신). ETF·부동산 상세는 각 페이지에서 이어서 편집할 수 있습니다.</div>
      </div>
      <style jsx>{`
        .qa-scrim { position: fixed; inset: 0; background: rgba(0,0,0,0.45); z-index: 300; display: flex; align-items: flex-end; justify-content: center; }
        .qa { width: 100%; max-width: 480px; background: var(--color-card); border-radius: 20px 20px 0 0; padding: 20px 18px calc(env(safe-area-inset-bottom, 0px) + 20px); box-shadow: var(--shadow-float); font-family: var(--font-sans); color: var(--color-ink); }
        .qa-h { display: flex; align-items: center; justify-content: space-between; font-size: 1rem; font-weight: 800; margin-bottom: 14px; }
        .qa-x { border: none; background: var(--color-card-soft); color: var(--color-ink-2); width: 30px; height: 30px; border-radius: 50%; font-size: 0.9rem; cursor: pointer; }
        .qa-chips { display: flex; gap: 6px; margin-bottom: 14px; }
        .qa-chip { flex: 1; border: 1px solid var(--color-line); background: var(--color-card); color: var(--color-ink-2); border-radius: 10px; padding: 9px 0; font-size: 0.82rem; font-weight: 700; font-family: var(--font-sans); cursor: pointer; }
        .qa-chip.on { color: #fff; }
        .qa-f { display: flex; flex-direction: column; gap: 5px; font-size: 0.7rem; color: var(--color-ink-3); font-weight: 700; margin-bottom: 11px; flex: 1; }
        .qa-f em { font-style: normal; font-size: 0.6rem; font-weight: 700; color: var(--color-primary); margin-left: 5px; }
        .qa-f input, .qa-f select { border: 1px solid var(--color-line); background: var(--color-bg); border-radius: 10px; padding: 11px 12px; font-size: 0.9rem; font-family: var(--font-sans); color: var(--color-ink); }
        .qa-f input:focus, .qa-f select:focus { outline: none; border-color: var(--color-primary); }
        .qa-row { display: flex; gap: 10px; }
        .qa-calc { font-size: 0.74rem; color: var(--color-ink-2); background: var(--color-card-soft); border-radius: 9px; padding: 8px 11px; margin-bottom: 11px; }
        .qa-calc b { color: var(--color-primary); font-weight: 800; }
        .qa-calc span { color: var(--color-ink-3); font-size: 0.66rem; }
        .qa-msg { font-size: 0.76rem; color: var(--color-danger); font-weight: 600; margin-bottom: 8px; }
        .qa-save { width: 100%; margin-top: 4px; border: none; border-radius: 12px; padding: 13px 0; font-size: 0.92rem; font-weight: 800; color: #fff; background: var(--color-primary); cursor: pointer; font-family: var(--font-sans); }
        .qa-note { font-size: 0.66rem; color: var(--color-ink-3); margin-top: 11px; line-height: 1.5; word-break: keep-all; text-align: center; }
      `}</style>
    </div>
  );
}
