// 단어·표현 즉석 발음 mp3 프록시 — <audio src="/api/english/speak?text=..&language=en">.
// 백엔드(:5005)는 Vercel에서만 도달하므로 브라우저가 직접 치지 않고 여기를 거친다.
// edge-tts(무료)라 LLM 사용량 한도와 무관하게 항상 동작 — 지문 오디오(audio/[id].js)와
// 달리 텍스트가 매번 다를 수 있어 캐시는 백엔드가 (text,language) 해시로 담당한다.
const ENGLISH_API = process.env.ENGLISH_API_URL || "http://54.180.54.132:5005";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).end();
  }
  const text = String(req.query.text || "").trim().slice(0, 200);
  if (!text) return res.status(400).json({ error: "text required" });
  const language = req.query.language === "zh" ? "zh" : "en";

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const url = `${ENGLISH_API}/english/speak?text=${encodeURIComponent(text)}&language=${language}`;
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) return res.status(r.status).json({ error: "speak failed" });
    const buf = Buffer.from(await r.arrayBuffer());
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Content-Length", String(buf.length));
    // 같은 텍스트는 같은 발음 — 브라우저 캐시도 오래 유지해 재요청 자체를 줄인다.
    res.setHeader("Cache-Control", "private, max-age=2592000");
    return res.status(200).send(buf);
  } catch (e) {
    return res.status(504).json({ error: "english 연결 실패" });
  } finally {
    clearTimeout(timer);
  }
}
