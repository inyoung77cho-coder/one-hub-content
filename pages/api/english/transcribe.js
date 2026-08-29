// [주말 대화] 녹음 답변(오디오) → 영어 엔진 :5005/english/transcribe(faster-whisper) 프록시.
// 원본 바이너리를 그대로 전달한다(multipart 파싱 없이). 타이핑 대신 '말하기'로 답하기 위한 것.
export const config = { api: { bodyParser: false } };

const ENGLISH_API = process.env.ENGLISH_API_URL || "http://54.180.54.132:5005";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "POST only" });
  }
  try {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = Buffer.concat(chunks);
    if (body.length > 8_000_000) return res.status(413).json({ error: "audio too large" });
    // 튜터가 유도 중인 표현을 힌트로 상류에 전달 → whisper initial_prompt 편향(정확도↑)
    const hint = typeof req.query.hint === "string" ? req.query.hint.slice(0, 400) : "";
    const upstream = `${ENGLISH_API}/english/transcribe${hint ? `?hint=${encodeURIComponent(hint)}` : ""}`;
    const r = await fetch(upstream, {
      method: "POST",
      headers: { "Content-Type": req.headers["content-type"] || "application/octet-stream" },
      body,
      signal: AbortSignal.timeout(30000),
    });
    const data = await r.json().catch(() => ({ text: "" }));
    return res.status(r.status).json(data);
  } catch (e) {
    return res.status(502).json({ error: "transcribe proxy failed" });
  }
}
