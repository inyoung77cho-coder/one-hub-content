# main.py — ONE-HUB v6.2
# ============================================================
# v6.2 수정사항 (2026-05-19): AI 자율 운영 모드 추가
#   [AI-1] AUTO_SELL_TIMEOUT: 매도 권유 후 N분 미응답 시 자동 매도
#          - 목표가 도달 알림 후 기본 10분 내 응답 없으면 자동 매도 실행
#          - 환경변수 AUTO_SELL_TIMEOUT_MINUTES (기본값 10)로 조정 가능
#          - /hold 코드 입력 시 해당 종목 자동 매도 취소 가능
#   [AI-2] AI_STRONG_BUY_AUTO: 강력 매수 신호 자동 즉시 실행
#          - final_score >= AI_STRONG_BUY_SCORE (기본 80) AND ml_conf == HIGH
#          - 조건 충족 시 사용자 승인 없이 즉시 매수 실행
#          - 환경변수 AI_STRONG_BUY_AUTO=true 로 활성화 (기본 비활성)
#          - 환경변수 AI_STRONG_BUY_SCORE (기본 80) 로 임계값 조정
#   [AI-3] AI_MODE 전역 제어: /aimode on|off|status 커맨드로 실시간 제어
#          - /aimode on  — AI 자율 운영 전체 활성화
#          - /aimode off — AI 자율 운영 전체 비활성화 (반자동 복귀)
#          - /aimode     — 현재 AI 자율 운영 설정 상태 확인
#
# v5.1 수정사항 (2026-05-13):
#   [Fix 1] APP_VERSION 단일 상수화 → /status, /help, 시작메시지 버전 통일
#   [Fix 2] /report 중복 출력 방지 → _report_lock 실행 락 적용
#   [Fix 3] regime 변수 미할당 오류 → evening_report() 상단 기본값 선언
#   [Fix 4] Blocked 통계 기준 분리 → /status에 누적/오늘 분리 표시
#   [Fix 5] 보유종목 신규 추천 제외 → _filter_holdings() 적용
#   [Fix 6] /buy 실계좌 5중 안전 검증 추가
#
# v5.0 개선사항 (2026-05-12 텔레그램 피드백 기반):
#
# [Bug #1] 중복 분석 완전 차단 강화
#   - _analysis_count 카운터 기반 직렬화 유지
#   - 추가: analysis_id 기반 pending 중복 삽입 방지
#     → 같은 세션에서 동일 코드 pending에 덮어쓰기 차단
#
# [Bug #2] 텔레그램 메시지 폭발 방지 (핵심 수정)
#   - 기존: send() dedup이 "AI Top 5종목 분석 완료" 메시지를 막지 못함
#     (매수 가능 종목 수가 달라지면 해시가 달라져 dedup 통과)
#   - 수정: _DEDUP_PREFIX_KEYS에 "AI Top" 추가
#   - 추가: format_valid_msg() 결과도 종목별 dedup TTL 300초로 연장
#   - 추가: "대기 중 (SIDEWAYS)" 메시지도 prefix dedup 처리
#
# [Bug #3] /global 중복 응답 (두 번 출력됨)
#   - 원인: get_global_summary() 내부 detect_market_regime() 호출이
#     2번 실행되어 send()가 2번 호출되는 race condition
#   - 수정: us_market_brief()와 _run_analysis()에서 호출하는
#     get_global_summary()를 스레드 락으로 보호
#   - 추가: /global 커맨드에 dedup 전용 플래그 적용
#
# [Bug #4] SIDEWAYS 점수 캐시 변동 (같은 종목 점수가 달라짐)
#   - 원인: screen_top_stocks()가 매 호출마다 yfinance re-fetch →
#     vol_ratio 등 수치가 미세하게 달라져 final_score 재계산됨
#   - 수정: _score_cache를 analysis_id 기반에서 date+code 기반으로 변경
#     → 당일 동일 코드는 첫 계산값 고정
#
# [Bug #5] 장 마감 후 /analyze 시 "7종목 대기" → "4종목 대기" 불일치
#   - 원인: 첫 analyze에서 pending에 7종목, 두 번째에서 중복 코드 제외 4종목
#   - 수정: _run_analysis() 시작 시 pending 초기화 옵션 추가
#     (장외 분석 모드에서는 pending을 덮어쓰지 않고 병합)
#
# [Bug #6] HnRobotics watchlist 반복 표시
#   - 원인: watchlist_today가 분석마다 덮어씌워짐
#   - 수정: 이미 watchlist에 있는 코드는 재분류 시 시간만 업데이트
#
# [Improve #1] /global 응답 속도 개선
#   - Fear&Greed API 호출을 캐시 (5분 TTL)하여 중복 HTTP 요청 제거
#
# [Improve #2] SIDEWAYS 대기 메시지 통합
#   - 분석 완료 후 "N종목 대기 중" 메시지를 1회만 전송
#   - 기존: valid_stocks 루프 + 마지막에 또 전송 → 중복
#   - 수정: 루프에서 제거, _run_analysis() 마지막에 1회 통합 전송
#
# [Improve #3] 커맨드 응답 안정성
#   - /analyze 이중 클릭 방어: 커맨드 수신 즉시 dedup 체크
#   - /buy, /sell 커맨드 처리 시 예외 발생해도 pending 정합성 유지
# ============================================================

import schedule
import time
import threading
import queue
import os
import uuid
from datetime import datetime, date
from dotenv import load_dotenv

load_dotenv()

# ── [Fix 1] APP_VERSION 단일 상수 — /status, /help, 시작메시지 모두 여기서 참조 ──
APP_VERSION     = "7.0"
APP_VERSION_STR = f"v{APP_VERSION}"

# ── [v7.0] 주말 차단 유틸 ──────────────────────────────────────────────
def _is_weekday() -> bool:
    """월~금(0~4) 여부 — 스케줄 함수에 사용."""
    from datetime import datetime as _dt
    return _dt.now().weekday() < 5

def _weekday_only(fn):
    """주말 실행 방지 데코레이터."""
    def wrapper(*args, **kwargs):
        if not _is_weekday():
            print(f"[WEEKEND] {fn.__name__} 스킵 (토/일)")
            return
        return fn(*args, **kwargs)
    wrapper.__name__ = fn.__name__
    return wrapper
# ──────────────────────────────────────────────────────────────────────

from kis_api import (get_access_token, get_balance, buy_order, sell_order,
                     get_current_price, get_order_result)
from config import MAX_BUY_AMOUNT, IS_REAL
from news_collector import (get_news, get_global_market, get_economic_indicators,
                             get_themed_news_message, get_portfolio_news)
# [v6.1] 카카오 알림 (KAKAO_NOTIFY_ENABLED=true 일 때만 작동)
try:
    from kakao_notify import send_kakao_alert, send_kakao_portfolio_news
    from kakao_token_refresh import refresh_access_token as kakao_refresh
    _KAKAO_AVAILABLE = True
except ImportError:
    _KAKAO_AVAILABLE = False
    def send_kakao_alert(*a, **kw): return False
    def send_kakao_portfolio_news(*a, **kw): return False
    def kakao_refresh(): return ""
from report import add_trade, generate_daily_report, generate_tomorrow_preview
from telegram_bot import send, send_force, send_critical, send_info, get_updates
from stock_screener import screen_top_stocks, STOCK_POOL
from strategy import (calc_rsi, calc_atr, detect_market_regime,
                      calc_market_heat_score,
                      calc_position_size_detailed,
                      calc_gap_filter, calc_sector_bonus, calc_regime_adjusted_threshold,
                      calc_technical_score, calc_macro_score, calc_final_score,
                      should_sell_atr, reset_highest, is_trading_time,
                      calc_position_size)
from db_logger import (log_trade, log_ai, log_error, log_daily, get_daily_stats,
                       log_blocked, get_blocked_stats,
                       sync_holdings_to_risk_monitor,
                       register_risk_position,
                       close_risk_position,
                       get_risk_positions)
from ml_predictor import predict as ml_predict, load_model as ml_load_model
from trade_journal import generate_daily_journal, save_journal, set_daily_note
from signal_validator import (validate_signal, classify_stock,
                               format_blocked_msg, format_valid_msg,
                               format_why_msg, format_watchlist_msg)
# [v7.0 P4] 분할매수 모듈
from position_sizer import (build_split_plan, get_next_leg, get_pending_legs,
                              mark_leg_done, is_split_complete,
                              check_leg2_trigger, check_leg3_trigger,
                              check_split_abort,
                              format_split_plan_msg, SPLIT_MODE)
# 분할매수 상태: {code: split_plan_dict}
split_plans: dict = {}

# [v7.0 P5] 전략 검증 기록
from strategy_stats import (record_trade_result, format_perf_summary,
                              format_weekly_report, check_weekly_loss_limit,
                              get_weekly_loss)

WEEKLY_LOSS_LIMIT_PCT: float = float(os.getenv("WEEKLY_LOSS_LIMIT_PCT", "7.0"))
MAX_POSITIONS:         int   = int(os.getenv("MAX_POSITIONS", "5"))  # 동시 보유 한도

# [v7.0 P6] 웹 대시보드 (DASHBOARD_ENABLED=true 일 때만)
_DASHBOARD_ENABLED = os.getenv("DASHBOARD_ENABLED", "true").lower() == "true"
if _DASHBOARD_ENABLED:
    try:
        from dashboard import start_dashboard
        import threading as _dash_thread
        _dash_thread.Thread(
            target=start_dashboard,
            kwargs={"port": int(os.getenv("DASHBOARD_PORT", "5050"))},
            daemon=True
        ).start()
        print("[DASHBOARD] http://localhost:5050 에서 접속 가능")
    except Exception as _de:
        print(f"[DASHBOARD] 시작 실패 (Flask 미설치?): {_de}")

# ── 전역 상태 ──────────────────────────────────────────────
daily_pnl      = 0
trading_on     = True
pending        = {}         # 승인 대기: {code: stock_dict}
blocked_today  = {}         # 오늘 차단: {code: (stock_dict, errors)}
approved_today = {}         # 오늘 승인 완료: {code: datetime}
tg_offset      = 0
trade_count    = 0
CHAT_ID_STR    = os.getenv("TELEGRAM_CHAT_ID", "")
MAX_DAILY_LOSS = -1_000_000

watchlist_today   = {}      # 관찰 후보: {code: {stock, reason, classified_at}}
monitor_positions = {}      # 매수 후 모니터링: {code: {...}}
hold_today        = {}      # /hold 보류 종목: {code: datetime}

last_regime  = "SIDEWAYS"
last_vix     = 20.0
last_market_data: dict = {}  # [v5.4] Market Heat Score용
last_heat_score: int = 50
last_heat_grade: str = "WARM"

# ── v5.0: 점수 캐시 — date+code 기반 (당일 고정) ──────────
# {f"{today}:{code}": {tech_score, macro_score, final_score}}
_score_cache: dict = {}

# ── v4.9: 분석 직렬화 ──────────────────────────────────────
_analysis_count   = 0
_analysis_lock    = threading.Lock()
_analysis_queue   = queue.Queue()
_current_analysis_id: str = ""

# ── v5.0: /global 중복 방지용 락 ──────────────────────────
_global_lock = threading.Lock()

# ── [Fix 2] /report 중복 출력 방지 락 ─────────────────────
_report_lock    = threading.Lock()
_report_running = False

# ── v4.9: Auto-Stop ────────────────────────────────────────
_auto_stop_timers: dict = {}
AUTO_STOP_DELAY_MINUTES: int = int(os.getenv("AUTO_STOP_DELAY_MINUTES", "30"))
AUTO_STOP_WARN_MINUTES:  int = AUTO_STOP_DELAY_MINUTES - 10

# ── v5.0: /analyze 커맨드 dedup (이중 클릭 방어) ───────────
_last_analyze_cmd_time: float = 0.0
ANALYZE_CMD_COOLDOWN: int = 30  # 30초 내 재입력 무시

# ══════════════════════════════════════════════════════════
# [v6.2] AI 자율 운영 설정
# ══════════════════════════════════════════════════════════

# [AI-1] 목표가 도달 후 N분 미응답 시 자동 매도 타이머
AUTO_SELL_TIMEOUT_MINUTES: int = int(os.getenv("AUTO_SELL_TIMEOUT_MINUTES", "10"))
_auto_sell_timers: dict = {}  # {code: {"alerted_at": float, "type": str, "warned": bool}}
_profit_alert_timers: dict = {}  # {code: last_alert_time} — 1시간 중복 차단



# ── [v7.1] profit_alert_timers 영속 저장 경로 ──

_PROFIT_TIMER_FILE = os.path.join(os.path.dirname(__file__), "profit_alert_timers.json")



def _load_profit_timers() -> dict:

    """서버 재시작 시 저장된 타이머 로드 (만료된 항목 자동 제거)."""

    try:

        if os.path.exists(_PROFIT_TIMER_FILE):

            import json as _json

            with open(_PROFIT_TIMER_FILE, "r") as _f:

                data = _json.load(_f)

            now = time.time()

            # 1시간(3600초) 이내 항목만 유지

            return {k: v for k, v in data.items() if now - v < 3600}

    except Exception as _e:

        print(f"[WARN] profit_timers 로드 실패: {_e}")

    return {}



def _save_profit_timers() -> None:

    """타이머 딕셔너리를 JSON 파일에 저장."""

    try:

        import json as _json

        now = time.time()

        # 만료된 항목 제거 후 저장

        valid = {k: v for k, v in _profit_alert_timers.items() if now - v < 3600}

        with open(_PROFIT_TIMER_FILE, "w") as _f:

            _json.dump(valid, _f)

    except Exception as _e:

        print(f"[WARN] profit_timers 저장 실패: {_e}")



# 시작 시 기존 타이머 로드

_profit_alert_timers.update(_load_profit_timers())

print(f"[STARTUP] profit_alert_timers 로드: {len(_profit_alert_timers)}건")

