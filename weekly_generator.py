
#!/usr/bin/env python3

import os, sys, json, argparse

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

        monday = datetime.strptime(f"{year}-W{w}-1", "%Y-W%W-%w").date()

    else:

        today = date.today()

        monday = today - timedelta(days=today.weekday())

    friday = monday + timedelta(days=4)

    return monday, friday



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

            days.append({"date": str(d), "meta": meta})

        d += timedelta(days=1)

    return days



def calc_weekly_stats(days):

    stats = {"total_days":0,"trade_days":0,"no_trade_days":0,"regimes":{},"heat_scores":[],"trade_counts":[],"pnl_emojis":[],"insights":[]}

    stats["total_days"] = len(days)

    for d in days:

        m = d["meta"]

        tc = int(m.get("trade_count", 0))

        stats["trade_counts"].append(tc)

        if tc > 0: stats["trade_days"] += 1

        else: stats["no_trade_days"] += 1

        regime = m.get("regime", "SIDEWAYS")

        stats["regimes"][regime] = stats["regimes"].get(regime, 0) + 1

        try: stats["heat_scores"].append(int(m.get("heat_score", 50)))

        except: stats["heat_scores"].append(50)

        stats["pnl_emojis"].append(m.get("pnl_emoji", "-"))

        if m.get("insight"):

            stats["insights"].append({"date": d["date"], "text": m["insight"]})

    stats["avg_heat"] = round(sum(stats["heat_scores"]) / len(stats["heat_scores"]), 1) if stats["heat_scores"] else 50

    stats["total_trades"] = sum(stats["trade_counts"])

    stats["dominant_regime"] = max(stats["regimes"], key=stats["regimes"].get) if stats["regimes"] else "SIDEWAYS"

    return stats




def generate_ai_review(days, stats, week_str):

    try:

        client = anthropic.Anthropic(api_key=os.getenv("CLAUDE_API_KEY"))

        insights = "\n".join([f"- {i['date']}: {i['text']}" for i in stats["insights"]])

        prompt = f"{week_str} ONE-HUB 주간 운영 데이터:\n운영{stats['total_days']}일 매매{stats['total_trades']}건 Heat평균{stats['avg_heat']} Regime:{stats['dominant_regime']}\nInsight:\n{insights}\n\n3-4문장으로 주간 운영 회고 (시장특성->대응평가->다음주주의). 한국어, 투자권유없이."

        msg = client.messages.create(

            model="claude-sonnet-4-6",

            max_tokens=300,

            messages=[{"role":"user","content":prompt}]

        )

        return msg.content[0].text.strip()

    except Exception as e:

        print(f"[AI] {e}")

        return f"{stats['dominant_regime']} 장세 한 주. 총 {stats['total_trades']}건 매매, 평균 Heat {stats['avg_heat']}/100."



def build_weekly_md(week_str, monday, friday, days, stats, ai_review):

    regime_bar = " / ".join([f"{k}:{v}일" for k,v in stats["regimes"].items()])

    pnl_line   = " ".join(stats["pnl_emojis"])

    table = "| 날짜 | Regime | Heat | 매매 | 방향 |\n|------|--------|------|------|------|\n"

    for d in days:

        m = d["meta"]

        table += f"| [{d['date']}](/daily/{d['date']}) | {m.get('regime','?')} | {m.get('heat_score','?')}/100 | {m.get('trade_count','0')}건 | {m.get('pnl_emoji','-')} |\n"

    insights_sec = ""

    for i in stats["insights"]:

        insights_sec += f"> **{i['date']}** {i['text']}\n\n"

    return f"""---

title: "ONE-HUB Weekly {week_str}"

date: "{friday}"

week: "{week_str}"

monday: "{monday}"

friday: "{friday}"

dominant_regime: "{stats['dominant_regime']}"

avg_heat: {stats['avg_heat']}

total_trades: {stats['total_trades']}

trade_days: {stats['trade_days']}

published: true

---



## {week_str} 주간 요약



> {ai_review}



---



## 주간 통계



| 항목 | 수치 |

|------|------|

| 운영일수 | {stats['total_days']}일 |

| 매매일수 | {stats['trade_days']}일 |

| 총 매매건수 | {stats['total_trades']}건 |

| 평균 Heat | {stats['avg_heat']}/100 |

| Regime | {stats['dominant_regime']} ({regime_bar}) |

| 방향 | {pnl_line} |



---



## 일별 현황



{table}



---



## 일별 Insight



{insights_sec}---



*투자 권유 아닙니다.*

"""




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

        print("[WEEKLY] daily 파일 없음 — 스킵")

        sys.exit(0)

    print(f"[WEEKLY] {len(days)}개 파일 로드")

    stats = calc_weekly_stats(days)

    ai_review = generate_ai_review(days, stats, week_str)

    md = build_weekly_md(week_str, monday, friday, days, stats, ai_review)

    out_path = WEEKLY_DIR / f"{week_str}.md"

    out_path.write_text(md, encoding="utf-8")

    print(f"[WEEKLY] 저장: {out_path}")

    print(f"[WEEKLY] 완료: 매매{stats['total_trades']}건 / Heat{stats['avg_heat']} / {stats['dominant_regime']}")



if __name__ == "__main__":

    main()

