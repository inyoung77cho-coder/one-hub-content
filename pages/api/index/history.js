// [성과비교] 시장지수 기간 수익률 — 매수(가입) 시점 종가 vs 최신 종가로 구간 수익률 산출.
//   1차: Stooq 일봉 히스토리(CSV) → 실패 시 2차: Yahoo chart(range=2y).
//   지원 심볼: kospi(^kospi), spx(^spx). ⚠️ 개발환경 프록시는 외부 호출을 막을 수 있어 실패 가능(정직한 ok:false).
// [S49-1] 선택 파라미터 series=N → 최근 N개 {date, close} 일별 시계열(상한 SERIES_MAX). series 가 있으면 from 불요.
//   ★from 경로(pickRange)는 그대로다 — 성과비교 화면(pages/pwa/index.js)이 쓴다.
//   ★from=<어제> 로 일간 수익률을 흉내 내지 말 것: 주말·휴일이면 start==latest 가 되어 pct=0 이 조용히 나온다.
//   ★받은 종가만 돌려준다(보간·추정 없음). 두 소스 다 실패하면 ok:false.
//   ⚠️ Yahoo 는 장중이면 마지막 행이 '진행 중인 당일 값'일 수 있다(확정 종가 아님) — 쓰는 쪽에서 날짜로 판단.
// [S49-2] usdkrw(USD/KRW 환율) 추가. 현재값은 /api/fx/usdkrw 가 따로 담당(etfLive·ledger 사용) — 그쪽은 건드리지 않는다.
const SYMS = {
  kospi: { stooq: "^kospi", yahoo: "^KS11", label: "KOSPI" },
  spx: { stooq: "^spx", yahoo: "^GSPC", label: "S&P 500" },
  usdkrw: { stooq: "usdkrw", yahoo: "KRW=X", label: "USD/KRW" }, // [S49-2]
};
const SERIES_MAX = 400; // [S49-1] series 상한(약 1.5년치 거래일)

// [S49-1] 시계열 정리 — 날짜 형식이 맞는 행만, 날짜 오름차순, 같은 날짜는 마지막 값 하나. 값을 만들지 않는다.
function cleanSeries(rows) {
  const byDate = new Map();
  for (const r of rows || []) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(r?.date) && Number.isFinite(r?.close) && r.close > 0) byDate.set(r.date, r.close);
  }
  return [...byDate.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([date, close]) => ({ date, close }));
}

// Stooq 일봉 히스토리 CSV: Date,Open,High,Low,Close,Volume
async function stooqHistory(sym) {
  const url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(sym)}&i=d`;
  const r = await fetch(url, { signal: AbortSignal.timeout(7000) });
  if (!r.ok) return null;
  const text = await r.text();
  const lines = (text || "").trim().split("\n");
  if (lines.length < 3) return null;
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const c = lines[i].split(",");
    const date = c[0]; const close = Number(c[4]);
    if (date && Number.isFinite(close) && close > 0) rows.push({ date, close });
  }
  return rows.length ? rows : null;
}

async function yahooHistory(ysym) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ysym)}?interval=1d&range=2y`;
  const r = await fetch(url, { signal: AbortSignal.timeout(7000), headers: { "User-Agent": "Mozilla/5.0" } });
  if (!r.ok) return null;
  const j = await r.json();
  const res = j?.chart?.result?.[0];
  const ts = res?.timestamp; const closes = res?.indicators?.quote?.[0]?.close;
  if (!Array.isArray(ts) || !Array.isArray(closes)) return null;
  const rows = [];
  for (let i = 0; i < ts.length; i++) {
    const close = Number(closes[i]);
    if (Number.isFinite(close) && close > 0) rows.push({ date: new Date(ts[i] * 1000).toISOString().slice(0, 10), close });
  }
  return rows.length ? rows : null;
}

// from(YYYY-MM-DD) 이후 첫 종가와 최신 종가
function pickRange(rows, from) {
  if (!rows?.length) return null;
  const sorted = [...rows].sort((a, b) => (a.date < b.date ? -1 : 1));
  const latest = sorted[sorted.length - 1];
  let start = sorted.find((r) => r.date >= from) || sorted[0];
  if (!start || !latest || !(start.close > 0)) return null;
  const pct = Math.round(((latest.close / start.close - 1) * 100) * 100) / 100;
  return { startDate: start.date, startClose: start.close, latestDate: latest.date, latestClose: latest.close, pct };
}

export default async function handler(req, res) {
  const key = String(req.query.symbol || "kospi").toLowerCase();
  const from = String(req.query.from || "").slice(0, 10);
  const sym = SYMS[key];
  if (!sym) return res.status(400).json({ ok: false, error: "unknown symbol" });

  // [S49-1] series 모드 — from 을 요구하지 않는다. from 경로와 독립(아래 기존 코드는 손대지 않음).
  const seriesRaw = req.query.series;
  if (seriesRaw !== undefined && String(seriesRaw) !== "") {
    const n = Number(seriesRaw);
    if (!Number.isInteger(n) || n < 1) return res.status(400).json({ ok: false, error: `series(1~${SERIES_MAX} 정수) required` });
    const take = Math.min(n, SERIES_MAX);
    let srows = null, ssource = null;
    try { srows = await stooqHistory(sym.stooq); if (srows) ssource = "stooq.com"; } catch (e) {}
    if (!srows) { try { srows = await yahooHistory(sym.yahoo); if (srows) ssource = "yahoo"; } catch (e) {} }
    const series = cleanSeries(srows).slice(-take);
    if (series.length) {
      res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=86400");
      return res.status(200).json({ ok: true, symbol: key, label: sym.label, source: ssource, requested: n, max: SERIES_MAX, capped: n > SERIES_MAX, count: series.length, series });
    }
    return res.status(200).json({ ok: false, symbol: key, label: sym.label, error: "지수 히스토리 연결 실패(Stooq·Yahoo)" });
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) return res.status(400).json({ ok: false, error: "from(YYYY-MM-DD) required" });

  let rows = null, source = null;
  try { rows = await stooqHistory(sym.stooq); if (rows) source = "stooq.com"; } catch (e) {}
  if (!rows) { try { rows = await yahooHistory(sym.yahoo); if (rows) source = "yahoo"; } catch (e) {} }

  const range = pickRange(rows, from);
  if (range) {
    res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=86400");
    return res.status(200).json({ ok: true, symbol: key, label: sym.label, source, ...range });
  }
  return res.status(200).json({ ok: false, symbol: key, label: sym.label, error: "지수 히스토리 연결 실패(Stooq·Yahoo)" });
}
