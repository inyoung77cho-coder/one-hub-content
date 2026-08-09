// [AI 자기검증] 주차별 적중률 스냅샷 — 백엔드에 히스토리 테이블이 없어(accuracy API는 항상
//   "지금 시점" 누적치만 반환) lib/assetHistory.js·lib/storyRegionHistory.js와 동일한 패턴으로
//   앱을 열 때마다 그 시점 값을 로컬에 하루 1건 적립한다. 실제 값만 쌓는다 — 가짜 과거 기록 없음.
const KEY = "onehub_ai_accuracy_history";
const MAX_WEEKS = 12;

function read() {
  if (typeof window === "undefined") return [];
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function write(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list.slice(-MAX_WEEKS))); } catch {}
}

// date는 적용 주(월요일, YYYY-MM-DD) 기준 — 같은 주에 다시 열리면 최신값으로 덮어쓴다.
export function recordAccuracySnapshot({ date, accuracyPct, totalChecked }) {
  if (typeof window === "undefined" || !date || accuracyPct == null) return;
  const list = read();
  const i = list.findIndex((x) => x.date === date);
  const snap = { date, accuracyPct, totalChecked: totalChecked ?? null };
  if (i >= 0) list[i] = snap; else list.push(snap);
  list.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  write(list);
}

export function getAccuracyHistory() {
  return read();
}
