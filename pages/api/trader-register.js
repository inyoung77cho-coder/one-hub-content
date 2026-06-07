export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const ENGINE_API = process.env.ENGINE_API_URL || "http://54.180.54.132:5001";

  try {
    const response = await fetch(`${ENGINE_API}/api/trader/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body),
    });
    const data = await response.json();
    res.status(200).json(data);
  } catch (e) {
    res.status(500).json({ ok: false, error: "서버 연결 오류: " + e.message });
  }
}