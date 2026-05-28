# -*- coding: utf-8 -*-
# daily_report_generator.py - ONE-HUB v1.0
# Windows UTF-8 설정
import sys
if sys.platform == "win32":
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

import os
import re
import sqlite3
import argparse
import textwrap
from datetime import date, datetime
from pathlib import Path

import anthropic
from dotenv import load_dotenv

load_dotenv()

JOURNAL_DIR = Path.home() / "one_hub_journals"
OUTPUT_DIR  = Path("content") / "daily"
DB_PATH     = Path.home() / "trading.db"
DISCLAIMER  = "본 리포트는 투자 참고 자료이며 투자 권유가 아닙니다. 모든 투자 결과는 본인 책임입니다."


def _query_db(target_date: str) -> dict:
    result = {"regime": "SIDEWAYS", "heat_score": 50, "heat_grade": "COOL",
              "daily_pnl": 0, "trade_count": 0}
    if not DB_PATH.exists():
        print(f"[WARN] DB 없음 — 기본값 사용")
        return result
    try:
        conn = sqlite3.connect(str(DB_PATH))
        c = conn.cursor()
        c.execute("SELECT regime, daily_pnl, trade_count FROM daily_summary WHERE date LIKE ? ORDER BY id DESC LIMIT 1",
                  (f"{target_date}%",))
        row = c.fetchone()
        if row:
            result["regime"]      = row[0] or "SIDEWAYS"
            result["daily_pnl"]   = int(row[1] or 0)
            result["trade_count"] = int(row[2] or 0)
        conn.close()
    except Exception as e:
        print(f"[WARN] DB 조회 실패: {e}")
    hs = result["heat_score"]
    if   hs >= 65: result["heat_grade"] = "HOT"
    elif hs >= 50: result["heat_grade"] = "WARM"
    elif hs >= 35: result["heat_grade"] = "COOL"
    else:          result["heat_grade"] = "COLD"
    return result


def _read_journal(target_date: str) -> str:
    path = JOURNAL_DIR / f"{target_date}.md"
    if not path.exists():
        print(f"[WARN] 저널 없음: {path} — stub 생성 모드")
        return ""
    with open(path, encoding="utf-8-sig") as f:
        return f.read()


def _extract_section(md: str, heading: str) -> str:
    pattern = rf"##\s+{re.escape(heading)}(.*?)(?=\n##\s|\Z)"
    m = re.search(pattern, md, re.DOTALL | re.IGNORECASE)
    return m.group(1).strip() if m else "_내용 없음_"


def _parse_journal(md: str) -> dict:
    return {
        "market":    _extract_section(md, "1. 시장 상황"),
        "judgment":  _extract_section(md, "2. 오늘의 판단"),
        "entry":     _extract_section(md, "3. 진입 근거"),
        "stop":      _extract_section(md, "4. 손절 이유"),
        "good":      _extract_section(md, "5. 잘한 점"),
        "mistakes":  _extract_section(md, "6. 실수"),
        "tomorrow":  _extract_section(md, "7. 내일 전략"),
        "ai_review": _extract_section(md, "9. AI 평가"),
        "stock_rev": _extract_section(md, "10. 종목별 리뷰"),
    }


_PCT_PATTERN = re.compile(r"[+-]?\d+\.?\d*\s*%")
_FORBIDDEN   = [re.compile(r"(지금\s*바로\s*매수|무조건\s*오른다|확실한\s*수익)", re.IGNORECASE)]


def _sanitize(text: str) -> str:
    def replace_pct(m):
        val = float(m.group(0).replace("%", "").strip())
        if val > 0.3:    return "▲ 상승"
        elif val < -0.3: return "▼ 하락"
        return "➖ 보합"
    text = _PCT_PATTERN.sub(replace_pct, text)
    for pat in _FORBIDDEN:
        text = pat.sub("[편집됨]", text)
    return text


def _generate_insight(target_date: str, db: dict, sections: dict) -> str:
    api_key = os.getenv("CLAUDE_API_KEY") or os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        print("[WARN] CLAUDE_API_KEY 미설정 — 기본값 사용")
        return "오늘도 시장은 배움을 주었습니다. 내일도 원칙대로."

    market_snippet  = sections.get("market",   "")[:400]
    mistake_snippet = sections.get("mistakes", "")[:300]
    good_snippet    = sections.get("good",     "")[:300]

    prompt = f"""당신은 ONE-HUB의 AI 투자 코치입니다.
오늘의 운영 데이터를 분석하고 핵심 인사이트를 한 줄로 작성해주세요.

날짜: {target_date}
Regime: {db['regime']} | Heat: {db['heat_score']}/100 ({db['heat_grade']})
매매 건수: {db['trade_count']}건
결과: {'수익' if db['daily_pnl'] > 0 else '손실' if db['daily_pnl'] < 0 else '보합'}

시장 요약: {market_snippet}
잘한 점: {good_snippet}
실수: {mistake_snippet}

규칙:
- 반드시 한 문장, 100자 이내
- 수익/손실 금액이나 % 포함 절대 금지
- 오늘의 시장·판단·학습 중 가장 중요한 교훈 1가지
- 직장인 투자자가 공감할 수 있는 실용적 언어

인사이트 한 줄만 출력하세요 (따옴표 없이):"""

    try:
        client  = anthropic.Anthropic(api_key=api_key)
        message = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=150,
            messages=[{"role": "user", "content": prompt}]
        )
        raw = message.content[0].text.strip().strip('"\'「」')
        if len(raw) > 100:
            raw = raw[:97] + "..."
        print(f"[INSIGHT] {raw}")
        return raw
    except Exception as e:
        print(f"[WARN] Claude API 호출 실패: {e}")
        return "오늘도 시장은 배움을 주었습니다. 내일도 원칙대로."


