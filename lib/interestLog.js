// [S48-1] 관심 센싱 — "무엇에 관심이 있나"(네 번째 질문)를 행동으로 잰다. 화면 없음(수집만).
//   ★기존 세 모듈과 섞지 않는다: visitLog(빈도)·funnel(관문)·activityToken(토큰)은 다른 질문이다.
//   ★단일 키(onehub_interest) + 레코드 내부 trader 필터 — reAsking.js 와 같은 [M3-확장] 방식.
//     _A/_B 접미사를 쓰지 않는다(u<kakaoId> 신규 구독자에서 조용히 깨진다).
//   ★S48-4(동기화) 전: SYNC_KEYS 에 없고, 'onehub-assets-change' 도 쏘지 않는다 → 기기 안에만 쌓인다.
//     동기화를 붙일 때도 events(원시·대상 이름 포함)는 서버로 올리지 않는다. scores 만.
//   ★개인정보: 금액·수량·좌표·검색어 원문·뉴스 URL 을 담지 않는다. 시각도 '날짜(자정)'로만 남긴다
//     (사용 시각·시간대 패턴은 관심과 무관하고 감시로 읽힌다). 콘솔·분석 서비스로 내보내지 않는다.
//   ★점수는 사용자에게 숫자로 보여주지 않는다(S55 에서 순서로만 드러난다).
import { getTrader } from "./trader";

export const INTEREST_KEY = "onehub_interest";
// 신호 가중치(§1 승인 표). ignored 는 음수 — 점수가 0 아래로 내려가도 자르지 않는다.
export const WEIGHTS = Object.freeze({ act: 10, detail: 3, dwell: 2, tap: 1, ignored: -2 });
export const KINDS = Object.freeze(["etf", "stock", "realestate", "pension", "cash", "class"]);
export const WINDOW_DAYS = 28;   // 최근 28일만 집계(반감기 없음 — 설명 가능성)
export const MAX_EVENTS = 2000;  // localStorage 용량 상한
export const DWELL_MS = 15000;   // 같은 대상 15초 이상 = 읽었다
const DAY = 86400000;
const EXPOSE_KEEP_DAYS = 3;      // 배지 노출 기록은 판정 대기용 — 판정 후 지운다(며칠치만)
// 배지를 '봤다'로 인정하는 신호(이 중 하나라도 그날 있으면 ignored 아님)
const ENGAGED = new Set(["act", "detail", "dwell", "tap"]);

const pad = (n) => String(n).padStart(2, "0");
// 기기 현지 날짜 "YYYY-MM-DD"
export function dayStr(ms = Date.now()) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
// 그 날 현지 자정(ms) — 이벤트 ts 는 이 값만 저장한다(시각 미보관)
export function dayStart(ms = Date.now()) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
function dayStartOf(ds) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ds || ""));
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime() : NaN;
}

function normTarget(t) {
  const s = String(t == null ? "" : t).trim();
  return s ? s.slice(0, 40) : "";
}
const scoreKey = (kind, target) => `${kind}:${target}`;

function emptyStore() { return { events: [], scores: {}, lastRoll: null, exposed: {} }; }

function read() {
  if (typeof window === "undefined") return emptyStore();
  try {
    const s = JSON.parse(localStorage.getItem(INTEREST_KEY) || "null");
    if (!s || typeof s !== "object") return emptyStore();
    return {
      events: Array.isArray(s.events) ? s.events : [],
      scores: s.scores && typeof s.scores === "object" ? s.scores : {},
      lastRoll: typeof s.lastRoll === "string" ? s.lastRoll : null,
      exposed: s.exposed && typeof s.exposed === "object" ? s.exposed : {},
    };
  } catch { return emptyStore(); }
}
// 저장 직전에 항상 events 에서 scores 를 다시 만든다(원시가 사라지면 점수도 사라진다 — 검증 가능성).
function write(s) {
  if (typeof window === "undefined") return;
  s.scores = computeScores(s.events);
  try { localStorage.setItem(INTEREST_KEY, JSON.stringify(s)); } catch {}
}

// ── 순수 함수(테스트용 export) ─────────────────────────────────────────

