# push_bot.py — ONE-HUB v9.0
# [v9.0] PWA Web Push 발송 모듈.
# telegram_bot.py의 _do_send()에서 호출되어, 텔레그램으로 나가는 모든 메시지를
# PWA 구독자에게도 동일하게 미러링 발송한다.
# fail-open: 모든 경로에서 예외를 삼킨다 (거래 로직/텔레그램 발송에 영향 없도록).

import os
import json
import re as _re

from db_logger import get_push_subscriptions, delete_push_subscription

VAPID_PRIVATE_KEY = os.getenv("VAPID_PRIVATE_KEY", "")
VAPID_CLAIMS_SUB = os.getenv("VAPID_CLAIMS_SUB", "mailto:onehub-admin@example.com")


def push_to_trader(message: str, trader_id: str = "A", code: str = None, name: str = None,
                   kind: str = None):
    """trader_id의 모든 PWA 구독자에게 푸시 발송.
    텔레그램 HTML 태그는 제거 후 발송. fail-open — 절대 예외를 위로 전파하지 않는다.
    code/name 제공 시 payload에 포함 → SW에서 딥링크 생성."""
    if not VAPID_PRIVATE_KEY:
        return
    try:
        from pywebpush import webpush, WebPushException
    except Exception as e:
        print(f"[PUSH] pywebpush import 실패(미설치?): {e}")
        return

    try:
        plain = _re.sub(r"<[^>]+>", "", message or "").strip()
        if not plain:
            return
        subs = get_push_subscriptions(trader_id)
        if not subs:
            return
        payload_dict = {"title": "ONE-HUB", "body": plain[:180]}
        if code:
            payload_dict["code"] = code
        if name:
            payload_dict["name"] = name
        # [S18 D-2] kind = 알림 종류. sw.js 의 LANDING 매핑이 이 값으로 착지 URL 을 정한다.
        #   지금까지 이 필드가 없어서 LANDING 이 있어도 딥링크가 동작하지 않았다.
        if kind:
            payload_dict["kind"] = kind
        payload = json.dumps(payload_dict)

        for sub in subs:
            try:
                webpush(
                    subscription_info={
                        "endpoint": sub["endpoint"],
                        "keys": {"p256dh": sub["p256dh"], "auth": sub["auth"]},
                    },
                    data=payload,
                    vapid_private_key=VAPID_PRIVATE_KEY,
                    vapid_claims={"sub": VAPID_CLAIMS_SUB},
                )
            except WebPushException as e:
                status = getattr(e.response, "status_code", None)
                if status in (404, 410):
                    # 구독 만료/취소됨 — 정리
                    try:
                        delete_push_subscription(sub["endpoint"])
                    except Exception:
                        pass
                else:
                    print(f"[PUSH] WebPushException: {e}")
            except Exception as e:
                print(f"[PUSH] 개별 발송 실패: {e}")
    except Exception as e:
        print(f"[PUSH] push_to_trader 전체 오류(무시): {e}")
