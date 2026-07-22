// CA 엔진 — board 수집정보 프록시 (RE 엔진 :5002 /api/board/gathered)
// 공개 API: /board/realestate 자체가 공개 마케팅 페이지이므로 로그인 게이트 대상이 아니다
// (middleware.js 의 PROTECTED_API_PREFIXES 에 넣지 않는다).
// ⚠️ 프로덕션 5002 는 RE_ACCESS_KEY 필수 — 반드시 부착.
const RE_API = process.env.RE_API_URL || "http://54.180.54.132:5002";
const RE_KEY = process.env.RE_ACCESS_KEY || "";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "GET only" });
  }
  const qs = RE_KEY ? `?key=${encodeURIComponent(RE_KEY)}` : "";
  try {
    const r = await fetch(`${RE_API}/api/board/gathered${qs}`, {
      headers: { "X-API-Key": RE_KEY },
    });
    const data = await r.json();
    // 수집정보는 자주 바뀌지 않는다 — 짧게 캐시해 백엔드 부하를 줄인다.
    res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
    return res.status(r.status).json(data);
  } catch (e) {
    // board 본문(협력업체 매물)은 정적이라 이 실패가 페이지를 깨뜨리면 안 된다.
    return res.status(200).json({ items: [], count: 0, error: "수집정보 연결 실패" });
  }
}
