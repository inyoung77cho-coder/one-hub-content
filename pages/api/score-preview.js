// pages/api/score-preview.js — [P2] 로그인 전 무료 ONE Score 체험 공개 프록시.
//   middleware PROTECTED 목록 밖이라 비로그인도 호출 가능(랜딩 훅). 국토부 실거래 기반 채점만 노출.
//   kind=regions            → 지역 목록
//   kind=complexes&region=  → 지역 내 단지
//   kind=score&complex=&region=&area= → ONE Score(점수·판정·저평가율)
//   개인정보/계정 데이터는 일절 다루지 않음. RE_ACCESS_KEY 는 서버에서만 부착.
const RE_API = process.env.RE_API_URL || "http://54.180.54.132:5002";
const RE_KEY = process.env.RE_ACCESS_KEY || "";

// 인스턴스별 베스트에포트 레이트리밋(서버리스라 완벽하진 않음 — 남용 억제용).
const HITS = new Map();
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 40;
function limited(ip) {
  const now = Date.now();
  const rec = HITS.get(ip) || { n: 0, t: now };
  if (now - rec.t > WINDOW_MS) { rec.n = 0; rec.t = now; }
  rec.n += 1; HITS.set(ip, rec);
  if (HITS.size > 5000) HITS.clear(); // 메모리 상한
  return rec.n > MAX_PER_WINDOW;
}

async function re(path) {
  const sep = path.includes("?") ? "&" : "?";
  const url = `${RE_API}${path}${RE_KEY ? `${sep}key=${encodeURIComponent(RE_KEY)}` : ""}`;
  const r = await fetch(url, { headers: { "X-API-Key": RE_KEY }, signal: AbortSignal.timeout(8000) });
  return r.json();
}

export default async function handler(req, res) {
  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "anon";
  if (limited(ip)) return res.status(429).json({ ok: false, error: "잠시 후 다시 시도해 주세요" });

  const kind = (req.query.kind || "score").toString();
  try {
    if (kind === "regions") {
      const d = await re("/api/regions");
      const regions = Array.isArray(d.regions) ? d.regions.map((r) => r.name).filter(Boolean) : [];
      return res.status(200).json({ ok: true, regions });
    }
    if (kind === "complexes") {
      const region = (req.query.region || "서현동").toString();
      const d = await re(`/api/complexes?region=${encodeURIComponent(region)}`);
      return res.status(200).json({ ok: true, complexes: Array.isArray(d.complexes) ? d.complexes : [] });
    }
    // kind === score
    const complex = (req.query.complex || "").toString().trim();
    const region = (req.query.region || "서현동").toString();
    const area = Math.max(20, Math.min(parseInt(req.query.area, 10) || 84, 300));
    if (!complex) return res.status(400).json({ ok: false, error: "단지를 선택해 주세요" });
    const d = await re(`/api/v2/score/${encodeURIComponent(complex)}?region=${encodeURIComponent(region)}&area=${area}`);
    if (!d || d.error || d.one_score == null) {
      return res.status(200).json({ ok: false, error: "이 단지는 아직 채점 데이터가 부족합니다" });
    }
    // 공개 노출 필드만 추림(내부 필드 최소화)
    return res.status(200).json({
      ok: true,
      complex: d.complex, region: d.region, area: d.area,
      one_score: d.one_score, decision: d.decision, reason: d.reason,
      valuation: d.valuation, diff_pct: d.diff_pct, avm_total_uk: d.avm_total_uk,
      components: d.components || null,
    });
  } catch (e) {
    return res.status(200).json({ ok: false, error: "일시적으로 채점할 수 없습니다" });
  }
}
