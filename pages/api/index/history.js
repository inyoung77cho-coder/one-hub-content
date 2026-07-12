// [성과비교] 시장지수 기간 수익률 — 매수(가입) 시점 종가 vs 최신 종가로 구간 수익률 산출.
//   1차: Stooq 일봉 히스토리(CSV) → 실패 시 2차: Yahoo chart(range=2y).
//   지원 심볼: kospi(^kospi), spx(^spx). ⚠️ 개발환경 프록시는 외부 호출을 막을 수 있어 실패 가능(정직한 ok:false).
const SYMS = {
  kospi: { stooq: "^kospi", yahoo: "^KS11", label: "KOSPI" },
  spx: { stooq: "^spx", yahoo: "^GSPC", label: "S&P 500" },
};

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
