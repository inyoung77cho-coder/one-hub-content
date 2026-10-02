const ENGINE_API = process.env.ENGINE_API_URL || "http://54.180.54.132:5001";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const trader = req.query.trader === "B" ? "B" : "A";
  try {
    const upstream = await fetch(`${ENGINE_API}/api/pwa/engine-status/${trader}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!upstream.ok) throw new Error(`Upstream error: ${upstream.status}`);
    const data = await upstream.json();
    // [S38 DA-3] 업스트림의 봇 프로세스 상태 필드(is_active/status 등)는 그대로 통과시킨다.
    //   settings.js 의 engineState() 가 그 필드를 보고 가동/중단을 '확인'한다. 여기선 가공하지 않는다.
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
