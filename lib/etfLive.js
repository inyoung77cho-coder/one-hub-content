// [D1] ETF 페이지와 동일한 로직으로 '실시간 ETF 평가액(원)'을 계산하는 공용 헬퍼.
//   대시보드가 ETF 페이지 방문 여부와 무관하게 항상 최신 ETF 금액을 반영하도록 한다.
//   구성: 백엔드 등록 포지션(수량×실측종가) + 내 보유(localStorage) 합. 실측 시세가 하나도
//   없으면 백엔드 평가액(value_krw)으로 폴백한다(= etf.js 히어로와 동일 규칙).
import { getHoldings, inferMarket, getOtherAssets, saneEtfAvg } from "./etfHoldings";
import { guardPrice } from "./priceGuard"; // [S24-3] 직전 정상가 대비 급변 차단(시세 온전성)
import { cachedJson } from "./quoteCache"; // [S20-1] 30초 캐시 + 동시요청 중복제거

export async function fetchLiveEtfKrw(trader = "A") {
  // 1) 백엔드 리포트(등록 포지션 + 평가/원가 폴백)
  const report = await cachedJson(`/api/pwa/etf/report?trader=${trader}`);
  const positions = (report?.positions || []).filter((p) => !p.error);
  const summary = report?.summary || null;
  // 2) 내 보유(localStorage)
  const holdings = getHoldings(trader);
  // [2026-08-23] 티커 없는 펀드·디폴트옵션 등(기타 금융자산) — 별도 버킷이라 이중계상 위험 없음.
  const otherAssets = getOtherAssets(trader);
  const otherSum = otherAssets.reduce((s, o) => s + (Number(o.valueKrw) || 0), 0);
  if (!positions.length && !holdings.length && !otherAssets.length) {
    return { krw: summary?.value_krw ?? null, live: false };
  }
  // 3) 오늘 환율
  const fx = await cachedJson(`/api/fx/usdkrw`);
  const fxRate = fx?.ok ? fx.rate : (report?.as_of?.fx || null);
  // 4) 티커별 실측 종가(공개 소스) — [S20-1] 시장별 배치 1회 + 캐시. 배치 실패 시 개별 폴백.
  const tickers = [...new Set([
    ...positions.map((p) => p.ticker),
    ...holdings.map((h) => h.ticker),
  ].filter(Boolean))];
  const quotes = {};
  const byMkt = {};
  tickers.forEach((tk) => {
    const ref = positions.find((p) => p.ticker === tk) || holdings.find((h) => h.ticker === tk);
    const mkt = inferMarket(tk, ref?.market);
    (byMkt[mkt] = byMkt[mkt] || []).push(tk);
  });
  await Promise.all(Object.entries(byMkt).map(async ([mkt, tks]) => {
    const d = await cachedJson(`/api/etf/quote?tickers=${encodeURIComponent(tks.join(","))}&market=${mkt}`);
    if (d?.ok && d.quotes) {
      tks.forEach((tk) => {
        const raw = d.quotes[String(tk).toUpperCase()] || d.quotes[tk];
        if (raw && Number(raw.price) > 0) quotes[tk] = { price: raw.price, currency: raw.currency, date: raw.date };
      });
      // [S21-7] 배치에서 빠진 종목만 개별 재조회(부분 실패 방지).
      const miss = tks.filter((tk) => !quotes[tk]);
      if (miss.length) await Promise.all(miss.map(async (tk) => {
        const one = await cachedJson(`/api/etf/quote?ticker=${encodeURIComponent(tk)}&market=${mkt}`);
        if (one?.ok) quotes[tk] = { price: one.price, currency: one.currency, date: one.date };
      }));
    } else {
      // 폴백: 배치 자체 실패 시 전체 개별 조회
      await Promise.all(tks.map(async (tk) => {
        const one = await cachedJson(`/api/etf/quote?ticker=${encodeURIComponent(tk)}&market=${mkt}`);
        if (one?.ok) quotes[tk] = { price: one.price, currency: one.currency, date: one.date };
      }));
    }
  }));
  const toKrw = (v, ccy) => (ccy === "KRW" ? v : fxRate ? v * fxRate : null);
  // 5) 실시간 합산 = (수량 아는 등록 포지션) + (내 보유) + (기타 금융자산, 평가금액 수동값)
  //   [S22-1] 내 보유 중 평단이 현재가와 10배 이상 어긋난 종목은 레코드가 오염됐을 수 있어
  //     (수량 자릿수 오류가 겹치면 평가액이 폭주) 확인 전까지 합산에서 제외하고 excluded 로 알린다.
  let sum = otherSum, any = otherSum > 0;
  const excluded = [];
  const suspect = []; // [S24-3] 직전 정상가 대비 급변(시세 문제) — 합산 제외
  positions.forEach((p) => {
    const qty = p.qty ?? p.shares ?? p.quantity ?? null;
    const q = quotes[p.ticker];
    if (qty > 0 && q?.price != null) {
      const g = guardPrice(p.ticker, q.price);
      if (g.suspect) { suspect.push({ ticker: p.ticker, incoming: g.incoming, last: g.last }); return; }
      const px = toKrw(q.price, q.currency);
      if (px != null) { sum += qty * px; any = true; }
    }
  });
  holdings.forEach((h) => {
    const q = quotes[h.ticker];
    if (q?.price != null) {
      const g = guardPrice(h.ticker, q.price);
      if (g.suspect) { suspect.push({ id: h.id, ticker: h.ticker, incoming: g.incoming, last: g.last }); return; }
      const curKrw = toKrw(q.price, q.currency);
      if (curKrw != null) {
        if (!saneEtfAvg(h, curKrw, fxRate)) {
          excluded.push({ id: h.id, ticker: h.ticker, avgPrice: Number(h.avgPrice), avgCcy: h.avgCcy, shares: h.shares, account: h.account });
          return;
        }
        sum += curKrw * h.shares; any = true;
      }
    }
  });
  if (any) return { krw: sum, live: true, excluded, suspect };
  // 폴백: 백엔드 평가액(실측 시세를 하나도 못 얻은 경우)
  if (summary?.value_krw != null) return { krw: summary.value_krw, live: false, excluded, suspect };
  return { krw: null, live: false, excluded, suspect };
}
