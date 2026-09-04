// [S22-2] 판단 원장 통합 집계 — '내 판단'을 세는 단일 소스(화면은 이 함수만 쓴다).
//   두 원장은 서로 '다른 사건'을 기록한다. 합치지 않는다(마이그레이션 위험 대비 이득 없음).
//   읽는 쪽만 하나로 통일한다 — 단위 = "AI 제안에 대한 내 응답" 1건, source 로만 구분:
//     recommend : lib/verdictLedger(onehub_ai_vs_me)  — 추천 카드의 샀어요(take)/관망(pass)
//     duel      : lib/portfolioDuel(onehub_duel_decisions) — 대결 카드의 수용(accepted)/거부(rejected)
//   → getVerdictStats(trader).total 이 곧 '내 판단' 총 건수. bySource 로 각 원장 세부를 제공.
import { getLedger as getRecLedger, computeShowdown } from "./verdictLedger";
import { getDecisions, getDecisionAnalysis } from "./portfolioDuel";

// [S24-2] 기간 창 — sinceTs(ms) 이후 항목만. 미지정이면 무제한(기존 호출부 회귀 없음).
//   duel 은 date(YYYY-MM-DD)라 sinceTs 를 KST 날짜로 환산해 비교한다.
function sinceDateOf(sinceTs) {
  if (!sinceTs) return null;
  return new Date(sinceTs + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

// 추천 원장(샀어요/관망) 집계 + 채점(3거래일 창 성숙분). [S25] untilTs 로 상한도 건다(지지난주 등).
function recStats(trader, sinceTs, untilTs) {
  let list = getRecLedger(trader) || [];
  if (sinceTs) list = list.filter((e) => Number(e.ts || 0) >= sinceTs);
  if (untilTs) list = list.filter((e) => Number(e.ts || 0) < untilTs);
  const take = list.filter((e) => e.decision === "take").length;
  const pass = list.filter((e) => e.decision === "pass").length;
  let scored = 0;
  try { const sd = computeShowdown(list, 3); if (sd && sd.ready) scored = sd.n; } catch (e) {}
  return { total: list.length, take, pass, scored };
}

// 대결 원장(수용/거부) 집계 + 채점(단기 우선, 없으면 중기 창).
function duelStats(trader, sinceTs, untilTs) {
  let all = getDecisions(trader) || [];
  const sinceDate = sinceDateOf(sinceTs);
  if (sinceDate) all = all.filter((d) => String(d.date || "") >= sinceDate);
  const untilDate = sinceDateOf(untilTs);
  if (untilDate) all = all.filter((d) => String(d.date || "") < untilDate);
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

// 통합 통계. 화면의 '판단 건수'는 반드시 여기서만 나온다. opts.sinceTs(또는 days)로 기간을 건다.
export function getVerdictStats(trader = "A", opts = {}) {
  const sinceTs = opts.sinceTs != null ? opts.sinceTs : (opts.days ? Date.now() - opts.days * 86400000 : null);
  const untilTs = opts.untilTs != null ? opts.untilTs : null;
  const recommend = recStats(trader, sinceTs, untilTs);
  const duel = duelStats(trader, sinceTs, untilTs);
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

// [S22-5] 내 판단 성적표 — 채점된 판단의 상세를 두 원장에서 모아 지표를 낸다.
//   비교 대상은 '나 자신 vs AI'뿐(다른 사용자와 비교하지 않는다).
//   details: { decision:'take'|'pass', ret:수익률% }. take=내 포트폴리오에 있음, pass=없음.
export function getVerdictScorecard(trader = "A", opts = {}) {
  // [S24-2] 건수·승률·AI대비·놓친수익을 '같은 창'으로. 건수만 주간이고 승률은 누적이면 더 나쁘다.
  const sinceTs = opts.sinceTs != null ? opts.sinceTs : (opts.days ? Date.now() - opts.days * 86400000 : null);
  const untilTs = opts.untilTs != null ? opts.untilTs : null;
  const sinceDate = sinceDateOf(sinceTs);
  const untilDate = sinceDateOf(untilTs);
  const stats = getVerdictStats(trader, { sinceTs, untilTs });
  const details = [];
  try {
    let recList = getRecLedger(trader) || [];
    if (sinceTs) recList = recList.filter((e) => Number(e.ts || 0) >= sinceTs);
    if (untilTs) recList = recList.filter((e) => Number(e.ts || 0) < untilTs);
    const sd = computeShowdown(recList, 3);
    if (sd && sd.ready && Array.isArray(sd.details)) {
      sd.details.forEach((x) => { if (x && x.ret != null) details.push({ decision: x.decision, ret: x.ret }); });
    }
  } catch (e) {}
  try {
    let all = getDecisions(trader) || [];
    if (sinceDate) all = all.filter((d) => String(d.date || "") >= sinceDate);
    if (untilDate) all = all.filter((d) => String(d.date || "") < untilDate);
    const byId = {};
    getDecisionAnalysis(trader).forEach((a) => { byId[a.id] = a; });
    all.forEach((d) => {
      const a = byId[d.id];
      const w = a && (a.windows?.short?.ready ? a.windows.short : a.windows?.mid?.ready ? a.windows.mid : null);
      if (w && w.pct != null) details.push({ decision: d.accepted ? "take" : "pass", ret: w.pct });
    });
  } catch (e) {}

  const scored = details.length;
  const round1 = (v) => Math.round(v * 10) / 10;
  const avg = (arr) => (arr.length ? round1(arr.reduce((a, b) => a + b, 0) / arr.length) : 0);
  const passes = details.filter((d) => d.decision === "pass");
  const missed = passes.filter((d) => d.ret > 0);           // 관망했는데 오른 것 = 놓친 수익
  const correct = details.filter((d) => (d.decision === "pass" ? d.ret < 0 : d.ret >= 0)).length;
  const myRet = avg(details.map((d) => (d.decision === "take" ? d.ret : 0))); // pass=내 포트폴리오엔 없음
  const aiRet = avg(details.map((d) => d.ret));             // AI=전부 매매(항상 투자)
  const winRate = scored ? round1((correct / scored) * 100) : null;
  // [S25-2] AI=전부 매매 → 오르면 정답. AI 승률·관망비율(0)도 같은 창에서 낸다(세 번째 집계 금지).
  const aiCorrect = details.filter((d) => d.ret >= 0).length;
  const aiWinRate = scored ? round1((aiCorrect / scored) * 100) : null;
  const passRate = stats.total ? round1((stats.pass / stats.total) * 100) : null;
  const tendency = passRate == null ? null : passRate >= 70 ? "신중형" : passRate <= 30 ? "적극형" : "균형형";

  return {
    ...stats, scored, aiWinRate, aiPassRate: 0,
    winRate, myRet, aiRet, diff: round1(myRet - aiRet),
    winner: Math.abs(myRet - aiRet) < 0.3 ? "tie" : myRet > aiRet ? "me" : "ai",
    missedCount: missed.length, missedAvg: missed.length ? avg(missed.map((d) => d.ret)) : null,
    passRate, tendency,
  };
}
