const ENGINE_API = process.env.ENGINE_API_URL || "http://54.180.54.132:5001";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ ok: false, error: "Method not allowed" });
  try {
    const upstream = await fetch(`${ENGINE_API}/api/push/vapid-key`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!upstream.ok) throw new Error(`Upstream error: ${upstream.status}`);
    const data = await upstream.json();
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json(data);
  } catch (err) {
    console.error("Push VAPID key API unreachable:", err.message);
    return res.status(200).json({ ok: false, error: "서버 연결에 실패했습니다." });
  }
}
