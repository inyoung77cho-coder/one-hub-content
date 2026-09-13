// pages/api/auth/kakao/start.js — 카카오 인증 페이지로 리다이렉트(로그인 시작).
// [S36-1] state 는 난수가 아니라 서명된 토큰(next·타임스탬프 내장). 쿠키가 유실돼도 콜백에서 검증·목적지 복원.
//   쿠키(oh_oauth)는 없애지 않고 보조 방어로 남긴다(콜백에서 있으면 대조, 없으면 서명만으로 통과).
import { makeState } from "../../../../lib/kakaoState";

export default function handler(req, res) {
  const clientId = process.env.KAKAO_REST_API_KEY;
  const redirectUri = process.env.KAKAO_REDIRECT_URI; // 예: https://app.one-hub.kr/api/auth/kakao/callback
  if (!clientId || !redirectUri) {
    return res.status(500).json({ error: "KAKAO_REST_API_KEY / KAKAO_REDIRECT_URI 미설정" });
  }

  const rawNext = typeof req.query.next === "string" ? req.query.next : "/pwa";
  // 오픈 리다이렉트 방지: 내부 경로만 허용
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/pwa";

  // [S36-1] 서명된 state(next·ts 내장). 콜백은 이 body 를 검증하고 next 를 복원한다.
  const state = makeState(next);
  const body = state.split(".")[0]; // 서명 대상(payload) — 쿠키에는 이 body 만 담는다.

  // [S36-1] 쿠키는 보조 방어로 유지 — body 만 담는다(콜백이 쿠키 body 와 state body 를 대조).
  res.setHeader(
    "Set-Cookie",
    `oh_oauth=${body}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`
  );

  const url = new URL("https://kauth.kakao.com/oauth/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);
  res.redirect(url.toString());
}
