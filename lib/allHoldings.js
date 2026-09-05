// [S30-1] 보유 소스 통합 — KIS 연동 + 직접 입력을 '하나의 배열'로. 오늘·종합자산·AI 가 같은 것을 쓴다.
//   ★세 화면에서 각자 합치면 S22~S26 에서 없앤 중복이 되살아난다. 합치는 로직은 여기 한 곳.
//   반환 형태는 KIS 스키마에 맞춘다(화면·deriveUrgency 가 KIS 형태를 기대) + source 로 구분.
//     { name, code, qty, avg_price, current_price, change_1d, target, stop_loss, source, id?, ccy?, broker?, account?, _quoteMissing? }
//   source: "kis" | "manual" | "etf"(S30-4). 나중에 유료 경계를 그을 때 이 필드 하나로 갈린다.
import { getStockHoldings } from "./stockHoldings";
import { fetchStockQuotes } from "./stockLive";
import { cachedJson } from "./quoteCache";
import { getHoldings as getEtfHoldings } from "./etfHoldings";

// [S30-3] 손절/목표 기본값 — 여기 한 곳(여기저기 흩지 말 것).
export const RISK_DEFAULTS = { stopPct: -8, targetPct: 15 };
export function suggestStop(avgPrice) { const p = Number(avgPrice) || 0; return p > 0 ? Math.round(p * (1 + RISK_DEFAULTS.stopPct / 100)) : null; }
export function suggestTarget(avgPrice) { const p = Number(avgPrice) || 0; return p > 0 ? Math.round(p * (1 + RISK_DEFAULTS.targetPct / 100)) : null; }

const num = (x) => (x == null || isNaN(Number(x)) ? null : Number(x));

// KIS 잔고 포지션 → 통합 형태(이미 KIS 스키마라 source 만 붙인다).
function fromDash(dash) {
  let p = dash?.balance?.positions;
  if (typeof p === "string") { try { p = JSON.parse(p); } catch { p = null; } }
  return (Array.isArray(p) ? p : []).map((x) => ({ ...x, source: "kis" }));
}

// 직접입력 보유 → 통합 형태. 시세/등락은 quote 로 채운다(S30-2).
function manualToUnified(h, q) {
  const cur = q && Number(q.price) > 0 ? Number(q.price) : null;
  const change = q && q.changePct != null ? Number(q.changePct) : null;
  return {
    name: h.name, code: String(h.code || "").toUpperCase(),
    qty: Number(h.shares) || 0, avg_price: Number(h.avgPrice) || 0,
    current_price: cur,               // 시세 실패 시 null → 화면 '시세 확인 중', deriveUrgency rank 3
    change_1d: change,                 // 전일종가 없으면 null(가격은 있어도 등락만 미상)
    target: num(h.target) ?? 0,        // S30-3 사용자 설정(없으면 0 → rank 판정 제외)
    stop_loss: num(h.stopLoss) ?? 0,
    pnl_rate: (cur != null && Number(h.avgPrice) > 0) ? (cur / Number(h.avgPrice) - 1) * 100 : 0,
    ccy: h.ccy || "KRW", broker: h.broker || "", account: h.account || "일반",
    source: "manual", id: h.id, stopHintDismissed: !!h.stopHintDismissed,
    _quoteMissing: cur == null,
  };
}

// 직접입력 주식만 통합 형태로(시세 배치 1회 — 새 요청 만들지 말 것, cachedJson 공유).
export async function getManualStockPositions(trader = "A") {
  const holds = getStockHoldings(trader) || [];
  if (!holds.length) return [];
  let quotes = {};
  try { ({ quotes } = await fetchStockQuotes(holds)); } catch { quotes = {}; }
  return holds.map((h) => manualToUnified(h, quotes[h.id]));
}

// ★오늘·종합자산·AI 공용 — KIS + 직접입력 통합 목록.
//   dash 를 이미 받은 화면(today.js)은 넘겨서 중복 요청을 막는다. 없으면 cachedJson 으로 공유.
export async function getAllStockPositions(trader = "A", { dash } = {}) {
  const d = dash || (await cachedJson(`/api/pwa-dashboard?trader=${trader}`));
  const kis = fromDash(d);
  const manual = await getManualStockPositions(trader);
  return [...kis, ...manual];
}

// [S30-4] ETF 보유 → 같은 통합 형태. source: "etf". 손절/목표 대신 당일 급변·배분 이탈이 신호.
function etfToUnified(h, q) {
  const cur = q && Number(q.price) > 0 ? Number(q.price) : null;
  const change = q && q.changePct != null ? Number(q.changePct) : null;
  return {
    name: h.name || h.ticker, code: String(h.ticker || "").toUpperCase(),
    qty: Number(h.shares) || 0, avg_price: Number(h.avgPrice) || 0,
    current_price: cur, change_1d: change, target: 0, stop_loss: 0,
    pnl_rate: (cur != null && Number(h.avgPrice) > 0) ? (cur / Number(h.avgPrice) - 1) * 100 : 0,
    ccy: h.avgCcy || "KRW", account: h.account || "일반",
    source: "etf", id: h.id, _quoteMissing: cur == null,
  };
}

export async function getAllEtfPositions(trader = "A") {
  const holds = (getEtfHoldings(trader) || []).filter((h) => h && (h.ticker || h.name));
  if (!holds.length) return [];
  // 시세는 주식과 같은 배치 경로(fetchStockQuotes 는 code/name 으로 동작) — ticker 를 code 로 매핑.
  const asStock = holds.map((h) => ({ ...h, code: h.ticker, shares: h.shares }));
  let quotes = {};
  try { ({ quotes } = await fetchStockQuotes(asStock)); } catch { quotes = {}; }
  return holds.map((h) => etfToUnified(h, quotes[h.id]));
}
