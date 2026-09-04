// [S29-9] 회차 반응·투표 프록시 → RE(:5002) /api/v2/episode-engagement.
//   GET  ?episode=<slug>            → { ok, reactions, votes, vote_total, mine }
//   POST body{episode,kind,value}   → 갱신된 집계 즉시 반환(참여의 보상)
//   trader 는 세션 기반(reqTenant) — 클라가 보낸 값 신뢰 안 함, 1인 1표. GitHub 아님(accounts.db).
//   ⚠️ 백엔드 미도달 시 ok:false → 화면은 "반응은 잠시 후 다시" 로 조용히 죽지 않게.
import { reqTenant } from "../../../lib/reqTenant";

const RE_API = process.env.RE_API_URL || "http://54.180.54.132:5002";
const RE_KEY = process.env.RE_ACCESS_KEY || "";

export default async function handler(req, res) {
  const trader = reqTenant(req);
  const q = new URLSearchParams({ trader_id: trader });
  if (RE_KEY) q.set("key", RE_KEY);
  if (req.method === "GET") {
    const ep = (req.query.episode || "").toString();
    if (ep) q.set("episode", ep);
  }
  const url = `${RE_API}/api/v2/episode-engagement?${q.toString()}`;
  try {
    const r = await fetch(url, {
      method: req.method === "POST" ? "POST" : "GET",
      headers: { "Content-Type": "application/json", "X-API-Key": RE_KEY },
      body: req.method === "POST" ? JSON.stringify(req.body || {}) : undefined,
      signal: AbortSignal.timeout(6000),
    });
    const d = await r.json().catch(() => ({ ok: false }));
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json(d && typeof d === "object" ? d : { ok: false });
  } catch (e) {
    return res.status(200).json({ ok: false, error: String(e) });
  }
}
