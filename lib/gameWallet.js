// [G-시리즈 나 vs AI 게임화] 가상 시드머니 대결 — 내 지갑 vs AI 지갑.
//   ★안전선 S2: 순수 클라이언트(localStorage). 실제 매매(trading.db/KIS)와 코드·데이터 완전 분리.
//   ★안전선 S1: 이 값은 전부 '가상 게임머니'. 화면에서 워터마크 필수.
//   게임 잔고 = 시드 + 판별 손익. 정산은 verdictLedger.computeShowdown(3일 성숙분)에서 파생.
//   모델: AI = 추천 전부 매수(항상 투자) / 나는 '샀어요(take)'만 베팅, '관망(pass)'은 현금.
//     → 8년 백테스트: 관망은 상승장에서 대개 손해(항상 투자가 우수), 하방은 손절이 방어.
//        그래서 AI는 '항상 투자' 벤치마크 — 나는 관망으로 하락은 피하되, 상승 종목 관망은 기회손실.

const SEED_KEY = "onehub_game_seed";
const NICK_KEY = "onehub_game_nick";
const NICK_MAX = 8; // 카드 레이아웃 폭 고려 — 너무 길면 잘리므로 짧게 제한

// [2026-08-03] "나" 대신 사용자 지정 닉네임. 시드처럼 순수 클라이언트(localStorage) 저장 —
//   서버/거래 데이터와 무관, 표시용일 뿐이라 저장 실패해도 기본값("나")으로 안전하게 폴백.
export function getNickname() {
  if (typeof window === "undefined") return "나";
  try {
    const v = (localStorage.getItem(NICK_KEY) || "").trim();
    return v ? v.slice(0, NICK_MAX) : "나";
  } catch { return "나"; }
}
export function setNickname(v) {
  const n = String(v || "").trim().slice(0, NICK_MAX);
  try {
    if (n) localStorage.setItem(NICK_KEY, n);
    else localStorage.removeItem(NICK_KEY);
  } catch {}
  if (typeof window !== "undefined") window.dispatchEvent(new Event("onehub-game-change"));
}

// 시드 선택지(가상): 100만 / 1,000만 / 1억
export const SEED_OPTIONS = [
  { v: 1000000, label: "100만원" },
  { v: 10000000, label: "1,000만원" },
  { v: 100000000, label: "1억원" },
];

// ★모바일 실행 불가 수정: 카카오톡 인앱브라우저·iOS 사생활모드에선 localStorage 쓰기가
//   예외를 던진다. 예전엔 catch 로 조용히 삼켜 setSeed 가 실패→getSeed null→온보딩이
//   대시보드로 안 넘어가 게임이 죽었다. 이제 메모리 폴백을 두어 '차단 환경에서도 실행'되게 한다.
//   (세션 한정으로만 유지 — 새로고침 시 초기화. isStorageBlocked 로 UI가 안내 가능.)
let _memSeed = null;
let _storageBlocked = false;

export function isStorageBlocked() { return _storageBlocked; }

export function getSeed() {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SEED_KEY);
    if (raw != null) { const v = Number(raw); return v > 0 ? v : null; }
  } catch { _storageBlocked = true; }
  return _memSeed && _memSeed > 0 ? _memSeed : null;  // 차단 환경/미저장 → 메모리 폴백
}
export function setSeed(v) {
  const n = Math.round(Number(v) || 0);
  _memSeed = n > 0 ? n : null;                          // 항상 메모리에도 기록(차단 대비)
  try { localStorage.setItem(SEED_KEY, String(n)); } catch { _storageBlocked = true; }
  // ★이벤트는 try 밖에서 발화 — 저장이 막혀도 리스너가 getSeed(메모리) 로 갱신해 게임이 진행된다.
  if (typeof window !== "undefined") window.dispatchEvent(new Event("onehub-game-change"));
}
export function resetSeed() {
  _memSeed = null;
  try { localStorage.removeItem(SEED_KEY); } catch { _storageBlocked = true; }
  if (typeof window !== "undefined") window.dispatchEvent(new Event("onehub-game-change"));
}

// 원화 표기(가상)
export function wonG(n) {
  const v = Math.round(Number(n) || 0);
  return `${v < 0 ? "-" : ""}${Math.abs(v).toLocaleString()}원`;
}

// [사용자 지시 2026-08-09] 복리 방식 — "매일 거래금액 반영 후 다음날 투자가능금액 누계".
//   과거엔 판당 베팅이 항상 원금(seed)의 10%로 고정(단리)이었으나, 이제 매 판 베팅액이 그 시점의
//   본인 잔고(myBal/aiBal)의 10% — 벌수록 다음 베팅이 커지고 잃을수록 작아진다. 나와 AI는 각자
//   판단이 다르므로(취함/관망) 잔고가 서로 다르게 불어나고, 베팅액도 그 시점부터 서로 달라진다.
//   이 함수는 상태를 저장하지 않고 매번 showdown3.details(원장)에서 새로 계산하므로, 이 공식을
//   바꾸면 과거 기록도 전부 새 규칙으로 다시 계산된다(사용자 확인: 과거 기록도 재계산 원함).
const BET_PCT = 0.1; // 그 시점 잔고의 10%를 다음 판 베팅액으로