# [AI-2] 강력 매수 신호 자동 즉시 실행 설정
AI_STRONG_BUY_AUTO:    bool  = os.getenv("AI_STRONG_BUY_AUTO", "false").lower() == "true"
AI_STRONG_BUY_SCORE:   float = float(os.getenv("AI_STRONG_BUY_SCORE", "80"))
AI_STRONG_BUY_ML_PROB: float = float(os.getenv("AI_STRONG_BUY_ML_PROB", "75"))

# [AI-3] AI 자율 운영 전체 ON/OFF (런타임 /aimode 커맨드로 제어 가능)
AI_AUTONOMOUS_MODE: bool = AI_STRONG_BUY_AUTO

# ── ML 모델 로드 ────────────────────────────────────────────
try:
    _ml_model, _ml_scaler = ml_load_model()
    print("ML model loaded OK")
except Exception as _e:
    _ml_model, _ml_scaler = None, None
    print(f"ML model load failed: {_e}")


# ══════════════════════════════════════════════════════════
# 유틸 / 초기화
# ══════════════════════════════════════════════════════════


# ══════════════════════════════════════════════════════════
# [v5.2 Fix A] 재시작 시 보유종목 복구
# ══════════════════════════════════════════════════════════

def on_startup():
    """재시작 시 KIS 보유종목을 monitor_positions + risk_monitor DB에 복구.
    [v6.2 Fix B] KIS 실계좌 잔고와 DB를 교차검증:
      - KIS에 실제 보유 중인 종목만 monitor_positions 복구
      - DB에만 ACTIVE로 남아있는 종목(이미 매도됨)은 자동 CLOSED 처리
    """
    global monitor_positions
    print("[STARTUP] 보유종목 복구 시작...")
    try:
        token    = get_access_token()
        balance  = get_balance(token)
        holdings = balance.get("output1", [])

        # KIS 실계좌에서 실제 보유 중인 코드 추출 (qty > 0)
        kis_held = {}
        for h in holdings:
            code = (h.get("stck_shrn_iscd") or h.get("pdno", "")).strip()
            qty  = int(h.get("hldg_qty", 0))
            avg  = int(float(h.get("pchs_avg_pric", 0)))
            if code and qty > 0 and avg > 0:
                kis_held[code] = {"qty": qty, "avg": avg,
                                  "name": h.get("prdt_name", code)}

        if not kis_held:
            # KIS에 실보유 없음 → DB에 ACTIVE 잔재가 있으면 전부 닫기
            db_positions = get_risk_positions()
            if db_positions:
                stale_codes = [p["code"] for p in db_positions]
                for c in stale_codes:
                    close_risk_position(c, "STARTUP_SYNC_EMPTY")
                send(
                    f"[STARTUP] KIS 실보유 없음.\n"
                    f"DB 잔재 {len(stale_codes)}건 CLOSED 처리: {', '.join(stale_codes)}\n"
                    "신규 운영 시작."
                )
            else:
                send("[STARTUP] 보유종목 없음. 신규 운영 시작.")
            return

        # KIS 실보유 있음 → DB 동기화
        synced = sync_holdings_to_risk_monitor(holdings)

        # DB ACTIVE 포지션 중 KIS에 없는 종목 → 이미 매도됨, CLOSED 처리
        db_positions = get_risk_positions()
        stale_closed = []
        for pos in db_positions:
            if pos["code"] not in kis_held:
                close_risk_position(pos["code"], "STARTUP_SYNC_SOLD")
                stale_closed.append(pos["code"])
                print(f"[STARTUP] {pos['code']} KIS에 없음 → CLOSED 처리")

        # KIS 실보유 종목만 monitor_positions 복구
        # DB에서 최신 손절/목표 가져오고 없으면 기본값 계산
        recovered_db = {p["code"]: p for p in get_risk_positions()}
        recovered = 0
        for code, kis in kis_held.items():
            if code not in monitor_positions:
                db_p = recovered_db.get(code, {})
                avg  = kis["avg"]
                monitor_positions[code] = {
                    "name":       kis["name"],
                    "avg_price":  avg,
                    "qty":        kis["qty"],
                    "target":     db_p.get("target") or round(avg * 1.10),
                    "stop_loss":  db_p.get("stop_loss") or round(avg * 0.93),
                    "entry_time": db_p.get("entry_time") or "재시작복구",
                    "regime":     db_p.get("regime") or "UNKNOWN",
                }
                recovered += 1

        msg = (f"[STARTUP] {synced}개 종목 DB 동기화 완료\n"
               f"모니터링 재개: {recovered}종목\n")
        for code, p in monitor_positions.items():
            msg += (f"  • {p['name']}({code}) "
                    f"avg:{format(p['avg_price'],',')} "
                    f"손절:{format(p['stop_loss'],',')} "
                    f"목표:{format(p['target'],',')}\n")
        if stale_closed:
            msg += f"⚠️ DB 잔재 CLOSED: {', '.join(stale_closed)} (KIS에 없음)\n"
        print(msg)
        send(msg)
    except Exception as e:
        log_error(e, "on_startup")
        send(f"[STARTUP] 보유종목 복구 실패: {e}\n수동으로 /status 확인 후 /risk 재점검")


def reset_daily_state():
    global daily_pnl, trade_count, pending, blocked_today, approved_today
    global watchlist_today, hold_today, _auto_stop_timers, _auto_sell_timers
    global _score_cache, _current_analysis_id, _last_analyze_cmd_time
    daily_pnl = 0
    trade_count = 0
    pending.clear()
    blocked_today.clear()
    approved_today.clear()
    watchlist_today.clear()
    hold_today.clear()
    _auto_stop_timers.clear()
    _auto_sell_timers.clear()
    _score_cache.clear()
    _current_analysis_id = ""
    _last_analyze_cmd_time = 0.0
    split_plans.clear()   # [v7.0 P4]
    with _analysis_lock:
        global _analysis_count
        _analysis_count = 0
    print("[RESET] Daily state cleared | Monitoring: "
          + str(len(monitor_positions)) + "종목 계속")


# ══════════════════════════════════════════════════════════
# 시장 요약 (글로벌)
# ══════════════════════════════════════════════════════════

# v5.0: Fear&Greed 5분 캐시 (중복 HTTP 제거)
_fg_cache: dict = {"score": 50, "rating": "N/A", "ts": 0.0}
_FG_TTL = 300  # 5분


def _get_fear_greed_cached():
    """Fear&Greed를 5분 TTL로 캐시. 만료 시 재요청."""
    global _fg_cache
    if time.time() - _fg_cache["ts"] < _FG_TTL:
        return _fg_cache
    try:
        import requests as _req
        r = _req.get("https://api.alternative.me/fng/?limit=1", timeout=5)
        data = r.json()["data"][0]
        _fg_cache = {
            "score":  int(data["value"]),
            "rating": data["value_classification"],
            "ts":     time.time()
        }
    except Exception as _e:
        print(f"[F&G] 캐시 갱신 실패: {_e}")
    return _fg_cache


def get_global_summary():
    """
    v5.0: _global_lock으로 동시 호출 직렬화.
    /global 커맨드 연타 시 두 번째 호출이 첫 번째 결과를 재사용.
    """
    with _global_lock:
        return _get_global_summary_inner()


def _get_global_summary_inner():
    gm      = get_global_market()
    econ    = get_economic_indicators()
    nasdaq  = gm.get("nasdq", {})
    sp500   = gm.get("sp500", {})
    vix     = gm.get("vix", {})
    sox     = gm.get("sox", {})
    usdkrw  = gm.get("usdkrw", {})
    us10y   = gm.get("us10y", {})
    wti     = gm.get("wti", {})
    gold    = gm.get("gold", {})
    copper  = gm.get("copper", {})
    dxy     = gm.get("dxy", {})
    yc      = econ.get("yield_curve", {})

    # v5.0: Fear&Greed 캐시 사용
    fg = _get_fear_greed_cached()

    nasdaq_chg = nasdaq.get("change", 0)
    sox_chg    = sox.get("change", 0)
    vix_score  = vix.get("price", 20)
    fg_score   = fg.get("score", 50)
    dxy_chg    = dxy.get("change", 0)
    copper_chg = copper.get("change", 0)

    regime      = detect_market_regime(nasdaq_chg, vix_score, fg_score, sox_chg)
    macro_score = calc_macro_score(nasdaq_chg, sox_chg, vix_score, fg_score,
                                   dxy_chg, copper_chg)
    emoji = {"BEAR": "BEAR", "SIDEWAYS": "SIDE", "BULL": "BULL"}.get(regime, "?")

    msg  = "ONE-HUB Market Brief\n\n"
    msg += "[US Market]\n"
    msg += f"Nasdaq: {nasdaq.get('price','N/A')} ({nasdaq_chg}%)\n"
    msg += f"S&P500: {sp500.get('price','N/A')} ({sp500.get('change',0)}%)\n"
    msg += f"VIX: {vix_score}\n"
    msg += f"SOX: {sox.get('price','N/A')} ({sox_chg}%)\n"
    msg += f"DXY: {dxy.get('price','N/A')} ({dxy_chg}%)\n\n"
    msg += "[Commodities]\n"
    msg += f"WTI: ${wti.get('price','N/A')}  Gold: ${gold.get('price','N/A')}\n"
    msg += f"Copper: ${copper.get('price','N/A')} ({copper_chg}%)\n"
    msg += (f"USD/KRW: {usdkrw.get('price','N/A')}  "
            f"US10Y: {us10y.get('price','N/A')}%\n")
    msg += (f"YieldCurve: {yc.get('spread','N/A')}% "
            f"({'INVERTED' if yc.get('inverted') else 'Normal'})\n\n")
    msg += "[Sentiment]\n"
    msg += f"Fear&Greed: {fg_score} ({fg.get('rating','N/A')})\n"
    # [v5.4] Market Heat Score
    heat_score, heat_grade, heat_action, heat_detail = calc_market_heat_score(
        nasdaq_chg, sox_chg, vix_score, fg_score,
        float(usdkrw.get('price', 1490) or 1490)
    )

    msg += f"Macro Score: {macro_score}/100\n"
    msg += f"Market Heat: {heat_score}/100 ({heat_grade}) — {heat_action}\n\n"
    msg += f"[{emoji}] Market Regime: {regime}\n"
    if regime == "BEAR":
        msg += "BEAR MARKET: 신규 매수 차단\n"
    elif regime == "SIDEWAYS":
        msg += "SIDEWAYS: 선별 매수\n"
    else:
        msg += "BULL: 적극 매수 모드\n"

    # [v5.4] 전역 캐시 업데이트
    global last_heat_score, last_heat_grade, last_market_data
    last_heat_score = heat_score
    last_heat_grade = heat_grade
    last_market_data = {
        'nasdaq_chg': nasdaq_chg, 'sox_chg': sox_chg,
        'vix': vix_score, 'fear_greed': fg_score,
        'usdkrw': float(usdkrw.get('price', 1490) or 1490),
        'macro_score': macro_score,
        'fg_rating': fg.get('rating', 'N/A'),
    }
    return msg, regime, emoji, gm, macro_score


# ══════════════════════════════════════════════════════════
# 분석 실행 (직렬화)
# ══════════════════════════════════════════════════════════

def _get_held_codes() -> set:
    """
    [Fix 5] KIS 잔고에서 현재 보유 종목 코드 집합 반환.
    실패 시 빈 집합 반환 (분석 중단 없이 진행).
    """
    try:
        token    = get_access_token()
        balance  = get_balance(token)
        holdings = balance.get("output1", [])
        codes = set()
        for h in holdings:
            # KIS API 필드: stck_shrn_iscd(단축코드) 또는 pdno(상품번호)
            code = h.get("stck_shrn_iscd") or h.get("pdno", "")
            if code:
                codes.add(code.strip())
        return codes
    except Exception as _e:
        print(f"[WARN] 보유종목 조회 실패 (보유필터 스킵): {_e}")
        return set()


_last_analysis_time = 0

def morning_analysis():
    """
    v4.9e 유지: 카운터 기반 단일 슬롯 직렬화.
    v5.0 추가: _current_analysis_id 갱신을 락 내부에서 수행.
    """
    global _analysis_count, _last_analysis_time
    if time.time() - _last_analysis_time < 300:
        return
    _last_analysis_time = time.time()
    with _analysis_lock:
        if _analysis_count > 0:
            send("이미 분석 실행 중이거나 대기 중입니다.")
            return
        _analysis_count = 1
    _analysis_queue.put(True)


def _analysis_worker():
    global _analysis_count
    while True:
        _analysis_queue.get()
        try:
            _run_analysis()
        except Exception as e:
            log_error(e, "_analysis_worker")
            send("분석 오류: " + str(e))
            print("Analysis error:", e)
        finally:
            with _analysis_lock:
                _analysis_count = 0
            _analysis_queue.task_done()


