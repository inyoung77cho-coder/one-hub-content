// [S31-6] 증권 계좌 개설 제휴 — ★데이터로만. 실제 제휴 계약 전에는 전부 active:false → 화면에 아무것도 안 뜸.
//   계약이 되면 url 을 실제 제휴 링크로 바꾸고 active:true 로. 제휴처 선정은 사업자 판단(코드는 자리만).
//   ★정직성: 한 곳만 밀지 않는다(순서 무작위) · "제휴 링크" 표기 · "어느 곳을 고르셔도 기능 같습니다".
export const PARTNERS = [
  { id: "mirae", name: "미래에셋증권", url: "", note: "", active: false },
  { id: "samsung", name: "삼성증권", url: "", note: "", active: false },
  { id: "kiwoom", name: "키움증권", url: "", note: "", active: false },
  { id: "toss", name: "토스증권", url: "", note: "", active: false },
];

export function activePartners() {
  const list = PARTNERS.filter((p) => p.active && p.url);
  // [S31-6] 순서 무작위 — 한 곳을 위에 고정하면 추천이 된다.
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

export function hasActivePartners() {
  return PARTNERS.some((p) => p.active && p.url);
}