// events → { [trader]: { "<kind>:<target>": 가중합 } }. 0 으로 자르지 않는다.
export function computeScores(events) {
  const out = {};
  (events || []).forEach((e) => {
    const w = e && WEIGHTS[e.sig];
    if (w == null || !e.kind || !e.target) return;
    const tr = e.trader || "A";
    const k = scoreKey(e.kind, e.target);
    if (!out[tr]) out[tr] = {};
    out[tr][k] = (out[tr][k] || 0) + w;
  });
  return out;
}

// 28일 창 밖을 버리고, 2,000건을 넘으면 오래된 것부터 버린다.
export function pruneEvents(events, now = Date.now()) {
  const cutoff = dayStart(now) - (WINDOW_DAYS - 1) * DAY; // 오늘 포함 28일
  const kept = (events || [])
    .filter((e) => e && Number(e.ts) >= cutoff)
    .sort((a, b) => a.ts - b.ts);
  return kept.length > MAX_EVENTS ? kept.slice(kept.length - MAX_EVENTS) : kept;
}

function sameDayHit(events, ts, trader, kind, target, sigTest) {
  return events.some((e) => e.ts === ts && (e.trader || "A") === trader && e.kind === kind && e.target === target && sigTest(e.sig));
}

// 하루 끝 판정: 지난 날의 배지 노출 중 그날 한 번도 건드리지 않은 대상 → ignored(−2).
//   오늘 노출분은 아직 판정하지 않는다(실시간 판정 금지).
export function judgeIgnored(store, now = Date.now()) {
  const today = dayStr(now);
  const cutoff = dayStart(now) - (WINDOW_DAYS - 1) * DAY;
  Object.keys(store.exposed || {}).forEach((ds) => {
    if (ds >= today) return;
    const ts = dayStartOf(ds);
    const byTr = store.exposed[ds] || {};
    if (Number.isFinite(ts) && ts >= cutoff) {
      Object.keys(byTr).forEach((tr) => {
        Object.keys(byTr[tr] || {}).forEach((k) => {
          const i = k.indexOf(":");
          if (i <= 0) return;
          const kind = k.slice(0, i), target = k.slice(i + 1);
          const engaged = sameDayHit(store.events, ts, tr, kind, target, (s) => ENGAGED.has(s));
          const already = sameDayHit(store.events, ts, tr, kind, target, (s) => s === "ignored");
          if (!engaged && !already) store.events.push({ ts, trader: tr, target, kind, sig: "ignored" });
        });
      });
    }
    delete store.exposed[ds];
  });
  return store;
}

// 하루 1회 굴리기: ignored 판정 → 28일/2,000건 정리.
export function rollStore(store, now = Date.now()) {
  const today = dayStr(now);
  if (store.lastRoll === today) return false;
  judgeIgnored(store, now);
  store.events = pruneEvents(store.events, now);
  store.lastRoll = today;
  return true;
}

// 신호 1건 추가(순수). 같은 날·같은 trader·같은 대상·같은 신호는 1회만. 반환: 가산 여부.
export function addEvent(store, { sig, kind, target, trader = "A" }, now = Date.now()) {
  if (!(sig in WEIGHTS) || !KINDS.includes(kind)) return false;
  const t = normTarget(target);
  if (!t) return false;
  const ts = dayStart(now);
  if (sameDayHit(store.events, ts, trader, kind, t, (s) => s === sig)) return false;
  store.events.push({ ts, trader, target: t, kind, sig });
  store.events = pruneEvents(store.events, now);
  return true;
}

// ── 클라 진입점 ─────────────────────────────────────────────────────────
//   모두 조용히 실패한다(관심 수집이 화면·주문 흐름을 절대 막지 않게). 콘솔 출력 없음.

export function logInterest(sig, kind, target, trader) {
  if (typeof window === "undefined") return false;
  try {
    const s = read();
    rollStore(s);
    const ok = addEvent(s, { sig, kind, target, trader: trader || getTrader() });
    write(s);
    return ok;
  } catch { return false; }
}

