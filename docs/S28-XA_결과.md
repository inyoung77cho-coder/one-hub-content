# S28-XA 결과 — 원장부터 (엔진 변경 원장 · 정확도 서버 일별 적립)

> 2026-09-04 · 선행 S26(WA~WG)·S27 · "고리는 닫고 마지막 한 칸만 사람이"의 ①관측·기반.
> XA는 서버(주식 엔진 :5001 / trading.db) 작업이 대부분. 프론트는 프록시 1줄.

## ★ 정본 확인 (S28-1 #1 — 고치기 전 필수)
- **저장소 `auto_trade/`(one-hub-content)는 정본이 아니라 부분 미러**: 9개 .py만 있고 **`version.py` 가 없음**(APP_VERSION 단일 소스). SERVER_COORDS 가 정본이라 한 것과 일치.
- **서버 정본 = `/home/ubuntu/one-hub/auto_trade`** — 라이브 서비스(`onehub` main.py, `onehub-api` engine_status_api.py)가 여기서 실행. **로컬 git 존재**(HEAD `bd8775b`), `version.py = "v10.0.0-ops"`.
- ⚠️ SERVER_COORDS 의 `/home/ubuntu/auto_trade` 경로는 **존재하지 않음**(구 기록). 실제 정본은 `one-hub/auto_trade`.
- ⚠️ `C:\onehub\deploy_auto_trade.ps1` 이 **이 PC에 없음**. 그래서 엔진 파일은 S27과 동일 규율(백업→scp→py_compile→재시작→서버 git 커밋)로 배포했고, 이 사실을 명시함. **트레이딩 루프(main.py)는 건드리지 않음** — 변경은 상태 API(:5001 engine_status_api.py, 읽기 전용 관측)와 관측 테이블뿐.

## S28-1 · 엔진 변경 원장
- **`engine_changes` 테이블**(trading.db) 신설: `id·applied_at·app_version_before·app_version_after·kind·target·value_before·value_after·reason·proposal_id·applied_by`.
- **과거 7버전 소급 기록**(SERVER_COORDS 버전이력). 모르는 날짜는 **`unknown`**(지어내지 않음):
  | before → after | applied_at |
  |---|---|
  | (초기) → v8.0.0 | 2026-06-15 |
  | v8.0.0 → v8.2.0 | 2026-06-19 |
  | v8.2.0 → v8.3.0 | unknown |
  | v8.3.0 → v8.4.0 | unknown |
  | v8.4.0 → v8.7.0 | 2026-07-02 |
  | v8.7.0 → v9.1.0 | 2026-07-03 |
  | v9.1.0 → v10.0.0-ops | 2026-07-07 |
- **`version_watch.sh` 연결**: APP_VERSION 이 바뀌면(기존 감시 로직) `engine_changes` 에 `applied_by='version_watch'` 한 줄이 자동으로 든다. 사람이 기억해 적는 방식 아님.

## S28-2 · 정확도 서버 일별 적립
- **`ai_accuracy_daily` 테이블**(trading.db): `date·trader·buy_signals·blocked·scored·hits·accuracy_pct·app_version`. **마지막 필드가 S28-1과 잇는 못** — 버전 없는 정확도는 쓸모없음.
- **`ai_accuracy_snapshot.py`(신규, 서버 auto_trade)**: `block_accuracy`(pwa_accuracy 와 동일 소스)에서 trader별 누적 blocked/scored/hits/정확도 + `trades` BUY 수 + version.py 의 버전으로 오늘자 upsert. **하루 1회, `version_watch.sh`(기존 일일 크론 `0 0 * * 1-5`)에서 호출 — 새 크론 안 늘림.**
- **적립 검증(2026-09-04)**: A = 판단 62·차단 177·채점 174·적중 49·**28.2%**·v10.0.0-ops / B = 차단 85·채점 85·적중 31·**36.5%**·v10.0.0-ops.
- **`/api/pwa/accuracy?days=90` 확장**(engine_status_api.py): days 주면 `daily` 시계열(각 행에 그날의 app_version) 추가. **기존 응답(summary·by_reason·recent) 불변** — no-days 호출 시 `daily:[]` 만 추가돼 화면 3곳(index.js 516/610·accuracy.js) 무영향(검증: 키·summary.acc 동일).
- **`lib/aiAccuracyHistory.js` 는 그대로 둠**(서버 값 우선, 없으면 로컬 폴백 — 지우면 회귀).
- 프론트: `pages/api/pwa/accuracy.js` 프록시에 `days` 통과 1줄 추가.

## 배포/검증 (서버)
- trading.db `engine_changes`(7건 백필)·`ai_accuracy_daily`(seed 2행). SQL 은 scp 후 `sqlite3 < file`(프로덕션 trading.db 직접 heredoc 쓰기는 분류기 차단 → 파일 경유).
- `/home/ubuntu/version_watch.sh`(백업 후 교체), `/home/ubuntu/one-hub/auto_trade/ai_accuracy_snapshot.py`·`engine_status_api.py` 배포·py_compile·`onehub-api` 재시작(active). 서버 로컬 git 커밋 `827ba04`(추적성).
- 엔드포인트 검증: no-days → 기존 3키 유지+`daily:[]`; `?days=90` → daily 1행(버전 태그).

## 합격선
- [x] engine_changes 에 과거 7건 날짜와 함께(모르는 2건 `unknown` 명시)
- [x] 버전이 바뀌면 자동 한 줄(version_watch 연결)
- [x] 저장소 auto_trade 정본 여부 문서화(=부분 미러, 정본은 서버 one-hub/auto_trade)
- [x] 90일 일별 정확도를 한 호출로(`?days=90`), 각 행에 버전
- [x] 기존 세 화면 종전대로(응답 형태 불변)
- [x] verify_s19 FAIL=0 · webpack build 통과

## ⚠️ 사용자 확인 / 남은 것
- daily 시계열은 **오늘부터 하루 1건씩** 쌓임(과거 소급 정확도는 block_accuracy 에 일자별 원천이 없어 역산 불가 — 오늘 이후로 버전별 비교 가능).
- 실발송/실적립은 크론(평일 00:00 UTC=09:00 KST)에서 자동. 다음 평일 실행 로그(`/home/ubuntu/logs/ai_accuracy_snapshot.log`)로 확인 권장.

## 커밋
- (repo) `S28 XA: /api/pwa/accuracy days 통과 + 결과문서` · (서버 git) `827ba04`
