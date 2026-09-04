# S28-XD 결과 — 화면화 (심판석 ＋ 정비소 · 오늘 페이지 연결)

> 2026-09-04 · 선행 S28-XC(`4db6ef2`) · 프론트 전용(서버 변경 없음). S26 SegTabs·Card 재사용.

## S28-7 · 심판석 ＋ 정비소
- **운영자 게이트 단일 지점 `lib/isOperator.js`**: `/api/auth/me` 의 `role==='admin'`(board-admin 과 동일). 캐시 1회. 유료 사용자 생겨도 여기 한 곳만 고치면 됨.
- **AI 페이지 4번째 탭 '🔧 정비소'** — `SegTabs`(S26)에 추가. `TRUST_TABS=['vs','verify','archive','maint']`(딥링크 유효), **운영자에게만 탭 노출**(`isOp`면 items·swipe count 4, 아니면 3). 비운영자가 `?sec=maint` 로 들어오면 effect 가 `vs` 로 되돌림.
- **정비소 `components/MaintenanceShop.js`**: 승인 대기 제안(`EngineProposals`, XC) + 차단 정확도 요약 + **규칙(사유)별 성적표**(30건 미만 '판정 보류') + `/pwa/accuracy` 상세 링크. 과정(임계값·백테스트)은 여기(운영자)만.
- **사용자에게 나가는 결과 요약 한 줄**(심판석 하단, vs 탭): `lib/engineImprovement.js` 가 `/api/pwa/accuracy?days=60` 일별(버전 태그)에서 **이번 달 버전 전환+정확도 상승**을 찾으면 "이번 달 AI가 한 번 개선됐습니다 · 정확도 X%→Y%". **개선 없으면 null → 안 뜸**(없는 달에 '개선 중' 거짓말 금지). 데이터가 하루씩 쌓이므로 현재는 null(안 뜸).
- **`/pwa/accuracy` 흡수(부분)**: 승인·규칙 성적표는 정비소로 이관(accuracy.js 에서 `EngineProposals` 제거). accuracy.js 는 **전체 차단 상세(20건 목록)** 로 남기고 정비소에서 링크 — URL 유지·진입 안 깨짐. (하드 리다이렉트 대신 링크로: 20건 상세 정보 손실 방지 + 리팩터 위험 감소. ⚠️ 이 선택을 명시.)

## S28-8 · 오늘 페이지에 반영
- **`lib/todayCadence.js` 훅 2개**(engine 파라미터로 — 비동기라 today.js 가 fetch 해 넘김):
  - 승인 대기 제안 있을 때: "🔧 엔진 개선 제안 N건 · 승인 대기"(→정비소) — **운영자만**(`engine.isOperator`).
  - 이번 달 개선 + 월요일: "AI가 개선됐습니다 · 정확도 X%→Y%" — **모두**.
  - 조건 안 맞으면(제안 0·개선 없음·비운영자) 아무 것도 안 뜸. 현재 둘 다 안 뜸(정직).
- **today.js `engine` 상태**: `getIsOperator` + (운영자면) `/api/pwa/proposals` pending 수 + `getEngineImprovement` 를 fetch 해 `getTodayCadence` 에 전달.
- **조용한 날 판단 카드 폭포 한 단계 추가**(S24-7): `내 판단 경과 → 관찰 종목 → **AI 최근 판단**(aiDaily.changes) → 안내`. 조치도 없고 내 판단 경과도 없으면 **AI가 최근 무엇을 판단했는지**(신규/액션 3건) 보여줘 카드가 비지 않음.

## 합격선
- [x] 정비소가 운영자에게만 보인다(탭·렌더 게이트, 비운영자 sec=maint 되돌림)
- [x] 개선 있던 달에만 사용자 요약 한 줄(engineImprovement null 이면 안 뜸)
- [x] `/pwa/accuracy` 진입 안 깨짐(링크 유지)
- [x] 제안 없는 날 훅 안 뜸 · 일반 사용자에게 운영자 훅 안 보임
- [x] 조치 0건인 날에도 판단 카드 안 비어있음(AI 최근 판단 폴백 추가)
- [x] verify_s19 FAIL=0 · webpack build 통과
- ⚠️ 실기기(로그인·운영자 세션) 육안 확인은 사용자 몫 — 정비소 노출·훅 표시.

## 커밋
- `S28 XD: 심판석+정비소 2면(운영자 게이트)+오늘 페이지 엔진 훅`
