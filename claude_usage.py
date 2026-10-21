# -*- coding: utf-8 -*-
# claude_usage.py — ONE-HUB API 비용 계측·안전장치 (1층 계측 + 2층 티어링 + 3층 훅)
# ============================================================
# 목적: 모든 Claude 호출을 기능별·모델별로 기록해
#       "어디서 얼마나 쓰는지"를 데이터로 본다.  (작업지시서 1층)
#       + 예산 초과 시 호출을 막는 비용 서킷 브레이커(2층 안전장치)와
#         작업 중요도별 저가 모델 라우팅(2층 티어링)을 제공한다.
#
# 대원칙: 계측·안전장치는 절대 본 파이프라인을 깨지 않는다.
#         모든 예외를 삼키고, 실패해도 원래 API 결과는 그대로 반환한다.
#         (auto_trade·real_estate 는 매일 실매매/실서비스로 돈다)
#
# ★★ 2층(서킷 브레이커·티어링)은 전부 "기본 OFF" 이며 "폴백 안전(fail-open)" 이다:
#     - 아무 환경변수도 없으면 기존 1층 동작과 100% 동일(계측만).
#     - 브레이커/티어링 내부 오류가 나면 "차단하지 않고 통과"시킨다.
#       회계·게이팅 로직이 죽었다고 매매 봇을 멈추면 안 되기 때문.
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
#
# 자세한 사용법: docs/봇_비용_서킷브레이커_티어링.md
# ============================================================

import os
import sqlite3
from collections import namedtuple


# ── 중앙 모델 상수 (PP-5: 흩어진 모델명을 한 곳에서 관리) ────
#   값을 바꾸면 이 상수를 쓰는 모든 호출이 함께 바뀐다.
#   ⚠️ 품질이 중요한 곳의 모델은 함부로 낮추지 말 것("싸게"보다 "적정하게").
MODEL_SCREENER = "claude-opus-4-5"      # 종목 심층 분석 (비쌈) — stock_screener
MODEL_REPORT   = "claude-sonnet-4-6"    # 일일/주간 리포트·인사이트
MODEL_CHEAP    = "claude-haiku-4-5"     # 2층 티어링 1차 스크리닝용 (현재 미사용, 준비만)


# ── 모델별 100만 토큰당 단가 (USD) ─────────────────────────
#   ⚠️ 아래 값은 참고용 "추정치" 이며, 정확한 청구는 console.anthropic.com →
#      Pricing 이 기준이다. 서킷 브레이커/일일 리포트가 실제로 동작하려면 단가가
#      0 이 아니어야 하므로 현행(2026-07) 공개가 기준의 추정치를 채워 두었다.
#      필요 시 콘솔 실단가로 갱신하면 계측·게이팅 정확도가 올라간다.
#   현행 매핑: opus-4-5→opus-4-8, sonnet-4-6→sonnet-5 (둘 다 active).
PRICING = {
    # opus 계열 (5 / 25)
    "claude-opus-4-5":   {"in": 5.0,  "out": 25.0},
    "claude-opus-4-8":   {"in": 5.0,  "out": 25.0},
    "claude-opus-5":     {"in": 5.0,  "out": 25.0},
    # sonnet 계열 (3 / 15)
    "claude-sonnet-4-6": {"in": 3.0,  "out": 15.0},
    "claude-sonnet-5":   {"in": 3.0,  "out": 15.0},
    # haiku (1 / 5)
    "claude-haiku-4-5":  {"in": 1.0,  "out": 5.0},
    # fable (10 / 50) — 최상위, 참고용
    "claude-fable-5":    {"in": 10.0, "out": 50.0},
}
# 단가 미상 모델의 보수적(비싼) 기본값 → 비용을 과소평가하지 않도록.
_DEFAULT_PRICE = {"in": 5.0, "out": 25.0}


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
    # 정확 매칭 → 접두 매칭(날짜 접미사 대응) → 보수적 기본값 순.
    p = PRICING.get(model)
    if p is None and model:
        for k, v in PRICING.items():
            if str(model).startswith(k):
                p = v
                break
    if p is None:
        p = _DEFAULT_PRICE
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
    ※ 이 함수는 1층 "순수 계측+패스스루" 이며 서킷 브레이커/티어링에 관여하지
       않는다(기존 5개 호출부의 계약을 그대로 보존). 예산 게이팅과 저가 라우팅이
       필요하면 아래 guarded_create() 를 쓴다.
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


