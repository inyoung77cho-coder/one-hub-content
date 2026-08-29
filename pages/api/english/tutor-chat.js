// [주말 AI 튜터] Claude 기반 자유 대화 프록시 → 영어 엔진 :5005/english/tutor-chat.
// 그 주 배운 표현을 자연스럽게 쓰도록 유도하는 대화. 비용은 엔진 서킷브레이커가 관리.
const ENGLISH_API = process.env.ENGLISH_API_URL || "http://54.180.54.132:5005";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "POST only" });
  }
  try {
    const r = await fetch(`${ENGLISH_API}/english/tutor-chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body || {}),
      signal: AbortSignal.timeout(25000),
    });
    const data = await r.json().catch(() => ({}));
    return res.status(r.status).json(data);
  } catch (e) {
    return res.status(502).json({ error: "tutor proxy failed" });
  }
}
