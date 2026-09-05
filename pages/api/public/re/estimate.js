// [S31-1] 공개 부동산 실거래 통계 — 로그인 없이. ★PROTECTED_API_PREFIXES 밖(/api/public/)이라 자동 공개.
//   기존 :5002 엔드포인트 재사용(complex-areas=평형별 실거래·trend=6개월 추이). 새 계산 로직 없음.
//   ★규제(0-2): "적정가" 아님, "실거래 기반 통계". 개인정보 안 받음·IP 로그 안 남김.
//   최소 응답만(유료 기능 노출 금지): 평형별 최근 실거래·6개월 추이. 내 단지 추적·세금·갈아타기는 가입 후.
const RE_API = process.env.RE_API_URL || "http://54.180.54.132:5002";
const RE_KEY = process.env.RE_ACCESS_KEY || "";

// [S31-1] 베스트에포트 레이트리밋(인스턴스 로컬) — 진짜 방어는 아래 s-maxage CDN 캐시.
const HITS = new Map(); // ip → [timestamps]
const WINDOW_MS = 60000, MAX_PER_MIN = 20;
function limited(ip) {
  const now = Date.now();
  const arr = (HITS.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  arr.push(now);
  HITS.set(ip, arr);
  if (HITS.size > 5000) HITS.clear(); // 메모리 폭주 방지
  return arr.length > MAX_PER_MIN;
}

async function up(path) {
  const sep = path.includes("?") ? "&" : "?";
  const url = `${RE_API}${path}${RE_KEY ? `${sep}key=${encodeURIComponent(RE_KEY)}` : ""}`;
  const r = await fetch(url, { headers: { "X-API-Key": RE_KEY }, signal: AbortSignal.timeout(7000) });
  return r.json().catch(() => null);
}

export default async function handler(req, res) {
  const apt = String(req.query.apt || "").trim();
  const region = String(req.query.region || "서현동").trim();
  if (!apt) return res.status(400).json({ ok: false, error: "apt required" });

  // IP 는 판정에만 쓰고 저장하지 않음(개인정보 미보관).
  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "0";
  if (limited(ip)) {
    res.setHeader("Retry-After", "60");
    return res.status(429).json({ ok: false, error: "너무 많은 요청입니다 · 잠시 후 다시 시도해 주세요" });
  }

  try {
    const [areasR, trendR] = await Promise.all([
      up(`/api/v2/complex-areas?complex=${encodeURIComponent(apt)}`),
      up(`/api/trend/${encodeURIComponent(apt)}?region=${encodeURIComponent(region)}&months=6`),
    ]);
    const areas = (areasR && Array.isArray(areasR.areas)) ? areasR.areas.map((a) => ({
      m2: a.m2, 평: a.평, rep_price_uk: a.rep_price_uk, max_price_uk: a.max_price_uk, n: a.n,
    })) : [];
    const trend = (trendR && Array.isArray(trendR.series)) ? trendR.series : [];
    const empty = areas.length === 0 && trend.length === 0;
    // [S31-3] 공개 도구 조회 집계 — 익명·서버 카운터(교차출처라 로컬 불가). fire-and-forget(응답 지연 없음).
    //   CDN 캐시(s-maxage) 덕에 이 함수는 캐시 미스에서만 실행 → 대략 순수 조회만 카운트.
    if (!empty) {
      try { fetch(`${RE_API}/api/v2/public-metric?name=tool_view${RE_KEY ? `&key=${encodeURIComponent(RE_KEY)}` : ""}`, { method: "POST", headers: { "X-API-Key": RE_KEY }, signal: AbortSignal.timeout(3000) }).catch(() => {}); } catch (e) {}
    }
    // 단지 시세는 하루 단위로 바뀐다 → 같은 단지 재요청이 백엔드까지 안 가게 강한 캐시.
    res.setHeader("Cache-Control", empty
      ? "s-maxage=600, stale-while-revalidate=1800"
      : "s-maxage=21600, stale-while-revalidate=86400");
    return res.status(200).json({
      ok: true, apt, region, empty,
      법정동: areasR?.법정동 || null,
      areas, trend, change_pct: (trendR && typeof trendR.change_pct === "number") ? trendR.change_pct : null,
    });
  } catch (e) {
    return res.status(200).json({ ok: false, error: "지금은 조회할 수 없습니다 · 잠시 후 다시" });
  }
}
