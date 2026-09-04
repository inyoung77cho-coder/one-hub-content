// [S29-12] 지역/회차 댓글 API — GitHub Issues → RE(:5002) accounts.db 로 이전.
//   왜: GitHub 토큰이 만료되면 upstream_auth 401 로 이야기 전체가 멈췄다(이미 겪음).
//   읽기·쓰기 모두 :5002 새 소스. GitHub 원본은 지우지 않고 백업으로 남긴다(아래 죽은 코드 보존).
//   실패는 화면에 보이게 — S19-3 loadError 계약 유지({ok:false, reason}).
//   thread 키 = req.query.date (실제로는 지역명 등 스레드 식별자, Comments 컴포넌트가 그렇게 씀).
const RE_API = process.env.RE_API_URL || "http://54.180.54.132:5002";
const RE_KEY = process.env.RE_ACCESS_KEY || "";
const CATS = ["전체", "주식", "ETF", "부동산"];

// SQLite datetime('now')("YYYY-MM-DD HH:MM:SS", UTC) → JS/Safari 안전한 ISO 로.
//   (마이그레이션된 GitHub 글은 이미 ISO 라 그대로 통과.)
function normTs(ts) {
  if (!ts) return ts;
  if (ts.includes("T")) return ts;
  const m = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})$/.exec(ts);
  return m ? `${m[1]}T${m[2]}Z` : ts;
}

export default async function handler(req, res) {
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: "date required" });
  const key = RE_KEY ? `&key=${encodeURIComponent(RE_KEY)}` : "";

  if (req.method === "GET") {
    try {
      const url = `${RE_API}/api/v2/comments?thread=${encodeURIComponent(date)}${key}`;
      const r = await fetch(url, {
        headers: { "X-API-Key": RE_KEY },
        signal: AbortSignal.timeout(6000),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d || !Array.isArray(d.comments)) {
        return res.status(502).json({ ok: false, reason: "upstream_error", error: "comments store" });
      }
      const comments = d.comments.map((c) => ({
        id: c.id, nick: c.nick || "익명", text: c.text || "",
        ts: normTs(c.ts), category: c.category || "전체",
      }));
      return res.status(200).json({ comments });
    } catch (e) {
      return res.status(500).json({ ok: false, reason: "upstream_error", error: String(e) });
    }
  }

  if (req.method === "POST") {
    const { nick, text } = req.body || {};
    const category = CATS.includes(req.body?.category) ? req.body.category : "전체";
    if (!nick || !text) return res.status(400).json({ error: "nick, text required" });
    if (text.length > 500) return res.status(400).json({ error: "500자 이하로 작성해주세요" });
    try {
      const url = `${RE_API}/api/v2/comments?${RE_KEY ? `key=${encodeURIComponent(RE_KEY)}` : ""}`;
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-Key": RE_KEY },
        body: JSON.stringify({ thread: date, nick, text, category }),
        signal: AbortSignal.timeout(6000),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d || !d.ok) {
        return res.status(502).json({ ok: false, reason: "upstream_error", error: "이야기를 저장하지 못했습니다 — 잠시 후 다시 시도해 주세요." });
      }
      return res.status(201).json({
        id: d.id, nick: d.nick, text: d.text, ts: normTs(d.ts), category: d.category || "전체",
      });
    } catch (e) {
      return res.status(500).json({ ok: false, reason: "upstream_error", error: String(e) });
    }
  }

  return res.status(405).json({ error: "method not allowed" });
}

// ─────────────────────────────────────────────────────────────────────────────
// [S29-12 백업] 이전 GitHub Issues 저장소 구현 — 이관 후 죽은 코드로 남긴다.
//   GitHub 쪽 글은 지우지 않았으므로(백업), 만약 :5002 이전을 되돌려야 하면 아래를 되살린다.
//   scripts/migrate-comments-to-5002.mjs 가 이 경로로 GitHub 글을 읽어 :5002 로 옮겼다.
//
// const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
// const GITHUB_REPO  = process.env.GITHUB_REPO || 'inyoung77cho-coder/one-hub-content';
// const API_BASE     = `https://api.github.com/repos/${GITHUB_REPO}`;
// async function ghFetch(path, options = {}) {
//   const res = await fetch(`${API_BASE}${path}`, { ...options, headers: {
//     'Authorization': `Bearer ${GITHUB_TOKEN}`, 'Accept': 'application/vnd.github+json',
//     'Content-Type': 'application/json', ...(options.headers || {}) } });
//   if (!res.ok) { const err = new Error(`GitHub API ${res.status}`); err.status = res.status; throw err; }
//   return res.json();
// }
// async function getOrCreateIssue(date) {
//   const issues = await ghFetch(`/issues?labels=comment&state=open&per_page=100`);
//   const existing = issues.find(i => i.title === `comments:${date}`);
//   if (existing) return existing.number;
//   const created = await ghFetch('/issues', { method: 'POST', body: JSON.stringify({
//     title: `comments:${date}`, body: `ONE-HUB Daily ${date} 댓글 스레드`, labels: ['comment'] }) });
//   return created.number;
// }
