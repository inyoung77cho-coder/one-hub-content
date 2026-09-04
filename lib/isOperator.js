// [S28-7] 운영자 판정 단일 지점 — 정비소(엔진룸)는 운영자에게만. 나중에 유료 사용자가 생겨도
//   판정 로직을 여기 한 곳만 고치면 되도록 한 곳에 둔다(코드를 다시 짜지 않게).
//   현재 기준: 로그인 세션의 role === 'admin' (board-admin 과 동일한 /api/auth/me).
let _cache = null;

export function getIsOperator() {
  if (_cache) return _cache;
  if (typeof window === "undefined") return Promise.resolve(false);
  _cache = fetch("/api/auth/me")
    .then((r) => r.json())
    .then((d) => !!(d && d.authenticated && d.user && d.user.role === "admin"))
    .catch(() => false);
  return _cache;
}
