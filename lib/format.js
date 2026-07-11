// [S1.4] 공용 포맷 유틸 — 숫자/통화 표기를 한 곳에서 통일.
//   워크오더 규칙: 가격(현재가·매수가)은 정수 표기, 평단(평균단가)만 툴팁에서 소수 노출.
//   한글 단위(원/억)와 천단위 콤마를 일관되게 처리한다.

// 원화 정수 표기 — "12,345원". decimals>0 이면 소수 자릿수 유지(평단 툴팁 등).
export function formatKRW(v, { decimals = 0, suffix = "원" } = {}) {
  const n = Number(v);
  if (!isFinite(n)) return `0${suffix}`;
  const body = n.toLocaleString("ko-KR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return `${body}${suffix}`;
}

// 억 단위 표기 — 총자산/평가금액 요약용. "3.2억".
export function formatUk(v, { decimals = 1 } = {}) {
  const n = Number(v);
  if (!isFinite(n)) return `0억`;
  return `${n.toLocaleString("ko-KR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}억`;
}

// 원 → 만원 정수 표기. "1,234만".
export function formatManwon(vWon) {
  const n = Number(vWon);
  if (!isFinite(n)) return `0만`;
  return `${Math.round(n / 10000).toLocaleString("ko-KR")}만`;
}

// 퍼센트 — 부호 포함 옵션. "+3.21%".
export function formatPct(v, { decimals = 2, signed = false } = {}) {
  const n = Number(v);
  if (!isFinite(n)) return `0%`;
  const body = n.toFixed(decimals);
  return `${signed && n > 0 ? "+" : ""}${body}%`;
}
