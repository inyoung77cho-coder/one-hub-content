// [S24-9] 오늘 브리핑 읽어주기 대본 — 순수 함수. 화면이 쓰는 값과 '같은 소스'에서 만든다
//   (읽어주는 내용과 보이는 내용이 다르면 최악). 숫자는 읽기 좋게("10.67억" → "10억 6,700만원").
//   ★S24-1(곡선/숫자 정합) 이후에만 붙인다 — 눈으로 검증 못 하는 오디오에 틀린 숫자가 가장 나쁘다.

// 억(uk) → "N억 M만원" (읽기 좋은 한국어).
export function ukWords(uk) {
  if (uk == null || !isFinite(uk)) return "";
  const v = Math.abs(Number(uk));
  const eok = Math.floor(v);
  const man = Math.round((v - eok) * 10000);
  let s = "";
  if (eok > 0) s += `${eok.toLocaleString()}억`;
  if (man > 0) s += `${s ? " " : ""}${man.toLocaleString()}만원`;
  if (!s) s = "0원";
  return s;
}

export function briefingScript({ dateLabel, headUk, hasResidence, deltaUk, todoCount = 0, positionCount = 0, progress, aiLine } = {}) {
  const parts = [];
  if (dateLabel) parts.push(`${dateLabel} 오늘의 자산입니다.`);
  if (headUk != null) {
    const label = hasResidence ? "운용자산" : "총자산";
    let s = `${label}은 ${ukWords(headUk)}`;
    if (deltaUk != null && Math.abs(deltaUk) >= 0.005) s += `, 어제보다 ${ukWords(deltaUk)} ${deltaUk >= 0 ? "늘었습니다" : "줄었습니다"}`;
    else s += "입니다";
    parts.push(s + ".");
  }
  if (todoCount > 0) parts.push(`오늘 조치할 종목이 ${todoCount}건 있습니다.`);
  else if (positionCount > 0) parts.push(`오늘 조치할 종목은 없고, ${positionCount}종목 모두 유지 구간입니다.`);
  if (progress && progress.length) {
    const p = progress[0];
    if (p && p.ret != null) {
      parts.push(`${p.days}일 전 ${p.decision === "take" ? "보유" : "관망"} 판단한 ${p.name}는 이후 ${Math.abs(p.ret).toFixed(1)}퍼센트 ${p.ret >= 0 ? "올랐습니다" : "내렸습니다"}.`);
    }
  }
  if (aiLine) parts.push(aiLine);
  return parts.join(" ").slice(0, 580);
}

// 대본 → 짧은 해시(변경 감지·캐시 키 보조). 백엔드는 text 자체로 캐시하므로 참고용.
export function scriptHash(s) {
  let h = 0;
  for (let i = 0; i < String(s).length; i++) h = (h * 31 + String(s).charCodeAt(i)) | 0;
  return String(h >>> 0);
}
