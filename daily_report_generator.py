# -*- coding: utf-8 -*-
# daily_report_generator.py — ONE-HUB v1.0
# ============================================================
# 역할: trade_journal.py가 생성한 ~/one_hub_journals/YYYY-MM-DD.md를
#       읽어서 웹 퍼블리싱용 Markdown으로 변환하고
#       Claude API로 ONE-HUB Insight 1줄을 자동 생성합니다.
#
# 실행:
#   python daily_report_generator.py              # 오늘 날짜
#   python daily_report_generator.py --date 2026-05-23
#   python daily_report_generator.py --dry-run    # 파일 저장 없이 미리보기
#
# 입력:  ~/one_hub_journals/YYYY-MM-DD.md  (trade_journal.py 출력)
#        ~/trading.db                       (SQLite DB)
# 출력:  ./content/daily/YYYY-MM-DD.md     (GitHub 레포 기준 경로)
#
# 사업기획서 v3.0 준수 사항:
#   - 수익률(%) 숫자 노출 금지 → pnl_emoji(📈/📉/➖)와 방향성만 표시
#   - 과장형 투자 채널 문구 자동 제거
#   - 실패 공개 섹션 보존 (팬덤 형성 핵심)
# ============================================================

import os
import re
import sys
import sqlite3
import argparse
import textwrap
from datetime import date, datetime
from pathlib import Path

import anthropic

# Windows 터미널 UTF-8 출력 강제 설정
if sys.platform == "win32":
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")
from dotenv import load_dotenv

load_dotenv()

# ── 경로 설정 ──────────────────────────────────────────────
JOURNAL_DIR   = Path.home() / "one_hub_journals"
OUTPUT_DIR    = Path("content") / "daily"          # GitHub 레포 루트 기준
DB_PATH       = Path.home() / "trading.db"
DISCLAIMER    = (
    "⚠️ 본 리포트는 투자 판단의 참고 자료이며 투자 권유가 아닙니다. "
    "모든 투자 결과는 본인 책임입니다."
)


# ══════════════════════════════════════════════════════════
# 1. DB 데이터 조회
# ══════════════════════════════════════════════════════════

def _query_db(target_date: str) -> dict:
    """SQLite DB에서 당일 요약 데이터를 조회합니다."""
    result = {
        "regime":      "SIDEWAYS",
        "heat_score":  50,
        "heat_grade":  "COOL",
        "daily_pnl":   0,
        "trade_count": 0,
        "cash":        0,
    }
    if not DB_PATH.exists():
        print(f"[WARN] DB 없음: {DB_PATH} — DB 기본값 사용")
        return result

    try:
        conn = sqlite3.connect(str(DB_PATH))
        c    = conn.cursor()

        # daily_summary 테이블 조회
        c.execute(
            "SELECT regime, daily_pnl, trade_count, final_value "
            "FROM daily_summary WHERE date LIKE ? ORDER BY id DESC LIMIT 1",
            (f"{target_date}%",)
        )
        row = c.fetchone()
        if row:
            result["regime"]      = row[0] or "SIDEWAYS"
            result["daily_pnl"]   = int(row[1] or 0)
            result["trade_count"] = int(row[2] or 0)
            result["cash"]        = int(row[3] or 0)

        # ai_logs에서 heat_score 조회 (있을 경우)
        c.execute(
            "SELECT key_signal FROM ai_logs WHERE date LIKE ? ORDER BY id DESC LIMIT 5",
            (f"{target_date}%",)
        )
        ai_rows = c.fetchall()
        for ar in ai_rows:
            sig = ar[0] or ""
            m = re.search(r"heat[:\s]+(\d+)", sig, re.IGNORECASE)
            if m:
                result["heat_score"] = int(m.group(1))
                break

        conn.close()
    except Exception as e:
        print(f"[WARN] DB 조회 실패: {e}")

    # heat_grade 계산
    hs = result["heat_score"]
    if   hs >= 65: result["heat_grade"] = "HOT"
    elif hs >= 50: result["heat_grade"] = "WARM"
    elif hs >= 35: result["heat_grade"] = "COOL"
    else:          result["heat_grade"] = "COLD"

    return result


# ══════════════════════════════════════════════════════════
# 2. 저널 파일 파싱
# ══════════════════════════════════════════════════════════

