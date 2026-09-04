// [S25-7] 내 단어장 — 별 하나로 담고 언제든 리마인드. 메모 입력 강요 없음(입력이 필요하면 아무도 안 씀).
//   저장(trader별, SYNC_KEYS 등록): onehub_vocab_A/_B = [{ id, lang, text, meaning, source, savedAt, reviewedAt[], box }]
//   리마인드는 4단계 라이트닝(간격 반복 정식 구현 아님): box1→1일 box2→3일 box3→7일 box4→30일.
//     기억남 → box+1 · 가물 → box1 로. 판정 버튼은 두 개.
const KEY = (tr) => `onehub_vocab_${tr || "A"}`;
export const BOX_DAYS = { 1: 1, 2: 3, 3: 7, 4: 30 };
const DAY = 86400000;

function idOf(lang, text) {
  const s = `${lang}:${String(text).trim().toLowerCase()}`;
  let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return String(h >>> 0);
}
function read(tr) { if (typeof window === "undefined") return []; try { const a = JSON.parse(localStorage.getItem(KEY(tr)) || "[]"); return Array.isArray(a) ? a : []; } catch { return []; } }
function write(tr, list) {
  try { localStorage.setItem(KEY(tr), JSON.stringify(list)); } catch (e) {}
  if (typeof window !== "undefined") {
    try { window.dispatchEvent(new Event("onehub-vocab-change")); } catch (e) {}
    try { window.dispatchEvent(new Event("onehub-assets-change")); } catch (e) {} // syncManager debounce push
  }
}

export function isSaved(lang, text, tr = "A") { const id = idOf(lang, text); return read(tr).some((x) => x.id === id); }
export function getVocab(tr = "A", lang) { const l = read(tr); return lang ? l.filter((x) => x.lang === lang) : l; }
export function getVocabCount(tr = "A") { return read(tr).length; }

// 별 토글 — 없으면 담고(★), 있으면 뺀다(☆). 같은 표현은 한 건.
export function toggleSave({ lang, text, meaning, source }, tr = "A") {
  const id = idOf(lang, text);
  const list = read(tr);
  const i = list.findIndex((x) => x.id === id);
  if (i >= 0) { list.splice(i, 1); write(tr, list); return { saved: false }; }
  list.push({ id, lang: lang || "en", text: String(text), meaning: meaning || "", source: source || "", savedAt: Date.now(), reviewedAt: [], box: 1 });
  write(tr, list);
  return { saved: true };
}

// 복습 판정 — remembered ? box+1(최대4) : box1. 마지막 복습 시각 기록.
export function review(id, remembered, tr = "A") {
  const list = read(tr);
  const x = list.find((v) => v.id === id);
  if (!x) return { ok: false };
  x.box = remembered ? Math.min(4, (Number(x.box) || 1) + 1) : 1;
  x.reviewedAt = Array.isArray(x.reviewedAt) ? x.reviewedAt : [];
  x.reviewedAt.push(Date.now());
  write(tr, list);
  return { ok: true, box: x.box };
}

// 오늘 복습 대상 — (마지막 복습 or 저장) + box 간격이 지난 것.
export function dueForReview(tr = "A") {
  const now = Date.now();
  return read(tr).filter((x) => {
    const last = (Array.isArray(x.reviewedAt) && x.reviewedAt.length) ? x.reviewedAt[x.reviewedAt.length - 1] : x.savedAt;
    const days = BOX_DAYS[Number(x.box) || 1] || 1;
    return now - (last || 0) >= days * DAY;
  });
}
