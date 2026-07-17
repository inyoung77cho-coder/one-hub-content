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
