# -*- coding: utf-8 -*-
"""
/api/ai/stats — AI 지표 단일 소스 (S18 Part2 B-5)

원칙: 화면은 세지 않는다. 화면은 받아서 그린다.
  모든 숫자는 여기서만 계산한다. SQL 은 이 파일 안에만 있다.
  응답 실패 시 프론트는 '–' 를 그린다(0 폴백 금지).

★ A/B 완전 분리: 모든 쿼리에 trader_id 필터가 붙는다.
  실측(2026-07-17): 같은 테이블에서 A=24건 45.8% / B=14건 71.4% / 합계 38건 55.3%.
  화면의 "24건·45.8%" 는 A 기준으로 정확했다. 합계로 계산하면 틀린다.
"""
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
import sqlite3, os, json

KST = ZoneInfo("Asia/Seoul")
DB_PATH = os.path.join(os.path.expanduser("~"), "trading.db")

SAMPLE_TARGET = 30          # 정식 통계 전환 기준
HIT_RATE_LOCK_N = 50        # 자기검증 탭의 '50건 미만 규칙조정 보류'와 통일
REASON_MIN_SHOW = 5         # 사유별 정확도 표시 하한
NOTIONAL_PER_CASE = 1_000_000

_cache = {"at": None, "trader": None, "data": None}
CACHE_SEC = 60


def _today():
    return datetime.now(KST).strftime("%Y-%m-%d")


def _conn():
    c = sqlite3.connect(DB_PATH, timeout=5)
    c.row_factory = sqlite3.Row
    return c


def _one(c, sql, args=(), default=0):
    r = c.execute(sql, args).fetchone()
    return (r[0] if r and r[0] is not None else default)


def build(trader_id="A"):
    t = "B" if str(trader_id).upper() == "B" else "A"
    today = _today()
    c = _conn()
    try:
        # ── sample: block_accuracy 검증 완료 (3거래일 경과분) ──────────
        verified = _one(c, "SELECT COUNT(*) FROM block_accuracy WHERE check_price IS NOT NULL AND trader_id=?", (t,))
        judgments_total = _one(c, "SELECT COUNT(*) FROM block_accuracy WHERE trader_id=?", (t,))
        phase = "official" if verified >= SAMPLE_TARGET else "learning"

        # ── block: 차단 적중률 ────────────────────────────────────────
        hit = _one(c, "SELECT COUNT(*) FROM block_accuracy WHERE result='SUCCESS' AND trader_id=?", (t,))
        hit_rate = round(hit / verified, 3) if verified else None
        # 회피 손실: 차단 후 수익률이 내렸으면(+) 회피, 올랐으면(-) 놓친 수익.
        #   price_change_pct 는 채점기가 T+3 거래일 기준으로 채운다(S18 E-4 수정본).
        pcs = [r[0] for r in c.execute(
            "SELECT price_change_pct FROM block_accuracy WHERE check_price IS NOT NULL AND trader_id=? AND price_change_pct IS NOT NULL",
            (t,)).fetchall()]
        avoided = int(round(sum(NOTIONAL_PER_CASE * (-p / 100.0) for p in pcs))) if pcs else 0

        # ── reason_accuracy: 사유별. shown=false 도 배열에 포함해 반환 ──
        rows = c.execute("""
            SELECT block_reason AS reason,
                   COUNT(*) AS total,
                   SUM(CASE WHEN result='SUCCESS' THEN 1 ELSE 0 END) AS hit
            FROM block_accuracy
            WHERE check_price IS NOT NULL AND trader_id=?
            GROUP BY block_reason ORDER BY total DESC
        """, (t,)).fetchall()
        reason_accuracy = [
            {"reason": r["reason"] or "미기재", "hit": r["hit"] or 0, "total": r["total"],
             "shown": (r["total"] or 0) >= REASON_MIN_SHOW}
            for r in rows
        ]

        # ── vs_ai: pending_signals. 채점 완료 = done ──────────────────
        scored = _one(c, "SELECT COUNT(*) FROM pending_signals WHERE trader_id=? AND status='done'", (t,))
        pending_n = _one(c, "SELECT COUNT(*) FROM pending_signals WHERE trader_id=? AND status IN ('pending','queued','approve_requested','approved')", (t,))

        # ── today ─────────────────────────────────────────────────────
        screened = _one(c, "SELECT COUNT(*) FROM screening_candidates WHERE trader_id=? AND date(created_at)=?", (t, today))
        # ★ B-4: 차단은 '중복 제거 후 종목 수'다.
        #   실측(2026-07-17): blocked_signals 28행 = 실제 7종목. 같은 사유가 최대 7번 반복 INSERT 됐다.
        blocked = _one(c, "SELECT COUNT(DISTINCT code) FROM blocked_signals WHERE trader_id=? AND date(date)=?", (t, today))
        bought = _one(c, "SELECT COUNT(*) FROM trades WHERE trader_id=? AND action LIKE '%BUY%' AND date(date)=?", (t, today))
        # 관심 = 스크리닝 통과 후보(매수 선별 '전'). screening_candidates 가 그 단계다.
        interested = screened
        candidates = blocked + bought

        # 국면·온도
        regime = _state(c, t, "regime_current")
        heat = _state(c, t, "heat_score_current")
        auto_mode = str(_state(c, t, "ai_autonomous_mode")).lower() in ("true", "1")

        # ── not_bought_reason — B-1 의 데이터 근거 ────────────────────
        #   ★ 지시서 5종에 'pending_approval' 을 추가했다.
        #     실측: Trader A 는 자율모드 ON 인데도 6/30 이후 매수 0건이다.
        #     08:50 분석 시점은 장 시작(09:00) 전이라 is_trading_time()=False → 자동매수 분기를
        #     탈 수 없고, 신호는 승인 대기로 넘어간 뒤 응답 없이 만료된다(expired 32 / rejected 16 / 체결 0).
        #     이 경우를 auto_mode_off 나 all_blocked 로 말하면 둘 다 거짓이 된다.
        if bought > 0:
            nbr = "bought"
        elif not auto_mode:
            nbr = "auto_mode_off"
        elif pending_n > 0:
            nbr = "pending_approval"
        elif screened == 0:
            nbr = "no_candidates"
        elif blocked > 0:
            nbr = "all_blocked"
        else:
            nbr = "no_candidates"

        data = {
            "as_of": datetime.now(KST).isoformat(timespec="seconds"),
            "app_version": _app_version(),
            "trader_id": t,
            "auto_mode": auto_mode,
            "sample": {"verified": verified, "target": SAMPLE_TARGET, "phase": phase,
                       "judgments_total": judgments_total},
            "vs_ai": {"scored": scored, "pending": pending_n, "win": 0, "lose": 0,
                      "first_match_done": scored > 0},
            "today": {"regime": regime, "heat": _int(heat),
                      "screened": screened, "interested": interested, "candidates": candidates,
                      "blocked": blocked, "bought": bought,
                      "not_bought_reason": nbr},
            "block": {"verified": verified, "hit": hit, "hit_rate": hit_rate,
                      "hit_rate_locked": verified < HIT_RATE_LOCK_N,
                      "avoided_loss_krw": avoided, "notional_per_case_krw": NOTIONAL_PER_CASE},
            "locked_metrics": _locked(verified),
            "reason_accuracy": reason_accuracy,
        }
        data["integrity"] = _integrity(data)
        return data
    finally:
        c.close()


