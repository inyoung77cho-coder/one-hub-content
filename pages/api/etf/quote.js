// [ETF 시세] 티커 현재가 조회 — 사용자가 직접 추가한 ETF의 가격 자동 업데이트용.
//   1차: Stooq(공개·키 불필요) → 실패 시 2차: Yahoo Finance chart API(미국 ETF 커버리지 우수).
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
async function fromYahoo(ysym) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ysym)}?interval=1d&range=5d`;
  const r = await fetch(url, { signal: AbortSignal.timeout(6000), headers: { "User-Agent": "Mozilla/5.0" } });
  if (!r.ok) return null;
  const j = await r.json();
  const res = j?.chart?.result?.[0];
  const meta = res?.meta;
  const price = meta?.regularMarketPrice;
  if (!Number.isFinite(price) || price <= 0) return null;
  const ts = meta?.regularMarketTime;
  const date = ts ? new Date(ts * 1000).toISOString().slice(0, 10) : null;
  return { price, date, currency: meta?.currency || null };
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
  // 1차: Stooq
  try { q = await fromStooq(stooqSym); if (q) source = "stooq.com"; } catch (e) { /* graceful */ }
  // 2차: Yahoo (미국=티커 그대로, 국내=.KS→.KQ 순차 시도)
  if (!q) {
    const candidates = isKr ? [`${base}.KS`, `${base}.KQ`] : [base.toUpperCase()];
    for (const ysym of candidates) {
      try { const y = await fromYahoo(ysym); if (y) { q = y; source = "yahoo"; break; } } catch (e) { /* graceful */ }
    }
  }

  if (q) {
    // 5분 신선 + 15분 stale-while-revalidate → 자동 갱신, 과호출 방지
    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=900");
    return res.status(200).json({
      ok: true, ticker: raw.toUpperCase(), symbol: stooqSym,
      price: q.price, currency: q.currency || ccy, date: q.date, source,
    });
  }
  return res.status(200).json({ ok: false, ticker: raw.toUpperCase(), error: "시세 소스 연결 실패(Stooq·Yahoo)" });
}
