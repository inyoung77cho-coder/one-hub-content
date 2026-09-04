# S29-YC 결과 — 이야기 발행 (이번 주 회차 · 발행 초안 · 공개 연재 연결)

> 2026-09-04 · 선행 S29-YB(`2e06e3c`) · 숫자는 앱 화면 그대로 — 영상에서 잘못 말하면 되돌릴 수 없다.

## 계측(불변 + 성능)
S26 5숫자 불변. 성능: next/dynamic 7 · cachedJson 미적용 14 · 최대 라인 4332. verify_s19 FAIL=0. story 페이지 청크 27KB(getStaticProps로 SSG 전환, 회차 데이터는 빌드시 주입).

## S29-7 · 이번 주 회차 카드 (`components/EpisodeCard.js` 신규)
- **앱 안에서 재생**(youtube-nocookie 임베드), "유튜브에서 보기"는 작은 보조 링크. 제목·3줄 요약·근거 숫자(출처 병기)·지난 회차 버튼.
- **회차 데이터는 `content/episodes/*.md`**(frontmatter: title/date/week/youtube_id/summary/figures/published) → `story.js` `getStaticProps` 가 gray-matter 로 읽어 published 만, 최신순. (weekly 페이지와 동일 패턴 재사용, 새 백엔드 없음.)
- **영상 없으면 카드 자체를 안 그림**(빈 카드 금지) — 부모가 "이번 주는 쉬어갑니다" 대체.
- 파일럿 0화(`2026-09-06-intro.md`) 작성 — **지어낸 숫자 없음**(figures 빈 배열), 7화 연재로 연결.

## S29-8 · 발행 초안 (`lib/episodeDraft.js` 신규, 운영자 전용)
- 토요일에 운영자에게만 보이는 **이번 주 소재 초안 카드**. ①차단 후일담(`/api/pwa/accuracy`) ②나 vs AI(`getVerdictScorecard` 7일) ③신고가(`/api/pwa/re/new-high`) — **전부 기존 데이터**, 새 수집기 없음.
- **숫자마다 출처를 함께** 표기. 소재 2개 미만이면 "이번 주는 소재가 부족합니다" 정직하게. 대본 초안 + 예상 길이(분).
- ★규칙 기반 조립만 — 지어내지 않음. 문장 다듬기는 필요시 S27 :5005 서킷브레이커 경유(옵션, 여기선 미호출).

## S29 · 공개 연재 연결
- 회차 카드 아래 **"지난 이야기 · 7화 연재"** 링크(`/story/01-scattered`) — 기존 조부장 스토리로 연결.

## 합격선
- [x] 이번 주 회차가 있으면 앱에서 재생(임베드)·없으면 "쉬어갑니다"(빈 카드 없음)
- [x] 회차 요약 숫자에 출처 병기 · 파일럿 0화에 지어낸 숫자 없음
- [x] 운영자 토요일 초안 카드(기존 데이터·출처·소재부족 정직)
- [x] 지난 7화 연재 연결
- [x] verify_s19 FAIL=0 · webpack build 통과(story SSG 27KB)
- ⚠️ 실기기(로그인) 육안·실제 유튜브 임베드 재생은 사용자 몫. youtube_id 는 회차 업로드 후 md 에 채움.

## 커밋
- `S29 YC: 이번 주 회차 카드 + 발행 초안(운영자) + 공개 연재 연결`
