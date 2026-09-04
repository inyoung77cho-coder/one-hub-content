// [S26-12] 테마별 목표어 통합 클립 — 나레이션 성격을 테마별로 한 파일에 모은다("각 페이지 성격에 맞게").
//   생성은 서버(:5005 /english/theme-clip)가 테마당 하루 한 번(LLM·비용 서킷브레이커 경유). 여기엔 성격 상수 + 클립 조립기만.
//   서버는 브리지 '텍스트'를 주고(LLM), 클라는 그 텍스트를 /api/english/speak(edge-tts·무료)로 오디오화한다.
//   → LLM 비용은 하루·테마당 1회(서버 캐시), 재생 시 TTS 만 매번(비용 낮음). 실패하면 브리지 없이 레슨만.

export const THEME_NARRATION = {
  economy: { label: "경제", style: "브리핑 톤 · 숫자와 기업명을 또박또박" },
  display: { label: "디스플레이", style: "오늘 나온 산업 용어 2~3개를 끝에 다시 짚어 줌" },
  general: { label: "회화", style: "어떤 상황에서 쓰는 표현인지 상황을 먼저 설명" },
};

// 서버 프롬프트의 정본(서버가 이 의도로 생성한다 — 문서/일관성용). 실제 호출은 서버가 함.
export const THEME_PROMPT = {
  economy: "Write short, easy bridge sentences in the target language for an economic-news listening clip. Briefing tone. Read numbers and company names clearly. Keep each bridge to one or two simple sentences.",
  display: "Write short, easy bridge sentences in the target language for a display/tech-industry listening clip. At the end, restate 2-3 industry terms that appeared. One or two simple sentences per bridge.",
  general: "Write short, easy bridge sentences in the target language for a conversational-English listening clip. First explain the situation where each expression is used. One or two very simple sentences per bridge.",
};

// 클립 조립: [intro] + (레슨 + 브리지)... + [outro] (+ 한국어 요약 옵션). narration 없으면 레슨만(폴백).
//   narration = { ok, intro, bridges:[], outro, outro_ko }  ← 서버가 준 목표어 '텍스트'
export function assembleThemeClip({ track, language, lessons, narration, koSummary = true }) {
  const langLabel = language === "zh" ? "중국어" : "영어";
  const speak = (text) => `/api/english/speak?text=${encodeURIComponent(text)}&language=${language}`;
  const speakKo = (text) => `/api/english/speak?text=${encodeURIComponent(text)}&language=ko`;
  const lessonTracks = (lessons || [])
    .filter((l) => l && l.id && l.has_audio !== false)
    .map((l) => ({ type: "lesson", title: l.title || l.headline || l.topic || "학습", src: `/api/english/audio/${l.id}` }));

  const tracks = [];
  const narrated = !!(narration && narration.ok);
  if (narrated) {
    if (narration.intro) tracks.push({ type: "intro", title: `오늘의 안내 · ${langLabel} 해설 (AI)`, src: speak(narration.intro) });
    lessonTracks.forEach((lt, i) => {
      tracks.push(lt);
      const b = narration.bridges && narration.bridges[i];
      if (b && i < lessonTracks.length - 1) tracks.push({ type: "bridge", title: `이어서 · ${langLabel} 해설 (AI)`, src: speak(b) });
    });
    if (narration.outro) tracks.push({ type: "outro", title: `마무리 · ${langLabel} 해설 (AI)`, src: speak(narration.outro) });
    if (koSummary && narration.outro_ko) tracks.push({ type: "outro_ko", title: "한국어 한 줄 요약 (AI)", src: speakKo(narration.outro_ko) });
  } else {
    tracks.push(...lessonTracks); // 폴백: 브리지 없이 레슨만
  }
  // 총 길이 10분 초과 방지는 재생기(AudioPlaylist)와 편수로 관리 — 여기선 트랙 상한만 완만히.
  return { track, language, langLabel, count: tracks.length, tracks, narrated };
}
