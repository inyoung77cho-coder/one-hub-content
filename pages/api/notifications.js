// 알림 센터 프록시 — 5001 /api/notifications (텔레그램/리포트/큐 동기화 피드)
const ENGINE_API = process.env.ENGINE_API_URL || "http://54.180.54.132:5001";

// [S22-6] 알림 채널 분리 — 운영자용(잡 모니터·헬스·디스크·프로세스 감시 등) 경보는 사용자 알림함에서 뺀다.
//   사용자에게는 사용자 것만. ?admin=1 이면 전부(운영자 화면용).
const OPERATOR_SOURCES = new Set([
  "job_monitor", "disk_guard", "proc_guard", "health", "healthcheck",
  "ops", "ops_log", "system", "monitor", "cron", "backup", "version_watch",
]);
function isOperatorNoti(n) {
  const src = String(n?.source || "").toLowerCase();
  if (OPERATOR_SOURCES.has(src)) return true;
  const t = String(n?.type || n?.noti_type || "").toLowerCase();
  // noti_type 'critical' 자체는 사용자 경보일 수 있어 source 기준이 우선이지만,
  // 운영 키워드가 제목/소스에 있으면 운영자용으로 본다(보수적 매칭).
  return /job_monitor|disk|proc_guard|healthcheck|start-limit/.test(src + " " + t);
}

export default async function handler(req, res) {
  const trader = req.query.trader || req.query.trader_id || "A";
  const since = req.query.since || 0;
  const admin = req.query.admin === "1";
  try {
    const upstream = await fetch(
      `${ENGINE_API}/api/notifications?trader_id=${trader}&since=${since}`,
      {
        headers: { "X-API-Key": process.env.PWA_API_KEY || "" },
        signal: AbortSignal.timeout(8000),
      }
    );
    const data = await upstream.json();
    res.setHeader("Cache-Control", "no-store");
    if (Array.isArray(data)) {
      const items = admin ? data : data.filter((n) => !isOperatorNoti(n));
      return res.status(upstream.status).json({ ok: true, items });
    }
    return res.status(upstream.status).json(data);
  } catch (err) {
    return res.status(200).json({ ok: false, items: [], error: err.message });
  }
}
