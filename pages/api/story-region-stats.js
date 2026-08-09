// [이야기 탭] 지역(동)별 이야기 활동 집계 — "참석자"를 식별할 장치가 없어(닉네임은
//   로그인과 무관한 자유 입력) 참석자 수 대신 실제로 있는 데이터인 "동별 이야기 건수"를 센다.
//   pages/api/comments.js와 동일하게 GitHub Issues(comment 라벨)를 쓰되, 이슈 각각을 열어
//   댓글을 전부 받아오지 않고 목록 응답의 `comments`(개수) 필드만 읽어 API 호출을 1회로 줄인다.
import { KNOWN_DONGS } from "../../lib/storyRegion";

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = process.env.GITHUB_REPO || "inyoung77cho-coder/one-hub-content";
const API_BASE = `https://api.github.com/repos/${GITHUB_REPO}`;

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "method not allowed" });

  try {
    const r = await fetch(`${API_BASE}/issues?labels=comment&state=open&per_page=100`, {
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
      },
    });
    if (!r.ok) throw new Error(`GitHub API ${r.status}`);
    const issues = await r.json();

    const counts = {};
    for (const dong of KNOWN_DONGS) counts[dong] = 0;
    for (const issue of issues) {
      const m = /^comments:(.+)$/.exec(issue.title || "");
      const region = m && m[1];
      if (region && Object.prototype.hasOwnProperty.call(counts, region)) {
        counts[region] = issue.comments || 0;
      }
    }

    res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
    return res.status(200).json({ ok: true, counts });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
