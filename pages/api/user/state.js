// [기기 동기화] syncManager 백엔드 프록시 — /api/user/state → RE(:5002) /api/v2/user-state.
//   GET  /api/user/state?trader=A          → { ok, device, updatedAt, payload }
//   POST /api/user/state?trader=A  body{device,updatedAt,payload} → { ok }
//   ⚠️ 백엔드 미도달 시 ok:false → 클라이언트(syncManager)는 로컬만 사용(회귀 없음).
const RE_API = process.env.RE_API_URL || "http://54.180.54.132:5002";
const RE_KEY = process.env.RE_ACCESS_KEY || "";

export default async function handler(req, res) {
  const trader = (req.query.trader || "A").toString();
  const q = new URLSearchParams({ trader_id: trader });
  if (RE_KEY) q.set("key", RE_KEY);
  const url = `${RE_API}/api/v2/user-state?${q.toString()}`;
  try {
    const r = await fetch(url, {
      method: req.method,
      headers: { "Content-Type": "application/json", "X-API-Key": RE_KEY },
      body: req.method === "POST" ? JSON.stringify(req.body || {}) : undefined,
      signal: AbortSignal.timeout(6000),
    });
    const d = await r.json().catch(() => ({ ok: false }));
    return res.status(200).json(d && typeof d === "object" ? d : { ok: false });
  } catch (e) {
    return res.status(200).json({ ok: false, error: String(e) });
  }
}
