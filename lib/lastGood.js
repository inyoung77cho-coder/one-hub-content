// [S33-2] 마지막으로 성공한 값을 저장/복원한다.
//   백엔드가 잠깐 죽어도 '침묵(빈 화면)'이나 '빈 배열로 위장' 대신 마지막 값 + "N시간 전 기준"을
//   보여주기 위한 최소 저장소. ★실패를 데이터(빈 배열·0)로 위장하지 않는다 — N1 단일 원장 사고와 같은 종류의 실수.
const P = "onehub_lastgood_";

export function saveLastGood(key, data) {
  try { localStorage.setItem(P + key, JSON.stringify({ data, ts: Date.now() })); } catch (e) {}
}

export function loadLastGood(key) {
  try {
    const v = JSON.parse(localStorage.getItem(P + key) || "null");
    return v && v.data !== undefined ? v : null; // { data, ts } | null
  } catch (e) { return null; }
}

export function agoLabel(ts) {
  if (!ts) return "";
  const m = Math.floor((Date.now() - Number(ts)) / 60000);
  if (m < 1) return "방금 전 기준";
  if (m < 60) return `${m}분 전 기준`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전 기준`;
  return `${Math.floor(h / 24)}일 전 기준`;
}
