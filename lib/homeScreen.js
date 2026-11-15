// [S46 R3] '자산' 첫 화면 선택 — "simple"(/pwa/home, 운용자산 한 숫자) | "full"(/pwa/assets, 종전 화면).
//   기기별 취향이지 자산이 아니므로 lib/syncManager.js 의 SYNC_KEYS 에 넣지 않는다(기기마다 따로).
//   기본 "full" = 무회귀. 되돌리기는 설정에서 "full" 로 바꾸면 끝(파일 삭제 불필요).
//   manifest.json start_url/scope 는 건드리지 않는다 — 전환은 앱 안의 '자산' 탭 이동 경로로만 한다.
export const HOME_SCREEN_KEY = "onehub_home_screen";
export const HOME_SCREEN_EVENT = "onehub-home-screen-change";

export function getHomeScreen() {
  if (typeof window === "undefined") return "full";
  try { return localStorage.getItem(HOME_SCREEN_KEY) === "simple" ? "simple" : "full"; } catch { return "full"; }
}

export function setHomeScreen(v) {
  const next = v === "simple" ? "simple" : "full";
  try { localStorage.setItem(HOME_SCREEN_KEY, next); } catch {}
  try { window.dispatchEvent(new CustomEvent(HOME_SCREEN_EVENT, { detail: next })); } catch {}
  return next;
}

// 하단 '자산' 탭이 갈 곳.
export function assetsHref() {
  return getHomeScreen() === "simple" ? "/pwa/home" : "/pwa/assets";
}
