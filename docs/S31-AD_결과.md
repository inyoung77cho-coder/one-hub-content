# S31-AD 결과 — 계좌별 보기 (전제 확인 후 정리)

> 2026-09-06 · 선행 S31-AC(`fa73677`) · ★먼저 계좌 모델의 실제 상태를 확인하고 그에 맞춰 처리.

## 계측(불변)
S26 5숫자 불변. 성능: 마운트 API index 22 · today 15 · english 9 · etf 9 · next/dynamic 8 · cachedJson 미적용 6 · 최대 4332. verify_s19 FAIL=0. webpack build 통과.

## 계좌 모델의 실제 상태 (근거)
코드를 확인한 결과:

| 축 | 실제 상태 | 근거 |
|---|---|---|
| **KIS 연동** | **계좌 하나만** 불러옴(단일) | `dash.balance.positions` 에 계좌 구분 필드 없음 · assets.js `ks-note` 가 "증권사(KIS) 연동 계좌 기준"(단수) · 매매 엔진은 trader당 KIS 계좌 1개 |
| **직접입력 주식** | `account` 필드 **존재**(일반/개인연금/퇴직연금/ISA) · ManualHoldingsCard 가 **계좌 라벨을 행마다 표시**(무시 아님) | `stockHoldings.js` 스키마 · `ManualHoldingsCard` `{h.broker} · {h.account}` |
| **ETF** | 계좌 **필터 UI 완비**(칩) | `etf.js ACCT_FILTERS = ACCOUNTS` |
| **성적표** | 사람 단위 합산(계좌 무관) | `verdictStats` — 판단은 계좌가 아니라 사람 단위(이게 맞음) |
| **A/B 전환** | **운영자 전용**(일반 사용자는 테넌트 하나) | `tenant.js`·`middleware.js` — 이전 진단(최 대표 A/B 오감) 정정됨 |

## 결론 — 경우 B (KIS 단일 계좌)
- **KIS 연동이 계좌 하나만 지원** → **다계좌 연동을 만들지 않음.** KIS API 인증·계좌 스코프 변경은 매매 엔진(`auto_trade`)을 건드리고 실제 돈이 오간다(이번 범위 밖·공통 규칙 #5).
- **나머지 계좌는 직접 입력으로.** S30이 직접 입력을 1급으로 만들었고(오늘 화면 판단·시세·손절), 계좌 라벨도 행마다 보이며(ManualHoldingsCard), ETF는 계좌 필터가 이미 있어 **실용적으로 충분**.
- **안내를 명확히** — assets.js "주식" 뷰 KIS 노트를 `증권사(KIS) 연동은 계좌 하나를 불러옵니다. 다른 증권사·개인연금·퇴직연금·ISA 계좌는 아래 '직접 입력 보유'로 넣으면 종목·계좌 라벨과 함께 총자산·판단에 똑같이 반영됩니다`로 교체.
- **다계좌 KIS 연동은 별도 스프린트로 미룸**(매매 엔진 인증·계좌 스코프).

## 반드시 지킨 것
- **`lib/tenant.js`·`middleware.js` 테넌트 로직 미변경**(계정 격리의 뿌리).
- **`SYNC_KEYS` 의 `_A`/`_B` 하드코딩(10곳) 미변경** — 이번에 추가한 키(`onehub_funnel_A/_B`·`onehub_life_stage`·`onehub_withdraw`)는 **추가**일 뿐 기존 `_A`/`_B` 스킴을 손대지 않음.

## 합격선 체크
- [x] 계좌 모델의 실제 상태가 근거와 함께 문서화됨(경우 B)
- [x] 경우 B — 안내가 명확하고 **다계좌 연동을 시도하지 않음**
- [x] 테넌트 로직·SYNC_KEYS `_A`/`_B` 미변경
- [x] verify FAIL=0 · webpack build 통과
- ⚠️ 실기기 육안(안내 문구 표시)은 로그인 사용자 몫.

## 커밋
- `S31 AD: 계좌 모델 확인(경우 B·KIS 단일) + 직접입력 안내 강화(테넌트/SYNC 미변경)`
