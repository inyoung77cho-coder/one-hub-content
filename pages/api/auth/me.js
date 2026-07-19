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
  return res.status(200).json({
    authenticated: true,
    user: {
      id: session.sub,
      nickname: session.nickname || "",
      provider: session.provider || "kakao",
      role: t.role || "member",
      tier: t.tier || "beta",
      lifetimeFree: !!t.lifetimeFree,
      tenant: t.tenant || null, // [격리 진단] 내 테넌트(A/B/u…) 확인용
    },
  });
}
