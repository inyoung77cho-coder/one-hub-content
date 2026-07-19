// pages/api/auth/kakao/start.js — 카카오 인증 페이지로 리다이렉트(로그인 시작).
// CSRF 방지용 state와 로그인 후 돌아갈 next 경로를 짧은 쿠키에 담아둔다.
import crypto from "crypto";

export default function handler(req, res) {
  const clientId = process.env.KAKAO_REST_API_KEY;
  const redirectUri = process.env.KAKAO_REDIRECT_URI; // 예: https://app.one-hub.kr/api/auth/kakao/callback
  if (!clientId || !redirectUri) {
    return res.status(500).json({ error: "KAKAO_REST_API_KEY / KAKAO_REDIRECT_URI 미설정" });
  }

  const rawNext = typeof req.query.next === "string" ? req.query.next : "/pwa";
  // 오픈 리다이렉트 방지: 내부 경로만 허용
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/pwa";
  const state = crypto.randomBytes(16).toString("hex");

  res.setHeader(
    "Set-Cookie",
    `oh_oauth=${state}.${encodeURIComponent(next)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`
  );

  const url = new URL("https://kauth.kakao.com/oauth/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);
  res.redirect(url.toString());
}
