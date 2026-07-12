// [기기 동기화] PC↔모바일 자산 입력 동기화 — 트레이더별 상태를 백엔드에 저장/조회하는 프록시.
//   GET  /api/user/state?trader=A          → 원격 상태 { ok, device, updatedAt, payload }
//   POST /api/user/state?trader=A  body{device,updatedAt,payload} → 저장
//   ⚠️ 백엔드(/api/pwa/user-state) 미배포 시 ok:false 반환 → 클라이언트는 로컬만 사용(회귀 없음).
const ENGINE_API = process.env.ENGINE_API_URL || "http://54.180.54.132:5001";

export default async function handler(req, res) {
  const trader = (req.query.trader || "A").toString();
  const key = process.env.PWA_API_KEY || "";
  try {
    if (req.method === "GET") {
      const r = await fetch(`${ENGINE_API}/api/pwa/user-state?trader=${encodeURIComponent(trader)}`, {
        headers: { "x-api-key": key }, signal: AbortSignal.timeout(6000),
      });
      const d = await r.json().catch(() => ({}));
      return res.status(200).json(d && typeof d === "object" ? d : { ok: false });
    }
    if (req.method === "POST") {
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const r = await fetch(`${ENGINE_API}/api/pwa/user-state`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": key },
        body: JSON.stringify({ trader, device: body.device, updatedAt: body.updatedAt, payload: body.payload }),
        signal: AbortSignal.timeout(6000),
      });
      const d = await r.json().catch(() => ({}));
      return res.status(200).json(d && typeof d === "object" ? d : { ok: false });
    }
    return res.status(405).json({ ok: false, error: "method not allowed" });
  } catch (e) {
    // 백엔드 미배포/네트워크 실패 — 조용히 로컬 폴백
    return res.status(200).json({ ok: false, error: String(e) });
  }
}
