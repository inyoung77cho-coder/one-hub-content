# ONE-HUB API 계약표

작성 2026-07-17 (S17-0 Part 3 W3-2) · 전 구간 실측 · `api_contract = "2026-07"`

---

## 계약은 2층입니다

지시서는 "PWA 호출 vs 엔진 라우트" 1:1 대조를 전제하지만, 실제 구조는 다릅니다.
**PWA는 엔진을 직접 부르지 않습니다.**

```
① 프론트(브라우저)  ──▶  ② Next.js API 라우트(Vercel)  ──▶  ③ 엔진(EC2/Lightsail)
   fetch("/api/pwa-dashboard")   pages/api/pwa-dashboard.js      5001 /api/pwa/dashboard
```

②가 CORS·인증키·타임아웃·폴백을 흡수합니다. 따라서 404는 **③에서만** 발생하고,
②는 `{ok:false}`로 감싸 200을 돌려줍니다 — **이것이 "연동 안 됨"이 조용히 지나간 경로입니다.**

---

## H-G 판정: 확정 — 단 규모는 1건이고, 이미 우회됨

**③ 엔진 실응답 실측** (`curl` on `localhost:5001`):

| HTTP | 엔드포인트 | 판정 |
|---|---|---|
| **404** | `/api/assets/total` | **구현된 적 없음**(엔진 라우트 26개 중 `assets` 0건). 프론트가 2차 소스로 우회 완료 |
| **404** | `/api/version` | 부재 → **본 Part에서 신설함** |
| 200 | `/api/pwa/dashboard?trader_id=A` | 정상 |
| 200 | `/api/pwa/accuracy?trader_id=A` | 정상 |
| 200 | `/api/pwa/pending?trader_id=A` | 정상 |
| 200 | `/api/engine-status` | 정상 |
| 200 | `/api/pwa/leaderboard` | 정상 |
| 401 | `/api/health/status` | **정상**(인증 필요 설계) |

**② → ③ 상류 호출 18개 중 404는 `/api/assets/total` 1개뿐입니다.**

### ★ 지시서 W3-1 가설은 기각됩니다

> "51/24/1은 정의가 4개라서가 아니라 **엔진이 반쪽**이라서일 수 있다"

**아닙니다.** `/api/pwa/accuracy`는 **200을 정상 반환**합니다. 화면별 숫자가 다른 것은
404 폴백이 아니라 **화면마다 다른 필드·기간·모수를 쓰기 때문**입니다.

→ **S17 Part 1(용어 사전 · 정의 통일)은 그대로 진행해도 됩니다.** 재작성 불필요.
   (지시서 W3-12의 "H-G 확정 → S17 Part 1 재작성" 분기는 **해당 없음**)

`0:0`, `1/30` 같은 값도 404가 아니라 **실제로 데이터가 없어서**입니다 —
`trades`는 6/30 이후 매수 0건이고 `block_accuracy`는 6/17 이후 기록이 중단됐습니다.
**숫자는 정직했고, 엔진이 반쪽이었던 게 아닙니다.**

---

## 계약표 (① 프론트 → ② Next → ③ 엔진)

