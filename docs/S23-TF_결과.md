# S23 TF 결과 — 재방문 측정 (T-10)

작업일 2026-09-02 · Claude Code

## 한 것
1. **`lib/visitLog.js`(신규)** — `onehub_visit_days_A`/`_B` = `{ "2026-09-02": { visit:1, verdicts:3 } }`. **방문일과 판단 기록일을 따로** 센다.
   - `recordVisit(trader)` — 오늘 방문 표시(today.js 마운트에서 호출).
   - `recordVerdictDay(trader)` — 판단 기록 시 verdicts +1(공용 `recordDecisionWithPrice` 에서 호출 → 오늘·추천 카드 공통).
   - 새 날짜 첫 기록 때만 세션 1회 `onehub-assets-change` 발화(syncManager debounce push) → 매 렌더 spam 없이 서버 동기화.
2. **SYNC_KEYS 등록** — `onehub_visit_days_A`·`onehub_visit_days_B` 둘 다(trader 접미사 방식, S22-3 자산곡선과 동일). 서버 user_state 로 올라간다.
3. **주간 리포트에 접속일수** — `weekly_verdict_report.py` 가 `onehub_visit_days_<trader>` 를 읽어 지난주 방문일수를 계산, 리포트에 `· 이번 주 N일 접속` 추가. DRY-RUN 통과(user_state 0행 → 0명, 정상).
4. **스트릭 배지 금지** — 화면에는 연속 일수 배지를 달지 않는다(하루 끊기면 이탈 유발). 사실만 주간 리포트에서.

## 합격선 대조
- [x] 이틀 접속 후 로컬·서버 user_state 양쪽에 2일치 — recordVisit + SYNC_KEYS(서버 동기화는 다음 push 시).
- [x] 주간 리포트 본문에 접속일수 포함 — visit_txt 추가(DRY-RUN 확인).
- [x] 화면에 스트릭 배지 없음 — visitLog 는 저장만, 렌더 없음.
- [x] 키 형식 onehub_visit_days_A/B(trader 접미사), SYNC_KEYS 둘 다 등록.
- [x] verify_s19 FAIL=0 · webpack build 통과.
- ⚠️ 실제 서버 반영·리포트 발송 end-to-end 는 user_state 동기화(사용자 접속) 후 가능.

## S23 전체 마무리
TA(운용자산 위계)·TB(세그먼트 탭+지연로드)·TC(판단 기록+할 일 재정의)·TD(절세 달력+곡선)·TE(주기 훅+이야기 축소)·TF(방문 기록) 6묶음 전부 완료. 오늘 페이지가 '신문'에서 '매일 한 줄씩 채워지는 장부'로 전환 — S22의 판단 원장·성적표·주간 리포트에 연료(판단 기록)를 넣는 구멍을 뚫음.