def _read_journal(target_date: str) -> str:
    """저널 파일을 읽어 raw Markdown 텍스트를 반환합니다."""
    path = JOURNAL_DIR / f"{target_date}.md"
    if not path.exists():
        print(f"[WARN] 저널 없음: {path} — stub 생성 모드")
        return ""
    with open(path, encoding="utf-8-sig") as f:
        return f.read()


def _extract_section(md: str, heading: str) -> str:
    """## heading 이후부터 다음 ## 까지 내용을 추출합니다."""
    pattern = rf"##\s+{re.escape(heading)}(.*?)(?=\n##\s|\Z)"
    m = re.search(pattern, md, re.DOTALL | re.IGNORECASE)
    if m:
        return m.group(1).strip()
    return "_내용 없음_"


def _parse_journal(md: str) -> dict:
    """저널 섹션을 딕셔너리로 파싱합니다."""
    sections = {
        "market":     _extract_section(md, "1. 시장 상황"),
        "judgment":   _extract_section(md, "2. 오늘의 판단"),
        "entry":      _extract_section(md, "3. 진입 근거"),
        "stop":       _extract_section(md, "4. 손절 이유"),
        "good":       _extract_section(md, "5. 잘한 점"),
        "mistakes":   _extract_section(md, "6. 실수"),
        "tomorrow":   _extract_section(md, "7. 내일 전략"),
        "emotion":    _extract_section(md, "8. 감정 기록"),
        "ai_review":  _extract_section(md, "9. AI 평가"),
        "stock_rev":  _extract_section(md, "10. 종목별 리뷰"),
        "positions":  _extract_section(md, "보유 포지션"),
        "signals":    _extract_section(md, "AI 신호 기록"),
    }
    return sections


# ══════════════════════════════════════════════════════════
# 3. 콘텐츠 필터링 (사업기획서 v3.0 준수)
# ══════════════════════════════════════════════════════════

# 수익률 % 노출 패턴 — 방향성 이모지로 대체
_PCT_PATTERN = re.compile(
    r"([+-]?\d+\.?\d*)\s*%",
    re.IGNORECASE
)

# 금지 문구 패턴 (과장형 투자 채널)
_FORBIDDEN = [
    re.compile(r"(지금\s*바로\s*매수|무조건\s*오른다|확실한\s*수익|손실\s*없는)", re.IGNORECASE),
    re.compile(r"(종목\s*추천|리딩|카피트레이드)", re.IGNORECASE),
]


def _sanitize_pct(text: str, pnl: int) -> str:
    """수익률 % 숫자를 방향성 표현으로 변환합니다."""
    def replace_pct(m):
        val = float(m.group(1))
        if val > 0.3:   return "▲ 상승"
        elif val < -0.3: return "▼ 하락"
        else:            return "➖ 보합"
    return _PCT_PATTERN.sub(replace_pct, text)


def _remove_forbidden(text: str) -> str:
    """금지 문구를 제거합니다."""
    for pat in _FORBIDDEN:
        text = pat.sub("[편집됨]", text)
    return text


def _sanitize(text: str, daily_pnl: int = 0) -> str:
    """텍스트 전체 정제 파이프라인."""
    text = _sanitize_pct(text, daily_pnl)
    text = _remove_forbidden(text)
    return text


# ══════════════════════════════════════════════════════════
# 4. Claude API — ONE-HUB Insight 1줄 생성
# ══════════════════════════════════════════════════════════

