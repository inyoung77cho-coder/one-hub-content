# kis_api.py — ONE-HUB v5.2
# ============================================================
# v5.2 수정사항:
#   [Fix F] 파일 중간의 dead code 제거
#           기존: sell_order() 함수 본문 안에 'import time as _time'과
#                 '_token_cache = {}' 재선언이 들어있음 → 절대 실행 안 됨
#           수정: 해당 두 줄 삭제
#   [Fix G] get_holdings() 헬퍼 함수 추가
#           → main.py on_startup()과 _get_held_codes()에서 재사용
# ============================================================

import requests
import json
import time as _time

from config import APP_KEY, APP_SECRET, BASE_URL, ACCOUNT_NO, ACCOUNT_CODE, IS_REAL

_token_cache = {"token": None, "expires": 0}


# [v7.4] API 상태 추적
_api_fail_count: int = 0
_api_last_fail:  float = 0.0
_api_cache:      dict = {}
API_CACHE_TTL:   int = 300

def get_api_health() -> str:
    if _api_fail_count == 0:
        return "[OK] KIS API: 정상"
    elif _api_fail_count < 3:
        return f"[WARN] KIS API: 오류 {_api_fail_count}회"
    else:
        return f"[ERROR] KIS API: 장애 {_api_fail_count}회 연속"

def safe_request(method, url, headers=None, params=None, data=None,
                 retries=3, cache_key=None):
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
                res = requests.get(url, headers=headers, params=params, timeout=10)
            else:
                res = requests.post(url, headers=headers, data=data, timeout=10)
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
            send_critical(f"[KIS API 장애] 연속 {_api_fail_count}회 실패\n오류: {str(last_err)[:80]}")
        except Exception:
            pass

    raise Exception(f"API FAILED after {retries} retries: {last_err}")

