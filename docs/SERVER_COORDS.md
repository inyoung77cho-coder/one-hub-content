# ONE-HUB 서버 실측 좌표 (2026-07-17 검증)

> WO2-S12 청크0. **읽기 전용 SSH 실측** 결과. 추측 코딩 금지의 근거 문서.
> ⚠️ WO 문서들의 좌표에 오류가 있어 아래로 확정한다.

## 접속

| 항목 | 실측값 | WO 오기 |
|---|---|---|
| 호스트 | `ubuntu@54.180.54.132` → hostname **`ip-172-26-3-68`** (진짜 프로덕션 Lightsail) | (WO 맞음, 단 "죽은 인스턴스"라던 과거 메모는 폐기) |
| SSH 키 | **`C:\onehub\one-hub-key.pem`** (하이픈 있음) | WO의 `onehub-key.pem`은 오기(파일은 존재하나 미검증) |
| 서비스 | onehub · onehub-b · onehub-api · onehub-realestate · onehub-etf — **5개 전부 active** | — |

## trading.db (주식 엔진 :5001) — `/home/ubuntu/trading.db`

실제 테이블(부분): `trades · cache_balance · screening_candidates · stock_master · block_accuracy · blocked_signals · pending_signals · watchlist · heat_history · strategy_performance · event_log · push_subscriptions …`

**★핵심: `holdings` / `stock_pool` 테이블 없음.**
- KIS 보유 = KIS API 조회(+`cache_balance` 캐시). 서버에 영속 holdings 테이블 없음.
- **직접입력 보유(비KIS)는 서버가 아니라 브라우저 localStorage(`onehub_stock_holdings`, `lib/stockHoldings.js`)에 저장.**
- → 따라서 **B1 "서버 오염 평단 정리"·G4 "서버 포지션 검증 엔드포인트" 전제 성립 안 함.** '1,920,209원' 평단은 서버 DB가 아닌 사용자 브라우저에 있었고, 프론트(원장 정수화 커밋 88f085b/97b330c)에서 이미 처리됨.
- screening 후보 = `screening_candidates`(WO의 `stock_pool` 아님). 차단 검증 = `block_accuracy`.

## apartment.db (부동산 엔진 :5002)

**★실경로: `/home/ubuntu/one-hub/real_estate/data/apartment.db`** (WO의 `real_estate/apartment.db`는 빈 껍데기 — `data/` 하위가 진짜)
API 파일: `/home/ubuntu/one-hub/real_estate/api/` (`re_complex_endpoints.py` 등)

`raw_transactions` 컬럼: `거래일(TEXT 'YYYY-MM-DD') · 단지명 · 동 · 전용면적(REAL) · 거래금액(INTEGER) · 층 · 건축연도 · 법정동 · 거래유형 · 매수자 · 매도자`

기존 테이블: `complex_meta · avm_results · one_score_results · one_score_cache · user_properties · user_sync · listings/listings_v2 · zigbang_listings · macro_monthly · spot_price · asset_allocation_target …` — **`complex_area_master`/`unit_types` 없음(신설 대상)**.

**★시범한신(사용자 지적 "70평 없음") 전용면적별 실거래 건수:**
| 전용㎡ | 실거래 |
|---|---|
| 60 | 103 |
| 85 | 680 |
| 133 | 123 |
| **172 (≈70평)** | **7** |

→ 70평(172㎡)은 **거래 7건**으로 이미 존재하며, 라이브 앱에서 정상 표시됨(2026-07-16 브라우저 확인). **E1의 사용자 케이스는 해결 상태.** 남은 E1(거래 0건 평형)은 K-apt/국토부 단지정보 API가 필요(외부 키 미보유) — 프로덕션 DB 쓰기의 마진 가치 낮음.

## S12 항목별 실측 결론

| 항목 | WO 전제 | 실측 결론 |
|---|---|---|
| G1 totals 서버계산 | 서버가 총액 계산 | ❌ 불가 — 수기·온보딩값이 클라이언트(localStorage). `lib/assetsTotal.js`가 이미 server+client 병합=사실상 단일소스 |
| X2 페이지 fetch 제거 | react-query 훅 | 부분 — 페이지가 각 API 호출하나 총액은 assetsTotal 경유. 대규모 리팩터는 X1(index 분해)와 함께 |
| G4 서버 검증 | POST position 검증 | ❌ 수기보유는 서버 미경유(localStorage) — 서버 엔드포인트 없음. 프론트 validateAsset이 유일 경로 |
| B1 서버 오염정리 | trading.db holdings 수정 | ❌ holdings 테이블 없음 — 프론트 이미 정수화. 서버 작업 없음 |
| E1 평형마스터 | apartment.db 신테이블+K-apt | 🔧 사용자 케이스(70평 7건) 이미 해결. 거래0 평형은 K-apt 키 필요(미보유) |
| E2 병기 | 공급평/전용㎡ | ✅ 프론트 이미 병기(전용172㎡(70평)) |
| E3/E4/F1 | 게이트 | ✅ 완료·라이브 검증(AVM 0·손익 보류·타일) |
| V1 배포검증 | 절차·sw버전 | ✅ 프론트/repo — 수행 가능 |

**결론: S12의 서버 쓰기 작업은 전제 오류이거나 외부 API 키 필요. 유효·안전 부분(V1·좌표문서·게이트검증)만 이행하고, E1 K-apt 적재는 API 키 확보 후 별도.**
