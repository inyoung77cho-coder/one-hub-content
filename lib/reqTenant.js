// lib/reqTenant.js — API 라우트(Node)에서 미들웨어가 강제한 테넌트를 읽는다.
// 미들웨어가 x-oh-tenant 헤더로 세션 테넌트(관리자는 A/B 전환 반영)를 실어준다.
//
// ★[S47 후속] 헤더만 신뢰한다. 쿼리(trader/trader_id)는 절대 읽지 않는다.
//   미들웨어의 rewrite(url) 로 덮어쓴 쿼리는 pages/api 의 req.query 에 반영되지 않고
//   클라가 보낸 원래 쿼리가 남는다(next dev·next start 로컬 재현). 쿼리 폴백은 곧 위조 통로.
//   헤더가 없으면(미들웨어를 안 거친 경로) null → 호출부가 401(fail-closed). 'A' 기본값 금지.
//   신규 카카오 사용자 테넌트는 'u<id>' — A/B 로 강제 변환하지 말 것(남의 데이터가 된다).
const TENANT_RE = /^[A-Za-z0-9_-]{1,64}$/;

export function reqTenant(req) {
  const h = req.headers?.["x-oh-tenant"];
  const v = Array.isArray(h) ? h[0] : h;
  if (!v) return null;
  const s = String(v);
  return TENANT_RE.test(s) ? s : null;
}

// 테넌트를 못 정하면 401 응답을 보내고 null 을 돌려준다.
//   사용: const trader = requireTenant(req, res); if (!trader) return;
export function requireTenant(req, res) {
  const t = reqTenant(req);
  if (!t) {
    res.status(401).json({ ok: false, error: "unauthorized" });
    return null;
  }
  return t;
}

// POST 본문에 서버 결정 테넌트를 강제 주입(클라가 보낸 trader/trader_id 덮어씀).
//   테넌트가 없으면 null — 호출부는 requireTenant 로 먼저 막을 것.
export function bodyWithTenant(req) {
  const t = reqTenant(req);
  if (!t) return null;
  return { ...(req.body || {}), trader: t, trader_id: t };
}

// 쿼리 패스스루 프록시용: 클라 쿼리에서 trader/trader_id 를 버리고 서버 테넌트로 채운다.
//   skipKeys: 함께 버릴 키(라우팅 파라미터 등). 반환: URLSearchParams.
export function tenantQuery(req, tenant, skipKeys = []) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(req.query || {})) {
    if (v == null || k === "trader" || k === "trader_id" || skipKeys.includes(k)) continue;
    p.set(k, Array.isArray(v) ? v[0] : String(v));
  }
  p.set("trader", tenant);
  p.set("trader_id", tenant);
  return p;
}