def _locked(verified):
    m = ["profit_factor", "mdd"]
    if verified < HIT_RATE_LOCK_N:
        m.append("hit_rate")
    return m


def _state(c, t, key, default=None):
    r = c.execute("SELECT value FROM app_state WHERE trader_id=? AND key=?", (t, key)).fetchone()
    if not r:
        return default
    v = r[0]
    try:
        return json.loads(v)
    except Exception:
        return v


def _int(v, d=None):
    try:
        return int(float(v))
    except Exception:
        return d


def _app_version():
    try:
        return __import__("version").APP_VERSION
    except Exception:
        return "unknown"


def _integrity(d):
    """검산. 깨지면 500 이 아니라 integrity=FAIL + 로그. 화면은 '–'."""
    t, s, v, b = d["today"], d["sample"], d["vs_ai"], d["block"]
    checks = [
        ("screened>=interested", t["screened"] >= t["interested"]),
        ("screened>=candidates", t["screened"] >= t["candidates"]),
        ("candidates>=blocked+bought", t["candidates"] >= t["blocked"] + t["bought"]),
        ("verified<=judgments_total", s["verified"] <= s["judgments_total"]),
        ("win+lose==scored", v["win"] + v["lose"] == v["scored"]),
        ("hit<=verified", b["hit"] <= b["verified"]),
        ("reason_sum==verified", sum(r["total"] for r in d["reason_accuracy"]) == b["verified"]),
        ("phase_auto", s["phase"] == ("official" if s["verified"] >= s["target"] else "learning")),
        ("hit_rate_lock", b["hit_rate_locked"] == (s["verified"] < HIT_RATE_LOCK_N)),
        ("auto_off_no_buy", not (d["auto_mode"] is False and t["bought"] > 0)),
    ]
    bad = [n for n, ok in checks if not ok]
    if bad:
        print(f"[ai_stats] integrity FAIL: {bad}")
        return "FAIL"
    return "OK"


def get(trader_id="A"):
    """캐시 60초. 08:53 KST 직후(최종결정)엔 무효화."""
    t = "B" if str(trader_id).upper() == "B" else "A"
    now = datetime.now(KST)
    if (_cache["data"] and _cache["trader"] == t and _cache["at"]
            and (now - _cache["at"]).total_seconds() < CACHE_SEC
            and not (now.hour == 8 and 53 <= now.minute <= 55)):
        return _cache["data"]
    d = build(t)
    _cache.update({"at": now, "trader": t, "data": d})
    return d
