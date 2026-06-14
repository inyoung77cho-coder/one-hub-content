# telegram_bot.py — ONE-HUB v8.0
# ============================================================
# v7.0 수정사항:
#   [N1] 알림 등급 시스템 (Critical / Important / Info / Noise)
#        - Critical  : 항상 전송 (손절/체결/급등/Auto-Stop)
#        - Important : 조건부 전송 (신규 매수 후보)
#        - Info      : 하루 2회 시간대 제한 (시장 브리핑)
#        - Noise     : 완전 차단 (반복 분석 중간 메시지)
#   [N2] 주말(토/일) 알림 완전 차단 (Critical 제외)
#   [N3] 기존 dedup 로직 유지 + 등급별 TTL 최적화
#   [N4] send_critical() — 등급 무시 강제 전송 (긴급용)
# ============================================================

import os
import hashlib
import time as _time
from datetime import datetime, date
from kst_time import now_kst, today_kst, now_kst_str, is_weekend_kst, KST
import requests
from dotenv import load_dotenv

load_dotenv()

TOKEN     = os.getenv("TELEGRAM_TOKEN")
CHAT_ID   = os.getenv("TELEGRAM_CHAT_ID")
CHAT_ID_B = os.getenv("TRADER_B_TELEGRAM_CHAT_ID", os.getenv("TELEGRAM_CHAT_ID_B", ""))
TOKEN_B   = os.getenv("TRADER_B_TELEGRAM_TOKEN", TOKEN)

# ──────────────────────────────────────────────────────────
# [N1] 알림 등급 정의
# ──────────────────────────────────────────────────────────
LEVEL_CRITICAL  = "CRITICAL"   # 손절/급등/체결 — 항상 전송
LEVEL_IMPORTANT = "IMPORTANT"  # 신규 매수 후보 — 조건부 전송
LEVEL_INFO      = "INFO"       # 시장 브리핑 — 하루 허용 시간대만
LEVEL_NOISE     = "NOISE"      # 반복 중간 메시지 — 차단

# Info 허용 시간대: 07:00~07:10, 08:40~09:10, 15:30~15:50, 19:50~20:10
INFO_WINDOWS = [
    (7, 0, 7, 10),
    (8, 40, 9, 10),
    (15, 30, 15, 50),
    (19, 50, 20, 10),
]

# 메시지 prefix → (등급, TTL초)
_LEVEL_RULES: list[tuple[str, str, int]] = [
    # Critical — 항상 전송
    ("🔻 [손절가 도달]",        LEVEL_CRITICAL,  60),
    ("[손절가 도달]",           LEVEL_CRITICAL,  60),
    ("🎯 [목표가 도달]",        LEVEL_CRITICAL,  60),
    ("[목표가 도달]",           LEVEL_CRITICAL,  60),
    ("🔴 [Auto-Stop",          LEVEL_CRITICAL,  60),
    ("[Auto-Stop",             LEVEL_CRITICAL,  60),
    ("⚠️ [Auto-Stop",          LEVEL_CRITICAL,  60),
    ("🤖 [AI 자동매도",         LEVEL_CRITICAL,  60),
    ("🤖 [AI 강력매수",         LEVEL_CRITICAL,  60),
    ("SELL OK",                LEVEL_CRITICAL,  30),
    ("[체결 완료]",             LEVEL_CRITICAL,  30),
    ("[매수 주문 접수]",         LEVEL_CRITICAL,  30),
    ("CIRCUIT BREAKER",        LEVEL_CRITICAL,  120),
    ("📈 [수익 알림]",          LEVEL_CRITICAL,  300),
    ("[STARTUP]",              LEVEL_CRITICAL,  60),
    ("⛔",                     LEVEL_CRITICAL,  60),
    # Important — 매수 후보
    ("📈",                     LEVEL_IMPORTANT, 300),
    ("AI Top",                 LEVEL_IMPORTANT, 300),
    ("승인 대기",               LEVEL_IMPORTANT, 300),
    ("[WATCHLIST] 관찰 후보",   LEVEL_IMPORTANT, 180),
    ("종목 대기 중",            LEVEL_IMPORTANT, 180),
    # Info — 브리핑 (시간대 제한)
    ("ONE-HUB Morning Brief",  LEVEL_INFO,      600),
    ("ONE-HUB Market Brief",   LEVEL_INFO,      600),
    ("ONE-HUB Analysis",       LEVEL_INFO,      600),
    ("Today News",             LEVEL_INFO,      600),
    ("[보유종목 관련 뉴스]",     LEVEL_INFO,      600),
    ("ONE-HUB Evening Report", LEVEL_INFO,      3600),
    ("ONE-HUB 일일 매매 리포트", LEVEL_INFO,     3600),
    ("ONE-HUB Tomorrow Preview", LEVEL_INFO,    3600),
    ("DB Stats:",              LEVEL_INFO,      3600),
    # Noise — 차단
    ("분석 시작...",            LEVEL_NOISE,     0),
    ("Fetching global data",   LEVEL_NOISE,     0),
    ("Cash: ",                 LEVEL_NOISE,     0),
    ("BEAR MARKET: 모든 신규",  LEVEL_NOISE,     0),
    ("BEAR MARKET: 신규",       LEVEL_NOISE,     0),
    ("오늘 매수 후보 없음",      LEVEL_NOISE,     0),
    ("AI Top 0종목",            LEVEL_NOISE,     0),
    ("Dedup cache",            LEVEL_NOISE,     0),
    ("이미 분석 실행",           LEVEL_NOISE,     0),
]

