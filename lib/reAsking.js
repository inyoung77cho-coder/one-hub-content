// [S45 SC] 사용자 호가 메모 — 본인이 보유로 등록한 단지의 '부르는 값'(매물 호가)을 사람이 직접
//   조회해 기록한다. ★운영자 신고가(/api/input/re-spot, 서버·공용)와는 '다른 저장소'다 — 섞지 않는다.
//   ★본인 계정(trader)에만 저장되는 로컬 전용. 같은 단지 보유자에게 공유되지 않는다(합치면 재배포가 됨).
//   ★표시 전용 — lib/ledger.js getLedger() 자산 평가에 절대 넣지 않는다(호가는 거래된 값이 아니다).
//   ★실거래가 아니라 '미확정·사용자 입력'임을 UI가 명시한다(실거래선과 시각적으로 분리).
import { markDeleted } from "./recordSync";

const KEY = "onehub_re_user_asking";

function read() {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; }
}
function write(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
    window.dispatchEvent(new Event("onehub-assets-change")); // 화면 갱신 트리거(합계와 무관)
  } catch {}
}

export function getAskings(trader = "A") {
  return read().filter((r) => (r.trader || "A") === trader);
}

// 특정 단지(+평형)의 기록만, 최신순.
export function getAskingsFor(trader, complex, pyeong = null) {
  const cx = String(complex || "").trim();
  return getAskings(trader)
    .filter((r) => r.complex === cx && (pyeong == null || String(r.pyeong) === String(pyeong)))
    .sort((a, b) => (b.ts || 0) - (a.ts || 0));
}

// 가장 최근 기록 시각(ms). 없으면 null. — 7일 경과 알림 판단에 쓴다.
export function latestAskingTs(trader = "A") {
  const ts = getAskings(trader).map((r) => r.ts || 0);
  return ts.length ? Math.max(...ts) : null;
}

// 기록 추가. 금액은 '만원' 단위. 최소한 최저 또는 최고 중 하나는 있어야 한다.
export function addAsking({ trader = "A", complex, pyeong = "", lowMan, highMan, count, date, source = "" } = {}) {
  const cx = String(complex || "").trim();
  const lo = lowMan === "" || lowMan == null ? null : Number(lowMan);
  const hi = highMan === "" || highMan == null ? null : Number(highMan);
  if (!cx) return { ok: false, error: "단지를 선택하세요." };
  if (!(lo > 0) && !(hi > 0)) return { ok: false, error: "최저 또는 최고 호가(만원)를 입력하세요." };
  const d = String(date || "").trim();
  const list = read();
  list.push({
    id: `ask-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    trader, complex: cx, pyeong: String(pyeong || "").trim(),
    lowMan: lo != null && lo > 0 ? Math.round(lo) : null,
    highMan: hi != null && hi > 0 ? Math.round(hi) : null,
    count: count === "" || count == null || !(Number(count) >= 0) ? null : Math.round(Number(count)),
    date: /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : "",
    source: String(source || "").trim().slice(0, 40), // 사이트 이름 정도만(URL 전문 저장 금지)
    ts: Date.now(),
  });
  write(list);
  return { ok: true };
}

export function removeAsking({ id, trader = "A" } = {}) {
  const before = read();
  const target = before.find((r) => r.id === id && (r.trader || "A") === trader);
  write(before.filter((r) => !(r.id === id && (r.trader || "A") === trader)));
  if (target) markDeleted(KEY, id);
  return { ok: true };
}
