# -*- coding: utf-8 -*-
"""
시장 캘린더 — 단일 진실 공급원 (S18 Part5 E-1/E-2/E-3)

개장 여부 / 거래일 계산 / 종가 확정 시각을 판정하는 유일한 모듈.
다른 파일에서 weekday(), timedelta(days=N), 공휴일 리스트를 직접 쓰는 것을 금지한다.

왜 필요한가 (실측 근거):
  block_accuracy_checker.py 가 `timedelta(days=3)` = 달력 3일로 검증 대상을 골랐고,
  block_accuracy 38건의 block_date→check_date 간격이 **전부 정확히 3.0일**이었다.
  주말·연휴가 낀 건은 틀린 날짜의 가격으로 채점됐다는 뜻이다.

fail-safe 원칙:
  판정 실패 시 **휴장으로 간주**한다. 개장일에 안 사는 게 휴장일에 주문 내는 것보다 안전하다.
"""
from __future__ import annotations

from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

KST = ZoneInfo("Asia/Seoul")
ET = ZoneInfo("America/New_York")

_MARKETS = {"KRX": "XKRX", "US": "XNYS"}
_cal_cache: dict = {}


class CalendarError(Exception):
    """캘린더 판정 실패. 호출부는 fail-safe(휴장 간주)로 처리해야 한다."""


# ── 매매거래시간 임시변경 ────────────────────────────────────────────
#   개장일 '여부'는 캘린더가 알지만, 거래'시간' 임시변경은 KRX 공지 사항이라 별도다.
#   ★ 이 딕셔너리만 예외적으로 수기 관리한다. 다른 곳에서 시각을 하드코딩하지 않는다.
SPECIAL_HOURS = {
    "2026-01-02": ("10:00", "15:30"),   # 연초 개장일 — 1시간 지연 개장(확인됨)
    # "2026-11-XX": ("10:00", "16:30"), # ⚠️ 수능일 — 교육부 공고로 날짜 확정 후 등록 (K4)
}

_DEFAULT_KRX_HOURS = ("09:00", "15:30")


def _cal(market: str):
    m = market.upper()
    if m not in _MARKETS:
        raise CalendarError(f"unknown market: {market}")
    if m not in _cal_cache:
        try:
            import exchange_calendars as xcals
            _cal_cache[m] = xcals.get_calendar(_MARKETS[m])
        except Exception as e:
            raise CalendarError(f"calendar load failed ({m}): {e}") from e
    return _cal_cache[m]


def _as_date(d) -> date:
    if isinstance(d, datetime):
        return d.astimezone(KST).date() if d.tzinfo else d.date()
    return d


def is_open(market: str, d) -> bool:
    """해당 날짜에 시장이 열리는가. 판정 실패 시 CalendarError."""
    d = _as_date(d)
    try:
        return bool(_cal(market).is_session(d.isoformat()))
    except CalendarError:
        raise
    except Exception as e:
        raise CalendarError(f"is_open failed: {e}") from e


def is_open_safe(market: str, d) -> bool:
    """fail-safe 래퍼 — 판정 실패 시 휴장(False)으로 간주한다.
    스케줄러·주문 경로는 반드시 이 함수를 쓴다."""
    try:
        return is_open(market, d)
    except CalendarError as e:
        print(f"[market_calendar] FAIL-SAFE: {market} 판정 실패 → 휴장 간주 ({e})")
        return False


def session_hours(market: str, d):
    """(개장, 마감) KST tz-aware 튜플. 휴장이면 None.
    KRX: SPECIAL_HOURS 반영 / US: DST·조기폐장 반영(라이브러리 위임)."""
    d = _as_date(d)
    if not is_open(market, d):
        return None
    m = market.upper()
    if m == "KRX":
        o, c = SPECIAL_HOURS.get(d.isoformat(), _DEFAULT_KRX_HOURS)
        mk = lambda s: datetime.combine(d, time(*map(int, s.split(":"))), tzinfo=KST)
        return (mk(o), mk(c))
    cal = _cal(m)
    s = cal.session_open(d.isoformat())
    e = cal.session_close(d.isoformat())
    return (s.tz_convert(KST).to_pydatetime(), e.tz_convert(KST).to_pydatetime())


