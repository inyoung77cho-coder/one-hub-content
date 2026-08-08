// lib/auth.js — 로그인 세션(JWT) 서명/검증. NI-2/3 카카오 로그인 게이트용.
// Edge(middleware)와 Node(API 라우트) 양쪽에서 동작하도록 jose를 사용한다.
import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "oh_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30일(초)

function secretKey() {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET 환경변수 미설정");
  return new TextEncoder().encode(s);
}

// user: { id, nickname, provider, picture }
export async function createSession(user) {
  return await new SignJWT({
    sub: user.id,
    uid: user.uid ?? null,   // 정식 회원 user_id(accounts.db). tenant/admin 판정은 sub 유지.
    nickname: user.nickname || "",
    provider: user.provider || "kakao",
    picture: user.picture || null, // [OS-2] 설정 페이지 프로필 사진 — 카카오 프로필 이미지 URL 그대로 사용.
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(secretKey());
}

// 유효하면 payload, 아니면 null (검증 실패를 예외로 흘리지 않는다)
export async function verifySession(token) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    return payload;
  } catch {
    return null;
  }
}
