# -*- coding: utf-8 -*-
"""시장 상태 1줄 출력 — 배포 게이트·크론이 쓰는 얇은 CLI.

왜 파일로 두는가:
  ssh 로 python -c "..." 인라인을 보내면 따옴표가 겹겹이 깨진다(실측: 판정 실패 → fail-safe 발동).
  판정 로직은 market_calendar 한 곳에만 두고, 호출은 이 파일로 단순화한다.

사용:  ./venv/bin/python3 market_status.py [KRX|US]
출력:  open | closed_holiday | closed_weekend | pre_open | after_close | error
"""
import sys

try:
    sys.path.insert(0, "/home/ubuntu/one-hub/auto_trade")
    from datetime import datetime
    from zoneinfo import ZoneInfo
    import market_calendar as mc

    market = (sys.argv[1] if len(sys.argv) > 1 else "KRX").upper()
    print(mc.market_status(market, datetime.now(ZoneInfo("Asia/Seoul"))))
except Exception as e:
    # 호출부는 'error' 를 개장으로 간주해야 한다(fail-safe) — 판단을 여기서 하지 않는다.
    print("error", file=sys.stdout)
    print(f"[market_status] {e}", file=sys.stderr)
    sys.exit(1)
