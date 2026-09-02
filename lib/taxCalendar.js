// [S22-8] ETF 세금 달력 — 월별로 무엇이 중요한지. 상시 표시는 소음, 시점 노출은 상품.
//   양도세·손익통산·연금 한도는 연말에 값이 폭발한다. 평시엔 접어 두고, 해당 달에만 펼친다.
//   계산은 이미 구현돼 있다(예상 양도세·손익통산·연금 진행률) — 여기선 '시점'만 관리한다.
export const TAX_CALENDAR = {
  1:  { key: "신고준비", title: "양도세 신고 준비", desc: "작년 해외 상장 ETF 매매손익을 정리해 두면 5월 신고가 수월합니다." },
  5:  { key: "신고",     title: "양도소득세 확정신고", desc: "작년 해외주식·해외상장 ETF 양도차익 신고·납부(5월)." },
  6:  { key: "보유세",   title: "보유세 기준일", desc: "6월 1일 보유 기준으로 재산세·종부세가 매겨집니다." },
  11: { key: "손익통산", title: "손익통산·연금 마감 점검", push: true,
        desc: "연 250만원 공제 사용액 점검 + 손실 종목 손익통산(손실수확) + 연금 납입 한도 마감 전 점검." },
  12: { key: "확정",     title: "올해 절세 확정", desc: "연내 실현할 손익 확정(12/28 전후 결제일 유의). 이익이연은 내년으로." },
};

// 해당 월의 세금 포커스(없으면 null).
export function taxFocusOf(month) {
  return TAX_CALENDAR[Number(month)] || null;
}

// 세금 영역을 기본으로 펼치는 시즌(그 외 달은 접힘이 기본).
export function isTaxSeason(month) {
  return [11, 12, 1, 5].includes(Number(month));
}

// 브라우저 현재 월(1~12).
export function currentMonth() {
  try { return new Date().getMonth() + 1; } catch (e) { return 0; }
}
