const ENGINE_API = process.env.ENGINE_API_URL || "http://54.180.54.132:5001";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const trader = (req.query.trader || "A").toString();
  try {
    const upstream = await fetch(`${ENGINE_API}/api/pwa/dashboard?trader=${encodeURIComponent(trader)}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!upstream.ok) throw new Error(`Upstream error: ${upstream.status}`);
    const data = await upstream.json();
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json(data);
  } catch (err) {
    console.error("PWA dashboard API unreachable:", err.message);
    return res.status(200).json({
      ok: false,
      _offline: true,
      error: err.message,
    });
  }
}
