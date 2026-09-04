# S29-YB 결과 — 진입점 (헤더 재배치 · 맥락 검색 · 설정 정리)

> 2026-09-04 · 선행 S29-YA(`6e5384d`) · 상단 우측은 엄지가 안 닿는 곳 — 자주 쓰는 걸 거기 두지 않는다.

## 계측(불변 + 성능)
S26 5숫자 불변. 성능: next/dynamic **7**(SearchSheet 추가)·cachedJson 미적용 14·최대 4332. verify_s19 FAIL=0.

## S29-4 · 헤더 재배치
- **헤더 오른쪽 = 🔍 · ⚙️ 둘**(+ TraderBadge). `FeedbackButton` 을 AppHeader 에서 제거.
- **의견 버튼은 설정 안으로** — settings 는 이미 자체 헤더에 `FeedbackButton` 을 갖고 있어(206행) 전역 헤더에서 빼도 접근성 유지. **설정에서 열면 '직전 화면'을 첨부**: `_app.js` 가 설정 진입 시 직전 경로를 `sessionStorage(onehub_prev_path)` 에 저장 → settings 가 `screenOverride` 로 전달 → `FeedbackButton` 이 `screenName()` 으로 매핑.
- **TraderBadge** — ★이미 **B(지인 계좌)일 때만** 렌더(A=단일 계좌 사용자에겐 안 보임). S29-4 #3 사실상 충족(렌더 경로 확인: `trader !== "B" → null`).
- **하드코딩 색 제거** — `FeedbackButton` 의 `#4f46e5`(6곳)·`#fff`·rgba 그림자·카테고리 tint 를 `var(--color-primary)`·`var(--color-on-primary)`·`var(--shadow-float)`·`var(--color-primary-soft)` 로. (var 폴백 속 #fff 2곳만 무해하게 잔존.)

## S29-5 · 맥락 검색 (`components/SearchSheet.js`, 신규)
- 🔍 가 **페이지 이동 대신 검색 시트**를 연다(AppHeader 상태·동적 로드). 한 입력창에서 **보유 종목·단지·보유 ETF·저장 단어·지난 판단** + **종목 코드/이름(신규)** 을 함께 찾음.
- **새 API 없음**: positions(`/api/pwa-dashboard` 기존·cachedJson), 종목(`/api/stocks-search` 기존·디바운스), 단지(`onehub_re_my_property`·`onehub_re_properties` 로컬), ETF(`getHoldings`), 단어(`getVocab`), 판단(`getLedger`) — 전부 이미 있는 데이터를 클라에서 필터.
- **현재 페이지 것을 위에**(`primaryKind(router.pathname)` — 부동산이면 단지 먼저·ETF면 ETF 먼저).
- **최근 검색 5개**(`onehub_recent_search`, 로컬·동기화 불필요). **빈 입력**엔 최근 검색 + "무엇을 찾을 수 있는지" 예시.
- 클릭 시 종류별 올바른 화면으로 이동(주식 상세·부동산·ETF·단어장·심판석·AI 분석).

## S29-6 · 설정 정리
- **운영자 섹션 게이트** — ★settings 는 이미 `isAdmin = me.user.role === "admin"`(서버 세션) 으로 운영자 뷰를 admin 에게만(212행). S28 `lib/isOperator` 와 동일 기준. (렌더 경로 확인 — 이미 충족.)
- **계좌 전환 단일 진입** — 실제 A/B 토글은 **설정 한 곳**에만. 헤더 `TraderBadge` 는 표시+설정 링크(조작 아님). → 조작 지점 하나.
- **의견 보내기 자리** — 설정 헤더(직전 화면 첨부, 위).
- **S26 토큰** — settings 는 S26 WF 에서 폰트/모서리 토큰화 완료(계측 반영). FeedbackButton 색도 이번에 토큰화.
- ⚠️ 섹션 순서 '빈도순' 전면 재배치는 627줄 구조 손대는 회귀 위험이 있어 보류(운영자 게이트·계좌·의견은 충족). 순서 조정은 후속.

## 합격선
- [x] 헤더 오른쪽이 두 개(🔍·⚙️)
- [x] 의견 보내기가 설정에서 되고 화면 이름이 정확히(직전 경로 매핑)
- [x] 계좌 하나면 배지 없음(B일 때만 렌더 — 이미)
- [x] 부동산 화면에서 🔍 로 단지를 찾을 수 있다 · 종목·단지·ETF·단어가 한 입력창(새 API 없음)
- [x] 일반 사용자에게 운영자 섹션 안 보임 · 계좌 전환 한 곳
- [~] 섹션 빈도순 전면 재배치 — 보류(회귀 위험). ⚠️
- [x] verify_s19 FAIL=0 · webpack build 통과
- ⚠️ 실기기(로그인) 육안(검색 결과·설정 의견 화면명)은 사용자 몫.

## 커밋
- `S29 YB: 헤더 2버튼 + 맥락 검색 시트 + 의견 설정이동/토큰화`
