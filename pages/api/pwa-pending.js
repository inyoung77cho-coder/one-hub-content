import { requireTenant } from "../../lib/reqTenant";
const ENGINE_API = process.env.ENGINE_API_URL || "http://54.180.54.132:5001";
export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ ok: false, error: "Method not allowed" });
  const trader = requireTenant(req, res); // [S47 후속] x-oh-tenant 만 신뢰(쿼리·A 기본값 금지)
  if (!trader) return;
  try {
    const upstream = await fetch(`${ENGINE_API}/api/pwa/pending?trader=${encodeURIComponent(trader)}`, {
      signal: AbortSignal.timeout(8000),
    });
    const data = await upstream.json();
    res.setHeader("Cache-Control", "no-store");
    return res.status(upstream.status).json(data);
  } catch (err) {
    console.error("PWA pending API unreachable:", err.message);
    return res.status(200).json({ ok: false, _offline: true, error: err.message, items: [] });
  }
}
