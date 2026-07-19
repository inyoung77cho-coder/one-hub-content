// pages/api/feedback.js — NI-6 인앱 피드백 수집.
// GitHub 이슈를 데이터스토어로 사용(프로덕션 백엔드 무손댐 · comments.js와 동일 패턴).
// 이슈 생성 시 GitHub가 repo owner(InYoung)에게 자동 알림 → NI-6-e(알림) 1차 충족.
// ★신원(누가)은 클라이언트가 아니라 서버 세션에서 기록(조작 금지).
import { verifySession, SESSION_COOKIE } from "../../lib/auth";
import { tenantFromSession } from "../../lib/tenant";

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = process.env.GITHUB_REPO || "inyoung77cho-coder/one-hub-content";
const API_BASE = `https://api.github.com/repos/${GITHUB_REPO}`;

// NI-6-c 카테고리 4종(분류는 지인이 아니라 버튼이 한다)
const CATEGORIES = { bug: "버그", inconvenience: "불편", suggestion: "제안", praise: "칭찬" };

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

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "method not allowed" });

  const session = await verifySession(parseCookies(req.headers.cookie)[SESSION_COOKIE]);
  if (!session) return res.status(401).json({ ok: false, error: "unauthorized" });
  const t = tenantFromSession(session) || {};

  const { category, message, screen, appVersion } = req.body || {};
  const cat = CATEGORIES[category] ? category : "suggestion";
  const msg = String(message || "").trim();
  if (!msg) return res.status(400).json({ ok: false, error: "내용을 입력해주세요" });
  if (msg.length > 2000) return res.status(400).json({ ok: false, error: "2000자 이하로 작성해주세요" });

  const nickname = session.nickname || "익명";
  const scr = (String(screen || "").slice(0, 60)) || "(미상)";
  const ver = String(appVersion || "").slice(0, 40);
  const kakaoId = String(session.sub || "").replace(/^kakao:/, "");
  const catKo = CATEGORIES[cat];

  // 대시보드가 안정적으로 파싱하도록 본문 맨 앞에 JSON을 주석으로 심고, 아래에 사람이 읽을 요약.
  const record = {
    kakaoId, tenant: t.tenant, nickname, screen: scr,
    category: cat, message: msg, app_version: ver,
    created_at: new Date().toISOString(),
  };
  const title = `[${catKo}] ${scr} — ${msg.slice(0, 40)}`;
  const body = `<!--FB:${JSON.stringify(record)}-->\n**${catKo}** · ${nickname} · 화면: ${scr}${ver ? ` · v${ver}` : ""}\n\n${msg}`;

  try {
    const issue = await gh(`/issues`, {
      method: "POST",
      body: JSON.stringify({ title, body, labels: ["feedback", `fb:${cat}`, "status:new"] }),
    });
    return res.status(201).json({ ok: true, id: issue.number });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
