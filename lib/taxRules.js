// [S4] 세율/한도 단일 소스 — data/tax_rules.json 외부화 로더.
//   숫자(세율·한도)를 코드에 하드코딩하지 않고 JSON에서 읽어 세법 개정 시 JSON만 교체.
import RULES from "../data/tax_rules.json";

export const TAX_ACCOUNTS = ["일반", "연금", "ISA"];

export function acctRule(account) {
  return RULES.accounts[account] || RULES.accounts["일반"];
}

// 계좌별 세제 안내 한 줄(버킷 분기 노출용)
export function acctTaxNote(account) {
  return acctRule(account).note;
}

// 세법 면책 문구
export const TAX_DISCLAIMER = RULES._meta.disclaimer;
export const TAX_META = RULES._meta;

// 연금 세액공제 한도(원)
export function pensionCreditLimit() {
  return acctRule("연금").tax_credit_limit_won || 9000000;
}

// 연금 세액공제 진행률(0~1) — 올해 납입(추정/입력) ÷ 한도
export function pensionCreditProgress(contributionWon) {
  const limit = pensionCreditLimit();
  if (!(limit > 0)) return 0;
  return Math.max(0, Math.min(1, Number(contributionWon || 0) / limit));
}

// 소득기준 세액공제율(저소득 16.5% / 그 외 13.2%) — 참고용 절세 추정
export function pensionCreditRate(incomeWon) {
  const r = acctRule("연금");
  const thr = r.tax_credit_income_threshold_won || 55000000;
  return Number(incomeWon || 0) <= thr ? (r.tax_credit_rate_low || 0.165) : (r.tax_credit_rate_high || 0.132);
}

export default RULES;
