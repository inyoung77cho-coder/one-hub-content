// pages/api/pwa-heat-history.js
// Proxy route: /api/pwa-heat-history?trader=A|B&limit=50
// Forwards to Flask engine_status_api.py /api/pwa/heat-history

const ENGINE_API = 'http://54.180.54.132:5001';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { trader = 'A', limit = '50' } = req.query;

  try {
    const apiKey = process.env.PWA_API_KEY;
    const url = `${ENGINE_API}/api/pwa/heat-history?trader=${encodeURIComponent(trader)}&limit=${encodeURIComponent(limit)}`;

    const response = await fetch(url, {
      headers: {
        'X-API-Key': apiKey,
      },
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: `Engine API error: ${response.status}` });
    }

    const data = await response.json();
    return res.status(200).json(data);
  } catch (error) {
    console.error('pwa-heat-history proxy error:', error);
    return res.status(500).json({ error: 'Failed to fetch heat history' });
  }
}
