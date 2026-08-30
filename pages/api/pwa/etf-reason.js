// [ETF Phase2] 추천 후보 '이유'를 Claude로 다듬는 AI 유틸 프록시 → 영어엔진 :5005/english/etf-reco-reason.
// (영어엔진의 chat_json + 비용 서킷브레이커 재사용. 실패 시 프론트가 규칙문구로 폴백.)
const ENGLISH_API = process.env.ENGLISH_API_URL || "http://54.180.54.132:5005";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "POST only" });
  }
  try {
    const r = await fetch(`${ENGLISH_API}/english/etf-reco-reason`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body || {}),
      signal: AbortSignal.timeout(25000),
    });
    const data = await r.json().catch(() => ({ reasons: [] }));
    return res.status(r.status).json(data);
  } catch (e) {
    return res.status(200).json({ reasons: [] }); // 폴백: 프론트가 규칙문구 사용
  }
}
