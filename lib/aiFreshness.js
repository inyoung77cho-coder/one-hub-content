// [S20-3] AI 갱신 상태 계산 — pages/pwa/index.js 인라인 IIFE를 공용 함수로 추출.
//   today.js(오늘 탭 3행 요약)와 index.js(AI 탭 최상단 스탬프)가 같은 규칙을 쓴다.
//   ★ 새 API 를 부르지 않는다 — 이미 받아둔 data(대시보드)와 aiDaily 만 쓴다.
export function computeAiFreshness(aiDaily, data) {
  const realToday = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const analysisDate = aiDaily?.today_date || null;
  const stale = !analysisDate || analysisDate !== realToday;
  const chg = aiDaily?.changes || [];
  const cnt = {
    neo: chg.filter(c => c.type === 'new').length,
    act: chg.filter(c => c.type === 'action').length,
    sc: chg.filter(c => c.type === 'score').length,
    gone: chg.filter(c => c.type === 'gone').length,
  };
  const diffs = [];
  if (cnt.neo) diffs.push(`신규 ${cnt.neo}`);
  if (cnt.act) diffs.push(`판단전환 ${cnt.act}`);
  if (cnt.sc) diffs.push(`점수변경 ${cnt.sc}`);
  if (cnt.gone) diffs.push(`제외 ${cnt.gone}`);
  return { realToday, analysisDate, stale, diffs, hasData: !!data || !!aiDaily };
}
