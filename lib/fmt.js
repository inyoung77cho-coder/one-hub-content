// lib/fmt.js — [S35-5] 화면에 나가는 숫자의 단일 포맷 관문.
//
// 규칙: 템플릿 문자열에 원시 숫자를 직접 넣지 말고 반드시 이 함수를 거친다.
//   `${Number(x)}%` 같은 코드가 소수점 15자리("+10.018214936247727%")를 화면 밖으로 밀어낸다(S35-1).
//   반올림/천단위/단위표기를 한 곳에서 강제해 그 실수가 다시 안 생기게 한다.
//
// 기존 lib/format.js(formatKRW/formatUk/formatManwon/formatPct)도 아래에서 재export —
//   import 창구를 하나로 모아 포맷 함수가 또 흩어지지 않게 한다.

// 퍼센트 숫자만(부호·% 없이). 10.018214936247727 → "10.0"
export function pct(v, d = 1) {
  const n = Number(v);
  if (!isFinite(n)) return "0";
  return n.toFixed(d);
}

// 부호·% 포함. 10.0182 → "+10.0%", -3 → "-3.0%", 0 → "0.0%"
export function signedPct(v, d = 1) {
  const n = Number(v);
  if (!isFinite(n)) return "0%";
  return `${n > 0 ? "+" : ""}${n.toFixed(d)}%`;
}

// 원화 정수 + 천단위 + "원". 1779934 → "1,779,934원"
export function won(v) {
  const n = Number(v);
  if (!isFinite(n)) return "0원";
  return `${Math.round(n).toLocaleString("ko-KR")}원`;
}

// 억 단위. 1073000000 → "10.73억" (기본 2자리)
export function uk(v, d = 2) {
  const n = Number(v);
  if (!isFinite(n)) return "0억";
  return `${(n / 1e8).toLocaleString("ko-KR", { minimumFractionDigits: d, maximumFractionDigits: d })}억`;
}

// 주식 수량. 3000 → "3,000주"
export function qty(v) {
  const n = Number(v);
  if (!isFinite(n)) return "0주";
  return `${Math.round(n).toLocaleString("ko-KR")}주`;
}

// 기존 포맷 함수 재export(창구 일원화). 신규 코드는 위 5개를 우선 사용.
export { formatKRW, formatUk, formatManwon, formatPct } from "./format";
