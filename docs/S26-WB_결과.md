# S26-WB 결과 — 부품 제작 (공용 Card · 공용 SegTabs)

> 2026-09-04 · 선행 S26-WA(`241b784`) · **부품만 만든다. 어느 페이지도 아직 안 바꿈.**

## 계측 5숫자 (변화 없음 — 부품은 components/ 이고 계측은 pages/pwa 만 스캔)

| 측정 | WB 시작 | WB 끝 | 목표 |
|---|---|---|---|
| font-size 리터럴 고유값 | 89 | 89 | 8 |
| border-radius 리터럴 선언 | 409 | 409 | 0 |
| 카드 클래스 정의(이름 card) | 39 | 39 | 1 |
| 탭 구현체(클래스 루트) | 16 | 16 | 1 |
| 하단여백 토큰 미적용 페이지 | 13 | 13 | 0 |

수치는 WD~WF(페이지 이관)에서 내려간다. WB는 그 이관에 쓸 부품만 준비.

## S26-4 · `components/shared/Card.js`
- 껍데기만 담당: 배경(`--color-card`) · 테두리(`--color-line`) · 모서리(`--radius-card`) · 그림자(`--shadow-card`) · 안쪽 여백(`pad="md"`→`--sp-4` / `pad="sm"`→`--sp-3`) · 아래 간격(`--sp-3`).
- **styled-jsx 스코프 함정 회피**: 껍데기를 **인라인 토큰 스타일**로 구현. children 콘텐츠(제목·행·버튼) 스타일은 각 페이지가 계속 자기 styled-jsx 로 보유. `:global()` 안 씀.
- `tone`: `default` / `accent`(테두리 1.5px `--color-primary` — 판단 카드, "다섯 장 중 하나만 들어올린다" S24-6) / `warn`(테두리 `--color-warning` + `--color-warning-soft` 배경 — 확인 필요·이상치).
- `as` prop 으로 렌더 태그 지정(기본 `section`), `className`·`style`·`onClick` 등 passthrough.
- 세 tone 모두 토큰 기반이라 다크 모드 자동 성립.

## S26-5 · `components/shared/SegTabs.js`
- S23 T-3의 `td-seg` 를 정본으로 추출. `<SegTabs items={[{key,label,badge}]} index={i} onChange={fn} />`.
- **useSwipeTabs 와 같은 계약**(`index`/`onChange(i)`) — 둘이 짝. 페이지는 `useTabState`+`useSwipeTabs`+`SegTabs` 를 같은 index 로 묶는다.
- 배지: `it.badge` 가 0/빈값이면 **렌더 안 함**(S23 규칙). 값 공급은 페이지 몫(지연 로드 배지는 페이지가 가벼운 건수를 첫 화면에서 넘긴다).
- 2·3·4칸 모두 같은 높이(min-height 38px)·같은 글자 크기(`--fs-3`). 배지 `--fs-1`.
- 정본화하며 토큰 적용: 모서리 `--radius-md`(기존 12px→14px), 글자 `--fs-3`(기존 0.82rem≈13px과 동급).

## 함정 회피 확인
- 스토리북 등 새 도구 도입 안 함.
- `:global()` 미사용.
- 부품은 자기 DOM 만 렌더 → 페이지의 기존 `<style jsx>` 와 스코프 충돌 없음(nested styled-jsx 위험 없음).

## 합격선
- [x] `Card.js` 존재, 세 tone 다크 모드 성립(토큰 기반)
- [x] `SegTabs.js` 존재, 2·3·4칸 동일 규격, useSwipeTabs 와 같은 계약
- [x] 어느 페이지도 안 바꿈(부품만) · verify_s19 FAIL=0 · build 통과

## 커밋
- `S26 WB: 공용 Card + SegTabs 부품 (페이지 미변경)`
