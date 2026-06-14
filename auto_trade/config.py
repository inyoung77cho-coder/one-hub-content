# -*- coding: utf-8 -*-
# config.py — ONE-HUB v8.1 멀티 트레이더
# ============================================================
# v8.1 변경사항:
#   [Multi] get_trader_config() 추가
#           Trader A → .env 기반 (기존 방식 유지)
#           Trader B~ → traders 테이블에서 복호화하여 반환
# ============================================================

import os
import sqlite3
from dotenv import load_dotenv

load_dotenv()

# ── 공통 설정 ───────────────────────────────────────────────
TARGET_STOCKS = [
    {"code": "005930", "name": "Samsung",  "buy_amount": 2000000},
    {"code": "000660", "name": "SKHynix",  "buy_amount": 2000000},
]
MAX_BUY_AMOUNT    = 2000000
STOP_LOSS_PCT     = -5.0
TRAILING_STOP_PCT = 5.0
MAX_DAILY_LOSS    = -1000000
COOLDOWN_DAYS     = 5

# ── Trader A 기본값 (.env 기존 방식 유지) ───────────────────
APP_KEY      = os.getenv("KIS_APP_KEY")
APP_SECRET   = os.getenv("KIS_APP_SECRET")
ACCOUNT_NO   = os.getenv("KIS_ACCOUNT_NO")
ACCOUNT_CODE = os.getenv("KIS_ACCOUNT_CODE", "01")
IS_REAL      = os.getenv("KIS_IS_REAL", "False") == "True"

BASE_URL = (
    "https://openapi.koreainvestment.com:9443"
    if IS_REAL else
    "https://openapivts.koreainvestment.com:29443"
)

# ── AI 자율 운영 설정 ───────────────────────────────────────
# AI_STRONG_BUY_AUTO=true    강력 매수 신호 자동 즉시 실행
# AI_STRONG_BUY_SCORE=80     자동 매수 최소 점수
# AI_STRONG_BUY_ML_PROB=75   자동 매수 ML 확률 임계값 %
# AUTO_SELL_TIMEOUT_MINUTES=10  목표가 도달 후 자동매도까지 대기 분
# AUTO_STOP_DELAY_MINUTES=30    손절 알림 후 자동손절까지 대기 분


# ── 멀티 트레이더: trader_id별 설정 반환 ────────────────────
def get_trader_config(trader_id: str) -> dict:
    """
    Trader A → .env 기반 (기존 방식)
    Trader B~ → traders 테이블에서 복호화하여 반환
    반환: {app_key, app_secret, account_no,
           account_code, is_real, base_url}
    """
    if trader_id == "A":
        return {
            "app_key":      APP_KEY,
            "app_secret":   APP_SECRET,
            "account_no":   ACCOUNT_NO,
            "account_code": ACCOUNT_CODE,
            "is_real":      IS_REAL,
            "base_url":     BASE_URL,
        }

    # Trader B 이상: DB에서 복호화
    try:
        from crypto_utils import decrypt
        DB_PATH = os.path.join(os.path.expanduser("~"), "trading.db")
        conn = sqlite3.connect(DB_PATH)
        c    = conn.cursor()
        c.execute("""
            SELECT app_key_enc, app_secret_enc, account_no_enc,
                   account_code, is_real
            FROM traders
            WHERE trader_id = ? AND is_active = 1
        """, (trader_id,))
        row = c.fetchone()
        conn.close()

        if not row:
            raise ValueError(f"Trader {trader_id} 없음 또는 비활성")

        is_real = bool(row[4])
        return {
            "app_key":      decrypt(row[0]),
            "app_secret":   decrypt(row[1]),
            "account_no":   decrypt(row[2]),
            "account_code": row[3],
            "is_real":      is_real,
            "base_url": (
                "https://openapi.koreainvestment.com:9443"
                if is_real else
                "https://openapivts.koreainvestment.com:29443"
            ),
        }
    except Exception as e:
        raise RuntimeError(
            f"[config] Trader {trader_id} 설정 로드 실패: {e}"
        )