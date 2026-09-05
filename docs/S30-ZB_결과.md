# S30-ZB 결과 — ETF도 판단 대상에 · 관망을 공정하게 채점

> 2026-09-05 · 선행 S30-ZA(`c28c837`) · 6인 재검증에서 나온 둘.

## 계측(불변)
S26 5숫자 불변. 성능: 마운트 API index 22 · **today 15(불변)** · english 9 · etf 9 · next/dynamic 7 · cachedJson 미적용 6 · 최대 4332. verify_s19 FAIL=0. webpack build 통과.

## S30-4 · ETF도 판단 대상에 (실측 PASS)
Node 실측(KODEX200 069500, 현재가 38,000 / 전일 35,000 = +8.57%):
```
etf positions: [{ name:"069500", source:"etf", cur:38000, chg:"8.57", rank:2 }]
원장: 0 → 1
ETF 통합 노출(source=etf): PASS · ETF change_1d·rank2: PASS · ETF 판단 원장+1: PASS
```
- **`getAllEtfPositions(trader)`**(`lib/allHoldings.js`) — ETF 보유(`onehub_etf_holdings`)를 같은 통합 형태로(`ticker→code, shares→qty, avgPrice→avg_price`), **`source:"etf"`**. 시세는 **주식과 같은 `/api/etf/quote` 배치**(S25-8·S27 경로 재사용, 캐시 공유) → `change_1d` 채움.
- **오늘 화면 판단 카드에 ETF 포함** — `etfActionable`(rank 2=당일 급변)이 3버튼 판단 목록에 오름. **배지 `ETF`**(주식 `직접입력` 과 구분).
- **판정 규칙을 ETF에 맞춤** — 손절/목표 대신 **당일 급변(rank 2)** 이 주 신호. **배분 이탈**은 기존 "오늘 조치"의 ETF 리밸런싱 링크(`/pwa/etf?etf=rec`, `recommendEtfs`/`target_class`)로 안내 — 새 per-ticker 규칙을 만들지 않음(중복 금지).
- **판단 문구를 자산군에 맞게** — ETF 는 `[비중 줄임][유지][관망]`, 주식은 `[매도][보유][관망]`. **원장 저장은 동일**(`take`/`pass`) — 라벨만 source 로 분기.
- **부동산은 제외**(종목코드 없음·하루 단위 판단 대상 아님) — 원래 판단 유지.

## S30-5 · 관망을 공정하게 채점 (실측 PASS)
- **`avoidedCount`·`avoidedAvg` 추가**(`getVerdictScorecard` 한 곳) — 관망했는데 **내린** 종목 = 피한 손실. `missed`(놓친 수익)의 정확한 대칭. Node 실측으로 필드 존재 확인.
- **성적표에 놓친 수익 · 피한 손실 나란히**(`record.js`):
  ```
  놓친 수익  N건 · 관망이 그 뒤 올랐습니다
  피한 손실  M건 · 관망이 그 뒤 내렸습니다
  ```
- **승패 문구에 근거 병기** — `AI가 나았습니다`만 반복하지 않고 `· 다만 관망 M건이 평균 −X% 손실을 피했습니다`(관망 손실회피가 있을 때). 위로가 아니라 사실을 다 말하는 것.
- **신중형 배너** — `tendency==="신중형"`(관망 70%+)이면 상단에 `관망 중심 투자자의 성적은 수익률보다 회피율로 보는 편이 맞습니다`.
- **회귀 없음** — `winRate`(pass&&ret<0 정답) 정의·기존 승률·건수 불변(필드 추가만). `myRet` 표시·승패 문구만 보강.

## 합격선 체크
- [x] ETF만 보유한 계정에서 오늘 화면에 ETF 항목이 뜨고 판단 기록(실측 0→1)
- [x] `/pwa/record` 판단 건수 반영 · 주식/ETF 배지 구분(`직접입력`/`ETF`)
- [x] 부동산은 판단 대상에 없음
- [x] 성적표에 놓친 수익·피한 손실 함께 · 관망 계정 승패 문구에 근거 · 기존 값 불변
- [x] verify FAIL=0 · webpack build 통과
- ⚠️ 실기기 육안(성적표 문구·ETF 배지 표시)은 로그인 브라우저 몫.

## 커밋
- `S30 ZB: ETF 판단 대상 편입(배지·비중줄임) + 관망 공정 채점(피한 손실)`
