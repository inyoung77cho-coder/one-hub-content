#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import os, sys, argparse, sqlite3
from datetime import datetime, timedelta, date
from pathlib import Path
import anthropic

PUBLISH_DIR = Path(__file__).parent
DAILY_DIR   = PUBLISH_DIR / "content" / "daily"
WEEKLY_DIR  = PUBLISH_DIR / "content" / "weekly"
WEEKLY_DIR.mkdir(exist_ok=True)

def get_week_range(week_str=None):
    if week_str:
        year, w = week_str.split("-W")
        monday = datetime.fromisocalendar(int(year), int(w), 1).date()
    else:
        today = date.today()
        monday = today - timedelta(days=today.weekday())
    friday = monday + timedelta(days=4)
    return monday, friday


DB_PATH = os.path.expanduser("~/trading.db")

def get_blocked_top3(monday, friday, trader_id="A"):
    """해당 주 기간 동안 가장 많이 차단된 신호 TOP3 + 사유."""
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute("""
            SELECT stock, code, errors, COUNT(*) as cnt,
                   ROUND(AVG(final_score), 1) as avg_score,
                   ROUND(AVG(target_gap_pct), 1) as avg_gap
            FROM blocked_signals
            WHERE date >= ? AND date < ? AND trader_id = ?
            GROUP BY code, errors
            ORDER BY cnt DESC
            LIMIT 3
        """, (f"{monday} 00:00:00", f"{friday + timedelta(days=1)} 00:00:00", trader_id))
        rows = c.fetchall()
        conn.close()
        return [
            {"stock": r[0], "code": r[1], "errors": r[2], "count": r[3],
             "avg_score": r[4], "avg_gap": r[5]}
            for r in rows
        ]
    except Exception as e:
        print(f"[BLOCKED_TOP3] {e}")
        return []


def load_daily_files(monday, friday):
    days = []
    d = monday
    while d <= friday:
        f = DAILY_DIR / f"{d}.md"
        if f.exists():
            text = f.read_text(encoding="utf-8")
            meta = {}
            if text.startswith("---"):
                parts = text.split("---", 2)
                if len(parts) >= 3:
                    for line in parts[1].strip().split("\n"):
                        if ":" in line:
                            k, v = line.split(":", 1)
                            meta[k.strip()] = v.strip().strip('"')
            days.append({"date": str(d), "meta": meta, "content": text})
        d += timedelta(days=1)
    return days

def calc_weekly_stats(days):
    stats = {
        "total_days": 0, "trade_days": 0, "no_trade_days": 0,
        "regimes": {}, "heat_scores": [], "heat_grades": [],
        "trade_counts": [], "block_counts": [], "pnl_emojis": [],
        "insights": [], "improvements": [],
    }
    stats["total_days"] = len(days)
    for d in days:
        m = d["meta"]
        tc = int(m.get("trade_count", 0))
        bc = int(m.get("block_count", 0))
        stats["trade_counts"].append(tc)
        stats["block_counts"].append(bc)
        if tc > 0:
            stats["trade_days"] += 1
        else:
            stats["no_trade_days"] += 1
        regime = m.get("regime", "SIDEWAYS")
        stats["regimes"][regime] = stats["regimes"].get(regime, 0) + 1
        try:
            stats["heat_scores"].append(int(m.get("heat_score", 50)))
        except:
            stats["heat_scores"].append(50)
        stats["heat_grades"].append(m.get("heat_grade", "WARM"))
        stats["pnl_emojis"].append(m.get("pnl_emoji", "-"))
        if m.get("insight"):
            stats["insights"].append({"date": d["date"], "text": m["insight"]})
        if m.get("improvements"):
            stats["improvements"].append({"date": d["date"], "text": m["improvements"]})
    stats["avg_heat"] = round(sum(stats["heat_scores"]) / len(stats["heat_scores"]), 1) if stats["heat_scores"] else 50
    stats["total_trades"] = sum(stats["trade_counts"])
    stats["total_blocks"] = sum(stats["block_counts"])
    stats["dominant_regime"] = max(stats["regimes"], key=stats["regimes"].get) if stats["regimes"] else "SIDEWAYS"
    total_signals = stats["total_trades"] + stats["total_blocks"]
    stats["block_rate"] = round(stats["total_blocks"] / total_signals * 100, 1) if total_signals > 0 else 0
    return stats

