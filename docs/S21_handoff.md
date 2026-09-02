# S21 작업지시서 — 2차 점검 후속

> 작성 2026-09-01 · 근거: 실서비스 실측(로그인 상태, 배포 `9e354cb`·`24dd37e`·`67550f5`)
> 이어받는 곳: **Claude Code (general coding session)** — 커밋·푸시까지 직접 수행.
> 2차 점검 전문: 아티팩트 "ONE·HUB PWA 2차 점검"

---

## 0. 먼저 할 일

```bash
git pull --rebase
bash scripts/verify_s19.sh   # FAIL=0 이어야 출발 가능
```

---

## 1. 우선순위

| ID | 제목 | 왜 | 범위 |
|---|---|---|---|
| **S21-1** | 부동산 브리핑을 첫 화면에서 분리 | 오늘 탭 5.67초의 **88%가 이 요청 하나** | 프론트(+선택적 백엔드) |
| **S21-2** | ETF "보유 없어" 오문구 | 8.51억 보유자에게 없다고 말함 | 프론트 1줄 분기 |
| **S21-3** | 오늘 탭 제목 "오늘의 대결" | 대결 카드는 뺐는데 제목이 남음 | 프론트 1줄 |
| **S21-4** | 종목 마스터 한글명 | 프론트로는 해결 불가 확정 | **백엔드** |
| **S21-5** | 남은 중복 호출 | 같은 URL 2~3회 | 프론트 |
| **S21-6** | 캐시 레이스 | 입력 직후 30초 옛 값 | 프론트 |
| **S21-7** | 배치 부분 실패 무시 | 시세 빠진 채 5분 고정 | 프론트+API |

S21-1·2·3은 합쳐서 1시간 안쪽이고 체감이 가장 크게 달라집니다. 먼저 하세요.

---

## 2. S21-1 · 부동산 브리핑 분리 — P0

### 증거 (2026-09-01 06:2x KST 실측)

```
/pwa/today   API 26회 · 화면 완성 5,674ms
             그중 /api/pwa/re/briefing 단독 4,987ms  ← 전체의 88%
/pwa (AI)    API 35회 · 화면 완성 3,237ms  (브리핑 미호출)
```

나머지 25개 요청을 전부 없애도 5초는 그대로입니다. **이 하나가 바닥을 결정합니다.**

### 현재

`pages/pwa/today.js` 마운트 직후 `fetch('/api/pwa/re/briefing?region=...')`. 상단 3행 요약(총자산·오늘 조치·AI 변화)은 이 값을 쓰지 않는데도 함께 기다립니다.

### 작업 — A 먼저, B는 여유 될 때

**A. 지연 로드 (프론트만, 즉효)**

- 부동산 관련 섹션이 **뷰포트에 들어올 때** 호출한다. `IntersectionObserver` 로 해당 섹션 ref 를 관찰, 최초 교차 시 1회 fetch.
- 로드 전에는 그 섹션만 스켈레톤. **상단 3행은 영향받지 않아야 한다**(브리핑 없이도 완성되어야 함).
- 브리핑 값을 쓰는 곳(`reHeadline`, `myLeaderGapPct`, `reBrief.leader` 등)이 `null` 인 상태를 견디는지 확인. 지금도 `?.` 로 방어돼 있으면 그대로 두고, 아니면 방어 추가.
- `/api/pwa/re/complexAreas` 도 같은 섹션에서만 쓰이면 함께 지연.

**B. 서버 사전 생성 (근본)**

- :5002 가 지역별 브리핑을 미리 만들어 두고 응답은 읽기만. 5초가 나오는 건 요청 시점에 계산하기 때문일 가능성이 높다 — 먼저 백엔드에서 무엇이 5초를 쓰는지 확인할 것.
- 백엔드 수정은 CLAUDE.md 절차(백업 → 문법검사 → 재시작 → 회귀확인).

### 합격선

- `/pwa/today` **화면 완성 2.5초 이하**, API 호출 30회 이하 유지
- 상단 3행이 브리핑 응답 전에 이미 완성되어 보일 것
- 부동산 섹션까지 스크롤하면 정상 표시

### 측정 (배포 착륙 후, 로그인 상태 콘솔)

```js
const es = performance.getEntriesByType('resource').filter(e => e.name.includes('/api/'));
console.log('calls', es.length, 'lastEnd', Math.round(Math.max(...es.map(e => e.responseEnd))));
console.table([...es].sort((a,b)=>b.duration-a.duration).slice(0,5)
  .map(e => ({ u: e.name.replace(location.origin,'').slice(0,50), ms: Math.round(e.duration) })));
```

