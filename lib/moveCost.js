// [S22-9] 갈아타기 거래비용 추정 — 취득세·양도세·중개보수 간이 요율(확정 계산 아님, 면책 필수).
//   입력·출력 단위: 억(uk). 1주택·2년보유·매도가 12억 이하면 양도세 비과세로 본다(간이).
//   누진·장기보유특별공제·다주택 중과·전용 85㎡ 농특세 등은 미반영 — '대략 이만큼 든다'의 감을 준다.
export const MOVE_COST_DISCLAIMER = "취득세·양도세·중개보수 간이 추정입니다(누진·감면·중과 미반영). 실제 금액은 세무사·중개사 확인이 필요합니다.";

// 취득세율(%) 간이 — 1주택 기준(6억↓ 1.1 / 6~9억 2.2 / 9억↑ 3.3).
function acqRate(priceUk) {
  if (priceUk <= 6) return 1.1;
  if (priceUk <= 9) return 2.2;
  return 3.3;
}
// 중개보수 상한율(%) 간이 — 매매가 구간별 보수적 적용.
function brokerRate(priceUk) {
  if (priceUk < 9) return 0.5;
  if (priceUk < 12) return 0.7;
  return 0.9;
}
// 양도세(억) 간이 — 1주택·2년보유·매도가 12억↓ 비과세=0. 그 외 차익×22%(간이).
function capGainTax(gainUk, { isOneHouse = true, holdingYears = 2, sellPriceUk = 0 } = {}) {
  if (!(gainUk > 0)) return 0;
  if (isOneHouse && holdingYears >= 2 && sellPriceUk <= 12) return 0;
  return Math.round(gainUk * 0.22 * 100) / 100;
}

const r2 = (v) => Math.round(v * 100) / 100;

// 내 집을 지금 팔 때 드는 비용(억): 중개보수 + 양도세.
export function estimateSellCost({ sellPriceUk, buyPriceUk, isOneHouse = true, holdingYears = 2 }) {
  const sp = Number(sellPriceUk) || 0;
  const broker = r2(sp * brokerRate(sp) / 100);
  const gain = sp - (Number(buyPriceUk) || 0);
  const capGain = capGainTax(gain, { isOneHouse, holdingYears, sellPriceUk: sp });
  return { broker, capGain, total: r2(broker + capGain), gainUk: r2(gain) };
}

// 갈아타기 총 추가 필요자금(억) = (목표가 − 내 매도가) + 목표 취득세 + 양쪽 중개비 + 내 양도세.
export function estimateMoveCost({ sellPriceUk, buyPriceUk, targetPriceUk, isOneHouse = true, holdingYears = 2 }) {
  const sp = Number(sellPriceUk) || 0;
  const tp = Number(targetPriceUk) || 0;
  const sell = estimateSellCost({ sellPriceUk: sp, buyPriceUk, isOneHouse, holdingYears });
  const acqTax = r2(tp * acqRate(tp) / 100);
  const brokerBuy = r2(tp * brokerRate(tp) / 100);
  const gap = r2(tp - sp);
  return {
    gap, acqTax, brokerBuy, brokerSell: sell.broker, capGainTax: sell.capGain,
    extraNeeded: r2(gap + acqTax + brokerBuy + sell.broker + sell.capGain),
  };
}
