// [S51-1] 버니 기기 저장 — 서버(:5005)는 아무것도 저장하지 않는다(S51 §5).
//   onehub_buddy_consent          : { agreed: true, at: ISO } — 동의 전에는 어떤 것도 서버로 보내지 않는다.
//   onehub_buddy_days_<trader>    : [{ date, head_uk, result, notes[], feedback{}, at }] — 최근 30일.
//   기기 간 동기화는 하지 않는다(lib/syncManager.js 수정 금지).
const CONSENT_KEY = "onehub_buddy_consent";
const daysKey = (trader) => `onehub_buddy_days_${trader}`;
const KEEP_DAYS = 30;

const read = (k, fb) => {
  if (typeof window === "undefined") return fb;
  try { const v = JSON.parse(localStorage.getItem(k) || "null"); return v ?? fb; } catch { return fb; }
};
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };

// KST 기준 오늘 날짜(YYYY-MM-DD).
export function todayKst(now = new Date()) {
  return new Date(now.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

export function getConsent() {
  const c = read(CONSENT_KEY, null);
  return c && c.agreed === true ? c : null;
}
export function setConsent() { const c = { agreed: true, at: new Date().toISOString() }; write(CONSENT_KEY, c); return c; }
export function revokeConsent() { try { localStorage.removeItem(CONSENT_KEY); } catch {} }

// 30일보다 오래된 기록을 지운다(날짜 문자열 비교 — YYYY-MM-DD).
export function pruneDays(list, today = todayKst()) {
  const cut = new Date(Date.parse(today + "T00:00:00Z") - KEEP_DAYS * 86400000).toISOString().slice(0, 10);
  return (Array.isArray(list) ? list : []).filter((d) => d && typeof d.date === "string" && d.date > cut)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

export function listDays(trader) { return pruneDays(read(daysKey(trader), [])); }
export function getDay(trader, date = todayKst()) { return listDays(trader).find((d) => d.date === date) || null; }

// 그날 기록을 부분 갱신(없으면 만든다).
export function patchDay(trader, date, patch) {
  const list = listDays(trader);
  const i = list.findIndex((d) => d.date === date);
  const cur = i >= 0 ? list[i] : { date, notes: [], feedback: {} };
  const next = { ...cur, ...patch, date };
  if (i >= 0) list[i] = next; else list.push(next);
  write(daysKey(trader), pruneDays(list));
  return next;
}

// 결과 저장 — 화면 표시용 result 전체와, 나중 채점용 요약(topics 의 view·confidence·basis·watch).
export function saveResult(trader, date, headUk, result) {
  const topics = (result?.topics || []).map((t) => ({
    id: t.id, title: t.title, related: t.related, view: t.view, confidence: t.confidence, watch: t.watch, basis: t.basis,
  }));
  return patchDay(trader, date, { head_uk: headUk ?? null, result, topics, at: new Date().toISOString() });
}

export function addNote(trader, date, note) {
  const d = getDay(trader, date) || { notes: [] };
  const notes = [...(d.notes || []), { text: String(note.text || "").slice(0, 1500), url: String(note.url || "").slice(0, 400) }].slice(-10);
  return patchDay(trader, date, { notes });
}
export function removeNote(trader, date, idx) {
  const d = getDay(trader, date) || { notes: [] };
  return patchDay(trader, date, { notes: (d.notes || []).filter((_, i) => i !== idx) });
}
