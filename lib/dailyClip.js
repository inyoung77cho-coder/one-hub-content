// [S25-10] 하루 한 클립 — 각 페이지 내용을 통합해 순서대로 듣는 재생목록을 만드는 순수 함수.
//   순서는 짧은 것부터 긴 것(도중에 끊겨도 중요한 걸 먼저): 요약 → 내 판단 → 자산 변화 → 부동산(월) → 뉴스 → 외국어.
//   ★대본은 화면과 같은 값에서(호출측이 넘긴다). ★비어 있는 항목은 건너뛴다. ★총 10분 넘으면 잘라낸다.
//   ★한꺼번에 합성하지 않는다 — AudioPlaylist 가 '다음 한 편만' preload(S24-10). 같은 대본은 백엔드 해시 캐시.
const MAX_SEC = 600; // 10분

function koTrack(id, title, text) {
  const t = String(text || "").trim();
  if (!t) return null;
  const clipped = t.slice(0, 580);
  return { id, title, kind: "ko", text: clipped, src: `/api/english/speak?text=${encodeURIComponent(clipped)}&language=ko`, estSec: Math.max(8, Math.round(clipped.length / 5)) };
}

export function buildDailyClip({ summary, verdict, asset, realestate, news, foreignItems = [] } = {}) {
  const raw = [];
  const push = (t) => { if (t) raw.push(t); };
  push(koTrack("summary", "오늘 요약", summary));
  push(koTrack("verdict", "내 판단", verdict));
  push(koTrack("asset", "자산 변화", asset));
  push(koTrack("realestate", "부동산 주간", realestate));
  push(koTrack("news", "오늘의 뉴스", news));
  (foreignItems || []).forEach((it, i) => { if (it && it.src) raw.push({ id: `f${i}`, title: `외국어 · ${it.title || `${i + 1}편`}`, kind: "foreign", src: it.src, estSec: 90 }); });

  // 10분 cap — 다 듣지 못할 분량은 안 듣느니만 못하다.
  let acc = 0; const tracks = [];
  for (const t of raw) {
    if (acc + t.estSec > MAX_SEC && tracks.length > 0) break;
    tracks.push(t); acc += t.estSec;
  }
  return { tracks, count: tracks.length, totalSec: acc };
}

export function clipMinutes(sec) { return Math.max(1, Math.round((sec || 0) / 60)); }
