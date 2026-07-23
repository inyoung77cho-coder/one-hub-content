// [자기검증] 오늘 vs 직전 분석일 AI 판단 diff 프록시 (:5001 /api/pwa/ai-daily/<trader>)
const ENGINE_API = process.env.ENGINE_API_URL || 'http://54.180.54.132:5001';

export default async function handler(req, res) {
  const trader = req.query.trader === 'B' ? 'B' : 'A';
  try {
    const upstream = await fetch(`${ENGINE_API}/api/pwa/ai-daily/${trader}`, {
      signal: AbortSignal.timeout(8000),
    });
    const data = await upstream.json();
    res.setHeader('Cache-Control', 'no-store');
    return res.status(upstream.ok ? 200 : 500).json(data);
  } catch (err) {
    return res.status(200).json({ ok: false, error: err.message, today: [], changes: [] });
  }
}