_dedup_cache: dict = {}
_dedup_blocked_count: int = 0
_DEFAULT_TTL = 120


def _classify(message: str) -> tuple[str, int]:
    """메시지 등급과 TTL 반환."""
    stripped = message.strip()
    for prefix, level, ttl in _LEVEL_RULES:
        if stripped.startswith(prefix):
            return level, ttl
    return LEVEL_IMPORTANT, _DEFAULT_TTL


def _in_info_window() -> bool:
    """현재 시각이 Info 허용 시간대인지 확인."""
    now = now_kst()
    h, m = now.hour, now.minute
    for sh, sm, eh, em in INFO_WINDOWS:
        start = sh * 60 + sm
        end   = eh * 60 + em
        cur   = h  * 60 + m
        if start <= cur <= end:
            return True
    return False


def _is_weekend() -> bool:
    """토요일(5), 일요일(6) 여부."""
    return now_kst().weekday() >= 5


def _should_block_weekend(level: str) -> bool:
    """
    [v7.0 N2 정밀화] 주말 차단 세부 기준:
      - 토요일 00:00~12:59 : Critical 외 차단 안 함 (오전 장 후 분석 허용)
      - 토요일 13:00 이후  : Critical 외 전부 차단
      - 일요일 00:00~19:59 : Critical 외 전부 차단
      - 일요일 20:00 이후  : INFO 레벨 Preview 1회만 허용 (주간 Preview)

    [한시적 예외 - 2026-06-22까지]
      - 토요일: 차단 없음 (전체 허용)
      - 일요일: 12:00 이전 차단, 12:00 이후 허용
      2026-06-22(월)부터 위 정식 기준으로 자동 복귀.
    """
    now = now_kst()
    wd  = now.weekday()   # 5=토, 6=일
    h   = now.hour

    # 한시적 예외 (이번 주만, 2026-06-22 이전)
    if now.date() < date(2026, 6, 22):
        if wd == 5:  # 토요일 - 전체 허용
            return False
        if wd == 6:  # 일요일 - 12:00 이전만 차단
            if h < 12:
                return level != LEVEL_CRITICAL
            return False
        return False

    # 정식 기준 (2026-06-22부터)
    if wd == 5:  # 토요일
        if h < 16:
            return False          # 토 16:00 이전 허용
        else:
            return level != LEVEL_CRITICAL
    if wd == 6:  # 일요일
        if h >= 16:
            return False          # 일 16:00 이후 허용
        else:
            return level != LEVEL_CRITICAL
    return False  # 평일 — 차단 없음


# ──────────────────────────────────────────────────────────
# Dedup (Fix D 적용: snapshot 기반 만료 처리)
# ──────────────────────────────────────────────────────────

def _msg_key_and_ttl(message: str) -> tuple[str, int]:
    stripped = message.strip()
    for prefix, level, ttl in _LEVEL_RULES:
        if stripped.startswith(prefix) and ttl > 0:
            key = hashlib.md5(prefix.encode()).hexdigest()
            return key, ttl
    key = hashlib.md5(stripped[:200].encode()).hexdigest()
    return key, _DEFAULT_TTL


def _is_duplicate(message: str) -> bool:
    global _dedup_blocked_count
    now = _time.time()
    key, ttl = _msg_key_and_ttl(message)

    expired = [
        k for k, (sent_at, cache_ttl) in list(_dedup_cache.items())
        if now - sent_at > cache_ttl
    ]
    for k in expired:
        _dedup_cache.pop(k, None)

    if key in _dedup_cache:
        _dedup_blocked_count += 1
        return True

    _dedup_cache[key] = (now, ttl)
    return False


# ──────────────────────────────────────────────────────────
# 실제 전송
# ──────────────────────────────────────────────────────────

