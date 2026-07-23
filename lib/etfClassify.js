// lib/etfClassify.js
// ETF 투자지역 분류 — 티커로 '상장시장'이 아닌 '투자대상 지역'을 판정.
//
// 왜 필요한가: 국내 상장 ETF 1163개 중 절반 이상이 미국·중국 등 해외를 추종한다
//   (예: TIGER 미국나스닥100 = 티커 133690, 한국거래소 상장이지만 투자대상은 미국).
//   기존 화면은 상장시장(market=KR)만 봐서 이런 ETF를 "국내"로 표기했다.
//   사용자 관점의 '투자지역'을 별도 축으로 보여주기 위한 매핑.
//
// 데이터원: 서버 etf_master(tax_type + 종목명) 를 빌드 시점에 추출한 정적 매핑.
//   :5003 은 AWS SG로 외부 차단이라 실시간 조회 불가 → 번들 동봉이 안정적.
//   { TICKER: { r: '국내'|'해외', a: 세부지역('미국'|'중국'|'국내'|'해외'...) } }

import TABLE from './etfClassify.json';

// 보유 티커 정규화: 국내 종목의 A접두어(A133690) 제거, 대문자.
function normTicker(ticker) {
  const tk = String(ticker || '').trim().toUpperCase();
  return tk;
}

// { r, a } 또는 매핑에 없으면 null.
export function classifyEtf(ticker) {
  const tk = normTicker(ticker);
  if (!tk) return null;
  if (TABLE[tk]) return TABLE[tk];
  // A접두어(국내 6자리) 보정
  const m = tk.match(/^A(\d{6})$/);
  if (m && TABLE[m[1]]) return TABLE[m[1]];
  return null;
}

// 표시용: 세부지역 라벨. 국내는 '국내', 해외는 세부(미국 등) 또는 '해외'.
export function regionLabel(ticker) {
  const c = classifyEtf(ticker);
  if (!c) return null;
  return c.a || c.r;
}

// 투자지역이 해외인가(보유가 매핑에 없으면 null=미상).
export function isOverseasInvest(ticker) {
  const c = classifyEtf(ticker);
  return c ? c.r === '해외' : null;
}
