// pages/api/auth/me.js — 현재 로그인 상태 + 등급(tier)을 클라이언트가 확인하는 용도.
import { verifySession, SESSION_COOKIE } from "../../../lib/auth";
import { tenantFromSession } from "../../../lib/tenant";

function parseCookies(header) {
  const out = {};
  (header || "").split(";").forEach((p) => {
    const i = p.indexOf("=");
    if (i > -1) out[p.slice(0, i).trim()] = p.slice(i + 1).trim();
  });
  return out;
}

export default async function handler(req, res) {
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  const session = await verifySession(token);
  if (!session) return res.status(200).json({ authenticated: false });
  const t = tenantFromSession(session) || {};

  // [OH-AUTH M1] 정식 회원(accounts.db)의 구독·권한·동의여부 병합.
  //   세션 uid 가 있으면 Lightsail account/me 조회. 실패해도 기존 응답은 유지(회귀 없음).
  let account = null;
  const uid = session.uid;
  if (uid != null) {
    try {
      const base = process.env.RE_API_URL || "http://54.180.54.132:5002";
      const key = process.env.RE_ACCESS_KEY || "";
      const r = await fetch(`${base}/api/account/me${key ? `?key=${encodeURIComponent(key)}` : ""}`, {
        headers: { "X-API-Key": key, "x-oh-user": String(uid) },
      });
      if (r.ok) account = await r.json();
    } catch (e) { /* 조용히 무시 — 기존 세션 정보만 반환 */ }
  }

  return res.status(200).json({
    authenticated: true,
    user: {
      id: session.sub,
      uid: uid ?? null,
      nickname: session.nickname || "",
      provider: session.provider || "kakao",
      role: t.role || "member",
      tier: t.tier || "beta",
      lifetimeFree: !!t.lifetimeFree,
      tenant: t.tenant || null, // [격리 진단] 내 테넌트(A/B/u…) 확인용
    },
    // 정식 구독/권한(있을 때만). 없으면 프론트는 기존 tenant tier 로 폴백.
    subscription: account?.subscription || null,
    effective_tier: account?.effective_tier || null,
    entitlements: account?.entitlements || null,
    consents_ok: account?.consents_ok ?? null,
  });
}
