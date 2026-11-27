// [S49-2] 수업 후 버니 선생님 대화 프록시 → 영어 엔진 :5005/english/lesson-chat.
// tutor-chat.js 와 같은 골격. 지문은 엔진이 lesson_id 로 직접 읽는다(클라가 보내지 않음).
// 상류 status 를 그대로 전달한다(502 llm_failed · 503 llm_unavailable · 404 lesson_not_found) —
// 실패를 가짜 튜터 문장으로 바꾸지 않는다(집 규칙). 대화 본문은 로그에 남기지 않는다.
const ENGLISH_API = process.env.ENGLISH_API_URL || "http://54.180.54.132:5005";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "POST only" });
  }
  try {
    const r = await fetch(`${ENGLISH_API}/english/lesson-chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body || {}),
      signal: AbortSignal.timeout(25000),
    });
    const data = await r.json().catch(() => ({ error: "bad_upstream_json" }));
    res.setHeader("Cache-Control", "no-store");
    return res.status(r.status).json(data);
  } catch (e) {
    res.setHeader("Cache-Control", "no-store");
    return res.status(502).json({ error: "proxy_failed" });
  }
}