def _generate_insight(
    target_date: str,
    db: dict,
    sections: dict,
) -> str:
    """
    Claude API를 호출하여 오늘 배운 핵심 인사이트 1줄을 생성합니다.
    실패 시 fallback 문구를 반환합니다.
    """
    api_key = os.getenv("CLAUDE_API_KEY") or os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        print("[WARN] CLAUDE_API_KEY 미설정 — Insight 기본값 사용")
        return "오늘도 시장은 배움을 주었습니다. 내일도 원칙대로."

    # 프롬프트 구성 — 핵심 데이터만 요약해서 전달
    market_snippet = sections.get("market", "")[:400]
    mistake_snippet = sections.get("mistakes", "")[:300]
    good_snippet    = sections.get("good", "")[:300]
    ai_rev_snippet  = sections.get("ai_review", "")[:300]

    prompt = textwrap.dedent(f"""
        당신은 ONE-HUB의 AI 투자 코치입니다.
        오늘의 운영 데이터를 분석하고 핵심 인사이트를 한 줄로 작성해주세요.

        [오늘 데이터]
        날짜: {target_date}
        Regime: {db['regime']} | Heat: {db['heat_score']}/100 ({db['heat_grade']})
        매매 건수: {db['trade_count']}건
        결과: {'수익' if db['daily_pnl'] > 0 else '손실' if db['daily_pnl'] < 0 else '보합'}

        [시장 요약]
        {market_snippet}

        [잘한 점]
        {good_snippet}

        [실수 및 반성]
        {mistake_snippet}

        [AI 평가 요약]
        {ai_rev_snippet}

        [작성 규칙]
        - 반드시 한 문장, 100자 이내
        - 수익/손실 금액이나 % 포함 절대 금지
        - 오늘의 시장·판단·학습 중 가장 중요한 교훈 1가지
        - 직장인 투자자가 공감할 수 있는 실용적 언어
        - 예시: "VIX 안정에도 SOX 약세가 반도체 섹터의 독립적 리스크를 증명했다"
        - 예시: "Regime이 SIDEWAYS일 때 분할매수 1차만 진입하는 원칙이 손실을 막았다"

        인사이트 한 줄만 출력하세요 (따옴표 없이):
    """).strip()

    try:
        client  = anthropic.Anthropic(api_key=api_key)
        message = client.messages.create(
            model="claude-sonnet-4-5",
            max_tokens=150,
            messages=[{"role": "user", "content": prompt}]
        )
        raw = message.content[0].text.strip()
        # 혹시 따옴표가 포함된 경우 제거
        raw = raw.strip('"\'「」')
        # 100자 초과 시 자르기
        if len(raw) > 100:
            raw = raw[:97] + "..."
        print(f"[INSIGHT] {raw}")
        return raw
    except Exception as e:
        print(f"[WARN] Claude API 호출 실패: {e}")
        return "오늘도 시장은 배움을 주었습니다. 내일도 원칙대로."


# ══════════════════════════════════════════════════════════
# 5. YAML Front Matter 생성
# ══════════════════════════════════════════════════════════

def _pnl_emoji(pnl: int) -> str:
    if pnl > 0:   return "📈"
    elif pnl < 0: return "📉"
    return "➖"


def _build_front_matter(target_date: str, db: dict, insight: str) -> str:
    """Vercel + Next.js에서 파싱되는 YAML Front Matter를 생성합니다."""
    tags_list = ["자동매매", "AI투자", "ONE-HUB", db["regime"]]
    tags_yaml  = "\n".join(f'  - "{t}"' for t in tags_list)
    emoji      = _pnl_emoji(db["daily_pnl"])

    # 인사이트 내 따옴표 이스케이프
    safe_insight = insight.replace('"', '\\"')

    return textwrap.dedent(f"""
        ---
        title: "ONE-HUB 운영일지 {target_date}"
        date: "{target_date}"
        slug: "daily-{target_date}"
        category: "daily"
        regime: "{db['regime']}"
        heat_score: {db['heat_score']}
        heat_grade: "{db['heat_grade']}"
        pnl_emoji: "{emoji}"
        trade_count: {db['trade_count']}
        tags:
        {tags_yaml}
        insight: "{safe_insight}"
        published: true
        ---
    """).strip()


# ══════════════════════════════════════════════════════════
# 6. 웹용 Markdown 본문 생성
# ══════════════════════════════════════════════════════════

def _build_stub(target_date: str, db: dict, insight: str) -> str:
    """저널 파일이 없을 때 시장 요약만 포함한 stub을 생성합니다."""
    return textwrap.dedent(f"""
        ## ONE-HUB Insight

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

        {DISCLAIMER}
    """).strip()


def _build_body(
    target_date: str,
    db: dict,
    sections: dict,
    insight: str,
) -> str:
    """웹 퍼블리싱용 Markdown 본문을 조립합니다."""

    pnl    = db["daily_pnl"]
    emoji  = _pnl_emoji(pnl)
    regime = db["regime"]
    regime_emoji = {"BULL": "🟢", "BEAR": "🔴", "SIDEWAYS": "🟡"}.get(regime, "⚪")

    # 보유 포지션 — 수익률 숫자 제거 후 방향성만 표시
    positions_raw = _sanitize(sections.get("positions", "_보유 없음_"), pnl)

    # 각 섹션 정제
    def s(key): return _sanitize(sections.get(key, "_내용 없음_"), pnl)

    body = textwrap.dedent(f"""
        ## ONE-HUB Insight

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

        ## 보유 포지션 현황

        {positions_raw}

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

        <sub>{DISCLAIMER}<br>ONE-HUB v7.0 | {datetime.now().strftime('%Y-%m-%d %H:%M')} 자동 생성</sub>
    """).strip()

    return body


