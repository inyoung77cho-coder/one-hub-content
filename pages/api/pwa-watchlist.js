import { reqTenant, bodyWithTenant } from "../../lib/reqTenant";
const ENGINE_API = process.env.ENGINE_API_URL || "http://54.180.54.132:5001";
const RE_API = process.env.RE_API_URL || "http://54.180.54.132:5002";
const RE_KEY = process.env.RE_ACCESS_KEY || "";

// [OH-AUTH M4] 관심 추가 전 티어 제한 확인. Free(watchlist_limit=3) 초과면 403.
//   uid 없거나(구세션) 조회 실패면 제한하지 않는다(무손상). 무제한 티어는 limit=null.
async function checkWatchlistLimit(req, trader) {
  const uid = req.headers["x-oh-user"];
  if (!uid) return null;
  try {
    const acc = await fetch(`${RE_API}/api/account/me${RE_KEY ? `?key=${encodeURIComponent(RE_KEY)}` : ""}`, {
      headers: { "X-API-Key": RE_KEY, "x-oh-user": String(uid) },
      signal: AbortSignal.timeout(6000),
    }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    const limit = acc?.entitlements?.watchlist_limit;
    if (limit == null) return null;   // 무제한(premium/pro)
    const cur = await fetch(`${ENGINE_API}/api/pwa/watchlist?trader=${encodeURIComponent(trader)}`, {
      signal: AbortSignal.timeout(6000),
    }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    const arr = Array.isArray(cur) ? cur : (cur?.items || cur?.watchlist || cur?.list || []);
    const count = Array.isArray(arr) ? arr.length : 0;
    if (count >= limit) {
      return { error: "TIER_REQUIRED", required_tier: "premium", limit, current: count,
               message: `무료 플랜은 관심 ${limit}개까지입니다. 프리미엄에서 무제한으로 이용하세요.` };
    }
  } catch (e) { /* 조용히 통과 */ }
  return null;
}

export default async function handler(req, res) {
  const trader = reqTenant(req);

  try {
    if (req.method === "GET") {
      const upstream = await fetch(`${ENGINE_API}/api/pwa/watchlist?trader=${encodeURIComponent(trader)}`, {
        signal: AbortSignal.timeout(8000),
      });
      const data = await upstream.json();
      res.setHeader("Cache-Control", "no-store");
      return res.status(upstream.status).json(data);
    }

    if (req.method === "POST") {
      const denied = await checkWatchlistLimit(req, trader);
      if (denied) return res.status(403).json(denied);
      const upstream = await fetch(`${ENGINE_API}/api/pwa/watchlist`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": process.env.PWA_API_KEY || "",
        },
        body: JSON.stringify(bodyWithTenant(req)),
        signal: AbortSignal.timeout(8000),
      });
      const data = await upstream.json();
      return res.status(upstream.status).json(data);
    }

    if (req.method === "DELETE") {
      const { id } = req.query;
      if (!id) return res.status(400).json({ ok: false, error: "id required" });
      const upstream = await fetch(`${ENGINE_API}/api/pwa/watchlist/${encodeURIComponent(id)}?trader=${encodeURIComponent(trader)}`, {
        method: "DELETE",
        headers: {
          "X-API-Key": process.env.PWA_API_KEY || "",
        },
        signal: AbortSignal.timeout(8000),
      });
      const data = await upstream.json();
      return res.status(upstream.status).json(data);
    }

    return res.status(405).json({ ok: false, error: "Method not allowed" });
  } catch (err) {
    console.error("PWA watchlist API unreachable:", err.message);
    return res.status(200).json({ ok: false, _offline: true, error: err.message, items: [] });
  }
}