// 게임 지갑 계산. ledger=verdictLedger 원장, showdown3=computeShowdown(ledger,3).
//   반환: null(시드 미설정) | { seed, bet, betPct, myBalance, aiBalance, myGain, aiGain, diff, leader, myWins, aiWins, ties, settled[] }
export function computeWallets(showdown3, seedOverride) {
  // seedOverride: 호출부가 아는 시드(React state)를 넘기면 그걸 신뢰한다.
  //   렌더 중 getSeed() 재조회가 일시적으로 null 을 반환해 대시보드가 비는 문제(이중 소스) 방지.
  const seed = seedOverride && seedOverride > 0 ? seedOverride : getSeed();
  if (!seed) return null;
  const detailsRaw = showdown3 && showdown3.ready ? showdown3.details : [];
  // 복리 계산은 시간순 누적이 필수 — details는 |ret| 내림차순으로 올 수 있어 ts로 재정렬.
  const details = [...detailsRaw].sort((a, b) => (a.ts || 0) - (b.ts || 0));
  let myBal = seed, aiBal = seed, myWins = 0, aiWins = 0, ties = 0;
  const settled = details.map((d) => {
    // AI = 추천 전부 매수(항상 투자). (aiBought는 항상 true — 관망 규율은 백테스트로 폐기)
    const aiBet = d.aiBought !== false;
    const myBetAmt = Math.max(10000, Math.round(myBal * BET_PCT));   // 그 시점 내 잔고 기준
    const aiBetAmt = Math.max(10000, Math.round(aiBal * BET_PCT));   // 그 시점 AI 잔고 기준
    const myPnl = d.decision === "take" ? Math.round((myBetAmt * d.ret) / 100) : 0;
    const aiPnl = aiBet ? Math.round((aiBetAmt * d.ret) / 100) : 0;
    myBal += myPnl; aiBal += aiPnl;
    // 이번 판 승자: 이번 판 손익(내 vs AI) 비교 — 둘 다 관망/매수하면 무, 한쪽만 유리하면 그쪽 승.
    let winner = Math.abs(myPnl - aiPnl) < 1 ? "tie" : myPnl > aiPnl ? "me" : "ai";
    if (winner === "me") myWins++; else if (winner === "ai") aiWins++; else ties++;
    return { ...d, myPnl, aiPnl, myBetAmt, aiBetAmt, aiBought: aiBet, winner };
  });
  const myBalance = myBal;
  const aiBalance = aiBal;
  const myGain = myBalance - seed;
  const aiGain = aiBalance - seed;
  const diff = myBalance - aiBalance;
  const leader = Math.abs(diff) < 1 ? "tie" : diff > 0 ? "me" : "ai";
  const bet = Math.max(10000, Math.round(seed * BET_PCT)); // 참고용 초기 베팅(첫 판) — 이후엔 잔고 따라 변함
  return { seed, bet, betPct: BET_PCT, myBalance, aiBalance, myGain, aiGain, diff, leader, myWins, aiWins, ties, settled };
}

const DAY = 86400000;

// [2026-08-05] 일자별 마크투마켓 잔고 시리즈 — "대결은 당일 종가 기준부터 일자별로 계속
//   update 필요" 피드백 반영. computeShowdown(3일 확정 판정)과 달리 3거래일을 기다리지 않고
//   그날까지 쌓인 최신 스냅샷으로 매일 즉시 반영한다. 승/패 공식 기록은 여전히 computeShowdown이
//   진실이고, 이 시리즈는 그래프 전용(그날그날의 잠정 평가 잔고).
//   ledger: verdictLedger.getLedger(trader) 원본(entry.snaps 포함, matureLedger가 채움).
export function computeDailySeries(ledger, seed, trader = "A") {
  if (!seed || !ledger?.length) return [];
  const mine = (ledger || []).filter((e) => (e.trader || "A") === trader && e.entry > 0 && e.snaps?.length);
  if (!mine.length) return [];
  const bet = Math.max(10000, Math.round(seed * 0.1));
  const allTs = mine.flatMap((e) => [e.ts, ...(e.snaps || []).map((s) => s.ts)]);
  const startDay = Math.floor(Math.min(...allTs) / DAY);
  const todayDay = Math.floor(Date.now() / DAY);
  const series = [];
  for (let d = startDay; d <= todayDay; d++) {
    const dayEnd = (d + 1) * DAY;
    let myPnl = 0, aiPnl = 0, live = 0;
    mine.forEach((e) => {
      if (Math.floor(e.ts / DAY) > d) return; // 이 판단이 생기기 전날은 집계에서 제외
      const snap = (e.snaps || []).filter((s) => s.ts <= dayEnd).sort((a, b) => b.ts - a.ts)[0];
      if (!snap) return;
      live++;
      const ret = snap.price / e.entry - 1;
      aiPnl += bet * ret; // AI = 추천 전부 매수(항상 투자) 벤치마크
      if (e.decision === "take") myPnl += bet * ret;
    });
    if (live > 0) {
      series.push({
        day: d, date: new Date(d * DAY).toISOString().slice(0, 10),
        my: Math.round(seed + myPnl), ai: Math.round(seed + aiPnl), n: live,
      });
    }
  }
  return series;
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
