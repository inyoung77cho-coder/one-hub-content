# -*- coding: utf-8 -*-
# claude_usage.py — ONE-HUB API 비용 계측·안전장치 (1층 + 3층 훅)
# ============================================================
# 목적: 모든 Claude 호출을 기능별·모델별로 기록해
#       "어디서 얼마나 쓰는지"를 데이터로 본다.  (작업지시서 1층)
#
# 대원칙: 계측은 절대 본 파이프라인을 깨지 않는다.
#         모든 예외를 삼키고, 실패해도 원래 API 결과는 그대로 반환한다.
#         (auto_trade·real_estate 는 매일 실매매/실서비스로 돈다)
#
# ★ 이 파일은 두 곳에 "동일 사본"으로 존재한다 (flat per-file 배포 구조 때문):
#     - one-hub-content/claude_usage.py             (root / GitHub Actions)
#     - one-hub-content/auto_trade/claude_usage.py  (server 엔진)
#   한쪽을 고치면 반드시 다른 쪽도 같은 내용으로 맞춘다.
#
# 배포(서버): 이 파일을 stock_screener.py / daily_report_generator.py 보다
#   "먼저" 배포해야 한다. 각 호출부에는 안전 폴백이 있어 이 모듈이 없어도
#   기존 동작은 유지되지만, 계측은 빠진다.
#     scripts/deploy_auto_trade.ps1 -File auto_trade/claude_usage.py
# ============================================================

import os
import sqlite3


# ── 중앙 모델 상수 (PP-5: 흩어진 모델명을 한 곳에서 관리) ────
#   값을 바꾸면 이 상수를 쓰는 모든 호출이 함께 바뀐다.
#   ⚠️ 품질이 중요한 곳의 모델은 함부로 낮추지 말 것("싸게"보다 "적정하게").
MODEL_SCREENER = "claude-opus-4-5"      # 종목 심층 분석 (비쌈) — stock_screener
MODEL_REPORT   = "claude-sonnet-4-6"    # 일일/주간 리포트·인사이트
MODEL_CHEAP    = "claude-haiku-4-5"     # 2층 티어링 1차 스크리닝용 (현재 미사용, 준비만)


# ── 모델별 100만 토큰당 단가 (USD) ─────────────────────────
#   ⚠️ CC-2b: 실단가는 console.anthropic.com → Pricing 에서 확인해 채운다.
#   0.0 이면 cost_usd 는 0 으로 기록되지만 in/out 토큰은 정상 집계되므로
#   "모델 간 배수 감각"은 토큰 수만으로도 먼저 볼 수 있다.
PRICING = {
    MODEL_SCREENER: {"in": 0.0, "out": 0.0},
    MODEL_REPORT:   {"in": 0.0, "out": 0.0},
    MODEL_CHEAP:    {"in": 0.0, "out": 0.0},
}


# DB 위치: 기본은 ~/claude_usage.db (trading.db 와 같은 홈 디렉터리 관례).
# 환경변수 CLAUDE_USAGE_DB 로 덮어쓸 수 있다.
USAGE_DB = os.getenv(
    "CLAUDE_USAGE_DB",
    os.path.join(os.path.expanduser("~"), "claude_usage.db"),
)


def _connect():
    conn = sqlite3.connect(USAGE_DB, timeout=5)
    conn.execute(
        """CREATE TABLE IF NOT EXISTS usage(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ts TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            feature TEXT, model TEXT,
            in_tokens INTEGER, out_tokens INTEGER,
            cost_usd REAL
        )"""
    )
    return conn


def _price(model, in_tokens, out_tokens):
    p = PRICING.get(model, {"in": 0.0, "out": 0.0})
    return (in_tokens / 1e6) * p["in"] + (out_tokens / 1e6) * p["out"]


def log_usage(feature, model, in_tokens, out_tokens):
    """호출 1건을 기록한다. 실패해도 예외를 올리지 않는다."""
    in_tokens = int(in_tokens or 0)
    out_tokens = int(out_tokens or 0)
    cost = _price(model, in_tokens, out_tokens)
    try:
        conn = _connect()
        conn.execute(
            "INSERT INTO usage(feature,model,in_tokens,out_tokens,cost_usd) "
            "VALUES(?,?,?,?,?)",
            (feature, model, in_tokens, out_tokens, cost),
        )
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"[claude_usage] log skip: {e}")
    return cost


