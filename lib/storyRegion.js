// [OS-2] "이야기" 페이지 지역화 — 동네(법정동) 기준 게시판 스코프.
//   기본값은 사용자가 등록한 부동산 대표단지(실거주)에서 자동 추정, 사용자가 직접 바꿀 수도 있다.
//   댓글 저장은 기존 components/Comments.js + pages/api/comments.js(GitHub Issues)를 그대로 재사용 —
//   그 API는 date 파라미터를 그냥 이슈 제목 키로만 쓰므로, 날짜 대신 동 이름을 넘기면 동별 스레드가 된다.
const OVERRIDE_KEY = "onehub_story_region";

// [PI-1] 분당구 법정동 폴백(realestate.js와 동일 목록) — 백엔드 매핑이 없어도 지역변경 선택지가 비지 않게.
export const KNOWN_DONGS = ["정자동", "야탑동", "구미동", "서현동", "이매동", "수내동", "금곡동", "분당동", "삼평동", "판교동", "백현동", "운중동", "대장동"];

export function getStoryRegionOverride() {
  if (typeof window === "undefined") return "";
  try { return localStorage.getItem(OVERRIDE_KEY) || ""; } catch { return ""; }
}

export function setStoryRegionOverride(v) {
  try {
    if (v) localStorage.setItem(OVERRIDE_KEY, v);
    else localStorage.removeItem(OVERRIDE_KEY);
  } catch {}
  if (typeof window !== "undefined") window.dispatchEvent(new Event("onehub-story-region-change"));
}

// 등록된 대표단지명 → 동 이름 추정. dongMap: /api/pwa/re/complexDongs 응답({단지명: 법정동}).
export function guessMyDong(dongMap) {
  if (typeof window === "undefined") return null;
  try {
    const mp = JSON.parse(localStorage.getItem("onehub_re_my_property") || "null");
    const name = mp?.name;
    if (name && dongMap && dongMap[name]) return dongMap[name];
  } catch {}
  return null;
}