def _run_analysis():
    """
    v5.0 핵심 수정:
    1. pending 병합 모드: 장외 분석 시 기존 pending 유지 + 신규만 추가
    2. 점수 캐시: date+code 기반 → 당일 동일 종목 점수 고정
    3. watchlist 중복: 기존 항목은 시간만 업데이트
    4. 분석 완료 후 "N종목 대기" 메시지 1회만 전송
    5. format_valid_msg dedup TTL 연장 (telegram_bot에서 처리)
    """
    global daily_pnl, pending, blocked_today, watchlist_today
    global last_regime, last_vix, _current_analysis_id, _score_cache

    if not trading_on:
        return

    _current_analysis_id = uuid.uuid4().hex[:8]
    today_str = date.today().isoformat()

    print(f"Analysis start: {datetime.now().strftime('%H:%M')} [id={_current_analysis_id}]")
    send("분석 시작...")
    send("ONE-HUB Analysis " + datetime.now().strftime("%Y-%m-%d %H:%M"))

    global_msg, regime, emoji, gm, macro_score = get_global_summary()
    last_regime = regime
    last_vix    = float(gm.get("vix", {}).get("price", 20))
    send(global_msg)
    time.sleep(1)

    # [v6.0] 뉴스 — BEAR/BULL 관계없이 항상 출력
    news     = get_news(max_items=15)
    news_msg = get_themed_news_message(news, max_per_theme=2)
    send(news_msg)

    # [v6.0 N4] 보유종목 관련 뉴스 (있을 때만 전송)
    try:
        token_news   = get_access_token()
        bal_news     = get_balance(token_news)
        holdings_now = bal_news.get("output1", [])
        portfolio_news_msg = get_portfolio_news(holdings_now, news)
        if portfolio_news_msg:
            send(portfolio_news_msg)
    except Exception as _pn_e:
        print(f"[NEWS] 보유종목 뉴스 조회 실패 (스킵): {_pn_e}")
    time.sleep(1)

    if regime == "BEAR":
        send("BEAR MARKET: 모든 신규 매수 차단. /status 로 보유 확인.")
        return

    # 뉴스 (아래 중복 블록 제거됨 — 위로 이동)

    # KIS 잔고 조회 [v7.1 장외 완전 차단]
    cash = 0
    if is_trading_time():
        try:
            token   = get_access_token()
            balance = get_balance(token)
            cash    = int(balance["output2"][0].get("dnca_tot_amt", 0))
        except Exception as _kis_e:
            send("KIS API 오류: " + str(_kis_e))
            log_error(_kis_e, "_run_analysis KIS")
            return
    else:
        cash = 10_000_000
        print("[v7.1] 장외시간 KIS 잔고 조회 생략")

    if daily_pnl <= MAX_DAILY_LOSS:
        send("CIRCUIT BREAKER: 일일 손실 한도 도달. 매매 중지.")
        return

    mode_tag = "" if is_trading_time() else " [장외분석]"
    send(f"Cash: {format(cash,',')} KRW | Regime: {regime}{mode_tag} | "
         f"{len(STOCK_POOL)}종목 스캔 중...")

    top_stocks = screen_top_stocks(news, top_n=5, regime=regime)

    # [Fix 5] 보유종목은 신규 매수 후보에서 제외 ─────────────
    held_codes = _get_held_codes()
    if held_codes:
        new_top    = [s for s in top_stocks if s.get("code","") not in held_codes]
        held_again = [s for s in top_stocks if s.get("code","") in held_codes]
        if held_again:
            msg = "[보유종목 신규매수 제외]\n"
            for s in held_again:
                msg += (f"  🔁 {s.get('name','')}({s.get('code','')})"
                        f" 이미 보유 → 추가매수 별도 판단\n")
            send(msg)
        top_stocks = new_top
    # ──────────────────────────────────────────────────────────

    # ML 신호 주입
    for stock in top_stocks:
        code = stock.get("code", "")
        ml_result = {}
        if _ml_model and code:
            try:
                ml_result = ml_predict(code, _ml_model, _ml_scaler)
            except Exception as _ml_e:
                print(f"[ML] {code} 예측 실패: {_ml_e}")
        stock["ml_signal"] = ml_result.get("signal", "HOLD")
        stock["ml_prob"]   = ml_result.get("prob", 50)
        stock["ml_conf"]   = ml_result.get("confidence", "LOW")

    # v5.0: 점수 계산 — date+code 기반 일일 캐시
    for stock in top_stocks:
        code      = stock.get("code", "")
        price     = stock.get("price", 0)
        rsi       = stock.get("rsi", 50)
        vol_ratio = stock.get("vol_ratio", 1)
        cache_key = f"{today_str}:{code}"

        cached = _score_cache.get(cache_key)
        if cached:
            stock["tech_score"]  = cached["tech_score"]
            stock["macro_score"] = cached["macro_score"]
            stock["final_score"] = cached["final_score"]
            stock["regime"]      = regime
            continue

        tech_score  = calc_technical_score(
            price, stock.get("ma5", price), stock.get("ma20", price),
            stock.get("ma20", price), rsi, vol_ratio, 50)
        ai_score    = stock.get("ai_score", 50)
        final_score = calc_final_score(tech_score, macro_score, ai_score,
                                       min(vol_ratio * 40, 100))
        # Macro Score 과대 반영 보정
        if macro_score > 80:
            final_score = max(0, final_score - (macro_score - 80) * 0.15)

        stock["tech_score"]  = int(tech_score)
        stock["macro_score"] = int(macro_score)
        stock["final_score"] = round(final_score, 1)
        stock["regime"]      = regime

        _score_cache[cache_key] = {
            "tech_score":  int(tech_score),
            "macro_score": int(macro_score),
            "final_score": round(final_score, 1),
        }

    # 3단계 분류
    valid_stocks     = []
    watchlist_stocks = []
    blocked_stocks   = []
    error_stocks     = []

    for stock in top_stocks:
        status, errors, reason = classify_stock(stock, vix=last_vix)
        stock["_status"] = status
        stock["_errors"] = errors
        stock["_reason"] = reason
        code = stock.get("code", "")

        if status == "VALID":
            valid_stocks.append(stock)
        elif status == "WATCHLIST":
            watchlist_stocks.append(stock)
            # v5.0: 이미 watchlist에 있으면 시간만 갱신
            if code in watchlist_today:
                watchlist_today[code]["classified_at"] = datetime.now().strftime("%H:%M")
            else:
                watchlist_today[code] = {
                    "stock": stock, "reason": reason,
                    "classified_at": datetime.now().strftime("%H:%M")
                }
        elif status == "ERROR":
            error_stocks.append(stock)
            blocked_today[code] = (stock, errors)
            try:
                log_blocked(stock, errors)
            except Exception as _e:
                print(f"log_blocked error: {_e}")
        else:  # BLOCKED
            blocked_stocks.append(stock)
            blocked_today[code] = (stock, errors)
            try:
                log_blocked(stock, errors)
            except Exception as _e:
                print(f"log_blocked error: {_e}")

    # 분석 요약 (1회 전송, dedup 처리됨)
    send(
        f"AI Top {len(top_stocks)}종목 분석 완료 (Regime: {regime})\n"
        "━━━━━━━━━━━━━━━━━━\n"
        f"매수 가능: {len(valid_stocks)}종목\n"
        f"관찰 후보: {len(watchlist_stocks)}종목\n"
        f"차단:      {len(blocked_stocks)}종목\n"
        f"데이터오류: {len(error_stocks)}종목"
    )
    time.sleep(0.5)

    # 유효 종목 처리
    new_pending_count = 0
    for stock in valid_stocks:
        code      = stock.get("code", "")
        price     = stock.get("price", 0)
        stop_loss = stock.get("stop_loss", 0)

        qty = calc_position_size(
            account_balance=cash,
            regime=regime,
            vix=last_vix,
            entry_price=int(price),
            stop_price=int(stop_loss) if stop_loss > 0 else int(price * 0.95)
        ) if price > 0 else 0

        if qty > 0 and price > 0:
            max_qty_by_amount = MAX_BUY_AMOUNT // int(price)
            qty = min(qty, max_qty_by_amount)

        buy_amt  = qty * int(price) if qty > 0 else 0
        risk_amt = qty * (int(price) - int(stop_loss)) if qty > 0 and stop_loss > 0 else 0

        log_ai(stock.get("name", ""), {
            "action": "BUY", "confidence": stock.get("ml_conf", ""),
            "ai_score": stock.get("ai_score", 50), "global_risk": regime,
            "key_signal": stock.get("ml_signal", "HOLD"),
            "reason": stock.get("reason", ""),
            "ml_prob": stock.get("ml_prob", 50)
        })

        if qty <= 0:
            send(
                f"⚠️ {stock.get('name','?')}({code})\n"
                "수량 0주: 리스크 기준상 매수 불가\n"
                "손절폭이 너무 좁거나 계좌잔고 부족\n"
                "→ WATCHLIST로 이동"
            )
            if code not in watchlist_today:
                watchlist_today[code] = {
                    "stock": stock, "reason": "수량 0주 (리스크 기준 미달)",
                    "classified_at": datetime.now().strftime("%H:%M")
                }
        elif cash >= buy_amt and code:
            # v5.0: 이미 pending에 있으면 덮어쓰기 않고 스킵 (중복 방지)
            if code not in pending:
                pending[code] = {
                    "name":        stock.get("name", ""),
                    "action":      "BUY",
                    "qty":         qty,
                    "price":       int(price),
                    "reason":      stock.get("reason", ""),
                    "buy_amt":     buy_amt,
                    "risk_amt":    risk_amt,
                    "final_score": stock.get("final_score", 0),
                    "regime":      regime,
                    "ml_signal":   stock.get("ml_signal", "HOLD"),
                    "target":      stock.get("target", 0),
                    "stop_loss":   stop_loss,
                    "rsi":         stock.get("rsi", 50),
                    "vol_ratio":   stock.get("vol_ratio", 1),
                    "tech_score":  stock.get("tech_score", 0),
                    "macro_score": stock.get("macro_score", 0),
                    "ai_score":    stock.get("ai_score", 50),
                    "ma_cross":    stock.get("ma_cross", False),
                    "analysis_id": _current_analysis_id,
                }
                # [v7.0 P4] 분할매수 계획 생성
                split_plans[code] = build_split_plan(
                    total_qty=qty, regime=regime,
                    entry_price=int(price),
                    stop_loss=int(stop_loss) if stop_loss else int(price * 0.93),
                    target=int(stock.get("target", 0)),
                )
                new_pending_count += 1

                # ── [AI-2] 강력 매수 신호 자동 즉시 실행 ──────────────
                if (AI_AUTONOMOUS_MODE and is_trading_time()
                        and _is_strong_buy_signal(stock)):
                    time.sleep(0.5)
                    _ai_auto_buy(code, stock, cash, regime)
                    continue  # 자동 매수된 종목은 아래 format_valid_msg 스킵
                # ─────────────────────────────────────────────────────

            send(format_valid_msg(stock, emoji))
        else:
            send(format_valid_msg(stock, emoji))
        time.sleep(1)

    # WATCHLIST 발송
    if watchlist_stocks:
        wl_lines = [f"[WATCHLIST] 관찰 후보 {len(watchlist_stocks)}종목"]
        for s in watchlist_stocks:
            score = s.get("final_score", 0)
            ml    = s.get("ml_signal", "?")
            min_v = 62 if regime == "SIDEWAYS" else 60
            gap   = round(min_v - score, 1)
            wl_lines.append(
                f"  👀 {s.get('name','?')}({s.get('code','?')})"
                f" Score:{score} / 기준{min_v}"
                f" ({gap}점 부족)"
                f" ML:{ml}"
            )
        wl_lines.append("/watchlist 로 상세 확인")
        send("\n".join(wl_lines))

    # BLOCKED / ERROR 요약
    all_blocked = blocked_stocks + error_stocks
    if all_blocked:
        bl_lines = [f"[BLOCKED] {len(blocked_stocks)}종목  [ERROR] {len(error_stocks)}종목"]
        for s in all_blocked:
            status_tag = "ERR" if s.get("_status") == "ERROR" else "BLK"
            score_s   = s.get("final_score", 0)
            regime_s  = s.get("regime", "?")
            min_vs    = 62 if regime_s == "SIDEWAYS" else 60
            gap_s     = round(min_vs - score_s, 1) if score_s < min_vs else 0
            score_tag = (f" Score:{score_s}/-{gap_s}점" if gap_s > 0
                         else f" Score:{score_s}")
            bl_lines.append(
                f"  [{status_tag}] {s.get('name','?')}({s.get('code','?')})"
                f"{score_tag}"
                f" → {s.get('_reason') or ' / '.join(s.get('_errors',[]))}"
            )
        bl_lines.append("/blocked 상세 | /why 코드 이유")
        send("\n".join(bl_lines))

    # v5.0: 대기 메시지 1회만 통합 전송
    if pending:
        total_pending = len(pending)
        if regime == "SIDEWAYS":
            send(
                f"{total_pending}종목 대기 중 (SIDEWAYS)\n"
                "/approve_all: SIDEWAYS 장에서는 개별 승인 권장\n"
                "/pending 목록 확인 후 /buy 코드 로 개별 승인하세요."
            )
        else:
            send(
                f"{total_pending}종목 대기 중\n"
                "/approve_all — 안전 종목 일괄 승인\n"
                "/pending — 대기 목록\n"
                "/watchlist — 관찰 후보 목록"
            )
    else:
        wl_count = len(watchlist_stocks)
        if wl_count > 0:
            send(f"오늘 매수 후보 없음. Regime: {regime}\n"
                 f"관찰 후보 {wl_count}개 있음 → /watchlist 확인")
        else:
            send(f"오늘 매수 후보 없음. Regime: {regime}")


# ══════════════════════════════════════════════════════════
# 예약 분석 / 리포트
# ══════════════════════════════════════════════════════════

def us_market_brief():
    try:
        # v5.0: get_global_summary() 사용 (락 포함, F&G 캐시 사용)
        msg, regime, emoji, gm, macro_score = get_global_summary()
        nasdaq  = gm.get("nasdq", {})
        sox     = gm.get("sox", {})
        vix     = gm.get("vix", {})
        fg      = _get_fear_greed_cached()

        nasdaq_chg = nasdaq.get("change", 0)
        sox_chg    = sox.get("change", 0)
        vix_v      = vix.get("price", 20)
        fg_v       = fg.get("score", 50)

        if vix_v > 25 or nasdaq_chg < -2:
            signal = "RISK-OFF: 오늘 매수 자제"
        elif nasdaq_chg > 1 and sox_chg > 1:
            signal = "RISK-ON: 적극 매수 모드"
        else:
            signal = "NEUTRAL: 선별 접근"

        brief  = "ONE-HUB Morning Brief 07:00\n\n"
        brief += f"Nasdaq: {nasdaq.get('price','N/A')} ({nasdaq_chg}%)\n"
        brief += f"SOX: {sox.get('price','N/A')} ({sox_chg}%)\n"
        brief += f"VIX: {vix_v}\n"
        brief += f"Fear&Greed: {fg_v} ({fg.get('rating','N/A')})\n\n"
        brief += f"Regime: {regime}\n"
        brief += signal + "\n\n"
        brief += "08:50 AI 분석 시작 예정..."
        send(brief)
    except Exception as e:
        log_error(e, "us_market_brief")


