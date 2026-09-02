# S23 TA 결과 — 오늘 1행을 운용자산으로 (T-2)

작업일 2026-09-02 · Claude Code

## 문제
S22-7이 assets.js 헤드라인을 운용자산으로 바꿨는데 today.js 는 그대로 총자산(57.87억)을 띄워 **두 화면이 다른 총액**을 말했다. 전일 대비도 총자산 기준이라 부동산 실거래 갱신이 오늘의 투자 성과처럼 읽혔다.

## 한 것
1. **단일 소스화(N1)** — 운용/실거주 계산을 `lib/ledger.js` 로 올림: `breakdown.residence_uk`(실거주=부동산순액−투자용부동산순액), `breakdown.operating_uk`(운용=총자산−실거주). assets.js 는 이 필드를 읽도록 전환(로컬 계산은 폴백, 무회귀). **오늘 페이지에서 실거주를 다시 빼지 않는다.**
2. **오늘 1행 위계 전환** — 실거주가 있으면 `운용자산` 을 크게, 그 아래 `총자산 · 🔑 실거주 · 못 파는 자산`(assets.js 와 같은 문구·기호). 실거주 없으면 종전대로 총자산만 크게.
3. **전일 대비를 운용 기준으로** — 스냅샷(`lib/assetHistory`)에 `operating`·`residence` 추가, `getDelta` 가 운용 델타를 반환. 1행 델타는 운용 기준.
4. **부동산 갱신 분리 한 줄** — 실거주 평가액이 전일 대비 변한 날에만 `실거래 반영 · 부동산 +N억` 을 별도 줄로(판단 성과와 시세 갱신 분리).
5. **행2 ETF 조치 근거 통일** — 기존 `onehub_target_alloc`+recommendEtfs(ETF 내부배분) → **`onehub_target_class`(자산군 배분) 이탈**(assets.js '오늘의 한 수'와 같은 `computeClassDrift`/`topDriftMessage`). 두 화면이 같은 목표를 근거로 같은 말을 한다.

## 합격선 대조
- [x] 오늘 1행 큰 숫자 = 종합자산 헤드라인 숫자 — 둘 다 `breakdown.operating_uk` 같은 필드를 읽음(소수 둘째자리 동일 보장).
- [x] 실거주 미등록 사용자 종전과 동일 — residence 0 → operating=total, 라벨 '총자산'.
- [x] 오늘 행2 ETF 문구 = 종합자산 '오늘의 한 수' 근거 — 같은 lib/targetClass.
- [x] N1 준수 — 합산·실거주 분리는 lib/ledger.js 한 곳.
- [x] verify_s19 FAIL=0 · webpack build 통과.
- ⚠️ 로그인 게이트 뒤 최종 렌더(두 화면 숫자 일치·부동산 갱신 줄)는 사용자 확인 필요.