| 화면 | ① 프론트 호출 | ② Next 라우트 | ③ 엔진 경로 | 상태 |
|---|---|---|---|---|
| 오늘 / 추천 / 대시보드 | `/api/pwa-dashboard` | `pages/api/pwa-dashboard.js` | `5001 /api/pwa/dashboard` | ✅ 200 |
| 자기검증(정확도) | `/api/pwa/accuracy` | `pages/api/pwa/accuracy.js` | `5001 /api/pwa/accuracy` | ✅ 200 |
| 결정 대기 | `/api/pwa-pending` | `pages/api/pwa-pending.js` | `5001 /api/pwa/pending` | ✅ 200 |
| 승인 | `/api/approve-pending` | `pages/api/approve-pending.js` | `5001 /api/pwa/approve-pending` | ✅ 200 |
| 예약 | — | `pages/api/queue-pending.js` | `5001 /api/pwa/queue-pending` | ✅ 200 |
| 종목 분석 | `/api/analyze-stock` | `pages/api/analyze-stock.js` | `5001 /api/analyze/<code>` | ✅ 200 |
| 이력 | `/api/pwa-history` | `pages/api/pwa-history.js` | `5001 /api/pwa/history` | ✅ 200 |
| 과열도 이력 | `/api/pwa-heat-history` | `pages/api/pwa-heat-history.js` | `5001 /api/pwa/heat-history` | ✅ 200 |
| 엔진 상태 | `/api/pwa-engine-status` | `pages/api/pwa-engine-status.js` | `5001 /api/pwa/engine-status/<trader>` | ✅ 200 |
| 관심종목 | `/api/pwa-watchlist` | `pages/api/pwa-watchlist.js` | `5001 /api/pwa/watchlist` | ✅ 200 |
| 리플레이 | `/api/pwa-ai-replay` | `pages/api/pwa-ai-replay.js` | `5001 /api/pwa/ai-replay/<trader>` | ✅ 200 |
| 푸시 | `/api/push-*` | `pages/api/push-*.js` | `5001 /api/push/*` | ✅ 200 |
| 알림 | `/api/notifications` | `pages/api/notifications.js` | `5001 /api/notifications` | ✅ 200 |
| **종합자산** | `getLedger()` | `pages/api/assets/total.js` | `5001 /api/assets/total` | ❌ **404 — 미구현** |
| ↳ 우회(실사용) | `getLedger()` 2차 | `pages/api/realestate/v2/[...].js` | `5002 /api/realestate/v2/total-asset` | ✅ 200 (`stock_uk`·`etf_uk` 제공) |
| **버전** | `EngineVersionBanner` | `pages/api/version.js` **(신설)** | `5001 /api/version` **(신설)** | ✅ 200 |
| ETF | `/api/pwa/etf/*` | `pages/api/pwa/etf/[fn].js` | `5003` | ✅ 200 |
| 부동산 | `/api/pwa/re/feed`, `/api/realestate/v2/alerts` | `pages/api/realestate/*` | `5002` | ✅ 200 |
| 환율 | `/api/fx/usdkrw` | `pages/api/fx/usdkrw.js` | 외부 | ✅ 200 |

---

## `/api/version` 계약 (신설)

```
GET /api/version   (인증 불필요 — 버전은 숨길 값이 아니라 드러낼 값)
```
```json
{
  "app_version": "v10.0.0-ops",
  "api_contract": "2026-07",
  "endpoints": ["/api/analyze/<code>", "/api/engine-status", "..."],
  "trader_split": true,
  "started_at": "2026-07-17T14:5x:xx+09:00"
}
```

- `endpoints`는 Flask `url_map`에서 **자동 생성**됩니다 — 손으로 관리하지 않으므로 실물과 어긋날 수 없습니다.
- PWA는 부팅 시 1회 호출해 `api_contract`를 `EXPECTED_CONTRACT`(`components/EngineVersionBanner.js`)와 대조합니다.
- **불일치 → 전 PWA 화면 상단 배너 + 콘솔 경고.** 정상이면 아무것도 그리지 않습니다.

### 계약 버전을 올리는 규칙

`api_contract`는 **깨는 변경(breaking change)에만** 올립니다.
엔드포인트 **추가**는 올리지 않습니다(하위 호환).
올릴 때는 **엔진 `API_CONTRACT`와 프론트 `EXPECTED_CONTRACT`를 같은 커밋에서** 바꿉니다.

---

## W3-3 `?? 0` 폴백: 전면 제거하지 않았습니다

지시서는 `?? 0` / `|| 0` **전면 제거**를 지시하지만, 실측 결과 **207건 중 API 응답에 직접
붙은 것은 0건**이었습니다. 대부분은 정당한 사용입니다.

```js
(a.accuracy_pct ?? 0) - (b.accuracy_pct ?? 0)   // 정렬 비교
(dash?.recommend_stocks ?? [])                  // 배열 기본값
(mom ?? 0) * 0.5                                // 산술
```

**무차별 제거하면 정렬·계산이 전부 `NaN`으로 깨집니다.** 지시서의 의도("404를 0으로 그리지 말 것")는
이미 다른 방식으로 충족돼 있습니다:

