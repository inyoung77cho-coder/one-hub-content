// [2026-08-05] '나 vs AI' 게임 상태(시드/닉네임/판단원장) 서버 프록시.
//   NI-4 테넌트 격리 패턴(reqTenant/bodyWithTenant) 그대로 따름 — trader는 세션 기반
//   미들웨어 헤더가 최종 결정, 클라가 보낸 값은 신뢰하지 않는다.
import { reqTenant, bodyWithTenant } from "../../../lib/reqTenant";

const ENGINE_API = process.env.ENGINE_API_URL || "http://54.180.54.132:5001";

export default async function handler(req, res) {
  const trader = reqTenant(req);
  try {
    if (req.method === "GET") {
      const upstream = await fetch(`${ENGINE_API}/api/pwa/game-state?trader=${trader}`, {
        signal: AbortSignal.timeout(8000),
      });
      const data = await upstream.json();
      res.setHeader("Cache-Control", "no-store");
      return res.status(upstream.status).json(data);
    }
    if (req.method === "POST") {
      const upstream = await fetch(`${ENGINE_API}/api/pwa/game-state`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": process.env.PWA_API_KEY || "",
        },
        body: JSON.stringify(bodyWithTenant(req)),
        signal: AbortSignal.timeout(8000),
      });
      const data = await upstream.json();
      return res.status(upstream.status).json(data);
    }
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  } catch (err) {
    console.error("PWA game-state API unreachable:", err.message);
    return res.status(200).json({ ok: false, _offline: true, error: err.message });
  }
}
