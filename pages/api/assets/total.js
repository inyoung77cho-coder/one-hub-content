// [S1.1] 총자산 단일 소스 프록시 — 백엔드 GET /api/assets/total 로 전달.
//   계약: { total, realty_state("none"|"entered"), breakdown{stock,etf,realty,cash} }(원 단위)
//   백엔드 미배포/오류 시 ok:false → 클라이언트(lib/assetsTotal)가 기존 엔드포인트로 폴백.
const ENGINE_API = process.env.ENGINE_API_URL || "http://54.180.54.132:5001";

export default async function handler(req, res) {
  const trader = req.query.trader === "B" ? "B" : "A";
  try {
    const upstream = await fetch(`${ENGINE_API}/api/assets/total?trader=${trader}`, {
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
