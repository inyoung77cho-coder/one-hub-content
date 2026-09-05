// [S30-9] 가입 깔때기 집계 프록시 → RE(:5002) /api/v2/funnel-agg.
//   운영자 화면(MaintenanceShop) 전용. 클라 게이트(isOperator) + Vercel 키로 보호(proposals 와 동일 모델).
//   개인정보 없음(관문 도달 인원 수만). 실패 시 ok:false → 카드가 조용히 안 뜸.
const RE_API = process.env.RE_API_URL || "http://54.180.54.132:5002";
const RE_KEY = process.env.RE_ACCESS_KEY || "";

export default async function handler(req, res) {
  try {
    const key = RE_KEY ? `?key=${encodeURIComponent(RE_KEY)}` : "";
    const r = await fetch(`${RE_API}/api/v2/funnel-agg${key}`, {
      headers: { "X-API-Key": RE_KEY },
      signal: AbortSignal.timeout(6000),
    });
    const d = await r.json().catch(() => ({ ok: false }));
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json(d && typeof d === "object" ? d : { ok: false });
  } catch (e) {
    return res.status(200).json({ ok: false, error: String(e) });
  }
}
