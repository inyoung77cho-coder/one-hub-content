# N1 진단 — 자산 원장 (실측, 2026-07-17)

브라우저에서 프로덕션(`one-hub-content.vercel.app`) 실데이터로 확인.

## 저장소 4개 (AS-IS)

| 소스 | 내용 |
|---|---|
| `GET /api/assets/total?trader=A` | 백엔드 원장(원): `breakdown{stock,etf,realty,cash}` · `realty_state` |
| `onehub_onboard_assets` | 온보딩 입력 + **etf.js가 덮어쓰는 ETF 실시간 미러** + 폼 누적기 |
| `onehub_stock_holdings` | 직접입력 주식 리스트(SK하이닉스·삼성전자 ≈ 2.13억) |
| `onehub_etf_holdings` | 직접입력 ETF 리스트 |

## 병합 규칙이 4벌 — 총자산 3종의 정체

| # | 위치 | 규칙 | 문제 |
|---|---|---|---|
| 1 | `lib/assetsTotal.js` `mergeOnboard` | 백엔드 + onboard **덧셈** | 폴백 경로에서 ETF 이중합산 |
| 2 | `pages/pwa/index.js` `mergeOnboardAssets` | 동일 덧셈 | **호출처 0(죽은 코드)**인데 규칙만 다름 |
| 3 | `components/AssetSummaryBar.js` 자체 merge | 동일 덧셈 | + `trader_id=A` **하드코딩**(B 계정 무시) |
| 4 | `pages/pwa/ai-advisor.js` `buildAssets` | **원시** total-asset + onboard 덧셈 | 이미 병합된 값에 또 더함 → 삼중 |

## 이중합산 실측

```
onehub_onboard_assets.etf_uk = 5.19억   ← etf.js:275-288 이 기록한 '실시간 미러'
백엔드 breakdown.etf         = 5.15억
표시값                        = 10.34억   ← add(5.15, 5.19)  (assetsTotal.js:20)
```

**미러의 정체**: `etf.js:259 liveTotal = 백엔드 등록 포지션(수량×실측종가) + 직접입력 보유`.
즉 **ETF 전체를 담은 완전한 대체값**이다. 여기에 백엔드 ETF를 더하면 무조건 두 번 센다.

**폴백 진입 조건**: `assetsTotal.js:36 if (d?.ok && d.breakdown && d.realty_state)` — 세 필드 중
하나만 없어도 폴백 → 그 순간 덧셈 규칙으로 갈아탐. **폴백 진입 자체가 규칙 갈라짐이었다.**

## 직접입력 주식 증발

```
onehub_stock_holdings ≈ 2.13억
  → lib/assetsTotal.js 는 이 리스트를 import조차 안 함  → 백엔드 경로에서 총자산에 미포함
  → 폴백 경로에서만 onb.stock_uk(누적기)로 우회 반영
  → 같은 시점에 주식이 0.09억 / 2.22억 / '미등록' 세 가지
누적기 결함: StockForm 은 저장 시 '+=' 하는데 removeStock 은 차감하지 않음 → 드리프트
```

## 수정 결과 (TO-BE, 라이브 검증)

| 항목 | 수정 전 | 수정 후 |
|---|---|---|
| 총자산 | 39.43억 | **36.35억** |
| 주식 | 0.09억 | **2.22억** (직접입력 2.13억 복구) |
| ETF | 10.34억 | **5.13억** (이중합산 제거) |
| 부동산 | 29.00억 | 29.00억 |

검산 `2.22 + 5.13 + 29.00 = 36.35` — 오차 0.

## 확정 설계

`lib/ledger.js` `getLedger(trader)` **단일 진입점**. 자산군마다 소스를 '채택'하고,
**덧셈은 총액 계산 1회뿐**. ETF는 `lib/etfLive.fetchLiveEtfKrw`(백엔드 포지션+직접입력+환율)로
직접 계산 → **onboard 미러 불필요**(etf.js 기록 삭제).
