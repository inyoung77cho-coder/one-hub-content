// [내 ETF] 사용자가 직접 입력한 ETF 매수/매도를 관리하는 클라이언트 원장.
//   백엔드(5003) 포지션과 별개로, 신규 매수/매도를 즉시 반영하고 시세를 자동 갱신한다.
//   저장(localStorage onehub_etf_holdings): [{ id, ticker, market, shares, avgPrice, avgCcy, ts, trader }]
//   - 매수: 같은 티커면 수량 합산 + 평단가 가중평균 / 신규면 추가
//   - 매도: 수량 차감(0이면 제거)

const KEY = "onehub_etf_holdings";

function read() {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; }
}
function write(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch {}
}

export function getHoldings(trader = "A") {
  return read().filter((h) => (h.trader || "A") === trader);
}

// 시장 접미사 자동 판단(숫자코드=kr, 그 외=us). 명시값 우선.
export function inferMarket(ticker, market) {
  if (market === "us" || market === "kr") return market;
  return /^\d+$/.test(String(ticker).trim()) ? "kr" : "us";
}

// [S4] 계좌 유형 — 세제가 다름(일반/연금/ISA). 세금 계산·표기 분기의 기준.
export const ACCOUNTS = ["일반", "연금", "ISA"];

// 매수 기록. avgPrice는 매수 단가(통화 avgCcy). 같은 티커+통화+계좌면 가중평균.
export function buyEtf({ ticker, market, shares, avgPrice, avgCcy = "USD", account = "일반", trader = "A" }) {
  const tk = String(ticker || "").trim().toUpperCase();
  const qty = Number(shares);
  const px = Number(avgPrice);
  const acct = ACCOUNTS.includes(account) ? account : "일반";
  if (!tk || !(qty > 0) || !(px > 0)) return { ok: false, error: "티커·수량·단가를 정확히 입력하세요." };
  const mkt = inferMarket(tk, market);
  const list = read();
  const idx = list.findIndex((h) => h.ticker === tk && (h.trader || "A") === trader && h.avgCcy === avgCcy && (h.account || "일반") === acct);
  if (idx >= 0) {
    const cur = list[idx];
    const totalShares = cur.shares + qty;
    cur.avgPrice = Math.round(((cur.avgPrice * cur.shares + px * qty) / totalShares) * 1e4) / 1e4;
    cur.shares = Math.round(totalShares * 1e6) / 1e6;
    cur.market = mkt;
  } else {
    list.push({ id: `${tk}-${avgCcy}-${acct}-${trader}`, ticker: tk, market: mkt, shares: qty, avgPrice: px, avgCcy, account: acct, ts: Date.now(), trader });
  }
  write(list);
  return { ok: true };
}

// 매도 기록. 보유 수량에서 차감(계좌 지정 시 해당 계좌 우선). 초과 매도는 0으로 정리.
export function sellEtf({ ticker, shares, account, trader = "A" }) {
  const tk = String(ticker || "").trim().toUpperCase();
  const qty = Number(shares);
  if (!tk || !(qty > 0)) return { ok: false, error: "티커·수량을 정확히 입력하세요." };
  let list = read();
  const holds = list.filter((h) => h.ticker === tk && (h.trader || "A") === trader
    && (!account || (h.account || "일반") === account));
  if (!holds.length) return { ok: false, error: "보유 중이 아닌 종목입니다." };
  let remain = qty;
  for (const h of holds) {
    if (remain <= 0) break;
    const cut = Math.min(h.shares, remain);
    h.shares = Math.round((h.shares - cut) * 1e6) / 1e6;
    remain -= cut;
  }
  list = list.filter((h) => h.shares > 0);
  write(list);
  return { ok: true, sold: qty - remain, short: remain };
}

// 티커 전량 삭제(계좌 지정 시 해당 계좌만)
export function removeEtf({ ticker, account, trader = "A" }) {
  const tk = String(ticker || "").trim().toUpperCase();
  write(read().filter((h) => !(h.ticker === tk && (h.trader || "A") === trader
    && (!account || (h.account || "일반") === account))));
  return { ok: true };
}

// ── 등록 ETF(백엔드 포지션) 수량 보관 ──
//   백엔드가 수량을 안 내려줄 때, 사용자가 입력한 수량으로 실측 종가 기반 평가액을 재계산한다.
const QKEY = "onehub_etf_pos_qty";
function readQ() {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(QKEY) || "{}"); } catch { return {}; }
}
export function getPosQtyMap(trader = "A") {
  const m = readQ();
  const out = {};
  Object.keys(m).forEach((k) => { if (k.startsWith(`${trader}:`)) out[k.slice(trader.length + 1)] = m[k]; });
  return out;
}
export function setPosQty(ticker, qty, trader = "A") {
  const tk = String(ticker || "").trim().toUpperCase();
  if (!tk) return;
  const m = readQ();
  const k = `${trader}:${tk}`;
  const n = Number(qty);
  if (n > 0) m[k] = n; else delete m[k];
  try { localStorage.setItem(QKEY, JSON.stringify(m)); } catch {}
}
