# -*- coding: utf-8 -*-
# kis_api.py — ONE-HUB v8.1 멀티 트레이더
# ============================================================
# v8.1 변경사항:
#   [Multi] trader_id + cfg 파라미터 방식으로 전환
#   [Multi] 토큰 캐시 trader_id별 분리 관리
#   [Multi] 모든 API 함수에 trader_id, cfg 파라미터 추가
# ============================================================

import requests
import json
import os

def get_trader_config(trader_id: str = "A") -> dict:
    """trader_id별 KIS API 설정 반환"""
    if trader_id == "B":
        app_key    = os.getenv("TRADER_B_KIS_APP_KEY", "")
        app_secret = os.getenv("TRADER_B_KIS_APP_SECRET", "")
        account_no = os.getenv("TRADER_B_KIS_ACCOUNT_NO", "")
        account_cd = os.getenv("TRADER_B_KIS_ACCOUNT_CODE", "01")
        is_real    = os.getenv("TRADER_B_IS_REAL", "0") == "1"
    else:
        app_key    = os.getenv("KIS_APP_KEY", "")
        app_secret = os.getenv("KIS_APP_SECRET", "")
        account_no = os.getenv("KIS_ACCOUNT_NO", "")
        account_cd = os.getenv("KIS_ACCOUNT_CODE", "01")
        is_real    = os.getenv("KIS_IS_REAL", "False").lower() in ("true","1")
    base_url = "https://openapi.koreainvestment.com:9443" if is_real else "https://openapivts.koreainvestment.com:29443"
    return {
        "app_key":    app_key,
        "app_secret": app_secret,
        "account_no": account_no,
        "account_code": account_cd,
        "is_real":    is_real,
        "base_url":   base_url,
    }


import time as _time

# ── 모듈 레벨 캐시 ───────────────────────────────────────────
_token_cache:    dict  = {}  # {trader_id: {"token":..., "expires":...}}
_api_fail_count: int   = 0
_api_last_fail:  float = 0.0
_api_cache:      dict  = {}
API_CACHE_TTL:   int   = 300


def get_api_health() -> str:
    if _api_fail_count == 0:
        return "[OK] KIS API: 정상"
    elif _api_fail_count < 3:
        return f"[WARN] KIS API: 오류 {_api_fail_count}회"
    else:
        return f"[ERROR] KIS API: 장애 {_api_fail_count}회 연속"


def safe_request(method, url, headers=None, params=None,
                 data=None, retries=3, cache_key=None):
    global _api_fail_count, _api_last_fail

    if cache_key and method == 'GET':
        cached = _api_cache.get(cache_key)
        if cached and (_time.time() - cached[1]) < API_CACHE_TTL:
            print(f"[CACHE HIT] {cache_key}")
            return cached[0]

    last_err = None
    for attempt in range(retries):
        try:
            if method == 'GET':
                res = requests.get(url, headers=headers,
                                   params=params, timeout=10)
            else:
                res = requests.post(url, headers=headers,
                                    data=data, timeout=10)
            res.raise_for_status()
            result = res.json()
            _api_fail_count = 0
            if cache_key and method == 'GET':
                _api_cache[cache_key] = (result, _time.time())
            return result
        except Exception as e:
            last_err = e
            print(f"[Retry {attempt+1}/{retries}] {e}")
            _time.sleep(2 ** attempt)

    _api_fail_count += 1
    _api_last_fail = _time.time()

    if cache_key and cache_key in _api_cache:
        print(f"[CACHE FALLBACK] {cache_key}")
        return _api_cache[cache_key][0]

    if _api_fail_count >= 3:
        try:
            from telegram_bot import send_critical
            send_critical(
                f"[KIS API 장애] 연속 {_api_fail_count}회 실패\n"
                f"오류: {str(last_err)[:80]}"
            )
        except Exception:
            pass

    raise Exception(f"API FAILED after {retries} retries: {last_err}")


