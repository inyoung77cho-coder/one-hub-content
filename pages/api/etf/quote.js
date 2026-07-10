// [ETF 시세] 티커 현재가 조회 — 사용자가 직접 추가한 ETF의 가격 자동 업데이트용.
//   공개 소스(Stooq, 키 불필요)에서 최근 종가를 가져온다. 여러 표기를 순서대로 시도.
//   미국 ETF: {ticker}.us / 국내(숫자코드): {ticker}.kr. 통화는 접미사로 판단.
//   ⚠️ 개발환경 프록시는 외부 호출을 막을 수 있어 실패 가능(정직한 ok:false 반환).
//      프로덕션(Vercel)에서는 정상 조회된다.
function parseStooqCsv(text) {
  // 헤더 + 1행. Close(index 6) 파싱. 'N/D'면 실패.
  const lines = (text || "").trim().split("\n");
  if (lines.length < 2) return null;
  const cols = lines[1].split(",");
  const close = Number(cols[6]);
  const date = cols[1] && cols[1] !== "N/D" ? cols[1] : null;
  if (!Number.isFinite(close) || close <= 0) return null;
  return { price: close, date };
}

export default async function handler(req, res) {
  const raw = (req.query.ticker || "").toString().trim().toLowerCase().replace(/[^a-z0-9.]/g, "");
  if (!raw) return res.status(400).json({ ok: false, error: "ticker required" });
  // 시장 접미사 결정: 명시값 > 숫자코드(.kr) > 기본(.us)
  const market = (req.query.market || "").toString().toLowerCase();
  const isKr = market === "kr" || (/^\d+$/.test(raw) && market !== "us");
  const suffix = raw.includes(".") ? "" : isKr ? ".kr" : ".us";
  const symbol = raw + suffix;
  const ccy = symbol.endsWith(".kr") ? "KRW" : "USD";
  const url = `https://stooq.com/q/l/?s=${encodeURIComponent(symbol)}&f=sd2t2ohlcv&h&e=csv`;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (r.ok) {
      const text = await r.text();
      const q = parseStooqCsv(text);
      if (q) {
        // 5분 신선 + 15분 stale-while-revalidate → 자동 갱신, 과호출 방지
        res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=900");
        return res.status(200).json({ ok: true, ticker: raw.toUpperCase(), symbol, price: q.price, currency: ccy, date: q.date, source: "stooq.com" });
      }
    }
  } catch (e) {
    // graceful
  }
  return res.status(200).json({ ok: false, ticker: raw.toUpperCase(), error: "시세 소스 연결 실패" });
}
