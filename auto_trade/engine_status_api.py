
# -*- coding: utf-8 -*-

from flask import Flask, jsonify

from flask_cors import CORS

import subprocess, json, os

from datetime import datetime, timezone, timedelta



app = Flask(__name__)

import os as _os
PWA_API_KEY = _os.getenv("PWA_API_KEY", "")

def _check_api_key():
    from flask import request
    if not PWA_API_KEY:
        return True
    return request.headers.get("X-API-Key", "") == PWA_API_KEY

CORS(app)

KST = timezone(timedelta(hours=9))



def get_systemd_status():

    try:

        r = subprocess.run(["systemctl","is-active","onehub.service"],

            capture_output=True,text=True,timeout=5)

        active = r.stdout.strip() == "active"

        ps = subprocess.run(["pgrep","-f","main.py"],

            capture_output=True,text=True,timeout=5)

        pids = [p for p in ps.stdout.strip().split("\n") if p]

        # started_at을 ISO 형식으로 변환

        st = subprocess.run(

            ["systemctl","show","onehub.service","--property=ActiveEnterTimestampMonotonic",

             "--property=ActiveEnterTimestamp"],

            capture_output=True,text=True,timeout=5)

        started_iso = None

        for line in st.stdout.strip().split("\n"):

            if line.startswith("ActiveEnterTimestamp=") and not "Monotonic" in line:

                raw = line.replace("ActiveEnterTimestamp=","").strip()

                if raw:

                    try:

                        # "Fri 2026-05-29 22:55:09 KST" 형식 파싱

                        dt = datetime.strptime(raw, "%a %Y-%m-%d %H:%M:%S KST")

                        dt = dt.replace(tzinfo=KST)

                        started_iso = dt.isoformat()

                    except Exception:

                        started_iso = raw

        return {"is_active":active,"status":"running" if active else "stopped",

                "process_count":len(pids),"pids":pids,"started_at":started_iso}

    except Exception as e:

        return {"is_active":False,"status":"error","error":str(e)}



def get_holdings():

    try:

        import sys

        sys.path.insert(0, '/home/ubuntu/one-hub/auto_trade')

        import kis_api

        token = kis_api.get_access_token()

        raw = kis_api.get_holdings(token)

        result = []

        for h in raw:

            qty = int(h.get("hldg_qty", 0))

            if qty <= 0:

                continue

            avg = int(float(h.get("pchs_avg_pric", 0)))

            name = h.get("prdt_name", "")

            pfls_rt = float(h.get("evlu_pfls_rt", 0) or 0)

            if pfls_rt > 0:

                pnl_dir = "\u25b2"

            elif pfls_rt < 0:

                pnl_dir = "\u25bc"

            else:

                pnl_dir = "\u27d6"

            result.append({"name": name, "qty": qty, "avg_price": avg, "pnl_dir": pnl_dir})

        return result if result else []

    except Exception as e:

        print(f"[get_holdings] KIS API 오류: {e}")

        return []






def get_schedule():

    now = datetime.now(KST)

    items = [

        {"id":"morning_brief","label":"\ubaa8\ub2dd\ube0c\ub9ac\ud551","time_kst":"07:00"},

        {"id":"reset","label":"\ub9ac\uc14b","time_kst":"08:30"},

        {"id":"am_analysis","label":"\uc624\uc804\ubd84\uc11d","time_kst":"08:50"},

        {"id":"pm_analysis","label":"\uc624\ud6c4\ubd84\uc11d","time_kst":"13:30"},

        {"id":"daily_publish","label":"Daily \ub9ac\ud3ec\ud2b8 \ubc1c\ud589","time_kst":"15:30"},

        {"id":"evening_report","label":"\uc800\ub141\ub9ac\ud3ec\ud2b8","time_kst":"15:40"},

        {"id":"weekly_publish","label":"Weekly \ubc1c\ud589 (\uae08)","time_kst":"15:50"},

        {"id":"weekly_preview","label":"\uc8fc\uac04 Preview (\uc77c)","time_kst":"20:00"},

    ]

    result = []

    for ev in items:

        h,m = map(int,ev["time_kst"].split(":"))

        ev_t = now.replace(hour=h,minute=m,second=0,microsecond=0)

        diff = int((ev_t - now).total_seconds()/60)

        status = "done" if diff<0 else ("soon" if diff<30 else "pending")

        result.append({**ev,"status":status,"diff_minutes":diff})

    return sorted(result,key=lambda x:x["time_kst"])


