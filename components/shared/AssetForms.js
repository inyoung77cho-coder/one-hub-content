// [폼 일원화] 자산별 입력 폼을 공용 컴포넌트로 추출 — 페이지(상세)와 빠른입력이 '동일한 양식'을 쓰도록.
//   각 폼은 자기 상태·저장·스타일을 포함(self-contained). onSaved(assetKey) 콜백으로 후처리(재조회 등).
import { useEffect, useState } from "react";
import { buyEtf, sellEtf, inferMarket, ACCOUNTS } from "../../lib/etfHoldings";
import { buyStock, STOCK_BROKERS } from "../../lib/stockHoldings";
import { getTrader } from "../../lib/trader";
import { validateStockInput, validateRealtyInput } from "../../lib/validateAsset";

function readOnb() { try { return JSON.parse(localStorage.getItem("onehub_onboard_assets") || "{}") || {}; } catch { return {}; } }
function writeOnb(n) { try { localStorage.setItem("onehub_onboard_assets", JSON.stringify(n)); } catch {} }
function broadcast() { try { window.dispatchEvent(new Event("onehub-assets-change")); } catch {} }

// 종목/단지 자동완성(백엔드 미배포 시 자유입력 폴백)
function useSuggest(kind, q) {
  const [opts, setOpts] = useState([]);
  useEffect(() => {
    const t = String(q || "").trim();
    if (t.length < 1) { setOpts([]); return; }
    const url = kind === "stock" ? `/api/input/stock-search?q=${encodeURIComponent(t)}`
      : kind === "etf" ? `/api/input/etf-search?q=${encodeURIComponent(t)}`
      : `/api/input/re-search?q=${encodeURIComponent(t)}`;
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

function AfStyles() {
  return (
    <style jsx global>{`
      .af { font-family: var(--font-sans); }
      .af-seg { display: flex; gap: 4px; background: var(--color-card-soft); border-radius: 10px; padding: 3px; margin-bottom: 10px; }
      .af-seg button { flex: 1; border: none; background: none; padding: 8px 0; border-radius: 8px; font-family: var(--font-sans); font-size: 0.8rem; font-weight: 700; color: var(--color-ink-2); cursor: pointer; }
      .af-seg button.on { background: var(--color-primary); color: #fff; }
      .af-seg button.on.sell { background: var(--color-danger); }
      .af-f { display: flex; flex-direction: column; gap: 5px; font-size: 0.7rem; color: var(--color-ink-3); font-weight: 700; margin-bottom: 11px; flex: 1; min-width: 0; }
      .af-f em { font-style: normal; font-size: 0.6rem; font-weight: 700; color: var(--color-primary); margin-left: 5px; }
      .af-f input, .af-f select { width: 100%; box-sizing: border-box; min-width: 0; border: 1px solid var(--color-line); background: var(--color-bg); border-radius: 10px; padding: 11px 12px; font-size: 0.9rem; font-family: var(--font-sans); color: var(--color-ink); }
      .af-f input:focus, .af-f select:focus { outline: none; border-color: var(--color-primary); }
      .af-row { display: flex; gap: 10px; }
      .af-calc { font-size: 0.74rem; color: var(--color-ink-2); background: var(--color-card-soft); border-radius: 9px; padding: 8px 11px; margin-bottom: 11px; }
      .af-calc b { color: var(--color-primary); font-weight: 800; }
      .af-calc span { color: var(--color-ink-3); font-size: 0.66rem; }
      .af-msg { font-size: 0.76rem; font-weight: 600; margin-bottom: 8px; }
      .af-msg.err { color: var(--color-danger); }
      .af-msg.ok { color: var(--color-success); }
      .af-save { width: 100%; margin-top: 2px; border: none; border-radius: 12px; padding: 13px 0; font-size: 0.92rem; font-weight: 800; color: #fff; background: var(--color-primary); cursor: pointer; font-family: var(--font-sans); }
      .af-save.sell { background: var(--color-danger); }
      .af-ac { position: relative; }
      .af-menu { position: absolute; top: 100%; left: 0; right: 0; z-index: 40; background: var(--color-card); border: 1px solid var(--color-line); border-radius: 10px; margin-top: 4px; max-height: 220px; overflow-y: auto; box-shadow: 0 8px 24px rgba(0,0,0,.12); }
      .af-opt { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 10px 12px; cursor: pointer; }
      .af-opt:hover { background: var(--color-primary-soft); }
      .af-opt-nm { font-size: 0.86rem; font-weight: 700; color: var(--color-ink); }
      .af-opt-meta { font-size: 0.72rem; color: var(--color-ink-3); font-variant-numeric: tabular-nums; white-space: nowrap; }
      .af-bound { margin-top: 6px; font-size: 0.74rem; color: var(--color-success); font-weight: 600; word-break: keep-all; }
      .af-bound b { font-weight: 800; }
      .af-link { align-self: flex-start; margin-top: 6px; border: none; background: none; padding: 0; color: var(--color-primary); font-size: 0.72rem; font-weight: 700; cursor: pointer; font-family: var(--font-sans); }
    `}</style>
  );
}

// ── 주식(비KIS 직접입력) ──────────────────────────────────────────
//   [S-3] 국내: 종목 마스터 자동완성 → 종목코드 자동 바인딩, 자유텍스트 저장 차단.
//   [S-1] 평단 검증: 현재가 대비 이상치 경고 + 저장 차단, 총 매수금액 실시간 표시, 단위=원.
function useMaster(q) {
  const [opts, setOpts] = useState([]);
  useEffect(() => {
    const t = String(q || "").trim();
    if (t.length < 1) { setOpts([]); return; }
    let alive = true;
    const id = setTimeout(() => {
      fetch(`/api/input/master-search?q=${encodeURIComponent(t)}`).then((r) => r.json())
        .then((d) => { if (alive) setOpts(Array.isArray(d?.results) ? d.results : []); })
        .catch(() => { if (alive) setOpts([]); });
    }, 180);
    return () => { alive = false; clearTimeout(id); };
  }, [q]);
  return opts;
}

export function StockForm({ onSaved, autofocusName = false }) {
  const [market, setMarket] = useState("kr");
  const [name, setName] = useState("");
  const [sel, setSel] = useState(null); // 국내: 마스터에서 확정된 {ticker,name,market,close_price}
  const [code, setCode] = useState(""); // 해외: 수기 코드
  const [shares, setShares] = useState("");
  const [price, setPrice] = useState("");
  const [broker, setBroker] = useState(STOCK_BROKERS[0]);
  const [account, setAccount] = useState("일반");
  const [buyDate, setBuyDate] = useState("");
  const [msg, setMsg] = useState("");
  const opts = useMaster(market === "kr" && !sel ? name : "");
  const isKR = market === "kr";
  const ccy = isKR ? "KRW" : "USD";

  const pick = (o) => { setSel(o); setName(`${o.name} (${o.ticker})`); setMsg(""); };
  const priceWarn = (() => {
    if (!isKR || !sel?.close_price || !(Number(price) > 0)) return "";
    const p = Number(price), c = Number(sel.close_price);
    if (p > c * 10) return `평단이 현재가 ${c.toLocaleString()}원의 10배를 초과합니다 — 총 매수금액을 넣으신 건 아닌가요?`;
    if (p < c / 10) return `평단이 현재가의 1/10 미만입니다 — 단위(원)를 확인하세요.`;
    return "";
  })();
  const total = Number(shares) > 0 && Number(price) > 0 ? Number(shares) * Number(price) : null;

  const save = () => {
    if (isKR && !sel) { setMsg("⚠️ 목록에서 종목을 선택하세요 (자유 입력은 저장할 수 없습니다)"); return; }
    // [G4] 입력 합리성 검증 — 단일 소스(lib/validateAsset). 수량·평단·현재가 대비 이상치 차단.
    const v = validateStockInput({ shares, price, closePrice: isKR ? sel?.close_price : null, ccy });
    if (!v.ok) { setMsg("⚠️ " + v.error); return; }
    const tr = getTrader();
    const res = buyStock({
      name: isKR ? sel.name : name, code: isKR ? sel.ticker : code,
      shares, avgPrice: price, ccy, broker, market, account, buyDate, trader: tr,
    });
    if (!res.ok) { setMsg("⚠️ " + res.error); return; }
    if (ccy === "KRW") {
      const addUk = (Number(shares) * Number(price)) / 1e8;
      const onb = readOnb(); onb.stock_uk = Number(((Number(onb.stock_uk) || 0) + addUk).toFixed(4)); writeOnb(onb);
    }
    broadcast();
    setMsg(""); setName(""); setSel(null); setCode(""); setShares(""); setPrice(""); setBuyDate("");
    if (onSaved) onSaved("stock");
  };

  return (
    <div className="af"><AfStyles />
      <div className="af-seg" role="group" aria-label="국내/해외">
        {[["kr", "🇰🇷 국내"], ["us", "🇺🇸 해외"]].map(([v, l]) => (
          <button key={v} type="button" className={market === v ? "on" : ""} onClick={() => { setMarket(v); setSel(null); setName(""); setCode(""); }}>{l}</button>
        ))}
      </div>
      {isKR ? (
        <div className="af-f af-ac"><span>종목명 · 코드 · 초성<em>자동완성</em></span>
          <input value={name} autoFocus={autofocusName} autoComplete="off"
            onChange={(e) => { setSel(null); setName(e.target.value); }}
            placeholder="삼성전자 / 005930 / ㅅㅅㅈㅈ" />
          {opts.length > 0 && !sel && (
            <div className="af-menu">
              {opts.map((o) => (
                <div className="af-opt" key={o.ticker} onMouseDown={() => pick(o)}>
                  <span className="af-opt-nm">{o.name}</span>
                  <span className="af-opt-meta">{o.ticker} · {o.market}</span>
                </div>
              ))}
            </div>
          )}
          {sel && <div className="af-bound">✓ {sel.name} <b>({sel.ticker})</b> · {sel.market}{sel.close_price ? ` · 현재가 ${Number(sel.close_price).toLocaleString()}원` : ''}</div>}
        </div>
      ) : (
        <div className="af-row">
          <label className="af-f"><span>종목명</span><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Apple" /></label>
          <label className="af-f"><span>티커</span><input value={code} onChange={(e) => setCode(e.target.value)} placeholder="AAPL" /></label>
        </div>
      )}
      <div className="af-row">
        <label className="af-f"><span>수량(주)</span><input type="number" inputMode="numeric" value={shares} onChange={(e) => setShares(e.target.value)} placeholder="10" /></label>
        <label className="af-f"><span>평단가 ({isKR ? "원" : "$"})</span><input type="number" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder={isKR ? "70000" : "180"} /></label>
      </div>
      <div className="af-row">
        <label className="af-f"><span>증권사</span>
          <select value={broker} onChange={(e) => setBroker(e.target.value)}>{STOCK_BROKERS.map((b) => <option key={b} value={b}>{b}</option>)}</select></label>
        <label className="af-f"><span>계좌</span>
          <select value={account} onChange={(e) => setAccount(e.target.value)}>{ACCOUNTS.map((a) => <option key={a} value={a}>{a}</option>)}</select></label>
      </div>
      <label className="af-f"><span>매수일<em>성과비교용</em></span><input type="date" value={buyDate} onChange={(e) => setBuyDate(e.target.value)} /></label>
      {total != null && (
        <div className="af-calc">총 매수금액 <b>{isKR ? `${total.toLocaleString()}원` : `$${total.toLocaleString()}`}</b> <span>(수량 × 평단, 검산용)</span></div>
      )}
      {priceWarn && <div className="af-msg err">⚠ {priceWarn}</div>}
      {msg && <div className="af-msg err">{msg}</div>}
      <button className="af-save" onClick={save}>＋ 주식 보유 기록</button>
    </div>
  );
}

// ── ETF ───────────────────────────────────────────────────────────
function useEtfMaster(q) {
  const [opts, setOpts] = useState([]);
  useEffect(() => {
    const t = String(q || "").trim();
    if (t.length < 1) { setOpts([]); return; }
    let alive = true;
    const id = setTimeout(() => {
      fetch(`/api/input/etf-search?q=${encodeURIComponent(t)}`).then((r) => r.json())
        .then((d) => { if (alive) setOpts(Array.isArray(d?.results) ? d.results : []); })
        .catch(() => { if (alive) setOpts([]); });
    }, 180);
    return () => { alive = false; clearTimeout(id); };
  }, [q]);
  return opts;
}

export function EtfForm({ onSaved }) {
  const [side, setSide] = useState("buy");
  const [market, setMarket] = useState("auto");
  const [ticker, setTicker] = useState("");
  const [etfSel, setEtfSel] = useState(null); // [E-3] 마스터에서 확정된 ETF
  const etfOpts = useEtfMaster(etfSel ? "" : ticker);
  const [shares, setShares] = useState("");
  const [price, setPrice] = useState("");
  const [ccy, setCcy] = useState("USD");
  const [account, setAccount] = useState("일반");
  const [broker, setBroker] = useState(STOCK_BROKERS[0]);
  const [buyDate, setBuyDate] = useState("");
  const [msg, setMsg] = useState("");

  const save = () => {
    const tr = getTrader();
    const mkt = market === "kr" || market === "us" ? market : inferMarket(ticker);
    const res = side === "buy"
      ? buyEtf({ ticker, market: mkt, shares, avgPrice: price, avgCcy: ccy, account, broker, buyDate, trader: tr })
      : sellEtf({ ticker, shares, account, trader: tr });
    if (!res?.ok) { setMsg("⚠️ " + (res?.error || "입력 오류")); return; }
    if (side === "buy" && ccy === "KRW") {
      const addUk = (Number(price) * Number(shares)) / 1e8;
      const onb = readOnb(); onb.etf_uk = Number(((Number(onb.etf_uk) || 0) + addUk).toFixed(4)); writeOnb(onb);
    }
    broadcast();
    setMsg(""); setTicker(""); setEtfSel(null); setShares(""); setPrice(""); setBuyDate("");
    if (onSaved) onSaved("etf");
  };

  return (
    <div className="af"><AfStyles />
      <div className="af-seg" role="group" aria-label="매수/매도">
        <button type="button" className={side === "buy" ? "on" : ""} onClick={() => { setSide("buy"); setMsg(""); }}>매수</button>
        <button type="button" className={side === "sell" ? "on sell" : ""} onClick={() => { setSide("sell"); setMsg(""); }}>매도</button>
      </div>
      {side === "buy" && (
        <div className="af-seg" role="group" aria-label="국내/해외">
          {[["auto", "자동"], ["kr", "🇰🇷 국내"], ["us", "🇺🇸 해외"]].map(([v, l]) => (
            <button key={v} type="button" className={market === v ? "on" : ""} onClick={() => { setMarket(v); if (v === "kr") setCcy("KRW"); else if (v === "us") setCcy("USD"); }}>{l}</button>
          ))}
        </div>
      )}
      <div className="af-f af-ac"><span>ETF 검색 · 티커<em>자동완성</em></span>
        <input value={ticker} autoComplete="off"
          onChange={(e) => { setEtfSel(null); setTicker(e.target.value); }}
          placeholder="KODEX 200 / 069500 / ㅋㄷㅅ / SCHD" />
        {etfOpts.length > 0 && !etfSel && (
          <div className="af-menu">
            {etfOpts.map((o) => (
              <div className="af-opt" key={o.ticker} onMouseDown={() => { setEtfSel(o); setTicker(o.ticker); }}>
                <span className="af-opt-nm">{o.name}</span>
                <span className="af-opt-meta">{o.ticker} · {o.market}{o.fx_hedged === 'H' ? ' · 환헤지' : ''}</span>
              </div>
            ))}
          </div>
        )}
        {etfSel && <div className="af-bound">✓ {etfSel.name} <b>({etfSel.ticker})</b> · {etfSel.market}{etfSel.tax_type ? ` · ${etfSel.tax_type === 'KR_DOMESTIC' ? '국내주식형' : etfSel.tax_type === 'KR_LISTED_OVERSEAS' ? '국내상장 해외/기타' : '해외상장'}` : ''}</div>}
      </div>
      <div className="af-row">
        <label className="af-f"><span>수량</span><input type="number" inputMode="decimal" value={shares} onChange={(e) => setShares(e.target.value)} placeholder="10" /></label>
        <label className="af-f"><span>계좌</span>
          <select value={account} onChange={(e) => setAccount(e.target.value)}>{ACCOUNTS.map((a) => <option key={a} value={a}>{a}</option>)}</select></label>
      </div>
      {side === "buy" && (
        <>
          <div className="af-row">
            <label className="af-f"><span>평단</span><input type="number" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="78" /></label>
            <label className="af-f"><span>통화</span>
              <select value={ccy} onChange={(e) => setCcy(e.target.value)}><option value="USD">USD</option><option value="KRW">KRW</option></select></label>
          </div>
          <div className="af-row">
            <label className="af-f"><span>증권사<em>연금·ISA 구분</em></span>
              <select value={broker} onChange={(e) => setBroker(e.target.value)}>{STOCK_BROKERS.map((b) => <option key={b} value={b}>{b}</option>)}</select></label>
            <label className="af-f"><span>매수일<em>성과비교용</em></span><input type="date" value={buyDate} onChange={(e) => setBuyDate(e.target.value)} /></label>
          </div>
        </>
      )}
      {msg && <div className="af-msg err">{msg}</div>}
      <button className={`af-save ${side === "sell" ? "sell" : ""}`} onClick={save}>{side === "buy" ? "＋ 매수 기록" : "－ 매도 기록"}</button>
    </div>
  );
}

// ── 부동산 ─────────────────────────────────────────────────────────
//   nameOptions/getAreaOptions가 주어지면(페이지) 실거래 DB 드롭다운, 없으면(빠른입력) 자동완성 입력.
//   동일 컴포넌트라 페이지·빠른입력이 항상 같은 양식.
export function ReForm({ onSaved, initial = null, nameOptions = [], getAreaOptions, saveLabel = "＋ 내 단지 저장" }) {
  const [name, setName] = useState(initial?.name || "");
  const [pyeong, setPyeong] = useState(initial?.pyeong || "");
  const [dongfloor, setDongfloor] = useState(initial?.dongfloor || "");
  const [buyUk, setBuyUk] = useState(initial?.buyUk || "");
  const [buyMonth, setBuyMonth] = useState(initial?.buyMonth || "");
  const [msg, setMsg] = useState("");
  const [manualName, setManualName] = useState(false); // [E7] '목록에 없어요' 직접 입력 탈출구
  const suggest = useSuggest("realestate", name);
  const areaOpts = typeof getAreaOptions === "function" ? (getAreaOptions(name) || []) : [];
  const useNameSelect = Array.isArray(nameOptions) && nameOptions.length > 0 && !manualName;

  const save = () => {
    const nm = String(name || "").trim();
    // [G4] 입력 합리성 검증 — 매수가(억) 단위 오입력 방어(예: 15.2를 1520으로 입력 → 평가손익 오류).
    const v = validateRealtyInput({ name: nm, buyUk, pyeong });
    if (!v.ok) { setMsg(v.error); return; }
    if (v.warn && typeof window !== "undefined" && !window.confirm(v.warn)) { setMsg(v.warn); return; }
    const obj = { name: nm, pyeong, dongfloor, buyUk, buyMonth };
    try { localStorage.setItem("onehub_re_my_property", JSON.stringify(obj)); localStorage.setItem("onehub_re_my", nm); } catch {}
    const uk = Number(buyUk) || 0;
    const onb = readOnb(); if (uk > 0) onb.realestate_uk = uk; writeOnb(onb);
    broadcast();
    setMsg("");
    if (onSaved) onSaved("realestate", obj);
  };

  return (
    <div className="af"><AfStyles />
      <label className="af-f"><span>단지명<em>{useNameSelect ? "실거래 DB" : "직접 입력"}</em></span>
        {useNameSelect ? (
          <>
            <select value={name} onChange={(e) => {
              if (e.target.value === "__manual__") { setManualName(true); setName(""); setPyeong(""); return; }
              setName(e.target.value); setPyeong("");
            }}>
              <option value="">단지 선택</option>
              {nameOptions.map((o) => <option key={o} value={o}>{o}</option>)}
              <option value="__manual__">＋ 목록에 없어요 · 직접 입력</option>
            </select>
          </>
        ) : (
          <>
            <input list="af-re-suggest" value={name} onChange={(e) => setName(e.target.value)} placeholder="단지명 입력·선택" autoFocus={manualName} />
            <datalist id="af-re-suggest">{suggest.map((o) => <option key={o} value={o} />)}</datalist>
            {Array.isArray(nameOptions) && nameOptions.length > 0 && (
              <button type="button" className="af-link" onClick={() => { setManualName(false); setName(""); setPyeong(""); }}>← 실거래 DB 목록에서 선택</button>
            )}
          </>
        )}
      </label>
      <div className="af-row">
        <label className="af-f"><span>평형<em>{areaOpts.length ? "실거래 DB" : "직접입력"}</em></span>
          {areaOpts.length ? (
            <select value={pyeong} onChange={(e) => setPyeong(e.target.value)}>
              <option value="">평형 선택</option>
              {areaOpts.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
            </select>
          ) : (
            <input type="number" inputMode="numeric" value={pyeong} onChange={(e) => setPyeong(e.target.value)} placeholder="전용㎡ 또는 평" />
          )}
        </label>
        <label className="af-f"><span>동·층<em>선택</em></span><input value={dongfloor} onChange={(e) => setDongfloor(e.target.value)} placeholder="예: 101동 12층" /></label>
      </div>
      <div className="af-row">
        <label className="af-f"><span>매수가(억)</span><input type="number" inputMode="decimal" value={buyUk} onChange={(e) => setBuyUk(e.target.value)} placeholder="예: 15.2" /></label>
        <label className="af-f"><span>매수 시점</span><input type="month" value={buyMonth} onChange={(e) => setBuyMonth(e.target.value)} /></label>
      </div>
      {msg && <div className="af-msg err">{msg}</div>}
      <button className="af-save" onClick={save} disabled={!String(name || "").trim()}>{saveLabel}</button>
    </div>
  );
}
