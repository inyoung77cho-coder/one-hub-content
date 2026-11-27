// ONE-HUB UX v3.0 — 부동산 Mission API 캐치올 프록시 (RE 엔진 5002 /api/v2/*)
// ⚠️ 작업지시서 원본에 없던 RE_ACCESS_KEY(?key=)를 반드시 부착(프로덕션 5002는 키 필수).
import { requireTenant, tenantQuery, bodyWithTenant } from "../../../../lib/reqTenant";
const RE_API = process.env.RE_API_URL || "http://54.180.54.132:5002";
const RE_KEY = process.env.RE_ACCESS_KEY || "";

export default async function handler(req, res) {
  const parts = req.query.path || [];
  const path = Array.isArray(parts) ? parts.join("/") : parts;
  const tenant = requireTenant(req, res); // [S47 후속] trader/trader_id 는 서버 테넌트로 강제
  if (!tenant) return;
  const q = tenantQuery(req, tenant, ["path", "key"]);
  if (RE_KEY) q.set("key", RE_KEY);
  const qs = q.toString();
  const url = `${RE_API}/api/v2/${path}${qs ? "?" + qs : ""}`;
  try {
    const r = await fetch(url, {
      method: req.method,
      headers: { "Content-Type": "application/json", "X-API-Key": RE_KEY },
      body: req.method !== "GET" && req.method !== "HEAD" ? JSON.stringify(bodyWithTenant(req)) : undefined,
    });
    const data = await r.json();
    res.status(r.status).json(data);
  } catch (e) {
    res.status(502).json({ error: "부동산 API 연결 실패", detail: e.message });
  }
}
