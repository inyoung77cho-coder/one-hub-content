// pages/api/auth/kakao/callback.js — 카카오 redirect 콜백.
// code→access_token 교환 → 사용자 프로필 조회 → 서명 세션 쿠키 발급 → next로 이동.
import { createSession, SESSION_COOKIE, SESSION_MAX_AGE } from "../../../../lib/auth";

function parseCookies(header) {
  const out = {};
  (header || "").split(";").forEach((p) => {
    const i = p.indexOf("=");
    if (i > -1) out[p.slice(0, i).trim()] = p.slice(i + 1).trim();
  });
  return out;
}

export default async function handler(req, res) {
  const { code, state } = req.query;
  if (!code) return res.redirect("/login?error=no_code");

  // CSRF: start에서 심은 state·next 확인
  const cookies = parseCookies(req.headers.cookie);
  const raw = cookies["oh_oauth"] || "";
  const dot = raw.indexOf(".");
  const savedState = dot > -1 ? raw.slice(0, dot) : "";
  const savedNext = dot > -1 ? decodeURIComponent(raw.slice(dot + 1)) : "/pwa";
  if (!savedState || savedState !== state) {
    return res.redirect("/login?error=bad_state");
  }
  const next = savedNext.startsWith("/") && !savedNext.startsWith("//") ? savedNext : "/pwa";

  try {
    // 1) 토큰 교환
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: process.env.KAKAO_REST_API_KEY,
      redirect_uri: process.env.KAKAO_REDIRECT_URI,
      code: String(code),
    });
    if (process.env.KAKAO_CLIENT_SECRET) body.set("client_secret", process.env.KAKAO_CLIENT_SECRET);

    const tokenRes = await fetch("https://kauth.kakao.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" },
      body,
    });
    const tokenJson = await tokenRes.json();
    if (!tokenRes.ok || !tokenJson.access_token) {
      console.error("[kakao] token exchange failed", tokenJson);
      return res.redirect("/login?error=token");
    }

    // 2) 프로필 조회
    const meRes = await fetch("https://kapi.kakao.com/v2/user/me", {
      headers: { Authorization: `Bearer ${tokenJson.access_token}` },
    });
    const me = await meRes.json();
    if (!meRes.ok || !me.id) {
      console.error("[kakao] profile failed", me);
      return res.redirect("/login?error=profile");
    }

    // 3) 세션 발급
    const nickname = me.properties?.nickname || me.kakao_account?.profile?.nickname || "";
    const jwt = await createSession({ id: `kakao:${me.id}`, nickname, provider: "kakao" });

    res.setHeader("Set-Cookie", [
      `${SESSION_COOKIE}=${jwt}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_MAX_AGE}`,
      `oh_oauth=; Path=/; Max-Age=0`,
    ]);
    return res.redirect(next);
  } catch (e) {
    console.error("[kakao] callback error", e);
    return res.redirect("/login?error=server");
  }
}
