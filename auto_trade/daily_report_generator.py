# -*- coding: utf-8 -*-

# daily_report_generator.py - ONE-HUB v1.2

import sys, os, re, sqlite3, argparse

from datetime import date, datetime

from pathlib import Path

import anthropic

from dotenv import load_dotenv

load_dotenv()



JOURNAL_DIR = Path.home() / "one_hub_journals"

OUTPUT_DIR  = Path("/home/ubuntu/one-hub-publish/content/daily")

DB_PATH     = Path.home() / "trading.db"

DISCLAIMER  = "본 리포트는 투자 참고 자료이며 투자 권유가 아닙니다. 모든 투자 결과는 본인 책임입니다."

ACTION_KR   = {"BUY":"매수","SELL":"매도","AUTO_STOP_SELL":"자동손절","AI_AUTO_SELL":"AI자동매도","MANUAL_SELL":"수동매도","MANUAL_BUY":"수동매수","SPLIT_BUY":"분할매수"}



def _query_db(target_date):

    result = {"regime":"SIDEWAYS","heat_score":50,"heat_grade":"COOL","daily_pnl":0,"trade_count":0,"block_count":0,"trades":[]}

    if not DB_PATH.exists(): return result

    try:

        conn = sqlite3.connect(str(DB_PATH))

        c = conn.cursor()

        c.execute("SELECT block_count FROM daily_summary WHERE date LIKE ? ORDER BY id DESC LIMIT 1",(f"{target_date}%",))
        brow = c.fetchone()
        if brow and brow[0]: result["block_count"] = int(brow[0])
        c.execute("SELECT regime FROM daily_summary WHERE date LIKE ? ORDER BY id DESC LIMIT 1",(f"{target_date}%",))

        row = c.fetchone()

        if row: result["regime"] = (row[0] or "SIDEWAYS").strip()

        c.execute("SELECT id,date,stock,action,price,qty,pnl,reason FROM trades WHERE date LIKE ? ORDER BY id ASC",(f"{target_date}%",))

        rows = c.fetchall()

        result["trades"] = [{"id":r[0],"time":r[1][11:16] if len(r[1])>=16 else "","stock":r[2],"action":r[3],"price":int(r[4] or 0),"qty":int(r[5] or 0),"pnl":int(r[6] or 0),"reason":r[7] or ""} for r in rows]

        if result["trades"]:

            result["trade_count"] = len(result["trades"])

            result["daily_pnl"]   = sum(t["pnl"] for t in result["trades"])

        conn.close()

    except Exception as e:

        print(f"[WARN] DB 오류: {e}")

    hs = result["heat_score"]

    result["heat_grade"] = "HOT" if hs>=65 else "WARM" if hs>=50 else "COOL" if hs>=35 else "COLD"

    return result



def _read_journal(target_date):

    path = JOURNAL_DIR / f"{target_date}.md"

    if not path.exists(): return ""

    with open(path, encoding="utf-8-sig") as f: return f.read()



def _extract_section(md, heading):

    m = re.search(rf"##\s+{re.escape(heading)}(.*?)(?=\n##\s|\Z)", md, re.DOTALL|re.IGNORECASE)

    return m.group(1).strip() if m else "_내용 없음_"



def _parse_journal(md):

    return {"market":_extract_section(md,"1. 시장 상황"),"judgment":_extract_section(md,"2. 오늘의 판단"),"entry":_extract_section(md,"3. 진입 근거"),"stop":_extract_section(md,"4. 손절 이유"),"good":_extract_section(md,"5. 잘한 점"),"mistakes":_extract_section(md,"6. 실수"),"tomorrow":_extract_section(md,"7. 내일 전략"),"ai_review":_extract_section(md,"9. AI 평가"),"stock_rev":_extract_section(md,"10. 종목별 리뷰")}



_PCT = re.compile(r"[+-]?\d+\.?\d*\s*%")

def _sanitize(text):

    def rp(m):

        v = float(m.group(0).replace("%","").strip())

        return "▲ 상승" if v>0.3 else "▼ 하락" if v<-0.3 else "➖ 보합"

    return _PCT.sub(rp, text)



def _build_trades_md(trades):

    if not trades: return "_오늘 매매 없음_"

    lines=["| 시간 | 종목 | 구분 | 수량 | 가격 | 손익 | 사유 |","|------|------|------|------|------|------|------|"]

    for t in trades:

        lines.append(f"| {t['time']} | {t['stock']} | {ACTION_KR.get(t['action'],t['action'])} | {t['qty']}주 | {t['price']:,}원 | {t['pnl']:+,}원 | {t['reason']} |")

    lines.append(f"| | **합계** | | | | **{sum(t['pnl'] for t in trades):+,}원** | |")

    return "\n".join(lines)