def get_today_block_count():
    try:
        today = datetime.now(KST).strftime("%Y-%m-%d")
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute("SELECT block_count FROM daily_summary WHERE date LIKE ? ORDER BY id DESC LIMIT 1", (f"{today}%",))
        row = c.fetchone()
        conn.close()
        return int(row[0]) if row and row[0] else 0
    except:
        return 0


def get_strategy():

    return [

        {"id":"ml","name":"ML \uc2dc\uadf8\ub110","desc":"\uba38\uc2e0\ub7ec\ub2dd \ubaa8\ub378\uc774 \uc885\ubaa9\ubcc4 \ub9e4\uc218/\ub9e4\ub3c4 \ud655\ub960 \uc2a4\ucf54\uc5b4\ub9c1","icon":"\ud83e\udd16","weight":40},

        {"id":"score","name":"Final Score","desc":"RSI / MACD / \ubcfc\ub9b0\uc800\ubc34\ub4dc \ud1b5\ud569 \uae30\uc220\uc801 \uc810\uc218","icon":"\ud83d\udcca","weight":35},

        {"id":"risk","name":"\ub9ac\uc2a4\ud06c \uad00\ub9ac","desc":"\uc190\uc808(-5%) / \uc775\uc808 \uc790\ub3d9 \uc2e4\ud589, \uc885\ubaa9 \ube44\uc911 \uc81c\ud55c","icon":"\ud83d\udee1\ufe0f","weight":25},

    ]



@app.route("/api/engine-status")

def engine_status():

    return jsonify({

        "timestamp": datetime.now(KST).isoformat(),

        "engine":    get_systemd_status(),

        "holdings":  get_holdings(),

        "schedule":  get_schedule(),

        "strategy":  get_strategy(),

        "block_count": get_today_block_count(),
        "version":   "v8.0",

    })



@app.route("/api/health")

def health():

    return jsonify({"ok":True,"ts":datetime.now(KST).isoformat()})



from db_logger import get_dashboard_data as _get_dashboard_data

@app.route("/api/pwa/dashboard")
def pwa_dashboard():
    from flask import request
    trader_id = request.args.get("trader", "A").upper()
    try:
        data = _get_dashboard_data(trader_id)
        result = {"ok": True, "trader": trader_id}
        result.update(data)
        return jsonify(result)
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


from db_logger import get_watchlist as _get_watchlist, add_watchlist as _add_watchlist, remove_watchlist as _remove_watchlist

@app.route("/api/pwa/watchlist", methods=["GET"])
def pwa_watchlist_get():
    from flask import request
    trader_id = request.args.get("trader", "A").upper()
    try:
        return jsonify({"ok": True, "trader": trader_id, "items": _get_watchlist(trader_id)})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@app.route("/api/pwa/watchlist", methods=["POST"])
def pwa_watchlist_post():
    if not _check_api_key():
        return jsonify({"ok": False, "error": "unauthorized"}), 401
    from flask import request
    data = request.get_json(force=True) or {}
    trader_id = str(data.get("trader", "A")).upper()
    symbol = str(data.get("symbol", "")).strip()
    name = str(data.get("name", "")).strip()
    if not symbol:
        return jsonify({"ok": False, "error": "symbol required"}), 400
    try:
        ok, err = _add_watchlist(trader_id, symbol, name)
        if not ok:
            return jsonify({"ok": False, "error": err or "already exists"}), 409
        return jsonify({"ok": True, "items": _get_watchlist(trader_id)})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@app.route("/api/pwa/watchlist/<int:item_id>", methods=["DELETE"])
