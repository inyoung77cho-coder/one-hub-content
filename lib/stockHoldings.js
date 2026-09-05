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
//   priceBasis: 'manual'(사용자가 평단 입력) | 'current'(평단 미입력 → 현재가로 자동 계산).
//   'current'는 실제 매수단가가 아니라 입력시점 현재가이므로 화면에서 '현재가 기준'으로 정직하게 표시한다.
export function buyStock({ name, code, shares, avgPrice, ccy = "KRW", broker = "기타", market, account = "일반", buyDate = "", trader = "A", priceBasis = "manual" }) {
  const nm = String(name || "").trim();
  const cd = String(code || "").trim().toUpperCase();
  const qty = Number(shares);
  const px = Number(avgPrice);
  const acct = ACCOUNTS.includes(account) ? account : "일반";
  const mkt = market === "kr" || market === "us" ? market : inferMarket(cd || nm);
  if (!nm || !(qty > 0) || !(px > 0)) return { ok: false, error: "종목명·수량을 정확히 입력하세요(평단 미입력 시 종목을 목록에서 선택해 현재가를 불러오세요)." };
  // [G4] 원장 저장 규칙 — 국내(KRW)는 원 단위 정수, 해외(USD)만 소수 2자리 허용.
  //   가중평균 계산값이 소수점을 달고 원장에 남아 '1,920,209.34원' 같은 데이터 오류가 되는 것을 뿌리에서 차단.
  const roundPx = (v) => (ccy === "USD" ? Math.round(v * 1e2) / 1e2 : Math.round(v));
  const list = read();
  const idx = list.findIndex((h) => (h.trader || "A") === trader && h.name === nm && (h.account || "일반") === acct && (h.ccy || "KRW") === ccy);
  if (idx >= 0) {
    const cur = list[idx];
    const total = cur.shares + qty;
    cur.avgPrice = roundPx((cur.avgPrice * cur.shares + px * qty) / total);
    cur.shares = Math.round(total * 1e6) / 1e6;
    cur.code = cd || cur.code; cur.broker = broker || cur.broker; cur.market = mkt;
    // 실제 평단이 한 번이라도 섞이면 더는 '현재가 기준'이 아니다 → manual로 승격.
    cur.priceBasis = (cur.priceBasis === "current" && priceBasis === "current") ? "current" : "manual";
    if (buyDate && (!cur.buyDate || buyDate < cur.buyDate)) cur.buyDate = buyDate; // 가장 이른 매수일 보존
  } else {
    list.push({ id: `${nm}-${acct}-${ccy}-${trader}-${ts()}`, name: nm, code: cd, shares: qty, avgPrice: roundPx(px), ccy, broker, market: mkt, account: acct, buyDate: buyDate || "", ts: Date.now(), trader, priceBasis });
  }
  write(list);
  return { ok: true };
}

function ts() { try { return Date.now(); } catch { return 0; } }

// [N6] 이상 평단 확인 — 앱은 고치지 않는다. 사람에게 묻고, 답을 기록만 한다.
//   원본이 평단인지 총매입액인지는 입력한 사람만 안다. 자동 보정은 그 판단을 앱이 훔치는 짓이다.

// "이 값이 맞습니다" — 사용자가 확인함. 이후 총자산에 포함하고 다시 묻지 않는다.
export function verifyStockAvg({ id, trader = "A" }) {
  const list = read();
  const h = list.find((x) => x.id === id && (x.trader || "A") === trader);
  if (!h) return { ok: false, error: "종목을 찾을 수 없습니다." };
  h.verified = true;
  h.verifiedAt = Date.now();
  write(list);
  return { ok: true };
}

// "평단 수정" — 사용자가 직접 고친 값으로 대체(가중평균 재계산 아님. 사용자가 준 값이 곧 평단).
export function updateStockAvg({ id, avgPrice, trader = "A" }) {
  const px = Number(avgPrice);
  if (!(px > 0)) return { ok: false, error: "평단을 정확히 입력하세요." };
  const list = read();
  const h = list.find((x) => x.id === id && (x.trader || "A") === trader);
  if (!h) return { ok: false, error: "종목을 찾을 수 없습니다." };
  h.avgPrice = (h.ccy === "USD") ? Math.round(px * 1e2) / 1e2 : Math.round(px);
  h.verified = true; // 사람이 직접 고친 값 → 다시 묻지 않는다
  h.verifiedAt = Date.now();
  write(list);
  return { ok: true };
}

// [S30-3] 손절선·목표가 — 선택 입력. 앱이 자동으로 채우지 않는다(사용자가 버튼을 눌러야 들어간다).
//   같은 항목(onehub_stock_holdings)에 필드만 더한다(새 키 금지). SYNC_KEYS 로 기기 동기화 자동.
//   null 을 주면 해당 값 해제.
export function setStockRisk({ id, stopLoss, target, trader = "A" }) {
  const list = read();
  const h = list.find((x) => x.id === id && (x.trader || "A") === trader);
  if (!h) return { ok: false, error: "종목을 찾을 수 없습니다." };
  if (stopLoss !== undefined) {
    const v = Number(stopLoss);
    if (stopLoss === null || stopLoss === "") h.stopLoss = null;
    else if (v > 0) h.stopLoss = (h.ccy === "USD") ? Math.round(v * 1e2) / 1e2 : Math.round(v);
  }
  if (target !== undefined) {
    const v = Number(target);
    if (target === null || target === "") h.target = null;
    else if (v > 0) h.target = (h.ccy === "USD") ? Math.round(v * 1e2) / 1e2 : Math.round(v);
  }
  write(list);
  return { ok: true };
}

// [S30-3] '안 할래요' — 이 종목엔 손절선 제안을 다시 하지 않는다.
export function dismissStopHint({ id, trader = "A" }) {
  const list = read();
  const h = list.find((x) => x.id === id && (x.trader || "A") === trader);
  if (!h) return { ok: false, error: "종목을 찾을 수 없습니다." };
  h.stopHintDismissed = true;
  write(list);
  return { ok: true };
}

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
