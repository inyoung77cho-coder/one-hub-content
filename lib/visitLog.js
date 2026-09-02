// [S23 T-10] 방문일·판단 기록일 계기판 — '오래 쓰게 한다'를 측정한다.
//   ★화면에 연속 일수(스트릭) 배지를 달지 않는다(하루 끊기면 오히려 이탈을 부른다). 사실만 주간 리포트에서.
//   저장(trader별 키): onehub_visit_days_A / _B = { "2026-09-02": { visit:1, verdicts:3 }, ... }.
//   SYNC_KEYS 에 두 키 등록(기기 간 병합) → 서버 user_state 로 올라가 weekly_verdict_report.py 가 읽는다.
const KEY = (tr) => `onehub_visit_days_${tr || "A"}`;

function kstToday() { return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10); }
function read(tr) { if (typeof window === "undefined") return {}; try { return JSON.parse(localStorage.getItem(KEY(tr)) || "{}") || {}; } catch { return {}; } }
function write(tr, o) { try { localStorage.setItem(KEY(tr), JSON.stringify(o)); } catch (e) {} }

// 새 날짜를 처음 기록할 때만 세션 1회 동기화 신호(매 렌더 spam 방지 — syncManager 가 debounce push).
let _pushedThisSession = false;
function maybeSync(isNewDay) {
  if (isNewDay && !_pushedThisSession && typeof window !== "undefined") {
    _pushedThisSession = true;
    try { window.dispatchEvent(new Event("onehub-assets-change")); } catch (e) {}
  }
}

export function recordVisit(trader = "A") {
  if (typeof window === "undefined") return;
  const o = read(trader);
  const d = kstToday();
  const isNew = !o[d];
  if (!o[d]) o[d] = { visit: 0, verdicts: 0 };
  o[d].visit = 1;
  write(trader, o);
  maybeSync(isNew);
}

export function recordVerdictDay(trader = "A") {
  if (typeof window === "undefined") return;
  const o = read(trader);
  const d = kstToday();
  const isNew = !o[d];
  if (!o[d]) o[d] = { visit: 0, verdicts: 0 };
  o[d].visit = 1;
  o[d].verdicts = (Number(o[d].verdicts) || 0) + 1;
  write(trader, o);
  maybeSync(isNew);
}

export function getVisitLog(trader = "A") { return read(trader); }
