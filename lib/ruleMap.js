// [S28-3] block_reason(자유 문자열) → 정본 사유 카테고리 정규화.
//   ★확인 결과: block_reason 은 stock_screener 의 가중치 규칙(RSI/거래량/MA 등)과 1:1 대응하지 않는다.
//     block_reason = "왜 차단/거부했나"(ML_SELL·종합점수미달·기술점수부족·손익비부족·매크로점수낮음),
//     가중치 규칙 = 매수 점수의 '기여분'. 둘은 다른 축이라 by_reason 정확도로는 특정 가중치의
//     성적을 말할 수 없다. 그래서 사유를 카테고리로 묶어 '차단 사유별' 성적만 정직하게 보여준다.
export const REASON_CATEGORIES = [
  ["ml_strong_sell", "ML 강력 매도신호", /ML_STRONG_SELL/i],
  ["ml_sell", "ML 매도신호", /ML_SELL|ML\s*신호\s*SELL/i],
  ["score_low", "종합점수 미달", /종합\s*점수\s*미달|종합점수/],
  ["tech_low", "기술점수 부족", /기술적\s*점수\s*부족|MA\/RSI\/볼린저/],
  ["rr_low", "손익비 부족", /손익비\s*부족/],
  ["macro_low", "매크로점수 낮음", /LOW_MACRO_SCORE|매크로/i],
];

export function normalizeReason(raw) {
  const s = String(raw || "");
  for (const [key, label, re] of REASON_CATEGORIES) if (re.test(s)) return { key, label };
  return { key: "other", label: raw ? String(raw).slice(0, 24) : "(미분류)" };
}

// by_reason 행들(서버: {reason,total,success,accuracy_pct} · total=채점수)을 카테고리로 합산.
//   반환: [{key,label,scored,hits,accuracy_pct}] scored 내림차순.
export function aggregateByCategory(byReason) {
  const agg = {};
  (byReason || []).forEach((r) => {
    const { key, label } = normalizeReason(r.reason);
    const a = agg[key] || (agg[key] = { key, label, scored: 0, hits: 0 });
    a.scored += Number(r.total) || 0;
    a.hits += Number(r.success) || 0;
  });
  return Object.values(agg)
    .map((a) => ({ ...a, accuracy_pct: a.scored ? Math.round((a.hits / a.scored) * 1000) / 10 : null }))
    .sort((x, y) => y.scored - x.scored);
}
