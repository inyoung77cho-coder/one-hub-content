// [S25-8→S27] ETF 일별 종가 이력 — Lightsail :5003 수집기(FDR) 프록시.
//   (구) stooq 일별 CSV 는 AWS/Vercel 에서 차단(robots noindex)되어 빈 응답 → 서버 수집으로 전환.
//   서버 /api/etf/history?ticker= 가 etf_daily(FDR upsert)에서 {ok,ticker,closes:[{date,close}]} 를 준다.
//   ★관찰용(예측 아님) 30일 종가. 실패하면 추세를 지어내지 않고 ok:false → 컴포넌트가 '이력 수집 중' 폴백.
//   ★하루 1회 캐시 = Vercel CDN(s-maxage=86400) + 서버도 오늘자 있으면 DB 반환(중복 수집 없음).
const ETF_API = process.env.ETF_API_URL || "http://54.180.54.132:5003";

export default async function handler(req, res) {
  const ticker = String(req.query.ticker || "").trim();
  if (!ticker) return res.status(400).json({ ok: false, error: "ticker required" });
  const market = String(req.query.market || "").toLowerCase();
  const url = `${ETF_API}/api/etf/history?ticker=${encodeURIComponent(ticker)}${market ? `&market=${encodeURIComponent(market)}` : ""}`;
  try {
    const r = await fetch(url, {
      headers: { "X-API-Key": process.env.ETF_API_KEY || "" },
      signal: AbortSignal.timeout(15000),
    });
    const data = await r.json().catch(() => null);
    if (!r.ok || !data || data.ok !== true) {
      res.setHeader("Cache-Control", "s-maxage=60");
      return res.status(200).json({ ok: false, ticker: ticker.toUpperCase(), error: (data && data.error) || "이력 수집 중" });
    }
    res.setHeader("Cache-Control", "s-maxage=86400, stale-while-revalidate=172800"); // 하루 1회
    return res.status(200).json({ ok: true, ticker: data.ticker || ticker.toUpperCase(), closes: data.closes || [] });
  } catch (e) {
    res.setHeader("Cache-Control", "s-maxage=60");
    return res.status(200).json({ ok: false, ticker: ticker.toUpperCase(), error: "이력 수집 중" });
  }
}