def evening_report():
    # [Fix 2] 중복 실행 방지 락
    global _report_running
    with _report_lock:
        if _report_running:
            send("⏳ 리포트 생성 중입니다. 잠시 후 확인하세요.")
            return
        _report_running = True

    # [Fix 3] regime 기본값 선언 → 함수 어디서든 안전하게 사용
    regime = "UNKNOWN"
    try:
        send_info("ONE-HUB Evening Report " + datetime.now().strftime("%Y-%m-%d"))
        token    = get_access_token()
        balance  = get_balance(token)
        cash     = int(balance["output2"][0].get("dnca_tot_amt", 0))
        holdings = balance.get("output1", [])
        # [v7.0 R1~R5] 강화된 리포트 생성
        report = generate_daily_report(
            cash, daily_pnl, holdings,
            regime=last_regime,
            heat_score=last_heat_score,
            pending_cnt=len(pending),
            watchlist_cnt=len(watchlist_today),
        )
        send_info(report)   # 수동 /report 요청이므로 send_info 사용
        stats = get_daily_stats()
        send_info(f"DB Stats: Trades={stats['count']} "
                  f"PnL={format(int(stats['pnl']),',')}KRW")
        time.sleep(1)
        news = get_news(max_items=10)

        # [Fix 3] regime 감지 — 실패 시 UNKNOWN 유지
        try:
            _, regime, _, _, _ = get_global_summary()
        except Exception as _re:
            print(f"[WARN] regime 감지 실패, UNKNOWN 유지: {_re}")

        top_stocks = screen_top_stocks(news, top_n=5, regime=regime)

        # [Fix 5] Tomorrow Preview에서 보유종목 분리
        held_codes = {s.get("stck_shrn_iscd", s.get("pdno", ""))
                      for s in holdings}
        new_stocks  = [s for s in top_stocks if s.get("code","") not in held_codes]
        held_stocks = [s for s in top_stocks if s.get("code","") in held_codes]

        # [v7.0 R4] 강화된 Preview — 시장 데이터 + 액션 플랜 포함
        preview = generate_tomorrow_preview(
            new_stocks, held_stocks,
            regime=regime,
            market_data=last_market_data,
        )
        send_info(preview)

        log_daily(regime, cash + daily_pnl, daily_pnl, trade_count)

        # [v5.4] 운영일지 자동 생성
        try:
            journal = generate_daily_journal(
                market_data=last_market_data,
                regime=regime,
                heat_score=last_heat_score,
                heat_grade=last_heat_grade,
                holdings=list(monitor_positions.values()),
                valid_signals=list(pending.values()),
                watchlist=list(watchlist_today.values()),
                blocked_today=blocked_today,
                daily_pnl=daily_pnl,
                cash=cash,
                trade_count=trade_count,
            )
            path = save_journal(journal)
            send(f"[일지] 오늘 운영일지 저장 완료\n{path}")
        except Exception as _je:
            log_error(_je, 'trade_journal')
            print(f'[JOURNAL] 생성 실패: {_je}')

        # [v6.1] 카카오 일일 요약 알림
        try:
            hold_list = list(monitor_positions.values())
            best  = max(hold_list, key=lambda x: x.get("pnl_pct", 0), default={})
            worst = min(hold_list, key=lambda x: x.get("pnl_pct", 0), default={})
            total_pnl_pct = round(daily_pnl / max(cash, 1) * 100, 2) if cash else 0
            send_kakao_alert("summary",
                total_pnl_pct = total_pnl_pct,
                best_stock    = best.get("name", "-"),
                worst_stock   = worst.get("name", "-"),
                cash          = cash,
            )
        except Exception as _ke:
            print(f"[KAKAO] 일일 요약 알림 실패: {_ke}")
    except Exception as e:
        log_error(e, "evening_report")
        send("Report error: " + str(e))
    finally:
        with _report_lock:
            _report_running = False


# ══════════════════════════════════════════════════════════
# [v6.2] AI 자율 운영 헬퍼 함수
# ══════════════════════════════════════════════════════════

def _is_strong_buy_signal(stock: dict) -> bool:
    """
    강력 매수 조건 판단:
      - final_score >= AI_STRONG_BUY_SCORE  (기본 80)
      - ml_conf == "HIGH"  OR  ml_prob >= AI_STRONG_BUY_ML_PROB (기본 75%)
      - ml_signal == "BUY"
    """
    score    = stock.get("final_score", 0)
    ml_conf  = stock.get("ml_conf", "LOW")
    ml_prob  = float(stock.get("ml_prob", 0))
    ml_sig   = stock.get("ml_signal", "HOLD")
    return (
        score >= AI_STRONG_BUY_SCORE
        and ml_sig == "BUY"
        and (ml_conf == "HIGH" or ml_prob >= AI_STRONG_BUY_ML_PROB)
    )


def _ai_auto_sell(code: str, pos: dict, reason: str):
    """AI 자율 매도 실행 (목표가 도달 타임아웃 / 수익 자동실현)"""
    global daily_pnl, trade_count, monitor_positions, _auto_sell_timers
    try:
        token   = get_access_token()
        current = get_current_price(token, code)
        qty     = pos.get("qty", 0)
        avg     = pos.get("avg_price", 0)
        name    = pos.get("name", code)
        if current <= 0 or qty <= 0:
            send_force(f"⚠️ [AI 자동매도 실패] {name}({code}): 현재가/수량 오류")
            return
        sell_order(token, code, qty)
        pnl = (current - avg) * qty
        daily_pnl   += pnl
        trade_count += 1
        add_trade(name, "AI_AUTO_SELL", qty, current, reason, pnl)
        log_trade(name, "AI_AUTO_SELL", current, qty, pnl, reason)
        monitor_positions.pop(code, None)
        _auto_sell_timers.pop(code, None)
        hold_today.pop(code, None)
        close_risk_position(code, "AI_AUTO_SELL")
        profit_pct = round((current - avg) / avg * 100, 2) if avg > 0 else 0
        send_force(
            f"🤖 [AI 자동매도 실행] {name}({code})\n"
            "━━━━━━━━━━━━━━━━━━\n"
            f"사유:   {reason}\n"
            f"체결가: {format(int(current), ',')}원  수량: {qty}주\n"
            f"수익률: {'+' if profit_pct >= 0 else ''}{profit_pct}%\n"
            f"손익:   {format(int(pnl), ',')}원\n"
            "━━━━━━━━━━━━━━━━━━\n"
            "📌 /hold 로 취소 불가 (이미 체결)"
        )
        print(f"[AI_AUTO_SELL] {code} {reason} 완료")
    except Exception as _e:
        log_error(_e, f"_ai_auto_sell {code}")
        send_force(
            f"⚠️ AI 자동매도 실패 ({code}): {_e}\n"
            f"수동으로 /sell {code} 처리하세요."
        )
        _auto_sell_timers.pop(code, None)


def _ai_auto_buy(code: str, stock: dict, cash: float, regime: str):
    """
    AI 강력 매수 신호 자동 즉시 실행.
    pending에서 꺼내 _execute_buy 위임.
    """
    global pending
    if code not in pending:
        return
    p = pending[code]
    name = p.get("name", code)
    score = stock.get("final_score", 0)
    ml_prob = stock.get("ml_prob", 0)
    send_force(
        f"🤖 [AI 강력매수 자동실행] {name}({code})\n"
        "━━━━━━━━━━━━━━━━━━\n"
        f"Score: {score}  ML확률: {ml_prob}%  ML신호: {stock.get('ml_signal','?')}\n"
        f"매수금액: {format(p.get('buy_amt', 0), ',')}원  수량: {p.get('qty', 0)}주\n"
        f"목표가: {format(p.get('target', 0), ',')}원  손절가: {format(p.get('stop_loss', 0), ',')}원\n"
        "━━━━━━━━━━━━━━━━━━\n"
        "⚡ 강력 신호 감지 → 사용자 승인 없이 자동 매수 실행"
    )
    _execute_buy(code, p, batch_mode=False)


# ══════════════════════════════════════════════════════════
# 매수 실행
# ══════════════════════════════════════════════════════════

def _execute_buy(code, p, batch_mode=False, leg_num: int = 1):
    """
    [v7.0 P4] leg_num: 몇 번째 분할 레그인지 (기본 1차).
    분할매수 활성 시 해당 레그 수량만 주문.
    """
    global trade_count, approved_today, pending, monitor_positions

    if not is_trading_time():
        name_ = p.get("name", "?")
        msg = (
            f"[장외차단] {name_}({code})\n"
            "매수 신호는 유효하나 KIS 주문은 장중(09:10~15:10)에만 실행됩니다.\n"
            f"내일 장중 /analyze 후 /buy {code} 로 재승인하세요."
        )
        pending.pop(code, None)
        if batch_mode:
            return f"  [장외차단] {name_}({code})"
        send(msg)
        return

    name      = p.get("name", "?")
    qty       = p.get("qty", 0)
    price     = p.get("price", 0)
    target    = p.get("target", 0)
    stop_loss = p.get("stop_loss", 0)
    regime    = p.get("regime", "?")
    score     = round(p.get("final_score", 0), 1)
    ml_signal = p.get("ml_signal", "?")

    # [v7.0 P4] 분할매수: 해당 레그 수량으로 교체
    sp = split_plans.get(code)
    if sp and sp.get("enabled"):
        legs = sp.get("legs", [])
        target_leg = next((l for l in legs if l["leg"] == leg_num and not l["done"]), None)
        if target_leg:
            qty = target_leg["qty"]
        # 마지막 레그가 아니면 pending 유지 (다음 레그 대기)
        is_last_leg = all(
            l["done"] or l["leg"] == leg_num
            for l in legs
        )
    else:
        is_last_leg = True

    total_amt  = qty * price
    risk_amt   = qty * (price - stop_loss) if stop_loss > 0 else 0
    upside_pct = round((target - price) / price * 100, 1) if price > 0 and target > price else 0
    risk_pct   = round((price - stop_loss) / price * 100, 1) if price > 0 and stop_loss > 0 else 0
    rr_ratio   = round((target - price) / (price - stop_loss), 2) if (price - stop_loss) > 0 else 0

    try:
        token = get_access_token()

        if IS_REAL and not batch_mode:
            # [v5.4] 상세 position size 정보
            try:
                _bal_v = get_balance(get_access_token())
                _cash_v = int(_bal_v['output2'][0].get('dnca_tot_amt', cash))
                _total_v = _cash_v + sum(
                    m.get('avg_price',0)*m.get('qty',0)
                    for m in monitor_positions.values())
            except Exception:
                _cash_v, _total_v = cash, cash
            _ps = calc_position_size_detailed(
                _total_v, _cash_v, regime, last_vix, int(price), int(stop_loss or price*0.93))
            _ps_note = f" ({_ps['note']})".rstrip() if _ps.get('note') else ''
            pre_msg = (
                "[매수 주문 접수]\n"
                "━━━━━━━━━━━━━━━━━━\n"
                f"{name}({code})\n"
                f"수량:    {qty}주  리스크{_ps['risk_pct_used']}% 기준{_ps_note}\n"
                "주문가:  시장가\n"
                f"예상금액: {format(total_amt, ',')}원\n"
                f"목표가:  {format(target, ',')}원 (+{upside_pct}%)\n"
                f"손절가:  {format(stop_loss, ',')}원 (-{risk_pct}%)\n"
                f"예상손실: -{format(risk_amt, ',')}원\n"
                f"손익비:  {rr_ratio}\n"
                f"Score:   {score} | ML:{ml_signal}\n"
                "━━━━━━━━━━━━━━━━━━\n"
                "Status: 주문 전송 중..."
            )
            send(pre_msg)

        buy_order(token, code, qty)
        add_trade(name, "BUY", qty, price, p.get("reason", ""))
        log_trade(name, "BUY", price, qty, 0, p.get("reason", ""), regime, score)
        trade_count += 1
        approved_today[code] = datetime.now()
        # [v7.0 P4] 마지막 레그일 때만 pending 제거
        if is_last_leg:
            pending.pop(code, None)

        # 체결 확인
        time.sleep(3)
        filled_qty   = qty
        filled_price = price
        if IS_REAL:
            try:
                orders = get_order_result(token, code)
                buys = [o for o in orders if o["side"] == "BUY" and o["qty"] > 0]
                if buys:
                    filled_qty   = buys[-1]["qty"]
                    filled_price = buys[-1]["price"] or price
            except Exception as _e:
                print(f"order_result error: {_e}")

        # [v7.0 P4] split_plan 레그 완료 처리 + monitor_positions 수량 누적
        sp = split_plans.get(code)
        if sp and sp.get("enabled"):
            sp = mark_leg_done(sp, leg_num, filled_price)
            split_plans[code] = sp
            # 기존 포지션이 있으면 수량 합산 (분할 2·3차)
            if code in monitor_positions:
                existing = monitor_positions[code]
                old_qty   = existing["qty"]
                old_avg   = existing["avg_price"]
                new_qty   = old_qty + filled_qty
                new_avg   = round((old_avg * old_qty + filled_price * filled_qty) / new_qty)
                monitor_positions[code].update({
                    "qty":       new_qty,
                    "avg_price": new_avg,
                })
            else:
                monitor_positions[code] = {
                    "name":       name,
                    "avg_price":  filled_price,
                    "qty":        filled_qty,
                    "target":     target,
                    "stop_loss":  stop_loss,
                    "entry_time": datetime.now().strftime("%H:%M"),
                    "regime":     regime,
                }
        else:
            monitor_positions[code] = {
                "name":       name,
                "avg_price":  filled_price,
                "qty":        filled_qty,
                "target":     target,
                "stop_loss":  stop_loss,
                "entry_time": datetime.now().strftime("%H:%M"),
                "regime":     regime,
            }

        # [v5.2 Fix B] risk_monitor DB에도 즉시 등록
        register_risk_position(
            code=code, name=name, avg_price=filled_price,
            stop_loss=stop_loss, target=target,
            qty=filled_qty, regime=regime,
        )

        # [v7.0 P4] 체결 메시지 — 분할 정보 포함
        sp = split_plans.get(code)
        pending_legs = get_pending_legs(sp) if sp and sp.get("enabled") else []
        split_status = ""
        if sp and sp.get("enabled"):
            completed_cnt = sum(1 for l in sp["legs"] if l["done"])
            total_cnt     = len(sp["legs"])
            split_status  = f"\n분할진행: {completed_cnt}/{total_cnt}차 완료"
            if pending_legs:
                nl = pending_legs[0]
                split_status += f"\n다음({nl['leg']}차 {nl['qty']}주): {nl['trigger']}"
                if SPLIT_MODE == "manual":
                    split_status += f"\n→ /buy{nl['leg']} {code}"

        ok_msg = (
            "[체결 완료]\n"
            "━━━━━━━━━━━━━━━━━━\n"
            f"{name}({code}){(' ' + str(leg_num) + '차') if sp and sp.get('enabled') else ''}\n"
            f"체결수량: {filled_qty}주\n"
            f"체결금액: {format(filled_qty * filled_price, ',')}원\n"
            f"평단가:   {format(filled_price, ',')}원\n"
            f"목표가:   {format(target, ',')}원 (+{upside_pct}%)\n"
            f"손절가:   {format(stop_loss, ',')}원 (-{risk_pct}%)\n"
            f"모니터링: 자동 시작{split_status}\n"
            "━━━━━━━━━━━━━━━━━━\n"
            f"취소(미체결): /cancel_today {code}"
        )

        if batch_mode:
            return f"  OK {name}({code}) {filled_qty}주 @{format(filled_price, ',')}"
        else:
            send(ok_msg)
            # [v6.1] 카카오 매수 알림
            send_kakao_alert("buy",
                name=name, code=code,
                price=filled_price, qty=filled_qty,
                amount=filled_qty * filled_price)
            return ok_msg

    except Exception as e:
        log_error(e, "buy " + code)
        # v5.0: 예외 발생해도 pending에서 제거하지 않음 (재시도 가능하게)
        err_msg = f"Buy error {name}({code}): {e}"
        send(err_msg)
        return f"  ERR {name}: {e}"


