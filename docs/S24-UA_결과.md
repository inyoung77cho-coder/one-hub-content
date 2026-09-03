# S24 UA 결과 — 틀린 숫자부터 (S24-1·2·3)

작업일 2026-09-03 · Claude Code

## S24-1 · 자산 곡선 절벽 수정
### 먼저 확인
`operating`/`residence` 필드는 **S23 TA(커밋 c7197f9, 2026-09-02)** 에 assetHistory 스냅샷에 처음 추가됐다. 따라서 **2026-09-02 이전 스냅샷은 operating 이 없다**(당시 곡선 코드가 없어 total 로 그려짐). 정확한 건수는 사용자별 localStorage 라 서버에서 셀 수 없음 → 아래 규칙을 데이터 만드는 쪽에 두어 계정과 무관하게 안전하게 처리.
### 선택한 규칙과 이유
**(권장) operating 이 있는 구간만 그린다** — `lib/assetHistory.getAssetSeries(trader, useOperating)`. 실거주 있는 계정(useOperating)은 `operating!=null` 스냅샷만, 없는 계정은 `total`(항상 있고 단위 일관). 소급 추정(과거 실거주 평가액 미상)은 "값을 임의로 고치지 않는다" 원칙에 어긋나 채택하지 않음. **혼합 방지 가드는 데이터 쪽(getAssetSeries)에** 두고 `Sparkline` 은 받은 배열만 그린다.
### 전일 대비 폴백
`operating` 델타가 null(구 스냅샷)이면 총자산 델타로 폴백하되 **라벨에 "· 총자산 기준"** 명시(today·assets 양쪽). 2건 미만이면 곡선 대신 `기록 중 · N일째`.

**어디서 언제 보나:** 오늘 탭 1행 우측 곡선 + 종합자산 히어로 추세 줄. 실거주 등록 계정은 운용 시계열, 미등록은 총자산 시계열. 배포 직후 9/2 이전 스냅샷은 자동 제외돼 급락 구간이 사라짐.

## S24-2 · "지난주 판단" 기간 창
- `getVerdictStats(trader, {sinceTs|days})`·`getVerdictScorecard(trader, {days})` 에 기간 창 추가(기본 무제한 → 기존 호출부 회귀 없음). **승률·AI대비·놓친수익도 같은 창**으로 계산(rec 는 ts, duel 은 date 로 필터).
- `todayCadence` 월요일 훅 → **지난 7일**(`{days:7}`), 제목에 기간 `지난주(8/27~9/2)`. 주간 0건이면 미발동(유지).
- `/pwa/record`·PortfolioDuelCard 는 opts 없이 호출 → **누적 그대로**(변화 없음).

**어디서 언제 보나:** 월요일 오늘 탭 맨 위 주기 카드에서 "지난주(기간) 내 판단 N건". `/pwa/record`(누적)와 숫자가 다르고 각각 기간 라벨로 구분됨.

## S24-3 · 시세 온전성 가드
### 캐시 계층 결정
서버 quote.js(Vercel)는 무상태라 '직전 정상가' 비교가 불가 → **급변 차단은 클라이언트(`lib/priceGuard.js`, localStorage `onehub_last_price`)**, **폴백 제한은 서버(quote.js)** 로 나눔.
1. **서버 `.KQ` 폴백 제한** — `fromYahoo` 가 '심볼 없음(NOTFOUND)'과 '소프트 실패(타임아웃·네트워크·빈응답·레이트리밋)'를 구분하게 하고, `resolveOne` 은 **`.KS` 가 NOTFOUND 를 명시했을 때만 `.KQ`** 시도. 소프트 실패는 폴백 안 하고 실패로 둠 → `missing`(S21-7 재조회·짧은 캐시). 133690.KQ 유령(23,513)이 `.KS` 일시 실패 시 채택되던 근본 차단.
2. **클라 급변 차단** — `guardPrice(ticker, price)`: 직전 정상가 대비 **3배 초과/⅓ 미만**이면 새 값 미채택·직전값 유지·`suspect`. `etfLive.fetchLiveEtfKrw` 가 suspect 를 합산에서 제외하고 `suspect[]` 반환 → `ledger` 가 `SUSPECT_PRICE` 경고.
3. **화면 표기** — `AvgPriceWarningCard`(S22-1 공용)에 `SUSPECT_PRICE` 분기 추가: **평단이 아니라 시세** 문제임을 문구로 구분, "이 시세가 맞습니다"(→`verifyPrice`, 액면분할 통과)만. 총자산 합산 제외.
4. **오탐 탈출구** — 액면분할·병합은 `verifyPrice(ticker)` 로 통과(기준 초기화 후 다음 값 채택). `verified` 패턴 재사용.

**어디서 언제 보나:** 종합자산(assets.js view0)에서 시세가 튄 ETF가 있을 때 "확인이 필요합니다 · 시세가 직전 정상가와 3배 이상…" 카드 + 그 종목 총자산 제외.

## 합격선 대조
- [x] 곡선에 82% 급락 구간 없음 — getAssetSeries 가 단위 일관 시계열만.
- [x] operating 없는 계정도 안 깨지고 안내(`기록 중 N일째`).
- [x] 오늘·종합자산 곡선 같은 모양 — 같은 getAssetSeries.
- [x] 결과 문서에 스냅샷 근거·선택 규칙·이유 기록(위).
- [x] 월요일 카드 = 지난 7일(누적 아님), /pwa/record(누적)와 라벨로 구분.
- [x] 기존 호출부 숫자 불변(opts 미전달).
- [x] `.KS` 타임아웃 시 `.KQ` 로 안 넘어가고 실패(→missing) — resolveOne 소프트실패 break.
- [x] `.KQ` 강제 주입값이 뜨지 않음 — 서버는 NOTFOUND 시만 .KQ, 클라는 3배 급변 차단.
- [x] verify_s19 FAIL=0 · webpack build 통과.
- ⚠️ 133690.KQ 강제주입·`.KS` 타임아웃 실사 재현과 정상시세 회귀는 배포 착륙 후 확인(로그인 게이트 뒤 UI 최종 렌더 포함) — **사용자 확인 필요**.
