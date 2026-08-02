// [내 세금] 부동산 재산세·종합부동산세 추정 계산 — data/property_tax_rules.json 단일 소스.
//   숫자를 코드에 하드코딩하지 않는다(세법 개정 시 JSON만 교체) — lib/taxRules.js와 동일한 원칙.
//   재산세액공제·세부담상한 등 일부 조정 항목은 반영하지 않은 단순 추정치다(RULES._meta 고지 그대로 노출할 것).
import RULES from "../data/property_tax_rules.json";

export const PROPERTY_TAX_META = RULES._meta;

function progressiveTax(base, brackets) {
  let tax = 0;
  let prev = 0;
  for (const b of brackets) {
    const cap = b.upTo == null ? base : Math.min(base, b.upTo);
    if (cap > prev) tax += (cap - prev) * b.rate;
    prev = cap;
    if (b.upTo != null && base <= b.upTo) break;
  }
  return Math.max(0, Math.round(tax));
}

// 공정시장가액비율 — 1세대1주택 특례는 공시가격 9억원 이하일 때만 적용(그 초과분은 일반 60%).
function fairMarketRatio(assessedValue, isOneHouse) {
  const p = RULES.propertyTax.fairMarketRatio;
  if (!isOneHouse || assessedValue > p.oneHouseSpecialCapWon) return p.general;
  const band = p.oneHouseBands.find((b) => b.upTo == null || assessedValue <= b.upTo);
  return band ? band.ratio : p.general;
}

/**
 * 재산세 추정 계산.
 * @param {number} assessedValue 공시가격(원)
 * @param {boolean} isOneHouse 1세대1주택 여부
 * @returns {{taxBase:number, ratio:number, propertyTax:number, urbanAreaTax:number, localEduTax:number, total:number}}
 */
export function calcPropertyTax(assessedValue, isOneHouse) {
  const value = Math.max(0, Number(assessedValue) || 0);
  const ratio = fairMarketRatio(value, isOneHouse);
  const taxBase = Math.round(value * ratio);
  const brackets = isOneHouse && value <= RULES.propertyTax.fairMarketRatio.oneHouseSpecialCapWon
    ? RULES.propertyTax.brackets.oneHouseSpecial
    : RULES.propertyTax.brackets.general;
  const propertyTax = progressiveTax(taxBase, brackets);
  const urbanAreaTax = Math.round(taxBase * RULES.propertyTax.urbanAreaRate);
  const localEduTax = Math.round(propertyTax * RULES.propertyTax.localEduTaxRate);
  return {
    taxBase, ratio, propertyTax, urbanAreaTax, localEduTax,
    total: propertyTax + urbanAreaTax + localEduTax,
  };
}

/**
 * 종합부동산세 추정 계산(대상 여부 + 세액). 재산세액공제·세부담상한 미반영(추정치).
 * @param {object} p
 * @param {number} p.totalAssessedValue 보유 주택 공시가격 합계(원)
 * @param {boolean} p.isOneHouse 1세대1주택 여부
 * @param {number} p.houseCount 보유 주택 수(1,2,3...)
 * @param {number|null} p.age 나이(1세대1주택자 고령자공제용, 없으면 null)
 * @param {number|null} p.holdingYears 보유기간(년, 1세대1주택자 장기보유공제용)
 */
export function calcComprehensiveTax({ totalAssessedValue, isOneHouse, houseCount, age, holdingYears }) {
  const C = RULES.comprehensiveTax;
  const value = Math.max(0, Number(totalAssessedValue) || 0);
  const deduction = isOneHouse ? C.basicDeductionWon.oneHouse : C.basicDeductionWon.general;
  const isSubject = value > deduction;

  if (!isSubject) {
    return { isSubject: false, deduction, taxBase: 0, grossTax: 0, creditRate: 0, finalTax: 0 };
  }

  const taxBase = Math.round((value - deduction) * C.fairMarketRatio);
  const brackets = (Number(houseCount) || 1) >= 3 ? C.brackets["3HousesOrMore"] : C.brackets.upTo2Houses;
  const grossTax = progressiveTax(taxBase, brackets);

  let creditRate = 0;
  if (isOneHouse) {
    const senior = C.seniorCredit.find((s) => (age || 0) >= s.minAge);
    const longHold = C.longHoldCredit.find((s) => (holdingYears || 0) >= s.minYears);
    creditRate = Math.min(C.combinedCreditCap, (senior ? senior.rate : 0) + (longHold ? longHold.rate : 0));
  }
  const finalTax = Math.max(0, Math.round(grossTax * (1 - creditRate)));

  return { isSubject: true, deduction, taxBase, grossTax, creditRate, finalTax };
}

export function won(n) {
  return `${Math.round(Number(n) || 0).toLocaleString()}원`;
}
