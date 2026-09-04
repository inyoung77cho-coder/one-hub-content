# S26-WC 결과 — 내비게이션 통일 (★버그 수정 포함)

> 2026-09-04 · 선행 S26-WB(`d92a3ca`) · S26-6 헤더 단일화 + S26-7 하단 여백·FAB 규칙.

## 계측 5숫자

| 측정 | WC 시작 | WC 끝 | 목표 |
|---|---|---|---|
| font-size 리터럴 고유값 | 89 | 89 | 8 |
| border-radius 리터럴 선언 | 409 | 409 | 0 |
| 카드 클래스 정의(이름 card) | 39 | 39 | 1 |
| 탭 구현체(클래스 루트) | 16 | 16 | 1 |
| **하단여백 토큰 미적용 페이지** | 13 | **0** ✅ | 0 |

**S26-7 버그 계측이 0 달성.** (WD~WF가 카드/탭/폰트 수치를 내린다.)

## S26-6 · 헤더 하나로

### 실측 정정
- `AppHeader` 는 sticky 가 없었고, 여러 페이지(etf·index·realestate·settings·story)는 **`.sticky-hdr` 래퍼**(position:sticky·top:0·z-140)로 헤더를 이미 고정하고 있었다. today·assets 는 `.sticky-hdr` 안에 **자체 헤더**(`.td-hd`/`.as-hd`)를 두고 있었다.
- 헤더가 **사라지는** 페이지는 지시서대로 `english`·`record`·`vocab`·`clip` — 이들은 `<AppHeader/>` 를 `.sticky-hdr` 없이 직접 렌더해서 스크롤 시 밀려 올라갔다.

### 처리
1. **AppHeader 자체를 sticky 로** (`position: sticky; top: 0; z-index: 140`). 한 곳을 고쳐 english·record·vocab·clip 이 즉시 고정됨. 이미 `.sticky-hdr` 로 감싼 페이지는 중첩 sticky(둘 다 top:0)라 시각 변화·충돌 없음.
   - 배경 `var(--color-bg)` 이미 지정(투명 아님 → 본문 비침 없음).
   - `z-index: 140` < `BottomNav`(150) < FAB(151) — 헤더가 하단바보다 낮음.
2. **today·assets 자체 헤더 → `AppHeader` 로 교체.** 두 헤더가 하던 일(로고→/pwa/today, 트레이더 배지, 🔍→분석, 피드백, ⚙️→설정)이 AppHeader 와 동일. `.sticky-hdr` 래퍼와 그 아래 세그먼트(today `td-seg` · assets `AssetMapTitle`)는 그대로 둠.
   - (죽은 CSS `.td-hd/.as-hd/.td-logo/…` 는 무해하게 남김 — 다음 이관에서 정리 가능.)
3. **헤더 아래 요소 순서 통일**: `AppHeader → (페이지 제목/세그먼트)`. 탭은 `.sticky-hdr` 로 헤더와 함께 고정(스와이프로 탭을 바꾸므로 현재 위치가 늘 보여야 함).

## S26-7 · 하단 여백과 FAB 규칙 ★버그

### 실측 정정 — FAB 은 이미 전 페이지에 있다
`BottomNav` 가 `.bn-fab`(＋)를 **무조건 렌더**한다. 즉 하단 탭이 있는 **13개 전 페이지에 FAB 이 이미 존재**한다(지시서의 "assets·index 두 곳뿐" 은 구버전 전제). 따라서 **권장안(전 페이지 FAB) 이 이미 실현 상태**이고, 여백은 **`--nav-clearance-fab` 하나로 통일**하는 것이 맞다.

### 처리
1. **토큰 신설**(globals.css):
   ```
   --nav-clearance:     calc(env(safe-area-inset-bottom, 0px) + 84px)   /* FAB 없는 하단바 */
   --nav-clearance-fab: calc(env(safe-area-inset-bottom, 0px) + 140px)  /* FAB 있는 하단바(현재 전부) */
   ```
2. **하단 탭 13개 페이지 전부** 최외곽 래퍼 하단 여백을 `var(--nav-clearance-fab)` 로 교체. 리터럴 제거.

   | 페이지 | 이전 | 이후 |
   |---|---|---|
   | today `.td` / assets `.as` / story `.story` / tax `.tx` | safe+140 | var(--nav-clearance-fab) |
   | index `.pwa-wrapper` | 88px | var(--nav-clearance-fab) |
   | english `.en` | safe+96 | var(--nav-clearance-fab) |
   | settings `.m` / etf `.etf` / realestate `.re` | safe+84 | var(--nav-clearance-fab) |
   | clip `.cl-wrap` / vocab `.vc-wrap` / english-test `.et-wrap` | 84px | var(--nav-clearance-fab) |
   | record `.rec-wrap` | 78px | var(--nav-clearance-fab) |

   → **부족했던 index(88)·english(96)·settings/etf/re(84)·clip/vocab/et(84)·record(78) 이 전부 140 으로 올라가 마지막 카드가 더 이상 하단 탭·FAB 뒤로 숨지 않는다.**
3. **FAB 노출 규칙(확정)**: **하단 탭이 있는 전 페이지에 FAB 표시**(BottomNav 내장). 하단 탭이 없는 페이지(온보딩·ai-advisor·system-health·glossary·board-admin)에는 BottomNav 자체가 없으므로 FAB 도 없음.
4. **하단 탭 없는 페이지는 여백 규칙 미적용** — ai-advisor(+24)·system-health(+24)·glossary(+40)·onboarding 은 BottomNav 가 없어 가려질 대상이 없다. 손대지 않음(지시서 #4).
5. BottomNav FAB 의 `color: #fff` → `var(--color-on-primary)` (S26-2 정본 일관성).

## 합격선
- [x] today·assets 가 AppHeader 를 쓴다
- [x] 전 페이지에서 스크롤해도 헤더가 남는다(AppHeader sticky)
- [x] 헤더 뒤로 본문 비침 없음(배경 --color-bg)
- [x] 헤더 아래 요소 순서 동일(헤더→세그먼트)
- [x] 마지막 카드 아래 하단 탭과 겹치지 않는 여백 — 13개 전부 토큰
- [x] 여백 리터럴 제거(토큰만)
- [x] FAB 노출 규칙 하나로 확정(위)
- [x] 계측 "하단여백 미달 페이지" = **0**
- [x] verify_s19 FAIL=0 · webpack build 통과

⚠️ 카카오 로그인 게이트라 실기기 스크롤·헤더 고정 육안 확인은 사용자 몫(코드·빌드·계측으로 검증).

## 커밋
- `S26 WC: 헤더 단일화(AppHeader sticky) + 하단 여백/FAB 클리어런스 버그 수정`
