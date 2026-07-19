// 장외 예약 승인 프록시 — 5001 /api/pwa/queue-pending (status=queued, 다음장 09:00 릴리스)
import { bodyWithTenant } from "../../lib/reqTenant";
const ENGINE_API = process.env.ENGINE_API_URL || "http://54.180.54.132:5001";
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });
  try {
    const upstream = await fetch(`${ENGINE_API}/api/pwa/queue-pending`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": process.env.PWA_API_KEY || "",
      },
      body: JSON.stringify(bodyWithTenant(req)),
      signal: AbortSignal.timeout(8000),
    });
    const data = await upstream.json();
    return res.status(upstream.status).json(data);
  } catch (err) {
    console.error("PWA queue-pending API unreachable:", err.message);
    return res.status(200).json({ ok: false, _offline: true, error: err.message });
  }
}
