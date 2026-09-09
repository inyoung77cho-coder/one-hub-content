// [S32-2] 주간 리포트 다이제스트 — 운영자 전용. 운영 내부 숫자를 담는다.
//   middleware 가 /api/weekly/ 를 PROTECTED + ADMIN_ONLY 로 이미 강제하지만, 여기서도 x-oh-role 재확인(방어).
//   [S32-5] ?record=1 이면 마스킹된 값을 내려준다 — ★렌더가 아니라 '데이터 반환 시점'에 가린다(DOM 원본 방지).
import { buildDigest } from "../../../lib/weeklyDigest";

// 가리는 것: 단지명(→"분당 A단지"). 가리지 않는 것: 가입자 수·판단 건수·정확도%·수익률%(리포트 본체).
//   디제스트는 금액·종목명·실명을 애초에 담지 않는다(카운트/퍼센트/헤드라인). 남는 식별자는 블록④ 대장 단지명.
function maskDigest(d) {
  const out = JSON.parse(JSON.stringify(d));
  out.block4 = (out.block4 || []).map((it) => ({
    ...it,
    headline: String(it.headline || "").replace(/대장\s+\S+/g, "대장 분당 A단지"),
  }));
  // 블록② 헤드라인에 혹시 금액(억/만원)이 있으면 가린다(방어).
  out.block2 = (out.block2 || []).map((it) => ({
    ...it,
    headline: String(it.headline || "").replace(/\d[\d,.]*\s*(억|만원)/g, "██$2"),
  }));
  out.masked = true;
  return out;
}

export default async function handler(req, res) {
  if (req.headers["x-oh-role"] !== "admin") {
    return res.status(403).json({ ok: false, error: "forbidden" });
  }
  try {
    const week = typeof req.query.week === "string" ? req.query.week : null;
    let digest = await buildDigest(week);
    if (req.query.record === "1") digest = maskDigest(digest);
    res.setHeader("Cache-Control", "s-maxage=600, stale-while-revalidate=1800");
    return res.status(200).json({ ok: true, digest });
  } catch (e) {
    // 소재가 없어도 오류로 끊지 않는다(빈 주차가 정상) — buildDigest 는 빈 배열을 주지 던지지 않는다.
    return res.status(200).json({ ok: true, digest: null, error: String(e) });
  }
}
