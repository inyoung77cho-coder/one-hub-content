import { requireTenant } from "../../lib/reqTenant";
const ENGINE_API = process.env.ENGINE_API_URL || "http://54.180.54.132:5001";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const trader = requireTenant(req, res); // [S47 후속] x-oh-tenant 만 신뢰(쿼리·A 기본값 금지)
  if (!trader) return;
  const days = req.query.days || "30";
  try {
    const upstream = await fetch(`${ENGINE_API}/api/pwa/leaderboard?trader=${encodeURIComponent(trader)}&days=${encodeURIComponent(days)}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!upstream.ok) throw new Error(`Upstream error: ${upstream.status}`);
    const data = await upstream.json();
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json(data);
  } catch (err) {
    return res.status(200).json({ ok: false, error: err.message, strategies: [], sectors: [] });
  }
}
