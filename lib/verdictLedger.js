// [나 vs AI 대결] AI가 추천한 종목에 대한 "내 판단"(매매함/안함)을 기록하고,
//   3일·7일 뒤 실제 수익으로 '내 판단 vs AI 단독매매' 승부를 채점하는 클라이언트 원장(ledger).
//
// 왜 클라이언트인가: "AI 추천 중 내가 무엇을 샀고 무엇을 지나쳤는가"는 앱만 아는 정보다
//   (백엔드는 사용자의 개별 승인/거절 판단을 성과 데이터셋으로 보관하지 않음).
//   → 승인=매매(take) / 거절·스킵=관망(pass)을 로컬에 남기고, 이후 접속 때 현재가를
//     스냅샷으로 축적해 3일/7일 시점 수익을 산출한다. 데이터가 없으면 정직하게 '집계 중'.
//
// 저장 스키마(localStorage onehub_ai_vs_me): [{ code, name, trader, ts, entry, decision, snaps:[{ts,price}] }]

const KEY = "onehub_ai_vs_me";
const SCORE_KEY = "onehub_rec_scores"; // code→score(확신) 맵: 추천 표시 때 index.js가 갱신
const DAY = 86400000;

// [DEPRECATED] 관망 규율 기준 점수. 8년 백테스트상 관망이 상승장에서 손해로 확인되어
//   게임 AI는 '항상 투자(추천 전부 매수)'로 되돌림 → 이 값은 더 이상 게임 판정에 쓰이지 않음(참고용 보존).
export const AI_BUY_SCORE = 10;

// 종목의 확신 점수 해석: 명시값 우선, 없으면 점수 맵에서 조회. 둘 다 없으면 null(구버전 호환).
function resolveScore(code, given) {
  const g = Number(given);
  if (given != null && !Number.isNaN(g)) return g;
  if (typeof window === "undefined") return null;
  try {
    const m = JSON.parse(localStorage.getItem(SCORE_KEY) || "{}");
    return m && m[code] != null ? Number(m[code]) : null;
  } catch { return null; }
}

// AI가 이 종목을 매수했는지(규율): 점수 없으면(구버전) 매수로 간주해 호환.
export function aiBought(score) {
  return score == null || Number(score) >= AI_BUY_SCORE;
}

function read() {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; }
}
function write(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list.slice(-120))); } catch {}
}

export function getLedger(trader) {
  const all = read();
  return trader ? all.filter((e) => (e.trader || "A") === trader) : all;
}

// 오늘 이 종목에 대해 기록한 판단(take|pass) — 추천 카드 버튼 상태 표시용
export function getTodayDecision(code, trader = "A") {
  const dayKey = Math.floor(Date.now() / DAY);
  const hit = read().find(
    (e) => e.code === code && (e.trader || "A") === trader && Math.floor(e.ts / DAY) === dayKey
  );
  return hit ? hit.decision : null;
}

// 판단 1건 기록. 같은 종목을 같은 날 다시 누르면 최신 결정으로 갱신(중복 방지).
//   [S-6] source: 'manual'(사용자) | 'auto_watch'(추천해제 시 자동 관망) — 통계 왜곡 방지 위해 구분 저장.
export function recordDecision({ code, name, entry, decision, trader = "A", source = "manual", score = null }) {
  if (!code) return;
  const list = read();
  const now = Date.now();
  const dayKey = Math.floor(now / DAY);
  const idx = list.findIndex(
    (e) => e.code === code && (e.trader || "A") === trader && Math.floor(e.ts / DAY) === dayKey
  );
  const price = Number(entry) || null;
  const sc = resolveScore(code, score); // AI 확신 점수(관망/매수 판정용)
  if (idx >= 0) {
    list[idx].decision = decision;
    list[idx].source = source;
    if (price) list[idx].entry = list[idx].entry || price;
    if (list[idx].score == null && sc != null) list[idx].score = sc;
  } else {
    list.push({
      code, name: name || code, trader, ts: now,
      entry: price, decision, source, score: sc, // decision: 'take'|'pass', score: AI 확신
      snaps: price ? [{ ts: now, price }] : [],
    });
  }
  write(list);
}

// [S-6] 추천에서 사라진(해제된) 종목을 무액션 시 '관망'(auto_watch)으로 자동 편입 → 데이터 유실 0.
//   current: [{code,name}] 현재 추천 노출 종목. 반환: 이번에 자동 관망된 [{code,name}](알림용).
const REC_SEEN_KEY = "onehub_rec_seen";
function hasRecentDecision(code, trader, days = 3) {
  const now = Date.now();
  return read().some((e) => e.code === code && (e.trader || "A") === trader && now - e.ts < days * DAY);
}
export function reconcileAutoWatch(current, trader = "A") {
  if (typeof window === "undefined") return [];
  let store = {};
  try { store = JSON.parse(localStorage.getItem(REC_SEEN_KEY) || "{}") || {}; } catch {}
  const prev = store[trader] || {};
  const curMap = {};
  (current || []).forEach((s) => { if (s && s.code) curMap[s.code] = s.name || s.code; });
  const auto = [];
  Object.keys(prev).forEach((code) => {
    if (!curMap[code] && !hasRecentDecision(code, trader)) {
      recordDecision({ code, name: prev[code], decision: "pass", trader, source: "auto_watch" });
      auto.push({ code, name: prev[code] });
    }
  });
  store[trader] = curMap;
  try { localStorage.setItem(REC_SEEN_KEY, JSON.stringify(store)); } catch {}
  return auto;
}