| 장치 | 역할 |
|---|---|
| `components/DataState.js` | `status='error'` → 값 대신 재시도 UI |
| `lib/ledger.js` | 실패 시 `null` 유지(`?? null`), 절대 0으로 만들지 않음 |
| `BACKEND_UNAVAILABLE` 경고 | 총자산을 말하는 3곳 전부에서 "실제보다 적습니다" 고지 |
| `AssetSummaryBar` | 실패 시 `—` (0 아님) |
| `pages/api/version.js` | 실패 시 `{ok:false}` — 빈 버전으로 위장하지 않음 |

**규칙은 유지합니다**: 새 코드에서 **API 응답에 `?? 0`을 붙이지 않는다.**
기존 산술·정렬용 `?? 0`은 그대로 둡니다.

---

## W3-5 승인/거절 창구: 이미 단일화되어 있습니다

지시서는 `POST /api/decision` **신설**을 지시하지만, **만들면 오히려 3벌이 됩니다.**

현재 구조 — 창구는 둘, 로직은 하나:

```
텔레그램 /buy·/skip ─┐
                     ├─▶ pending_signals.status ─▶ main.py _sync_pwa_approvals ─▶ 집행
PWA 승인/거절 버튼 ──┘        (단일 상태 기계)
   └ /api/approve-pending → 5001 /api/pwa/approve-pending → mark_pending_status()
```

두 창구 모두 **같은 DB 상태 기계**(`pending_signals.status`)를 통과하고, 집행은
`_sync_pwa_approvals` **한 곳**에서만 일어납니다. 지시서가 우려한 "로직 두 벌"은 없습니다.

새 `/api/decision`을 만들면 기존 `/api/pwa/approve-pending`·`/api/pwa/skip-pending`과 **공존**하게 되어
**지시서가 막으려던 바로 그 상태**가 됩니다. → **신설하지 않음.**

다만 `source: "telegram" | "pwa"` 기록은 **현재 없습니다** — 어느 창구로 들어왔는지 구분되지 않습니다.
S17 백로그로 넘깁니다(우선순위 낮음: 집행 경로가 하나라 사고 위험은 없음).

---

## 자산 용어 정의 (S37-3 · J4)

세 용어는 **서로 다른 숫자**입니다. 화면·문서에서 혼용하지 마십시오.

| 용어 | 정의 | 구현 |
|---|---|---|
| **총자산** | 주식 + ETF + 부동산 + 현금 | `lib/ledger.js` `total_uk` |
| **운용자산** | 총자산 − 실거주 부동산(못 파는 자산) | `lib/ledger.js` `operating_uk` |
| **순자산** | 총자산 − 부채 | ★**현재 미구현.** 부채 통합 전이라 계산하지 않는다 |

**규칙**
- 화면 어디에도 **"순자산"이라는 말을 쓰지 않는다** — 지금 계산은 순자산이 아니다(부채 미반영). (확인: `pages`·`components`에 "순자산" 표기 0건.)
- **반올림**: `lib/ledger.js:23` `round2`가 자산군(주식·ETF·부동산·현금)을 **각각 억 단위 소수 둘째 자리(0.01억=100만원)에서 반올림**한 뒤 더한다. 자산군별 반올림 오차가 총액에 미세하게 쌓일 수 있다. 이 사실을 `/pwa/assets` 총자산 옆에 "억 단위 표시 · 자산군별 반올림"으로 고지한다.
- **원 단위 원장 전환**(중간 반올림 제거)은 회귀 위험이 커 이번 범위 밖 — 정의 명시만 먼저 한다.
- 전세·월세 **보증금**은 부채성 항목이라 부동산 평가액에서 차감한다(`ledger.js` `onehub_re_properties`의 `deposit`). 이는 "순자산"이 아니라 총자산 내 부동산 값 보정이다.

---

## AI 진단 데이터 상태 계약 (2026-09-26 · `lib/aiAssets.js` `computeSummary`)

AI 유동자산 진단(`/pwa/ai-advisor`)은 **예시 데이터를 계산에 넣지 않고, 축별로 측정 상태를 구분**한다.

