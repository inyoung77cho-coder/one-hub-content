// lib/reqTenant.js — API 라우트(Node)에서 미들웨어가 강제한 테넌트를 읽는다.
// 미들웨어가 x-oh-tenant 헤더로 세션 테넌트를 실어주고, trader 쿼리도 덮어쓴다.
// 여기서는 헤더를 우선 신뢰(클라 본문/쿼리 값은 믿지 않는다).
export function reqTenant(req) {
  const h = req.headers?.["x-oh-tenant"];
  if (h) return String(h);
  const q = req.query || {};
  return String(q.trader || q.trader_id || "A");
}

// POST 본문에 서버 결정 테넌트를 강제 주입(클라가 보낸 trader/trader_id 덮어씀).
export function bodyWithTenant(req) {
  const t = reqTenant(req);
  return { ...(req.body || {}), trader: t, trader_id: t };
}