def is_early_close(market: str, d) -> bool:
    """미국 조기폐장(13:00 ET) 여부. 날짜 하드코딩 금지 — 2027년엔 크리스마스이브 조기폐장이 없다."""
    d = _as_date(d)
    if not is_open(market, d):
        return False
    if market.upper() != "US":
        return False
    close_et = _cal("US").session_close(d.isoformat()).tz_convert(ET)
    return close_et.hour < 16


def add_trading_days(market: str, d, n: int) -> date:
    """T+N 거래일. 휴장일을 건너뛴다.
    ★ block_accuracy·나vsAI 채점은 반드시 이 함수를 쓴다(timedelta(days=N) 금지)."""
    d = _as_date(d)
    if n == 0:
        return d
    step = 1 if n > 0 else -1
    left = abs(n)
    cur = d
    guard = 0
    while left > 0:
        cur += timedelta(days=step)
        guard += 1
        if guard > 400:
            raise CalendarError("add_trading_days: 탐색 한계 초과")
        if is_open(market, cur):
            left -= 1
    return cur


def trading_days_between(market: str, a, b) -> int:
    """[a, b) 사이 거래일 수. a<b 가정."""
    a, b = _as_date(a), _as_date(b)
    if a > b:
        return -trading_days_between(market, b, a)
    try:
        sessions = _cal(market).sessions_in_range(a.isoformat(), b.isoformat())
        n = len(sessions)
        # 끝점 b 가 세션이면 반개구간[a,b)이 되도록 제외
        if n and is_open(market, b):
            n -= 1
        return n
    except CalendarError:
        raise
    except Exception as e:
        raise CalendarError(f"trading_days_between failed: {e}") from e


def last_close_date(market: str, now: datetime = None) -> date:
    """현재 시각 기준 '확정된 종가'의 날짜.
    US는 DST·조기폐장을 반영해 판정한다(직접 계산 금지)."""
    now = now or datetime.now(KST)
    if now.tzinfo is None:
        raise CalendarError("naive datetime 금지 — tz-aware 를 넘길 것")
    d = now.astimezone(KST).date()
    for _ in range(30):
        if is_open(market, d):
            h = session_hours(market, d)
            if h and now >= h[1]:
                return d
        d -= timedelta(days=1)
    raise CalendarError("last_close_date: 30일 내 세션 없음")


def market_status(market: str, now: datetime = None) -> str:
    """'open' | 'closed_holiday' | 'closed_weekend' | 'pre_open' | 'after_close'"""
    now = now or datetime.now(KST)
    if now.tzinfo is None:
        raise CalendarError("naive datetime 금지 — tz-aware 를 넘길 것")
    d = now.astimezone(KST).date()
    if not is_open(market, d):
        return "closed_weekend" if d.weekday() >= 5 else "closed_holiday"
    o, c = session_hours(market, d)
    if now < o:
        return "pre_open"
    if now > c:
        return "after_close"
    return "open"


def next_session(market: str, d=None) -> date:
    """다음 거래일 — 리포트의 '다음 거래일은 XX-XX입니다' 용."""
    return add_trading_days(market, _as_date(d or datetime.now(KST)), 1)


def special_hours_years() -> set:
    return {int(k[:4]) for k in SPECIAL_HOURS}


def warn_unregistered_year(y: int = None) -> str | None:
    """미등록 연도 진입 시 기동 경고 문구. 없으면 None."""
    y = y or datetime.now(KST).year
    if y not in special_hours_years():
        return f"{y}년 SPECIAL_HOURS 미등록 — KRX 매매거래시간 공지 확인 필요"
    return None
