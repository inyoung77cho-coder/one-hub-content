# S30-ZD 결과 — 계기판과 마감 (이탈 측정 · 운영자 화면 · 회귀/문구/entitlement)

> 2026-09-05 · 선행 S30-ZC(`75cb0b9`) · A를 하기 전에 D를 붙여야 다음 주에 숫자로 확인된다.

## 계측(불변)
S26 5숫자 불변. 성능: 마운트 API index 22 · today 15 · english 9 · etf 9 · next/dynamic 7 · cachedJson 미적용 6 · 최대 4332. verify_s19 FAIL=0. webpack build 통과.

## S30-8 · 단계별 이탈 측정 (`lib/funnel.js` 신규, 실측 PASS)
Node 실측:
```
signup 첫 기록: PASS · signup 재호출 덮어쓰기 안 함: PASS
온보딩 3관문(signup·onboard_done·first_holding): PASS · 판단 시 first_verdict 자동: PASS
```
- **다섯 관문의 '처음 도달 시각'만** 한 번씩(`markFunnel` — 이미 찍힌 건 보존). 이벤트 스트림 아님. `signup·onboard_done·first_holding·first_verdict·d7_return`.
- **저장 `onehub_funnel_A/_B` · `SYNC_KEYS` 등록** → 서버 `user_state` 로 올라가 운영자가 봄. `onehub_visit_days`(빈도)와 안 섞음(다른 질문).
- **개인정보 없음** — 타임스탬프·도달 여부만(종목명·금액 안 담음).
- **배선** — `signup`+`d7_return`: today 첫 로드(`checkD7Return`). `onboard_done`+`first_holding`: 온보딩 finish(입력 시). `first_holding`(KIS 포함): today 통합보유 로드 시. `first_verdict`: `recordDecisionWithPrice`(가장 중요한 관문).

## S30-9 · 운영자 한 화면 (정비소 안, 실측 PASS)
- **가입 깔때기 카드**를 `MaintenanceShop`(S28-7 운영자 게이트 뒤)에 추가. 새 페이지 안 만듦.
- **백엔드 집계** `account_api.py GET /api/v2/funnel-agg` — 모든 `user_state.payload` 에서 `onehub_funnel_*` 를 파싱해 관문별 인원·최대 이탈 구간·마지막 동기화 시각 집계. Vercel 프록시 `/api/pwa/funnel-agg`. :5002 재시작·`curl` 실측(`{"ok":true,"users":0,...}` 구조 확인 — 실사용자 동기화 전이라 0).
- **10명 미만이면 건수만**(S29-9 규칙과 동일 — 백분율 없음). 최대 이탈 `보유 입력 → 첫 판단 (N명 중 M명 이탈)`.
- **운영자 게이트** — MaintenanceShop 은 `lib/isOperator` 뒤에서만 렌더(S28). 프록시는 proposals 와 동일 모델(Vercel 키).
- **동기화 상태 한 줄** — `user_state 마지막 동기화: 3분 전 / ⚠️ N시간째 · 확인 필요`(운영자 관점 O2, 조용히 죽는 문제 노출).

## S30-10 · 약속 문구 일치와 회귀 점검
1. **온보딩 약속** `"3가지만 넣으면 내 자산으로 판단합니다"` 가 **이제 사실** — ZA(직접입력 통합·시세)+ZC(온보딩 첫 판단)로 실제 판단이 일어남.
2. **"증권사 연동" 전제 문구 전수 점검** — 오늘 화면 2곳 교체(ZC). 나머지 잔존은 **전부 정당한 맥락**(KIS 로드 실패·KIS 중복 종목 제외 설명: `assets.js`·`AssetSummaryBar`·`AvgPriceWarningCard`) — 직접입력 사용자에게 틀린 말이 아님.
3. **KIS 회귀** — 통합 함수가 KIS 포지션 필드 그대로 보존, 매도(`/api/pwa/sell`)·손절·AI 대기 흐름 불변. 유일 변경=급변 종목이 판단 목록에 **추가**(제거·변경 아님, 경계 없이 동일). ⚠️ 실기기 KIS 계정 육안(종목 수·매도 버튼)은 사용자 확인 몫.
4. **경계선 판정 지점 하나** — `lib/entitlement.js`(`canUse`) 신설, **지금은 항상 `true`**. 나중에 유료화 시 여기만 고침(`source: kis|manual|etf` 로 분기 가능).
5. **계측기 숫자** — 위 계측 블록에 기록.

## 합격선 체크
- [x] 새 계정 온보딩 완료 시 signup·onboard_done·first_holding 세 개(실측) · 첫 판단 시 first_verdict(실측) · 덮어쓰기 없음(실측) · 서버 user_state 로 올라감(SYNC_KEYS)
- [x] 정비소에서 다섯 관문 인원·최대 이탈 구간 · 일반 사용자에게 안 보임(isOperator) · 10명 미만 건수 · 동기화 실패 노출
- [x] KIS 화면 종전 동일(추가만·제거 없음) · 직접입력 사용자에게 틀린 문구 없음 · entitlement 한 곳·전부 열림
- [x] verify FAIL=0 · webpack build 통과
- ⚠️ 실사용자 퍼널은 신규 클라 배포 후 다음 주부터 채워짐(현재 0) · 실기기 육안은 사용자 몫.

## 커밋
- `S30 ZD: 가입 깔때기(funnel)+운영자 한 화면(:5002 집계)+entitlement+문구/회귀 점검`
