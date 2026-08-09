// pages/api/ops/users.js — 운영자 전용 회원 목록·상태 관리.
//   미들웨어가 /api/ops/* 를 admin 강제(비-admin 403). 여기서 세션을 한 번 더 검증한 뒤
//   RE(:5002)의 /api/account/admin/* 로 프록시한다(RE_ACCESS_KEY 부착).
//   GET  → 회원 목록
//   POST { user_id, status } → 상태 변경(active|suspended|withdrawn)
import { verifySession, SESSION_COOKIE } from "../../../lib/auth";
import { tenantFromSession } from "../../../lib/tenant";

const RE_API = process.env.RE_API_URL || "http://54.180.54.132:5002";
const RE_KEY = process.env.RE_ACCESS_KEY || "";

function parseCookies(header) {
  const out = {};
  (header || "").split(";").forEach((p) => {
    const i = p.indexOf("=");
    if (i > -1) out[p.slice(0, i).trim()] = p.slice(i + 1).trim();
  });
  return out;
}

async function requireAdmin(req, res) {
  const session = await verifySession(parseCookies(req.headers.cookie)[SESSION_COOKIE]);
  const t = session ? tenantFromSession(session) : null;
  if (!t || t.role !== "admin") { res.status(403).json({ ok: false, error: "forbidden" }); return null; }
  return t;
}

export default async function handler(req, res) {
  if (!(await requireAdmin(req, res))) return;

  const q = RE_KEY ? `?key=${encodeURIComponent(RE_KEY)}` : "";
  const hdr = { "Content-Type": "application/json", "X-API-Key": RE_KEY };

  try {
    if (req.method === "GET") {
      const r = await fetch(`${RE_API}/api/account/admin/list${q}`, { headers: hdr, signal: AbortSignal.timeout(8000) });
      const d = await r.json().catch(() => ({ ok: false }));
      return res.status(200).json(d && typeof d === "object" ? d : { ok: false });
    }

    if (req.method === "POST") {
      const { user_id, status } = req.body || {};
      if (!user_id || !["active", "suspended", "withdrawn"].includes(status)) {
        return res.status(400).json({ ok: false, error: "user_id, status(active|suspended|withdrawn) 필요" });
      }
      const r = await fetch(`${RE_API}/api/account/admin/status${q}`, {
        method: "POST", headers: hdr, body: JSON.stringify({ user_id, status }), signal: AbortSignal.timeout(8000),
      });
      const d = await r.json().catch(() => ({ ok: false }));
      return res.status(r.status === 200 ? 200 : r.status).json(d && typeof d === "object" ? d : { ok: false });
    }

    return res.status(405).json({ ok: false, error: "method not allowed" });
  } catch (e) {
    return res.status(200).json({ ok: false, error: String(e) });
  }
}
