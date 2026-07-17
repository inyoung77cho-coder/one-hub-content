# -*- coding: utf-8 -*-
"""KIS 국내휴장일조회 — KRX 개장일 판정의 1차 소스 (S18 Part5 E-2)

왜 필요한가 (2026-07-17 실증):
  exchange_calendars(XKRX) 는 2026-07-17 을 **개장일**로 판정했는데 실제로는 휴장이었다.
  라이브러리는 임시공휴일(K5)을 모른다 — 정부가 갑자기 지정하기 때문이다.
  KIS 는 증권사 자신의 휴장 캘린더라 근로자의날(K1)·연말휴장(K2)·임시공휴일(K5)이 전부 들어 있다.

캐시: kis_holiday_cache 테이블. 임시공휴일 대응을 위해 당일·익일은 매일 재확인한다.
fail-safe: 조회 실패 시 None 을 반환한다 — 호출부(market_calendar)가 XKRX 폴백을 결정한다.
           이 모듈은 '모른다'와 '휴장'을 구분해서 돌려준다.
"""
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo
import sqlite3, os

KST = ZoneInfo("Asia/Seoul")
DB_PATH = os.path.join(os.path.expanduser("~"), "trading.db")
TR_ID = "CTCA0903R"          # 국내휴장일조회
_mem = {}


def _ensure_table():
    c = sqlite3.connect(DB_PATH, timeout=5)
    try:
        c.execute("""
            CREATE TABLE IF NOT EXISTS kis_holiday_cache (
                d          TEXT PRIMARY KEY,
                is_open    INTEGER NOT NULL,
                fetched_at TEXT NOT NULL
            )
        """)
        c.commit()
    finally:
        c.close()


def _cache_get(d: date):
    _ensure_table()
    c = sqlite3.connect(DB_PATH, timeout=5)
    try:
        r = c.execute("SELECT is_open, fetched_at FROM kis_holiday_cache WHERE d=?",
                      (d.isoformat(),)).fetchone()
    finally:
        c.close()
    if not r:
        return None
    # 당일·익일은 임시공휴일이 뒤늦게 지정될 수 있어 하루 지난 캐시를 믿지 않는다.
    today = datetime.now(KST).date()
    if d in (today, today + timedelta(days=1)):
        try:
            if (datetime.now(KST) - datetime.fromisoformat(r[1])).total_seconds() > 86400:
                return None
        except Exception:
            return None
    return bool(r[0])


def _cache_put(rows):
    _ensure_table()
    c = sqlite3.connect(DB_PATH, timeout=5)
    try:
        now = datetime.now(KST).isoformat(timespec="seconds")
        c.executemany(
            "INSERT INTO kis_holiday_cache (d, is_open, fetched_at) VALUES (?,?,?) "
            "ON CONFLICT(d) DO UPDATE SET is_open=excluded.is_open, fetched_at=excluded.fetched_at",
            [(d, 1 if op else 0, now) for d, op in rows])
        c.commit()
    finally:
        c.close()


def fetch(d: date, trader_id: str = "A"):
    """KIS 에서 d 가 속한 달의 개장일 여부를 받아 캐시에 넣고, d 의 판정을 돌려준다.
    반환: True(개장) | False(휴장) | None(모름 — 호출부가 폴백)"""
    try:
        import sys
        sys.path.insert(0, "/home/ubuntu/one-hub/auto_trade")
        from config import get_trader_config
        from kis_api import get_access_token, safe_request

        cfg = get_trader_config(trader_id)
        token = get_access_token(trader_id, cfg)
        if not token:
            return None
        url = f"{cfg['base_url']}/uapi/domestic-stock/v1/quotations/chk-holiday"
        headers = {
            "content-type": "application/json; charset=utf-8",
            "authorization": f"Bearer {token}",
            "appkey": cfg["app_key"],
            "appsecret": cfg["app_secret"],
            "tr_id": TR_ID,
            "custtype": "P",
        }
        params = {"BASS_DT": d.strftime("%Y%m%d"), "CTX_AREA_NK": "", "CTX_AREA_FK": ""}
        r = safe_request("GET", url, headers=headers, params=params)
        if r is None:
            return None
        js = r.json() if hasattr(r, "json") else r
        out = js.get("output") or []
        if not out:
            return None
        rows = []
        hit = None
        for o in out:
            ds = o.get("bass_dt")
            # opnd_yn = 개장일여부. ONE-HUB 가 쓰는 것은 이것이다(영업일/거래일/결제일 아님).
            op = str(o.get("opnd_yn", "")).upper() == "Y"
            if ds:
                iso = f"{ds[:4]}-{ds[4:6]}-{ds[6:8]}"
                rows.append((iso, op))
                if iso == d.isoformat():
                    hit = op
        if rows:
            _cache_put(rows)
        return hit
    except Exception as e:
        print(f"[kis_holiday] 조회 실패: {e}")
        return None


def is_open(d: date, trader_id: str = "A"):
    """True(개장) | False(휴장) | None(모름). None 이면 호출부가 XKRX 로 폴백한다."""
    k = d.isoformat()
    if k in _mem:
        return _mem[k]
    v = _cache_get(d)
    if v is None:
        v = fetch(d, trader_id)
    if v is not None:
        _mem[k] = v
    return v
