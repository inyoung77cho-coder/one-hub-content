// [ETF 시세] 티커 현재가 조회 — 사용자가 직접 추가한 ETF의 가격 자동 업데이트용.
//   1차: Yahoo Finance chart API(정규장 실시간 + 시간외 pre/postMarketPrice 반영) →
//   실패 시 2차: Stooq(공개·키 불필요, 단 종가/EOD만 제공 — 시간외 가격 갱신 안 됨).
//   미국 ETF: {ticker}.us / 국내(숫자코드): {ticker}.kr. 통화는 접미사/응답으로 판단.
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

async function fromStooq(symbol) {
  const url = `https://stooq.com/q/l/?s=${encodeURIComponent(symbol)}&f=sd2t2ohlcv&h&e=csv`;
  const r = await fetch(url, { signal: AbortSignal.timeout(6000) });
  if (!r.ok) return null;
  return parseStooqCsv(await r.text());
}

// Yahoo Finance chart API — meta.regularMarketPrice + regularMarketTime(초). 미국 ETF는 티커 그대로.
// [2026-08-16] 시간외(프리/애프터마켓) 가격 반영 — 기존엔 regularMarketPrice만 읽어서 정규장
//   마감 후엔 가격이 그대로 멈춰있었음(폴링 자체는 계속 돌고 있었지만 소스가 안 바뀌는 값을 줌).
//   Yahoo meta.marketState(PRE/REGULAR/POST/CLOSED)로 세션을 보고, PRE/POST 세션이면
//   preMarketPrice/postMarketPrice를 우선 사용 — 국내(.KS/.KQ)는 Yahoo가 이 필드를 안 주는 경우가
//   많아 사실상 regularMarketPrice로 자연히 폴백(국내 시간외는 KIS 연동으로 별도 진행 예정).
async function fromYahoo(ysym) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ysym)}?interval=1d&range=5d`;
  const r = await fetch(url, { signal: AbortSignal.timeout(6000), headers: { "User-Agent": "Mozilla/5.0" } });
  if (!r.ok) return null;
  const j = await r.json();
  const res = j?.chart?.result?.[0];
  const meta = res?.meta;
  if (!meta) return null;

  const state = meta?.marketState;
  let price = null, ts = null;
  if (state === "POST" && Number.isFinite(meta?.postMarketPrice) && meta.postMarketPrice > 0) {
    price = meta.postMarketPrice; ts = meta?.postMarketTime;
  } else if (state === "PRE" && Number.isFinite(meta?.preMarketPrice) && meta.preMarketPrice > 0) {
    price = meta.preMarketPrice; ts = meta?.preMarketTime;
  }
  if (!Number.isFinite(price) || price <= 0) {
    price = meta?.regularMarketPrice;
    ts = meta?.regularMarketTime;
  }
  if (!Number.isFinite(price) || price <= 0) return null;
  const date = ts ? new Date(ts * 1000).toISOString().slice(0, 10) : null;
  return { price, date, currency: meta?.currency || null, marketState: state || null };
}

// 단일 티커 해석 — Yahoo(시간외 포함) 1차, Stooq 폴백. { price, currency, date, symbol, source } | null
async function resolveOne(rawIn, market) {
  const raw = String(rawIn || "").trim().toLowerCase().replace(/[^a-z0-9.]/g, "");
  if (!raw) return null;
  const mkt = String(market || "").toLowerCase();
  const isKr = mkt === "kr" || (/^\d+$/.test(raw) && mkt !== "us");
  const base = raw.includes(".") ? raw.split(".")[0] : raw;
  const stooqSym = raw.includes(".") ? raw : (isKr ? `${raw}.kr` : `${raw}.us`);
  const ccy = isKr ? "KRW" : "USD";
  let q = null, source = null;
  const candidates = isKr ? [`${base}.KS`, `${base}.KQ`] : [base.toUpperCase()];
  for (const ysym of candidates) {
    try { const y = await fromYahoo(ysym); if (y) { q = y; source = "yahoo"; break; } } catch (e) { /* graceful */ }
  }
  if (!q) {
    try { q = await fromStooq(stooqSym); if (q) source = "stooq.com"; } catch (e) { /* graceful */ }
  }
  if (!q) return null;
  return { price: q.price, currency: q.currency || ccy, date: q.date, symbol: stooqSym, source, ticker: raw.toUpperCase() };
}

export default async function handler(req, res) {
  const market = (req.query.market || "").toString().toLowerCase();

  // [S20-1] 배치 — ?tickers=A,B,C 여러 종목을 한 요청으로. 응답: { ok, quotes:{TICKER:{price,currency,date}} }
  const batchRaw = (req.query.tickers || "").toString();
  if (batchRaw.trim()) {
    const list = [...new Set(batchRaw.split(",").map((t) => t.trim()).filter(Boolean))].slice(0, 60);
    const quotes = {};
    await Promise.all(list.map(async (tk) => {
      const one = await resolveOne(tk, market);
      if (one) quotes[one.ticker] = { price: one.price, currency: one.currency, date: one.date, source: one.source };
    }));
    // [S21-7] 부분 실패를 조용히 넘기지 않도록 못 가져온 티커를 missing 으로 알린다.
    //   키 정규화는 resolveOne 과 동일(소문자·영숫자/점만·대문자). 클라는 missing 만 개별 재조회한다.
    const missing = list.filter((tk) => {
      const key = String(tk).trim().toLowerCase().replace(/[^a-z0-9.]/g, "").toUpperCase();
      return !quotes[key];
    });
    // 실패분이 있으면 그 상태를 5분간 굳히지 않도록 캐시를 짧게.
    res.setHeader("Cache-Control", missing.length ? "s-maxage=30, stale-while-revalidate=60" : "s-maxage=300, stale-while-revalidate=900");
    return res.status(200).json({ ok: true, quotes, missing });
  }

  // 단건(기존 호환)
  const raw0 = (req.query.ticker || "").toString().trim().toLowerCase().replace(/[^a-z0-9.]/g, "");
  if (!raw0) return res.status(400).json({ ok: false, error: "ticker required" });
  const one = await resolveOne(raw0, market);
  if (one) {
    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=900");
    return res.status(200).json({
      ok: true, ticker: one.ticker, symbol: one.symbol,
      price: one.price, currency: one.currency, date: one.date, source: one.source,
    });
  }
  return res.status(200).json({ ok: false, ticker: raw0.toUpperCase(), error: "시세 소스 연결 실패(Yahoo·Stooq)" });
}
