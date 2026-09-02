# S23 TC 결과 — 할 일에서 바로 판단 기록 + 할 일 재정의 (T-1 · T-5)

작업일 2026-09-02 · Claude Code · 이 스프린트의 본체

## T-1 · 할 일에서 바로 판단을 기록
1. **공용 함수 추출** — `lib/recordDecision.js` `recordDecisionWithPrice()`: 가격을 먼저 확보(없으면 fetchStockQuote)한 뒤 `recordDecision` 1회. index.js `logDecision` 도 이걸 쓰도록 리팩터(복제 제거) — 양쪽이 같은 경로. (S19-2의 'entry 없이 먼저 기록' 버그 재발 방지.)
2. **오늘 화면 3버튼** — 주식 할 일 각 행에 `[매도][보유][관망]`. 누르면 그 자리에서 `recordDecisionWithPrice({source:"today"})`, 행이 **`✓ 매도/보유/관망 기록됨 · HH:MM`** 으로. **페이지 안 떠남.** 원장 스키마(take/pass)에 맞춰 보유=take·매도/관망=pass 로 저장(하락 시 정답 채점), 눌린 라벨은 UI 피드백용.
3. **체크박스·onehub_today_check 제거** — 주식 할 일의 체크박스와 `onehub_today_check_*`(날짜별 무한 누적 키·정리 코드 없음) localStorage 저장 제거. 비판단 행(부동산·이야기)의 '확인함' 토글은 세션 전용으로 남김(localStorage 미사용).
4. **오늘 이미 판단한 종목 제외** — `getTodayDecision(code, trader)` 로 필터.
5. **성적표 링크** — 기록 시 `오늘 N건 기록 · 내 판단 성적표 보기 →`(`/pwa/record`).
6. **오류는 인라인** — 실패 시 alert 금지, 행 아래 `기록 실패 — 잠시 후 다시` 문구.
7. **1차 주식만** — 부동산·ETF 항목은 종목코드가 없어 버튼 미부착.

## T-5 · "할 일"과 "읽을 거리"를 나눈다
1. **할 일 = 판단 요구만** — 손절 임박·승인 대기. ETF 뷰의 뉴스 "할 일"(카드2)을 **`📰 읽을 거리 · ETF`** 로 분리(판단 요구 없는 읽기 목록).
2. **어제 판단 항목 재등장(악화 시)** — 원장 최신 판단의 `entry` 대비 현재가가 임계(`RETRIGGER_DROP_PCT = -4%`, 상단 상수 단일화) 이상 추가 하락하면 `판단 재검토`로 다시 올리고 `보유/관망 판단 · 이후 −X% 추가 하락` 표기. **판단 원장이 있어야만 가능한, 다른 앱이 흉내 못 내는 화면.**
3. **할 일 0건 = 좋은 상태** — `오늘은 손댈 게 없습니다 · N종목 모두 유지 구간 · 손절선 최근접 −X%`(근거 있는 문구).

## 합격선 대조
- [x] 오늘 화면 `[보유]` → `/pwa/record` 판단 건수 +1(같은 종목·시각·source:"today") — recordDecisionWithPrice(source:"today"), getVerdictStats 집계.
- [x] 기록된 항목 새로고침 후 오늘 목록에 없음 — getTodayDecision 필터.
- [x] getVerdictStats 수 = 화면 표시 수 일치 — 같은 원장.
- [x] 어제 판단 종목이 임계 이상 하락 시 '판단 재검토' 재등장(어제 판단+이후 변화 표기).
- [x] ETF 화면 '할 일'에 뉴스 없음 — '읽을 거리'로 분리.
- [x] onehub_today_check localStorage 저장 제거.
- [x] verify_s19 FAIL=0(공용 함수 추출에 맞춰 가드 갱신: logDecision→recordDecisionWithPrice 1회 + 공용함수 내 recordDecision 1회) · webpack build 통과.
- ⚠️ 로그인 게이트 뒤 최종 렌더·버튼 동작은 사용자 확인 필요.