# ══════════════════════════════════════════════════════════
# 7. 메인 실행
# ══════════════════════════════════════════════════════════

def generate(target_date: str, dry_run: bool = False) -> str:
    """
    전체 파이프라인을 실행합니다.

    Args:
        target_date: 'YYYY-MM-DD' 형식 날짜
        dry_run: True면 파일 저장 없이 Markdown 문자열만 반환

    Returns:
        생성된 웹용 Markdown 전체 문자열
    """
    print(f"\n{'='*60}")
    print(f"[ONE-HUB] daily_report_generator 실행: {target_date}")
    print(f"{'='*60}")

    # ── Step 1: DB 조회 ─────────────────────────────────────
    print("[1/5] DB 데이터 조회 중...")
    db = _query_db(target_date)
    print(f"      Regime={db['regime']}, Heat={db['heat_score']}, "
          f"PnL={'▲' if db['daily_pnl'] > 0 else '▼' if db['daily_pnl'] < 0 else '➖'}, "
          f"Trades={db['trade_count']}")

    # ── Step 2: 저널 파일 읽기 ──────────────────────────────
    print("[2/5] 저널 파일 읽기...")
    raw_md   = _read_journal(target_date)
    sections = _parse_journal(raw_md) if raw_md else {}
    print(f"      저널 길이: {len(raw_md):,}자")

    # ── Step 3: Claude API — Insight 생성 ───────────────────
    print("[3/5] Claude API — ONE-HUB Insight 생성 중...")
    insight = _generate_insight(target_date, db, sections)

    # ── Step 4: Markdown 조립 ───────────────────────────────
    print("[4/5] 웹용 Markdown 조립 중...")
    front_matter = _build_front_matter(target_date, db, insight)
    body         = (_build_body(target_date, db, sections, insight)
                    if raw_md
                    else _build_stub(target_date, db, insight))
    full_md      = f"{front_matter}\n\n{body}\n"

    # ── Step 5: 파일 저장 ───────────────────────────────────
    if dry_run:
        print("[5/5] DRY-RUN — 파일 저장 건너뜀")
        print("\n" + "-"*40 + " 미리보기 (상위 50줄) " + "-"*40)
        for line in full_md.splitlines()[:50]:
            print(line)
        print("-"*100)
    else:
        print("[5/5] 파일 저장 중...")
        out_dir  = OUTPUT_DIR
        out_dir.mkdir(parents=True, exist_ok=True)
        out_path = out_dir / f"{target_date}.md"
        with open(out_path, "w", encoding="utf-8-sig") as f:
            f.write(full_md)
        print(f"\n✅ 저장 완료: {out_path}")
        print(f"   크기: {len(full_md):,}자 | {len(full_md.encode('utf-8')):,} bytes")

    return full_md


# ══════════════════════════════════════════════════════════
# 8. CLI 진입점
# ══════════════════════════════════════════════════════════

def _validate_date(s: str) -> str:
    try:
        datetime.strptime(s, "%Y-%m-%d")
        return s
    except ValueError:
        raise argparse.ArgumentTypeError(f"날짜 형식 오류: {s} (YYYY-MM-DD 필요)")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="ONE-HUB Daily Report Generator — 웹 퍼블리싱 Markdown 자동 생성"
    )
    parser.add_argument(
        "--date", "-d",
        type=_validate_date,
        default=date.today().isoformat(),
        help="리포트 날짜 (기본값: 오늘, 형식: YYYY-MM-DD)"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="파일 저장 없이 미리보기만 출력"
    )
    args = parser.parse_args()

    try:
        generate(target_date=args.date, dry_run=args.dry_run)
    except KeyboardInterrupt:
        print("\n[중단] 사용자가 중단했습니다.")
        sys.exit(0)
    except Exception as e:
        print(f"\n[ERROR] 치명적 오류: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