def get_access_token(trader_id: str = "A", cfg: dict = None) -> str:
    """trader_id별 토큰 캐시 분리 관리"""
    if cfg is None:
        from config import get_trader_config
        cfg = get_trader_config(trader_id)

    now   = _time.time()
    cache = _token_cache.get(trader_id, {})
    if cache.get("token") and now < cache.get("expires", 0):
        return cache["token"]

    url  = f"{cfg['base_url']}/oauth2/tokenP"
    body = {
        "grant_type": "client_credentials",
        "appkey":     cfg["app_key"],
        "appsecret":  cfg["app_secret"],
    }
    try:
        res = requests.post(
            url,
            headers={"content-type": "application/json"},
            data=json.dumps(body),
            timeout=10
        )
        res.raise_for_status()
        token = res.json().get("access_token")
        _token_cache[trader_id] = {
            "token":   token,
            "expires": now + 3600 * 23
        }
        print(f"[Token OK] Trader {trader_id}")
        return token
    except Exception as e:
        print(f"[Token error] Trader {trader_id}: {e}")
        if cache.get("token"):
            print(f"[Token fallback] Trader {trader_id} 캐시 사용")
            return cache["token"]
        raise


def get_balance(token: str, trader_id: str = "A",
                cfg: dict = None):
    if cfg is None:
        from config import get_trader_config
        cfg = get_trader_config(trader_id)

    url   = f"{cfg['base_url']}/uapi/domestic-stock/v1/trading/inquire-balance"
    tr_id = "TTTC8434R" if cfg["is_real"] else "VTTC8434R"
    headers = {
        "content-type":  "application/json",
        "authorization": f"Bearer {token}",
        "appkey":        cfg["app_key"],
        "appsecret":     cfg["app_secret"],
        "tr_id":         tr_id,
        "custtype":      "P",
    }
    params = {
        "CANO":                  cfg["account_no"],
        "ACNT_PRDT_CD":          cfg["account_code"],
        "AFHR_FLPR_YN":          "N",
        "OFL_YN":                "",
        "INQR_DVSN":             "02",
        "UNPR_DVSN":             "01",
        "FUND_STTL_ICLD_YN":     "N",
        "FNCG_AMT_AUTO_RDPT_YN": "N",
        "PRCS_DVSN":             "00",
        "CTX_AREA_FK100":        "",
        "CTX_AREA_NK100":        "",
    }
    return safe_request("GET", url, headers=headers, params=params,
                        cache_key=f"balance_{trader_id}")


def get_holdings(token: str, trader_id: str = "A",
                 cfg: dict = None) -> list:
    try:
        balance = get_balance(token, trader_id, cfg)
        return balance.get("output1", [])
    except Exception as e:
        print(f"[get_holdings] Trader {trader_id} 오류: {e}")
        return []
def buy_order(token: str, stock_code: str, qty: int,
              trader_id: str = "A", cfg: dict = None):
    if cfg is None:
        from config import get_trader_config
        cfg = get_trader_config(trader_id)

    if not cfg["is_real"]:
        print(f"  [MOCK][{trader_id}] Buy {stock_code} x{qty}")
        return {"msg1": "mock buy ok"}

    url = f"{cfg['base_url']}/uapi/domestic-stock/v1/trading/order-cash"
    headers = {
        "content-type":  "application/json",
        "authorization": f"Bearer {token}",
        "appkey":        cfg["app_key"],
        "appsecret":     cfg["app_secret"],
        "tr_id":         "TTTC0802U",
        "custtype":      "P",
    }
    body = {
        "CANO":         cfg["account_no"],
        "ACNT_PRDT_CD": cfg["account_code"],
        "PDNO":         stock_code,
        "ORD_DVSN":     "01",
        "ORD_QTY":      str(qty),
        "ORD_UNPR":     "0",
    }
    return safe_request("POST", url, headers=headers,
                        data=json.dumps(body))


