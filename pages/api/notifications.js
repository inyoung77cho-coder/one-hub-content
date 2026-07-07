// 알림 센터 프록시 — 5001 /api/notifications (텔레그램/리포트/큐 동기화 피드)
const ENGINE_API = process.env.ENGINE_API_URL || "http://54.180.54.132:5001";
export default async function handler(req, res) {
  const trader = req.query.trader || req.query.trader_id || "A";
  const since = req.query.since || 0;
  try {
    const upstream = await fetch(
      `${ENGINE_API}/api/notifications?trader_id=${trader}&since=${since}`,
      {
        headers: { "X-API-Key": process.env.PWA_API_KEY || "" },
        signal: AbortSignal.timeout(8000),
      }
    );
    const data = await upstream.json();
    res.setHeader("Cache-Control", "no-store");
    return res.status(upstream.status).json(Array.isArray(data) ? { ok: true, items: data } : data);
  } catch (err) {
    return res.status(200).json({ ok: false, items: [], error: err.message });
  }
}
