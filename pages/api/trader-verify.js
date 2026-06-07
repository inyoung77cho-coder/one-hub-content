export default async function handler(req, res) {
  const { trader_id } = req.query;
  const ENGINE_API = process.env.ENGINE_API_URL || "http://54.180.54.132:5001";
  try {
    const response = await fetch(`${ENGINE_API}/api/trader/verify/${trader_id}`);
    const data = await response.json();
    res.status(200).json(data);
  } catch (e) {
    res.status(500).json({ ok: false, error: "서버 연결 오류: " + e.message });
  }
}