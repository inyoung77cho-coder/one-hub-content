// pages/api/pwa-alert-history.js — 관심단지 알림 이력(P1-b) 프록시 → RE(:5002) /api/alerts/history.
//   /api/pwa- 프리픽스라 middleware 가 로그인 강제 + trader 를 세션 테넌트로 덮어씀.
const RE_API = process.env.RE_API_URL || "http://54.180.54.132:5002";
const RE_KEY = process.env.RE_ACCESS_KEY || "";

export default async function handler(req, res) {
  const trader = (req.query.trader || req.query.trader_id || "A").toString();
  const limit = Math.min(parseInt(req.query.limit, 10) || 30, 100);
  const auth = RE_KEY ? `&key=${encodeURIComponent(RE_KEY)}` : "";
  try {
    const r = await fetch(
      `${RE_API}/api/alerts/history?trader_id=${encodeURIComponent(trader)}&limit=${limit}${auth}`,
      { headers: { "Content-Type": "application/json", "X-API-Key": RE_KEY }, signal: AbortSignal.timeout(8000) });
    const d = await r.json().catch(() => ({ ok: false, items: [] }));
    return res.status(200).json(d);
  } catch (e) {
    return res.status(200).json({ ok: false, error: String(e), items: [] });
  }
}
