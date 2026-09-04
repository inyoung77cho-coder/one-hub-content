# S28-XB 결과 — 발굴 (규칙별 성적표 · 제안 생성기)

> 2026-09-04 · 선행 S28-XA(`a850594`) · "표본 정직이 생명". 서버(proposer)+프론트(성적표).

## ★ 핵심 발견 (S28-3 #2 검증) — 사유는 가중치 규칙과 1:1 대응하지 않는다
- 실측 `block_reason` 값 = **"ML_SELL"·"ML_STRONG_SELL"·"종합 점수 미달…"·"기술적 점수 부족…"·"손익비 부족"·"LOW_MACRO_SCORE"** (차단/거부 사유).
- `stock_screener.py`(242~267)의 가중치 규칙 = **RSI/거래량비/MA/등락 점수 기여분**. → **둘은 다른 축**이라 `by_reason` 정확도로 특정 가중치의 성적을 말할 수 없다.
- 그래서 성적표는 **사유를 카테고리로 묶어 '차단 판단의 정확도'만** 정직하게 보여준다(가중치 규칙 성적표는 per-rule 귀속이 생겨야 가능 — 미래).
- **모든 사유의 표본이 2~4건**(≥30 없음). 정직한 결론: 전부 "판정 보류", 제안 0건이 맞다.

## S28-3 · 규칙별 성적표 (프론트 `accuracy.js`)
- **표본 기준을 `lib/sampleSize.js` samplePolicy(30)로 통일** — `accuracy.js:37` 의 `r.total >= 2`(2건으로 결론내던 노이즈-학습 버그) 제거.
  - 30건 미만: **"판정 보류 · N/30"**(정확도 숫자·판정색·막대 채움 안 함, 진행 게이지만).
  - 30건 이상: 정확도+막대.
- **`lib/ruleMap.js`(신규)**: `normalizeReason`(자유 문자열→정본 카테고리 6종)·`aggregateByCategory`(사유 카테고리로 합산). 화면이 이걸로 묶어 표시.
- **개선 제안 블록 정직화**: 기존의 `>=2 약한 규칙`·`최대 오판(단일 데이터)`·`전체 적중률 임계` 휴리스틱(전부 소표본 결론) 제거. 이제 30건+ 규칙에서만 표시하고, 없으면 **"아직 제안할 규칙이 없습니다 — 2~3건으로 규칙을 바꾸면 노이즈를 학습합니다"** 로 이유를 쓴다.
- ⚠️ 규칙별 "최근 30일 추이·마지막 변경일"은 per-rule 원천이 없어(ai_accuracy_daily는 집계, engine_changes는 아직 버전변경만) 이번엔 미표시 — 데이터가 쌓이면(제안 적용 후 engine_changes param 기록) 추가.

## S28-4 · 제안 생성기 (`auto_trade/improve_proposer.py`, 서버 신규)
- **규칙 기반만**(예측 모델 없음). 순수 `evaluate()` + DB 연동 `propose()`.
- **가드(전부 코드·테스트로 실증)**:
  - ★**위험 파라미터 배제**: `RISK_PARAMS={MAX_DAILY_LOSS, MAX_BUY_AMOUNT, IS_REAL}` — 후보에서 이중 필터. 강제 주입해도 0.
  - ★**표본 하드 게이트 = `ML_MIN_SAMPLE`(50)** — lib/sampleSize.js 의 기존 규칙 자동조정 금지선을 그대로 씀(30보다 엄격, 우회 금지).
  - **한 번에 한 개**: 대기 제안(pending/approved) 있으면 새로 안 만듦.
  - **한 단계씩**(도약 금지) · **최소 관측 20영업일**(engine_changes 마지막 변경 이후) · **애매하면 기각**(기준±15%p 밖만).
- **`engine_proposals` 테이블 생성**(trading.db): id·created_at·target·from_value·to_value·reason·sample_n·backtest·status(pending/approved/rejected/applied/reverted)·decided_at·applied_version. (승인 화면·백테스트는 XC.)
- **현재 결과 = 0건**(정직): 어떤 사유도 50건 미만 + block_reason↔가중치 확정 매핑 없음 + STOP_LOSS 조기/지연은 반사실(XC 백테스트 필요). `CATEGORY_TARGET={}` 로 두어 지어내지 않음.
- **selftest(`--test`) 통과**: (a)표본10→0 (b)표본60+매핑→후보1(파이프라인 실증) (c)위험파라미터→0 (d)애매→0.
- **일일 발굴 배선**: `version_watch.sh`(기존 일일 크론)에서 스냅샷 뒤 `improve_proposer.py` 호출 — **새 크론 안 늘림**.

## 배포/검증 (서버 `/home/ubuntu/one-hub/auto_trade`, git)
- `improve_proposer.py`(신규)·`version_watch.sh`(백업 후 교체) 배포. py_compile OK. selftest OK. 실제 실행 `proposal=None pending=0`. engine_proposals 0행.
- 서버 로컬 git 커밋 `83631b4`(XA 는 `827ba04`).

## 합격선
- [x] 30건 미만 규칙에 정확도 숫자가 단정적으로 안 뜬다(판정 보류 N/30)
- [x] 규칙(사유) 이름이 실제 조건과 대응 — ★1:1 아님을 확인·문서화하고 카테고리 매핑 제공
- [~] 각 규칙의 마지막 변경일 — per-rule 원천 부재로 이번 미표시(사유 명시)
- [x] 대기 중 제안이 항상 0 또는 1개(pending 체크)
- [x] 위험 파라미터가 제안에 절대 안 나옴(테스트로 확인)
- [x] 표본 미달이면 제안 0건
- [x] verify_s19 FAIL=0 · webpack build 통과

## 커밋
- (repo) `S28 XB: 규칙별 성적표 표본정직(sampleSize)+ruleMap` · (서버 git) `83631b4`
