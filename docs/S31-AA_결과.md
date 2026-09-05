# S31-AA 결과 — 로그인 없이 쓰는 공개 도구

> 2026-09-06 · 선행 S30(`40acb6f`) · 가치를 맛보기 전에 가입을 요구하던 문제. 유입 경로 0 → 1.

## 계측(불변)
S26 5숫자 불변. 성능: 마운트 API index 22 · today 15 · english 9 · etf 9 · next/dynamic 7 · cachedJson 미적용 6 · 최대 4332. verify_s19 FAIL=0. webpack build 통과. 빌드 확인: `/estimate`(정적 ○) · `/api/public/re/estimate`·`/api/public/re/complexes`·`/api/pwa/public-signup`·`/api/pwa/funnel-agg`(함수 ƒ).

## ★로그아웃 상태에서 공개 도구가 동작 (근거)
- **`/api/public/`은 `PROTECTED_API_PREFIXES` 밖** → `middleware.isProtectedApi()` 가 false → `NextResponse.next()`(공개 통과). **화이트리스트 미변경**(합격선). `/estimate` 페이지도 `/pwa`·`/login` 이 아니라 미들웨어 매처의 페이지 게이트 밖 → 공개.
- **재사용 엔드포인트 실측**(서버 localhost:5002): `시범우성` → `complex-areas` 11개 평형(46㎡ 19평 대표 13.3억·최고 13.9억·20건), `trend` 6개월 시계열·변동 −6.1%. 두 소스가 estimate 프록시로 합쳐져 공개 응답.
- ⚠️ 프로덕션 Vercel에서 **로그아웃 브라우저 실제 확인**은 배포 후 사용자 몫(pre-deploy 로 Vercel URL 직접 호출 불가). 코드 경로·데이터·미들웨어 규칙은 검증됨.

## S31-1 · 공개 API 경로
- **`/api/public/re/estimate?apt=&region=`**(신규) — 기존 `:5002 /api/v2/complex-areas`(평형별 실거래)+`/api/trend`(6개월 추이) 재사용. **새 계산 로직 없음.**
- **레이트리밋**: IP당 분당 20회 초과 시 429(+Retry-After). ★진짜 방어는 **CDN 캐시** `s-maxage`(있는 단지 6h·빈 단지 10m) — 같은 단지 재요청이 백엔드까지 안 감. IP는 판정에만 쓰고 **로그·저장 안 함**(개인정보 미보관).
- **최소 응답**: 평형별 최근 실거래·6개월 추이만. 내 단지 추적·갈아타기·세금·대장 대비는 가입 후(유료 기능 통째 노출 금지).

## S31-2 · 공개 적정가 페이지 (`pages/estimate.js`, www)
- 화면 셋: **지역 칩 → 단지명(자동완성 `datalist`, `/api/public/re/complexes`) → 결과**(평형 선택·대표/최고 실거래·건수·6개월 막대 추이). **로그인·이메일·전화 안 물음.**
- **"적정가" 단어 안 씀** — `최근 실거래 기준 통계`. 면책 문구는 기존 그대로(`규칙 기반 참고 정보 · 투자자문이나 특정 종목 권유가 아닙니다`).
- **데이터 없을 때** — `아직 이 단지는 실거래 데이터가 부족합니다` + 다음 걸음(관심 단지 등록). 화면 안 깨짐(S24 원칙). 커버리지 안 넓힘(S28 원칙 유지).
- **OG 태그**(카톡 카드) + **사이트맵 `/estimate` 추가**. 랜딩이라 하단 탭·헤더 아이콘 없음. 모바일 우선.

## S31-3 · 가입 전환 경로와 측정
- **결과를 본 뒤에만** 가입 유도 한 줄(`이 단지를 내 자산에 넣고 매주 추적하려면 → 시작하기`). 입력 전 노출 안 함.
- **유입 출처** `app.one-hub.kr/login?from=estimate&apt=<단지>&region=<지역>`. login 이 앱 origin `localStorage(onehub_from)` 에 저장(OAuth 왕복 생존·교차출처 우회) → **온보딩이 그 단지를 부동산 단계에 미리 채움** + STEP0 배너(`방금 보신 <단지>를 이어서`).
- **funnel 관문 2개** `public_tool_view`·`public_tool_signup`(가입 시점 승격) + **서버 카운터**(`account_api public_metrics` — 교차출처 익명 조회를 서버에서 집계, estimate 프록시가 캐시 미스 시 `tool_view`+1·온보딩 전환 시 `/api/pwa/public-signup` 로 `tool_signup`+1). :5002 실측 `{tool_view:1→리셋}`.
- **운영자 화면**(MaintenanceShop): `🌐 공개 도구 조회 N · 가입 전환 M` 한 줄(funnel-agg.public).

## 규제 메모 (0-2)
- 공개 표현은 "실거래 기반 통계"로 통일, "적정가/매수 추천" 없음. ⚠️ **유료화·제휴 직전 유사투자자문업 등 전문가 확인 필요**(결과 문서에 남김).

## 합격선 체크
- [x] `/api/public/re/estimate` 공개(화이트리스트 밖·코드 검증) · 같은 단지 캐시(s-maxage) · 분당 한도 429 · PROTECTED 미변경
- [x] 단지명만 넣어 결과(평형·실거래·추이) · OG 카드 · 데이터 없어도 안 깨지고 다음 걸음 · "적정가" 표현 없음
- [x] 결과 본 뒤에만 가입 유도 · 가입 시 온보딩에 그 단지 미리 채움 · 운영자 화면 조회/전환
- [x] verify FAIL=0 · webpack build 통과
- ⚠️ 프로덕션 로그아웃 브라우저·카톡 카드 렌더 실제 확인은 배포 후 사용자 몫.

## 커밋
- `S31 AA: 공개 실거래 통계 도구(/estimate) + 공개 API + 가입 전환·측정`
