export default async function handler(req, res) {
  const trader_id = req.query.trader_id || 'A';
  try {
    const resp = await fetch(http://54.180.54.132:5001/api/pwa/accuracy?trader_id=);
    const data = await resp.json();
    res.status(200).json(data);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
}
