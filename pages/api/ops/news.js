// pages/api/ops/news.js — 운영자 전용: 뉴스 엔진(onehub-news, :5004) 게시물 조회/수정.
//   미들웨어가 /api/ops/* 를 admin 강제(비-admin 403). pages/api/ops/board.js(부동산)와 동일 패턴.
//   GET  ?status=draft|published|hidden(선택) → 관리용 목록(전 상태 노출, /today/news는 published만)
//   POST { id, ...patch }                    → 수정(category/headline/summary_md/importance/pinned/status)
import { verifySession, SESSION_COOKIE } from "../../../lib/auth";
import { tenantFromSession } from "../../../lib/tenant";

const NEWS_API = process.env.NEWS_API_URL || "http://54.180.54.132:5004";
const NEWS_ADMIN_TOKEN = process.env.NEWS_ADMIN_TOKEN || "";

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

  const hdr = { "Content-Type": "application/json", "X-Admin-Token": NEWS_ADMIN_TOKEN };

  try {
    if (req.method === "GET") {
      // [2026-08-16] 50건 고정이라 게시량이 많아지면 탭 숫자가 그 지점에서 멈춘 것처럼 보였음
      //   (실제로는 최신순으로 계속 갱신되고 있었음 — 오래된 항목이 창 밖으로 밀려날 뿐).
      //   백엔드 한도(200)에 여유를 두고 150으로 상향.
      const status = (req.query.status || "").toString();
      const qs = status ? `?status=${encodeURIComponent(status)}&limit=150` : "?limit=150";
      const r = await fetch(`${NEWS_API}/admin/news${qs}`, { headers: hdr, signal: AbortSignal.timeout(8000) });
      const body = await r.json().catch(() => null);
      if (!r.ok) return res.status(200).json({ ok: false, error: `뉴스엔진 ${r.status}: ${body?.detail || "알 수 없는 오류"}` });
      return res.status(200).json({ ok: true, items: Array.isArray(body) ? body : [] });
    }

    if (req.method === "POST") {
      const { id, ...patch } = req.body || {};
      if (!id) return res.status(400).json({ ok: false, error: "id 필요" });
      const r = await fetch(`${NEWS_API}/admin/news/${encodeURIComponent(id)}`, {
        method: "POST", headers: hdr, body: JSON.stringify(patch), signal: AbortSignal.timeout(8000),
      });
      const d = await r.json().catch(() => ({ ok: false }));
      if (!r.ok) return res.status(200).json({ ok: false, error: d?.detail || "저장 실패" });
      // pages/pwa/today.js는 CSR(useEffect+fetch)라 별도 재검증 불필요 — 클라가 다음 로드에서 최신값을 받는다.
      return res.status(200).json({ ok: true, item: d });
    }

    return res.status(405).json({ ok: false, error: "method not allowed" });
  } catch (e) {
    return res.status(200).json({ ok: false, error: String(e) });
  }
}
