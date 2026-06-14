const ENGINE_API = process.env.ENGINE_API_URL || "http://54.180.54.132:5001";

export default async function handler(req, res) {
  const trader = (req.query.trader || "A").toString();

  try {
    if (req.method === "GET") {
      const upstream = await fetch(`${ENGINE_API}/api/pwa/watchlist?trader=${encodeURIComponent(trader)}`, {
        signal: AbortSignal.timeout(8000),
      });
      const data = await upstream.json();
      res.setHeader("Cache-Control", "no-store");
      return res.status(upstream.status).json(data);
    }

    if (req.method === "POST") {
      const upstream = await fetch(`${ENGINE_API}/api/pwa/watchlist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req.body),
        signal: AbortSignal.timeout(8000),
      });
      const data = await upstream.json();
      return res.status(upstream.status).json(data);
    }

    if (req.method === "DELETE") {
      const { id } = req.query;
      if (!id) return res.status(400).json({ ok: false, error: "id required" });
      const upstream = await fetch(`${ENGINE_API}/api/pwa/watchlist/${encodeURIComponent(id)}?trader=${encodeURIComponent(trader)}`, {
        method: "DELETE",
        signal: AbortSignal.timeout(8000),
      });
      const data = await upstream.json();
      return res.status(upstream.status).json(data);
    }

    return res.status(405).json({ ok: false, error: "Method not allowed" });
  } catch (err) {
    console.error("PWA watchlist API unreachable:", err.message);
    return res.status(200).json({ ok: false, _offline: true, error: err.message, items: [] });
  }
}
