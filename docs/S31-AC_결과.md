# S31-AC 결과 — 첫 현금: 증권 계좌 개설 제휴

> 2026-09-06 · 선행 S31-AB(`e5631fe`) · 구현은 링크 몇 개. 첫 현금이고 서버비를 넘긴다. ★계약 전엔 꺼 둔다.

## 계측(불변)
S26 5숫자 불변. 성능: 마운트 API index 22 · today 15 · english 9 · etf 9 · next/dynamic 8 · cachedJson 미적용 6 · 최대 4332. verify_s19 FAIL=0. webpack build 통과.

## S31-6 · 증권 계좌 개설 제휴
- **`lib/partners.js`(신규) — 데이터로만.** `{ id, name, url, note, active }` 목록(미래에셋·삼성·키움·토스). **전부 `active:false`** → 화면에 아무것도 안 뜸. 계약되면 `url` 채우고 `active:true` 로만 켜면 됨(코드는 자리만).
- **`components/PartnerCard.js`(신규)** — `activePartners()` 가 비면 `return null`(합격선). 활성 시: **순서 무작위**(한 곳 밀지 않음)·**`제휴 링크` 표기**·**`어느 곳을 고르셔도 ONE·HUB 기능은 같습니다`**.
- **놓은 자리 세 곳뿐**(앱이 이미 연동을 권하는 자리):
  1. 온보딩 주식 단계(현금 입력 아래)
  2. 오늘 화면 — **보유 0건(KIS 미연동+직접입력 없음)일 때만**(`positions.length===0`)
  3. 설정 → 연동
  **상단 배너·팝업·전면 광고 없음.** ★**AI 판단·추천 화면 안에는 없음**(수익이 판단에 영향 준다는 오해 차단 — today 판단 카드·record·ai-advisor 어디에도 안 넣음).
- **클릭 측정은 자체 카운터** — `partner_click`(서버 `public_metrics`, `/api/pwa/partner-click` fire-and-forget). **외부 추적 스크립트 없음**(CSP·개인정보·성능). :5002 실측 `partner_click:0` 정상.
- **운영자 화면**(MaintenanceShop): `제휴 클릭 N` 한 줄(funnel-agg.public.partner_click).

## 합격선 체크
- [x] `active:false` 상태에서 화면에 아무것도 안 뜸(activePartners()=[] → null) — 현재 전부 false
- [x] `true`+url 로 바꾸면 세 자리에만 뜸(온보딩·오늘 보유0·설정)
- [x] AI 판단 화면에 없음
- [x] 제휴 표기·"기능은 같습니다" 문구 있음 · 순서 무작위
- [x] 운영자 화면에 클릭 수(제휴 클릭 N)
- [x] verify FAIL=0 · webpack build 통과

## 규제·운영 메모 (0-2)
- ⚠️ **제휴 계약이 없는 상태에서 링크를 붙이지 말 것** — 현재 `active:false` 라 아무 링크도 안 나감(합격선의 산출물). 실제 제휴 코드가 생기면 `partners.js` 값만 바꿔 켠다.
- ⚠️ 제휴처 선정·수익 배분은 사업자 판단. 유료화·제휴 개시 직전 **유사투자자문업 등 규제 전문가 확인 필요**.

## 커밋
- `S31 AC: 증권 계좌 개설 제휴 자리(partners·PartnerCard, active:false) + 클릭 카운터`
