// [2026-08-23] 포트폴리오 대결 — "오늘의 대결" 완전 재설계.
//   기존 gameWallet.js(복리 베팅 가상지갑) + verdictLedger.js(결정별 % 채점)를 대체한다.
//   ★설계: 시작 시점의 보유(KIS 실보유 스냅샷 또는 1500만원 현금)를 "기준"으로 고정하고,
//     그 이후 매일의 매수/매도 추천에 대한 수용/거부만 결정으로 쌓는다.
//     AI = 기준 + 모든 추천을 전부 수용한 가상의 나. 나 = 기준 + 내가 수용한 것만.
//     두 포트폴리오는 저장하지 않고 "기준+결정로그"에서 매번 다시 계산한다(단일 진실).
//   저장(localStorage, trader별): base·decisions·snapshots 3개 키. 기기 간 동기화는
//   lib/syncManager.js SYNC_KEYS에 등록(범용 pull/push 재사용, 별도 백엔드 불필요).

const BASE_KEY = "onehub_duel_base";
const DECISIONS_KEY = "onehub_duel_decisions";
const SNAPSHOTS_KEY = "onehub_duel_snapshots";

export const DEFAULT_CASH = 15000000; // [사용자 지시] KIS 실보유 없으면 1,500만원 가상현금으로 시작
// [자동매매봇 config.py STOP_LOSS_PCT/TRAILING_STOP_PCT 와 동일 기준 재사용 — 새 규칙 만들지 않음]
export const SELL_STOP_LOSS_PCT = -5;   // 평단 대비 -5% 이하 → 손절 검토
export const SELL_TAKE_PROFIT_PCT = 10; // 평단 대비 +10% 이상 → 익절 검토

function read(key, fallback) {
  if (typeof window === "undefined") return fallback;
  try { return JSON.parse(localStorage.getItem(key) || "null") ?? fallback; } catch { return fallback; }
}
function write(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export function getDuelBase(trader = "A") {
  return read(BASE_KEY, {})[trader] || null;
}
export function isDuelStarted(trader = "A") {
  return !!getDuelBase(trader);
}

// KIS 실보유가 있으면 그대로 복제, 없으면 1500만원 현금으로 시작. 이미 시작했으면 거부.
// [버그 수정] hasReal일 때 예수금(kisCash)을 안 받고 0으로 고정해, 총액 비교에 현금이
//   빠져 실제 자산과 어긋나 보였다(사용자 리포트) — KIS 잔고의 balance.cash를 그대로 받는다.
export function startDuel({ trader = "A", kisPositions, kisCash } = {}) {
  const all = read(BASE_KEY, {});
  if (all[trader]) return { ok: false, error: "이미 시작된 대결이 있습니다." };
  const hasReal = Array.isArray(kisPositions) && kisPositions.length > 0;
  const base = {
    startDate: todayStr(),
    cash: hasReal ? (Number(kisCash) || 0) : DEFAULT_CASH,
    positions: hasReal
      ? kisPositions
          .filter((p) => Number(p.qty ?? p.hldg_qty) > 0)
          .map((p) => ({
            code: String(p.code ?? p.pdno ?? "").trim(),
            name: p.name ?? p.prdt_name ?? p.code,
            qty: Number(p.qty ?? p.hldg_qty) || 0,
            avgPrice: Number(p.avg_price ?? p.pchs_avg_pric) || 0,
          }))
          .filter((p) => p.code)
      : [],
    seedType: hasReal ? "kis" : "virtual",
  };
  all[trader] = base;
  write(BASE_KEY, all);
  return { ok: true, base };
}

// [버그 보정 전용] 시작 시점 예수금이 KIS 조회 일시 오류로 0으로 잘못 기록된 경우, 그동안
//   쌓인 결정 기록(decisions)은 유지한 채 기준 현금만 바로잡는다. positions/시작일은 불변.
export function correctBaseCash(trader = "A", cash) {
  const all = read(BASE_KEY, {});
  const base = all[trader];
  if (!base) return { ok: false, error: "시작된 대결이 없습니다." };
  base.cash = Number(cash) || 0;
  all[trader] = base;
  write(BASE_KEY, all);
  return { ok: true, base };
}

export function resetDuel(trader = "A") {
  const b = read(BASE_KEY, {}); delete b[trader]; write(BASE_KEY, b);
  const d = read(DECISIONS_KEY, {}); delete d[trader]; write(DECISIONS_KEY, d);
  const s = read(SNAPSHOTS_KEY, {}); delete s[trader]; write(SNAPSHOTS_KEY, s);
}

export function getDecisions(trader = "A") {
  return read(DECISIONS_KEY, {})[trader] || [];
}

// 오늘 이미 이 종목·행동에 대해 결정을 기록했는지(같은 추천 중복 노출 방지)
export function hasDecisionToday(trader, code, action) {
  const t = todayStr();
  return getDecisions(trader).some((d) => d.date === t && d.code === code && d.action === action);
}

export function recordDuelDecision({ trader = "A", code, name, action, qty, price, accepted }) {
  const all = read(DECISIONS_KEY, {});
  const list = all[trader] || [];
  list.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    date: todayStr(),
    code: String(code || "").trim(),
    name: name || code,
    action, // 'buy' | 'sell'
    qty: Number(qty) || 0,
    price: Number(price) || 0,
    accepted: !!accepted,
  });
  all[trader] = list;
  write(DECISIONS_KEY, all);
}