- **equityMeta**(입력): `region`, `region_status`(`complete`|`partial`|`unmeasured`), `region_basis`, `region_dropped`, `sectors`, `sector_status`(`complete`|`unmeasured`), `sector_note`. ★지역은 보유 종목 `market/ccy` 로컬 실계산(**평단×수량 기준**, 라이브 시세 아님); 환율 없는 USD 보유는 제외하고 `region_dropped>0` → `partial`. ★섹터는 백엔드 테마 분류 미연결이라 현재 항상 `unmeasured`(예시 섹터 계산 투입 금지).
- **점수 규칙**: 배분 적합도(`subscores.allocation`)는 equity/cash 로 항상 계산. **분산도(`subscores.diversification`)와 종합 유동점수(`liquid_score`)는 지역·섹터가 '모두 complete'일 때만 산출**하고, 아니면 `null`(미측정) — 데이터 부재를 100점/‘균형 양호’로 표현하지 않는다.
- **경고·리밸런싱**: `region_concentration`(국내 100%)·해외 스왑액은 `region_status==='complete'`일 때만, 테마 상한 경고·희석액은 `sector_status==='complete'`일 때만 생성. 부분/미측정 축으로 확정 경고·금액을 만들지 않는다.
- **실패 상태**: 원장 실패(`getLedger` 반환 없음/`ok=false`) → `ledgerFailed` 전달 → `data_ok=false`·`measurable=false`. 0원 정상 자산·정상 진단을 만들지 않는다. `equity_measured=false`(주식형 0)면 ‘분산 평가 대상 없음’으로 구분.
- 소비자: `pages/pwa/ai-advisor.js` 단일. 검증: `node scripts/aiAdvisor.dataquality.test.mjs`.

---

## 패키지 C — 평가·계정·동기화 (2026-09-26 검증·설계)

> 범위: **계약 정의 + 재현 검증 + 점진 설계**. 저장소 전체 교체·사용자 데이터 일괄 변경·운영 배포는 하지 않는다.

### C-1 · ETF 평가 상태 계약 (`lib/etfLive.js` 반환) — 구현됨
`{ krw, live, source, partial, fully_evaluated, missing[], excluded[], suspect[] }`.
- `source`: **`live`**(실측 종가 합산) / **`backend_summary`**(실측 하나도 못 얻어 백엔드 요약 폴백·라이브 아님) / **`none`**.
- `missing`: 시세 못 받음 또는 환율 없어 환산 불가. `excluded`: 평단 10배 이상 어긋남(S22-1). `suspect`: 직전 정상가 대비 급변(S24-3). — **서로 다른 사유이며 각각 배열로 구분**.
- `partial`: **`missing`만** 반영(`missing.length>0`). ★**`partial=false` 를 '모든 보유 평가 완료'와 동일시하지 말 것** — excluded/suspect 가 남아 있어도 partial=false 다.
- **`fully_evaluated`**: 모든 보유가 신뢰값으로 합산됐는가 = `missing·excluded·suspect 전부 비었고 live`. '전부 평가됐나'는 이 값으로 판정한다. 검증: `node scripts/etfLive.state.test.mjs`(로직) — partial=false·excluded 있음 → fully_evaluated=false 확인.

### C-2 · 화면 간 합계 일치 — ★서버 확인 후 수정 완료(현금/예수금 이중계상 제거)
자산군(주식·ETF·부동산)은 모든 화면이 `lib/ledger.js` `getLedger().breakdown` 단일 소스를 읽어 일치. 현금(KIS 예수금) 기준만 갈렸던 것을 **서버 정의 확인 후 통일**.
- **서버 확인(읽기 전용)**: `auto_trade/main.py` — `total_asset = int(out2.get("tot_evlu_amt", 0))`(주석: `tot_evlu_amt = prvs_rcdl_excc_amt + scts_evlu_amt`), `balance.cash = dnca_tot_amt`. 즉 **KIS 예수금(dnca)은 `tot_evlu_amt`(=총평가금액)에 이미 포함**. 프록시 `/api/realestate/v2/total-asset` 가 `stock_uk = total_asset/1e8` 로 매핑하므로 **`ledger.total_uk` 는 예수금을 이미 1회 포함**한다.
- **결론**: 홈(`index.js`)·AI(`ai-advisor.js`)가 `ledger.total_uk` 에 `dash.balance.cash`(예수금)를 **또 더한 것이 이중계상**. 자산(`assets.js`)·오늘(`today.js`)이 `ledger.total_uk`만 쓴 것이 옳음.
- **수정(2026-09-26)**: 홈 2블록(히어로·자산 구성)·AI `buildAssets` 에서 예수금 가산 제거 → 네 화면 모두 총자산 = `ledger.total_uk` 단일 소스. 자산 구성 아코디언의 '현금' 행은 `breakdown.cash_uk`(온보딩 현금)만 표시(예수금은 '주식' 행=KIS 총액 안에 있으므로 현금 행에 중복 표시 안 함).
- **영향**: KIS 예수금이 있던 사용자는 홈/AI 총자산이 예수금만큼 **감소**(이중계상 교정, KIS 앱 tot_evlu_amt 기준과 일치). 자산 곡선 스냅샷이 옛 값으로 저장돼 있으면 교정 시점에 1회 하향 계단이 생길 수 있음(정상). 예수금 0/미연동 사용자는 무변화.
- 권고(후속): 백엔드가 예수금을 `cash` 축으로 분리 노출(`scts_evlu_amt` 별도 필드)하면 '주식' 행에서 예수금을 빼고 '현금' 행으로 정확히 옮길 수 있음(현재는 프론트에서 분리 불가라 KIS 총액을 주식 행에 유지).