// 배지 노출 기록(판정 대기). 오늘 날짜 아래에만 쌓고, 판정은 다음 날 rollInterest 가 한다.
export function markBadgeShown(kind, target, trader) {
  if (typeof window === "undefined") return;
  try {
    const t = normTarget(target);
    if (!t || !KINDS.includes(kind)) return;
    const tr = trader || getTrader();
    const s = read();
    rollStore(s);
    const ds = dayStr();
    const k = scoreKey(kind, t);
    if (s.exposed[ds]?.[tr]?.[k]) return; // 이미 기록 — 재기록하지 않는다(렌더마다 쓰기 방지)
    s.exposed[ds] = s.exposed[ds] || {};
    s.exposed[ds][tr] = s.exposed[ds][tr] || {};
    s.exposed[ds][tr][k] = 1;
    // 판정 대기 기록은 며칠치만(앱을 오래 안 열었을 때 쌓이지 않게)
    const keepFrom = dayStr(Date.now() - (EXPOSE_KEEP_DAYS - 1) * DAY);
    Object.keys(s.exposed).forEach((d) => { if (d < keepFrom) delete s.exposed[d]; });
    write(s);
  } catch {}
}

// 앱 시작 시 하루 1회 굴리기(지난 날 ignored 판정 + 오래된 기록 정리).
export function rollInterest() {
  if (typeof window === "undefined") return;
  try { const s = read(); if (rollStore(s)) write(s); } catch {}
}

// 내부 조회(검증·S55 용). 저장된 scores 가 아니라 events 에서 다시 계산한 값 — 화면에 숫자로 쓰지 말 것.
export function getInterestScores(trader) {
  const s = read();
  return computeScores(pruneEvents(s.events))[trader || getTrader()] || {};
}

// ── 경로 → 상세 대상(S48-2 detail/dwell) ───────────────────────────────
//   현재 앱에는 종목·단지별 상세 라우트가 없다(쿼리로 대상을 싣는 경로도 없음).
//   그래서 상세 = '자산군 화면'으로 본다. 대상은 자산군(kind "class").
export function detailTargetOf(pathname, search = "") {
  const p = String(pathname || "").replace(/\/+$/, "") || "/";
  if (p === "/pwa/etf") return { kind: "class", target: "etf" };
  if (p === "/pwa/realestate") return { kind: "class", target: "realestate" };
  if (p === "/pwa/pension") return { kind: "class", target: "pension" };
  if (p === "/pwa") {
    let tab = null;
    try { tab = new URLSearchParams(search || "").get("tab"); } catch {}
    if (tab === "portfolio") return { kind: "class", target: "stock" };
  }
  return null;
}

// _app.js 에서 한 번 붙인다: 라우트 완료마다 detail(3) 기록 + 15초 체류 타이머(dwell 2).
//   이탈(다른 대상/상세 아님)·백그라운드 전환 시 타이머 해제. 반환: 정리 함수.
export function attachInterestRouteHooks(routerEvents) {
  if (typeof window === "undefined" || !routerEvents) return () => {};
  let curKey = null, timer = null;
  const clear = () => { clearTimeout(timer); timer = null; curKey = null; };
  const evaluate = () => {
    const tgt = detailTargetOf(window.location.pathname, window.location.search);
    if (!tgt) { clear(); return; }
    const k = scoreKey(tgt.kind, tgt.target);
    logInterest("detail", tgt.kind, tgt.target); // 일 1회만 가산(addEvent 가 거른다)
    if (curKey === k) return;                    // 같은 대상 안의 탭 전환 — 체류 타이머 유지
    clear();
    curKey = k;
    timer = setTimeout(() => { timer = null; logInterest("dwell", tgt.kind, tgt.target); }, DWELL_MS);
  };
  const onVis = () => { if (document.visibilityState === "hidden") clear(); else evaluate(); };
  rollInterest();
  evaluate(); // 첫 진입(routeChangeComplete 는 최초 로드에 안 뜬다)
  routerEvents.on("routeChangeComplete", evaluate);
  document.addEventListener("visibilitychange", onVis);
  return () => {
    clear();
    routerEvents.off("routeChangeComplete", evaluate);
    document.removeEventListener("visibilitychange", onVis);
  };
}
