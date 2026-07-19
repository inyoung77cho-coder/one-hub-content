// pages/api/ops/feedback.js — NI-6 운영자 피드백 대시보드 데이터(admin 전용).
// 미들웨어가 /api/ops/* 를 admin 강제(비-admin 403)하므로 여기 도달=admin. 방어적으로 한 번 더 검증.
//   GET   : label=feedback 이슈 목록 파싱 → 대시보드용 리스트 + 카테고리별 카운트
//   PATCH : { id, status(new|reviewed|done) } → 이슈 라벨/상태 갱신(done이면 close)
import { verifySession, SESSION_COOKIE } from "../../../lib/auth";
import { tenantFromSession } from "../../../lib/tenant";

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = process.env.GITHUB_REPO || "inyoung77cho-coder/one-hub-content";
const API_BASE = `https://api.github.com/repos/${GITHUB_REPO}`;
const STATUSES = ["new", "reviewed", "done"];

function parseCookies(header) {
  const out = {};
  (header || "").split(";").forEach((p) => {
    const i = p.indexOf("=");
    if (i > -1) out[p.slice(0, i).trim()] = p.slice(i + 1).trim();
  });
  return out;
}
async function gh(path, options = {}) {
  const r = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  if (!r.ok) throw new Error(`GitHub API ${r.status}`);
  return r.json();
}
function statusFromLabels(labels) {
  const s = (labels || []).map((l) => (typeof l === "string" ? l : l.name)).find((n) => n && n.startsWith("status:"));
  return s ? s.slice(7) : "new";
}

async function requireAdmin(req, res) {
  const session = await verifySession(parseCookies(req.headers.cookie)[SESSION_COOKIE]);
  const t = session ? tenantFromSession(session) : null;
  if (!t || t.role !== "admin") { res.status(403).json({ ok: false, error: "forbidden" }); return null; }
  return t;
}

export default async function handler(req, res) {
  if (!(await requireAdmin(req, res))) return;

  if (req.method === "GET") {
    try {
      const issues = await gh(`/issues?labels=feedback&state=all&per_page=100&sort=created&direction=desc`);
      const items = issues.map((i) => {
        let rec = {};
        const m = /<!--FB:(.*?)-->/s.exec(i.body || "");
        if (m) { try { rec = JSON.parse(m[1]); } catch {} }
        return {
          id: i.number,
          nickname: rec.nickname || "익명",
          screen: rec.screen || "(미상)",
          category: rec.category || "suggestion",
          message: rec.message || (i.body || "").replace(/<!--FB:.*?-->/s, "").trim(),
          app_version: rec.app_version || "",
          created_at: rec.created_at || i.created_at,
          status: i.state === "closed" ? "done" : statusFromLabels(i.labels),
          url: i.html_url,
        };
      });
      const counts = items.reduce((a, x) => ((a[x.category] = (a[x.category] || 0) + 1), a), {});
      const unread = items.filter((x) => x.status === "new").length;
      return res.status(200).json({ ok: true, total: items.length, unread, counts, items });
    } catch (e) {
      return res.status(200).json({ ok: false, error: e.message, items: [] });
    }
  }

  if (req.method === "PATCH") {
    const { id, status } = req.body || {};
    if (!id || !STATUSES.includes(status)) return res.status(400).json({ ok: false, error: "id, status(new|reviewed|done) 필요" });
    try {
      const issue = await gh(`/issues/${id}`);
      const keep = (issue.labels || []).map((l) => l.name).filter((n) => n && !n.startsWith("status:"));
      await gh(`/issues/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ labels: [...keep, `status:${status}`], state: status === "done" ? "closed" : "open" }),
      });
      return res.status(200).json({ ok: true });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message });
    }
  }

  return res.status(405).json({ ok: false, error: "method not allowed" });
}
