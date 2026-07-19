// lib/session.js — 공용기기 로컬 상태 방어 (미진사항: localStorage 사용자 격리).
//   서버 데이터는 계정별로 격리(NI-4)되지만, 브라우저 localStorage 는 '기기 단위'라
//   한 폰/PC 를 여러 명이 쓰면 이전 사용자의 자산·게임·설정이 다음 사용자에게 남을 수 있다.
//   방어 2겹: ① 로그인 시 직전 사용자와 다르면 자동 초기화(로그아웃 안 해도 커버)
//            ② 로그아웃 버튼이 명시적으로 초기화.

// 사용자 전환/로그아웃에도 남겨둘 '기기 단위' 설정(사용자 데이터 아님).
const PRESERVE = new Set(["onehub_theme", "onehub_uid"]);

// onehub_ 로 시작하는 모든 '사용자 로컬 상태' 제거(PRESERVE 제외).
export function clearUserLocalState() {
  if (typeof window === "undefined") return;
  try {
    const keys = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith("onehub_") && !PRESERVE.has(k)) keys.push(k);
    }
    keys.forEach((k) => window.localStorage.removeItem(k));
  } catch (e) {}
}

// 로그인 경계: 직전 사용자(onehub_uid)와 다른 사용자면 이전 상태를 지우고 새 uid 기록.
//   uid = /api/auth/me 의 user.id (예: "kakao:123").
//   전환을 감지해 초기화했으면 true 반환 → 호출측이 새로고침해 깨끗한 상태로 다시 그림.
export function enforceUserBoundary(uid) {
  if (typeof window === "undefined" || !uid) return false;
  let prev = null;
  try { prev = window.localStorage.getItem("onehub_uid"); } catch (e) {}
  if (prev && prev !== String(uid)) {
    clearUserLocalState();
    try { window.localStorage.setItem("onehub_uid", String(uid)); } catch (e) {}
    return true; // 사용자 전환 감지 → 초기화됨
  }
  if (!prev) { try { window.localStorage.setItem("onehub_uid", String(uid)); } catch (e) {} }
  return false;
}

// 로그아웃: 로컬 사용자 상태를 지우고(uid 포함) 세션 쿠키 삭제 엔드포인트로 이동.
export function logout() {
  if (typeof window === "undefined") return;
  clearUserLocalState();
  try { window.localStorage.removeItem("onehub_uid"); } catch (e) {}
  window.location.href = "/api/auth/logout";
}
