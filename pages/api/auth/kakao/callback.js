// pages/api/auth/kakao/callback.js — 카카오 redirect 콜백.
// code→access_token 교환 → 사용자 프로필 조회 → 서명 세션 쿠키 발급 → next로 이동.
// [S36-1] state 는 서명 토큰(lib/kakaoState) — 쿠키 유실돼도 검증되고 next 복원. 쿠키는 보조 방어.
// [S36-2] 복구 가능한 실패(bad_sig·expired·state_mismatch)는 오류를 보여주기 전에 1회 조용히 재시도.
// [S36-4] 실패를 구조화해서 남긴다(PII 없이) — 며칠 뒤 로그로 진짜 원인 확정.
import { createSession, SESSION_COOKIE, SESSION_MAX_AGE } from "../../../../lib/auth";
import { verifyState } from "../../../../lib/kakaoState";

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
  const cookies = parseCookies(req.headers.cookie);
  const cookieState = cookies["oh_oauth"] || "";
  const isRetry = !!req.query.retry;

  // [S36-4] 구조화 로그(★PII 금지: 카카오 id·닉네임·이메일·토큰 절대 안 남김)
  // [S36-2] recoverable 이고 아직 재시도 전이면 오류 화면 대신 start 로 1회 되돌린다.
  //   ★retry 파라미터가 이미 있으면 절대 다시 시도하지 않는다(무한 루프 방지).
  const fail = (reason, recoverable, nextForRetry, extra) => {
    console.error(
      "[kakao] fail",
      JSON.stringify({
        reason,
        hasCookie: !!cookieState,
        host: req.headers.host,
        ua: (req.headers["user-agent"] || "").slice(0, 80),
        retry: isRetry,
        ...(extra || {}),
      })
    );
    if (recoverable && !isRetry) {
      const n =
        nextForRetry && nextForRetry.startsWith("/") && !nextForRetry.startsWith("//")
          ? nextForRetry
          : "/pwa";
      return res.redirect(`/api/auth/kakao/start?next=${encodeURIComponent(n)}&retry=1`);
    }
    return res.redirect(`/login?error=${reason}`);
  };

  // 사용자가 카카오에서 취소 → code 없음. 재시도해도 같으니 그냥 /login.
  if (!code) return fail("no_code", false);

  // [S36-1] 서명된 state 검증. 쿠키가 없어도 여기서 위조 여부·목적지가 판별된다.
  const v = verifyState(state);
  if (!v.ok) return fail(v.reason, true, v.next); // bad_sig | expired → 복구 가능(1회 재시도)

  // [S36-1] 쿠키는 보조 방어(심층 방어): 오면 서명 대상 body 와 대조, 안 오면 서명만으로 통과.
  //   ★'쿠키 없으면 그냥 통과'가 아니다 — 서명이 이미 위조를 막았다. 쿠키가 있는데 다르면 진짜 이상.
  if (cookieState && cookieState !== v.body) return fail("state_mismatch", true, v.next);

  const next = v.next;

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
      // 카카오 API 오류 — 재시도해도 같으니 오류 표시. err 코드만 남긴다(설명·토큰=PII 제외).
      return fail("token", false, next, { kakaoErr: tokenJson?.error || tokenRes.status });
    }

    // 2) 프로필 조회
    const meRes = await fetch("https://kapi.kakao.com/v2/user/me", {
      headers: { Authorization: `Bearer ${tokenJson.access_token}` },
    });
    const me = await meRes.json();
    if (!meRes.ok || !me.id) {
      // 프로필 조회 실패 — 재시도해도 같음. 상태코드만 남긴다(프로필 본문=PII 제외).
      return fail("profile", false, next, { status: meRes.status });
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
    // 예외 — 재시도해도 같을 수 있으니 오류 표시. 메시지만(스택·PII 제외).
    return fail("server", false, next, { msg: (e?.message || "").slice(0, 80) });
  }
}
