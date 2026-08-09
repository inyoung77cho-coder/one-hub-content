// lib/storyRegionHistory.js
// 지역(동)별 "이야기 건수" 일별 스냅샷 — 브라우저(localStorage)에 하루 1건 기록.
//
// 왜 필요한가: "참석자 증감"을 요청받았지만 이야기 댓글(components/Comments.js)엔 고유
//   사용자를 식별할 장치가 없다(닉네임은 로그인과 무관한 자유 입력). 대신 실제로 있는
//   데이터인 /api/story-region-stats의 동별 댓글 건수를 매일 적립해 "건수 증감"을 보여준다
//   — lib/assetHistory.js와 동일한 패턴(서버 크론 없이 앱을 열 때마다 그 시점 스냅샷 적립).
//
// 저장 형태: [{ date:'2026-08-09', counts:{동이름:건수, ...} }, ...] (오름차순, 최근 30일)

const KEY = "onehub_story_region_history";
const MAX_DAYS = 30;

function kstToday() {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch (e) {
    return [];
  }
}

function write(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(-MAX_DAYS)));
  } catch (e) { /* 저장 실패는 조용히 무시 — 증감 표시는 부가기능 */ }
}

// 앱이 동별 건수를 받아온 직후 호출. 오늘치가 있으면 최신값으로 갱신, 없으면 추가.
export function recordSnapshot(counts) {
  if (!counts || typeof counts !== "object") return;
  const snap = { date: kstToday(), counts };
  const list = read();
  const i = list.findIndex((x) => x.date === snap.date);
  if (i >= 0) list[i] = snap;
  else list.push(snap);
  list.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  write(list);
}

// 오늘(마지막) vs 직전 '다른 날' 스냅샷 대비 지역별 증감. 이력이 2일 미만이면 null
// (아직 쌓인 게 없다는 뜻 — 이 경우 호출부는 "데이터 쌓이는 중" 문구를 보여줘야 한다).
export function getRegionDelta() {
  const list = read();
  if (list.length < 2) return null;
  const today = list[list.length - 1];
  const prev = list[list.length - 2];
  const regions = new Set([...Object.keys(today.counts || {}), ...Object.keys(prev.counts || {})]);
  const deltas = [...regions].map((region) => ({
    region,
    count: today.counts?.[region] ?? 0,
    delta: (today.counts?.[region] ?? 0) - (prev.counts?.[region] ?? 0),
  }));
  deltas.sort((a, b) => b.delta - a.delta);
  return { prevDate: prev.date, deltas };
}
