// [Live 카라오케] BBC 카라오케 오디오(mp3) 프록시 — :5005/english/karaoke-audio/{key}.mp3.
const ENGLISH_API = process.env.ENGLISH_API_URL || "http://54.180.54.132:5005";

export default async function handler(req, res) {
  const file = String(req.query.file || "");
  if (!/^[A-Za-z0-9]+\.mp3$/.test(file)) return res.status(400).json({ error: "bad file" });
  try {
    const r = await fetch(`${ENGLISH_API}/english/karaoke-audio/${file}`, { signal: AbortSignal.timeout(15000) });
    if (!r.ok) return res.status(r.status).json({ error: "not found" });
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "public, max-age=604800");
    return res.status(200).send(Buffer.from(await r.arrayBuffer()));
  } catch (e) {
    return res.status(502).json({ error: "audio proxy failed" });
  }
}
