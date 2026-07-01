const ENGINE_API = process.env.ENGINE_API_URL || 'http://54.180.54.132:5001';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });
  try {
    const { code, trader } = req.body || {};
    if (!code) return res.status(400).json({ ok: false, error: 'code required' });
    const upstream = await fetch(`${ENGINE_API}/api/pwa/sell`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, trader: trader || 'A' }),
      signal: AbortSignal.timeout(15000),
    });
    const data = await upstream.json();
    return res.status(upstream.ok ? 200 : 500).json(data);
  } catch (err) {
    console.error('PWA sell proxy error:', err.message);
    return res.status(500).json({ ok: false, error: '서버 연결 오류: ' + err.message });
  }
}
