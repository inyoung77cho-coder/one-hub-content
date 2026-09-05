// [S31-4/5] 은퇴·인출 — ★순수 산수만. 예측·확률·최적화 없음(자문 회피·표본 없음).
//   단계(life_stage): accumulate(축적)/transition(전환·은퇴 5년 내)/withdraw(인출). 기본 accumulate(회귀 없음).
//   인출 입력(onehub_withdraw): 월 목표 생활비·연금 월 수령액·배당/이자 월액(사용자 입력·추정 안 함).
const STAGE_KEY = "onehub_life_stage";
const WD_KEY = "onehub_withdraw";
export const LIFE_STAGES = ["accumulate", "transition", "withdraw"];
export const STAGE_LABEL = { accumulate: "축적기", transition: "은퇴 전환기", withdraw: "인출기" };
export const WITHDRAW_RULE_PCT = 4; // 참고선(권유 아님)

function rd(k, dflt) {
  if (typeof window === "undefined") return dflt;
  try { const v = localStorage.getItem(k); return v == null ? dflt : v; } catch { return dflt; }
}

export function getLifeStage() {
  const v = rd(STAGE_KEY, "accumulate");
  return LIFE_STAGES.includes(v) ? v : "accumulate";
}
export function setLifeStage(v) {
  if (!LIFE_STAGES.includes(v)) return;
  try { localStorage.setItem(STAGE_KEY, v); window.dispatchEvent(new Event("onehub-assets-change")); } catch {}
}

export function getWithdrawInputs() {
  try { return JSON.parse(rd(WD_KEY, "null")) || {}; } catch { return {}; }
}
export function setWithdrawInputs(patch) {
  const cur = getWithdrawInputs();
  const next = { ...cur, ...patch };
  try { localStorage.setItem(WD_KEY, JSON.stringify(next)); window.dispatchEvent(new Event("onehub-assets-change")); } catch {}
  return next;
}

// 순수 산수. 입력 만원 단위, 운용자산 억 단위. 수익률 0%·물가 미반영 가정.
//   monthlyExpense: 월 목표 생활비(만원) · monthlyPension: 연금 월 수령(만원) · monthlyDividend: 배당·이자 월액(만원)
export function computeWithdrawPlan({ operatingUk, monthlyExpense, monthlyPension = 0, monthlyDividend = 0 }) {
  const assetWon = Number(operatingUk) > 0 ? Number(operatingUk) * 1e8 : 0; // 억→원
  const exp = Number(monthlyExpense) || 0;      // 만원
  const pen = Number(monthlyPension) || 0;
  const div = Number(monthlyDividend) || 0;
  const coverWon = (pen + div) * 1e4;           // 연금+배당 월(원)
  const expWon = exp * 1e4;
  const needMonthlyWon = Math.max(0, expWon - coverWon);   // 자산에서 월 인출
  const needYearlyWon = needMonthlyWon * 12;
  const coverRate = expWon > 0 ? Math.round((coverWon / expWon) * 100) : null; // 생활비 커버율%
  const withdrawRate = assetWon > 0 ? Math.round((needYearlyWon / assetWon) * 1000) / 10 : null; // 연 인출률%
  const years = (assetWon > 0 && needYearlyWon > 0) ? Math.floor(assetWon / needYearlyWon) : null; // 지속 연수(0% 가정)
  return {
    needMonthlyManwon: Math.round(needMonthlyWon / 1e4),
    coverRate,                       // % 또는 null
    withdrawRate,                    // % 또는 null(부족분 0이면 자산 소진 안 함)
    years,                           // 년 또는 null
    coverManwon: pen + div,
    expManwon: exp,
    ruleOk: withdrawRate != null ? withdrawRate <= WITHDRAW_RULE_PCT : null,
    hasDividend: div > 0,
  };
}
