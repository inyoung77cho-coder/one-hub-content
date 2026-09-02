# S23 TE 결과 — 주기 훅 + 이야기 축소 (T-6 · T-9)

작업일 2026-09-02 · Claude Code

## T-6 · 주간·월간·분기 훅을 오늘 화면에
1. **`lib/todayCadence.js`(신규)** — `getTodayCadence({trader, date, opClass})`: 오늘 날짜를 받아 **발동한 훅만** 반환하는 함수. 아닌 날엔 빈 배열(매일 뜨면 배경이 되어 효과 0).
   - 월요일 → `지난주 내 판단 N건 · 승률 X% · AI 대비 Y%p`(`getVerdictScorecard`) → `/pwa/record`.
   - 매월 첫 영업일 → `이번 달 배분 점검 · ETF가 목표보다 +N%p`(`onehub_target_class` drift) → `/pwa/etf`.
   - 11월 첫 영업일 → 절세 마감(`taxCalendar`) → `/pwa/etf?etf=rec`.
   - 분기 첫 영업일 → 내 단지 분기 점검 → `/pwa/realestate`(지어낸 숫자 없이 안내만).
2. **데이터 없으면 훅 미반환** — 지난주 판단 0건이면 월요일에도 카드 없음. 목표 미설정·이탈 없으면 월초 카드 없음.
3. **기존 소스만** — 주간=getVerdictScorecard, 월간=targetClass, 11월=taxCalendar. 새 API 없음.
4. **영업일 판정** — 요일 기반 근사(marketHours 와 동일, 공휴일은 백엔드 권위).
5. **소표본 정직** — 채점 30건 미만이면 `samplePolicy.declareWinner=false` → 승률·AI대비 문구 생략(추이만).
6. **렌더** — 발동 시에만 오늘(view 0) 맨 위 카드 1장.

## T-9 · 이야기 화면을 한 장으로
1. **카드 4장(주식·부동산·ETF·기타) + 헤드라인 → 1장 통합** — `💬 오늘의 이야기 N건 · 주식 X · 부동산 Y · ETF Z` + 대표 글 1건. 비었을 때 안내는 한 번만.
2. **지역별 증감 카드 → `/pwa/story` 이관** — 오늘 화면에서 제거, `pages/pwa/story.js` 에 동일 카드 추가(같은 소스 `getRegionDelta`·스냅샷 적립). 삭제가 아니라 이관.
3. **공지 카드 유지.**
- 결과: 이야기 화면 카드 수 **6 → 2**(이야기 요약 + 공지).

## 합격선 대조
- [x] 시스템 날짜 월요일 → 주간 카드, 화요일 → 안 뜸 — getDay()===1 분기.
- [x] 지난주 판단 0건이면 월요일도 안 뜸 — sc.total>0 가드.
- [x] 주간 카드 숫자 = /pwa/record 숫자 — 같은 getVerdictScorecard.
- [x] 이야기 화면 카드 6→2.
- [x] 이관한 지역 증감이 /pwa/story 에서 동작 — story.js 에 카드+스냅샷 적립 추가.
- [x] verify_s19 FAIL=0 · webpack build 통과.
- ⚠️ 로그인 게이트 뒤 최종 렌더(주기 카드 발동일·이야기 통합)는 사용자 확인 필요.
