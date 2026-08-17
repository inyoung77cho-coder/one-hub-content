// 지문 낭독 mp3 프록시 — <audio src="/api/english/audio/12"> 로 쓴다.
// 백엔드(:5005)는 Vercel에서만 도달하므로 브라우저가 직접 치지 않고 여기를 거친다.
// 파일은 1분 내외(300~500KB)라 통째로 받아 넘긴다.
const ENGLISH_API = process.env.ENGLISH_API_URL || "http://54.180.54.132:5005";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).end();
  }
  const id = String(req.query.id || "").replace(/\.mp3$/i, "");
  if (!/^\d+$/.test(id)) return res.status(400).json({ error: "bad id" });

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const r = await fetch(`${ENGLISH_API}/english/audio/${id}.mp3`, { signal: ctrl.signal });
    if (!r.ok) return res.status(r.status).json({ error: "audio not found" });
    const buf = Buffer.from(await r.arrayBuffer());
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Content-Length", String(buf.length));
    // 레슨 오디오는 한 번 만들어지면 바뀌지 않는다.
    res.setHeader("Cache-Control", "private, max-age=86400");
    return res.status(200).send(buf);
  } catch (e) {
    return res.status(504).json({ error: "audio 연결 실패" });
  } finally {
    clearTimeout(timer);
  }
}
