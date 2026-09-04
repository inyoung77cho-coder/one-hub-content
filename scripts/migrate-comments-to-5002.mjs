// [S29-12] 댓글 이관 스크립트 — GitHub Issues → RE(:5002) accounts.db.comments.
//   GitHub 원본은 지우지 않는다(백업). :5002 backend 가 (thread,nick,text,ts) 중복을 건너뛰므로
//   여러 번 돌려도 안전하다.
//
//   실행(1회, 운영자):
//     GITHUB_TOKEN=ghp_xxx GITHUB_REPO=inyoung77cho-coder/one-hub-content \
//     RE_API_URL=http://54.180.54.132:5002 RE_ACCESS_KEY=<key> \
//     node scripts/migrate-comments-to-5002.mjs
//
//   ⚠️ RE_API_URL 이 프로덕션(:5002)을 직접 가리키려면 그 포트로 도달 가능해야 한다.
//      로컬에서 돌리면 SSH 터널(-L 5002:localhost:5002) 뒤 RE_API_URL=http://localhost:5002 권장.

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = process.env.GITHUB_REPO || "inyoung77cho-coder/one-hub-content";
const RE_API = process.env.RE_API_URL || "http://54.180.54.132:5002";
const RE_KEY = process.env.RE_ACCESS_KEY || "";
const API_BASE = `https://api.github.com/repos/${GITHUB_REPO}`;

if (!GITHUB_TOKEN) { console.error("GITHUB_TOKEN 필요"); process.exit(1); }

async function gh(path) {
  const r = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: "application/vnd.github+json" },
  });
  if (!r.ok) throw new Error(`GitHub ${r.status} ${path}`);
  return r.json();
}

async function postComment(thread, c) {
  const url = `${RE_API}/api/v2/comments?${RE_KEY ? `key=${encodeURIComponent(RE_KEY)}` : ""}`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-Key": RE_KEY },
    body: JSON.stringify({ thread, nick: c.nick, text: c.text, category: c.category, ts: c.ts }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.ok) throw new Error(`5002 ${r.status} ${JSON.stringify(d)}`);
  return d;
}

(async () => {
  console.log(`[migrate] GitHub(${GITHUB_REPO}) → ${RE_API}`);
  const issues = await gh(`/issues?labels=comment&state=all&per_page=100`);
  let threads = 0, total = 0, skipped = 0;
  for (const issue of issues) {
    const m = /^comments:(.+)$/.exec(issue.title || "");
    if (!m) continue;
    const thread = m[1];
    threads++;
    const comments = await gh(`/issues/${issue.number}/comments?per_page=100`);
    for (const c of comments) {
      let data;
      try { data = JSON.parse(c.body); } catch { data = { nick: "익명", text: c.body, category: "전체" }; }
      const row = {
        nick: (data.nick || "익명").slice(0, 20),
        text: (data.text || "").slice(0, 500),
        category: ["전체", "주식", "ETF", "부동산"].includes(data.category) ? data.category : "전체",
        ts: data.ts || c.created_at,
      };
      if (!row.text.trim()) continue;
      try {
        const d = await postComment(thread, row);
        total++;
        if (d.skipped === "dup") skipped++;
      } catch (e) { console.error(`  ! ${thread}: ${e.message}`); }
    }
    console.log(`  · ${thread}: ${comments.length}건 처리`);
  }
  console.log(`[migrate] 완료 — 스레드 ${threads} · 처리 ${total} · 중복건너뜀 ${skipped}. GitHub 원본은 그대로(백업).`);
})().catch((e) => { console.error(e); process.exit(1); });
