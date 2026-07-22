# ThinkingBlock 파싱 버그 수정 완료 (TB)

> 최신 anthropic SDK(0.117+)가 응답 `content`에 `ThinkingBlock`을 먼저 담으면서
> `content[0].text`가 `'ThinkingBlock' object has no attribute 'text'`로 실패하던 버그를
> 공용 함수로 일괄 안전화. **API 한도 문제와는 별개.**

## 공용 함수
- `claude_text.py` · `extract_text(message)` — `.text` 속성이 있는 블록만 골라 이어붙인다.
  ThinkingBlock 등 `.text` 없는 블록은 건너뛴다. `content`가 비어있거나 이상해도 안전.
- 위치(동일 사본 2개, flat per-file 배포 구조):
  - `claude_text.py` (root / GitHub Actions)
  - `auto_trade/claude_text.py` (server 엔진)

## 수정한 호출부 (이 저장소 기준 5곳 / 4파일)
| 파일 | 줄(수정 전) | 전 → 후 |
|------|------------|---------|
| `auto_trade/stock_screener.py` | `raw_ai = message.content[0].text` | `raw_ai = extract_text(message)` |
| `auto_trade/daily_report_generator.py` | `raw = msg.content[0].text.strip()...` | `raw = extract_text(msg).strip()...` |
| `daily_report_generator.py` (root) | `raw = message.content[0].text.strip()...` | `raw = extract_text(message).strip()...` |
| `weekly_generator.py` | `return msg.content[0].text.strip()` (×2) | `return extract_text(msg).strip()` (×2) |

> **작업지시서와의 차이:** 지시서가 지목한 `trade_journal.py`·`ai_analyzer.py`·`content_automation/`
> (parser_text·parser_image)는 **이 저장소에는 존재하지 않는다**(서버 전용). 이 저장소에 실재하는
> `content[0].text` 5곳만 수정했다. 서버에 해당 파일이 있으면 동일하게 `extract_text`로 교체 필요.

## 안전 폴백
각 호출부는 방어적 import를 쓴다 — `claude_text.py`가 아직 배포 안 됐어도 동일한 안전 로직으로 동작:
```python
try:
    from claude_text import extract_text
except Exception:
    def extract_text(message):
        parts = []
        for block in getattr(message, "content", None) or []:
            t = getattr(block, "text", None)
            if t:
                parts.append(t)
        return "".join(parts)
```

## 검증
- **결승선(핵심):** ThinkingBlock이 먼저 오는 응답을 스텁으로 주입해
  `daily_report_generator._generate_insight()` 실행 → `[WARN] ...ThinkingBlock...` 없이
  TextBlock 텍스트가 정상 인사이트로 반환됨을 확인. (폴백 문구 아님)
- `extract_text` 단위 테스트: ThinkingBlock-우선 / 단일 TextBlock(동작 불변) / 다중 TextBlock 이어붙이기 / content 없음 — 전부 통과.
- 전 파일 `py_compile` 통과.
- `grep content[0].text` **잔존 0건**, `extract_text` 5곳.

## 배포 순서(서버)
`claude_text.py`를 **먼저** 배포한 뒤 이를 import하는 스크립트를 배포한다.
(폴백이 있어 순서가 틀려도 버그는 안 나지만, 계측·의미상 먼저 올리는 게 맞다.)
```
scripts/deploy_auto_trade.ps1 -File auto_trade/claude_text.py      # 먼저
scripts/deploy_auto_trade.ps1 -File auto_trade/stock_screener.py   # 그다음
scripts/deploy_auto_trade.ps1 -File auto_trade/daily_report_generator.py
```

## 의미
opus를 쓰는 `stock_screener`와 sonnet 리포트/주간이 이 버그로 `.text` 접근에서 조용히 실패해
**AI 인사이트가 매일 비어 있었을** 가능성. 공용 함수 하나로 리포트·종목선별·주간을 되살렸다.