def pwa_watchlist_delete(item_id):
    if not _check_api_key():
        return jsonify({"ok": False, "error": "unauthorized"}), 401
    from flask import request
    trader_id = request.args.get("trader", "A").upper()
    try:
        deleted = _remove_watchlist(trader_id, item_id)
        return jsonify({"ok": True, "deleted": deleted, "items": _get_watchlist(trader_id)})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


from db_logger import get_ai_history as _get_ai_history

@app.route("/api/pwa/history", methods=["GET"])
def pwa_history_get():
    from flask import request
    trader_id = request.args.get("trader", "A").upper()
    try:
        limit = int(request.args.get("limit", 30))
    except ValueError:
        limit = 30
    limit = max(1, min(limit, 100))
    try:
        return jsonify({"ok": True, "trader": trader_id, "items": _get_ai_history(trader_id, limit)})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500

if __name__ == "__main__":

    app.run(host="0.0.0.0", port=5001, debug=False)
# ── v8.1 멀티 트레이더 엔드포인트 ───────────────────────────
import sqlite3
from crypto_utils import encrypt, mask

DB_PATH = os.path.join(os.path.expanduser("~"), "trading.db")


@app.route("/api/trader/register", methods=["POST"])
def register_trader():
    """지인이 홈페이지에서 API 키 입력 → 암호화 저장"""
    from flask import request as freq
    data = freq.get_json()

    required = ["trader_id", "display_name",
                "app_key", "app_secret", "account_no"]
    for f in required:
        if not data.get(f):
            return jsonify({"ok": False, "error": f"{f} 필수"}), 400

    try:
        conn = sqlite3.connect(DB_PATH)
        c    = conn.cursor()
        now  = datetime.now(KST).isoformat()
        c.execute("""
            INSERT INTO traders
            (trader_id, display_name, app_key_enc, app_secret_enc,
             account_no_enc, account_code, is_real, telegram_chat_id,
             is_active, created_at, updated_at)
            VALUES (?,?,?,?,?,?,?,?,1,?,?)
            ON CONFLICT(trader_id) DO UPDATE SET
                app_key_enc    = excluded.app_key_enc,
                app_secret_enc = excluded.app_secret_enc,
                account_no_enc = excluded.account_no_enc,
                updated_at     = excluded.updated_at
        """, (
            data["trader_id"],
            data["display_name"],
            encrypt(data["app_key"]),
            encrypt(data["app_secret"]),
            encrypt(data["account_no"]),
            data.get("account_code", "01"),
            1 if data.get("is_real") else 0,
            data.get("telegram_chat_id", ""),
            now, now
        ))
        conn.commit()
        conn.close()

        return jsonify({
            "ok":             True,
            "trader_id":      data["trader_id"],
            "app_key_masked": mask(data["app_key"]),
        })
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@app.route("/api/trader/list")
def list_traders():
    """트레이더 목록 — 마스킹된 값만 반환"""
    try:
        conn = sqlite3.connect(DB_PATH)
        c    = conn.cursor()
        c.execute("""
            SELECT trader_id, display_name, is_real,
                   is_active, created_at
            FROM traders
            ORDER BY created_at
        """)
        rows = c.fetchall()
        conn.close()
        return jsonify([{
            "trader_id":    r[0],
            "display_name": r[1],
            "is_real":      bool(r[2]),
            "is_active":    bool(r[3]),
            "created_at":   r[4],
        } for r in rows])
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/trader/verify/<trader_id>")
def verify_trader(trader_id):
    """트레이더 설정 검증 — API 키 정상 여부 확인"""
    try:
        from config import get_trader_config
        import kis_api
        cfg   = get_trader_config(trader_id)
        token = kis_api.get_access_token(trader_id, cfg)
        if token:
            return jsonify({
                "ok":       True,
                "trader_id": trader_id,
                "message":  "API 키 정상 확인"
            })
        return jsonify({"ok": False, "error": "토큰 발급 실패"}), 400
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


