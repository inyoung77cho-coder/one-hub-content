// CA 엔진 — 종합 리포트 프록시 (RE 엔진 :5002 /api/board/report)
// PWA 클라이언트가 상대경로로 최신 게시 리포트를 받아온다. 공개 API(로그인 게이트 밖).
// board 페이지는 getStaticProps 로 직접 받지만, PWA 는 클라 fetch 라 이 프록시가 필요.
const RE_API = process.env.RE_API_URL || "http://54.180.54.132:5002";
const RE_KEY = process.env.RE_ACCESS_KEY || "";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "GET only" });
  }
  const qs = RE_KEY ? `?key=${encodeURIComponent(RE_KEY)}` : "";
  try {
    const r = await fetch(`${RE_API}/api/board/report${qs}`, {
      headers: { "X-API-Key": RE_KEY },
    });
    const data = await r.json();
    res.setHeader("Cache-Control", "public, max-age=120, stale-while-revalidate=600");
    return res.status(r.status).json(data);
  } catch (e) {
    return res.status(200).json({ report: null, error: "리포트 연결 실패" });
  }
}