def generate_ai_review(days, stats, week_str):
    try:
        client = anthropic.Anthropic(api_key=os.getenv("CLAUDE_API_KEY"))
        insights_text = "\n".join([f"- {i['date']}: {i['text']}" for i in stats["insights"]])
        improvements_text = "\n".join([f"- {i['date']}: {i['text']}" for i in stats["improvements"]])
        prompt = f"{week_str} ONE-HUB 주간 운영 데이터:\n- 운영일수: {stats['total_days']}일\n- 총 매매건수: {stats['total_trades']}건\n- 총 차단건수: {stats['total_blocks']}건\n- 차단율: {stats['block_rate']}%\n- 평균 Heat Score: {stats['avg_heat']}\n- 지배 Regime: {stats['dominant_regime']}\n\n일별 Insight:\n{insights_text}\n\n개선사항:\n{improvements_text}\n\n위 데이터를 바탕으로 이번 주 ONE-HUB 운영 회고를 3~4문장으로 작성해주세요. (시장환경 -> 시스템반응 -> 다음주전망 순서로. 투자 권유 아닙니다.)"
        msg = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=400,
            messages=[{"role": "user", "content": prompt}]
        )
        return msg.content[0].text.strip()
    except Exception as e:
        print(f"[AI] {e}")
        return f"{stats['dominant_regime']} 장세에서 총 {stats['total_trades']}건 매매, {stats['total_blocks']}건 차단. 평균 Heat {stats['avg_heat']}/100."

def generate_market_outlook(stats, week_str):
    try:
        client = anthropic.Anthropic(api_key=os.getenv("CLAUDE_API_KEY"))
        prompt = f"{week_str} 기준 ONE-HUB 다음 주 시장 전망을 2~3문장으로 작성해주세요.\n- 현재 Regime: {stats['dominant_regime']}\n- 평균 Heat Score: {stats['avg_heat']}\n- 차단율: {stats['block_rate']}%\n(투자 권유 아닙니다. 시스템 관점의 관찰만.)"
        msg = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=200,
            messages=[{"role": "user", "content": prompt}]
        )
        return msg.content[0].text.strip()
    except Exception as e:
        print(f"[AI Outlook] {e}")
        return "다음 주 시장 방향은 Heat Score와 Regime 변화를 모니터링하며 판단합니다."