// 접속 시 현재가 스냅샷 축적(하루 1회). fetchPrice(code) → number|null.
export async function matureLedger(trader, fetchPrice) {
  const list = read();
  const now = Date.now();
  const mine = list.filter((e) => (e.trader || "A") === trader && e.entry > 0);
  // 마지막 스냅이 20시간 넘게 오래된 항목만 갱신(과도한 호출 방지)
  const stale = mine.filter((e) => {
    const last = (e.snaps || [])[e.snaps.length - 1];
    return !last || now - last.ts > 20 * 3600000;
  });
  await Promise.all(
    stale.map(async (e) => {
      try {
        const price = await fetchPrice(e.code);
        if (price > 0) {
          e.snaps = [...(e.snaps || []), { ts: now, price }].slice(-24);
        }
      } catch {}
    })
  );
  write(list);
  return list.filter((e) => (e.trader || "A") === trader);
}

// [항목2-A] 거래일 N일 후 시각(주말 건너뜀). 달력일이 아니라 '거래일'로 채점창을 잡는다.
//   백엔드 자기검증(market_calendar/KIS)이 권위 소스이고, 이 게임은 근사(스냅샷)이므로
//   주말 스킵으로 달력↔거래일 주 오차를 제거한다. (공휴일 미세오차는 아래 tol이 흡수)
function addTradingDays(ts, n) {
  const d = new Date(ts);
  let added = 0;
  while (added < n) {
    d.setDate(d.getDate() + 1);
    const wd = d.getDay();          // 0=일, 6=토
    if (wd !== 0 && wd !== 6) added++;
  }
  return d.getTime();
}

// 특정 시점(진입 + windowDays 거래일) 근처 스냅으로 수익률(%) 산출. 없으면 null.
export function returnAt(entry, windowDays) {
  if (!entry?.entry || !(entry.snaps?.length)) return null;
  const target = addTradingDays(entry.ts, windowDays); // [항목2-A] 달력일→거래일
  const tol = (windowDays <= 3 ? 2 : 3.5) * DAY; // 3거래일 ±2일, 7거래일 ±3.5일 허용
  let best = null, bestDiff = Infinity;
  for (const s of entry.snaps) {
    const diff = Math.abs(s.ts - target);
    // 목표 시점 이후(또는 근처)의 스냅을 우선
    if (s.ts >= target - DAY && diff < bestDiff) { best = s; bestDiff = diff; }
  }
  if (!best || bestDiff > tol) return null;
  return Math.round((best.price / entry.entry - 1) * 1000) / 10;
}

// 창(3 or 7일) 기준 '나 vs AI' 승부 계산.
//   AI 단독 = 추천 전부 매매했다고 가정 → 전체 종목 평균 수익
//   내 판단 = 내가 산(take) 종목만 평균 수익 (안 산 종목은 내 포트폴리오에 없음)
//   pass 정오답: 내려가면 잘 지나침(정답), 오르면 놓침(오답)
export function computeShowdown(list, windowDays) {
  const rows = list
    .map((e) => ({ e, r: returnAt(e, windowDays) }))
    .filter((x) => x.r != null);
  if (!rows.length) return { ready: false, n: 0 };
  const takes = rows.filter((x) => x.e.decision === "take");
  const avg = (arr) => (arr.length ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10 : 0);
  // [백테스트 반영] AI = 추천 전부 매수(항상 투자). 8년 검증상 '관망'은 상승장에서 손해였고,
  //   하방 방어는 손절이 담당. 관망 규율은 데이터가 지지 안 해 되돌림. 나 = 산 것(take)만.
  const aiRet = avg(rows.map((x) => x.r));
  const myRet = takes.length ? avg(takes.map((x) => x.r)) : 0;
  const diff = Math.round((myRet - aiRet) * 10) / 10;
  const winner = Math.abs(diff) < 0.3 ? "tie" : diff > 0 ? "me" : "ai";
  const details = rows
    .map((x) => {
      const pass = x.e.decision === "pass";
      const correct = pass ? x.r < 0 : x.r >= 0; // 지나침=하락이면 정답 / 매매=상승이면 정답
      return { code: x.e.code, name: x.e.name, decision: x.e.decision, ret: x.r, correct, score: x.e.score ?? null, aiBought: true, ts: x.e.ts };
    })
    .sort((a, b) => Math.abs(b.ret) - Math.abs(a.ret));
  return { ready: true, n: rows.length, takeN: takes.length, passN: rows.length - takes.length, myRet, aiRet, diff, winner, details };
}