def _do_send(message: str):
    _trader = os.getenv("TRADER_ID", "A")
    _token  = TOKEN_B if _trader == "B" and TOKEN_B else TOKEN
    _chat   = CHAT_ID_B if _trader == "B" and CHAT_ID_B else CHAT_ID
    if not _token or not _chat:
        print("Telegram not configured")
        return None
    try:
        url = f"https://api.telegram.org/bot{_token}/sendMessage"
        res = requests.post(url, data={
            "chat_id":    _chat,
            "text":       message,
            "parse_mode": "HTML"
        }, timeout=35)
        return res.json()
    except Exception as e:
        print(f"Telegram send error: {e}")
        return None


# ──────────────────────────────────────────────────────────
# 공개 API
# ──────────────────────────────────────────────────────────

def send(message: str):
    """
    등급별 필터링 후 전송.
    - NOISE     : 항상 차단
    - 주말(토/일): CRITICAL 외 차단
    - INFO      : 허용 시간대 외 차단
    - dedup     : 중복 차단
    """
    level, _ = _classify(message)

    # Noise 차단
    if level == LEVEL_NOISE:
        print(f"[NOISE] 차단: {message[:60]}")
        return None

    # 주말 차단 (세부 기준 적용)
    if _should_block_weekend(level):
        print(f"[WEEKEND] 차단: {message[:60]}")
        return None

    # Info 시간대 제한
    if level == LEVEL_INFO and not _in_info_window():
        print(f"[INFO_WINDOW] 시간외 차단: {message[:60]}")
        return None

    # Dedup
    if _is_duplicate(message):
        print(f"[DEDUP] 중복 차단: {message[:60]}")
        return None

    return _do_send(message)


def send_force(message: str):
    """dedup + 등급 무시 강제 전송 (Auto-Stop 긴급 알림 전용)."""
    return _do_send(message)


def send_critical(message: str):
    """Critical 등급 강제 전송 — 주말/시간대 무관."""
    if _is_duplicate(message):
        return None
    return _do_send(message)


def send_info(message: str):
    """Info 등급 전송 — 시간대 무관하게 1회 허용 (리포트 수동 요청용)."""
    if _is_duplicate(message):
        return None
    return _do_send(message)


def get_updates(offset: int = 0):
    try:
        _trader = os.getenv("TRADER_ID", "A")
        _token  = TOKEN_B if _trader == "B" and TOKEN_B else TOKEN
        url = f"https://api.telegram.org/bot{_token}/getUpdates"
        res = requests.get(url, params={
            "offset":  offset,
            "timeout": 30
        }, timeout=35)
        return res.json().get("result", [])
    except Exception as e:
        print(f"Telegram get error: {e}")
        return []


def get_dedup_stats() -> str:
    active  = len(_dedup_cache)
    blocked = _dedup_blocked_count
    return f"Dedup cache: {active}개 활성  |  누적 차단: {blocked}건"

def send_keyboard(message: str, buttons: list):
    """인라인 키보드 버튼과 함께 메시지 전송.
    buttons 형식: [[{"text": "버튼명", "callback_data": "데이터"}]]
    """
    _trader = os.getenv("TRADER_ID", "A")
    _token  = TOKEN_B if _trader == "B" and TOKEN_B else TOKEN
    _chat   = CHAT_ID_B if _trader == "B" and CHAT_ID_B else CHAT_ID
    if not _token or not _chat:
        return None
    try:
        import json
        res = requests.post(
            f"https://api.telegram.org/bot{_token}/sendMessage",
            json={
                "chat_id":      _chat,
                "text":         message,
                "parse_mode":   "HTML",
                "reply_markup": {"inline_keyboard": buttons}
            },
            timeout=10
        )
        return res.json()
    except Exception as e:
        print(f"Telegram keyboard error: {e}")
        return None

def answer_callback(callback_query_id: str):
    """콜백 쿼리 응답 (버튼 로딩 표시 제거)"""
    _trader = os.getenv("TRADER_ID", "A")
    _token  = TOKEN_B if _trader == "B" and TOKEN_B else TOKEN
    try:
        requests.post(
            f"https://api.telegram.org/bot{_token}/answerCallbackQuery",
            json={"callback_query_id": callback_query_id},
            timeout=5
        )
    except Exception:
        pass

def send_to_trader(message: str, trader_id: str = "A"):
    """trader_id별 텔레그램 채널로 알림 발송"""
    chat_id = CHAT_ID_B if trader_id == "B" and CHAT_ID_B else CHAT_ID
    token   = TOKEN_B   if trader_id == "B" and TOKEN_B   else TOKEN
    if not token or not chat_id:
        print(f"[Telegram] Trader {trader_id} 채널 미설정")
        return
    try:
        requests.post(
            f"https://api.telegram.org/bot{token}/sendMessage",
            json={
                "chat_id":    chat_id,
                "text":       f"[Trader {trader_id}] {message}",
                "parse_mode": "HTML",
            },
            timeout=10
        )
        print(f"[Telegram] Trader {trader_id} 발송 완료")
    except Exception as e:
        print(f"[Telegram] Trader {trader_id} 발송 실패: {e}")