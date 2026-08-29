// 영어학습 엔진(onehub-english.service, 서버 :5005) 프록시.
// PWA '영어' 탭이 상대경로로 오늘의 레슨을 받아온다. 로그인 게이트 안쪽(개인 학습용).
// ⚠️ :5005가 Lightsail 방화벽에서 열려야 도달한다. 닫혀 있으면 6초 뒤 빈 목록으로 폴백 →
//    화면이 깨지는 대신 "아직 준비된 학습이 없어요" 안내가 뜬다.
const ENGLISH_API = process.env.ENGLISH_API_URL || "http://54.180.54.132:5005";

// 화이트리스트. 임의 경로 전달을 막는다(SSRF 방지).
const ENDPOINTS = {
  today: (q) => `/english/today${qs(q, ["medium", "track", "language"])}`,
  lessons: (q) => `/english/lessons${qs(q, ["medium", "track", "language", "limit", "before"])}`,
  lesson: (q) => `/english/lesson/${encodeURIComponent(q.id || "")}`,
  "weekly-review": (q) => `/english/weekly-review${qs(q, ["language"])}`,
  "speak-timed": (q) => `/english/speak-timed${qs(q, ["text", "language"])}`, // [Live] 단어 타이밍(카라오케)
};

function qs(query, allowed) {
  const parts = allowed
    .filter((k) => query[k] !== undefined && query[k] !== "")
    .map((k) => `${k}=${encodeURIComponent(query[k])}`);
  return parts.length ? `?${parts.join("&")}` : "";
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "GET only" });
  }
  const build = ENDPOINTS[req.query.fn];
  if (!build) return res.status(404).json({ error: "unknown endpoint" });

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    const r = await fetch(`${ENGLISH_API}${build(req.query)}`, { signal: ctrl.signal });
    const data = await r.json();
    res.setHeader("Cache-Control", "private, max-age=60, stale-while-revalidate=300");
    return res.status(r.status).json(data);
  } catch (e) {
    return res.status(200).json({ items: [], error: "english 연결 실패" });
  } finally {
    clearTimeout(timer);
  }
}
