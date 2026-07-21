// [주식 직접입력 · 라이브 시세] KIS 외 보유 주식의 '현재가'를 실시간으로 조회해 평가액을 자동 갱신한다.
//   시세 소스 = /api/etf/quote (범용 yfinance/Stooq, ETF 전용 아님). 국내(숫자코드)·해외(티커) 공통.
//   반환 price 는 해당 시장 통화(KRW/USD), krw 는 원화 환산(해외는 fx 필요).
//   설계: 입력 시점 스냅샷이 아니라 '접속 시마다 현재가로 재평가' → 총자산이 자동으로 최신을 반영한다.

async function getJson(url) {
  try { const r = await fetch(url); return await r.json(); } catch { return null; }
}

// 단건 현재가 조회(입력 시 자동 채움·단일 종목 갱신용). { price, currency, krw, date } | null
export async function fetchStockQuote(code, market, fxRate = null) {
  const c = String(code || "").trim();
  if (!c) return null;
  const mkt = market === "us" ? "us" : (/^\d+$/.test(c) ? "kr" : (market === "kr" ? "kr" : "us"));
  const d = await getJson(`/api/etf/quote?ticker=${encodeURIComponent(c)}&market=${mkt}&t=${Date.now()}`);
  if (!d?.ok || !(Number(d.price) > 0)) return null;
  const currency = d.currency || (mkt === "us" ? "USD" : "KRW");
  const price = Number(d.price);
  const krw = currency === "USD" ? (fxRate ? price * fxRate : null) : price;
  return { price, currency, krw, date: d.date || null };
}

// 보유 리스트의 라이브 시세 맵(id → quote). fx(원/달러)는 1회만 조회.
//   quote.krw 이 있으면 '현재가 기준 원화 평가', 없으면(해외+fx없음) 호출측이 저장 평단으로 폴백.
export async function fetchStockQuotes(holdings) {
  const list = (holdings || []).filter((h) => h && (h.code || h.name));
  if (!list.length) return { quotes: {}, fxRate: null };
  const fxj = await getJson(`/api/fx/usdkrw`);
  const fxRate = fxj?.ok ? fxj.rate : null;
  const quotes = {};
  await Promise.all(list.map(async (h) => {
    const q = await fetchStockQuote(h.code || h.name, h.market, fxRate);
    if (q) quotes[h.id] = q;
  }));
  return { quotes, fxRate };
}

// 라이브 우선 평가액(원). 라이브 실패 시 저장 평단으로 폴백. { won, live } — won null=평가 불가(해외+fx없음).
export function holdingValueKrw(h, quote, fxRate) {
  const shares = Number(h.shares) || 0;
  if (quote?.krw != null) return { won: quote.krw * shares, live: true };
  if (h.ccy === "USD") return { won: fxRate ? Number(h.avgPrice) * shares * fxRate : null, live: false };
  return { won: Number(h.avgPrice) * shares, live: false };
}
