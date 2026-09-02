// [S22-2] 판단 원장 통합 집계 — '내 판단'을 세는 단일 소스(화면은 이 함수만 쓴다).
//   두 원장은 서로 '다른 사건'을 기록한다. 합치지 않는다(마이그레이션 위험 대비 이득 없음).
//   읽는 쪽만 하나로 통일한다 — 단위 = "AI 제안에 대한 내 응답" 1건, source 로만 구분:
//     recommend : lib/verdictLedger(onehub_ai_vs_me)  — 추천 카드의 샀어요(take)/관망(pass)
//     duel      : lib/portfolioDuel(onehub_duel_decisions) — 대결 카드의 수용(accepted)/거부(rejected)
//   → getVerdictStats(trader).total 이 곧 '내 판단' 총 건수. bySource 로 각 원장 세부를 제공.
import { getLedger as getRecLedger, computeShowdown } from "./verdictLedger";
import { getDecisions, getDecisionAnalysis } from "./portfolioDuel";

// 추천 원장(샀어요/관망) 집계 + 채점(3거래일 창 성숙분).
function recStats(trader) {
  const list = getRecLedger(trader) || [];
  const take = list.filter((e) => e.decision === "take").length;
  const pass = list.filter((e) => e.decision === "pass").length;
  let scored = 0;
  try { const sd = computeShowdown(list, 3); if (sd && sd.ready) scored = sd.n; } catch (e) {}
  return { total: list.length, take, pass, scored };
}

// 대결 원장(수용/거부) 집계 + 채점(단기 우선, 없으면 중기 창).
function duelStats(trader) {
  const all = getDecisions(trader) || [];
  const byId = {};
  try { getDecisionAnalysis(trader).forEach((a) => { byId[a.id] = a; }); } catch (e) {}
  let scored = 0;
  all.forEach((d) => {
    const a = byId[d.id];
    const w = a && (a.windows?.short?.ready ? a.windows.short : a.windows?.mid?.ready ? a.windows.mid : null);
    if (w && w.pct != null) scored += 1;
  });
  const accepted = all.filter((d) => d.accepted).length;
  return { total: all.length, take: accepted, pass: all.length - accepted, scored };
}

// 통합 통계. 화면의 '판단 건수'는 반드시 여기서만 나온다.
export function getVerdictStats(trader = "A") {
  const recommend = recStats(trader);
  const duel = duelStats(trader);
  const total = recommend.total + duel.total;
  const take = recommend.take + duel.take;
  const pass = recommend.pass + duel.pass;
  const scored = recommend.scored + duel.scored;
  return {
    total, take, pass, scored,
    passRate: total ? Math.round((pass / total) * 1000) / 10 : null,
    bySource: { recommend, duel },
  };
}
