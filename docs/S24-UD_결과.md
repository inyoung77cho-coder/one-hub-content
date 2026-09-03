# S24 UD 결과 — 듣기 (S24-9·10)

작업일 2026-09-03 · Claude Code

## S24-9 · 오늘 브리핑 읽어주기 (한국어)
1. **백엔드(:5005) 한국어 지원** — `app/api/lessons.py` `/english/speak` 에 `language=="ko"` 분기 추가(voice `ko-KR-SunHiNeural`), `LANGUAGES` 게이트는 speak 에서만 우회, `max_length` 200→600. 재시작·실측 200/mp3 확인. (edge-tts, LLM 한도 무관.)
2. **프록시** — `pages/api/english/speak.js` 가 `language=ko` 허용, ko 는 600자.
3. **대본(순수 함수)** — `lib/briefingScript.js` `briefingScript()`: 화면과 **같은 값**(운용자산·전일대비·조치·최근 판단 경과·AI 한 줄)으로. 숫자는 읽기 좋게(`ukWords`: 10.67억 → "10억 6,700만원"). ★S24-1(숫자 정합) 이후에 붙임.
4. **하루 1회 생성·캐시** — 백엔드가 `(language, voice, text)` sha1 해시로 mp3 캐시(30일). **같은 대본이면 재합성 없이 서빙** → 같은 날 두 번 눌러도 TTS 한 번.
5. **재생 UI** — `components/BriefingSpeak.js`: 요약 카드 `🔊 들려주기`/`⏸ 정지`. **버튼 탭에서만 재생**(iOS 자동재생 금지), **MediaSession**(제목·정지/재생, 잠금화면).

**어디서 언제 보나:** 오늘 탭 요약 카드 1행 아래 `🔊 들려주기` 버튼. 누르면 오늘 요약이 한국어로 재생되고, 잠금화면에 "오늘의 자산 브리핑".

## S24-10 · 외국어 연속 재생
1. **연속 재생기(신규)** — `components/shared/AudioPlaylist.js`: 한 편 끝나면(`ended`) 자동 다음, 현재 항목 강조, 이전/다음/정지, **MediaSession**(previous/next/pause), **다음 한 편만 preload**, **이어 듣기 위치 기억**(localStorage `onehub_listen_pos_<mode>`, 기기별). 자동재생 없음(위치만 복원, 재생은 탭).
2. **언어별 재생목록** — `pages/pwa/english.js` 피드 아래 `오늘의 듣기 · N편 [이어 듣기]` 섹션. 활성 언어(경제영어/중국어/일반영어)의 오늘 레슨을 재생목록으로. `SpeakButton`·`Karaoke` 는 그대로 두고 재생목록만 추가.
3. **원문 있는 편만** — `has_audio !== false` 필터(원문 오디오 `/api/english/audio/{id}` 있는 편만). 없는 항목은 재생목록에서 제외.
4. **셀룰러 보호** — 자동 다운로드 없음, 다음 한 편만 preload.

**어디서 언제 보나:** 현장경제 각 언어 화면 하단 "오늘의 듣기 · N편". [이어 듣기]로 그 언어 편들을 연속 청취, 잠금화면 제어, 다시 열면 듣던 편부터.

## 합격선 대조
- [x] 버튼 한 번으로 오늘 요약 한국어 재생 — BriefingSpeak.
- [x] 재생 숫자 = 화면 숫자 — briefingScript 가 화면과 같은 값 사용(S24-1 정합 후).
- [x] 잠금화면 재생·제목 — MediaSession(양쪽).
- [x] 같은 대본 두 번이어도 TTS 한 번 — 백엔드 (text) 해시 캐시.
- [x] 같은 언어 이어 듣기·자동 다음 — AudioPlaylist ended→next.
- [x] 잠금화면 다음/이전/정지 — MediaSession action handlers.
- [x] 원문 없는 기사 제외 — has_audio 필터.
- [x] 껐다 켜면 듣던 위치 기억 — onehub_listen_pos.
- [x] verify_s19 FAIL=0 · webpack build 통과.
- ⚠️ **중국어 기존 지문 오디오가 여성 목소리로 남아 있으면** 연속 재생 중 목소리가 바뀔 수 있음 — 기본 음성은 남성(config)이나 과거 생성분 재생성 여부는 백엔드에서 별도 확인 필요(미확정).
- ⚠️ iOS 잠금화면 재생·MediaSession 실동작·오디오 재생은 로그인 게이트 뒤 실기기에서 **사용자 확인 필요**.