---

## 3. S21-2 · ETF "보유 ETF가 없어" 오문구 — P0

### 증거

이 계정은 ETF **7종목 · 8.51억** 보유(`onehub_etf_holdings` 배열 7건, 자산 지도에도 8.51억 표시). 그런데 오늘 탭 ETF 행:

> 보유 ETF가 없어 시작 후보로 국내 대표지수 ETF를 제안합니다 — 저비용·분산의 기본 축입니다.

### 원인

`lib/etfRecommend.js:104` — 추천이 하나도 안 나왔을 때(`if (!recs.length)`) 쓰는 폴백 문구가 **"보유 ETF가 없어"** 를 주장한다. 조건은 *추천 없음*인데 문장은 *보유 없음*을 말한다. `pages/pwa/today.js` 는 `recs[0].reasonRule` 을 그대로 노출하므로 그 문장이 그대로 화면에 나온다.

### 작업

`lib/etfRecommend.js` 폴백을 **보유 건수로 분기**한다.

- `holdings.length === 0` → 지금 문구 유지(맞는 말이다)
- `holdings.length > 0` → 사실에 맞는 문장으로. 예: "지금 배분에서 뚜렷한 조정 후보가 없습니다 — 목표 배분을 정하면 더 구체적으로 제안합니다."

`today.js` 는 손대지 않아도 된다(문구만 고치면 자동 반영). 다만 ETF 페이지(`pages/pwa/etf.js`)에서도 같은 폴백을 쓰는지 확인하고, 쓰면 함께 검증할 것.

### 합격선

ETF 보유가 있는 계정 화면에서 `"보유 ETF가 없어"` 문자열 **0건**. 보유 0인 상태에서는 여전히 그 문구가 나올 것.

---

## 4. S21-3 · 오늘 탭 제목 — P1

### 증거

오늘 탭에서 대결 카드는 제거됐는데(S20-3) 페이지 제목이 여전히 **"오늘의 대결"**. 첫 화면 내용(총자산·오늘 조치·AI 변화)과 맞지 않는다.

### 원인

`pages/pwa/today.js` 의 `RotatingPageTitle` items 첫 항목이 `{ suffix: "의 대결" }`.

### 작업

`items` 를 `[{suffix:"의 자산"}, {suffix:"의 부동산"}, {suffix:"의 ETF"}, {suffix:"의 이야기"}]` 로. "종목변경" 버튼의 순환 동작과 나머지 항목은 그대로 유지.

---

## 5. S21-4 · 종목 마스터 한글명 — P1 · **백엔드**

### 증거 — 프론트로는 못 고친다

```
GET /api/stocks-search?q=006400  → { code:"006400", name:"SamsungSDI" }
GET /api/stocks-search?q=051910  → { code:"051910", name:"LGChem" }
GET /api/stocks-search?q=105560  → { code:"105560", name:"KBFinance" }
GET /api/stocks-search?q=009150  → { code:"009150", name:"SamsungEM" }
```

S20-2 의 프론트 매핑은 **정상 동작한다**. 문제는 물어볼 곳에 한글이 없다는 것이다. 한글이 나오는 유일한 경로는 증권사 연동 보유 종목(KIS 가 한글로 준다)이라, **내가 보유하지 않은 종목은 프론트에서 방법이 없다.**

잔존 확인: 추천 목록 `SamsungEM · SamsungSDI · LGChem · KBFinance · Shinhan`, 판단 기록 `BiznModel · LGEnergy`.

### 작업

백엔드 종목 마스터에 **한글 종목명**을 채운다(KRX 상장종목 마스터 기준). `/api/stocks-search` 의 `name` 이 한글을 반환하면 끝이다.

**프론트는 추가 작업이 필요 없다** — S20-2 매핑이 자동으로 한글을 집는다. 프론트를 더 손대는 것은 낭비이니 하지 말 것.

### 합격선

추천 목록·판단 기록에 **국내 종목의 영문명 0건**(실제 해외 상장 종목은 영문 유지가 정상).

---

## 6. S21-5 · 남은 중복 호출 — P2

### 증거

```
오늘 탭   /api/pwa-dashboard  2회
          /api/today/news     2회
          /api/version        2회
AI 탭     /api/index/history  3회   ← 같은 URL(코스피 시계열)
          /api/pwa-dashboard  2회
```

캐시(`lib/quoteCache.js`)를 거치지 않는 직접 `fetch` 들이다.

### 작업

해당 호출들을 `cachedJson` 경유로 바꾼다. `index/history` 3회는 URL 이 완전히 같으므로 캐시만으로 1회가 된다. `/api/version` 은 배너 컴포넌트가 따로 부르는지 확인.

