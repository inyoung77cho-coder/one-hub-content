# S30-ZA 결과 — 오늘 화면이 직접 입력을 보게 (본체)

> 2026-09-05 · 선행 S29 후속(`28c0ca8`) · 사슬을 켜는 한 줄을 고친다.

## 계측(불변)
S26 5숫자 불변. 성능: 마운트 API index 22 · **today 15(불변 — 새 요청 없음)** · english 9 · etf 9 · next/dynamic 7 · cachedJson 미적용 6 · 최대 라인 4332(index.js). verify_s19 FAIL=0. webpack build 통과.

## ★핵심 합격선 — 직접 입력만 있는 계정에서 판단 1건이 원장에 반영 (실측 PASS)
로그인 게이트라 브라우저 육안은 불가하므로, **localStorage·fetch 를 폴리필한 Node 스크립트로 실제 함수들을 그대로 호출**해 체인을 실측했습니다(삼성전자 직접입력, 현재가 80,000 / 전일 74,000 = +8.11%):

```
buyStock: { ok: true }
positions: [{ name:"삼성전자", source:"manual", cur:80000, chg:"8.11", rank:2, badge:"점검 필요" }]
원장 건수: 0 → 1
직접입력 목록 노출: PASS · change_1d 채움: PASS · 급변 rank2 판정: PASS · 판단 기록 원장 +1: PASS
```

즉 `buyStock`(직접입력) → `getAllStockPositions`(통합·시세·등락) → `deriveUrgency` rank 2 → `recordDecisionWithPrice`(=오늘 화면 [보유] 버튼) → `getLedger` +1 까지 **코드 경로가 실제로 이어짐**을 확인했습니다.

## S30-1 · 보유 소스 통합 (`lib/allHoldings.js` 신규)
- **`getAllStockPositions(trader, {dash})`** — KIS(대시보드 잔고) + 직접입력(`getStockHoldings`)을 **한 배열**로. 필드는 KIS 스키마에 맞춤(`name·code·qty·avg_price·current_price·change_1d·target·stop_loss`), **`source: "kis"|"manual"`** 부착. ★세 화면(오늘·종합자산·AI)이 각자 합치지 않도록 여기 한 곳에서만 합침. `dash` 를 넘기면 요청 중복 없음.
- **오늘 화면이 이 함수를 사용** — `today.js` 의 `parsePositions(dash)`(KIS 전용)를 `allPos`(통합) 로 교체. 로드 전엔 KIS만 폴백(KIS 사용자 무깜빡·무회귀).
- **배지** — 오늘 화면 조치/판단 행에 `직접입력` 배지(`srcBadge`). "내가 넣은 게 여기 있구나".
- **매도 버튼 없음** — 오늘 화면의 판단은 원장 기록(`recordDecisionWithPrice`)일 뿐 KIS 주문 아님. KIS 주문 버튼(`KisHoldingsCard.sell`→`/api/pwa/sell`)은 종합자산/포트폴리오의 KIS 카드에만 있고, 그 카드엔 **KIS 포지션(dash)만** 전달되므로 직접입력엔 애초에 주문 버튼이 없음(기존 분리 유지).

## S30-2 · 시세·등락률 연결 ★여기서 켜진다
- **전일 종가 소스 = `/api/etf/quote` 의 Yahoo `meta.chartPreviousClose`** 를 택함. **이유**: (1) `ManualHoldingsCard`·`ledger` 가 이미 부르는 배치 경로라 **새 요청 0** (S30-2 #4 충족), (2) 현재가와 같은 응답·같은 세션이라 정합, (3) `:5003 /api/etf/history` 는 영업일 1건 더 부르는 추가 왕복이 생김. Stooq 폴백엔 전일종가가 없어 그 종목은 `change_1d=null`(가격은 표시, 등락만 미상 → rank 3).
- `quote.js` 에 `prevClose` 추가(Yahoo meta), `stockLive.toQuote` 가 `changePct = (price/prevClose−1)*100` 계산 → `allHoldings` 가 `change_1d` 로 채움.
- **당일 급변(rank 2)은 시세만으로 판정** → `spikeActionable` 로 오늘 판단 목록(3버튼)에 올라옴. 시세 못 가져온 종목은 목록에서 빼지 않고 `_quoteMissing`(현재가 null→rank3)로 남김(S24 원칙).

## S30-3 · 손절선·목표가를 사용자가 정하게
- `ManualHoldingsCard` 종목마다 **손절선·목표가**(선택 입력). 비어 있으면 한 줄 제안 `손절선을 정해두면 …` + `[평단 −8%로 설정][직접 입력][안 할래요]`. **자동으로 채우지 않음**(버튼을 눌러야 저장). `안 할래요`=`stopHintDismissed`(다시 안 물음).
- 저장은 `onehub_stock_holdings` 항목에 `stopLoss·target` 필드 추가(새 키 없음 · `SYNC_KEYS` 등록됨 → 기기 동기화 자동). 기본값 상수 `RISK_DEFAULTS {stopPct:-8, targetPct:15}` **한 곳**(`lib/allHoldings.js`).
- 값이 있으면 `deriveUrgency` 가 rank 0(손절 임박)·rank 1(익절 검토)로 판정 → 오늘 화면에 뜸.

## KIS 회귀 (S30-10 #3 선점 확인)
- 통합 함수는 KIS 포지션을 `{...p, source:"kis"}` 로 **필드 그대로** 보존 → `deriveUrgency`·매도·기존 nearStop/pending 경로 불변.
- 변경점 하나: **급변(rank 2) 종목이 판단 3버튼 목록에 추가**됨 — KIS·직접입력 **동일 적용**(사업자 결정 "경계 없이 전부 동일"). 이는 제거/변경이 아니라 **추가**이며, 매도·손절·AI 대기 흐름과 종목 수·매도 버튼은 종전과 같음. 상세 회귀 전수 점검은 ZD(S30-10)에서.

## 합격선 체크
- [x] 직접 입력만 있는 계정에서 오늘 화면 보유 목록에 그 종목이 보인다(실측)
- [x] `직접입력` 배지가 붙는다 · 직접 입력 종목에 (KIS)매도 버튼이 없다
- [x] 현재가·등락률이 보이고, 임계 이상이면 `점검 필요`로 판단 목록에 뜬다
- [x] **그 종목에서 [보유]→`/pwa/record` 판단 +1**(실측 0→1)
- [x] 손절선 설정 시 rank 0/1 판정 · 비워둔 종목도 목록 유지 · 앱이 자동으로 안 채움 · `안 할래요` 재권유 없음
- [x] 오늘 화면 마운트 요청 수 불변(15) · verify FAIL=0 · webpack build 통과
- ⚠️ 종합자산 종목 수 == 오늘 종목 수 동치는 로그인 브라우저 육안 몫(코드상 같은 소스이나 종합자산은 KIS중복 제외 규칙이 별도라 표기 종목 수가 다를 수 있음 — ZD에서 확인).

## 커밋
- `S30 ZA: 오늘 화면 직접입력 통합(allHoldings) + 시세·등락 + 손절·목표`
