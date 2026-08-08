// [OS-2] "이야기" 페이지 지역화 — 구→동 계층 스코프.
//   기본값은 사용자가 등록한 부동산 대표단지에서 자동 추정, 사용자가 직접 바꿀 수도 있다.
//   댓글 저장은 기존 components/Comments.js + pages/api/comments.js(GitHub Issues)를 그대로 재사용 —
//   그 API는 date 파라미터를 그냥 이슈 제목 키로만 쓰므로, 날짜 대신 동 이름을 넘기면 동별 스레드가 된다.
const OVERRIDE_KEY = "onehub_story_region";

// [구→동 계층] 지금은 분당구만 실제 데이터가 있지만, 다른 구/시가 추가돼도 이 맵만 늘리면 된다.
export const REGIONS = {
  "분당구": ["정자동", "야탑동", "구미동", "서현동", "이매동", "수내동", "금곡동", "분당동", "삼평동", "판교동", "백현동", "운중동", "대장동"],
};

// 하위호환 — 동 이름 flat 목록(구 정보 없이 쓰던 곳들 대비).
export const KNOWN_DONGS = Object.values(REGIONS).flat();

export function guOf(dong) {
  for (const [gu, dongs] of Object.entries(REGIONS)) {
    if (dongs.includes(dong)) return gu;
  }
  return null;
}

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
