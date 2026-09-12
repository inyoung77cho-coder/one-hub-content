// [S30-8] 단계별 이탈 측정 — 이정표에 '처음 도달한 시각'만 한 번씩 기록. 이벤트 스트림 아님.
//   onehub_visit_days(S23 T-10, 빈도)와 섞지 않는다 — 이건 '관문'이라는 다른 질문에 답한다.
//   ★개인정보 금지: 타임스탬프와 도달 여부만. 종목명·금액을 담지 않는다.
//   저장 onehub_funnel_A/_B, SYNC_KEYS 등록 → 서버 user_state 로 올라가 운영자가 본다(S30-9).
export const FUNNEL_STEPS = ["signup", "onboard_done", "first_holding", "first_verdict", "d7_return"];
// [S31-3] 공개 도구 관문 — 로그인 밖(교차출처)이라 가입 시점에 from=estimate 로 승격 기록.
//   운영자 화면의 '조회 N'은 서버 카운터(public_metrics), 여기 스텝은 per-user 맥락용.
export const FUNNEL_PUBLIC = ["public_tool_view", "public_tool_signup"];
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

// [S34-3] 첫 접점(first-touch) 출처 — 앱 origin. login.js 가 URL(src·v)에서 심어둔다(교차출처 우회).
//   30일 지난 값은 버린다. "youtube:u1" 같은 출처 문자열 하나만(식별자·이력 없음).
function firstSrc() {
  try {
    const v = JSON.parse(localStorage.getItem("onehub_first_src") || "null");
    if (!v || !v.src || !v.ts) return null;
    if (Date.now() - Number(v.ts) >= 30 * 86400000) { try { localStorage.removeItem("onehub_first_src"); } catch (e) {} return null; }
    return String(v.src);
  } catch (e) { return null; }
}

// [S34-3/5] 관문 도달 시 첫 접점 출처를 서버로(집계만). signup·first_verdict 만.
function reportConversion(metric) {
  const s = firstSrc();
  if (!s) return;
  const [src, vid] = s.split(":");
  if (src !== "youtube") return; // 지금은 유튜브만 영상별 집계
  try {
    const qs = `metric=${metric}&src=${encodeURIComponent(src)}${vid ? `&v=${encodeURIComponent(vid)}` : ""}`;
    fetch(`/api/pwa/video-conv?${qs}`, { method: "POST" }).catch(() => {});
  } catch (e) {}
}

// 이정표 도달 기록 — ★이미 찍힌 것은 덮어쓰지 않는다(처음 도달 시각 보존).
export function markFunnel(step, trader = "A") {
  if (!FUNNEL_STEPS.includes(step) && !FUNNEL_PUBLIC.includes(step)) return { ok: false };
  const f = read(trader);
  if (f[step]) return { ok: true, already: true }; // 이미 도달 — 보존
  f[step] = Date.now();
  write(trader, f);
  // [S34-3] 첫 가입/첫 판단일 때만 출처를 서버 집계에 보낸다(1회).
  if (step === "signup") reportConversion("signup");
  else if (step === "first_verdict") reportConversion("verdict");
  return { ok: true, first: true };
}

// 가입 7일 뒤 재방문 — signup 이 7일 이전이면 d7_return 을 찍는다(재방문 시 호출).
export function checkD7Return(trader = "A") {
  const f = read(trader);
  if (!f.signup || f.d7_return) return;
  if (Date.now() - Number(f.signup) >= 7 * 86400000) markFunnel("d7_return", trader);
}
