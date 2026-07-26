// lib/pyeong.js — 면적 표기 단일화 (CA 수집정보 · 리포트 · 부동산 흐름 공용)
//
// 사용자 결정(2026-07-26): 평 = ㎡ ÷ 3.3, '원면적(㎡)'과 '환산 평'을 병기하고
// 전용면적 기준임을 '(전용)'/'전용' 라벨로 명시한다.
//   예) "84"(전용㎡) → "전용 84㎡ · 약 25평"
//
// ⚠️ 앱 부동산 대시보드의 m2ToPyeong(÷3.3÷0.74=공급평, 84㎡→34평)과는 목적이 다르다.
//    이 헬퍼는 CA 수집정보처럼 '전용㎡ 원본'을 그대로 병기하는 용도다(사용자가 ÷3.3 병기 선택).
//    두 규칙이 한 화면에서 만나면 라벨(전용/공급)로 구분한다.

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

// 면적 라벨: "전용 84㎡ · 약 25평" (전용 기준 병기)
//  - 빈 값 → ''
//  - 이미 '평' 원문 → 그대로 존중
//  - 범위("84~113") → 양끝 각각 환산
//  - 숫자 못 뽑음 → 원문 그대로
export function areaLabel(pyeongField, { prefix = "전용" } = {}) {
  if (pyeongField == null) return "";
  const s = String(pyeongField).trim();
  if (!s) return "";
  if (hasPyeongUnit(s)) return s;

  const parts = s.split(/\s*[~\-]\s*/).map((p) => p.trim()).filter(Boolean);
  if (parts.length === 2) {
    const a = firstM2(parts[0]);
    const b = firstM2(parts[1]);
    if (a > 0 && b > 0) {
      return `${prefix} ${a}~${b}㎡ · 약 ${pyeongFromM2(a)}~${pyeongFromM2(b)}평`;
    }
  }
  const n = firstM2(s);
  if (!(n > 0)) return s;
  return `${prefix} ${n}㎡ · 약 ${pyeongFromM2(n)}평`;
}

// 짧은 배지용: "84㎡·25평" (범위/평원문은 areaLabel 규칙 축약)
export function areaChip(pyeongField) {
  if (pyeongField == null) return "";
  const s = String(pyeongField).trim();
  if (!s) return "";
  if (hasPyeongUnit(s)) return s;
  const n = firstM2(s);
  if (!(n > 0)) return s;
  return `${n}㎡·${pyeongFromM2(n)}평`;
}
