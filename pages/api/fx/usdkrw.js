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
  // [S45 SA-2] 과거일자 조회 — ?date=YYYY-MM-DD 가 오면 그날(또는 직전 영업일) USD→KRW 환율을
  //   취득시 환율(acqFx) 자동채움에 쓴다. frankfurter 가 영업일 보정해 실제 적용일을 응답에 담는다.
  //   ★오늘 환율로 대체하지 않는다 — 과거일 조회가 실패하면 ok:false 를 주고 사용자가 직접 입력한다.
  const rawDate = typeof req.query.date === "string" ? req.query.date.trim() : "";
  if (rawDate) {
    const today = new Date().toISOString().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(rawDate) || rawDate > today) {
      return res.status(400).json({ ok: false, error: "유효한 과거 날짜(YYYY-MM-DD)가 아닙니다." });
    }
    try {
      const r = await fetch(`https://api.frankfurter.app/${rawDate}?from=USD&to=KRW`, { signal: AbortSignal.timeout(6000) });
      if (r.ok) {
        const d = await r.json();
        const rate = d?.rates?.KRW;
        if (rate && Number(rate) > 0) {
          // 과거일 환율은 변하지 않는다 → 오래 캐시.
          res.setHeader("Cache-Control", "public, s-maxage=604800, max-age=86400");
          return res.status(200).json({ ok: true, rate: Number(rate), date: d.date || rawDate, requested: rawDate, source: "frankfurter.app" });
        }
      }
    } catch (e) { /* 아래 실패 응답 */ }
    return res.status(200).json({ ok: false, error: "과거 환율 조회 실패", requested: rawDate });
  }

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
