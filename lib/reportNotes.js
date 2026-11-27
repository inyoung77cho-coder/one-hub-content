// [S47-4] 리포트 요점 — 운영자가 매주 읽은 리포트를 '범주별 한 줄'로 남기는 개인 기록.
//   본보기: lib/reAsking.js (같은 모양의 로컬 모듈). ★하지만 저장소는 다르다 — 섞지 않는다.
//   · 키 onehub_re_report_notes → lib/syncManager.js SYNC_KEYS → /api/user/state → :5002 user_state 에
//     '테넌트별로' 저장된다. 그래서 개인 전용이 구조적으로 보장되고 기기를 바꿔도 남는다. 새 백엔드 테이블 없음.
//   · ★현장 메모(/api/input/re-spot, 서버 공용)와도 다른 저장소다.
//   · ★lib/ledger.js 에 반영하지 않는다 — 추세용 메모이지 자산 평가가 아니다.
//   · ★sourceMemo 는 저장만 한다. 화면·로그에 출력하지 말 것(읽기 함수도 이 필드를 떼고 돌려준다).
//   · 원문 이미지 저장·표시, OCR 금지(이번 범위 아님 — 원문은 유료 자료, 세 줄은 운영자의 해석).
//   · 삭제 UI 없음(주 단위 덮어쓰기만) — 그래서 reAsking 의 markDeleted(tombstone) 의존도 두지 않는다.

const KEY = "onehub_re_report_notes";

// [S47-4] 범주는 확정 전이다. 바뀔 수 있으므로 한 곳에만 둔다.
//   화면은 이 배열을 돌려 입력란·표 열을 만든다. 여러 곳에 하드코딩 금지.
export const REPORT_CATS = [
  { key: "market",  label: "시장 전체" },
  { key: "bundang", label: "분당·인근" },
  { key: "mine",    label: "내 관심 단지" },
];

const MAX_LINE = 200;   // 범주별 한 줄
const MAX_MEMO = 300;   // 출처 메모(저장 전용)

function read() {
  if (typeof window === "undefined") return [];
  try { const a = JSON.parse(localStorage.getItem(KEY) || "[]"); return Array.isArray(a) ? a : []; } catch { return []; }
}
function write(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
    window.dispatchEvent(new Event("onehub-assets-change")); // 동기화·화면 갱신 트리거(합계와 무관)
  } catch {}
}

// 그 주 월요일(로컬 날짜) "YYYY-MM-DD" — 주 단위 키.
export function weekOf(date = new Date()) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dow = d.getDay(); // 0=일
  d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// ★화면용: sourceMemo 를 뗀 사본만 돌려준다(출력 경로를 원천 차단).
function publicView(r) {
  const { sourceMemo, ...rest } = r; // eslint-disable-line no-unused-vars
  return { ...rest, hasSourceMemo: !!(sourceMemo && String(sourceMemo).trim()) };
}

export function getReportNotes(trader = "A") {
  return read()
    .filter((r) => (r.trader || "A") === trader)
    .sort((a, b) => String(b.weekOf).localeCompare(String(a.weekOf)))
    .map(publicView);
}

// 최근 n주(이번 주 포함, 최신이 위). 기록 없는 주는 빈 행(값을 지어내지 않는다).
export function getRecentWeeks(trader = "A", n = 8) {
  const byWeek = {};
  getReportNotes(trader).forEach((r) => { if (!byWeek[r.weekOf]) byWeek[r.weekOf] = r; });
  const out = [];
  const base = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() - 7 * i);
    const w = weekOf(d);
    out.push({ weekOf: w, note: byWeek[w] || null });
  }
  return out;
}

export function getNoteForWeek(trader = "A", wk = weekOf()) {
  return getReportNotes(trader).find((r) => r.weekOf === wk) || null;
}

// 저장 — 한 주에 한 레코드(같은 주를 다시 저장하면 그 주 레코드를 갱신. id 유지 + updatedAt → 레코드 단위 병합).
//   sourceMemo 는 빈 값으로 넘어오면 기존 값을 지우지 않는다(화면이 기존 메모를 보여주지 않으므로).
export function saveReportNote({ trader = "A", wk = weekOf(), cats = {}, sourceMemo } = {}) {
  const clean = {};
  REPORT_CATS.forEach(({ key }) => { clean[key] = String(cats[key] || "").trim().slice(0, MAX_LINE); });
  if (!REPORT_CATS.some(({ key }) => clean[key])) return { ok: false, error: "범주 중 하나 이상 입력하세요." };
  const memo = sourceMemo == null ? "" : String(sourceMemo).trim().slice(0, MAX_MEMO);
  const now = Date.now();
  const list = read();
  const i = list.findIndex((r) => (r.trader || "A") === trader && r.weekOf === wk);
  if (i >= 0) {
    const prev = list[i];
    list[i] = { ...prev, cats: clean, sourceMemo: memo || prev.sourceMemo || "", updatedAt: now };
  } else {
    list.push({
      id: `rpt-${now}-${Math.random().toString(36).slice(2, 8)}`,
      ts: now, updatedAt: now, weekOf: wk, cats: clean, sourceMemo: memo, trader,
    });
  }
  write(list);
  return { ok: true };
}

export { KEY as REPORT_NOTES_KEY };
