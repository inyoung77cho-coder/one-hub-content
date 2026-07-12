// [D1] ETF 페이지와 동일한 로직으로 '실시간 ETF 평가액(원)'을 계산하는 공용 헬퍼.
//   대시보드가 ETF 페이지 방문 여부와 무관하게 항상 최신 ETF 금액을 반영하도록 한다.
//   구성: 백엔드 등록 포지션(수량×실측종가) + 내 보유(localStorage) 합. 실측 시세가 하나도
//   없으면 백엔드 평가액(value_krw)으로 폴백한다(= etf.js 히어로와 동일 규칙).
import { getHoldings, inferMarket } from "./etfHoldings";

async function getJson(url) {
  try { const r = await fetch(url); return await r.json(); } catch { return null; }
}

export async function fetchLiveEtfKrw(trader = "A") {
  // 1) 백엔드 리포트(등록 포지션 + 평가/원가 폴백)
  const report = await getJson(`/api/pwa/etf/report?trader=${trader}`);
  const positions = (report?.positions || []).filter((p) => !p.error);
  const summary = report?.summary || null;
  // 2) 내 보유(localStorage)
  const holdings = getHoldings(trader);
  if (!positions.length && !holdings.length) {
    return { krw: summary?.value_krw ?? null, live: false };
  }
  // 3) 오늘 환율
  const fx = await getJson(`/api/fx/usdkrw`);
  const fxRate = fx?.ok ? fx.rate : (report?.as_of?.fx || null);
  // 4) 티커별 실측 종가(공개 소스)
  const tickers = [...new Set([
    ...positions.map((p) => p.ticker),
    ...holdings.map((h) => h.ticker),
  ].filter(Boolean))];
  const quotes = {};
  await Promise.all(tickers.map(async (tk) => {
    const ref = positions.find((p) => p.ticker === tk) || holdings.find((h) => h.ticker === tk);
    const mkt = inferMarket(tk, ref?.market);
    const d = await getJson(`/api/etf/quote?ticker=${encodeURIComponent(tk)}&market=${mkt}&t=${Date.now()}`);
    if (d?.ok) quotes[tk] = { price: d.price, currency: d.currency, date: d.date };
  }));
  const toKrw = (v, ccy) => (ccy === "KRW" ? v : fxRate ? v * fxRate : null);
  // 5) 실시간 합산 = (수량 아는 등록 포지션) + (내 보유)
  let sum = 0, any = false;
  positions.forEach((p) => {
    const qty = p.qty ?? p.shares ?? p.quantity ?? null;
    const q = quotes[p.ticker];
    if (qty > 0 && q?.price != null) {
      const px = toKrw(q.price, q.currency);
      if (px != null) { sum += qty * px; any = true; }
    }
  });
  holdings.forEach((h) => {
    const q = quotes[h.ticker];
    if (q?.price != null) {
      const curKrw = toKrw(q.price, q.currency);
      if (curKrw != null) { sum += curKrw * h.shares; any = true; }
    }
  });
  if (any) return { krw: sum, live: true };
  // 폴백: 백엔드 평가액(실측 시세를 하나도 못 얻은 경우)
  if (summary?.value_krw != null) return { krw: summary.value_krw, live: false };
  return { krw: null, live: false };
}
