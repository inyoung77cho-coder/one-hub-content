# S28-XE 결과 — 다른 엔진과 정보 (부동산·ETF 관측 확장 · 신고가 정기 탐색)

> 2026-09-04 · 선행 S28-XD(`c30e3b7`) · S28 마지막 묶음. 관측만(제안 X) + 신고가(기존 소스만).

## ★ 데이터 현실(정직) — 대부분 '수집 중'
- `avm_results` **0행**(부동산 적정가 오차 원천 비어 있음), `forecast_review` **0행**(ETF 추천 리뷰), `spot_price` **1행**(2026-08-02, 신고가 사실상 없음). `etf_daily` 만 918행(S27).
- 지시서의 프레이밍 그대로: **표본이 찰 때까지 화면은 "수집 중", 신고가 없는 날엔 아무것도 안 뜬다.** XE는 그 **기계장치**(테이블·일일 적립·탐색·게시·푸시)를 만들고 빈 상태를 정직하게 처리한다.

## S28-9 · 부동산 · ETF 관측 확장 (관측만, 제안 X)
- **부동산(`re_engine_obs`, apartment.db)** + `re_obs_snapshot.py` — `avm_results` 의 적정가 vs 실거래 오차(`diff_pct`·`model_mape`) 요약을 매일 적립. 현재 n=0 → `note='수집 중'`.
- **ETF(`etf_engine_obs`, etf.db)** + `etf_obs_snapshot.py` — `etf_daily`(18티커·918일) + `forecast_review`. 추천 이력이 없어(0) `note='수집 중(추천 이력 축적 전)'`.
- **매일 적립**: `version_watch.sh`(기존 일일 크론)에서 두 스냅샷 호출 — **새 크론 안 늘림**. seed 실행 확인(re n=0 / etf 18티커·수집중).
- **정비소 화면**: "다른 엔진 관측 · 수집 중 · 제안 없음" — 부동산/ETF 둘 다 '수집 중'. 표본 미달 동안 정확도 숫자 단정 안 함.
- **제안 생성기는 이 두 엔진에 아직 안 붙였다**(합격선) — 채점 기준부터 정해야 하고, 기준 없이 제안하면 근거 없는 숫자가 나오므로.

## S28-10 · 부동산 신고가 정기 탐색과 게시
- **엔드포인트 `/api/re/new-high`(:5002 re_spot_endpoints)** — `spot_price`(kind='report') 에서 어제 대비 새 신고가. **범용 크롤러 없음 · 기존 소스만.** 검증: `{ok:true, items:[]}`(현재 신고가 없음).
- **게시(화면)**: `components/ReNewHigh.js` — 부동산 화면(`realestate.js`) 최상단. 중요도: **내 단지(`onehub_re_my_property`) 우선 → 없으면 최신 1건**. **하나만** 보여줌(피로 방지). **신고가 없는 날엔 렌더 안 함**(null). Vercel 프록시 `/api/pwa/re/new-high`.
- **푸시(`re_newhigh_push.py`)**: ★**내 단지(중요도1)만, 하루 최대 1건.** 내 단지 = `accounts.db.user_state`(S27 단일화)의 `onehub_re_my_property`. `version_watch.sh` 일일 훅에서 실행(RE venv·ops_log). 검증 `--dry`: "신고가 없음 — 안 보냄". (중요도3 대장은 화면에만; 2 인접 평형은 데이터 생기면 확장.)

## 배포/검증 (서버)
- `re_obs_snapshot.py`(re/scripts)·`etf_obs_snapshot.py`(etf)·`re_newhigh_push.py`(re/scripts)·`re_spot_endpoints.py`(+`/api/re/new-high`)·`version_watch.sh` 배포(백업·py_compile·`onehub-realestate` 재시작 active).
- seed: re_engine_obs·etf_engine_obs 적립 확인. `/api/re/new-high` `items:[]`. 푸시 dry "안 보냄". 관측/신고가 모두 매일 version_watch 훅에서 자동.

## 합격선
- [x] 두 엔진 관측 데이터가 매일 쌓인다(re_engine_obs·etf_engine_obs + 일일 훅)
- [x] 표본 미달 동안 정확도 숫자를 단정적으로 안 보여준다("수집 중")
- [x] 제안 생성기가 이 두 엔진에는 아직 안 붙었다
- [x] 새 크롤러 없다(기존 spot_price 만)
- [x] 하루에 최대 한 건만 푸시(내 단지·1건 cap)
- [x] 신고가 없는 날엔 아무것도 안 뜬다(items:[] → 렌더 null · 푸시 안 함)
- [x] verify_s19 FAIL=0 · webpack build 통과
- ⚠️ 실데이터(avm_results·forecast_review·spot_price) 가 차면 '수집 중'이 실제 숫자·신고가로 바뀜 — 그 전까진 정직히 빈 상태. 실채널 도달·실기기 육안은 사용자 몫.

## 커밋
- (repo) `S28 XE: 부동산·ETF 관측 적립(수집 중) + 신고가 탐색/게시/푸시(내 단지·1건)` · 서버 배포(위)
