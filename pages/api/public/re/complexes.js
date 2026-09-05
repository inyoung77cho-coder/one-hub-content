// [S31-2] 공개 단지 자동완성 — 지역별 단지명 목록(로그인 없이). 기존 :5002 /api/complexes 재사용.
//   PROTECTED 밖(/api/public/). 개인정보 없음. 지역 목록은 정적이라 강한 캐시.
const RE_API = process.env.RE_API_URL || "http://54.180.54.132:5002";
const RE_KEY = process.env.RE_ACCESS_KEY || "";

export default async function handler(req, res) {
  const region = String(req.query.region || "서현동").trim();
  try {
    const url = `${RE_API}/api/complexes?region=${encodeURIComponent(region)}${RE_KEY ? `&key=${encodeURIComponent(RE_KEY)}` : ""}`;
    const r = await fetch(url, { headers: { "X-API-Key": RE_KEY }, signal: AbortSignal.timeout(6000) });
    const d = await r.json().catch(() => null);
    const complexes = (d && Array.isArray(d.complexes)) ? d.complexes : [];
    res.setHeader("Cache-Control", "s-maxage=86400, stale-while-revalidate=172800");
    return res.status(200).json({ ok: true, region, complexes, leader: d?.leader || "" });
  } catch (e) {
    return res.status(200).json({ ok: false, complexes: [] });
  }
}
