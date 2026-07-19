// pages/api/health/index.js — 외부 감시용 공개 헬스 엔드포인트 (항목7 G7-a/b)
//   UptimeRobot 등 외부 모니터가 이 URL 하나로 웹앱+백엔드 생존을 확인한다.
//   미인증 공개(미들웨어 PROTECTED 목록 밖 = 통과). 남의 데이터 노출 없음(상태만).
//   판정: 핵심(트레이딩 엔진 5001) 다운 → HTTP 503, 그 외 다운 → 200 + ok:false(degraded).
//   → UptimeRobot은 '키워드 "ok":true 없으면 다운'으로 잡으면 어떤 축이 죽어도 알림 옴.
const TARGETS = [
  { name: "engine",     url: process.env.ENGINE_API_URL || "http://54.180.54.132:5001", critical: true },
  { name: "realestate", url: process.env.RE_API_URL     || "http://54.180.54.132:5002", critical: false },
  { name: "etf",        url: process.env.ETF_API_URL    || "http://54.180.54.132:5003", critical: false },
];

async function probe(t) {
  const t0 = Date.now();
  try {
    // 포트가 응답하면(어떤 상태코드든) 살아있음. 연결거부/타임아웃만 다운으로 본다.
    const r = await fetch(t.url + "/", { method: "GET", signal: AbortSignal.timeout(6000) });
    return { name: t.name, up: true, status: r.status, ms: Date.now() - t0 };
  } catch (e) {
    return { name: t.name, up: false, error: e.name || "error", ms: Date.now() - t0 };
  }
}

export default async function handler(req, res) {
  const results = await Promise.all(TARGETS.map(probe));
  const byName = Object.fromEntries(results.map((r) => [r.name, r]));
  const anyDown = results.some((r) => !r.up);
  const criticalDown = TARGETS.some((t) => t.critical && !byName[t.name].up);

  res.setHeader("Cache-Control", "no-store");
  return res.status(criticalDown ? 503 : 200).json({
    ok: !anyDown,
    degraded: anyDown && !criticalDown,
    services: results,
    ts: new Date().toISOString(),
  });
}
