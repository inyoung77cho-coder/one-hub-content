// [S24-3] 시세 온전성 가드(클라이언트 2차) — 직전 정상가 대비 급변(3배↑/⅓↓)이면 새 값을 채택하지 않고
//   직전 정상가를 유지하며 suspect 표시. 서버 .KQ 유령 방어(quote.js)에 더해, 어떤 소스가 튄 값을 줘도
//   총자산이 폭주하지 않게 한다. 액면분할·병합처럼 정당한 배수변화는 사용자가 '이 값이 맞습니다'로 통과.
//   저장: onehub_last_price = { TICKER: { price, ts } } · onehub_price_verified = { TICKER: true }.
const KEY = "onehub_last_price";
const VKEY = "onehub_price_verified";

function read(k) { if (typeof window === "undefined") return {}; try { return JSON.parse(localStorage.getItem(k) || "{}") || {}; } catch { return {}; } }
function write(k, o) { try { localStorage.setItem(k, JSON.stringify(o)); } catch (e) {} }

export function isPriceVerified(ticker) { return !!read(VKEY)[String(ticker || "").toUpperCase()]; }

// 사용자가 "이 값이 맞습니다"(분할 등) → 직전 정상가를 지우고 다음 값부터 그대로 채택.
export function verifyPrice(ticker) {
  const tk = String(ticker || "").toUpperCase();
  const v = read(VKEY); v[tk] = true; write(VKEY, v);
  const s = read(KEY); delete s[tk]; write(KEY, s); // 기준을 비워 다음 값이 새 기준이 됨
  if (typeof window !== "undefined") { try { window.dispatchEvent(new Event("onehub-assets-change")); } catch (e) {} }
}

// price(그 티커 통화 기준 원값)를 검사. { price, suspect, last?, incoming? }.
//   suspect 면 price 는 '직전 정상가'(없으면 null). 정상이면 최신 정상가를 갱신하고 그대로 반환.
export function guardPrice(ticker, price) {
  const tk = String(ticker || "").toUpperCase();
  const p = Number(price);
  if (!(p > 0)) return { price: null, suspect: false };
  if (isPriceVerified(tk)) { const s = read(KEY); s[tk] = { price: p, ts: Date.now() }; write(KEY, s); return { price: p, suspect: false }; }
  const store = read(KEY);
  const last = store[tk];
  if (last && last.price > 0) {
    const r = p / last.price;
    if (r > 3 || r < 1 / 3) {
      return { price: last.price, suspect: true, last: last.price, incoming: p };
    }
  }
  store[tk] = { price: p, ts: Date.now() };
  write(KEY, store);
  return { price: p, suspect: false };
}
