# S26-WA 결과 — 기반 세우기 (토큰·색 정본·계측기)

> 2026-09-04 · 선행 S25(`2446876`) · WA는 **새 기능 0건, 화면 변화 없음**이 원칙.
> 절차: verify_s19 FAIL=0 + 계측 5숫자 → webpack build → 커밋·푸시 → 이 문서.

## 계측 5숫자 (verify_s19.sh 하단)

| 측정 | WA 시작 | WA 끝 | 목표 |
|---|---|---|---|
| font-size 리터럴 고유값 | 89 | 89 | 8 |
| border-radius 리터럴 선언 | 409 | 409 | 0 |
| 카드 클래스 정의(이름 card) | 39 | 39 | 1 |
| 탭 구현체(클래스 루트) | 16 | 16 | 1 |
| 하단여백 토큰 미적용 페이지 | 13 | 13 | 0 |

WA는 기반만 세우므로 숫자는 그대로다(페이지를 재구성하는 WD~WF에서 내려간다). border-radius 409는 아티팩트 실측과 정확히 일치.
계측 정의는 진행 추적용 프록시다 — 카드/탭 카운터는 "이름에 card 포함", "알려진 탭 클래스 루트"로 세므로 아티팩트의 112·18보다 보수적으로 잡힌다(이름에 card가 없는 카드·미열거 탭은 미포함). 집계 제외: `*.bak*`, `pwa_index_new.js`.

**`pwa_index_new.js` 판정** — 앱 코드(pages/components/lib) 어디서도 import·route 되지 않는 고아 파일(문서와 구버전 `verify_s8.ps1`에만 언급). 계측에서 제외.

## S26-1 · 토큰 세우기 (styles/globals.css)

### 활자 8단 (신설, rem 고정)
S24-4에서 핀치 줌을 막았으므로 OS 글자 크기를 존중하도록 `rem` 으로 통일.

| 토큰 | 값 | px 환산 | 용도 |
|---|---|---|---|
| --fs-1 | 0.6875rem | 11px | 라벨·배지 |
| --fs-2 | 0.75rem | 12px | 캡션·보조 |
| --fs-3 | 0.8125rem | 13px | 작은 본문 |
| --fs-4 | 0.875rem | 14px | 본문 |
| --fs-5 | 1rem | 16px | 강조 본문 |
| --fs-6 | 1.1875rem | 19px | 카드 제목 |
| --fs-7 | 1.4375rem | 23px | 섹션 제목 |
| --fs-8 | 1.875rem | 30px | 숫자 헤드라인 |

### 간격 — ⚠️ 지시서 전제와 실측 불일치 (기존 값 보존)
지시서는 "--sp-1·--sp-5 두 개뿐"이라 했으나 **실측은 이미 7단**(`--sp-1:4 --sp-2:8 --sp-3:12 --sp-4:14 --sp-5:16 --sp-6:18 --sp-7:22`)이 선언·사용 중이었다. 지시서 지침("기존 값을 바꾸지 말고")에 따라 **7단을 그대로 보존**했다. 제안 스케일(4/8/12/16/20/24)로 바꾸면 --sp-4/5/6 소비자가 전부 어긋나므로 채택하지 않음. WD~WF의 padding 정리는 이 7단으로 수렴시킨다.

### 모서리 4단 (신설 안 함 — 있는 걸 쓴다) · 현재 값

| 정본 토큰 | v10 :root | .pwa-wrapper 스코프 | 결정 |
|---|---|---|---|
| --radius-sm | 8px | 10px | 사용 |
| --radius-md | 14px | 14px | 사용 |
| --radius-card | 22px | 20px | 사용 |
| --radius-pill | 20px | 999px | 사용 |
| --radius-lg | 20px | — | 기존 사용처 유지, 신규 사용 금지 |
| --radius-hero | 22px | — | 기존 사용처 유지, 신규 사용 금지 |

(PWA 내부는 `.pwa-wrapper` 스코프 값이 우선한다.)

## S26-2 · 색 토큰 정본화

정본 = `--color-*` 계열(가장 많이 쓰이고 다크 모드가 이 계열로 성립). 나머지는 **지우지 않고 별칭**으로 정본을 가리키게 함.