# ══════════════════════════════════════════════════════════
# 커맨드 핸들러
# ══════════════════════════════════════════════════════════

def handle_commands():
    global tg_offset, trading_on
    while True:
        try:
            updates = get_updates(offset=tg_offset)
            for update in updates:
                tg_offset = update["update_id"] + 1
                msg  = update.get("message", {})
                text = msg.get("text", "").strip()
                chat = str(msg.get("chat", {}).get("id", ""))
                if chat != CHAT_ID_STR:
                    continue
                print("[CMD]", text)
                _handle_single_command(text)
        except Exception as e:
            log_error(e, "handle_commands")
            print("Command error:", e)
        time.sleep(2)


_cmd_dedup: dict = {}  # {cmd: last_time} 명령어 중복 처리 방지

def _handle_single_command(text):
    global daily_pnl, trade_count, trading_on, watchlist_today, pending
    global blocked_today, approved_today, monitor_positions, hold_today
    global last_regime, _last_analyze_cmd_time, _cmd_dedup
    # 5초 내 동일 명령어 중복 차단
    import time as _time
    _now = _time.time()
    if _cmd_dedup.get(text, 0) > _now - 5:
        print(f"[CMD_DEDUP] 중복 차단: {text}")
        return
    _cmd_dedup[text] = _now

    # ── /buy ─────────────────────────────────────────────
    if text == "/buy":
        send("종목코드를 함께 입력하세요.\n예: /buy 005930")
        return

    if text.startswith("/buy "):
        parts = text.split()
        if len(parts) < 2:
            send("종목코드를 입력하세요. 예: /buy 005930")
            return
        code = parts[1].strip()
        if code not in pending:
            if code in blocked_today:
                s, errors = blocked_today[code]
                send(format_blocked_msg(s, errors) + f"\n자세히: /why {code}")
            else:
                send(f"{code} 종목을 찾을 수 없습니다.\n대기 목록: /pending")
            return
        if code in approved_today:
            send(f"{code}는 {approved_today[code].strftime('%H:%M')}에 이미 승인되었습니다.")
            return
        p = pending.get(code)
        is_valid, errors = validate_signal(p, vix=last_vix)
        if not is_valid:
            pending.pop(code, None)
            blocked_today[code] = (p, errors)
            send(format_blocked_msg(p, errors))
            return

        # [Fix 6] 실계좌 5중 최종 안전 검증 ────────────────────
        if IS_REAL:
            buy_errors = []
            # 검증 1: 보유종목 중복
            hc = _get_held_codes()
            if code in hc:
                buy_errors.append(f"❌ [보유중복] 이미 보유 중인 종목입니다")
            # 검증 2: Pending 이중 승인
            if code in approved_today:
                buy_errors.append(f"❌ [이중승인] 오늘 이미 승인된 종목입니다")
            # 검증 3: 일일 매수 한도 (기본 5건)
            MAX_DAILY_BUYS = int(os.getenv("MAX_DAILY_BUYS", "5"))
            if trade_count >= MAX_DAILY_BUYS:
                buy_errors.append(
                    f"❌ [일일한도] 오늘 매수 {trade_count}건 / 한도 {MAX_DAILY_BUYS}건")
            # [v7.0] 검증 3b: 동시 보유 종목 한도
            if len(monitor_positions) >= MAX_POSITIONS:
                buy_errors.append(
                    f"❌ [보유한도] 동시 보유 {len(monitor_positions)}종목 / 한도 {MAX_POSITIONS}종목")
            # [v7.0] 검증 3c: BEAR 시 추가매수/물타기 금지
            if last_regime == "BEAR":
                buy_errors.append(
                    f"❌ [BEAR차단] BEAR 장세 — 신규/추가/물타기 전면 금지\n"
                    f"   현금 보존 우선. /hold 로 기존 포지션 관리하세요.")
            # [v7.0] 검증 3d: 주간 손실 한도 초과
            try:
                _cash_wl = cash if cash > 0 else 5_000_000
                if check_weekly_loss_limit(_cash_wl, WEEKLY_LOSS_LIMIT_PCT):
                    weekly_pnl = get_weekly_loss()
                    buy_errors.append(
                        f"❌ [주간손실] 이번 주 손실 {format(int(abs(weekly_pnl)),',')}원 "
                        f"— 한도 {WEEKLY_LOSS_LIMIT_PCT}% 초과\n"
                        f"   다음 주까지 매수 자제 권장")
            except Exception as _wl_e:
                print(f"[FIX6] 주간손실 체크 실패: {_wl_e}")
            # 검증 4: 현금 비중
            try:
                token_v  = get_access_token()
                bal_v    = get_balance(token_v)
                cash_v   = int(bal_v["output2"][0].get("dnca_tot_amt", 0))
                order_amt = p.get("price", 0) * p.get("qty", 0)
                if cash_v > 0 and order_amt / cash_v > 0.35:
                    buy_errors.append(
                        f"❌ [현금비중] 매수금액 {format(order_amt,',')}원 = 현금의 "
                        f"{round(order_amt/cash_v*100,1)}% (한도 35%)")
            except Exception as _ve:
                print(f"[Fix6] 현금비중 검증 실패 (스킵): {_ve}")
            # 검증 5: 섹터 집중도 경고 (차단 아닌 경고)
            stock_theme = p.get("theme", "")
            same_theme_count = sum(
                1 for pp in pending.values()
                if pp.get("theme","") == stock_theme and pp.get("regime","") == last_regime
            ) + sum(
                1 for mp in monitor_positions.values()
                if stock_theme and stock_theme in mp.get("name","")
            )
            if same_theme_count >= 3:
                buy_errors.append(
                    f"⚠️ [섹터집중] {stock_theme} 테마 {same_theme_count}종목 집중 주의")

            if buy_errors:
                # 경고(⚠️)만 있으면 통과, 차단(❌)이 있으면 중단
                hard_errors = [e for e in buy_errors if e.startswith("❌")]
                soft_warns  = [e for e in buy_errors if e.startswith("⚠️")]
                if hard_errors:
                    msg = f"⛔ {p.get('name','?')}({code}) 매수 차단\n\n"
                    msg += "\n".join(hard_errors)
                    if soft_warns:
                        msg += "\n\n" + "\n".join(soft_warns)
                    send(msg)
                    return
                else:
                    # 경고만 → 메시지 전송 후 계속 진행
                    send("⚠️ 매수 전 주의사항:\n" + "\n".join(soft_warns) +
                         f"\n\n진행하려면 /buy {code} 를 다시 입력하세요.")
        # ──────────────────────────────────────────────────────

        _execute_buy(code, p)
        return

    # ── [v7.0 P4] /buy2 /buy3 — 분할매수 2·3차 수동 승인 ──────
    if text.startswith("/buy2 ") or text.startswith("/buy3 "):
        leg_n = 2 if text.startswith("/buy2") else 3
        parts = text.split()
        if len(parts) < 2:
            send(f"사용법: /buy{leg_n} 종목코드")
            return
        code = parts[1].strip()
        sp   = split_plans.get(code)
        if not sp or not sp.get("enabled"):
            send(f"{code} 분할매수 계획이 없습니다.\n/buy {code} 로 1차 진입 후 사용하세요.")
            return
        target_leg = next((l for l in sp["legs"] if l["leg"] == leg_n and not l["done"]), None)
        if not target_leg:
            send(f"{code} {leg_n}차 레그가 없거나 이미 체결됐습니다.")
            return
        # 이전 레그 체결 확인
        prev_done = all(l["done"] for l in sp["legs"] if l["leg"] < leg_n)
        if not prev_done:
            send(f"{code} {leg_n-1}차 레그가 먼저 체결돼야 합니다.")
            return
        p = pending.get(code)
        if not p:
            send(f"{code} pending 정보가 없습니다. /status 확인.")
            return
        send(format_split_plan_msg(code, p.get("name", code), sp,
                                    p.get("target", 0), p.get("stop_loss", 0)))
        _execute_buy(code, p, leg_num=leg_n)
        return

    # ── /splitplan 코드 — 분할매수 계획 확인 ──────────────────────
    if text.startswith("/splitplan"):
        parts = text.split()
        if len(parts) < 2:
            if not split_plans:
                send("현재 진행 중인 분할매수 계획이 없습니다.")
                return
            lines = [f"[분할매수 현황] {len(split_plans)}건"]
            for c, sp in split_plans.items():
                p = pending.get(c) or monitor_positions.get(c, {})
                done = sum(1 for l in sp["legs"] if l["done"])
                total = len(sp["legs"])
                lines.append(f"  {p.get('name', c)}({c}): {done}/{total}차 완료")
            send("\n".join(lines))
            return
        code = parts[1].strip()
        sp   = split_plans.get(code)
        if not sp:
            send(f"{code} 분할매수 계획이 없습니다.")
            return
        p = pending.get(code) or monitor_positions.get(code, {})
        send(format_split_plan_msg(code, p.get("name", code), sp,
                                    p.get("target", 0), p.get("stop_loss", 0)))
        return

    # ── /sell ────────────────────────────────────────────
    if text.startswith("/sell "):
        parts = text.split()
        if len(parts) < 2:
            return
        code = parts[1].strip()
        # monitor_positions에 있는 경우 우선 처리
        pos = monitor_positions.get(code)
        if pos:
            try:
                token = get_access_token()
                qty   = pos.get("qty", 0)
                current = get_current_price(token, code)
                sell_order(token, code, qty)
                avg = pos.get("avg_price", current)
                pnl = (current - avg) * qty if current > 0 else 0
                daily_pnl   += pnl
                trade_count += 1
                add_trade(pos["name"], "SELL", qty, current, "수동 매도", pnl)
                log_trade(pos["name"], "SELL", current, qty, pnl, "수동 매도")
                monitor_positions.pop(code, None)
                _auto_stop_timers.pop(code, None)
                hold_today.pop(code, None)
                close_risk_position(code, "SOLD")   # [v5.2 Fix C]
                # [v7.0 P5] 전략 검증 기록
                try:
                    sp = split_plans.get(code, {})
                    record_trade_result(
                        stock_code=code, stock_name=pos["name"],
                        theme=pos.get("theme", ""),
                        regime=last_regime,
                        entry_price=avg,
                        exit_price=int(current),
                        qty=qty, pnl=pnl,
                        exit_reason="SELL",
                        final_score=pos.get("final_score", 0),
                        ml_signal=pos.get("ml_signal", ""),
                        rsi_at_entry=pos.get("rsi", 0),
                        split_leg=sp.get("legs", [{}])[-1].get("leg", 1) if sp else 1,
                        entry_time=pos.get("entry_time", ""),
                    )
                except Exception as _se:
                    print(f"[STATS] record_trade_result 실패: {_se}")
                split_plans.pop(code, None)
                send(f"SELL OK {pos['name']}({code})\n"
                     f"체결가: {format(int(current),',')}원  수량: {qty}주\n"
                     f"손익: {format(int(pnl),',')}원")
            except Exception as e:
                log_error(e, "sell " + code)
                send(f"Sell error: {e}")
        elif code in pending:
            p = pending.pop(code)
            send(f"Pending 취소: {p.get('name','?')}({code})")
        else:
            send(f"{code} 종목을 찾을 수 없습니다.")
        return

    # ── /skip ────────────────────────────────────────────
    if text.startswith("/skip "):
        parts = text.split()
        if len(parts) < 2:
            return
        code = parts[1].strip()
        if code in pending:
            p = pending.pop(code)
            send(f"Skipped {p.get('name','?')}({code})")
        else:
            send(f"{code} 종목을 찾을 수 없습니다.\n현재 대기: /pending")
        return

    # ── /approve_all ──────────────────────────────────────
    if text == "/approve_all":
        if last_regime == "SIDEWAYS":
            send(
                "SIDEWAYS 장에서는 /approve_all이 비활성화됩니다.\n"
                "이유: 개별 검토 없이 일괄 매수 시 손실 위험\n"
                "→ /pending 으로 목록 확인 후 /buy 코드 로 개별 승인하세요."
            )
            return
        if not pending:
            send("승인 대기 종목이 없습니다.")
            return
        safe_list    = []
        skipped_list = []
        for code, p in list(pending.items()):
            is_valid, errors = validate_signal(p, vix=last_vix)
            if is_valid:
                safe_list.append((code, p))
            else:
                skipped_list.append((code, p, errors))
                blocked_today[code] = (p, errors)
                pending.pop(code, None)
        if not safe_list:
            send("안전하게 승인 가능한 종목이 없습니다.\n차단 사유: /blocked")
            return
        lines = [f"/approve_all — {len(safe_list)}종목 승인"]
        if skipped_list:
            lines.append(f"{len(skipped_list)}종목 제외 (검증 실패)")
        for code, p in safe_list:
            result_msg = _execute_buy(code, p, batch_mode=True)
            lines.append(result_msg)
        send("\n".join(lines))
        return

    # ── /skip_all ─────────────────────────────────────────
    if text == "/skip_all":
        cnt = len(pending)
        pending.clear()
        send(f"Skipped all {cnt}")
        return

    # ── /pending ──────────────────────────────────────────
    if text == "/pending":
        if not pending:
            send("승인 대기 종목이 없습니다.")
            return
        lines = [f"승인 대기 ({len(pending)}종목)"]
        for code, p in pending.items():
            lines.append(
                f"  {p.get('name','?')}({code})"
                f" 점수:{round(p.get('final_score',0),1)}"
                f" ML:{p.get('ml_signal','?')}"
                f" RSI:{p.get('rsi','?')}"
                f" 목표:+{round((p.get('target',0)-p.get('price',1))/p.get('price',1)*100,1) if p.get('price') else '?'}%"
            )
        lines.append("\n/buy 코드  /approve_all  /skip 코드")
        send("\n".join(lines))
        return

    # ── /watchlist ────────────────────────────────────────
    if text == "/watchlist":
        if not watchlist_today:
            send("ℹ️ 오늘 관찰 후보가 없습니다.")
            return
        lines = [f"👀 관찰 후보 ({len(watchlist_today)}종목)"]
        lines.append("점수 기준 미달이지만 다음 분석에서 재검토 예정")
        lines.append("━━━━━━━━━━━━━━━━━━")
        for code, entry in watchlist_today.items():
            s      = entry["stock"]
            reason = entry["reason"]
            t      = entry["classified_at"]
            score  = s.get("final_score", 0)
            ml     = s.get("ml_signal", "?")
            price  = s.get("price", 0)
            target = s.get("target", 0)
            up_pct = round((target - price) / price * 100, 1) if price > 0 and target > price else 0
            lines.append(
                f"👀 {s.get('name','?')}({code})\n"
                f"   {reason}\n"
                f"   현재가: {format(int(price),',')}원"
                f"  목표: +{up_pct}%"
                f"  ML:{ml}"
                f"  ({t} 분류)"
            )
        lines.append("━━━━━━━━━━━━━━━━━━")
        lines.append("이유: /why 코드  |  다음분석: /analyze")
        send("\n".join(lines))
        return

    # ── /improve CODE ──────────────────────────────────────
    if text.startswith("/improve"):
        parts = text.split()
        if len(parts) < 2:
            send("사용법: /improve 종목코드\n예: /improve 000270\n\n차단/관찰 종목의 점수 상승 조건을 안내합니다.")
            return
        code = parts[1].strip()
        stock = None
        if code in blocked_today:
            stock, errors = blocked_today[code]
        elif code in watchlist_today:
            stock  = watchlist_today[code]["stock"]
            errors = []
        if not stock:
            send(f"{code} 종목 정보를 찾을 수 없습니다.")
            return
        errs = stock.get("_errors", errors if isinstance(errors, list) else [])
        send(format_why_msg(stock, errs))
        return

    # ── /blocked ──────────────────────────────────────────
    if text == "/blocked":
        if not blocked_today:
            send("오늘 차단된 종목이 없습니다.")
            return
        lines = [f"🚫 차단 종목 ({len(blocked_today)}개)"]
        lines.append("━━━━━━━━━━━━━━━━━━")
        for code, (s, errors) in blocked_today.items():
            score   = s.get("final_score", 0)
            tech_s  = s.get("tech_score", 0)
            macro_s = s.get("macro_score", 0)
            ml_sig  = s.get("ml_signal", "?")
            rsi_v   = s.get("rsi", 0)
            regime_ = s.get("regime", "?")
            min_v   = 62 if regime_ == "SIDEWAYS" else 60
            gap     = round(min_v - score, 1) if score < min_v else 0
            main_err = errors[0] if errors else "?"
            score_detail = (
                f" Score:{score}/{min_v} (-{gap}점)" if gap > 0
                else f" Score:{score}"
            )
            lines.append(
                f"  🚫 {s.get('name','?')}({code})\n"
                f"     {score_detail}"
                f" | Tech:{tech_s}"
                f" Macro:{macro_s}"
                f" ML:{ml_sig}"
                f" RSI:{rsi_v}\n"
                f"     → {main_err}"
            )
        lines.append("━━━━━━━━━━━━━━━━━━")
        lines.append("자세히: /why 종목코드")
        send("\n".join(lines))
        return

    # ── /why CODE ─────────────────────────────────────────
    if text.startswith("/why"):
        parts = text.split()
        if len(parts) < 2:
            send("사용법: /why 종목코드\n예: /why 000660")
            return
        code = parts[1].strip()
        if code in blocked_today:
            s, errors = blocked_today[code]
            send(format_why_msg(s, errors))
        elif code in watchlist_today:
            entry  = watchlist_today[code]
            s      = entry["stock"]
            reason = entry["reason"]
            score  = s.get("final_score", 0)
            regime_= s.get("regime", "?")
            min_v  = 62 if regime_ == "SIDEWAYS" else 60
            gap    = round(min_v - score, 1)
            send(
                f"👀 {s.get('name','?')}({code}) — WATCHLIST\n"
                "━━━━━━━━━━━━━━━━━━\n"
                f"현재가:  {format(int(s.get('price',0)),',')}원\n"
                f"점수:    {score} / 기준 {min_v} ({gap}점 부족)\n"
                f"ML신호:  {s.get('ml_signal','?')}\n"
                f"사유:    {reason}\n"
                "━━━━━━━━━━━━━━━━━━\n"
                "→ 매수 보류. 다음 분석에서 점수 상승 시 VALID 전환\n"
                "다음분석: /analyze"
            )
        elif code in pending:
            p = pending[code]
            send(f"{p.get('name','?')}({code})는 현재 승인 대기 중입니다.\n/buy {code}")
        else:
            stats = get_blocked_stats(days=7)
            found = [r for r in stats if r[0] == code]
            if found:
                r = found[0]
                send(f"{code} — 최근 7일 차단 기록:\n"
                     f"종목: {r[1]}\n"
                     f"사유: {r[2]}\n"
                     f"횟수: {r[3]}회")
            else:
                send(f"{code} 종목 정보를 찾을 수 없습니다.")
        return

    # ── /cancel_today / /ct ───────────────────────────────
    if text.startswith("/cancel_today") or text in ("/ct",) or text.startswith("/ct "):
        parts = text.split()
        if len(parts) < 2:
            if not approved_today:
                send(
                    "오늘 승인된 종목이 없습니다.\n\n"
                    "사용법: /cancel_today 종목코드\n"
                    "예: /cancel_today 000660\n"
                    "단축키: /ct 000660\n\n"
                    "⚠️ 시스템 승인 기록만 삭제 (실제 KIS 취소는 /orders 확인)"
                )
                return
            lines = ["오늘 승인 목록 (코드를 선택해 취소하세요)"]
            lines.append("━━━━━━━━━━━━━━━━━━")
            for c, dt in approved_today.items():
                pos = monitor_positions.get(c, {})
                is_filled = bool(pos.get("avg_price"))
                status = "체결완료 → /sell 사용" if is_filled else "미체결 취소 가능"
                lines.append(
                    f"  {pos.get('name', c)}({c}) "
                    f"{dt.strftime('%H:%M')} [{status}]"
                )
            lines.append("━━━━━━━━━━━━━━━━━━")
            lines.append("취소: /cancel_today 종목코드  |  단축: /ct 종목코드")
            send("\n".join(lines))
            return
        code = parts[1].strip()
        if code in monitor_positions and monitor_positions[code].get("avg_price"):
            pos = monitor_positions[code]
            send(
                f"{pos.get('name', code)}({code})는 이미 체결된 포지션입니다.\n"
                f"체결가: {format(pos.get('avg_price', 0), ',')}원  "
                f"수량: {pos.get('qty', 0)}주\n"
                "━━━━━━━━━━━━━━━━━━\n"
                f"매도하려면: /sell {code}"
            )
            return
        if code not in approved_today:
            send(
                f"{code}는 오늘 승인된 종목이 아닙니다.\n"
                "오늘 승인 목록: /cancel_today (단독 입력)"
            )
            return
        del approved_today[code]
        monitor_positions.pop(code, None)
        send(
            f"{code} 시스템 승인 기록 삭제 완료.\n"
            "━━━━━━━━━━━━━━━━━━\n"
            "⚠️ 실제 주문 취소 여부는 KIS 앱 또는 /orders 에서 확인하세요.\n"
            f"이미 체결된 경우 → /sell {code} 로 매도"
        )
        return

    # ── /hold CODE ────────────────────────────────────────
    if text.startswith("/hold"):
        parts = text.split()
        if len(parts) < 2:
            send("사용법: /hold 종목코드\n예: /hold 000270\n\n"
                 "다음 모니터링 사이클부터 알림이 다시 활성화됩니다.")
            return
        code = parts[1].strip()
        if code not in monitor_positions:
            send(f"{code}는 현재 모니터링 중인 종목이 아닙니다.")
            return
        hold_today[code] = datetime.now()
        _auto_stop_timers.pop(code, None)
        # [AI-1] 자동매도 타이머도 함께 해제
        _auto_sell_timers.pop(code, None)
        pos = monitor_positions[code]
        send(
            f"{pos.get('name',code)}({code}) 보류 설정.\n"
            "이번 알림을 무시하고 보유 유지합니다.\n"
            "Auto-Stop / AI 자동매도 타이머 모두 해제됩니다.\n"
            "다음 모니터링(10분 후)에서 재판단합니다.\n"
            f"매도 결정 시: /sell {code}"
        )
        return

    # ── /orders ───────────────────────────────────────────
    if text == "/orders":
        lines = ["[오늘 주문 현황]"]
        lines.append("━━━━━━━━━━━━━━━━━━")
        if approved_today:
            lines.append(f"✅ 승인 완료 ({len(approved_today)}건):")
            for code, dt in approved_today.items():
                pos = monitor_positions.get(code, {})
                avg_str = (f" 체결:{format(pos.get('avg_price',0),',')}원"
                           if pos.get("avg_price") else "")
                lines.append(
                    f"  {pos.get('name', code)}({code})"
                    f" {dt.strftime('%H:%M')}{avg_str}"
                )
        else:
            lines.append("  승인 완료 없음")
        if monitor_positions:
            lines.append("━━━━━━━━━━━━━━━━━━")
            lines.append(f"📊 모니터링 중 ({len(monitor_positions)}종목):")
            for code, pos in monitor_positions.items():
                avg   = pos.get("avg_price", 0)
                tgt   = pos.get("target", 0)
                stop  = pos.get("stop_loss", 0)
                pct   = round((tgt - avg) / avg * 100, 1) if avg > 0 else 0
                lines.append(
                    f"  {pos.get('name',code)}({code})"
                    f" avg:{format(avg,',')}"
                    f" 목표:{format(tgt,',')}(+{pct}%)"
                    f" 손절:{format(stop,',')}"
                )
        if hold_today:
            lines.append("━━━━━━━━━━━━━━━━━━")
            lines.append(f"⏸ 보류 중 ({len(hold_today)}종목):")
            for code, dt in hold_today.items():
                lines.append(f"  {code} ({dt.strftime('%H:%M')} 보류)")
        lines.append("━━━━━━━━━━━━━━━━━━")
        lines.append("실제 체결 내역은 KIS 앱에서 확인하세요.")
        send("\n".join(lines))
        return

    # ── [v6.2] /syncdb — KIS↔DB 강제 동기화 ─────────────────
    if text == "/syncdb":
        send("KIS↔DB 동기화 시작...")
        try:
            token    = get_access_token()
            balance  = get_balance(token)
            holdings = balance.get("output1", [])

            kis_held = {}
            for h in holdings:
                code = (h.get("stck_shrn_iscd") or h.get("pdno", "")).strip()
                qty  = int(h.get("hldg_qty", 0))
                avg  = int(float(h.get("pchs_avg_pric", 0)))
                if code and qty > 0 and avg > 0:
                    kis_held[code] = {"qty": qty, "avg": avg,
                                      "name": h.get("prdt_name", code)}

            db_positions = get_risk_positions()
            stale_closed = []
            for pos in db_positions:
                if pos["code"] not in kis_held:
                    close_risk_position(pos["code"], "SYNCDB_MANUAL")
                    stale_closed.append(f"{pos['name']}({pos['code']})")

            # monitor_positions도 KIS 기준으로 정리
            mon_removed = []
            for code in list(monitor_positions.keys()):
                if code not in kis_held:
                    monitor_positions.pop(code, None)
                    mon_removed.append(code)

            lines = ["[DB 동기화 완료]", "━━━━━━━━━━━━━━━━━━"]
            if kis_held:
                lines.append(f"KIS 실보유: {len(kis_held)}종목")
                for code, k in kis_held.items():
                    lines.append(f"  ✅ {k['name']}({code}) {k['qty']}주 avg:{format(k['avg'],',')}")
            else:
                lines.append("KIS 실보유: 없음")
            if stale_closed:
                lines.append(f"DB 잔재 CLOSED: {len(stale_closed)}건")
                for s in stale_closed:
                    lines.append(f"  🗑 {s}")
            if mon_removed:
                lines.append(f"모니터링 정리: {', '.join(mon_removed)}")
            if not stale_closed and not mon_removed:
                lines.append("✅ 이상 없음 — KIS와 DB 일치")
            send("\n".join(lines))
        except Exception as e:
            log_error(e, "syncdb")
            send(f"syncdb 오류: {e}")
        return

    # ── /risk ─────────────────────────────────────────────
    if text == "/risk":
        if not monitor_positions:
            send("현재 모니터링 중인 포지션이 없습니다.")
            return
        lines = ["[리스크 현황]"]
        lines.append("━━━━━━━━━━━━━━━━━━")
        total_risk = 0
        for code, pos in monitor_positions.items():
            avg    = pos.get("avg_price", 0)
            qty    = pos.get("qty", 0)
            stop   = pos.get("stop_loss", 0)
            tgt    = pos.get("target", 0)
            risk   = qty * (avg - stop) if avg > 0 and stop > 0 else 0
            upside = qty * (tgt - avg)  if avg > 0 and tgt > 0  else 0
            rr     = round((tgt - avg) / (avg - stop), 2) if avg > stop > 0 else 0
            total_risk += risk
            lines.append(
                f"{pos.get('name',code)}({code})\n"
                f"  매수가: {format(avg,',')}원  수량: {qty}주\n"
                f"  최대손실: -{format(int(risk),',')}원"
                f"  목표수익: +{format(int(upside),',')}원"
                f"  손익비: {rr}"
            )
        lines.append("━━━━━━━━━━━━━━━━━━")
        lines.append(f"총 최대 손실 노출: -{format(int(total_risk),',')}원")
        send("\n".join(lines))
        return

    # ── /status ───────────────────────────────────────────
    if text == "/status":
        try:
            token   = get_access_token()
            balance = get_balance(token)
            cash    = int(balance["output2"][0].get("dnca_tot_amt", 0))
            stocks  = balance.get("output1", [])
            stats   = get_daily_stats()

            # [Fix 4] Blocked 통계 분리: 전체(메모리) vs 오늘(DB)
            blocked_total = len(blocked_today)
            try:
                b_stats_today = get_blocked_stats(days=1)
                blocked_today_count = len(b_stats_today)
                top_err = b_stats_today[0][2].split("|")[0] if b_stats_today else ""
            except Exception:
                blocked_today_count = blocked_total
                top_err = ""

            lines   = [
                f"ONE-HUB {APP_VERSION_STR} Status",   # [Fix 1]
                f"Cash: {format(cash,',')} KRW",
                f"Daily PnL: {format(int(daily_pnl),',')} KRW",
                f"Trades today: {trade_count}",
                f"Auto: {'ON' if trading_on else 'OFF'}",
                f"Regime: {last_regime}",
                f"Pending: {len(pending)}",
                f"Blocked: {blocked_total}건(누적) / {blocked_today_count}건(오늘)",  # [Fix 4]
                f"Approved: {len(approved_today)}",
                f"Watchlist: {len(watchlist_today)}",
                f"DB trades: {stats['count']}",
            ]
            if top_err:
                lines.append(f"  주요사유: {top_err}")
            if stocks:
                real_holdings = [
                    s for s in stocks
                    if int(s.get("hldg_qty", 0)) > 0
                ]
                if real_holdings:
                    lines.append("Holdings:")
                    for s in real_holdings:
                        nm  = s.get("prdt_name", "")
                        qty = int(s.get("hldg_qty", 0))
                        avg = int(float(s.get("pchs_avg_pric", 0)))
                        evlu_pfls_rt = s.get("evlu_pfls_rt", "")  # 평가손익률
                        pfls_str = f" ({evlu_pfls_rt}%)" if evlu_pfls_rt else ""
                        lines.append(f"  {nm} {qty}주 avg:{format(avg,',')}{pfls_str}")
                else:
                    lines.append("Holdings: 없음")
            if monitor_positions:
                lines.append("Monitoring:")
                for code, pos in monitor_positions.items():
                    lines.append(
                        f"  {pos['name']}({code})"
                        f" 목표:{format(pos['target'],',')}"
                        f" 손절:{format(pos['stop_loss'],',')}"
                    )
            send("\n".join(lines))
        except Exception as e:
            log_error(e, "status")
            send("Error: " + str(e))
        return

    # ── /global ───────────────────────────────────────────
    if text == "/global":
        send("Fetching global data...")
        try:
            global_msg, regime, emoji, gm, macro_score = get_global_summary()
            send(global_msg)  # dedup이 prefix 기반으로 중복 차단
        except Exception as e:
            log_error(e, "global")
            send("Error: " + str(e))
        return

    # ── /stop / /start ────────────────────────────────────
    if text == "/stop":
        trading_on = False
        send("Auto trading STOPPED")
        return

    if text == "/start":
        trading_on = True
        send("Auto trading STARTED")
        return

    # ── /analyze ──────────────────────────────────────────
    if text == "/analyze":
        # v5.0: 이중 클릭 방어 (30초 내 재입력 무시)
        now_ts = time.time()
        if now_ts - _last_analyze_cmd_time < ANALYZE_CMD_COOLDOWN:
            remaining = int(ANALYZE_CMD_COOLDOWN - (now_ts - _last_analyze_cmd_time))
            send(f"분석 요청을 받았습니다.\n{remaining}초 후 재요청 가능합니다.")
            return
        _last_analyze_cmd_time = now_ts
        threading.Thread(target=morning_analysis, daemon=True).start()
        return

    # ── /report ───────────────────────────────────────────
    if text == "/report":
        # [Fix 2] 중복 클릭 방어: _report_running 미리 확인
        if _report_running:
            send("⏳ 리포트 생성 중입니다. 잠시 후 확인하세요.")
            return
        send("리포트 생성 중...")
        threading.Thread(target=evening_report, daemon=True).start()
        return

    # ── [v6.2] /aimode — AI 자율 운영 모드 제어 ──────────────
    if text.startswith("/aimode"):
        global AI_AUTONOMOUS_MODE, AI_STRONG_BUY_AUTO
        parts = text.split()
        sub   = parts[1].lower() if len(parts) > 1 else "status"

        if sub == "on":
            AI_AUTONOMOUS_MODE  = True
            AI_STRONG_BUY_AUTO  = True
            send(
                "🤖 [AI 자율 운영 모드 활성화]\n"
                "━━━━━━━━━━━━━━━━━━\n"
                f"✅ 강력매수 자동실행: ON  (Score≥{AI_STRONG_BUY_SCORE}, ML≥{AI_STRONG_BUY_ML_PROB}%)\n"
                f"✅ 목표가 자동매도:  ON  (도달 후 {AUTO_SELL_TIMEOUT_MINUTES}분 미응답 시 실행)\n"
                "━━━━━━━━━━━━━━━━━━\n"
                "⚠️ AI가 사용자 승인 없이 매수/매도를 실행합니다.\n"
                "/hold 코드 → 특정 종목 자동매도 취소\n"
                "/aimode off → 반자동 모드로 복귀"
            )

        elif sub == "off":
            AI_AUTONOMOUS_MODE  = False
            AI_STRONG_BUY_AUTO  = False
            # 진행 중인 자동매도 타이머 전체 해제
            _auto_sell_timers.clear()
            send(
                "🔒 [AI 자율 운영 모드 비활성화]\n"
                "━━━━━━━━━━━━━━━━━━\n"
                "반자동 모드로 복귀: 모든 매수/매도는 사용자 승인 필요\n"
                "진행 중이던 AI 자동매도 타이머 전체 해제됨\n"
                "Auto-Stop(손절) 타이머는 유지됩니다."
            )

        else:  # status
            auto_sell_list = list(_auto_sell_timers.keys()) or ["없음"]
            send(
                f"🤖 AI 자율 운영 현황 (v{APP_VERSION})\n"
                "━━━━━━━━━━━━━━━━━━\n"
                f"자율 운영 모드:    {'✅ ON' if AI_AUTONOMOUS_MODE else '🔒 OFF'}\n"
                f"강력매수 자동실행: {'✅ ON' if AI_STRONG_BUY_AUTO else '🔒 OFF'}\n"
                f"  ↳ 조건: Score≥{AI_STRONG_BUY_SCORE} & ML신호=BUY & ML확률≥{AI_STRONG_BUY_ML_PROB}%\n"
                f"목표가 자동매도:   {'✅ ON' if AI_AUTONOMOUS_MODE else '🔒 OFF'}\n"
                f"  ↳ 타임아웃: {AUTO_SELL_TIMEOUT_MINUTES}분  (환경변수 AUTO_SELL_TIMEOUT_MINUTES)\n"
                f"Auto-Stop(손절):   항상 ON (손절 후 {AUTO_STOP_DELAY_MINUTES}분)\n"
                "━━━━━━━━━━━━━━━━━━\n"
                f"자동매도 대기 중:  {', '.join(auto_sell_list)}\n"
                "/aimode on  — 자율 운영 활성화\n"
                "/aimode off — 반자동 복귀"
            )
        return

    # ── [v7.0] /weekly — 주간 리포트 ──────────────────────────────
    if text.startswith("/weekly"):
        parts = text.split()
        days  = 7
        if len(parts) > 1:
            try:
                days = int(parts[1])
            except ValueError:
                pass
        try:
            send_info(format_weekly_report(days))
        except Exception as _we:
            send(f"주간 리포트 오류: {_we}")
        return

    # ── [v7.0] /note — 감정/판단 기록 (일지 섹션 8) ────────────────
    if text.startswith("/note"):
        parts  = text.split(None, 1)
        if len(parts) < 2 or not parts[1].strip():
            send("사용법: /note [내용]\n예: /note 오늘 SOX 급락에 너무 빨리 손절한 것 같다\n\n일지 '8. 감정 기록' 섹션에 자동 저장됩니다.")
            return
        note_text = parts[1].strip()
        set_daily_note(note_text)
        send(f"📝 감정 기록 저장\n━━━━━━━━━━━━━━━━━━\n{note_text}\n━━━━━━━━━━━━━━━━━━\n오늘 일지 섹션 8에 반영됩니다.")
        return

    # ── [v7.0 P5] /perf — 전략 성과 조회 ─────────────────────────
    if text.startswith("/perf"):
        parts = text.split()
        days  = 30
        if len(parts) > 1:
            try:
                days = int(parts[1])
            except ValueError:
                pass
        days = max(1, min(days, 365))
        try:
            send_info(format_perf_summary(days))
        except Exception as _pe:
            send(f"성과 조회 오류: {_pe}")
        return

    # ── /help ─────────────────────────────────────────────
    if text == "/help":
        send(
            f"ONE-HUB {APP_VERSION_STR} Commands\n\n"   # [Fix 1]
            "[분석]\n"
            "/analyze — AI 분석 시작 (30초 쿨다운)\n"
            "/global  — 미국 시장\n\n"
            "[매매]\n"
            "/buy 코드    — 매수 승인 (1차 진입)\n"
            "/buy2 코드   — 2차 분할매수 승인\n"
            "/buy3 코드   — 3차 분할매수 승인\n"
            "/splitplan 코드 — 분할매수 계획 확인\n"
            "/sell 코드   — 매도 (모니터링 포지션 포함)\n"
            "/skip 코드   — 건너뛰기\n"
            "/approve_all — 안전 종목 일괄 승인 (BULL만)\n"
            "/skip_all    — 전체 건너뛰기\n\n"
            "[확인]\n"
            "/pending         — 승인 대기 목록 (목표% 포함)\n"
            "/watchlist       — 관찰 후보 목록\n"
            "/blocked         — 차단 종목 목록\n"
            "/why 코드        — 차단/관찰 이유 상세\n"
            "/improve 코드    — 점수 상승 조건 안내\n"
            "/cancel_today 코드 — 승인 기록 삭제 | /ct 단축키\n"
            "/hold 코드       — 손절/목표 알림 일시 보류 + Auto-Stop/자동매도 해제\n"
            f"⏰ Auto-Stop: 손절 알림 후 {AUTO_STOP_DELAY_MINUTES}분 미응답 시 자동 매도\n"
            "/orders          — 오늘 주문 현황 (목표% 포함)\n"
            "/risk            — 포지션 리스크 현황\n"
            "/status          — 계좌 현황 (Watchlist 수 포함)\n"
            "/syncdb          — KIS↔DB 강제 동기화\n\n"
            "[기록 / 성과]\n"
            "/note [내용]     — 감정/판단 기록 (일지 섹션 8)\n"
            "/perf            — 전략 성과 (기본 30일)\n"
            "/perf 7          — 7일 성과 조회\n"
            "/weekly          — 주간 리포트 (MDD/Best·Worst/AI정확도)\n\n"
            "[제어]\n"
            "/stop  — 자동매매 중지\n"
            "/start — 자동매매 시작\n"
            "/report — 일일 리포트\n\n"
            "[🤖 AI 자율 운영]\n"
            "/aimode          — AI 자율 운영 현황 확인\n"
            "/aimode on       — AI 자율 운영 활성화\n"
            "   ↳ 강력 신호(Score≥80, ML=BUY) 자동 매수\n"
            f"   ↳ 목표가 도달 후 {AUTO_SELL_TIMEOUT_MINUTES}분 미응답 시 자동 매도\n"
            "/aimode off      — 반자동 모드 복귀\n"
            "/hold 코드       — AI 자동매도 취소 + 보유 유지\n\n"
            "/help  — 도움말"
        )
        return


