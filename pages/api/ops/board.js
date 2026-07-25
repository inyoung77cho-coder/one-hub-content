// pages/api/ops/board.js — 운영자 전용 board 관리(부동산 신규 정보·리포트 수정/삭제).
//   미들웨어가 /api/ops/* 를 admin 강제(비-admin 403). 여기서 세션을 한 번 더 검증한 뒤
//   RE(:5002)의 /api/board/manage/* 로 프록시한다(RE_ACCESS_KEY 부착).
//   GET  ?kind=gathered|reports                    → 관리용 목록
//   POST { kind, action:'update'|'delete', ... }   → 수정/삭제
//   변경 성공 시 공개 보드(/board/realestate)를 온디맨드 재검증해 즉시 반영.
import { verifySession, SESSION_COOKIE } from "../../../lib/auth";
import { tenantFromSession } from "../../../lib/tenant";

const RE_API = process.env.RE_API_URL || "http://54.180.54.132:5002";
const RE_KEY = process.env.RE_ACCESS_KEY || "";
const KINDS = ["gathered", "reports"];
const ACTIONS = ["update", "delete"];

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

  const kind = (req.query.kind || (req.body && req.body.kind) || "").toString();
  if (!KINDS.includes(kind)) return res.status(400).json({ ok: false, error: "kind=gathered|reports 필요" });

  const q = RE_KEY ? `?key=${encodeURIComponent(RE_KEY)}` : "";
  const hdr = { "Content-Type": "application/json", "X-API-Key": RE_KEY };

  try {
    if (req.method === "GET") {
      const r = await fetch(`${RE_API}/api/board/manage/${kind}${q}`, { headers: hdr, signal: AbortSignal.timeout(8000) });
      const d = await r.json().catch(() => ({ ok: false }));
      return res.status(200).json(d && typeof d === "object" ? d : { ok: false });
    }

    if (req.method === "POST") {
      const action = (req.body && req.body.action || "").toString();
      if (!ACTIONS.includes(action)) return res.status(400).json({ ok: false, error: "action=update|delete 필요" });
      const r = await fetch(`${RE_API}/api/board/manage/${kind}/${action}${q}`, {
        method: "POST", headers: hdr, body: JSON.stringify(req.body || {}), signal: AbortSignal.timeout(8000),
      });
      const d = await r.json().catch(() => ({ ok: false }));
      // 변경 성공 시 공개 보드를 즉시 재검증(실패해도 ISR 5분 뒤 반영되므로 비치명적).
      if (d && d.ok) { try { await res.revalidate("/board/realestate"); } catch {} }
      return res.status(200).json(d && typeof d === "object" ? d : { ok: false });
    }

    return res.status(405).json({ ok: false, error: "method not allowed" });
  } catch (e) {
    return res.status(200).json({ ok: false, error: String(e) });
  }
}
