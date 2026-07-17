// [N9] 자산군 교차 판단 — ONE-HUB의 유일한 차별점.
//   주식앱·ETF앱·부동산앱은 많지만, 셋을 '묶어서' 판단하는 건 없다. 데이터는 이미 다 갖고 있다.
//
// 규칙 3개(불변):
//   ① 하루 1개만 노출한다. 여러 개 뜨면 아무것도 안 읽힌다 → pickInsight 는 항상 최대 1개를 반환.
//   ② 규칙 기반 · 결정적(deterministic). LLM 아님. 같은 데이터면 언제나 같은 문장.
//   ③ 투자 권유가 아니다. "~가 낫습니다 / ~를 살펴볼 만합니다"가 표현의 상한이며,
//      특정 매매를 지시하는 명령형 문구는 쓰지 않는다.
//      카드 하단에 반드시 면책(참고용)을 붙인다 → DISCLAIMER.
//
// 입력: ledger = lib/ledger.getLedger() 결과(단일 원장). market = { regime, heat }.
//   ★ 여기서 자산을 다시 더하지 않는다. 원장이 준 breakdown 비율만 읽는다(N1 계약).
export const DISCLAIMER = "규칙 기반 참고용입니다. 최종 판단은 본인이 하세요.";

const share = (ledger, key) => {
  const t = Number(ledger?.total_uk) || 0;
  const v = Number(ledger?.breakdown?.[key]);
  if (!(t > 0) || !Number.isFinite(v)) return null;
  return (v / t) * 100;
};
const r0 = (v) => Math.round(Number(v));

// 규칙은 위에서부터 평가되고, 처음 만족한 것 하나만 노출된다(우선순위 = 배열 순서).
const RULES = [
  {
    id: "CONCENTRATION_X_REGIME",
    when: (L, m) => (share(L, "realestate_uk") ?? 0) >= 60 && String(m?.regime || "").toUpperCase() === "BEAR",
    say: (L, m) =>
      `부동산이 자산의 ${r0(share(L, "realestate_uk"))}%인데 시장은 하락 국면입니다. 지금 주식을 더 담으면 ` +
      `한쪽으로 쏠린 자산에 하락 위험까지 겹칩니다. 같은 돈이면 연금계좌 ETF가 세금·분산 양쪽에서 낫습니다.`,
    cta: { label: "연금 ETF 보기 →", href: "/pwa/etf?acct=연금" },
  },
  {
    id: "CONCENTRATION_X_COOL",
    when: (L, m) => (share(L, "realestate_uk") ?? 0) >= 60 && Number(m?.heat) < 50,
    say: (L, m) =>
      `부동산이 자산의 ${r0(share(L, "realestate_uk"))}%로 쏠려 있고, 시장 과열도는 ${r0(m.heat)}(낮음)입니다. ` +
      `과열이 낮을 때 분산을 늘리면 평단이 유리한 편입니다. 서두를 일은 아닙니다.`,
    cta: { label: "ETF 리밸런싱 →", href: "/pwa/etf" },
  },
  {
    id: "CASH_THIN",
    when: (L) => {
      const c = share(L, "cash_uk");
      return c != null && c < 3;
    },
    say: (L) =>
      `현금이 자산의 ${share(L, "cash_uk") < 1 ? "1% 미만" : `${r0(share(L, "cash_uk"))}%`}뿐입니다. ` +
      `손절선이 걸린 종목이 나왔을 때 현금이 없으면 선택지가 줄어듭니다.`,
    cta: { label: "현금 입력 →", href: "/pwa/assets" },
  },
  {
    id: "CASH_UNKNOWN",
    when: (L) => share(L, "cash_uk") == null && Number(L?.total_uk) > 0,
    say: () =>
      `현금이 아직 입력되지 않아 자산 비중이 실제보다 쏠려 보일 수 있습니다. ` +
      `현금을 넣으면 배분 판단이 정확해집니다.`,
    cta: { label: "현금 입력 →", href: "/pwa/assets" },
  },
  {
    id: "STOCK_THIN_X_BLOCKED",
    when: (L, m) => (share(L, "stock_uk") ?? 0) < 10 && Number(m?.blockedCount) > 0,
    say: (L, m) =>
      `주식은 자산의 ${r0(share(L, "stock_uk"))}%뿐이고, 오늘 AI는 ${m.blockedCount}종목을 걸렀습니다. ` +
      `비중이 작다고 서둘러 채우기보다, 기준을 넘는 후보가 나올 때 담는 편이 낫습니다.`,
    cta: { label: "무엇을 왜 걸렀나 →", href: "/pwa?tab=report&sec=verify" },
  },
];

/**
 * 자산군을 묶은 인사이트 1개를 고른다(없으면 null).
 * @param {object} ledger lib/ledger.getLedger() 결과
 * @param {object} market { regime, heat, blockedCount }
 */
export function pickInsight(ledger, market) {
  if (!ledger || !(Number(ledger.total_uk) > 0)) return null;
  const m = market || {};
  const hit = RULES.find((r) => {
    try { return !!r.when(ledger, m); } catch { return false; }
  });
  if (!hit) return null;
  return { id: hit.id, text: hit.say(ledger, m), cta: hit.cta, disclaimer: DISCLAIMER };
}
