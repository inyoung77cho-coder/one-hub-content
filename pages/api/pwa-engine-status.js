const ENGINE_API = process.env.ENGINE_API_URL || "http://54.180.54.132:5001";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const trader = req.query.trader === "B" ? "B" : "A";
  try {
    const upstream = await fetch(`${ENGINE_API}/api/pwa/engine-status/${trader}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!upstream.ok) throw new Error(`Upstream error: ${upstream.status}`);
    const data = await upstream.json();
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json(data);
  } catch (err) {
    return res.status(200).json({
      ok: false, error: err.message,
      is_analyzing: false, last_analysis_at: null, last_scan_count: null,
    });
  }
}
