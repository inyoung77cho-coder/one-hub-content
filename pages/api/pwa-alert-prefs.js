// pages/api/pwa-alert-prefs.js — 관심단지 저평가 알림 설정(P1-b) 프록시 → RE(:5002) /api/alerts/prefs.
//   /api/pwa- 프리픽스라 middleware 가 로그인 강제 + trader 를 세션 테넌트로 덮어씀(위조 불가).
//   GET  → 현재 설정  ·  POST { gap_enabled, gap_threshold } → 저장(trader 는 서버 강제값 사용)
const RE_API = process.env.RE_API_URL || "http://54.180.54.132:5002";
const RE_KEY = process.env.RE_ACCESS_KEY || "";

export default async function handler(req, res) {
  const trader = (req.query.trader || req.query.trader_id || "A").toString();
  const auth = RE_KEY ? `&key=${encodeURIComponent(RE_KEY)}` : "";
  const hdr = { "Content-Type": "application/json", "X-API-Key": RE_KEY };
  try {
    if (req.method === "GET") {
      const r = await fetch(`${RE_API}/api/alerts/prefs?trader_id=${encodeURIComponent(trader)}${auth}`,
        { headers: hdr, signal: AbortSignal.timeout(8000) });
      const d = await r.json().catch(() => ({ ok: false }));
      return res.status(200).json(d);
    }
    if (req.method === "POST") {
      const body = { ...(req.body || {}), trader_id: trader }; // trader 는 서버 강제값으로 고정
      const r = await fetch(`${RE_API}/api/alerts/prefs?key=${encodeURIComponent(RE_KEY)}`, {
        method: "POST", headers: hdr, body: JSON.stringify(body), signal: AbortSignal.timeout(8000),
      });
      const d = await r.json().catch(() => ({ ok: false }));
      return res.status(200).json(d);
    }
    return res.status(405).json({ ok: false, error: "method not allowed" });
  } catch (e) {
    return res.status(200).json({ ok: false, error: String(e) });
  }
}
