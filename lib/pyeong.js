// lib/pyeong.js — 면적 표기 단일화 (CA 수집정보 · 리포트 · 부동산 흐름 공용)
//
// 사용자 결정(2026-07-26 최종): 면적은 '일반적으로 쓰는 평형'으로 통일한다. ㎡ 미표기.
//   일반 평형 = 공급면적 기준. 수집값은 전용㎡라 전용률(0.74)로 공급면적 환산 후 평 계산.
//   즉 평 = 전용㎡ ÷ 0.74 ÷ 3.3058.  예) 전용 84㎡ → 34평, 59㎡ → 24평 (이른바 국평).
//
// ★ 이 공식은 앱 부동산 대시보드의 m2ToPyeong(realestate.js)과 동일하다 —
//   이제 CA 수집정보/리포트와 실거래 대시보드가 같은 '통상 평형'을 쓴다.

const M2_PER_PYEONG = 3.3058;   // 1평
const EXCLUSIVE_RATIO = 0.74;   // 전용률(전용→공급 환산) — 대시보드 m2ToPyeong과 동일 상수

// 문자열/숫자에서 첫 ㎡ 수치를 뽑는다. "84", "84.9", "84~113㎡", 84 → 84
function firstM2(v) {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  const m = s.match(/\d+(?:\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}

// 전용㎡ → 일반적으로 쓰는 평형(공급면적 기준, 정수)
export function pyeongFromM2(m2) {
  const n = typeof m2 === "number" ? m2 : firstM2(m2);
  if (!(n > 0)) return null;
  return Math.round(n / M2_PER_PYEONG / EXCLUSIVE_RATIO);
}

// 원문에 이미 '평' 단위가 들어온 경우(운영자가 손으로 "34평" 등 입력) 인식
function hasPyeongUnit(v) {
  return typeof v === "string" && /평/.test(v);
}

// 면적 라벨(통상 평형, ㎡ 미표기): 전용 84㎡ → "약 34평"
//  - 빈 값 → ''
//  - 이미 '평' 원문 → 그대로 존중
//  - 범위("84~113") → "약 34~46평"
//  - 숫자 못 뽑음 → 원문 그대로
export function areaLabel(pyeongField) {
  if (pyeongField == null) return "";
  const s = String(pyeongField).trim();
  if (!s) return "";
  if (hasPyeongUnit(s)) return s;

  const parts = s.split(/\s*[~\-]\s*/).map((p) => p.trim()).filter(Boolean);
  if (parts.length === 2) {
    const a = firstM2(parts[0]);
    const b = firstM2(parts[1]);
    if (a > 0 && b > 0) {
      return `약 ${pyeongFromM2(a)}~${pyeongFromM2(b)}평`;
    }
  }
  const n = firstM2(s);
  if (!(n > 0)) return s;
  return `약 ${pyeongFromM2(n)}평`;
}

// 짧은 배지용(통상 평형): "34평" (범위 "34~46평", 평원문/비숫자는 그대로)
export function areaChip(pyeongField) {
  if (pyeongField == null) return "";
  const s = String(pyeongField).trim();
  if (!s) return "";
  if (hasPyeongUnit(s)) return s;

  const parts = s.split(/\s*[~\-]\s*/).map((p) => p.trim()).filter(Boolean);
  if (parts.length === 2) {
    const a = firstM2(parts[0]);
    const b = firstM2(parts[1]);
    if (a > 0 && b > 0) return `${pyeongFromM2(a)}~${pyeongFromM2(b)}평`;
  }
  const n = firstM2(s);
  if (!(n > 0)) return s;
  return `${pyeongFromM2(n)}평`;
}
