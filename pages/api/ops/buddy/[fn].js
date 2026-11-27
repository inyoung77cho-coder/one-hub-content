// [S51-2] 버니 AI 비서 프록시 → 영어 엔진 :5005 /buddy/*.
//   /api/ops/ 아래라 middleware 가 admin 만 통과시킨다(ADMIN_ONLY_API). 여기서도 테넌트·역할을 다시 본다.
//   화이트리스트: daily(POST) · job(GET, id) · chat(POST). 그 외 404.
//   :5005 는 인터넷에 열려 있어 엔진이 X-Admin-Key 를 요구한다 — 값은 Vercel 환경변수 ENGLISH_ADMIN_KEY.
//   본문(사실표·질문)은 로그에 남기지 않는다. 상류 status 를 그대로 전달한다(실패를 가짜 문장으로 바꾸지 않는다).
import { requireTenant } from "../../../../lib/reqTenant";

const ENGLISH_API = process.env.ENGLISH_API_URL || "http://54.180.54.132:5005";
const KEY = process.env.ENGLISH_ADMIN_KEY || "";

// 생성은 엔진의 작업(job) 방식이라 daily·job 은 바로 돌아온다. chat(조사 아님)만 LLM 1회를 기다린다.
export const config = { maxDuration: 60 };

const ROUTES = {
  daily: { method: "POST", timeout: 20000 },
  job: { method: "GET", timeout: 10000 },
  chat: { method: "POST", timeout: 55000 },
};

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const fn = String(req.query.fn || "");
  const route = ROUTES[fn];
  if (!route) return res.status(404).json({ error: "not_found" });
  if (req.method !== route.method) {
    res.setHeader("Allow", route.method);
    return res.status(405).json({ error: "method_not_allowed" });
  }
  if (!requireTenant(req, res)) return;
  if (req.headers["x-oh-role"] !== "admin") return res.status(403).json({ error: "forbidden" });
  if (!KEY) return res.status(503).json({ error: "buddy_key_missing" });

  let url = `${ENGLISH_API}/buddy/${fn}`;
  if (fn === "job") {
    const id = String(req.query.id || "");
    if (!/^[0-9a-f]{32}$/.test(id)) return res.status(400).json({ error: "bad_request" });
    url = `${ENGLISH_API}/buddy/job/${id}`;
  }
  try {
    const r = await fetch(url, {
      method: route.method,
      headers: { "Content-Type": "application/json", "X-Admin-Key": KEY },
      body: route.method === "POST" ? JSON.stringify(req.body || {}) : undefined,
      signal: AbortSignal.timeout(route.timeout),
    });
    const data = await r.json().catch(() => ({ error: "bad_upstream_json" }));
    return res.status(r.status).json(data);
  } catch (e) {
    return res.status(502).json({ error: "proxy_failed" });
  }
}
