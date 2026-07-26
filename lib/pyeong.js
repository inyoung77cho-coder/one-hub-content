// lib/pyeong.js — 면적 표기 단일화 (CA 수집정보 · 리포트 공용)
//
// ★ 사실관계(2026-07-26 프로덕션 실측):
//   CA 수집정보의 pyeong 필드는 대개 '이미 평(平) 값'이다.
//   부동산 카톡방은 "34평"처럼 평으로 말하고, 파서가 그 숫자 '34'를 그대로 저장한다.
//   → 그래서 이 값은 환산하지 않고 그대로 '34평'으로 보여줘야 한다.
//     (예전에 ㎡로 오해해 ÷ 환산하면 34평이 14평으로 깨진다 — 실제 버그였음)
//
// 예외: 드물게 "84타입"·"전용 84㎡"처럼 ㎡ 기준으로 온 값은 '㎡' 표식이 붙어 오며,
//   이때만 통상 평형(공급면적 기준, 전용㎡ ÷0.74 ÷3.3058)으로 환산한다.
//
// ⚠️ 앱 부동산 대시보드(realestate.js)의 pyeong 은 이와 달리 '전용㎡'라 m2ToPyeong 으로
//    환산한다 — 같은 이름이라도 출처가 다르다. 이 헬퍼는 CA 수집정보/리포트 전용.

const M2_PER_PYEONG = 3.3058;   // 1평
const EXCLUSIVE_RATIO = 0.74;   // 전용률(전용→공급) — ㎡로 온 값 환산용

function firstNum(v) {
  if (v == null) return null;
  const m = String(v).match(/\d+(?:\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}

// ㎡ 표식이 있는가 (㎡ / m2 / m² / 타입)
function isM2(s) {
  return /㎡|m²|m2|타입/i.test(s);
}

// 전용㎡ → 통상 평형(공급면적 기준, 정수)
export function pyeongFromM2(m2) {
  const n = typeof m2 === "number" ? m2 : firstNum(m2);
  if (!(n > 0)) return null;
  return Math.round(n / M2_PER_PYEONG / EXCLUSIVE_RATIO);
}

// 원문에 이미 '평' 단위가 있는가
function hasPyeongUnit(v) {
  return typeof v === "string" && /평/.test(v);
}

// 값을 평 정수로. 평 기준이면 그대로, ㎡ 기준이면 환산.
function toPyeong(numStr, m2mode) {
  const n = firstNum(numStr);
  if (!(n > 0)) return null;
  return m2mode ? pyeongFromM2(n) : Math.round(n);
}

// 면적 라벨: 평 값 "34평" (㎡로 온 값은 "약 34평"). 범위 "34~48평".
//  - 빈 값 → ''
//  - 이미 '평' 원문 → 그대로 존중
//  - 숫자 못 뽑음 → 원문 그대로
export function areaLabel(pyeongField) {
  const s = pyeongField == null ? "" : String(pyeongField).trim();
  if (!s) return "";
  if (hasPyeongUnit(s)) return s;                 // "34평" 등 원문 존중
  const m2 = isM2(s);
  const pre = m2 ? "약 " : "";                      // ㎡ 환산은 근사 → '약'

  const parts = s.split(/\s*[~\-]\s*/).map((p) => p.trim()).filter(Boolean);
  if (parts.length === 2) {
    const a = toPyeong(parts[0], m2);
    const b = toPyeong(parts[1], m2);
    if (a > 0 && b > 0) return `${pre}${a}~${b}평`;
  }
  const n = toPyeong(s, m2);
  if (!(n > 0)) return s;
  return `${pre}${n}평`;
}

// 짧은 배지용: "34평" (범위 "34~48평"). '약'은 붙이지 않는다(공간 절약).
export function areaChip(pyeongField) {
  const s = pyeongField == null ? "" : String(pyeongField).trim();
  if (!s) return "";
  if (hasPyeongUnit(s)) return s;
  const m2 = isM2(s);

  const parts = s.split(/\s*[~\-]\s*/).map((p) => p.trim()).filter(Boolean);
  if (parts.length === 2) {
    const a = toPyeong(parts[0], m2);
    const b = toPyeong(parts[1], m2);
    if (a > 0 && b > 0) return `${a}~${b}평`;
  }
  const n = toPyeong(s, m2);
  if (!(n > 0)) return s;
  return `${n}평`;
}