def _generate_insight(target_date, db, sections):

    api_key = os.getenv("CLAUDE_API_KEY") or os.getenv("ANTHROPIC_API_KEY")

    if not api_key: return "오늘도 시장은 배움을 주었습니다. 내일도 원칙대로."

    trades_summary = "\n".join([f"  - {t['stock']} {ACTION_KR.get(t['action'],t['action'])} {'▲' if t['pnl']>0 else '▼' if t['pnl']<0 else '➖'} ({t['reason']})" for t in db.get("trades",[])]) or "  없음"

    prompt = f"""ONE-HUB AI 투자 코치. 오늘 운영 핵심 인사이트 한 줄.

날짜:{target_date} Regime:{db['regime']} Trades:{db['trade_count']}건 결과:{'수익' if db['daily_pnl']>0 else '손실' if db['daily_pnl']<0 else '보합'}

거래:{trades_summary}

시장:{sections.get('market','')[:200]}

규칙: 한 문장 100자 이내, 금액/% 금지, 따옴표 없이 출력"""

    try:

        client = anthropic.Anthropic(api_key=api_key)

        msg = client.messages.create(model="claude-sonnet-4-6", max_tokens=150, messages=[{"role":"user","content":prompt}])

        raw = msg.content[0].text.strip().strip('"\'「」')

        return raw[:97]+"..." if len(raw)>100 else raw

    except Exception as e:

        print(f"[WARN] {e}")

        return "오늘도 시장은 배움을 주었습니다. 내일도 원칙대로."



def _pnl_emoji(pnl): return "▲" if pnl>0 else "▼" if pnl<0 else "➖"



def _build_front_matter(target_date, db, insight):

    tags = ", ".join(f'"{t}"' for t in ["자동매매","AI투자","ONE-HUB",db["regime"]])

    safe = insight.replace('"', '\\\"')

    return f'''---\ntitle: "ONE-HUB 운영일지 {target_date}"\ndate: "{target_date}"\nslug: "daily-{target_date}"\ncategory: "daily"\nregime: "{db["regime"]}"\nheat_score: {db["heat_score"]}\nmarket_score: {db["heat_score"]}\nheat_grade: "{db["heat_grade"]}"\npnl_emoji: "{_pnl_emoji(db["daily_pnl"])}"\ntrade_count: {db["trade_count"]}
block_count: {db.get("block_count",0)}\ntags: [{tags}]\ninsight: "{safe}"\npublished: true\n---'''



def _build_body(target_date, db, sections, insight):

    regime = db["regime"]

    re_em = {"BULL":"▲","BEAR":"▼","SIDEWAYS":"➖"}.get(regime,"➖")

    def s(k): return _sanitize(sections.get(k,"_내용 없음_"))

    trades_md = _build_trades_md(db.get("trades",[]))

    return f"""## 오늘의 시장\n\n{s('market')}\n\n---\n\n## AI 매매 판단\n\n{s('judgment')}\n\n| 항목 | 상태 |\n|------|------|\n| Regime | {re_em} {regime} |\n| Heat Score | {db['heat_score']}/100 ({db['heat_grade']}) |\n| 오늘 결과 | {_pnl_emoji(db['daily_pnl'])} {'수익권' if db['daily_pnl']>0 else '손실권' if db['daily_pnl']<0 else '보합'} |\n| 매매 건수 | {db['trade_count']}건 |\n\n---\n\n## 체결 내역\n\n{trades_md}\n\n---\n\n## 실패 분석\n\n{s('mistakes')}\n\n{s('stop')}\n\n---\n\n## 잘한 판단\n\n{s('good')}\n\n---\n\n## 내일 시나리오\n\n{s('tomorrow')}\n\n---\n\n*#ONE-HUB #자동매매 #AI투자 #{regime}*\n\n<sub>{DISCLAIMER}</sub>"""



def _build_stub(target_date, db, insight):

    return f"""## 오늘의 시장\n\n| 항목 | 상태 |\n|------|------|\n| Regime | {db['regime']} |\n| Heat | {db['heat_score']}/100 |\n| 매매 | {db['trade_count']}건 |\n\n## 체결 내역\n\n{_build_trades_md(db.get('trades',[]))}\n\n---\n\n{DISCLAIMER}"""



def generate(target_date, dry_run=False):

    print(f"\n[ONE-HUB] daily_report_generator v1.2: {target_date}")

    db = _query_db(target_date)

    print(f"[DB] Regime={db['regime']}, Trades={db['trade_count']}, PnL={db['daily_pnl']:+,}")

    raw_md = _read_journal(target_date)

    sections = _parse_journal(raw_md) if raw_md else {}

    insight = _generate_insight(target_date, db, sections)

    print(f"[INSIGHT] {insight}")

    fm = _build_front_matter(target_date, db, insight)

    body = _build_body(target_date, db, sections, insight) if raw_md else _build_stub(target_date, db, insight)

    full = f"{fm}\n\n{body}\n"

    if dry_run:

        for line in full.splitlines()[:40]: print(line)

    else:

        out_dir = OUTPUT_DIR

        out_dir.mkdir(parents=True, exist_ok=True)

        out_path = out_dir / f"{target_date}.md"

        with open(out_path, "w", encoding="utf-8") as f: f.write(full)

        print(f"✅ 저장: {out_path}")

    return full



if __name__ == "__main__":

    parser = argparse.ArgumentParser()

    parser.add_argument("--date","-d",default=date.today().isoformat())

    parser.add_argument("--dry-run",action="store_true")

    args = parser.parse_args()

    generate(args.date, args.dry_run)