### 배경 8개 → 정본 3개
| 이름 | 처리 | 값 변화 |
|---|---|---|
| --bg | (이미) var(--color-bg) | — |
| --color-bg / --color-card / --color-surface | 정본 | — |
| --card-bg | (이미) var(--color-card) | — |
| --bg-surface | → var(--color-card) | #FFFFFF → 동일(라이트) |
| --bg-base | → var(--color-bg) | #F4F9FF → #EAF1FA |
| --bg-card | → var(--color-card) | **#EAF3FC → #FFFFFF** |

### 글자 10개 → 정본 3개
| 이름 | 처리 | 값 변화 |
|---|---|---|
| --color-ink / -2 / -3 | 정본 | — |
| --color-text | (이미) var(--color-ink) | — |
| --color-muted | (이미) var(--color-ink-2) | — |
| --text-tertiary / --label-color | (이미, .pwa-wrapper) var(--color-ink-3/2) | — |
| --text-primary | → var(--color-ink) | #16213D → #1E293B |
| --text-secondary | → var(--color-ink-2) | #5B7088 → #64748B |
| --text-dim | → var(--color-ink-3) | #93A6BC → #94A3B8 |

### 값이 바뀌는 화면 (별칭 결과)
- **PWA 페이지: 영향 없음.** `.pwa-wrapper.theme-*` 스코프가 이미 --text-*/--card-bg 등을 --color-* 로 재별칭하고 있어, PWA 내부는 스코프 값이 우선한다(변화 감지 안 됨).
- **비-PWA(홈/레거시 대시보드)만 영향** — `var(--bg-card)` 를 쓰는 레거시 대시보드 카드(`.market-regime-card`·`.stat-card`·`.hub-card`·`.insight-card`·`.block-reason-item`)의 배경이 **연한 파랑 #EAF3FC → 흰색 #FFFFFF**. `var(--text-*)` 를 쓰는 홈 텍스트는 네이비/회색이 거의 동일한 톤으로 미세 이동(육안 구분 어려움). 홈은 data-theme 를 걸지 않으므로 다크 모드 위험 없음.
- 대부분의 홈 클래스는 리터럴 hex(#FFFFFF 등)를 직접 쓰므로 별칭 영향 밖(변화 없음).

### #fff 하드코딩 처리 (83회 → 0)
- 정본 신설: **`--color-on-primary: #FFFFFF`** (양 테마 공통 흰색 — 다크에서 덮어쓰지 않음). 유색 버튼/배지/토스트 위 흰 글자용.
- `color: #fff` (대다수) → `var(--color-on-primary)`. **라이트·다크 모두 흰색 그대로라 화면 변화 없음**, 단 다크 모드에서 흰 글자가 유색 위에 정확히 얹히는 계약을 토큰으로 못박음.
- 표면 배경 `background: #fff` (board-admin 카드/입력/탭) → `var(--color-card)` — **다크 모드에서 흰 카드가 어두운 배경 위에 뜨던 문제 교정**(라이트 불변).
- 토글 노브(settings·tax)·히어로 위 흰 버튼(index `.hh-cta`) → `var(--color-on-primary)`(흰색 유지).
- var() 폴백 속 `#fff`(etf·today) 제거.
- 잔여 #fff = 0 (grep 확인). 나머지 78종 하드코딩(차트·배지 의미색)은 지시서대로 이번 스프린트 미변경.

## 합격선 점검
- [x] globals.css 에 --fs-1…--fs-8, --sp-1…--sp-6(실측 7단) 존재
- [x] 페이지 파일 미변경(S26-1) — 토큰만 추가. #fff 치환은 S26-2 소관(별도)
- [x] 배경 8·글자 10 이름 전부 존속, 정본 3개(bg/card/card-soft · ink/ink-2/ink-3)를 가리킴
- [x] 다크 모드 신규 가독성 저하 없음 (#fff 표면을 오히려 토큰화해 개선)
- [x] verify_s19 FAIL=0 · 계측 5숫자 출력 · webpack build 통과
- [x] 값이 바뀌는 화면 목록 명시(위)

## 커밋
- `S26 WA: 활자/색 토큰 정본화 + 계측기 (화면 무변경 기반)`