// 기준(base) + 결정로그를 순서대로 적용해 포트폴리오를 재구성한다.
// side: 'ai'(전부 수용) | 'me'(accepted만 반영)
function applyDecisions(base, decisions, side) {
  let cash = base.cash;
  const positions = {};
  base.positions.forEach((p) => { positions[p.code] = { ...p }; });
  const sorted = [...decisions].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : 1));
  sorted.forEach((d) => {
    if (side === "me" && !d.accepted) return;
    const amt = d.qty * d.price;
    if (d.action === "buy") {
      cash -= amt;
      const cur = positions[d.code] || { code: d.code, name: d.name, qty: 0, avgPrice: 0 };
      const totalQty = cur.qty + d.qty;
      cur.avgPrice = totalQty > 0 ? (cur.avgPrice * cur.qty + d.price * d.qty) / totalQty : d.price;
      cur.qty = totalQty;
      cur.name = cur.name || d.name;
      positions[d.code] = cur;
    } else if (d.action === "sell") {
      cash += amt;
      const cur = positions[d.code];
      if (cur) {
        cur.qty = Math.max(0, cur.qty - d.qty);
        if (cur.qty <= 0) delete positions[d.code];
      }
    }
  });
  return { cash, positions: Object.values(positions).filter((p) => p.qty > 0) };
}

// { base, ai:{cash,positions}, me:{cash,positions}, decisions } — 대결 없으면 null.
export function getPortfolios(trader = "A") {
  const base = getDuelBase(trader);
  if (!base) return null;
  const decisions = getDecisions(trader);
  return {
    base,
    ai: applyDecisions(base, decisions, "ai"),
    me: applyDecisions(base, decisions, "me"),
    decisions,
  };
}

// 포트폴리오 평가액(원) = 현금 + Σ(수량×현재가), 시세 없는 종목은 평단으로 대체(보수적 폴백).
export function portfolioValue(side, quotes) {
  return side.cash + side.positions.reduce((s, p) => {
    const px = quotes?.[p.code] != null ? quotes[p.code] : p.avgPrice;
    return s + px * p.qty;
  }, 0);
}

// 하루 1회 마크투마켓 스냅샷 기록(차트용 시계열 — 시작일부터 자연 누적, 과거 시세 API 불필요).
// [2단계] quotes에 담긴 종목별 현재가도 함께 적립 — 별도 과거시세 백엔드 없이 이후 매일
//   쌓이는 이 prices 맵만으로 판단별 단기/중기/장기 분석(getDecisionAnalysis)이 가능해진다.
// [버그 수정] 실보유 시작인 경우 "나"는 base+결정로그 재계산이 아니라 실시간 KIS 잔고를,
//   "AI"는 computeAiFromLive() 미러링 결과를 써야 하므로(위 startDuel/computeAiFromLive
//   주석 참고), 호출부(컴포넌트)가 이미 계산한 두 값을 override로 넘기면 그대로 스냅샷에 쓴다.
export function recordSnapshot(trader, quotes, myValueOverride, aiValueOverride) {
  const p = getPortfolios(trader);
  if (!p) return;
  const t = todayStr();
  const all = read(SNAPSHOTS_KEY, {});
  const list = all[trader] || [];
  if (list.some((s) => s.date === t)) return;
  const myValue = myValueOverride != null ? myValueOverride : portfolioValue(p.me, quotes);
  const aiValue = aiValueOverride != null ? aiValueOverride : portfolioValue(p.ai, quotes);
  list.push({ date: t, myValue, aiValue, prices: quotes || {} });
  all[trader] = list;
  write(SNAPSHOTS_KEY, all);
}

export function getSnapshots(trader = "A") {
  return (read(SNAPSHOTS_KEY, {})[trader] || []).slice().sort((a, b) => (a.date < b.date ? -1 : 1));
}

