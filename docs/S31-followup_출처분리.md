# S31 후속 — 공개 도구 유입 출처 분리 측정 (from=youtube)

> 2026-09-06 · 선행 S31-AD(`d8b745b`) · 유튜브 등 유입 채널을 조회·전환에서 따로 집계.

## 목적
`one-hub.kr/estimate?from=youtube` 로 들어온 사람의 **조회·가입 전환을 소스별로** 운영자 화면에서 본다. 기존 단일 카운터(`tool_view`/`tool_signup`)는 그대로 두고, 소스별 카운터를 **추가**로 쌓는다.

## 흐름
```
estimate?from=youtube
  → 결과 조회: 프록시가 tool_view + tool_view_youtube +1 (캐시 미스 시)
  → 가입 CTA: /login?from=estimate&apt=&region=&src=youtube
  → login: onehub_from 에 src 저장(앱 origin, OAuth 왕복 생존)
  → 온보딩 완료: /api/pwa/public-signup?src=youtube → tool_signup + tool_signup_youtube +1
  → 운영자(정비소): 소스별 "조회 N / 가입 M" 한 줄
```

## 변경점
- **백엔드 `account_api.py`** — `public-metric` 이름 검증을 정규식 `^(tool_view|tool_signup|partner_click)(_[a-z0-9]{1,16})?$` 로(소스 접미사 허용·악성 거부). `funnel-agg` 가 `public.by_source`(base→{source:cnt}) 추가 반환. :5002 실측: `tool_view_youtube` bump OK · `hack;drop` 거부 · agg `by_source:{tool_view:{youtube:1}}` (테스트 후 리셋).
- **`pages/estimate.js`** — `?from=`/`?src=` 를 URL에서 읽어(소문자·영숫자 1~16자) ① 조회 fetch에 `&from=` ② 로그인 CTA에 `&src=` 전달.
- **`pages/api/public/re/estimate.js`** — `from` 있으면 `tool_view` + `tool_view_<from>` 둘 다 bump.
- **`pages/login.js`** — `src` 를 `onehub_from` 에 저장(정제).
- **`pages/pwa/onboarding.js`** — 전환 시 `/api/pwa/public-signup?src=<src>`.
- **`pages/api/pwa/public-signup.js`** — `src` 있으면 `tool_signup` + `tool_signup_<src>` 둘 다.
- **`components/MaintenanceShop.js`** — 소스별 `· youtube: 조회 N / 가입 M` 줄.

## 사용법(마케팅)
- 유튜브 설명란·고정댓글 링크를 `https://one-hub.kr/estimate?from=youtube` 로.
- 다른 채널도 같은 방식: `?from=kakao`·`?from=blog`·`?from=cafe` 등(소문자 영숫자 1~16자면 자동 집계).

## 안전
- 소스 문자열은 프론트·프록시·백엔드 3중으로 `[a-z0-9]{1,16}` 정제 → 임의 카운터 이름 주입 불가.
- 개인정보 없음(합계만). CDN 캐시(`from` 포함 키)라 조회 카운터는 캐시 미스에서만 증가(대략 순수 조회).

## 검증
- verify_s19 FAIL=0 · webpack build 통과 · :5002 소스별 bump/거부/집계 실측 PASS.
- ⚠️ Vercel 배포 후 실제 `?from=youtube` 유입→전환 흐름은 사용자 확인 몫.

## 커밋
- `S31 후속: 공개 도구 유입 출처 분리(from=youtube) 조회·전환 집계`
