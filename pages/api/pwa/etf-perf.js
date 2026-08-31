// [ETF 보유 분석] 티커별 기간 등락률 프록시 → onehub-etf(:5003)/api/etf/perf.
const ETF_API = process.env.ETF_API_URL || "http://54.180.54.132:5003";

export default async function handler(req, res) {
  const tickers = String(req.query.tickers || "").slice(0, 800);
  if (!tickers) return res.status(200).json({ perf: {} });
  try {
    const r = await fetch(`${ETF_API}/api/etf/perf?tickers=${encodeURIComponent(tickers)}`, {
      headers: { "X-API-Key": process.env.ETF_API_KEY || "" },
      signal: AbortSignal.timeout(12000),
    });
    const data = await r.json().catch(() => ({ perf: {} }));
    res.setHeader("Cache-Control", "private, max-age=120");
    return res.status(r.status).json(data);
  } catch (e) {
    return res.status(200).json({ perf: {} });
  }
}
