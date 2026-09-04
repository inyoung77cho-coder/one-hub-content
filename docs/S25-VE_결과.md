# S25 VE 결과 — 하루 한 클립 (S25-10)

작업일 2026-09-03 · Claude Code

## S25-10 · 통합 브리핑
1. **`lib/dailyClip.js`(신규)** — `buildDailyClip({summary, verdict, asset, realestate, news, foreignItems})` 순수 함수. 순서 **짧은 것부터 긴 것**: ①오늘 요약 ②내 판단 ③자산 변화 ④부동산 주간 ⑤오늘의 뉴스 ⑥외국어. **비어 있는 항목은 건너뜀**. **총 10분 초과분은 잘라냄**(MAX_SEC=600). 각 한국어 트랙 = `/api/english/speak?...&language=ko`(백엔드 text 해시 캐시 재사용).
2. **대본은 화면과 같은 소스** — `pages/pwa/clip.js`(신규)가 `getLedger`·`getVerdictScorecard`·`briefingScript`·`computeClassDrift` 등 **화면과 같은 lib** 로 대본을 만든다. 요약=briefingScript(S24-9), 판단=주간 scorecard, 자산=목표 이탈, 부동산=onehub_re_weekly(월요일), 뉴스=pwa-today-news-brief, 외국어=오늘 학습 오디오.
3. **재생기 재사용** — `AudioPlaylist`(S24-10): **다음 한 편만 preload**(:5005 보호), MediaSession(잠금화면 다음/이전/정지), 이어 듣기, **트랙 목록·건너뛰기** 내장. 자동재생 없음(탭에서 시작).
4. **개수·길이 표시** — `오늘은 N트랙 · 약 M분`. 비어 있는 트랙은 목록에 없음.
5. **진입로 둘** — 오늘 요약 카드 `🎧 오늘 브리핑 전체 듣기 →`, 듣는 경제 하단 `🎧 오늘 브리핑 전체 듣기(자산·판단·뉴스 포함) →`(외국어만 듣던 사람이 전체로 넘어오게).

**어디서 언제 보나:** 오늘 탭 요약 카드·듣는 경제 하단 링크 → `/pwa/clip`. 버튼 하나로 하루치가 순서대로 재생, 트랙 목록 보이고 건너뛰기, 잠금화면 제어.

## 합격선 대조
- [x] 버튼 하나로 하루치 순서 재생 — clip.js + AudioPlaylist.
- [x] 재생 중 트랙 목록 보이고 건너뛰기 — AudioPlaylist 목록.
- [x] 잠금화면 다음/이전/정지 — MediaSession.
- [x] 읽어주는 숫자 = 화면 숫자 — 같은 lib(briefingScript·scorecard·drift).
- [x] 비어 있는 트랙 목록에 없음 — buildDailyClip 건너뜀.
- [x] 한꺼번에 합성 안 함(다음 한 편만) · 10분 cap · 자동재생 없음.
- [x] verify_s19 FAIL=0 · webpack build 통과.
- ⚠️ TTS 실재생·MediaSession·10분 컷 체감은 로그인 게이트 뒤 실기기 사용자 확인. news/외국어 트랙은 각 API 응답에 의존.
