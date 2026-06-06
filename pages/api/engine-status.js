const ENGINE_API = process.env.ENGINE_API_URL || "http://54.180.54.132:5001";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  try {
    const upstream = await fetch(`${ENGINE_API}/api/engine-status`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!upstream.ok) throw new Error(`Upstream error: ${upstream.status}`);
    const data = await upstream.json();
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json(data);
  } catch (err) {
    console.error("Engine API unreachable:", err.message);
    return res.status(200).json({
      _offline: true,
      timestamp: new Date().toISOString(),
      engine: { is_active: false, status: "offline", process_count: 0 },
      holdings: [],
      schedule: [],
      strategy: [],
      version: "v8.0",
    });
  }
}
