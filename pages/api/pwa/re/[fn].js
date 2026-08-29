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
  feed: "/api/feed", // [v11 #16] 최근 실거래 변동 피드
  complexAreas: "/api/v2/complex-areas", // [S5+] 단지별 실거래 전용면적·평형·대표시세
  complexDongs: "/api/v2/complex-dongs", // [S5+] 단지→법정동 매핑(같은 동 필터)
  gapTracker: "/api/v2/gap-tracker", // [R-5] 평형 갈아타기 갭 시계열·적정밴드·판정
  upgradeGap: "/api/v2/upgrade-gap", // [R-5 시나리오B] 같은 동 단지 갈아타기 후보·갭·판정
  regionGap: "/api/v2/region-gap", // [R-5 시나리오C] 지역 변경 동 평균단가 갭·추적·판정
  weekly: "/api/re/weekly", // [FB-5 §5.4] 주간 부동산 리포트 요약(확정+미검증 병기)
  regionLeaders: "/api/region-leaders", // [Card2] 동네별 대장(주간 사전선정) 가벼운 읽기
};

// [내단지 포지션 v2] /api/trend/{apt_name} 는 단지명이 쿼리가 아니라 경로 파라미터라
//   위 fn→고정경로 매핑으로는 못 붙인다 — apt 쿼리를 받아 경로에 끼워 넣는다.
const PATH_PARAM_ENDPOINTS = {
  trend: (query) => `/api/trend/${encodeURIComponent(query.apt || "")}`,
};

// fn·key 외 추가 쿼리(complex 등)는 백엔드로 그대로 전달
function passThroughQuery(query, skipKeys) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (k === "fn" || k === "key" || v == null || (skipKeys && skipKeys.includes(k))) continue;
    p.set(k, Array.isArray(v) ? v[0] : String(v));
  }
  return p;
}

export default async function handler(req, res) {
  const fn = req.query.fn;
  const pathBuilder = PATH_PARAM_ENDPOINTS[fn];
  const path = pathBuilder ? pathBuilder(req.query) : ENDPOINTS[fn];
  if (!path) return res.status(404).json({ error: "unknown endpoint" });
  try {
    const p = passThroughQuery(req.query, pathBuilder ? ["apt"] : null);
    if (RE_KEY) p.set("key", RE_KEY);
    const qs = p.toString();
    const url = `${RE_API}${path}${qs ? `?${qs}` : ""}`;
    const resp = await fetch(url);
    const data = await resp.json();
    res.status(resp.status).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message, hint: "부동산 엔진(5002) 도달 실패 — 방화벽/터널/키 확인" });
  }
}
