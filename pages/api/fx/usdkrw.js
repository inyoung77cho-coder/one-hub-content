// [환율] 오늘 USD→KRW 환율 — 공개 소스에서 조회, 일일 캐시로 매일 자동 갱신.
//   ETF 히어로의 '환율'을 백엔드 종가(과거) 대신 당일 실시간 값으로 표기하기 위한 프록시.
//   여러 소스를 순서대로 시도(장애 대비). 키 불필요한 무료 소스만 사용.
const SOURCES = [
  {
    url: "https://api.frankfurter.app/latest?from=USD&to=KRW",
    pick: (d) => ({ rate: d?.rates?.KRW, date: d?.date || null }),
  },
  {
    url: "https://open.er-api.com/v6/latest/USD",
    pick: (d) => ({ rate: d?.rates?.KRW, date: d?.time_last_update_utc ? new Date(d.time_last_update_utc).toISOString().slice(0, 10) : null }),
  },
];

export default async function handler(req, res) {
  for (const src of SOURCES) {
    try {
      const r = await fetch(src.url, { signal: AbortSignal.timeout(6000) });
      if (!r.ok) continue;
      const d = await r.json();
      const { rate, date } = src.pick(d);
      if (rate && Number(rate) > 0) {
        // 엣지/CDN 캐시: 12시간 신선 + 24시간 stale-while-revalidate → 사실상 매일 자동 갱신
        res.setHeader("Cache-Control", "s-maxage=43200, stale-while-revalidate=86400");
        return res.status(200).json({ ok: true, rate: Number(rate), date: date || null, source: new URL(src.url).host });
      }
    } catch (e) {
      // 다음 소스로
    }
  }
  return res.status(200).json({ ok: false, error: "FX 소스 연결 실패" });
}
