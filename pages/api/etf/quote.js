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

export default async function handler(req, res) {
  const raw = (req.query.ticker || "").toString().trim().toLowerCase().replace(/[^a-z0-9.]/g, "");
  if (!raw) return res.status(400).json({ ok: false, error: "ticker required" });
  // 시장 접미사 결정: 명시값 > 숫자코드(.kr) > 기본(.us)
  const market = (req.query.market || "").toString().toLowerCase();
  const isKr = market === "kr" || (/^\d+$/.test(raw) && market !== "us");
  const base = raw.includes(".") ? raw.split(".")[0] : raw;
  const stooqSym = raw.includes(".") ? raw : (isKr ? `${raw}.kr` : `${raw}.us`);
  const ccy = isKr ? "KRW" : "USD";

  let q = null, source = null;
  // [2026-08-16] 순서 뒤집음 — Stooq가 1차였을 때는 항상 Stooq의 종가(EOD)가 먼저 성공해서
  //   fromYahoo()의 시간외가 계산이 사실상 죽은 코드였음(성공하면 바로 return, Yahoo는 호출도 안 됨).
  //   Yahoo를 1차로 — 정규장에도 충분히 실시간이고, 시간외엔 pre/postMarketPrice까지 반영됨.
  //   Stooq는 Yahoo 실패(네트워크/미지원 티커) 시에만 폴백.
  const candidates = isKr ? [`${base}.KS`, `${base}.KQ`] : [base.toUpperCase()];
  for (const ysym of candidates) {
    try { const y = await fromYahoo(ysym); if (y) { q = y; source = "yahoo"; break; } } catch (e) { /* graceful */ }
  }
  if (!q) {
    try { q = await fromStooq(stooqSym); if (q) source = "stooq.com"; } catch (e) { /* graceful */ }
  }

  if (q) {
    // 5분 신선 + 15분 stale-while-revalidate → 자동 갱신, 과호출 방지
    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=900");
    return res.status(200).json({
      ok: true, ticker: raw.toUpperCase(), symbol: stooqSym,
      price: q.price, currency: q.currency || ccy, date: q.date, source,
    });
  }
  return res.status(200).json({ ok: false, ticker: raw.toUpperCase(), error: "시세 소스 연결 실패(Yahoo·Stooq)" });
}
