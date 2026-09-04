export default async function handler(req, res) {
  const trader_id = req.query.trader_id || 'A';
  // [S28-2] 90일 일별 정확도 시계열 조회를 위해 days 통과. 없으면 기존 응답(summary/by_reason/recent) 그대로.
  const days = req.query.days ? `&days=${encodeURIComponent(req.query.days)}` : '';
  try {
    const resp = await fetch(`http://54.180.54.132:5001/api/pwa/accuracy?trader_id=${trader_id}${days}`);
    const data = await resp.json();
    res.status(200).json(data);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
}
