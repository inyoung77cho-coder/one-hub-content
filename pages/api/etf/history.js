// [S25-8] ETF 일별 종가 이력 — stooq 일별 CSV(/q/d/l/?s=&i=d). 보유 종목만 클라가 요청.
//   ★예측이 아니라 '관찰'을 위한 데이터다. 30일 종가만 돌려주고, 실패하면 추세를 지어내지 않고 ok:false.
//   ★서버 하루 1회 캐시 = Vercel CDN(s-maxage=86400). 같은 티커는 하루 한 번만 stooq 를 친다.
function parseCsv(text) {
  const lines = (text || "").trim().split("\n");
  if (lines.length < 2) return null;
  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const c = lines[i].split(",");
    const date = c[0];
    const close = Number(c[4]);
    if (date && date !== "N/D" && Number.isFinite(close) && close > 0) out.push({ date, close });
  }
  return out.length ? out : null;
}

export default async function handler(req, res) {
  const raw = String(req.query.ticker || "").trim().toLowerCase().replace(/[^a-z0-9.]/g, "");
  if (!raw) return res.status(400).json({ ok: false, error: "ticker required" });
  const market = String(req.query.market || "").toLowerCase();
  const isKr = market === "kr" || (/^\d+$/.test(raw) && market !== "us");
  const sym = raw.includes(".") ? raw : (isKr ? `${raw}.kr` : `${raw}.us`);
  const url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(sym)}&i=d`;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) { res.setHeader("Cache-Control", "s-maxage=60"); return res.status(200).json({ ok: false, ticker: raw.toUpperCase(), error: "이력 소스 연결 실패" }); }
    const rows = parseCsv(await r.text());
    if (!rows) { res.setHeader("Cache-Control", "s-maxage=60"); return res.status(200).json({ ok: false, ticker: raw.toUpperCase(), error: "이력 없음" }); }
    const last = rows.slice(-40); // 30일 곡선 + 4주 변화 여유
    res.setHeader("Cache-Control", "s-maxage=86400, stale-while-revalidate=172800"); // 하루 1회
    return res.status(200).json({ ok: true, ticker: raw.toUpperCase(), symbol: sym, closes: last });
  } catch (e) {
    res.setHeader("Cache-Control", "s-maxage=60");
    return res.status(200).json({ ok: false, ticker: raw.toUpperCase(), error: "이력 수집 중" });
  }
}
