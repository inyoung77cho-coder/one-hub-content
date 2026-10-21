# API 비용 근본 대책 — 이행 결과 (CC)

> 배경: ONE-HUB 가 Anthropic API 크레딧 소진으로 멈춘 뒤, 재발 방지 + 비용 지속가능화.
> 원칙: **측정 없이 최적화 금지.** 1층(계측) → 2층(최적화) → 3층(안전장치) 순서.
> 이번 커밋은 **1층(계측)** 을 코드로 완료하고, 2·3층은 훅과 실행 가이드를 얹었다.
> 기존 Claude 호출의 모델·품질은 **전혀 바꾸지 않았다** — 계측만 추가.

---

## 1층 · 진단 (완료)

### CC-1. Claude 호출 지점 전수 (이 저장소 기준)

`grep -rn "messages.create" --include=*.py` 결과, **실호출은 5곳**. 모두 `call_and_log` 로 계측 적용.

| # | 파일 | 함수 | 모델(상수) | max_tokens | 용도 | 빈도(추정) |
|---|------|------|-----------|-----------|------|-----------|
| 1 | `auto_trade/stock_screener.py` | `screen_top_stocks` | `MODEL_SCREENER` = **opus-4-5** | 600 | 후보 상위종목 심층 분석 | 매 거래일 실행당 **1회** |
| 2 | `auto_trade/daily_report_generator.py` | `_generate_insight` | `MODEL_REPORT` = sonnet-4-6 | 150 | 일일 인사이트 한 줄 | 매 거래일 1회 |
| 3 | `daily_report_generator.py` (root) | `_generate_insight` | `MODEL_REPORT` = sonnet-4-6 | 150 | 일일 인사이트 (GitHub Actions) | 주중 1회/일 |
| 4 | `weekly_generator.py` | `generate_ai_review` | `MODEL_REPORT` = sonnet-4-6 | 400 | 주간 회고 | 주 1회 |
| 5 | `weekly_generator.py` | `generate_market_outlook` | `MODEL_REPORT` = sonnet-4-6 | 200 | 다음 주 전망 | 주 1회 |

> **작업지시서 원안과의 차이(중요):** 지시서는 "92종목을 전부 opus 로 개별 분석"을 유력 범인으로 봤다.
> 그러나 이 저장소의 `stock_screener.py` 는 이미 **로컬 기술적 스크리닝으로 상위 15종목만 추린 뒤
> opus 를 딱 1회** 호출한다(종목당 개별 호출 아님). 즉 여기 코드 기준으론 opus 호출량이 이미 통제돼 있다.
> → **실서버(54.180.54.132)의 배포본이 이 저장소와 같은지 반드시 1층 데이터로 확인**할 것.
> 서버 배포본이 구버전(개별 호출)이면, 이 저장소 버전으로 맞추는 것만으로 대부분 해결된다.

### CC-2. 사용량 로깅 래퍼 — `claude_usage.py` (신규)

- 위치(동일 사본 2개, flat per-file 배포 구조 때문):
  - `claude_usage.py` (root / GitHub Actions)
  - `auto_trade/claude_usage.py` (서버 엔진)
  - **한쪽 수정 시 반드시 다른 쪽도 동기화.**
- 핵심 API:
  - `call_and_log(client, feature, **kwargs)` — `messages.create` 를 감싸 자동 계측. **계측 실패는 API 결과에 영향 없음**(모든 예외 삼킴).
  - `log_usage(feature, model, in_tokens, out_tokens)` — 1건 기록.
  - 중앙 모델 상수: `MODEL_SCREENER` / `MODEL_REPORT` / `MODEL_CHEAP` (PP-5 중앙화).
- 기록 DB: 기본 `~/claude_usage.db` (환경변수 `CLAUDE_USAGE_DB` 로 변경 가능). `*.db` 는 `.gitignore` 처리됨.
- 스키마: `usage(ts, feature, model, in_tokens, out_tokens, cost_usd)`.

각 호출부는 **안전 폴백 import** 를 쓴다 — `claude_usage.py` 가 아직 배포 안 됐어도 기존 동작이 유지된다:

```python
try:
    from claude_usage import call_and_log, MODEL_SCREENER
except Exception:
    MODEL_SCREENER = "claude-opus-4-5"          # 현재 값 그대로 = 동작 불변
    def call_and_log(_client, _feature, **kwargs):
        return _client.messages.create(**kwargs)
```

> **배포 순서(서버):** 반드시 `claude_usage.py` 를 **먼저** 배포한 뒤 수정된 호출부를 배포한다.
> `scripts/deploy_auto_trade.ps1 -File auto_trade/claude_usage.py` → 이어서 stock_screener.py 등.

### CC-2b. 실단가 입력 (사장님 · Console) — **미완, 필요**

