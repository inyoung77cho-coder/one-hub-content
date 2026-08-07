// [ⓕ] 장 운영시간 표시 유틸 — 화면 표시 전용(실제 매매 게이팅은 백엔드 auto_trade/market_calendar가 담당).
//   KRX 정규장/시간외거래 + NXT(대체거래소, 2025-03-04 출범) 세션을 사용자가 준 시간표대로 판정한다.
//   공휴일 판정은 하지 않음(백엔드 market_calendar.py가 권위 소스) — 요일만으로 개장일 여부를 근사.

function kstNow(now) {
  const base = now instanceof Date ? now : new Date();
  return new Date(base.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
}
// 분 단위(자정=0). 초 단위 경계(NXT 09:00:30)는 소수로 표현.
function minutesOf(d) { return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60; }

// KRX(코스피·코스닥·코넥스 동일) 세션 판정.
export function getKrxSession(now) {
  const d = kstNow(now);
  const day = d.getDay();
  if (day === 0 || day === 6) return { key: "closed_weekend", label: "휴장(주말)", phase: "closed" };
  const t = minutesOf(d);

  if (t >= 8 * 60 + 30 && t < 8 * 60 + 40) return { key: "pre_close_price", label: "장전 시간외종가(전일종가)", phase: "after", note: "동시호가와 동시 운영" };
  if (t >= 8 * 60 + 40 && t < 9 * 60) return { key: "open_call", label: "시가 단일가(동시호가)", phase: "call" };
  if (t >= 9 * 60 && t < 15 * 60 + 20) return { key: "regular", label: "정규장(접속매매)", phase: "regular" };
  if (t >= 15 * 60 + 20 && t < 15 * 60 + 30) return { key: "close_call", label: "종가 단일가(동시호가)", phase: "call" };
  if (t >= 15 * 60 + 30 && t < 15 * 60 + 40) return { key: "post_close_gap", label: "장 마감(시간외 준비)", phase: "closed" };
  if (t >= 15 * 60 + 40 && t < 16 * 60) return { key: "after_close_price", label: "장후 시간외종가(당일종가)", phase: "after" };
  if (t >= 16 * 60 && t < 18 * 60) return { key: "after_single", label: "시간외 단일가(당일종가 ±10%, 10분 체결)", phase: "after" };
  return { key: "closed", label: "장 마감", phase: "closed" };
}

// NXT(대체거래소) 세션 판정 — "장외"가 아닌 별도 정규시장. 08:00~20:00 운영.
export function getNxtSession(now) {
  const d = kstNow(now);
  const day = d.getDay();
  if (day === 0 || day === 6) return { key: "closed_weekend", label: "휴장(주말)", phase: "closed" };
  const t = minutesOf(d);

  if (t >= 8 * 60 && t < 8 * 60 + 50) return { key: "pre", label: "프리마켓", phase: "pre" };
  if (t >= 8 * 60 + 50 && t < 9 * 60 + 0.5) return { key: "pre_wait", label: "개장 대기(KRX 시가 형성 대기)", phase: "closed" };
  if (t >= 9 * 60 + 0.5 && t < 15 * 60 + 20) return { key: "main", label: "메인마켓(경쟁매매)", phase: "regular" };
  if (t >= 15 * 60 + 20 && t < 15 * 60 + 30) return { key: "main_pause", label: "휴장(KRX 종가단일가 구간)", phase: "closed" };
  if (t >= 15 * 60 + 30 && t < 15 * 60 + 40) return { key: "after_call", label: "애프터마켓 단일가", phase: "call" };
  if (t >= 15 * 60 + 40 && t < 20 * 60) return { key: "after", label: "애프터마켓(경쟁매매)", phase: "after" };
  return { key: "closed", label: "휴장", phase: "closed" };
}

// 두 거래소 상태를 한 번에 — 화면 배지용.
export function marketStatus(now) {
  return { krx: getKrxSession(now), nxt: getNxtSession(now) };
}

// 기존 isMarketHoursKST(정규장 09:00~15:30만 true)와 호환되는 간단 판정 — 승인 대기열 등 기존 로직 재사용용.
export function isKrxRegularHours(now) {
  return getKrxSession(now).phase === "regular";
}