def _pnl_emoji(pnl: int) -> str:
    if pnl > 0:   return "📈"
    elif pnl < 0: return "📉"
    return "➖"


def _build_front_matter(target_date: str, db: dict, insight: str) -> str:
    tags_list   = ["자동매매", "AI투자", "ONE-HUB", db["regime"]]
    tags_inline = ", ".join(f'"{t}"' for t in tags_list)
    emoji       = _pnl_emoji(db["daily_pnl"])
    safe_insight = insight.replace('"', '\\"')

    return (
        "---\n"
        f'title: "ONE-HUB 운영일지 {target_date}"\n'
        f'date: "{target_date}"\n'
        f'slug: "daily-{target_date}"\n'
        f'category: "daily"\n'
        f'regime: "{db["regime"]}"\n'
        f'heat_score: {db["heat_score"]}\n'
        f'heat_grade: "{db["heat_grade"]}"\n'
        f'pnl_emoji: "{emoji}"\n'
        f'trade_count: {db["trade_count"]}\n'
        f'tags: [{tags_inline}]\n'
        f'insight: "{safe_insight}"\n'
        f'published: true\n'
        "---"
    )


def _build_stub(target_date: str, db: dict, insight: str) -> str:
    return f"""## ONE-HUB Insight

> {insight}

---

## 오늘의 시장

| 항목 | 상태 |
|------|------|
| Market Regime | {db['regime']} |
| Heat Score | {db['heat_score']}/100 ({db['heat_grade']}) |
| 매매 건수 | {db['trade_count']}건 |

*오늘은 거래 데이터가 없습니다.*

---

{DISCLAIMER}"""


def _build_body(target_date: str, db: dict, sections: dict, insight: str) -> str:
    pnl    = db["daily_pnl"]
    regime = db["regime"]
    regime_emoji = {"BULL": "🟢", "BEAR": "🔴", "SIDEWAYS": "🟡"}.get(regime, "⚪")
    emoji  = _pnl_emoji(pnl)

    def s(key): return _sanitize(sections.get(key, "_내용 없음_"))

    return f"""## ONE-HUB Insight

> **{insight}**

---

## 오늘의 시장

{s('market')}

---

## AI 매매 판단

{s('judgment')}

| 항목 | 상태 |
|------|------|
| Regime | {regime_emoji} {regime} |
| Heat Score | {db['heat_score']}/100 ({db['heat_grade']}) |
| 오늘 결과 | {emoji} {'수익권' if pnl > 0 else '손실권' if pnl < 0 else '보합'} |
| 매매 건수 | {db['trade_count']}건 |

---

## 체결 내역

{s('entry')}

---

## 실패 분석 (핵심)

{s('mistakes')}

{s('stop')}

---

## 잘한 판단

{s('good')}

---

## 내일 시나리오

{s('tomorrow')}

---

## AI 평가

{s('ai_review')}

---

## 종목별 리뷰

{s('stock_rev')}

---

## ONE-HUB Insight (다시보기)

> **{insight}**

*#ONE-HUB #자동매매 #AI투자 #{regime}*

---

<sub>{DISCLAIMER}<br>ONE-HUB v7.0 | {datetime.now().strftime('%Y-%m-%d %H:%M')} 자동 생성</sub>"""


def generate(target_date: str, dry_run: bool = False) -> str:
    print(f"\n{'='*60}")
    print(f"[ONE-HUB] daily_report_generator 실행: {target_date}")
    print(f"{'='*60}")

    print("[1/5] DB 데이터 조회 중...")
    db = _query_db(target_date)
    print(f"      Regime={db['regime']}, Heat={db['heat_score']}, "
          f"PnL={'▲' if db['daily_pnl'] > 0 else '▼' if db['daily_pnl'] < 0 else '➖'}, "
          f"Trades={db['trade_count']}")

    print("[2/5] 저널 파일 읽기...")
    raw_md   = _read_journal(target_date)
    sections = _parse_journal(raw_md) if raw_md else {}
    print(f"      저널 길이: {len(raw_md):,}자")

    print("[3/5] Claude API — ONE-HUB Insight 생성 중...")
    insight = _generate_insight(target_date, db, sections)

    print("[4/5] 웹용 Markdown 조립 중...")
    front_matter = _build_front_matter(target_date, db, insight)
    body         = _build_body(target_date, db, sections, insight) if raw_md else _build_stub(target_date, db, insight)
    full_md      = f"{front_matter}\n\n{body}\n"

    if dry_run:
        print("[5/5] DRY-RUN — 파일 저장 건너뜀")
        print("\n" + "-"*40)
        for line in full_md.splitlines()[:30]:
            print(line)
    else:
        print("[5/5] 파일 저장 중...")
        out_dir = OUTPUT_DIR
        out_dir.mkdir(parents=True, exist_ok=True)
        out_path = out_dir / f"{target_date}.md"
        with open(out_path, "w", encoding="utf-8") as f:
            f.write(full_md)
        print(f"\n✅ 저장 완료: {out_path}")
        print(f"   크기: {len(full_md):,}자 | {len(full_md.encode('utf-8')):,} bytes")

    return full_md


def _validate_date(s: str) -> str:
    try:
        datetime.strptime(s, "%Y-%m-%d")
        return s
    except ValueError:
        raise argparse.ArgumentTypeError(f"날짜 형식 오류: {s}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="ONE-HUB Daily Report Generator")
    parser.add_argument("--date", "-d", type=_validate_date,
                        default=date.today().isoformat())
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    try:
        generate(target_date=args.date, dry_run=args.dry_run)
    except KeyboardInterrupt:
        print("\n[중단]")
        sys.exit(0)
    except Exception as e:
        print(f"\n[ERROR] {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
