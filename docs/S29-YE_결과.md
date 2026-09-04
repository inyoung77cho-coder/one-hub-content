# S29-YE 결과 — 이야기 층 3 정비 (공지·댓글 정리 · 댓글 저장소 이전)

> 2026-09-04 · 선행 S29-YD(`b727558`) · 빈 카드가 매일 뜨는 건 신뢰를 깎는다 · 사람 늘기 전에 옮긴다.

## 계측(불변 + 성능)
S26 5숫자 불변. 성능: 마운트 API index 22·today 15·english 9·etf 9 · next/dynamic 7 · cachedJson 미적용 14 · 최대 라인 4332. verify_s19 FAIL=0. webpack build 통과.

## S29-11 · 공지 카드와 지역 댓글
- **공지 = 회차 발행** — `content/announcements/` 가 비어도 이제 **최신 회차를 공지로** 노출(`lib/reports.js getLatestEpisodeAnnounce`, 공개판 www 링크). **둘 다 없으면 카드 자체를 숨김**(today.js `view===3 && announcements.length>0`) — "공지 없음" 빈 카드 제거.
- **지역 댓글은 회차 아래** — 이미 회차 → 반응(YD) → 댓글 순서(story.js). 제목을 **`우리 동네 이야기`** 로 바꿔 기대를 낮춤(`Comments title` prop).
- **글이 없을 때 회차로 유도** — 이번 회차가 있으면 빈 상태·입력창 안내가 `이번 회차 「제목」, 당신 생각은?` 로(빈 화면에 대고 쓰는 것보다 무엇에 대해 쓸지가 있는 게 쉽다). `Comments topic` prop.

## S29-12 · 댓글 저장소 이전 (GitHub → :5002)
- **왜 지금** — `comments.js` 가 GitHub Issues 에 쓰던 구조는 토큰 만료 시 `upstream_auth` 401 로 이야기 전체가 멈춤(겪음). 사람 늘기 전에 옮김.
- **:5002 로 이전** — `account_api.py` 에 `comments` 테이블 + `GET/POST /api/v2/comments`(accounts.db, user_state 와 같은 서비스). 읽기·쓰기 **모두 새 소스**.
- **`comments.js` 재작성** — RE(:5002) 프록시로. **GitHub 구현은 죽은 코드로 보존**(주석, 되돌릴 근거). SQLite 시각을 Safari 안전 ISO 로 정규화(`normTs`).
- **기존 글 마이그레이션** — `scripts/migrate-comments-to-5002.mjs`(운영자 1회 실행). GitHub Issues(label=comment) 를 읽어 :5002 로 옮김. **GitHub 원본은 안 지움(백업)**. 백엔드가 `(thread,nick,text,ts)` 중복을 건너뛰어 **재실행 안전**.
- **실패는 화면에 보이게** — S19-3 `loadError` 계약 유지(프록시가 실패 시 `{ok:false, reason:'upstream_error'}` → Comments 가 "불러올 수 없음"·"저장 실패" 표시, '글 없음'으로 위장 안 함).

## 합격선
- [x] 공지 카드가 매번 비어 있지 않다(회차 폴백) · 공지도 회차도 없으면 카드 숨김
- [x] 이야기 화면 순서 = 회차 → 반응 → 댓글(우리 동네 이야기)
- [x] 글이 없을 때 이번 회차에 대해 남기도록 유도
- [x] 글쓰기가 GitHub 토큰 없이 된다(:5002) · 저장 실패가 화면에 표시된다
- [x] 기존 글 마이그레이션 스크립트(GitHub 백업 유지·재실행 안전)
- [x] verify_s19 FAIL=0 · webpack build 통과
- ⚠️ **:5002 재시작 필요**(YD·YE 공통, 아래) · **마이그레이션 스크립트 1회 실행**(운영자, GITHUB_TOKEN 필요) · 실기기 육안은 사용자 몫.

## ★사용자 실행 필요
### 1) :5002 재시작 (YD 반응/투표 + YE 댓글 테이블·엔드포인트 반영)
```bash
ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -i /c/onehub/one-hub-key.pem ubuntu@54.180.54.132 "sudo systemctl restart onehub-realestate && sleep 2 && systemctl is-active onehub-realestate"
```
(account_api.py 배포·py_compile 통과. 재시작 전엔 반응·댓글 API 가 upstream_error → 화면은 안내 문구.)

### 2) 댓글 이관 (재시작 후, 1회)
```bash
cd /c/onehub/one-hub-content && GITHUB_TOKEN=<토큰> RE_API_URL=http://54.180.54.132:5002 RE_ACCESS_KEY=<키> node scripts/migrate-comments-to-5002.mjs
```
(GitHub 원본은 안 지움. 재실행해도 중복 안 생김.)

## 커밋
- `S29 YE: 공지=회차발행 + 우리동네 이야기 + 댓글 저장소 :5002 이전(+마이그레이션)`
