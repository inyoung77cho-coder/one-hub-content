# S29 후속 결과 — :5002 배포 검증 + cachedJson 확대

> 2026-09-05 · S29 YA~YE(76a7617) 이후 후속.

## 1) :5002 재시작 + 반응·댓글 실측 (완료)
- `onehub-realestate` 재시작 → `active`. 서버 localhost:5002 로 4개 경로 실측:
  - 반응 POST(👍) → `reactions.useful=1, mine.reaction="useful"` ✓
  - 투표 POST(hold) → `votes.hold=1, vote_total=1, mine.vote="hold"` ✓
  - 댓글 POST(서현동) → `id` 반환 ✓ · 댓글 GET → 저장 글 조회 ✓
- **테스트 행 정리 완료**(실사용자 A 반응·검증봇 댓글 삭제 → 두 테이블 0행, 깨끗한 상태). ★실 trader 로 테스트 후 원복 원칙 준수.

## 2) 댓글 마이그레이션 (사용자 몫 — GITHUB_TOKEN 필요)
- 로컬 `.env.local`·서버에 `GITHUB_TOKEN` 없음(만료로 이전하는 그 토큰). `RE_ACCESS_KEY`/`RE_API_URL` 은 로컬에 있음.
- 스크립트는 준비됨: 재시작·검증까지 끝났으니 운영자가 토큰만 넣어 1회 실행하면 됨.
  ```bash
  cd /c/onehub/one-hub-content && GITHUB_TOKEN=<토큰> RE_API_URL=http://54.180.54.132:5002 RE_ACCESS_KEY=<키> node scripts/migrate-comments-to-5002.mjs
  ```
- 기존 GitHub 글이 없거나 토큰이 만료됐으면 옮길 게 없음(신규 글은 이미 :5002 에 바로 쌓임).

## 3) cachedJson 확대 (S29-3 목표) — 14 → 6
- **읽기 전용 GET 8페이지**에 `cachedJson` 적용(디둡·짧은 TTL·페이지 재방문 캐시): accuracy·assets·heat-history·history·weekly·ai-advisor·story·clip. 에러 시 null 반환 계약에 맞춰 폴백(`|| {}`·`|| {ok:false}`·`?.`) 유지.
- **남은 6은 정당한 제외**(cachedJson=읽기 GET 전용, 쓰기에 씌우면 버그): consent·onboarding·english-test(POST 쓰기)·board-admin·settings(계정 쓰기 혼재)·system-health(`X-Admin-Key` 헤더 필요 — cachedJson 은 옵션 미전달). → 목표 0 은 이 6곳에선 부적절하므로 6 이 올바른 하한.
- verify_s19 FAIL=0 · webpack build 통과.

## 남은 후속(판단 보류 = 위험/외부)
- **index.js 마운트 22요청 축소(S29-3 #1)** — 4,332줄 · 전 페이지 로그인 게이트라 육안 검증 불가. `...LoadedRef` 탭별 지연은 최고 트래픽 탭(portfolio·report)을 건드려 회귀 위험이 큼 → **별도 묶음 권장**(YA 결과 문서와 동일 판단 유지). 블라인드로 강행하지 않음.
- **실기기 육안**(검색·반응 즉시성·카톡 카드) · **회차 youtube_id 채우기**(영상 업로드 후) — 외부 의존.

## 커밋
- `S29 후속: cachedJson 8페이지 확대(14→6) + :5002 반응·댓글 실측 검증`
