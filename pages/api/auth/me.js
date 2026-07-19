// pages/api/auth/me.js — 현재 로그인 상태를 클라이언트가 확인하는 용도.
import { verifySession, SESSION_COOKIE } from "../../../lib/auth";

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
  return res.status(200).json({
    authenticated: true,
    user: { id: session.sub, nickname: session.nickname || "", provider: session.provider || "kakao" },
  });
}
