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

// [계좌 세분화] 레거시 "연금" 보유는 "개인연금(연금저축)"으로 승격(하위호환).
export function normalizeAccount(a) {
  if (a === "연금") return "개인연금";
  return ACCOUNTS.includes(a) ? a : "일반";
}

export function getHoldings(trader = "A") {
  return read()
    .filter((h) => (h.trader || "A") === trader)
    .map((h) => ({ ...h, account: normalizeAccount(h.account || "일반") }));
}

// 시장 접미사 자동 판단(숫자코드=kr, 그 외=us). 명시값 우선.
export function inferMarket(ticker, market) {
  if (market === "us" || market === "kr") return market;
  return /^\d+$/.test(String(ticker).trim()) ? "kr" : "us";
}

// [S4·계좌 세분화] 계좌 유형 — 세제·한도가 다름. 연금은 개인연금(연금저축)/퇴직연금(IRP)으로 분리.
export const ACCOUNTS = ["일반", "개인연금", "퇴직연금", "ISA"];

// 매수 기록. avgPrice는 매수 단가(통화 avgCcy). 같은 티커+통화+계좌+증권사면 가중평균.
export function buyEtf({ ticker, market, shares, avgPrice, avgCcy = "USD", account = "일반", broker = "", buyDate = "", trader = "A" }) {
  const tk = String(ticker || "").trim().toUpperCase();
  const qty = Number(shares);
  const px = Number(avgPrice);
  const acct = ACCOUNTS.includes(account) ? account : "일반";
  const brk = String(broker || "").trim();
  if (!tk || !(qty > 0) || !(px > 0)) return { ok: false, error: "티커·수량·단가를 정확히 입력하세요." };
  const mkt = inferMarket(tk, market);
  const list = read();
  // 증권사가 다르면 별도 보유로 관리(연금/ISA가 증권사별로 나뉘므로)
  const idx = list.findIndex((h) => h.ticker === tk && (h.trader || "A") === trader && h.avgCcy === avgCcy && (h.account || "일반") === acct && (h.broker || "") === brk);
  if (idx >= 0) {
    const cur = list[idx];
    const totalShares = cur.shares + qty;
    cur.avgPrice = Math.round(((cur.avgPrice * cur.shares + px * qty) / totalShares) * 1e4) / 1e4;
    cur.shares = Math.round(totalShares * 1e6) / 1e6;
    cur.market = mkt;
    if (buyDate && (!cur.buyDate || buyDate < cur.buyDate)) cur.buyDate = buyDate;
  } else {
    list.push({ id: `${tk}-${avgCcy}-${acct}-${brk}-${trader}`, ticker: tk, market: mkt, shares: qty, avgPrice: px, avgCcy, account: acct, broker: brk, buyDate: buyDate || "", ts: Date.now(), trader });
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

// ── [2026-08-23] 기타 금융자산(펀드·디폴트옵션 등 티커 없는 자산) ──
//   퇴직연금 DC형은 대부분 증권사 펀드/디폴트옵션 포트폴리오라 KRX 티커가 없다 —
//   위 buyEtf() 의 티커 기반 모델에 안 맞는다. 이름 + 평가금액만 수동 기록한다
//   (부동산 페이지의 "추가 보유 부동산"과 동일한 패턴). 시세 자동갱신·섹터분석·
//   손익통산 등은 대상이 아니다(애초에 그런 데이터가 없다) — 종합자산 합계에만 반영.
const OKEY = "onehub_etf_other";
function readOther() {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(OKEY) || "[]"); } catch { return []; }
}
function writeOther(list) {
  try { localStorage.setItem(OKEY, JSON.stringify(list)); } catch {}
}
// [ETF 재구성 Phase1] 기타자산 종류 — etf/fund/bond/cash. 없으면 'fund'로 간주(하위호환).
export const OTHER_KINDS = ["etf", "fund", "bond", "cash"];
function normKind(kind, isCash) {
  if (OTHER_KINDS.includes(kind)) return kind;
  return isCash ? "cash" : "fund";
}
export function getOtherAssets(trader = "A") {
  return readOther()
    .filter((o) => (o.trader || "A") === trader)
    .map((o) => ({ ...o, account: normalizeAccount(o.account || "일반"), kind: normKind(o.kind, o.isCash) }));
}
export function addOtherAsset({ name, account = "일반", valueKrw, costKrw, isCash = false, kind, trader = "A" }) {
  const nm = String(name || "").trim();
  const val = Number(valueKrw);
  if (!nm || !(val >= 0)) return { ok: false, error: "이름·평가금액을 정확히 입력하세요." };
  const acct = ACCOUNTS.includes(account) ? account : "일반";
  const k = normKind(kind, isCash);
  const list = readOther();
  list.push({
    id: `other-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: nm, account: acct, valueKrw: val, isCash: k === "cash" || !!isCash, kind: k,
    costKrw: costKrw != null && Number(costKrw) > 0 ? Number(costKrw) : null,
    ts: Date.now(), trader,
  });
  writeOther(list);
  return { ok: true };
}
// [ETF 재구성 Phase1] 기타자산 값 갱신(평가액·이름·계좌·종류). 부분 패치 병합.
export function updateOtherAsset(id, patch = {}, trader = "A") {
  const list = readOther();
  const idx = list.findIndex((o) => o.id === id && (o.trader || "A") === trader);
  if (idx < 0) return { ok: false, error: "대상을 찾을 수 없습니다." };
  const cur = list[idx];
  const next = { ...cur };
  if (patch.name != null) { const nm = String(patch.name).trim(); if (nm) next.name = nm; }
  if (patch.account != null && ACCOUNTS.includes(patch.account)) next.account = patch.account;
  if (patch.valueKrw != null) { const v = Number(patch.valueKrw); if (v >= 0) next.valueKrw = v; }
  if (patch.kind != null) { next.kind = normKind(patch.kind, patch.isCash); next.isCash = next.kind === "cash"; }
  else if (patch.isCash != null) { next.isCash = !!patch.isCash; }
  list[idx] = next;
  writeOther(list);
  return { ok: true };
}
// [ETF 재구성 Phase1] 매도/인출 — 평가액을 amountKrw 만큼 차감(0 하한). 0 이하가 되면 레코드 제거.
export function sellOtherAsset(id, amountKrw, trader = "A") {
  const amt = Number(amountKrw);
  if (!(amt > 0)) return { ok: false, error: "차감 금액을 정확히 입력하세요." };
  const list = readOther();
  const idx = list.findIndex((o) => o.id === id && (o.trader || "A") === trader);
  if (idx < 0) return { ok: false, error: "대상을 찾을 수 없습니다." };
  const remain = Math.max(0, (Number(list[idx].valueKrw) || 0) - amt);
  if (remain <= 0) {
    writeOther(list.filter((_, i) => i !== idx));
    return { ok: true, removed: true };
  }
  list[idx] = { ...list[idx], valueKrw: remain };
  writeOther(list);
  return { ok: true, removed: false, remain };
}
export function removeOtherAsset({ id, trader = "A" }) {
  writeOther(readOther().filter((o) => !(o.id === id && (o.trader || "A") === trader)));
  return { ok: true };
}
