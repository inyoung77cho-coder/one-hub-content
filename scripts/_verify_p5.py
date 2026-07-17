# -*- coding: utf-8 -*-
"""S18 Part5 캘린더 정확도 검산 (지시서 W5-11 assert).
이 리스트는 검증용이지 판정용이 아니다 — 판정은 항상 KIS/라이브러리가 한다."""
import sys
sys.path.insert(0, '/home/ubuntu/one-hub/auto_trade')
from datetime import date
from zoneinfo import ZoneInfo
import market_calendar as mc

f = 0


def chk(c, m):
    global f
    print(('OK   ' if c else 'FAIL ') + m)
    if not c:
        f += 1


# ── 미국 2026 정규 휴장 10일 (NYSE 공식 발표) ──
US_HOL = ['2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03', '2026-05-25',
          '2026-06-19', '2026-07-03', '2026-09-07', '2026-11-26', '2026-12-25']
bad = [s for s in US_HOL if mc.is_open('US', date.fromisoformat(s))]
chk(not bad, 'E-3 US 2026 정규휴장 10일 (오류 %s)' % (bad or '없음'))

# 조기폐장 2일 — 날짜 하드코딩 금지(2027년엔 크리스마스이브 조기폐장이 없다)
for s in ['2026-11-27', '2026-12-24']:
    chk(mc.is_early_close('US', date.fromisoformat(s)), 'E-3 US 조기폐장 ' + s)

# U4 주말 관측 이동
chk(not mc.is_open('US', date(2026, 7, 3)), 'E-3 US 7/4(토) → 7/3(금) 관측 이동')

# ── 한국 ──
chk(not mc.is_open('KRX', date(2026, 5, 1)), 'E-2 KRX 근로자의날 5/1 휴장 (K1)')
chk(not mc.is_open('KRX', date(2026, 12, 31)), 'E-2 KRX 연말휴장 12/31 (K2)')
chk(mc.is_open('KRX', date(2026, 12, 30)), 'E-2 KRX 최종거래일 12/30 개장')
# ★ K5 임시공휴일 — 이것이 KIS 연동의 존재 이유다.
#   exchange_calendars(XKRX) 는 2026-07-17 을 개장일로 판정했다. KIS 만 휴장을 안다.
chk(not mc.is_open('KRX', date(2026, 7, 17)), 'E-2 KRX 임시공휴일 7/17 휴장 ★ (K5 — KIS만 앎)')
chk(mc.is_open('KRX', date(2026, 7, 16)), 'E-2 KRX 7/16 개장')

h = mc.session_hours('KRX', date(2026, 1, 2))
chk(h is not None and h[0].hour == 10, 'E-2 KRX 연초 개장일 10:00 (K3)')

# ── DST (U1) — 직접 계산 금지, 라이브러리 위임 ──
cs = mc.session_hours('US', date(2026, 7, 17))[1].astimezone(ZoneInfo('Asia/Seoul'))
cw = mc.session_hours('US', date(2026, 12, 15))[1].astimezone(ZoneInfo('Asia/Seoul'))
chk(cs.hour != cw.hour, 'E-3 US DST 반영 (여름 %d시 / 겨울 %d시 KST)' % (cs.hour, cw.hour))

# ── 거래일 계산 — 연휴 건너뛰기 ──
d = mc.add_trading_days('US', date(2026, 7, 1), 3)
chk(d > date(2026, 7, 4), 'E-1 US T+3 이 7/3 휴장 건너뜀 → %s' % d)

# ── 필수 함수 ──
need = ['is_open', 'is_open_safe', 'session_hours', 'add_trading_days',
        'trading_days_between', 'last_close_date', 'is_early_close',
        'market_status', 'next_session']
miss = [n for n in need if not hasattr(mc, n)]
chk(not miss, 'E-1 필수 함수 9종 (누락 %s)' % (miss or '없음'))

# ── fail-safe ──
chk(hasattr(mc, 'is_open_safe'), 'E-1 fail-safe(is_open_safe) — 실패 시 휴장 간주')

sys.exit(f)
