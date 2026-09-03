// [S24-12] 활동 토큰 — '이미 한 일의 기록'이지 '더 하라는 압박'이 아니다.
//   ★연속 일수(streak) 금지 · 잔액을 홈 상단에 크게 띄우지 않음(현장경제·성적표에만) · 금전 가치 없음(현금 교환 불가) · 하루 상한.
//   ★lib/gameWallet.js(가상 대결 지갑)와 절대 섞지 않는다 — 다른 개념·다른 키.
//   ⚠️ 지금은 클라이언트 저장이라 조작 가능하다. 자기 기록용은 문제없으나, 나중에 실제 보상(할인·현금성)과
//      연결하려면 서버 검증이 필요하다(전자금융거래법). 이 사실을 잊지 말 것.
const KEY = (tr) => `onehub_tokens_${tr || "A"}`;

export const TOKEN_DISCLAIMER = "앱 내 기능 이용에만 사용 · 현금 교환 불가";
export const TOKEN_RULES = {
  verdict:  { amt: 2, cap: 6, label: "판단 기록" },
  listen:   { amt: 3, cap: 9, label: "외국어 1편 청취" },
  briefing: { amt: 1, cap: 1, label: "오늘 브리핑 청취" },
  weekly:   { amt: 5, cap: 1, weekly: true, label: "주간 리포트 열람" },
};

function kstDay() { return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10); }
function kstWeek() {
  const d = new Date(Date.now() + 9 * 3600 * 1000);
  const day = (d.getUTCDay() + 6) % 7;
  const th = new Date(d); th.setUTCDate(d.getUTCDate() - day + 3);
  const firstTh = new Date(Date.UTC(th.getUTCFullYear(), 0, 4));
  const wk = 1 + Math.round(((th - firstTh) / 86400000 - 3 + ((firstTh.getUTCDay() + 6) % 7)) / 7);
  return `${th.getUTCFullYear()}-W${String(wk).padStart(2, "0")}`;
}

function read(tr) {
  if (typeof window === "undefined") return { balance: 0, daily: { date: "", byKind: {} }, weekly: { week: "", byKind: {} } };
  try {
    const o = JSON.parse(localStorage.getItem(KEY(tr)) || "null");
    if (o && typeof o === "object") return { balance: Number(o.balance) || 0, daily: o.daily || { date: "", byKind: {} }, weekly: o.weekly || { week: "", byKind: {} } };
  } catch (e) {}
  return { balance: 0, daily: { date: "", byKind: {} }, weekly: { week: "", byKind: {} } };
}
function write(tr, o) {
  try { localStorage.setItem(KEY(tr), JSON.stringify(o)); } catch (e) {}
  if (typeof window !== "undefined") { try { window.dispatchEvent(new Event("onehub-tokens-change")); } catch (e) {} }
}

export function getTokens(tr = "A") { return read(tr).balance || 0; }

// 획득 — 하루/주 상한 내에서만. 초과면 {ok:false, capped:true}. streak·압박 없음.
export function earn(kind, tr = "A") {
  const rule = TOKEN_RULES[kind];
  if (!rule || typeof window === "undefined") return { ok: false };
  const o = read(tr);
  const today = kstDay(); if (o.daily.date !== today) o.daily = { date: today, byKind: {} };
  const week = kstWeek(); if (o.weekly.week !== week) o.weekly = { week: week, byKind: {} };
  const bucket = rule.weekly ? o.weekly.byKind : o.daily.byKind;
  const used = Number(bucket[kind]) || 0;
  if (used >= rule.cap) return { ok: false, capped: true, balance: o.balance || 0 };
  o.balance = (Number(o.balance) || 0) + rule.amt;
  bucket[kind] = used + 1;
  write(tr, o);
  return { ok: true, amount: rule.amt, balance: o.balance };
}

export function spend(amt, tr = "A") {
  const o = read(tr);
  const bal = Number(o.balance) || 0;
  if (bal < amt) return { ok: false, balance: bal };
  o.balance = bal - amt;
  write(tr, o);
  return { ok: true, balance: o.balance };
}