def build_weekly_md(week_str, monday, friday, days, stats, ai_review, market_outlook, blocked_top3=None):
    blocked_top3 = blocked_top3 or []
    if blocked_top3:
        bt_rows = "| 종목 | 차단 횟수 | 평균 점수 | 평균 목표갭 | 주요 차단 사유 |\n"
        bt_rows += "|------|----------|----------|-----------|---------------|\n"
        for b in blocked_top3:
            bt_rows += f"| {b['stock']} ({b['code']}) | {b['count']}회 | {b['avg_score']} | {b['avg_gap']}% | {b['errors']} |\n"
        blocked_top3_table = bt_rows
    else:
        blocked_top3_table = "*이번 주 반복 차단된 신호가 없습니다.*\n"
    regime_bar = " / ".join([f"{k}:{v}일" for k, v in stats["regimes"].items()])
    pnl_line = " ".join(stats["pnl_emojis"])

    table_rows = ""
    for i, d in enumerate(days):
        m = d["meta"]
        bc = stats["block_counts"][i] if i < len(stats["block_counts"]) else 0
        tc = m.get("trade_count", "0")
        hs = m.get("heat_score", "?")
        rg = m.get("regime", "?")
        pe = m.get("pnl_emoji", "-")
        table_rows += f"| [{d['date']}](/daily/{d['date']}) | {rg} | {hs}/100 | {tc}건 | {bc}건 | {pe} |\n"

    table = "| 날짜 | Regime | Heat | 매매 | 차단 | 방향 |\n"
    table += "|------|--------|------|------|------|------|\n"
    table += table_rows

    insights_sec = ""
    for item in stats["insights"]:
        insights_sec += f"> **{item['date']}** {item['text']}\n\n"
    if not insights_sec:
        insights_sec = "*이번 주 Insight 데이터가 없습니다.*\n"

    improvements_sec = ""
    for item in stats["improvements"]:
        improvements_sec += f"> **{item['date']}** {item['text']}\n\n"
    if not improvements_sec:
        improvements_sec = "*이번 주 개선사항 데이터가 없습니다.*\n"

    heat_dist = {"VERY HOT(80+)": 0, "HOT(65~79)": 0, "WARM(50~64)": 0, "COOL(35~49)": 0, "COLD(<35)": 0}
    for h in stats["heat_scores"]:
        if h >= 80: heat_dist["VERY HOT(80+)"] += 1
        elif h >= 65: heat_dist["HOT(65~79)"] += 1
        elif h >= 50: heat_dist["WARM(50~64)"] += 1
        elif h >= 35: heat_dist["COOL(35~49)"] += 1
        else: heat_dist["COLD(<35)"] += 1
    heat_dist_str = " / ".join([f"{k}:{v}일" for k, v in heat_dist.items() if v > 0])
    insight_short = ai_review[:100].replace("\n", " ")

    lines = [
        "---",
        f'title: "ONE-HUB Weekly {week_str}"',
        f'date: "{friday}"',
        f'week: "{week_str}"',
        f'monday: "{monday}"',
        f'friday: "{friday}"',
        f'dominant_regime: "{stats["dominant_regime"]}"',
        f'avg_heat: {stats["avg_heat"]}',
        f'total_trades: {stats["total_trades"]}',
        f'total_blocks: {stats["total_blocks"]}',
        f'block_rate: {stats["block_rate"]}',
        f'trade_days: {stats["trade_days"]}',
        f'published: true',
        f'insight: "{insight_short}"',
        "---",
        "",
        "## 1. Executive Summary",
        "",
        f"> {ai_review}",
        "",
        "---",
        "",
        "## 2. 시장 환경",
        "",
        "| 항목 | 수치 |",
        "|------|------|",
        f"| 지배 Regime | {stats['dominant_regime']} ({regime_bar}) |",
        f"| 평균 Heat Score | {stats['avg_heat']}/100 |",
        f"| Heat 분포 | {heat_dist_str} |",
        f"| 주간 방향 | {pnl_line} |",
        "",
        "---",
        "",
        "## 3. 매매 통계",
        "",
        "| 항목 | 수치 |",
        "|------|------|",
        f"| 운영일수 | {stats['total_days']}일 |",
        f"| 매매일수 | {stats['trade_days']}일 |",
        f"| 총 매매건수 | {stats['total_trades']}건 |",
        f"| 총 차단건수 | {stats['total_blocks']}건 |",
        f"| 차단율 | {stats['block_rate']}% |",
        "",
        "---",
        "",
        "## 4. 차단 분석",
        "",
        f"이번 주 총 **{stats['total_blocks']}건**이 차단됐습니다. 차단율 **{stats['block_rate']}%**.",
        "",
        "차단건수가 높을수록 시스템이 더 신중하게 작동했다는 의미입니다.",
        "매매를 안 한 것도 전략입니다.",
        "",
        "### 차단 신호 Top 3",
        "",
        blocked_top3_table,
        "",
        "---",
        "",
        "## 5. 일별 현황",
        "",
        table,
        "---",
        "",
        "## 6. 일별 Insight",
        "",
        insights_sec,
        "---",
        "",
        "## 7. 개선사항",
        "",
        improvements_sec,
        "---",
        "",
        "## 8. 다음 주 전망",
        "",
        market_outlook,
        "",
        "---",
        "",
        "*투자 권유 아닙니다.*",
    ]
    return "\n".join(lines)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--week", default=None)
    args = parser.parse_args()
    if args.week:
        week_str = args.week
        monday, friday = get_week_range(week_str)
    else:
        monday, friday = get_week_range()
        week_num = monday.isocalendar()[1]
        week_str = f"{monday.year}-W{week_num:02d}"
    print(f"[WEEKLY] {week_str} ({monday} ~ {friday})")
    days = load_daily_files(monday, friday)
    if not days:
        print("[WEEKLY] daily 파일 없음 -- 종료")
        sys.exit(0)
    print(f"[WEEKLY] {len(days)}개 파일 로드")
    stats = calc_weekly_stats(days)
    print(f"[WEEKLY] 매매:{stats['total_trades']}건 / 차단:{stats['total_blocks']}건 / Heat:{stats['avg_heat']} / {stats['dominant_regime']}")
    ai_review = generate_ai_review(days, stats, week_str)
    market_outlook = generate_market_outlook(stats, week_str)
    blocked_top3 = get_blocked_top3(monday, friday)
    md = build_weekly_md(week_str, monday, friday, days, stats, ai_review, market_outlook, blocked_top3)
    out_path = WEEKLY_DIR / f"{week_str}.md"
    out_path.write_text(md, encoding="utf-8")
    print(f"[WEEKLY] 완료: {out_path}")

if __name__ == "__main__":
    main()