# ══════════════════════════════════════════════════════════
# 포지션 모니터링 (Auto-Stop 포함)
# ══════════════════════════════════════════════════════════

def run_position_monitor():
    """
    보유 포지션 목표가/손절가 도달 여부 자동 확인.
    10분마다 실행 (09:10~15:10)
    """
    global monitor_positions, hold_today, _auto_stop_timers
    if not monitor_positions or not is_trading_time():
        return
    try:
        token  = get_access_token()
        now_ts = time.time()

        # Auto-Stop 타이머 처리
        for code in list(_auto_stop_timers.keys()):
            if code not in monitor_positions:
                _auto_stop_timers.pop(code, None)
                continue
            timer   = _auto_stop_timers[code]
            elapsed = (now_ts - timer["alerted_at"]) / 60
            pos     = monitor_positions[code]
            name    = pos.get("name", code)

            if elapsed >= AUTO_STOP_WARN_MINUTES and not timer.get("warned"):
                remaining = AUTO_STOP_DELAY_MINUTES - int(elapsed)
                send_force(
                    f"⚠️ [Auto-Stop 경고] {name}({code})\n"
                    "━━━━━━━━━━━━━━━━━━\n"
                    f"손절 알림 후 {int(elapsed)}분 경과 — 응답 없음\n"
                    f"⏰ {remaining}분 후 자동 손절 실행 예정\n"
                    "━━━━━━━━━━━━━━━━━━\n"
                    f"  /sell {code}  — 지금 즉시 매도\n"
                    f"  /hold {code}  — 보류 (자동 손절 취소)"
                )
                timer["warned"] = True

            if elapsed >= AUTO_STOP_DELAY_MINUTES:
                try:
                    current = get_current_price(token, code)
                    qty     = pos.get("qty", 0)
                    avg     = pos.get("avg_price", 0)
                    sell_order(token, code, qty)
                    pnl = (current - avg) * qty if current > 0 else 0
                    global daily_pnl, trade_count
                    daily_pnl   += pnl
                    trade_count += 1
                    add_trade(name, "AUTO_STOP_SELL", qty, current,
                              "Auto-Stop 미응답", pnl)
                    log_trade(name, "AUTO_STOP_SELL", current, qty, pnl,
                              f"Auto-Stop {AUTO_STOP_DELAY_MINUTES}분 미응답")
                    monitor_positions.pop(code, None)
                    _auto_stop_timers.pop(code, None)
                    hold_today.pop(code, None)
                    close_risk_position(code, "AUTO_STOP")  # [v5.2 Fix C]
                    send_force(
                        f"🔴 [Auto-Stop 실행] {name}({code})\n"
                        "━━━━━━━━━━━━━━━━━━\n"
                        f"손절 알림 후 {AUTO_STOP_DELAY_MINUTES}분 미응답 → 자동 매도\n"
                        f"체결가: {format(int(current), ',')}원  수량: {qty}주\n"
                        f"손익: {format(int(pnl), ',')}원\n"
                        "━━━━━━━━━━━━━━━━━━"
                    )
                    # [v6.1] 카카오 손절 알림
                    try:
                        avg_p = monitor_positions.get(code, {}).get("avg_price", current)
                        loss_pct = round((current - avg_p) / avg_p * 100, 1) if avg_p else 0
                        send_kakao_alert("stop", name=name, code=code, loss_pct=abs(loss_pct))
                    except Exception:
                        pass
                    print(f"[AUTO_STOP] {code} 자동 매도 완료")
                except Exception as _ae:
                    log_error(_ae, f"auto_stop {code}")
                    send_force(
                        f"⚠️ Auto-Stop 매도 실패 ({code}): {_ae}\n"
                        f"수동으로 /sell {code} 처리하세요."
                    )
                    _auto_stop_timers.pop(code, None)

        # 포지션 순회
        for code, pos in list(monitor_positions.items()):
            try:
                current = get_current_price(token, code)
                if current <= 0:
                    continue
                name      = pos["name"]
                avg_price = pos["avg_price"]
                qty       = pos["qty"]
                target    = pos["target"]
                stop_loss = pos["stop_loss"]
                profit_pct = round((current - avg_price) / avg_price * 100, 2) if avg_price > 0 else 0

                if current >= target and code not in hold_today:
                    profit_krw = qty * (current - avg_price)

                    # ── [AI-1] 매도 권유 후 N분 미응답 자동 매도 타이머 시작 ──
                    if code not in _auto_sell_timers:
                        _auto_sell_timers[code] = {
                            "alerted_at": now_ts, "type": "target", "warned": False
                        }
                        auto_sell_notice = (
                            f"\n⏰ AI 자동매도: {AUTO_SELL_TIMEOUT_MINUTES}분 내 미응답 시 자동 매도 실행\n"
                            f"   /hold {code}  — 자동매도 취소 후 보유 유지"
                        ) if AI_AUTONOMOUS_MODE else (
                            f"\n  /hold {code}  — 보유 유지"
                        )
                        send(
                            f"🎯 [목표가 도달] {name}({code})\n"
                            "━━━━━━━━━━━━━━━━━━\n"
                            f"현재가:  {format(current, ',')}원\n"
                            f"목표가:  {format(target, ',')}원\n"
                            f"수익률:  +{profit_pct}%\n"
                            f"예상수익: +{format(int(profit_krw), ',')}원\n"
                            "━━━━━━━━━━━━━━━━━━\n"
                            f"  /sell {code}  — 즉시 매도"
                            + auto_sell_notice
                        )
                    else:
                        # 타이머 경과 체크
                        timer   = _auto_sell_timers[code]
                        elapsed = (now_ts - timer["alerted_at"]) / 60
                        warn_at = AUTO_SELL_TIMEOUT_MINUTES - 2  # 2분 전 경고

                        if elapsed >= warn_at and not timer.get("warned") and AI_AUTONOMOUS_MODE:
                            remaining = AUTO_SELL_TIMEOUT_MINUTES - int(elapsed)
                            send_force(
                                f"⚠️ [AI 자동매도 예고] {name}({code})\n"
                                "━━━━━━━━━━━━━━━━━━\n"
                                f"목표가 도달 후 {int(elapsed)}분 경과 — 응답 없음\n"
                                f"⏰ {remaining}분 후 자동 매도 실행 예정\n"
                                "━━━━━━━━━━━━━━━━━━\n"
                                f"  /sell {code}  — 즉시 매도\n"
                                f"  /hold {code}  — 자동매도 취소"
                            )
                            timer["warned"] = True

                        if elapsed >= AUTO_SELL_TIMEOUT_MINUTES and AI_AUTONOMOUS_MODE:
                            _ai_auto_sell(code, pos,
                                          f"목표가 도달 후 {AUTO_SELL_TIMEOUT_MINUTES}분 미응답 자동매도")
                            continue  # 매도 완료, 다음 종목으로

                elif current <= stop_loss and code not in hold_today:
                    risk_krw = qty * (avg_price - current)
                    if code not in _auto_stop_timers:
                        _auto_stop_timers[code] = {"alerted_at": now_ts, "warned": False}
                        # 목표가 타이머 정리 (손절 진입 시 목표 타이머 해제)
                        _auto_sell_timers.pop(code, None)
                        send_force(
                            f"🔻 [손절가 도달] {name}({code})\n"
                            "━━━━━━━━━━━━━━━━━━\n"
                            f"현재가:  {format(current, ',')}원\n"
                            f"손절가:  {format(stop_loss, ',')}원\n"
                            f"손실률:  {profit_pct}%\n"
                            f"예상손실: -{format(int(risk_krw), ',')}원\n"
                            "━━━━━━━━━━━━━━━━━━\n"
                            f"  /sell {code}  — 즉시 매도\n"
                            f"  /hold {code}  — 일시 보류\n"
                            f"⏰ {AUTO_STOP_DELAY_MINUTES}분 내 미응답 시 자동 손절 실행"
                        )

                else:
                    # 목표가/손절 해제된 경우 auto_sell 타이머 초기화
                    if code in _auto_sell_timers and current < target:
                        _auto_sell_timers.pop(code, None)
                    if code in _auto_stop_timers and current > stop_loss:
                        _auto_stop_timers.pop(code, None)
                        send(f"✅ {name}({code}) 손절선 회복 → Auto-Stop 해제")
                    elif profit_pct >= 5.0 and code not in _auto_sell_timers and (time.time() - _profit_alert_timers.get(code, 0) > 3600):
                        send(
                            f"📈 [수익 알림] {name}({code}) "
                            f"현재 +{profit_pct}% "
                            f"목표: {format(target, ',')}원"
                        )
                        _profit_alert_timers[code] = time.time()

                        _save_profit_timers()  # [v7.1] 영속 저장

                    # ── [v7.0 P4] 자동 분할 트리거 (auto 모드) ──────────
                    if SPLIT_MODE == "auto":
                        sp = split_plans.get(code)
                        if sp and sp.get("enabled") and code in pending:
                            p = pending[code]
                            pending_legs = get_pending_legs(sp)
                            if pending_legs:
                                nl = pending_legs[0]
                                # [v7.0] -3%/-5% 하락 시 추가매수 중단
                                abort, abort_reason = check_split_abort(sp, int(current))
                                if abort_reason == "warn":
                                    send_critical(
                                        f"⚠️ [분할매수 경고] {name}({code})\n"
                                        f"1차 진입가 대비 -5% 이상 하락\n"
                                        f"현재가: {format(int(current),',')}원\n"
                                        f"→ 손절 검토 권장. 추가매수 중단."
                                    )
                                    split_plans.pop(code, None)
                                elif abort_reason == "abort":
                                    send_critical(
                                        f"🚫 [분할매수 중단] {name}({code})\n"
                                        f"1차 진입가 대비 -3% 하락 → 추가매수 금지"
                                    )
                                    split_plans.pop(code, None)
                                else:
                                    rsi_now = pos.get("rsi", 50)
                                    vol_now = pos.get("vol_ratio", 1.0)
                                    triggered = False
                                    if nl["leg"] == 2 and check_leg2_trigger(sp, int(current)):
                                        triggered = True
                                    elif nl["leg"] == 3 and check_leg3_trigger(sp, rsi_now, vol_now):
                                        triggered = True
                                    if triggered:
                                        send_critical(
                                            f"🔀 [분할매수 자동 트리거] {name}({code}) "
                                            f"{nl['leg']}차\n"
                                            f"조건: {nl['trigger']}\n"
                                            f"수량: {nl['qty']}주"
                                        )
                                        _execute_buy(code, p, leg_num=nl["leg"])
                    # ───────────────────────────────────────────────────

            except Exception as _e:
                print(f"  [MONITOR] {code} 오류: {_e}")
                continue
    except Exception as e:
        log_error(e, "run_position_monitor")


