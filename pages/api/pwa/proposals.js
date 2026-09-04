// [S28-6] 엔진 개선 제안 프록시 — GET 목록 / POST 결정(승인·거절·나중에).
//   승인해도 서버 엔진은 안 바뀐다(엔드포인트가 패치+배포명령만 반환). 게이트 7종은 deploy 스크립트가.
const ENGINE_API = process.env.ENGINE_API_URL || "http://54.180.54.132:5001";

export default async function handler(req, res) {
  try {
    if (req.method === "POST") {
      const r = await fetch(`${ENGINE_API}/api/pwa/proposals/decide`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-Key": process.env.PWA_API_KEY || "" },
        body: JSON.stringify(req.body || {}),
      });
      return res.status(200).json(await r.json());
    }
    const r = await fetch(`${ENGINE_API}/api/pwa/proposals`);
    return res.status(200).json(await r.json());
  } catch (e) {
    return res.status(200).json({ ok: false, error: String(e) });
  }
}
