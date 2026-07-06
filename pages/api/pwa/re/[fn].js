// ONE-HUB v10 — 부동산 엔진(onehub-realestate, FastAPI, port 5002) 프록시
// ETF 프록시와 동일 패턴. 프로덕션(Vercel)은 RE_API_URL/RE_ACCESS_KEY 환경변수 사용.
// ⚠️ 5002는 Lightsail 방화벽 인바운드가 열려야 Vercel에서 도달 가능. RE_ACCESS_KEY(?key=)로 보호됨.
//    로컬 개발은 SSH 터널(localhost:5002) + RE_API_URL=http://localhost:5002 로 테스트.
const RE_API = process.env.RE_API_URL || "http://54.180.54.132:5002";
const RE_KEY = process.env.RE_ACCESS_KEY || "";

// fn → 백엔드 경로
const ENDPOINTS = {
  briefing: "/api/briefing",
  market: "/api/market",
  macro: "/api/macro",
  ranking: "/api/v2/ranking",
  stats: "/api/db/stats",
  holdings: "/api/v2/holdings",
};

export default async function handler(req, res) {
  const path = ENDPOINTS[req.query.fn];
  if (!path) return res.status(404).json({ error: "unknown endpoint" });
  try {
    const url = `${RE_API}${path}${RE_KEY ? `?key=${encodeURIComponent(RE_KEY)}` : ""}`;
    const resp = await fetch(url);
    const data = await resp.json();
    res.status(resp.status).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message, hint: "부동산 엔진(5002) 도달 실패 — 방화벽/터널/키 확인" });
  }
}