def get_access_token():
    now = _time.time()
    if _token_cache["token"] and now < _token_cache["expires"]:
        return _token_cache["token"]
    url  = f"{BASE_URL}/oauth2/tokenP"
    body = {
        "grant_type": "client_credentials",
        "appkey":     APP_KEY,
        "appsecret":  APP_SECRET
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
        _token_cache["token"]   = token
        _token_cache["expires"] = now + 3600 * 23
        print("Token OK")
        return token
    except Exception as e:
        print(f"Token error: {e}")
        if _token_cache["token"]:
            print("Using cached token")
            return _token_cache["token"]
        raise


def get_balance(token):
    url   = f"{BASE_URL}/uapi/domestic-stock/v1/trading/inquire-balance"
    tr_id = "TTTC8434R" if IS_REAL else "VTTC8434R"
    headers = {
        "content-type":  "application/json",
        "authorization": f"Bearer {token}",
        "appkey":        APP_KEY,
        "appsecret":     APP_SECRET,
        "tr_id":         tr_id,
        "custtype":      "P"
    }
    params = {
        "CANO":                  ACCOUNT_NO,
        "ACNT_PRDT_CD":          ACCOUNT_CODE,
        "AFHR_FLPR_YN":          "N",
        "OFL_YN":                "",
        "INQR_DVSN":             "02",
        "UNPR_DVSN":             "01",
        "FUND_STTL_ICLD_YN":     "N",
        "FNCG_AMT_AUTO_RDPT_YN": "N",
        "PRCS_DVSN":             "00",
        "CTX_AREA_FK100":        "",
        "CTX_AREA_NK100":        ""
    }
    return safe_request("GET", url, headers=headers, params=params, cache_key="balance")


def get_holdings(token) -> list:
    """
    [Fix G] 보유종목 리스트만 반환하는 헬퍼.
    on_startup() 및 _get_held_codes()에서 중복 코드 줄이기 위해 추가.
    Returns: output1 리스트 (빈 리스트 반환 시 빈 list)
    """
    try:
        balance = get_balance(token)
        return balance.get("output1", [])
    except Exception as e:
        print(f"[get_holdings] 오류: {e}")
        return []


def buy_order(token, stock_code, qty):
    if not IS_REAL:
        print(f"  [MOCK] Buy {stock_code} x{qty}")
        return {"msg1": "mock buy ok"}
    url     = f"{BASE_URL}/uapi/domestic-stock/v1/trading/order-cash"
    headers = {
        "content-type":  "application/json",
        "authorization": f"Bearer {token}",
        "appkey":        APP_KEY,
        "appsecret":     APP_SECRET,
        "tr_id":         "TTTC0802U",
        "custtype":      "P"
    }
    body = {
        "CANO":         ACCOUNT_NO,
        "ACNT_PRDT_CD": ACCOUNT_CODE,
        "PDNO":         stock_code,
        "ORD_DVSN":     "01",
        "ORD_QTY":      str(qty),
        "ORD_UNPR":     "0"
    }
    return safe_request("POST", url, headers=headers, data=json.dumps(body))


def sell_order(token, stock_code, qty):
    if not IS_REAL:
        print(f"  [MOCK] Sell {stock_code} x{qty}")
        return {"msg1": "mock sell ok"}
    url     = f"{BASE_URL}/uapi/domestic-stock/v1/trading/order-cash"
    headers = {
        "content-type":  "application/json",
        "authorization": f"Bearer {token}",
        "appkey":        APP_KEY,
        "appsecret":     APP_SECRET,
        "tr_id":         "TTTC0801U",
        "custtype":      "P"
    }
    body = {
        "CANO":         ACCOUNT_NO,
        "ACNT_PRDT_CD": ACCOUNT_CODE,
        "PDNO":         stock_code,
        "ORD_DVSN":     "01",
        "ORD_QTY":      str(qty),
        "ORD_UNPR":     "0"
    }
    return safe_request("POST", url, headers=headers, data=json.dumps(body))
    # [Fix F] 기존: 여기에 'import time as _time'과 '_token_cache = {}' 재선언이
    #          있었음 — sell_order return 이후라 절대 실행되지 않던 dead code.
    #          삭제 완료.


def get_current_price(token, stock_code):
    url     = f"{BASE_URL}/uapi/domestic-stock/v1/quotations/inquire-price"
    headers = {
        "content-type":  "application/json",
        "authorization": f"Bearer {token}",
        "appkey":        APP_KEY,
        "appsecret":     APP_SECRET,
        "tr_id":         "FHKST01010100",
        "custtype":      "P"
    }
    params = {
        "FID_COND_MRKT_DIV_CODE": "J",
        "FID_INPUT_ISCD":         stock_code,
    }
    try:
        res    = safe_request("GET", url, headers=headers, params=params)
        output = res.get("output", {})
        price  = int(float(output.get("stck_prpr", 0)))
        return price
    except Exception as e:
        print(f"[get_current_price] {stock_code}: {e}")
        return 0


def get_order_result(token, stock_code):
    """당일 체결 내역 조회."""
    url   = f"{BASE_URL}/uapi/domestic-stock/v1/trading/inquire-daily-ccld"
    tr_id = "TTTC8001R" if IS_REAL else "VTTC8001R"
    headers = {
        "content-type":  "application/json",
        "authorization": f"Bearer {token}",
        "appkey":        APP_KEY,
        "appsecret":     APP_SECRET,
        "tr_id":         tr_id,
        "custtype":      "P"
    }
    from datetime import datetime
    today  = datetime.now().strftime("%Y%m%d")
    params = {
        "CANO":            ACCOUNT_NO,
        "ACNT_PRDT_CD":    ACCOUNT_CODE,
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
        "CTX_AREA_NK100":  ""
    }
    try:
        res    = safe_request("GET", url, headers=headers, params=params)
        orders = res.get("output1", [])
        result = []
        for o in orders:
            result.append({
                "name":   o.get("prdt_name", ""),
                "qty":    int(o.get("tot_ccld_qty", 0)),
                "price":  int(float(o.get("avg_prvs", 0))),
                "status": o.get("ord_tmd", ""),
                "side":   "BUY" if o.get("sll_buy_dvsn_cd", "") == "02" else "SELL",
            })
        return result
    except Exception as e:
        print(f"[get_order_result] {stock_code}: {e}")
        return []
