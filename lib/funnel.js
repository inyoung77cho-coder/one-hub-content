// [S30-8] 단계별 이탈 측정 — 이정표에 '처음 도달한 시각'만 한 번씩 기록. 이벤트 스트림 아님.
//   onehub_visit_days(S23 T-10, 빈도)와 섞지 않는다 — 이건 '관문'이라는 다른 질문에 답한다.
//   ★개인정보 금지: 타임스탬프와 도달 여부만. 종목명·금액을 담지 않는다.
//   저장 onehub_funnel_A/_B, SYNC_KEYS 등록 → 서버 user_state 로 올라가 운영자가 본다(S30-9).
export const FUNNEL_STEPS = ["signup", "onboard_done", "first_holding", "first_verdict", "d7_return"];
const KEY = (trader = "A") => `onehub_funnel_${trader}`;

function read(trader) {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(KEY(trader)) || "{}") || {}; } catch { return {}; }
}
function write(trader, obj) {
  try {
    localStorage.setItem(KEY(trader), JSON.stringify(obj));
    window.dispatchEvent(new Event("onehub-funnel-change"));
  } catch {}
}

export function getFunnel(trader = "A") { return read(trader); }

// 이정표 도달 기록 — ★이미 찍힌 것은 덮어쓰지 않는다(처음 도달 시각 보존).
export function markFunnel(step, trader = "A") {
  if (!FUNNEL_STEPS.includes(step)) return { ok: false };
  const f = read(trader);
  if (f[step]) return { ok: true, already: true }; // 이미 도달 — 보존
  f[step] = Date.now();
  write(trader, f);
  return { ok: true, first: true };
}

// 가입 7일 뒤 재방문 — signup 이 7일 이전이면 d7_return 을 찍는다(재방문 시 호출).
export function checkD7Return(trader = "A") {
  const f = read(trader);
  if (!f.signup || f.d7_return) return;
  if (Date.now() - Number(f.signup) >= 7 * 86400000) markFunnel("d7_return", trader);
}
