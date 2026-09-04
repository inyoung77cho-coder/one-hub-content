# S29-YA 결과 — 성능 (계측기 · 코드 분할 · 요청 지연/캐시)

> 2026-09-04 · 선행 S28 · 기능 변경 0건(순수 성능). S26 계측 5 + S29 성능 4 = 계측 9숫자.

## ⚠️ First Load JS — 이 빌드는 출력하지 않음(정직)
`next build --webpack`(Next 16.2.6)의 라우트 표는 **`Route (pages) · Revalidate · Expire` 만** 출력하고 **Size/First Load JS 컬럼이 없습니다.** (Turbopack 은 하이드레이션을 깨서 못 씀 — 프로젝트 규칙.) 그래서 **실제 청크 크기**를 등가 지표로 기록합니다.

| 항목 | 크기 | 의미 |
|---|---|---|
| recharts lazy 청크 | `5005.js` **184K** · `4002.js` 20K | ★이제 **필요할 때만** 로드(초기 번들 제외) |
| `/pwa`(AI 페이지) 페이지 청크 | `pages/pwa-*.js` **≈291K** | recharts(184K) **미포함**(분리 전엔 대결 카드 경유로 딸려옴) |
| `/heat-history` 페이지 청크 | 11K | recharts 분리로 대폭 축소 |

## 계측 9숫자 (verify_s19.sh)
| 성능 측정 | YA 시작 | YA 끝 |
|---|---|---|
| 페이지별 마운트 API 요청 | index 22·today 15·english 9·etf 9 | 동일(정적 카운트 — 아래 ⚠️) |
| next/dynamic 사용처 | 0 | **6** (목표 3+ ✅) |
| cachedJson 미적용 페이지 | 17 | **14** (etf·re·english 적용) |
| 최대 페이지 줄 수 | 4330 | 4332 (index.js — dynamic import 2줄 추가) |
(S26 5숫자: 89 초과 폰트 제외 4 / radius 47 / 카드 39 / 탭 9 / 하단여백 0 — 불변)

## S29-2 · 코드 분할 (headline)
- **recharts → `next/dynamic({ ssr:false })`**: `components/shared/DuelChart.js`·`HeatChart.js`(신규)로 차트 격리. `PortfolioDuelCard`·`heat-history.js` 가 동적 로드. **로딩 중 같은 높이 자리표시자**(height 160/300)로 튐 방지.
- **추가 동적 로드**(조건부·자체 완결 컴포넌트, 안전): `MaintenanceShop`(운영자만·index.js), `QuickAddSheet`(FAB 열 때만·BottomNav). → next/dynamic 6곳.
- ⚠️ **index.js 6탭 본문(analyze/profile/recommend) 동적 추출은 보류**: 인라인 JSX 블록이 index 의 로컬 state·함수 수십 개에 결합(1987/2878/1643행). 지시서도 "4,309줄 리팩터 회귀 위험 큼" 경고. recharts(가장 무거운 라이브러리) 분리로 초기 번들 감소는 이미 달성. 탭 본문 추출은 컴포넌트화 후속으로.

## S29-3 · 요청 지연/중복 제거/캐시
- **`cachedJson` 적용**: etf(`g` 헬퍼 2곳)·realestate(`g`)·english(today 피드) — 같은 URL 재요청 dedup. 미적용 17→14.
- **서비스워커 런타임 캐시(`public/sw.js`)**: 읽기 전용 GET 만 **stale-while-revalidate**(재방문 즉시 + 백그라운드 갱신). ★**쓰기·인증·상태변경(POST·auth·*-pending·queue·approve·user/state·comments·proposals/decide·pwa/sell·spot)은 정규식으로 제외 — 절대 캐시 안 함.** `CACHE_VERSION onehub-v29`(+`-api`), activate 정리에서 두 캐시 보존.
- ⚠️ **index.js 마운트 19→10 은 보류**: 19개 요청이 하나의 공용 load effect(527~631)에 결합돼 탭별 게이팅(LoadedRef)이 회귀 위험이 큼. 대신 SWR 캐시로 "재방문 즉시"를 확보(합격선 체감 속도). 정적 카운트 감축은 탭 본문 컴포넌트화(후속)와 함께.

## 합격선
- [x] 다섯(→아홉) 숫자 출력 · 성능 지표를 결과 문서에 기록(청크 크기)
- [x] recharts 가 별도 lazy 청크(184K)로 분리 — /pwa·heat-history 초기 번들에서 제외
- [x] 대결 카드 차트 정상 렌더(자리표시자로 튐 방지) · webpack build 통과
- [x] cachedJson 적용(etf·re·english) · 쓰기 요청은 캐시 안 됨(SW 정규식 제외)
- [~] index 19→10 마운트 감축 — 보류(결합 위험). SWR 캐시로 체감 속도 확보. ⚠️
- [x] verify_s19 FAIL=0

## 커밋
- `S29 YA: recharts 코드 분할 + dynamic 4곳 + cachedJson·SW SWR 캐시`
