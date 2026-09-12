// [S34-1] 영상 등록부 — ★유튜브 ID의 유일한 진실. 화면마다 하드코딩하면 편수 늘 때 어긋난다.
//   발행할 때마다 여기 yt 한 줄만 채운다. yt 가 비면(미발행) 링크를 그리지 않는다(빈 링크 금지).
//   id 규칙: 소문자+숫자 3자 이내(u1·s5·w01) — 출처 파라미터로 그대로 쓴다(닫힌 집합).
export const VIDEOS = {
  // 사용법 시리즈(usage)
  u1: { yt: "", title: "3분 만에 시작하기", series: "usage", published: null },
  u2: { yt: "", title: "증권 계좌 없이 쓰는 법", series: "usage", published: null },
  u3: { yt: "", title: "손절선·목표가 정하는 법", series: "usage", published: null },
  // 이야기/주간 시리즈(story) — 발행 시 w01, w02 … 추가
};

const ID_RE = /^[a-z0-9]{1,3}$/;

// 등록되고 발행된(yt 있는) 영상인지. 출처 파라미터 검증·링크 렌더 게이트.
export function isKnownVideo(id) {
  return typeof id === "string" && ID_RE.test(id) && !!(VIDEOS[id] && VIDEOS[id].yt);
}

// 출처 파라미터 검증용(발행 여부와 무관하게 '등록된 id'인지) — 카운터 증식 방지.
export function isRegisteredVideo(id) {
  return typeof id === "string" && ID_RE.test(id) && !!VIDEOS[id];
}

// 재생 링크. yt 없으면 null(링크 그리지 말 것). from 은 앱에서 나간 자리 집계용(?from=app&v=<id>).
export function videoUrl(id, from = "app") {
  const v = VIDEOS[id];
  if (!v || !v.yt) return null;
  const f = String(from).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 16);
  return `https://youtu.be/${v.yt}?utm_source=onehub&from=${f}&v=${id}`;
}

// 유튜브 썸네일(임베드 없이 — S34-7). yt 없으면 null.
export function videoThumb(id) {
  const v = VIDEOS[id];
  return v && v.yt ? `https://i.ytimg.com/vi/${v.yt}/hqdefault.jpg` : null;
}

export function videoTitle(id) {
  return VIDEOS[id] ? VIDEOS[id].title : id;
}