# ══════════════════════════════════════════════════════════
# 스레드 / 스케줄 시작
# ══════════════════════════════════════════════════════════

# 커맨드 핸들러 스레드
_cmd_thread = threading.Thread(target=handle_commands, daemon=True)
_cmd_thread.start()

# 분석 전용 워커 스레드 (1개 → 직렬 처리 보장)
_worker_thread = threading.Thread(target=_analysis_worker, daemon=True)
_worker_thread.start()

# 스케줄
# ── [v7.0] 스케줄 — 주말 차단 적용 ──────────────────────────────────
# 알림 시간표:
#   평일 07:00  Morning Brief
#   평일 08:50  장전 분석
#   평일 13:30  장중 분석
#   평일 15:40  종가 리포트
#   평일 20:00  미국장 Preview
#   일요일 20:00 주간 Preview (다음주 전략)  ← 유일한 주말 허용
#   토요일 13:00 이후 / 일요일 20:00 이전 → 완전 차단

def _sunday_preview():
    """[v7.0] 일요일 20:00 — 다음주 Preview만 전송."""
    from datetime import datetime as _dt
    if _dt.now().weekday() != 6:
        return
    try:
        news       = get_news(max_items=10)
        _, regime, _, _, _ = get_global_summary()
        top_stocks = screen_top_stocks(news, top_n=5, regime=regime)
        preview    = generate_tomorrow_preview(
            top_stocks, [],
            regime=regime,
            market_data=last_market_data,
        )
        # send_info는 일요일 20:00에 _should_block_weekend가 허용
        send_info("📅 [주간 Preview] 다음주 전략\n" + preview)
    except Exception as _e:
        log_error(_e, "sunday_preview")

