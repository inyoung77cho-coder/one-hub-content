// [S1.1] 총자산 단일 소스 프록시 — 백엔드 GET /api/assets/total 로 전달.
//   계약: { total, realty_state("none"|"entered"), breakdown{stock,etf,realty,cash} }(원 단위)
//   백엔드 미배포/오류 시 ok:false → 클라이언트(lib/assetsTotal)가 기존 엔드포인트로 폴백.
import { requireTenant } from "../../../lib/reqTenant";
const ENGINE_API = process.env.ENGINE_API_URL || "http://54.180.54.132:5001";

export default async function handler(req, res) {
  const trader = requireTenant(req, res); // [S47 후속] x-oh-tenant 만 신뢰(쿼리·A 기본값 금지)
  if (!trader) return;
  try {
    const upstream = await fetch(`${ENGINE_API}/api/assets/total?trader=${encodeURIComponent(trader)}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!upstream.ok) throw new Error(`Upstream ${upstream.status}`);
    const d = await upstream.json();
    // 계약 필드 검증 — 형태가 맞을 때만 단일소스로 인정
    if (d && d.breakdown && d.realty_state) {
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json({ ok: true, ...d });
    }
    throw new Error("shape mismatch");
  } catch (err) {
    // 미배포/오류 — 클라이언트 폴백 신호
    return res.status(200).json({ ok: false, error: String(err.message || err) });
  }
}