// [2단계] 판단(결정)별 단기(1일)·중기(1주)·장기(1개월) 수익률 분석.
//   전용 과거시세 API 없이, 결정일 이후 매일 적립되는 스냅샷의 종목별 가격(prices)만으로 계산한다.
//   해당 일수가 아직 안 지났으면 그 구간은 null(집계 전)로 남긴다.
const ANALYSIS_WINDOWS = [
  { key: "short", label: "단기(1일)", days: 1 },
  { key: "mid", label: "중기(1주)", days: 7 },
  { key: "long", label: "장기(1개월)", days: 30 },
];
export function getDecisionAnalysis(trader = "A") {
  const decisions = getDecisions(trader);
  const snaps = getSnapshots(trader);
  return decisions.map((d) => {
    const entryTs = new Date(d.date).getTime();
    const windows = {};
    ANALYSIS_WINDOWS.forEach((w) => {
      const targetTs = entryTs + w.days * 86400000;
      // 목표일 이후 가장 가까운(직전) 스냅샷에서 그 종목 가격을 찾는다.
      const hit = [...snaps].reverse().find((s) => new Date(s.date).getTime() >= targetTs && s.prices?.[d.code] != null);
      if (!hit) { windows[w.key] = { label: w.label, ready: false }; return; }
      const px = hit.prices[d.code];
      const pct = d.price > 0 ? ((d.action === "sell" ? -1 : 1) * (px / d.price - 1) * 100) : null;
      windows[w.key] = { label: w.label, ready: true, price: px, pct };
    });
    return { ...d, windows };
  });
}

// AI가 보유한 종목 중 평단 대비 손절/익절 구간 진입 = "오늘의 매도 추천" 후보.
// 실거래봇과 같은 STOP_LOSS_PCT/TRAILING_STOP_PCT 기준 재사용(새 규칙 안 만듦).
// [버그 수정] AI 포트폴리오를 base 재계산이 아니라 호출부가 넘겨주는 값(실보유 미러링 or
//   가상현금 재계산)으로 받는다 — computeAiFromLive() 도입으로 "AI 포트폴리오"의 출처가
//   두 가지가 됐으므로, 이 함수는 어느 쪽이든 상관없이 순수하게 positions 배열만 받는다.
export function detectSellCandidates(aiPositions, quotes) {
  const out = [];
  (aiPositions || []).forEach((pos) => {
    const px = quotes?.[pos.code];
    if (px == null || !(pos.avgPrice > 0)) return;
    const pnlPct = (px / pos.avgPrice - 1) * 100;
    if (pnlPct <= SELL_STOP_LOSS_PCT) {
      out.push({ code: pos.code, name: pos.name, qty: pos.qty, price: px, pnlPct, reason: "stop_loss" });
    } else if (pnlPct >= SELL_TAKE_PROFIT_PCT) {
      out.push({ code: pos.code, name: pos.name, qty: pos.qty, price: px, pnlPct, reason: "take_profit" });
    }
  });
  return out;
}

// [공평한 대결] 실보유 시작인 경우 "AI"를 base+결정로그 재계산이 아니라, "나"의 실시간 KIS
//   포트폴리오에서 시작해 내가 "거부"한 추천만 반대로 뒤집어 재구성한다.
//   · 내가 수용한 추천 = 실계좌에 이미 반영됐다고 보고 그대로(추가 조정 없음)
//   · 내가 거부한 추천 = AI라면 그 추천대로 했을 것이므로 반대로 적용(거부한 매수→AI는 매수,
//     거부한 매도→AI는 매도)
//   · AI 추천을 거치지 않은 내 개별 매매(예: 직접 매수)는 결정 로그에 없으므로 자동으로
//     양쪽에 동일하게 반영됨(미러링) — 이게 사용자가 요청한 "공평한 대결".
export function computeAiFromLive(myLive, decisions) {
  let cash = myLive.cash;
  const positions = {};
  (myLive.positions || []).forEach((p) => { positions[p.code] = { ...p }; });
  const rejected = (decisions || []).filter((d) => d.accepted === false);
  const sorted = [...rejected].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : 1));
  sorted.forEach((d) => {
    const amt = d.qty * d.price;
    if (d.action === "buy") {
      // 나는 안 삼 → AI라면 샀을 것
      cash -= amt;
      const cur = positions[d.code] || { code: d.code, name: d.name, qty: 0, avgPrice: 0 };
      const totalQty = cur.qty + d.qty;
      cur.avgPrice = totalQty > 0 ? (cur.avgPrice * cur.qty + d.price * d.qty) / totalQty : d.price;
      cur.qty = totalQty;
      cur.name = cur.name || d.name;
      positions[d.code] = cur;
    } else if (d.action === "sell") {
      // 나는 계속 보유 → AI라면 팔았을 것
      cash += amt;
      const cur = positions[d.code];
      if (cur) {
        cur.qty = Math.max(0, cur.qty - d.qty);
        if (cur.qty <= 0) delete positions[d.code];
      }
    }
  });
  return { cash, positions: Object.values(positions).filter((p) => p.qty > 0) };
}