def today_cost():
    """오늘(UTC 캘린더, SQLite date('now')) 누적 비용(USD).
    오류 시 0.0 → 서킷 브레이커가 오류로 오작동해 프로덕션을 막지 않게."""
    try:
        conn = _connect()
        cur = conn.execute(
            "SELECT COALESCE(SUM(cost_usd),0) FROM usage "
            "WHERE date(ts) = date('now')"
        )
        v = cur.fetchone()[0] or 0.0
        conn.close()
        return float(v)
    except Exception as e:
        print(f"[claude_usage] today skip: {e}")
        return 0.0


def month_to_date_cost():
    """이번 달(월초~현재, UTC) 누적 비용(USD)."""
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


# ============================================================
# 2층: 비용 서킷 브레이커 + 모델 티어링  (전부 기본 OFF · 폴백 안전)
# ============================================================
#
# 환경변수(전부 기본 OFF):
#   CLAUDE_CB_ENABLED        서킷 브레이커 마스터 스위치 (0/1)
#   CLAUDE_CB_DAILY_USD      오늘 누적 지출이 이 값 이상이면 트립
#   CLAUDE_CB_MONTHLY_USD    이번 달 누적 지출이 이 값 이상이면 트립
#   CLAUDE_CB_ON_TRIP        트립 시 동작: block(기본)/downgrade/raise
#   CLAUDE_CB_FALLBACK_MODEL downgrade 시 사용할 저가 모델 (기본 MODEL_CHEAP)
#   CLAUDE_TIERING_ENABLED   모델 티어링 마스터 스위치 (0/1)
#   CLAUDE_TIER_<TIER>       티어별 모델 매핑 (예 CLAUDE_TIER_SCREENING=claude-sonnet-5)
#
# 브레이커는 CLAUDE_CB_ENABLED=1 "그리고" 일/월 한도 중 하나 이상이 있어야
# 실제로 트립한다. 스위치만 켜고 한도가 없으면 트립하지 않는다.

Decision = namedtuple("Decision", ["allow", "model", "reason", "tripped"])


def _env(name, default=None):
    v = os.getenv(name)
    if v is None:
        return default
    v = v.strip()
    return v if v != "" else default


def _env_bool(name, default=False):
    v = _env(name)
    if v is None:
        return default
    return v.lower() in ("1", "true", "yes", "on", "y")


def _env_float(name, default=None):
    v = _env(name)
    if v is None:
        return default
    try:
        return float(v)
    except (TypeError, ValueError):
        return default


def _cb_on_trip():
    return (_env("CLAUDE_CB_ON_TRIP", "block") or "block").lower()


def _cb_fallback_model():
    return _env("CLAUDE_CB_FALLBACK_MODEL", MODEL_CHEAP) or MODEL_CHEAP


def config():
    """현재 환경변수로 해석된 2층 설정을 dict 로. 전부 기본 OFF."""
    return {
        "cb_enabled": _env_bool("CLAUDE_CB_ENABLED", False),
        "cb_daily_usd": _env_float("CLAUDE_CB_DAILY_USD", None),
        "cb_monthly_usd": _env_float("CLAUDE_CB_MONTHLY_USD", None),
        "cb_on_trip": _cb_on_trip(),
        "cb_fallback_model": _cb_fallback_model(),
        "tiering_enabled": _env_bool("CLAUDE_TIERING_ENABLED", False),
        "usage_db": USAGE_DB,
    }


def breaker_state():
    """서킷 브레이커 상태 dict. 기본 OFF → tripped=False.
    계산 오류가 나도 tripped=False(폴백 안전 → 미차단)."""
    cfg = config()
    state = {
        "enabled": cfg["cb_enabled"],
        "tripped": False,
        "reason": "",
        "spend_today": 0.0,
        "spend_month": 0.0,
        "daily_limit": cfg["cb_daily_usd"],
        "monthly_limit": cfg["cb_monthly_usd"],
        "on_trip": cfg["cb_on_trip"],
    }
    if not cfg["cb_enabled"]:
        return state  # 기본 OFF: 절대 트립 안 함
    try:
        st = today_cost()
        sm = month_to_date_cost()
        state["spend_today"] = st
        state["spend_month"] = sm
        dl = cfg["cb_daily_usd"]
        ml = cfg["cb_monthly_usd"]
        if dl is not None and st >= dl:
            state["tripped"] = True
            state["reason"] = "일일 예산 초과 %.4f >= %.4f USD" % (st, dl)
        elif ml is not None and sm >= ml:
            state["tripped"] = True
            state["reason"] = "월 예산 초과 %.4f >= %.4f USD" % (sm, ml)
    except Exception as e:
        # 계산 실패 시 트립하지 않는다(프로덕션 보호).
        print(f"[claude_usage] breaker skip: {e}")
        state["tripped"] = False
        state["reason"] = ""
    return state


