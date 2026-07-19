// [G-시리즈 나 vs AI 게임화] 가상 시드머니 대결 — 내 지갑 vs AI 지갑.
//   ★안전선 S2: 순수 클라이언트(localStorage). 실제 매매(trading.db/KIS)와 코드·데이터 완전 분리.
//   ★안전선 S1: 이 값은 전부 '가상 게임머니'. 화면에서 워터마크 필수.
//   게임 잔고 = 시드 + 판별 손익. 정산은 verdictLedger.computeShowdown(3일 성숙분)에서 파생.
//   모델[규율화]: AI도 확신 종목(매수판정·score>=12)만 매수하고 나머지는 관망(현금). 나는 '샀어요(take)'만 베팅.
//     → 지갑 차이는 '누가 더 잘 고르고, 더 잘 기다렸나'(양쪽의 선별·관망 실력)에서 갈린다.
//        무작정 전종목 매수 AI를 이기는 건 쉽지만, 규율 있는 AI와 겨루면 진짜 실력이 된다.

const SEED_KEY = "onehub_game_seed";

// 시드 선택지(가상): 100만 / 1,000만 / 1억
export const SEED_OPTIONS = [
  { v: 1000000, label: "100만원" },
  { v: 10000000, label: "1,000만원" },
  { v: 100000000, label: "1억원" },
];

export function getSeed() {
  if (typeof window === "undefined") return null;
  try { const v = Number(localStorage.getItem(SEED_KEY)); return v > 0 ? v : null; } catch { return null; }
}
export function setSeed(v) {
  try { localStorage.setItem(SEED_KEY, String(Math.round(Number(v) || 0))); window.dispatchEvent(new Event("onehub-game-change")); } catch {}
}
export function resetSeed() {
  try { localStorage.removeItem(SEED_KEY); window.dispatchEvent(new Event("onehub-game-change")); } catch {}
}

// 원화 표기(가상)
export function wonG(n) {
  const v = Math.round(Number(n) || 0);
  return `${v < 0 ? "-" : ""}${Math.abs(v).toLocaleString()}원`;
}

// 게임 지갑 계산. ledger=verdictLedger 원장, showdown3=computeShowdown(ledger,3).
//   반환: null(시드 미설정) | { seed, bet, myBalance, aiBalance, myGain, aiGain, diff, leader, myWins, aiWins, ties, settled[] }
export function computeWallets(showdown3) {
  const seed = getSeed();
  if (!seed) return null;
  const bet = Math.max(10000, Math.round(seed * 0.1)); // 판당 베팅 = 시드 10%(가상)
  const details = showdown3 && showdown3.ready ? showdown3.details : [];
  let myGain = 0, aiGain = 0, myWins = 0, aiWins = 0, ties = 0;
  const settled = details.map((d) => {
    // [규율] AI도 확신(매수판정) 종목만 매수 — 아니면 관망(현금). d.aiBought=false면 AI는 안 삼.
    const aiBet = d.aiBought !== false; // 구버전(무점수)=매수로 호환
    const full = Math.round((bet * d.ret) / 100);
    const aiPnl = aiBet ? full : 0;                          // AI: 확신 종목만
    const myPnl = d.decision === "take" ? full : 0;          // 나: 산 것만
    aiGain += aiPnl; myGain += myPnl;
    // 이번 판 승자: 이번 판 손익(내 vs AI) 비교 — 둘 다 관망/매수하면 무, 한쪽만 유리하면 그쪽 승.
    let winner = Math.abs(myPnl - aiPnl) < 1 ? "tie" : myPnl > aiPnl ? "me" : "ai";
    if (winner === "me") myWins++; else if (winner === "ai") aiWins++; else ties++;
    return { ...d, myPnl, aiPnl, aiBought: aiBet, winner };
  });
  const myBalance = seed + myGain;
  const aiBalance = seed + aiGain;
  const diff = myBalance - aiBalance;
  const leader = Math.abs(diff) < 1 ? "tie" : diff > 0 ? "me" : "ai";
  return { seed, bet, myBalance, aiBalance, myGain, aiGain, diff, leader, myWins, aiWins, ties, settled };
}

// [GI-5] 누적 서사 — 최근 결과로 상승세/반격 한 줄.
export function streakNarrative(settled) {
  if (!settled || !settled.length) return null;
  const recent = settled.slice(0, 4).filter((s) => s.winner !== "tie");
  if (!recent.length) return null;
  const meRecent = recent.filter((s) => s.winner === "me").length;
  const aiRecent = recent.length - meRecent;
  if (meRecent > aiRecent) return `최근 ${recent.length}판 중 ${meRecent}판 승 — 상승세! 🔥`;
  if (aiRecent > meRecent) return `AI가 최근 ${recent.length}판 중 ${aiRecent}판 승 — 반격당하는 중. 다음 판 중요`;
  return "최근 접전 — 다음 판이 분수령";
}
