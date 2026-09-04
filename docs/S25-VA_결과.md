# S25 VA 결과 — AI 페이지를 심판석으로 (S25-1·2·3)

작업일 2026-09-03 · Claude Code

## S25-1 · 정체성 분리
1. **회전 버튼 '분석변경' → 3칸 세그먼트** — `pages/pwa/index.js` report 탭의 `RotatingPageTitle`(buttonLabel 분석변경)을 `나 vs AI · AI 자기검증 · 기록` 세그먼트로 교체(today·english 과 같은 `.td-seg` 모양, index.js styled-jsx 에 클래스 정의). `RotatingPageTitle` 컴포넌트는 미변경(다른 페이지 공용). **`?sec=` 딥링크 유지** — `useTabState('sec', TRUST_TABS, 'vs')` 가 URL 동기화, 세그먼트 버튼은 `setTrustSec` 만 호출.
2. **스와이프** — `useSwipeTabs`(S24-5) 재사용, report `<main>` 에 배선(`aiSwipe`), onChange=`setTrustSec`. 하단 탭 이동엔 미사용.
3. **하단 탭 강조** — 섹션 전환(vs/verify/archive)은 `tab` 을 바꾸지 않고 `trustSec` 만 바꾸므로 **BottomNav 는 report 동안 계속 'ai'**. 예고 없이 '자산'으로 넘어가지 않음.

**어디서 언제 보나:** `/pwa?tab=report` 상단에 3칸 세그먼트. 좌우 스와이프로 나 vs AI ↔ 자기검증 ↔ 기록. `?sec=verify` 직접 진입 종전대로.

## S25-2 · 두 성적표를 하나의 심판석으로
1. **판정 카드(신규)** — `components/AiJudgeCard.js`: vs 섹션 최상단. 나 vs AI **한 표**(판단 건수·승률·평균수익·관망비율). 숫자는 **`getVerdictScorecard` 하나에서만**(AI 승률=전부 매매 기준 `aiWinRate` 추가, AI 관망 0%). `주간/누적` 토글, 기간 라벨 상시.
2. **판정 한 줄** — `지난주는 당신이 나았습니다`/`AI가 나았습니다 · 관망한 N종목 평균 +X%`. **소표본 정직** — `samplePolicy.declareWinner` false면 `아직 판단하기 이릅니다 · 채점 N건/30건`.
3. **AI 성적표 → 'AI 엔진 성적 · 참고'** 개명(운영 지표로 명시, 첫 화면 주인공 아님). ⚠️ 물리적 위치는 archive 유지(verify 로 JSX 이동은 회귀 위험이 커 개명·격하만; 후속에서 이동 가능).
4. **/pwa/record 관계** — (택2 중) record 유지 + AI에서 `자세히 →`로 연결, **같은 `getVerdictScorecard` 숫자 보장**. 주간 리포트 푸시 `action_url` → `/pwa?tab=report&sec=vs`(서버 `weekly_verdict_report.py` 배포). todayCadence 월요일 훅 href 도 동일.

**어디서 언제 보나:** AI 페이지 나 vs AI 섹션 최상단 판정 카드. 주간 리포트 알림/월요일 오늘 카드를 누르면 이 화면.

## S25-3 · 주간 리듬
1. **주차 표기** — 판정 카드 헤더 `지난주 2026년 N주차 (M/D~M/D)` / 누적.
2. **지지난주 대비** — `verdictStats` 에 `untilTs` 추가(기간 상한) → 지난주[lastMon,thisMon)·지지난주[·,lastMon). `지난주 승률 X% (직전 주 Y%)`, 2주치 없으면 미표시.
3. **주중 조용** — 월요일이 아니고 이번 주 판단이 있으면 `이번 주 진행 중 · 판단 N건 · 월요일에 채점됩니다`만. 판정 표는 **완료된 지난주** 기준(매일 안 흔들림).
4. **월요일 오늘 훅 연결** — todayCadence 월요일 도착지 → AI 심판석.

**어디서 언제 보나:** 월요일=지난주 판정 표 + 지지난주 대비. 화·수~일=진행 중 배너 + 안정된 지난주 판정.

## 합격선 대조
- [x] AI 화면에서 하단 탭이 예고 없이 '자산'으로 안 넘어감 — 섹션 전환이 tab 미변경.
- [x] 세 화면 세그먼트+좌우 스와이프.
- [x] `?sec=verify` 딥링크 동작 — useTabState 유지.
- [x] vs 첫 화면에 나·AI 같은 지표 나란히 — AiJudgeCard 표.
- [x] 모든 성적 숫자가 getVerdictScorecard 한 곳.
- [x] 30건 미만 승패 단정 안 함 — samplePolicy.
- [x] 주간 리포트 푸시 → 이 화면 — action_url 변경.
- [x] 주차·기간 명시 / 월·목 화면 다름 / 월요일 오늘 카드 → 심판석.
- [x] verify_s19 FAIL=0 · webpack build 통과.
- ⚠️ 로그인 게이트 뒤 최종 렌더(세그먼트·스와이프·판정·주중 화면)는 사용자 확인. AI 엔진 성적 카드의 verify 섹션 물리 이동은 후속.