def call_and_log(client, feature, **kwargs):
    """client.messages.create 를 감싸 자동 계측한다.

    계측 실패는 API 결과에 영향을 주지 않는다 — msg 는 항상 그대로 반환된다.
    사용 예:
        msg = call_and_log(client, "stock_screener",
                           model=MODEL_SCREENER, max_tokens=600,
                           messages=[...])
    """
    msg = client.messages.create(**kwargs)
    try:
        u = msg.usage
        log_usage(
            feature,
            kwargs.get("model"),
            getattr(u, "input_tokens", 0),
            getattr(u, "output_tokens", 0),
        )
    except Exception as e:
        print(f"[claude_usage] usage skip: {e}")
    return msg


# ── 리포트/안전장치 헬퍼 (3층: CC-9 임계알림 · CC-10 일일리포트) ──

def _grouped(where, params=()):
    """기능·모델별 집계 행 반환: (feature, model, calls, in, out, cost)."""
    try:
        conn = _connect()
        cur = conn.execute(
            "SELECT feature, model, COUNT(*), "
            "COALESCE(SUM(in_tokens),0), COALESCE(SUM(out_tokens),0), "
            "COALESCE(SUM(cost_usd),0) FROM usage " + where +
            " GROUP BY feature, model ORDER BY 6 DESC, 3 DESC",
            params,
        )
        rows = cur.fetchall()
        conn.close()
        return rows
    except Exception as e:
        print(f"[claude_usage] query skip: {e}")
        return []


def month_to_date_cost():
    """이번 달(월초~현재) 누적 비용(USD)."""
    try:
        conn = _connect()
        cur = conn.execute(
            "SELECT COALESCE(SUM(cost_usd),0) FROM usage "
            "WHERE ts >= date('now','start of month')"
        )
        v = cur.fetchone()[0] or 0.0
        conn.close()
        return float(v)
    except Exception as e:
        print(f"[claude_usage] mtd skip: {e}")
        return 0.0


def over_threshold(monthly_limit_usd, pct=0.8):
    """이번 달 누적이 상한의 pct 이상이면 (True, mtd) 반환 (CC-9)."""
    mtd = month_to_date_cost()
    limit = float(monthly_limit_usd or 0)
    return (limit > 0 and mtd >= limit * pct, mtd)


def _short_model(model):
    # "claude-opus-4-5" -> "opus", "claude-sonnet-4-6" -> "sonnet"
    if model and "-" in model:
        parts = model.split("-")
        return parts[1] if len(parts) > 1 else model
    return model or "?"


def daily_report_line(day_offset=-1, monthly_limit_usd=None):
    """텔레그램 헬스체크에 붙일 한 줄 요약 (CC-10). 기본은 '어제'."""
    rows = _grouped("WHERE date(ts) = date('now', ?)", (f"{day_offset} day",))
    cost = sum(r[5] for r in rows)
    by_model = {}
    for _feat, model, calls, _tin, _tout, _cst in rows:
        by_model[_short_model(model)] = by_model.get(_short_model(model), 0) + calls
    model_str = " · ".join(f"{m} {n}회" for m, n in by_model.items()) or "호출 없음"
    mtd = month_to_date_cost()
    label = "어제" if day_offset == -1 else ("오늘" if day_offset == 0 else f"{day_offset}일")
    line = f"💰 {label} API 비용: ${cost:.2f} ({model_str})\n   이번 달 누적: ${mtd:.2f}"
    if monthly_limit_usd:
        line += f" / 상한 ${float(monthly_limit_usd):.0f}"
    return line


def _print_report():
    """CLI: 지난 1일 기능별 비용 표 (✅ 1층 검증용)."""
    rows = _grouped("WHERE ts > datetime('now','-1 day')")
    print(f"{'feature':22} {'model':20} {'calls':>5} {'in_tok':>9} "
          f"{'out_tok':>8} {'cost$':>8}")
    print("-" * 76)
    for feat, model, calls, tin, tout, cst in rows:
        print(f"{(feat or '?'):22} {(model or '?'):20} {calls:>5} "
              f"{tin:>9} {tout:>8} {cst:>8.3f}")
    if not rows:
        print("(지난 1일 기록 없음 — 아직 호출이 없거나 DB 미생성)")
    print(f"\n이번 달 누적(MTD): ${month_to_date_cost():.2f}")
    print(f"DB: {USAGE_DB}")


if __name__ == "__main__":
    import sys
    cmd = sys.argv[1] if len(sys.argv) > 1 else "report"
    if cmd in ("line", "daily"):
        print(daily_report_line())
    elif cmd == "month":
        print(f"MTD cost: ${month_to_date_cost():.2f}")
    else:
        _print_report()
