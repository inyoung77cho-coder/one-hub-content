// lib/pyeong.js — 면적 표기 단일화 (CA 수집정보 · 리포트 · 부동산 흐름 공용)
//
// 사용자 결정(2026-07-26 재확정): CA 엔진 면적은 평으로만 표기한다. ㎡ 미표기.
//   평 = ㎡ ÷ 3.3 (반올림).  예) "84"(전용㎡) → "약 25평"
//
// ⚠️ 앱 부동산 대시보드의 m2ToPyeong(÷3.3÷0.74=공급평, 84㎡→34평)과는 목적이 다르다.
//    그 대시보드는 국토부 실거래(공급평 관례) 화면이라 별개다 — 이 헬퍼는 CA 수집정보/리포트 전용.

const PYEONG_M2 = 3.3;

// 문자열/숫자에서 첫 ㎡ 수치를 뽑는다. "84", "84.9", "84~113㎡", 84 → 84
function firstM2(v) {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  const m = s.match(/\d+(?:\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}

// ㎡ → 환산 평(정수, ÷3.3)
export function pyeongFromM2(m2) {
  const n = typeof m2 === "number" ? m2 : firstM2(m2);
  if (!(n > 0)) return null;
  return Math.round(n / PYEONG_M2);
}

// 원문에 이미 '평' 단위가 들어온 경우(운영자가 손으로 "34평" 등 입력) 인식
function hasPyeongUnit(v) {
  return typeof v === "string" && /평/.test(v);
}

// 면적 라벨(평 전용): "약 25평"  ← ㎡ 미표기(사용자 결정 2026-07-26 재확정: 평으로만)
//  - 빈 값 → ''
//  - 이미 '평' 원문 → 그대로 존중
//  - 범위("84~113") → "약 25~34평"
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

// 짧은 배지용(평 전용): "25평" (범위 "25~34평", 평원문/비숫자는 그대로)
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
