const ENGINE_API = process.env.ENGINE_API_URL || "http://54.180.54.132:5001";

// [S38 후속 Task1] 봇 프로세스 상태(systemd) 조회 — per-trader /api/pwa/engine-status 응답에는
//   봇 프로세스 가동 여부(is_active/status)가 없다(라이브 확인: aimode·is_analyzing·regime 만 줌).
//   서버 /api/engine-status 는 get_systemd_status()를 engine 으로 반환하므로, 여기서 그 engine 상태만
//   가져와 병합한다 → settings.js engineState()가 '가동 중/중단됨'을 '확인'할 수 있다.
//   주의: /api/engine-status 는 KIS 보유조회(holdings)도 수행하므로 engine 상태만 취하고 나머지는 버린다.
//   현재 get_systemd_status 는 onehub.service(트레이더 A)만 보므로 A 에만 병합한다(B 는 '확인 안 됨' 유지).
async function fetchBotStatus() {
  try {
    const r = await fetch(`${ENGINE_API}/api/engine-status`, { signal: AbortSignal.timeout(4000) });
    if (!r.ok) return null;
    const d = await r.json();
    const e = d && d.engine;
    if (e && (typeof e.is_active === "boolean" || e.status)) {
      return { is_active: e.is_active, status: e.status }; // holdings 등은 의도적으로 버림
    }
  } catch (e) {}
  return null;
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const trader = req.query.trader === "B" ? "B" : "A";
  try {
    // per-trader 상태와 봇 프로세스 상태(A 만)를 병렬로 가져와 지연을 최소화한다.
    const [upstream, bot] = await Promise.all([
      fetch(`${ENGINE_API}/api/pwa/engine-status/${trader}`, { signal: AbortSignal.timeout(5000) }),
      trader === "A" ? fetchBotStatus() : Promise.resolve(null),
    ]);
    if (!upstream.ok) throw new Error(`Upstream error: ${upstream.status}`);
    const data = await upstream.json();
    // [S38 후속 Task1] 봇 프로세스 상태를 engine 으로 병합(서버 무배포). 못 가져오면 생략 → '확인 안 됨' 유지.
    if (bot) data.engine = bot;
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json(data);
  } catch (err) {
    // [S38 DA-3] 업스트림 미도달 = '봇 상태를 확인하지 못함'. reachable:false 로 명시해
    //   소비 측이 이를 '중단'이 아니라 '확인 안 됨'으로 다루게 한다(fail-closed).
    return res.status(200).json({
      ok: false, reachable: false, error: err.message,
      is_analyzing: false, last_analysis_at: null, last_scan_count: null,
    });
  }
}