schedule.every().day.at("23:30").do(_weekday_only(reset_daily_state))
schedule.every().day.at("22:00").do(_weekday_only(us_market_brief))
schedule.every().day.at("23:50").do(_weekday_only(morning_analysis))
schedule.every().day.at("04:30").do(_weekday_only(morning_analysis))
schedule.every().day.at("06:40").do(_weekday_only(evening_report))
schedule.every().day.at("11:00").do(_weekday_only(morning_analysis))
# 일요일 20:00 주간 Preview (유일한 주말 허용)
schedule.every().day.at("11:00").do(_sunday_preview)
# 포지션 모니터 10분
def _market_hours_monitor():

    from datetime import datetime

    now = datetime.now()

    # 평일 09:00~15:35만 실행

    if now.weekday() >= 5:

        return

    if not (9 <= now.hour < 15 or (now.hour == 15 and now.minute <= 35)):

        return

    run_position_monitor()



schedule.every(10).minutes.do(_market_hours_monitor)
# [v6.1] 카카오 토큰 5시간마다 자동 갱신 (유효기간 6시간)
if _KAKAO_AVAILABLE:
    schedule.every(5).hours.do(kakao_refresh)

mode = "REAL" if IS_REAL else "MOCK"
print("=" * 60)
print(f"ONE-HUB AI Auto Trading {APP_VERSION_STR}")   # [Fix 1]
print("Mode:", mode)
print("Pool:", len(STOCK_POOL), "stocks")
print("Fixes: 버전통일/리포트중복/regime오류/blocked통계/보유종목필터/5중검증")
print("Schedule: 08:30reset / 07:00brief / 08:50+13:30+20:00분석 / 15:40리포트 / 주말OFF")
print("=" * 60)

send(
    f"ONE-HUB {APP_VERSION_STR} Started!\n"
    f"Mode: {mode}\n"
    f"{APP_VERSION_STR} 개선사항:\n"
    "- [v7.0 N1] 알림 등급 시스템 (Critical/Important/Info/Noise)\n"
    "- [v7.0 N2] 주말(토/일) 알림 완전 차단\n"
    "- [v7.0 N3] 스케줄 최적화 (하루 2회 브리핑, 노이즈 제거)\n"
    "- [v7.0 R1~R5] 리포트 품질 대폭 강화 (승률/손익비/액션플랜)\n"
    "- [v6.2 AI-1~3] AI 자율 운영 (목표가 자동매도/강력매수)\n\n"
    f"🤖 AI 자율 운영: {'✅ ON' if AI_AUTONOMOUS_MODE else '🔒 OFF (기본값)'}\n"
    "/analyze 로 시작 | /help 로 명령어 확인"
)

# [v5.2 Fix A] 실계좌 모드에서만 보유종목 복구
if IS_REAL:
    on_startup()

while True:
    schedule.run_pending()
    time.sleep(30)
