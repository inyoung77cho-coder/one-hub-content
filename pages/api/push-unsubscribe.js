import { bodyWithTenant, requireTenant } from "../../lib/reqTenant";
const ENGINE_API = process.env.ENGINE_API_URL || "http://54.180.54.132:5001";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });
  // [S47 후속] 본문 trader 는 서버 테넌트로 강제
  if (!requireTenant(req, res)) return;
  try {
    const upstream = await fetch(`${ENGINE_API}/api/push/unsubscribe`, {
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
    console.error("Push unsubscribe API unreachable:", err.message);
    return res.status(200).json({ ok: false, _offline: true, error: err.message });
  }
}
