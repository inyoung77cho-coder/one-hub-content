// [S28-10] 신고가 프록시 — :5002 /api/re/new-high(기존 spot_price 소스). 없으면 items:[].
const RE_API = process.env.RE_API_URL || "http://54.180.54.132:5002";
const RE_KEY = process.env.RE_ACCESS_KEY || "";

export default async function handler(req, res) {
  const since = req.query.since ? `?since=${encodeURIComponent(req.query.since)}` : "";
  try {
    const r = await fetch(`${RE_API}/api/re/new-high${since}`, {
      headers: { "X-API-Key": RE_KEY },
      signal: AbortSignal.timeout(6000),
    });
    const d = await r.json().catch(() => ({ ok: false, items: [] }));
    return res.status(200).json(d && typeof d === "object" ? d : { ok: false, items: [] });
  } catch (e) {
    return res.status(200).json({ ok: false, items: [] });
  }
}
