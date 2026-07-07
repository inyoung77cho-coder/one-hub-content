// 운영 안정성 Sprint — System Health 프록시 (Stock 엔진 5001 /api/health/*)
// 선택적 Admin 인증: 서버에 ADMIN_KEY 설정 시 X-Admin-Key 헤더가 일치해야 함.
const ENGINE_API = process.env.ENGINE_API_URL || "http://54.180.54.132:5001";
const PWA_KEY = process.env.PWA_API_KEY || "";
const ADMIN_KEY = process.env.ADMIN_KEY || "";

export default async function handler(req, res) {
  // Admin 게이트 (ADMIN_KEY 미설정 시 개인용으로 통과)
  if (ADMIN_KEY && req.headers["x-admin-key"] !== ADMIN_KEY) {
    return res.status(401).json({ error: "unauthorized" });
  }
  const parts = req.query.path || [];
  const path = Array.isArray(parts) ? parts.join("/") : parts;
  const q = { ...req.query };
  delete q.path;
  const qs = new URLSearchParams(q).toString();
  const url = `${ENGINE_API}/api/health/${path}${qs ? "?" + qs : ""}`;
  try {
    const upstream = await fetch(url, {
      method: req.method,
      headers: { "X-API-Key": PWA_KEY, "Content-Type": "application/json" },
      body: req.method !== "GET" && req.method !== "HEAD" ? JSON.stringify(req.body || {}) : undefined,
      signal: AbortSignal.timeout(9000),
    });
    const data = await upstream.json();
    res.setHeader("Cache-Control", "no-store");
    return res.status(upstream.status).json(data);
  } catch (err) {
    return res.status(200).json({ error: "엔진 연결 실패", detail: err.message });
  }
}