### C-3 · 계정 전환 경쟁 상태 — 부분 조치, 나머지 미재현
- **조치됨(CD)**: `session.js clearApiCaches()` 가 전환/로그아웃 시 SW `onehub-*-api` 캐시 삭제 → 이전 사용자 GET 응답이 다음 사용자에게 남는 경로 차단. 또 middleware 가 세션 tenant 로 `trader` 를 강제 덮어써(클라 trader 무시) 네트워크 응답 자체는 항상 현재 세션 데이터.
- **미재현(환경 제약)**: A 로그인 중 시작된 느린 요청이 B 로그인 직후 도착해 캐시에 적히는 초경합, 오프라인 재진입, 초기 동기화 경쟁은 **2계정×배포 PWA×SW 가 필요해 이 환경에서 재현 불가**. ★재현 없이 개인정보 노출이 있다고 단정하지 않는다 — C 후속에서 실제 재현 테스트로 확인. (완화 아이디어: clearApiCaches 를 reload 이전에 await 완료 후, 진행 중 fetch 취소.)

### C-4 · 기기 동기화 손실 — ★재현됨 + 점진 설계
현재 `syncManager.js` 는 **키 통값 + 단일 전역 `updatedAt` + LWW**. 재현(`node --import ./scripts/extless-loader.mjs scripts/syncMerge.loss.test.mjs`, 실제 `mergePayloads`):
- **손실1**: 두 기기가 같은 키(예: `onehub_stock_holdings`)에 서로 다른 종목을 각각 추가 → 통값 LWW 로 한쪽 레코드 통째 소실.
- **손실2**: 한 기기의 삭제가 tombstone 이 없어, 다른 기기(삭제 대상이 아직 있는·더 최근) 값이 이기면 **되살아남**.
- (대조) 서로 다른 키는 union 으로 보존 — 이 경우엔 정확.

**점진 설계(단번 교체 금지)**:
1. **1단계(범위 좁게)**: 배열형 고위험 키만(`onehub_stock_holdings`·`onehub_etf_holdings`·`onehub_etf_other`·`onehub_re_properties`) 레코드 단위 병합으로 전환. 스칼라 키는 기존 통값 LWW 유지.
2. **레코드 계약**: 각 레코드에 `id`(이미 대부분 있음)·`updatedAt`·`deletedAt`(tombstone) 부여. 병합 = id 기준 union, 같은 id 는 `updatedAt` 큰 쪽, `deletedAt` 있으면 삭제 우선(일정 보존기간 후 청소).
3. **마이그레이션**: 기존 레코드에 `id`/`updatedAt` 없으면 로드시 부여(값 보존, 분할·추정 금지). 서버 payload 는 그대로 두고 클라 병합만 교체.
4. **검증**: 위 재현 테스트가 '소실 0·삭제 유지'로 바뀌는지로 통과 판정.
※ 실제 구현은 별도 작업(사용자 데이터 안전 때문에 dry-run·구/신 비교 후 전환).

### C-5 · 과거 증권사 병합 데이터
CC(S37-4)에서 병합 키에 broker·code 를 넣되 **기존 합쳐진 레코드는 쪼개지 않았다**(원본 근거 없이 추정 분할 금지). 이 원칙 유지 — 복원은 원본 입력 근거가 있을 때만.
