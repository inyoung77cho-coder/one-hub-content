// [주식 직접입력] KIS 연동 외 증권사(미래에셋·삼성·키움 등) 보유 주식을 관리하는 클라이언트 원장.
//   백엔드(KIS) 보유와 별개로, 사용자가 직접 입력한 종목을 저장/표시한다.
//   저장(localStorage onehub_stock_holdings): [{ id, name, code, shares, avgPrice, ccy, broker, market, account, ts, trader }]
import { ACCOUNTS, inferMarket } from "./etfHoldings";

const KEY = "onehub_stock_holdings";
// 증권사 목록(자유 선택) — KIS 외 보유를 구분해 기록
export const STOCK_BROKERS = ["미래에셋", "삼성", "KB", "키움", "NH투자", "한국투자", "신한", "토스", "기타"];

function read() {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; }
}
function write(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch {}
}

export function getStockHoldings(trader = "A") {
  return read().filter((h) => (h.trader || "A") === trader);
}

// 매수 기록(가중평균). 국내=원, 해외=USD. market 미지정 시 코드로 추론(숫자=국내).
export function buyStock({ name, code, shares, avgPrice, ccy = "KRW", broker = "기타", market, account = "일반", trader = "A" }) {
  const nm = String(name || "").trim();
  const cd = String(code || "").trim().toUpperCase();
  const qty = Number(shares);
  const px = Number(avgPrice);
  const acct = ACCOUNTS.includes(account) ? account : "일반";
  const mkt = market === "kr" || market === "us" ? market : inferMarket(cd || nm);
  if (!nm || !(qty > 0) || !(px > 0)) return { ok: false, error: "종목명·수량·평단을 정확히 입력하세요." };
  const list = read();
  const idx = list.findIndex((h) => (h.trader || "A") === trader && h.name === nm && (h.account || "일반") === acct && (h.ccy || "KRW") === ccy);
  if (idx >= 0) {
    const cur = list[idx];
    const total = cur.shares + qty;
    cur.avgPrice = Math.round(((cur.avgPrice * cur.shares + px * qty) / total) * 1e2) / 1e2;
    cur.shares = Math.round(total * 1e6) / 1e6;
    cur.code = cd || cur.code; cur.broker = broker || cur.broker; cur.market = mkt;
  } else {
    list.push({ id: `${nm}-${acct}-${ccy}-${trader}-${ts()}`, name: nm, code: cd, shares: qty, avgPrice: px, ccy, broker, market: mkt, account: acct, ts: Date.now(), trader });
  }
  write(list);
  return { ok: true };
}

function ts() { try { return Date.now(); } catch { return 0; } }

export function removeStock({ id, trader = "A" }) {
  write(read().filter((h) => !(h.id === id && (h.trader || "A") === trader)));
  return { ok: true };
}

// 보유 평가액 합계(원). 해외(USD)는 fxRate로 환산. fx 없으면 해외분 제외.
export function stockHoldingsValueKrw(trader = "A", fxRate = null) {
  return getStockHoldings(trader).reduce((sum, h) => {
    const v = h.ccy === "USD" ? (fxRate ? h.avgPrice * h.shares * fxRate : 0) : h.avgPrice * h.shares;
    return sum + v;
  }, 0);
}