def is_tripped():
    """브레이커 트립 여부. 기본 OFF/오류 시 False."""
    try:
        return bool(breaker_state()["tripped"])
    except Exception:
        return False


def pick_model(default_model, tier=None):
    """작업 티어에 맞는 모델ID 반환.
    - 티어링 OFF(기본) → default_model 그대로.
    - 티어링 ON 이지만 해당 티어 매핑이 없으면 → default_model 그대로(폴백 안전).
    - 매핑은 환경변수 CLAUDE_TIER_<TIER>(대문자)로 opt-in.
      예) 티어='screening' → CLAUDE_TIER_SCREENING=claude-sonnet-5
    """
    try:
        if not _env_bool("CLAUDE_TIERING_ENABLED", False):
            return default_model
        if not tier:
            return default_model
        ov = _env("CLAUDE_TIER_" + str(tier).strip().upper())
        return ov if ov else default_model
    except Exception:
        return default_model


def guard(default_model, tier=None):
    """호출 전 결정을 반환한다.
      allow  : 호출을 진행해도 되는가
      model  : 사용할 모델ID(티어링/다운그레이드 반영)
      reason : 사람이 읽을 설명
      tripped: 브레이커 트립 여부

    기본(전부 OFF): allow=True, model=default_model, tripped=False.
    폴백 안전: 어떤 오류가 나도 allow=True, model=default_model 로 진행.
    """
    try:
        chosen = pick_model(default_model, tier)
        state = breaker_state()
        if not state["tripped"]:
            return Decision(True, chosen, "ok", False)
        on_trip = _cb_on_trip()
        if on_trip == "downgrade":
            fb = _cb_fallback_model()
            return Decision(True, fb,
                            "브레이커 트립→저가모델 다운그레이드: " + state["reason"], True)
        # block(기본)/raise → 호출 차단
        return Decision(False, chosen, "브레이커 트립→차단: " + state["reason"], True)
    except Exception as e:
        return Decision(True, default_model, f"guard 내부오류→통과(폴백안전): {e}", False)


def guarded_create(client, feature, model, tier=None, **kwargs):
    """call_and_log 에 서킷 브레이커 + 티어링을 얹은 2층 진입점.

    동작:
      1) guard(model, tier) 로 결정(티어링/다운그레이드/차단).
      2) 차단이고 on_trip='raise' 면 RuntimeError, 아니면 None 반환.
         → 호출부는 None 을 "AI 스킵" 안전 폴백으로 처리하면 된다.
      3) 진행이면 call_and_log(client, feature, model=결정모델, **kwargs) 호출
         (계측은 1층 call_and_log 가 단일 소스로 담당).

    기본(전부 OFF)에서는 call_and_log 와 동일하게 동작하고 절대 None 을 돌려주지
    않는다. 즉 무손상 통합.
    """
    d = guard(model, tier)
    if not d.allow:
        if _cb_on_trip() == "raise":
            raise RuntimeError("claude_usage 호출 차단 — " + d.reason)
        return None
    kwargs["model"] = d.model
    return call_and_log(client, feature, **kwargs)


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


def _print_breaker():
    """CLI: 서킷 브레이커/티어링 상태 (2층)."""
    st = breaker_state()
    print("== 서킷 브레이커 상태 (2층) ==")
    print("DB               :", USAGE_DB)
    print("브레이커 ENABLED :", st["enabled"])
    print("오늘 지출(USD)   : %.4f" % st["spend_today"])
    print("이달 지출(USD)   : %.4f" % st["spend_month"])
    print("일일 한도        :", st["daily_limit"])
    print("월 한도          :", st["monthly_limit"])
    print("트립 여부        :", st["tripped"], st["reason"])
    print("트립시 동작      :", st["on_trip"])
    print("티어링 ENABLED   :", _env_bool("CLAUDE_TIERING_ENABLED", False))


if __name__ == "__main__":
    import sys
    cmd = sys.argv[1] if len(sys.argv) > 1 else "report"
    if cmd in ("line", "daily"):
        print(daily_report_line())
    elif cmd == "month":
        print(f"MTD cost: ${month_to_date_cost():.2f}")
    elif cmd in ("breaker", "status", "cb"):
        _print_breaker()
    else:
        _print_report()
