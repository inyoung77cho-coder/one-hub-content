// pages/api/me/consent.js — 가입 동의 저장 프록시(§8).
// 세션 uid → Lightsail account/consent(POST). 정식 회원만(uid) 저장 가능.
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
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "POST only" });
  }
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  const session = await verifySession(token);
  if (!session) return res.status(401).json({ error: "unauthenticated" });
  if (session.uid == null) {
    // 정식 회원 upsert 전(구세션)이면 동의 저장 불가 — 재로그인 유도.
    return res.status(409).json({ error: "no_account", message: "다시 로그인해 주세요." });
  }
  try {
    const base = process.env.RE_API_URL || "http://54.180.54.132:5002";
    const key = process.env.RE_ACCESS_KEY || "";
    const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || null;
    const r = await fetch(`${base}/api/account/consent${key ? `?key=${encodeURIComponent(key)}` : ""}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": key, "x-oh-user": String(session.uid) },
      body: JSON.stringify({ consents: req.body?.consents || [], ip }),
    });
    const d = await r.json();
    return res.status(r.status).json(d);
  } catch (e) {
    return res.status(502).json({ error: "upstream", detail: e.message });
  }
}