`claude_usage.py` 의 `PRICING` 은 현재 **자리표시자 0.0**. 이대로도 in/out 토큰은 집계되므로
"모델 간 배수 감각"은 볼 수 있으나, **정확한 $ 비용은 실단가를 넣어야** 나온다.

1. console.anthropic.com → **Pricing** 에서 opus-4-5 / sonnet-4-6 / haiku-4-5 의
   100만 토큰당 입력·출력 단가 확인.
2. `claude_usage.py` **두 사본 모두** 의 `PRICING` 딕셔너리에 값 입력:
   ```python
   PRICING = {
       MODEL_SCREENER: {"in": <입력단가>, "out": <출력단가>},
       MODEL_REPORT:   {"in": <입력단가>, "out": <출력단가>},
       MODEL_CHEAP:    {"in": <입력단가>, "out": <출력단가>},
   }
   ```

### ✅ 1층 검증 (하루 돌린 뒤)

```bash
# 방법 A: 내장 CLI (권장)
python3 auto_trade/claude_usage.py report      # 지난 1일 기능별 표 + 이번 달 누적

# 방법 B: 직접 SQL
sqlite3 ~/claude_usage.db \
  "SELECT feature, model, COUNT(*) calls, SUM(in_tokens) tin, SUM(out_tokens) tout,
          ROUND(SUM(cost_usd),2) cost
   FROM usage WHERE ts > datetime('now','-1 day')
   GROUP BY feature ORDER BY cost DESC"
```

**통과 조건:** 기능별 호출수·토큰·비용이 표로 나온다 → "범인"이 데이터로 드러난다.

---

## 2층 · 최적화 (1층 데이터 확인 후 실행 — 아직 코드 변경 안 함)

> 지시서 대원칙에 따라 **측정 전에는 모델을 바꾸지 않았다.** 아래는 데이터가 나오면 밟을 순서.

- **CC-4 모델 티어링 (효과 최대):** 이 저장소는 이미 로컬 스크리닝으로 상위 15종목만 opus 에 넘긴다.
  더 줄이려면 1차를 `MODEL_CHEAP`(haiku)로 한 번 더 거른 뒤 최종 소수만 opus.
  준비물은 이미 있음(`MODEL_CHEAP` 상수). **1차 기준은 recall 우선(느슨하게)** — 좋은 종목이 걸러지지 않게.
- **CC-5 중복 제거:** 같은 종목·같은 날 재분석 캐시, 장 안 여는 날(주말·휴일) 호출 스킵
  (`scripts/market_calendar.py` 활용).
- **CC-6 토큰 절감:** 프롬프트 반복 지시문 축약, `max_tokens` 를 용도에 맞게, 출력 형식 간결화.

**✅ 2층 검증:** 최적화 전후 일일 비용 비교
```bash
sqlite3 ~/claude_usage.db \
  "SELECT DATE(ts) d, ROUND(SUM(cost_usd),2) daily FROM usage GROUP BY DATE(ts) ORDER BY d DESC LIMIT 7"
```

---

## 3층 · 안전장치

### CC-8. Auto-reload (사장님 · Console)
console.anthropic.com → **Billing → Auto-reload** 켜기. 잔액 $X 이하 → 자동 $Y 충전. "조용히 0 되어 멈춤" 방지.

### CC-9. 지출 상한 + 80% 알림
- Console → **Limits → Monthly spend limit** 설정 (감당 수준).
- 자체 임계 알림 훅은 준비됨 — 텔레그램 감시/헬스체크에서:
  ```python
  from claude_usage import over_threshold
  hit, mtd = over_threshold(monthly_limit_usd=<상한>, pct=0.8)
  if hit:
      send_telegram(f"⚠️ CRITICAL: 이번 달 API 비용 ${mtd:.2f} — 상한의 80% 초과")
  ```

### CC-10. 일일 비용 리포트 (항목7 헬스체크에 한 줄)
```python
from claude_usage import daily_report_line
send_telegram(daily_report_line(monthly_limit_usd=<상한>))
# 예) 💰 어제 API 비용: $1.23 (opus 1회 · sonnet 2회)
#        이번 달 누적: $12.30 / 상한 $50
```
CLI 로도: `python3 auto_trade/claude_usage.py line`

---

## 사장님이 할 것 (Console)

| 할 일 | 위치 | 지시서 |
|------|------|--------|
| 모델별 실단가 확인 → `PRICING` 채움 | Console → Pricing | CC-2b |
| Auto-reload 켜기 | Console → Billing | CC-8 |
| 월 지출 상한 설정 | Console → Limits | CC-9 |

## 다음 단계 (개발)
1. `claude_usage.py` **서버 배포**(먼저) → 수정 호출부 배포.
2. **하루 이상 수집** 후 `report` 로 범인 특정.
3. 서버 배포본이 이 저장소와 다르면(구버전 개별호출) → 동기화.
4. 데이터 근거로 2층(티어링/캐시/토큰) 적용, CC-9/CC-10 텔레그램 훅 연결.
