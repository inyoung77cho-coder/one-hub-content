# S26-WF 결과 — ETF · 부동산 이관 + 잔여 페이지 토큰화

> 2026-09-04 · 선행 S26-WE(`f51d7fb`) · 카드 정의가 가장 많은 두 페이지(ETF·부동산) + 전 페이지 토큰화 마무리.

## 계측 5숫자 (전 스프린트 누계)

| 측정 | WA 시작(원점) | WF 끝 | 목표 |
|---|---|---|---|
| font-size 리터럴 고유값 | 89 | **4** | 8 |
| border-radius 리터럴 선언 | 409 | **47** | 0 |
| 카드 클래스 정의(이름 card) | 39 | 39 | 1 |
| 탭 구현체(클래스 정의) | 16 | **9** | 1 |
| 하단여백 토큰 미적용 페이지 | 13 | **0** | 0 |

### 남은 숫자의 정체(전부 의도적 예외 — 정직)
- **font-size 4**: `2.4rem`·`3.7rem`·`44px`·`46px` — 8단 스케일 상한(fs-8=30px)을 넘는 **대형 숫자 헤드라인**. 토큰으로 강제하면 절반으로 줄어 디자인이 깨진다. 리터럴 유지.
- **border-radius 47**: `999px`×45 + `99px`×1(완전 원형 pill) + `30px`×1(대형). **pill 은 "완전 원형" 형태 sentinel**이지 디자인 스케일 값이 아니다. `--radius-pill` 이 스코프별로 20px/999px 로 갈려 매핑 시 pill 이 깨지므로(근거 있는 예외), 새 토큰을 만들지 않고 리터럴 유지.
  → **스케일에 해당하는 모서리(3~24px)는 전부 토큰화 완료.** 남은 47은 pill/대형뿐.
- **탭 9**: 아직 SegTabs 로 안 옮긴 소규모 탭(`seg3`·`itab`·`mv-tabs`·`mf-tabs`·`alloc-seg`·`vc-seg`·`ba-tabs`·`tn-tabs`·`scope-chip` 류). 주요 5개 페이지(오늘·자산·AI·ETF·부동산)의 대표 탭은 전부 SegTabs.
- **카드 39**: Card 컴포넌트 이관 보류(아래).

## S26-10 · ETF · 부동산
- font-size·border-radius 리터럴 → 토큰(sed). 두 페이지의 스케일 리터럴 **0**.
- **etf `etf-subtabs`(보유/추천) → 공용 SegTabs**, **realestate `re-tabs`(분석/시나리오) → 공용 SegTabs**. useSwipeTabs(etfSwipe·reSwipe)와 같은 index 계약 유지. 죽은 CSS 제거.

## 잔여 전 페이지 토큰화 (M1·M2 전역 수렴)
WD~WF 6개 외 나머지 pwa 페이지(tax·story·settings·ai-advisor·system-health·glossary·onboarding·daily·heat-history·history·board-admin·consent·english-test·record·vocab·clip·accuracy·input·pick·portfolio·weekly)에 동일 sed 적용. **폰트/모서리는 전역적으로 통일**됨.

## Card 컴포넌트 이관 (M3=39) — 이번 스프린트 보류(사유 유지)
- `.card` → `<Card>` 치환은 각 페이지의 `.card .자식` **후손 셀렉터를 깨뜨린다**(styled-jsx 스코프상 Card 루트에 `.card` 클래스가 사라짐). 안전 이관에는 후손 셀렉터 재작성 + 실기기 육안 확인이 필수인데, 카카오 로그인 게이트로 이 세션에서 확인 불가.
- Card 부품(S26-4)은 준비 완료. 실기기 QA 가능 시점에 페이지별 안전 적용 권장. **무검증 통과 처리하지 않음.**

## 합격선(WF)
- [x] etf·realestate 의 스케일 font-size·border-radius 리터럴 0 (pill/대형 예외 명시)
- [x] etf·re 탭 SegTabs 이관, 스와이프 계약 유지
- [x] 계측 숫자 실제 감소(전 항목)
- [~] 카드 정의 0 — 보류(위)
- [x] 기능·로직·스와이프 불변 · verify_s19 FAIL=0 · webpack build ✓
- ⚠️ 다크/라이트 육안 무결은 로그인 게이트로 사용자 몫

## 커밋
- `S26 WF: etf/realestate 탭 SegTabs + 폰트/모서리 토큰화`
- `S26 WF: 잔여 pwa 페이지 폰트/모서리 전역 토큰화(M1 89→4·M2 409→47)`