def sell_order(token: str, stock_code: str, qty: int,
               trader_id: str = "A", cfg: dict = None):
    if cfg is None:
        from config import get_trader_config
        cfg = get_trader_config(trader_id)

    if not cfg["is_real"]:
        print(f"  [MOCK][{trader_id}] Sell {stock_code} x{qty}")
        return {"msg1": "mock sell ok"}

    url = f"{cfg['base_url']}/uapi/domestic-stock/v1/trading/order-cash"
    headers = {
        "content-type":  "application/json",
        "authorization": f"Bearer {token}",
        "appkey":        cfg["app_key"],
        "appsecret":     cfg["app_secret"],
        "tr_id":         "TTTC0801U",
        "custtype":      "P",
    }
    body = {
        "CANO":         cfg["account_no"],
        "ACNT_PRDT_CD": cfg["account_code"],
        "PDNO":         stock_code,
        "ORD_DVSN":     "01",
        "ORD_QTY":      str(qty),
        "ORD_UNPR":     "0",
    }
    return safe_request("POST", url, headers=headers,
                        data=json.dumps(body))


def get_current_price(token: str, stock_code: str,
                      trader_id: str = "A",
                      cfg: dict = None) -> int:
    if cfg is None:
        from config import get_trader_config
        cfg = get_trader_config(trader_id)

    url = (f"{cfg['base_url']}/uapi/domestic-stock"
           f"/v1/quotations/inquire-price")
    headers = {
        "content-type":  "application/json",
        "authorization": f"Bearer {token}",
        "appkey":        cfg["app_key"],
        "appsecret":     cfg["app_secret"],
        "tr_id":         "FHKST01010100",
        "custtype":      "P",
    }
    params = {
        "FID_COND_MRKT_DIV_CODE": "J",
        "FID_INPUT_ISCD":         stock_code,
    }
    try:
        res    = safe_request("GET", url, headers=headers,
                              params=params)
        output = res.get("output", {})
        return int(float(output.get("stck_prpr", 0)))
    except Exception as e:
        print(f"[get_current_price] {stock_code}: {e}")
        return 0


def get_order_result(token: str, stock_code: str,
                     trader_id: str = "A",
                     cfg: dict = None) -> list:
    """당일 체결 내역 조회"""
    if cfg is None:
        from config import get_trader_config
        cfg = get_trader_config(trader_id)

    url   = (f"{cfg['base_url']}/uapi/domestic-stock"
             f"/v1/trading/inquire-daily-ccld")
    tr_id = "TTTC8001R" if cfg["is_real"] else "VTTC8001R"
    headers = {
        "content-type":  "application/json",
        "authorization": f"Bearer {token}",
        "appkey":        cfg["app_key"],
        "appsecret":     cfg["app_secret"],
        "tr_id":         tr_id,
        "custtype":      "P",
    }
    from datetime import datetime
    today  = datetime.now().strftime("%Y%m%d")
    params = {
        "CANO":            cfg["account_no"],
        "ACNT_PRDT_CD":    cfg["account_code"],
        "INQR_STRT_DT":    today,
        "INQR_END_DT":     today,
        "SLL_BUY_DVSN_CD": "00",
        "INQR_DVSN":       "00",
        "PDNO":            stock_code,
        "CCLD_DVSN":       "00",
        "ORD_GNO_BRNO":    "",
        "ODNO":            "",
        "INQR_DVSN_3":     "00",
        "INQR_DVSN_1":     "",
        "CTX_AREA_FK100":  "",
        "CTX_AREA_NK100":  "",
    }
    try:
        res    = safe_request("GET", url, headers=headers,
                              params=params)
        orders = res.get("output1", [])
        result = []
        for o in orders:
            result.append({
                "name":  o.get("prdt_name", ""),
                "qty":   int(o.get("tot_ccld_qty", 0)),
                "price": int(float(o.get("avg_prvs", 0))),
                "status": o.get("ord_tmd", ""),
                "side":  "BUY" if o.get(
                    "sll_buy_dvsn_cd", "") == "02" else "SELL",
            })
        return result
    except Exception as e:
        print(f"[get_order_result] {stock_code}: {e}")
        return []        