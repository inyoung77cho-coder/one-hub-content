# S24 UB 결과 — 손에 닿는 느낌 (S24-4·5·6)

작업일 2026-09-03 · Claude Code

## S24-4 · 앱처럼 (화면 고정)
1. **viewport(신규)** — `pages/_app.js` 전역 `<Head>` 에 PWA 라우트 한정 `<meta viewport>` 추가(마케팅 페이지는 자체 viewport 로 override → 무영향). `width=device-width, initial-scale=1, viewport-fit=cover` + `user-scalable=no, maximum-scale=1`.
2. **1단계(안전) 전역 CSS**(`styles/globals.css`) — `overscroll-behavior:none`·`overscroll-behavior-y:contain`(튕김·당겨 새로고침), `min-height:100dvh`(주소창 출렁임), `touch-action:manipulation`(두 번 탭 확대), 비텍스트 UI(버튼·링크·헤더·탭)에 `user-select:none`(입력·본문은 text 유지), `-webkit-tap-highlight-color:transparent`, `-webkit-overflow-scrolling:touch`, `text-size-adjust:100%`(OS 글자 크기 유지).
3. **2단계(핀치 차단) + 탈출구** — 기본 핀치 차단. `pages/pwa/settings.js` 에 **"화면 확대 허용" 토글**(테마 카드 안) → `onehub_allow_zoom` + `onehub-zoom-change` 이벤트로 `_app` 이 런타임 viewport 를 바꿔 핀치 되살림(WCAG 1.4.4 탈출구).
4. **홈 화면 추가 유도** — `components/InstallPrompt.js`(신규, `_app` PWA 라우트에 렌더). 방문 3일차(`onehub_visit_days`, S23 T-10)부터 1회. Android=`beforeinstallprompt`, iOS Safari=공유→홈 화면 추가 3단계 그림 안내. 거절 시 `onehub_install_dismissed`.

**어디서 언제 보나:** 모든 `/pwa/*` 화면에서 스크롤 튕김·핀치 확대가 사라짐. 설정 > 테마 카드에 "화면 확대 허용" 토글. 3일 이상 방문한 사용자에게 하단 홈 화면 추가 카드 1회.

## S24-5 · 스와이프로 탭 전환
- `components/shared/useSwipeTabs.js`(신규) 훅 하나로 함정 8개 처리: ①좌측 24px 무시(iOS 뒤로가기) ②overflow-x 영역 내 시작 무시(조상 검사) ③`|dx|>|dy|*1.5`만 스와이프 확정(세로 양보) ④60px/빠른 플릭 임계 ⑤양 끝 클램프(페이지 안 벗어남) ⑥탭 전환 `router.replace`(뉴스 모달만 push) ⑦탭은 유지(스와이프는 추가 수단) ⑧즉시 전환(감속 애니메이션 없음 = reduced-motion 무해).
- **오늘 화면**(`?v=assets|re|etf|story`)에 배선(`goView` 를 replace 로 전환). 하단 탭(페이지 간)에는 미적용.

**어디서 언제 보나:** 오늘 화면 본문을 좌우로 밀면 자산↔부동산↔ETF↔이야기 전환. 세그먼트 탭은 그대로(스와이프는 추가). 종합자산·AI 허브는 같은 훅으로 확장 가능(후속).

## S24-6 · 화면 위계 재배치
- **순서 교체(오늘 view0)** — `.td-v0` flex 컬럼 + `order` 로 JSX 이동 없이 재배치: ①요약(order 1) ②**판단(order 2)** ③주기훅(order 3) ④대결 배너 한 줄(order 4) ⑤읽을 거리(order 5). 판단 카드가 **스크롤 없이** 보인다.
- **뉴스 3장 → 1장 접힘** — 시황 브리핑·봇 뉴스·주식 뉴스를 **읽을 거리** 헤더(건수 `오늘 N건`) 아래로 묶고 **기본 접힘**(`readOpen`). 삭제가 아니라 접기 — 펼치면 3개 원문 전부 유지.
- **카드 다이어트** — 대결 결과는 테두리 없는 한 줄 배너(기존 유지). 
- **판단만 승격** — `.td-promote`(테두리 강조 + 그림자↑), 읽을 거리 헤더는 `.td-demote`(그림자 제거). 전역 토큰만 사용 → 다크 모드 성립.

**어디서 언제 보나:** 오늘 탭 자산 화면을 열면 요약 바로 아래 판단 카드가 강조되어 보이고, 뉴스는 접힌 "읽을 거리 · 오늘 N건" 한 줄. 펼치면 기사 그대로.

## 합격선 대조
- [x] 세로 끝 튕김·당겨 새로고침 없음 — overscroll-behavior. ⚠️ 실기기 체감은 사용자 확인.
- [x] 스크롤 중 높이 출렁임 없음 — 100dvh.
- [x] 두 번 탭·길게 누르기·탭 하이라이트 조용 — touch-action·user-select·tap-highlight.
- [x] 설정에 "화면 확대 허용" 토글, 켜면 핀치 동작 — settings + _app 런타임 viewport.
- [x] 홈 화면 추가 안내 3일차 1회 — InstallPrompt(visitDayCount>=3, dismissed 가드).
- [x] 오늘 화면 좌우 스와이프로 4탭 전환 · 좌측 가장자리=뒤로가기 · 표 가로스크롤 무시 · 끝 탭 클램프 · replace(뒤로가기 1번에 이탈) — useSwipeTabs.
- [x] 판단 카드 스크롤 없이 보임 · 카드 5→4장(주기훅 미발동 시 3장) · 뉴스 접힘(기사 수 유지) · 다크 성립 — flex order + 읽을거리 접기.
- [x] verify_s19 FAIL=0 · webpack build 통과.
- ⚠️ PWA 로그인 게이트 뒤 최종 렌더(스와이프 체감·핀치·위계·설치 안내)는 **사용자 확인 필요**.
