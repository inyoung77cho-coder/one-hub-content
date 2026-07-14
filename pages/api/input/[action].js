// ONE-HUB — 입력 간편화(WO-INPUT) 통합 프록시
//  · RE(:5002)  검색/면적/보유추가/운영자속보  → ?key=RE_ACCESS_KEY (+ 속보는 X-Operator-Key)
//  · ENG(:5001) 주식검색/KIS불러오기/ETF검색/ETF추가 → X-API-Key=PWA_API_KEY
// 로컬 개발: SSH 터널(localhost:5001/5002) + .env.local 에 RE_API_URL/ENGINE_API_URL/키 설정.
const RE = process.env.RE_API_URL || "http://54.180.54.132:5002";
const ENG = process.env.ENGINE_API_URL || "http://54.180.54.132:5001";
const RE_KEY = process.env.RE_ACCESS_KEY || "";
const PWA_KEY = process.env.PWA_API_KEY || "";

// action → 백엔드 매핑
const MAP = {
  "re-search": { base: RE, path: "/api/re/search-complex", methods: ["GET"], reKey: true },
  "re-areas": { base: RE, path: "/api/v2/complex-areas", methods: ["GET"], reKey: true },
  "re-add": { base: RE, path: "/api/v2/holdings", methods: ["POST"], reKey: true },
  "re-spot": { base: RE, path: "/api/re/spot", methods: ["GET", "POST"], reKey: true, operator: true },
  "stock-search": { base: ENG, path: "/api/stocks/search", methods: ["GET"], pwaKey: true },
  "master-search": { base: ENG, path: "/api/stocks/master-search", methods: ["GET"], pwaKey: true },
  "master-get": { base: ENG, path: "/api/stocks/master-get", methods: ["GET"], pwaKey: true },
  "company-info": { base: ENG, path: "/api/stocks/company-info", methods: ["GET"], pwaKey: true },
  "kis-import": { base: ENG, path: "/api/import/kis-stock", methods: ["POST"], pwaKey: true },
  "etf-search": { base: ENG, path: "/api/etf/search", methods: ["GET"], pwaKey: true },
  "etf-add": { base: ENG, path: "/api/etf/positions", methods: ["POST"], pwaKey: true },
};

export default async function handler(req, res) {
  const cfg = MAP[req.query.action];
  if (!cfg) return res.status(404).json({ ok: false, error: "unknown action" });
  if (!cfg.methods.includes(req.method))
    return res.status(405).json({ ok: false, error: "method not allowed" });

  // 쿼리 전달(action 제외) + RE 미들웨어 키
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(req.query)) {
    if (k === "action" || v == null) continue;
    q.set(k, Array.isArray(v) ? v[0] : String(v));
  }
  if (cfg.reKey && RE_KEY) q.set("key", RE_KEY);
  const qs = q.toString();
  const url = `${cfg.base}${cfg.path}${qs ? "?" + qs : ""}`;

  const headers = { "Content-Type": "application/json" };
  if (cfg.pwaKey && PWA_KEY) headers["X-API-Key"] = PWA_KEY;
  if (cfg.reKey && RE_KEY) headers["X-API-Key"] = RE_KEY;
  if (cfg.operator && RE_KEY) headers["X-Operator-Key"] = RE_KEY; // 운영자 게이트

  try {
    const r = await fetch(url, {
      method: req.method,
      headers,
      body: req.method === "POST" ? JSON.stringify(req.body || {}) : undefined,
    });
    const text = await r.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
    res.status(r.status).json(data);
  } catch (e) {
    res.status(502).json({ ok: false, error: "백엔드 연결 실패", detail: e.message });
  }
}