### 합격선

두 화면 모두 API 호출 **30회 이하** + 동일 URL 중복 **0건**.

---

## 7. S21-6 · 캐시 레이스 — P2

### 문제

`lib/quoteCache.js` 의 `clearQuoteCache()` 는 `_cache` 와 `_inflight` 를 비운다. 그런데 **비우는 시점에 이미 날아간 요청**은 그대로 진행되고, 완료되면 `_cache.set(url, ...)` 으로 **옛 값을 다시 넣는다.** 보유를 입력·삭제한 직후 30초 동안 반영 안 된 숫자가 보일 수 있다. 하필 사용자가 가장 민감한 순간이다.

### 작업

세대 카운터를 둔다.

```js
let _gen = 0;
export function clearQuoteCache() { _gen++; _cache.clear(); _inflight.clear(); }
// cachedJson 안에서
const myGen = _gen;
// ... 응답 후
if (j != null && myGen === _gen) _cache.set(url, { ts: Date.now(), data: j });
```

### 합격선

보유 입력 직후 총자산·평가액이 즉시 갱신된다(30초 지연 없음).

---

## 8. S21-7 · 배치 부분 실패 무시 — P2

### 문제

`pages/api/etf/quote.js` 배치는 일부 티커를 못 가져와도 `ok: true` 로 응답한다. 클라(`lib/stockLive.js`·`lib/etfLive.js`)는 `!d?.ok` 일 때만 개별 폴백하므로, **실패한 종목만 조용히 시세 없이 넘어간다.** 게다가 응답에 `s-maxage=300` 이 붙어 5분간 그 상태로 캐시된다. 평가액이 조금 낮게 나오는 형태라 눈에 잘 안 띈다.

### 작업

- 배치 응답에 `missing: [티커…]` 를 실어 보낸다.
- 클라가 `missing` 만 개별 재조회한다(전체 폴백이 아니라 실패분만).
- `missing.length > 0` 이면 `Cache-Control` 을 짧게(예: `s-maxage=30`) — 실패 상태를 5분간 굳히지 않는다.

### 합격선

일부러 잘못된 티커를 섞어도 나머지 종목 시세가 정상이고, 실패 종목은 재조회로 채워지거나 화면에 "시세 없음"이 명시된다.

---

## 9. 공통 규칙 · 함정

1. **줄바꿈** — 저장소 전체가 CRLF. `.gitattributes` 에는 `*.sh text eol=lf` 만 있다. `.js` 편집 시 줄바꿈을 바꾸지 말 것(바꾸면 236개 파일이 통째로 변경된 것처럼 잡힌다).
2. **빌드는 반드시 webpack** — `package.json` 의 `"build": "next build --webpack"` 유지. Turbopack 프로덕션 빌드는 하이드레이션이 깨져 PWA 전체가 무반응이 된다.
3. **총자산 덧셈은 `lib/ledger.js` 안 한 곳뿐.** 새 localStorage 키를 만들지 않는다.
4. **동시 작업** — 다른 세션이 ETF 화면을 작업할 수 있다. 시작 전 `git pull --rebase`.
5. **UI 중복 정의 금지** — 보유 카드 판정 규칙은 `components/shared/KisHoldingsCard.js` 에만. 복제하지 말고 import.
6. **바꾸면 안 되는 설계 전제 2건**
   - AI 대결은 **실보유(KIS) 기준이 정상**. KIS 계좌가 없을 때만 1,000만원 가상 시드.
   - **실거주 부동산은 투자자산에서 제외가 정상.** 총자산에 별도 표기하고 운용자산 분모에서 뺀다.

---

## 10. 완료 처리

```bash
bash scripts/verify_s19.sh   # FAIL=0
npm run build                # webpack 통과
git add -A && git commit -F - <<'MSG'
...
MSG
git push origin main
```

- 커밋 메시지는 Git Bash 히어독(`git commit -F -` + `<<'MSG'`). PowerShell 식 `@'…'@` 금지.
- push 실패 시 `git pull --rebase` 후 재시도.
- **배포 착륙을 확인한 뒤 측정할 것.** `git push` 직후 바로 재면 옛 빌드가 잡힌다.
- 각 항목 완료 후 `docs/S21-n_결과.md` 에 **합격선과 1:1 대조 가능하게** 정리. 특히 S21-1 은 측정 전후 수치를 반드시 기록.
- **PWA 는 카카오 로그인 게이트 뒤라 최종 렌더는 사용자 확인이 필요하다.** 추측으로 UI 를 반복 수정하지 말 것.
