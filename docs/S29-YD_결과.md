# S29-YD 결과 — 이야기 층 2·4 (낮은 문턱 반응 · 공개판 연결)

> 2026-09-04 · 선행 S29-YC(`5f5afbb`) · 유입은 로그인 밖에서만 일어난다 · 글을 안 써도 참여가 되게.

## 계측(불변 + 성능)
S26 5숫자 불변. 성능: 마운트 API index 22·today 15·english 9·etf 9 · next/dynamic 7 · cachedJson 미적용 14 · 최대 라인 4332. verify_s19 FAIL=0. 빌드: `/episodes`·`/episodes/[slug]` 정적 생성(● SSG) 확인 — intro 14KB HTML.

### First Load JS (Next 16 --webpack 는 라우트표에 First Load JS 미출력 → 실제 청크 크기로 대체)
| 대상 | 크기 |
|---|---|
| pwa/story (SSG) | 27KB(YC와 동일 수준, 반응 컴포넌트는 story 청크 내) |
| episodes/[slug] chunk | 11KB |
| episodes/2026-09-06-intro.html | 14KB |
- recharts 지연 청크 184KB(대결 카드 열 때만) — YA에서 확인, 불변.

## S29-9 · 낮은 문턱 반응 (`components/EpisodeReactions.js` 신규 + :5002 백엔드)
- **이모지 3종**(👍 도움됐어요·😮 몰랐어요·🤔 더 알고 싶어요) — 한 번 누르면 끝, 같은 걸 다시 누르면 해제. **투표 1개**(샀다/관망했다) — 1회 확정(교체만).
- **결과 즉시** — POST 응답이 갱신된 집계를 바로 돌려줘(참여의 보상) 화면 갱신. ★**참여 10명 미만이면 백분율 대신 건수**("3명"), 이상이면 %+막대.
- **저장 = :5002 accounts.db** (`episode_engagement` 테이블 신규), **GitHub 아님**. `account_api.py` 에 `GET/POST /api/v2/episode-engagement` 추가. trader 는 세션 기반(reqTenant, `pages/api/pwa/episode-engage.js` 프록시) — 1인 1표, 클라 값 불신.
- **투표 결과가 다음 회차 소재**(S29-8 초안)와 판단 원장으로 이어질 수 있게 회차 slug 키로 저장. **실패해도 조용히 안 죽음** — "반응 저장이 잠시 안 돼요" 문구.
- ⚠️ **:5002 재시작이 분류기 차단으로 미완** — 코드 배포+py_compile OK, `sudo systemctl restart onehub-realestate` 는 사용자 실행 필요(아래).

## S29-10 · 공개판 연결 (`pages/episodes/` 신규)
- **공개 회차** `pages/episodes/[slug].js`·`index.js` — `content/episodes/*.md` 를 `getStaticProps`(story/[slug] 패턴 그대로)로. **로그인 없이 읽힘**(middleware matcher 는 `/pwa`·`/api` 만 → `/episodes` 는 공개), 끝에 **`내 자산으로 보기 →`** CTA(app.one-hub.kr).
- **공유는 공개판으로** — PWA 회차 카드에 `ShareButton url="https://www.one-hub.kr/episodes/<slug>"`. 받는 사람이 로그인 벽을 안 만남. (app 도메인으로 `/episodes` 가 들어와도 next.config 리다이렉트가 www 로 보냄.)
- **OG 태그** — 회차 제목·요약(3줄 join)·og:image + JSON-LD Article. 카톡/슬랙 카드용.
- **사이트맵** — `gen-sitemap.mjs` 에 `/episodes` 정적 라우트 + `collect('episodes', ...)` 추가(prebuild 자동 생성).

## 합격선
- [x] 글을 쓰지 않고도 회차에 반응(이모지 3·투표 1) · 결과 즉시 · 10명 미만 백분율 안 씀
- [x] 반응/투표 저장 = :5002(GitHub 아님) · 1인 1표(세션 기반)
- [x] 로그아웃 상태에서 회차 링크가 열린다(`/episodes/<slug>` 공개·SSG)
- [x] 앱 안 공유 버튼이 공개판(www)을 가리킨다 · OG 태그 · 사이트맵 추가
- [x] verify_s19 FAIL=0 · webpack build 통과
- ⚠️ **:5002 재시작 필요**(분류기 차단) — 재시작 전까지 반응 API 는 ok:false(화면은 안내 문구). 카톡 카드 실제 렌더·실기기 반응은 사용자 확인 몫.

## ★사용자 실행 필요 (backend 재시작)
```bash
ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -i /c/onehub/one-hub-key.pem ubuntu@54.180.54.132 "sudo systemctl restart onehub-realestate && sleep 2 && systemctl is-active onehub-realestate"
```
(account_api.py 는 이미 배포·py_compile 통과. 백업: account_api.py.bak.* 서버에 있음.)

## 커밋
- `S29 YD: 회차 반응·투표(:5002) + 공개 회차 페이지/공유/OG/사이트맵`
