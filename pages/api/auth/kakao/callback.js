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

    const nickname = me.properties?.nickname || me.kakao_account?.profile?.nickname || "";
    const picture = me.properties?.profile_image || me.kakao_account?.profile?.profile_image_url || null;

    // 3) 정식 회원 upsert (Lightsail accounts.db) — 실패해도 로그인은 진행(기존 동작 유지).
    //    성공 시 정식 user_id 를 세션 uid 로. sub(kakao:id)은 tenant/admin 판정용으로 그대로.
    let uid = null;
    let consentsOk = true;   // upsert 실패 시엔 동의 화면으로 못 보내므로 통과(기존 동작 유지)
    try {
      const base = process.env.RE_API_URL || "http://54.180.54.132:5002";
      const key = process.env.RE_ACCESS_KEY || "";
      const up = await fetch(`${base}/api/account/upsert${key ? `?key=${encodeURIComponent(key)}` : ""}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-Key": key },
        body: JSON.stringify({
          provider: "kakao",
          provider_user_id: String(me.id),
          nickname,
          email: me.kakao_account?.email || null,
          profile_image: me.properties?.profile_image || null,
        }),
      });
      if (up.ok) {
        const uj = await up.json();
        uid = uj.user_id ?? null;
        consentsOk = uj.consents_ok !== false;   // 신규/미동의면 false
      } else { console.error("[kakao] account upsert failed", up.status); }
    } catch (e) {
      console.error("[kakao] account upsert error", e?.message);
    }

    // 4) 세션 발급 (uid 포함)
    const jwt = await createSession({ id: `kakao:${me.id}`, uid, nickname, provider: "kakao", picture });

    // 필수 동의가 없으면(신규 등) 동의 화면으로 유도. 완료 후 원래 목적지로.
    const dest = (uid != null && !consentsOk)
      ? `/pwa/consent?next=${encodeURIComponent(next)}`
      : next;

    res.setHeader("Set-Cookie", [
      `${SESSION_COOKIE}=${jwt}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_MAX_AGE}`,
      `oh_oauth=; Path=/; Max-Age=0`,
    ]);
    return res.redirect(dest);
  } catch (e) {
    console.error("[kakao] callback error", e);
    return res.redirect("/login?error=server");
  }
}
