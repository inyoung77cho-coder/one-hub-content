# S23 TB 결과 — 세그먼트 탭 + 지연 로드 (T-3 · T-8)

작업일 2026-09-02 · Claude Code

## T-3 · 네 화면을 보이게 + URL에 싣기
1. **4칸 세그먼트 탭** — `자산 · 부동산 · ETF · 이야기`. `RotatingPageTitle`("종목변경" 오버라이드 없던 버튼)를 오늘 페이지에서만 세그먼트로 교체. **RotatingPageTitle 컴포넌트는 미변경**(다른 페이지 공용).
2. **URL 반영** — `/pwa/today?v=assets|re|etf|story`. 기본(파라미터 없음)=assets. `router.isReady` 가드 후 `?v=` → view 동기화, `goView(i)` 가 `router.push({query:{...router.query, v}}, {shallow, scroll:false})` 로 병합(뉴스 `?news=` 와 공존).
3. **숫자 배지** — 자산=조치 종목 수, 부동산=신고가 수(지연 로드 후), ETF=배지 없음, 이야기=새 소식 수. **0이면 렌더 안 함**.

## T-8 · 기본 화면 요청 4건 덜어내기
- `re/feed`·`re-spot` → **부동산 화면 활성 시** 1회(`loadReData`, `reDataLoadedRef`).
- `comments`·`story-region-stats` → **이야기 화면 활성 시** 1회(`loadStoryData`, `storyLoadedRef`).
- 조건은 "탭 클릭"이 아니라 **"해당 화면 활성(초기 `?v=` 진입 포함)"** — view 이펙트에서 판정(기존 `reBriefLoadedRef` 패턴 재사용, 새 패턴 안 만듦).
- 자산 변경 이벤트 시 세 ref(brief·reData·story) 리셋 → 재로드 허용.
- 기본 `load()` Promise.all 에서 `re/feed` 제거(3건으로).

## 합격선 대조
- [x] `?v=etf` 로 새 탭 열면 ETF 화면 — vToIdx + isReady 동기화.
- [x] 모달 열기→뒤로가기→페이지 유지·v 유지 — openNewsDetail 이 v 보존, closeNewsDetail=router.back().
- [x] 탭 라벨에 "종목변경" 문자열 없음 — 세그먼트로 교체.
- [x] 기본 화면 진입 시 `/api/comments` 안 나감, 이야기 탭에서 1회 — 지연 로더.
- [x] `?v=story` 직접 진입 시 `/api/comments` 처음부터 1회 — view===3 초기 진입 포함.
- [x] 기본 화면 첫 요청 4건 감소(re/feed·comments·story-region-stats·re-spot) — 코드상 제거(12→8 목표).
- [x] verify_s19 FAIL=0 · webpack build 통과.
- ⚠️ 실제 네트워크 건수·완성 시간(직전 5,674ms·목표 2,500ms)은 로그인 게이트 뒤라 사용자 콘솔 측정 필요.
