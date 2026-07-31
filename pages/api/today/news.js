// 뉴스 엔진(onehub-news, 서버 :5004) 공개 피드 프록시.
// PWA '오늘'이 상대경로로 최신 게시 뉴스를 받아온다. 공개 API(로그인 게이트 밖).
// ⚠️ :5004가 방화벽에서 열려야 서버에 도달한다. 닫혀 있으면 6초 뒤 빈 배열로 폴백 →
//    '오늘' 화면은 뉴스 섹션만 조용히 사라지고 나머지는 정상.
const NEWS_API = process.env.NEWS_API_URL || "http://54.180.54.132:5004";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "GET only" });
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    const qs = req.query.category ? `?category=${encodeURIComponent(req.query.category)}` : "";
    const r = await fetch(`${NEWS_API}/today/news${qs}`, { signal: ctrl.signal });
    const data = await r.json();
    res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
    return res.status(r.status).json(data);
  } catch (e) {
    // 방화벽 미개방/서버 다운이어도 '오늘' 페이지가 깨지면 안 된다.
    return res.status(200).json({ items: [], error: "news 연결 실패" });
  } finally {
    clearTimeout(timer);
  }
}
