// [주식 직접입력 · 라이브 시세] KIS 외 보유 주식의 '현재가'를 실시간으로 조회해 평가액을 자동 갱신한다.
//   시세 소스 = /api/etf/quote (범용 yfinance/Stooq, ETF 전용 아님). 국내(숫자코드)·해외(티커) 공통.
//   반환 price 는 해당 시장 통화(KRW/USD), krw 는 원화 환산(해외는 fx 필요).
//   설계: 입력 시점 스냅샷이 아니라 '접속 시마다 현재가로 재평가' → 총자산이 자동으로 최신을 반영한다.
//   [S20-1] 시세·환율은 lib/quoteCache 로 30초 캐시 + 동시요청 중복제거. 보유 목록은 시장별 배치 1회.
import { cachedJson } from "./quoteCache";

function marketOf(code, market) {
  const c = String(code || "").trim();
  return market === "us" ? "us" : (/^\d+$/.test(c) ? "kr" : (market === "kr" ? "kr" : "us"));
}
function toQuote(d, mkt, fxRate) {
  if (!d || !(Number(d.price) > 0)) return null;
  const currency = d.currency || (mkt === "us" ? "USD" : "KRW");
  const price = Number(d.price);
  const krw = currency === "USD" ? (fxRate ? price * fxRate : null) : price;
  // [S30-2] 전일 종가로 당일 등락률(change_1d) 계산. 없으면 null(화면은 '시세 확인 중' 아님 — 가격은 있고 등락만 미상).
  const prevClose = Number(d.prevClose) > 0 ? Number(d.prevClose) : null;
  const changePct = prevClose ? (price / prevClose - 1) * 100 : null;
  return { price, currency, krw, date: d.date || null, prevClose, changePct };
}
async function getFx() {
  const fxj = await cachedJson(`/api/fx/usdkrw`);
  return fxj?.ok ? fxj.rate : null;
}

// 단건 현재가 조회(입력 시 자동 채움·단일 종목 갱신용). { price, currency, krw, date } | null
export async function fetchStockQuote(code, market, fxRate = null) {
  const c = String(code || "").trim();
  if (!c) return null;
  const mkt = marketOf(c, market);
  const d = await cachedJson(`/api/etf/quote?ticker=${encodeURIComponent(c)}&market=${mkt}`);
  return toQuote(d, mkt, fxRate);
}

// 보유 리스트의 라이브 시세 맵(id → quote). fx(원/달러)는 1회만 조회.
//   [S20-1] 시장별로 티커를 모아 배치 1회 호출. 배치 실패 시 기존 개별 경로로 폴백(회귀 방지).
//   quote.krw 이 있으면 '현재가 기준 원화 평가', 없으면(해외+fx없음) 호출측이 저장 평단으로 폴백.
export async function fetchStockQuotes(holdings) {
  const list = (holdings || []).filter((h) => h && (h.code || h.name));
  if (!list.length) return { quotes: {}, fxRate: await getFx() };
  const fxRate = await getFx();
  const items = list.map((h) => { const code = String(h.code || h.name).trim(); return { h, code, mkt: marketOf(code, h.market) }; });
  const quotes = {};
  const byMkt = {};
  items.forEach((it) => { (byMkt[it.mkt] = byMkt[it.mkt] || []).push(it); });
  await Promise.all(Object.entries(byMkt).map(async ([mkt, its]) => {
    const tickers = [...new Set(its.map((it) => it.code))];
    const d = await cachedJson(`/api/etf/quote?tickers=${encodeURIComponent(tickers.join(","))}&market=${mkt}`);
    if (d?.ok && d.quotes) {
      its.forEach((it) => {
        const raw = d.quotes[it.code.toUpperCase()] || d.quotes[it.code];
        const q = toQuote(raw, mkt, fxRate);
        if (q) quotes[it.h.id] = q;
      });
      // [S21-7] 배치에서 빠진 종목만 개별 재조회 — 부분 실패가 조용히 시세 없이 넘어가지 않게.
      const miss = its.filter((it) => !quotes[it.h.id]);
      if (miss.length) await Promise.all(miss.map(async (it) => { const q = await fetchStockQuote(it.code, it.mkt, fxRate); if (q) quotes[it.h.id] = q; }));
    } else {
      // 폴백: 배치 자체 실패 시 전체 개별 조회
      await Promise.all(its.map(async (it) => { const q = await fetchStockQuote(it.code, it.mkt, fxRate); if (q) quotes[it.h.id] = q; }));
    }
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
