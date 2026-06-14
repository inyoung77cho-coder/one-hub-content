# db_logger.py — ONE-HUB v5.2
# ============================================================
# v5.2 수정사항:
#   [Fix A] risk_monitor 테이블 추가 → /risk 재시작 후에도 유지
#   [Fix B] blocked_signals 테이블을 init_db()에 포함 (기존엔 누락)
#           → log_blocked() 호출마다 "no such table" 에러 발생하던 것 해소
#   [Fix C] sync_holdings_to_risk_monitor() 추가
#           → 재시작 시 KIS 보유종목을 risk_monitor에 자동 복구
#   [Fix D] get_risk_positions() 추가 → /risk 커맨드용
# ============================================================

import sqlite3
import os
from datetime import datetime
from kst_time import now_kst, today_kst, now_kst_str, is_weekend_kst, KST

DB_PATH = os.path.join(os.path.expanduser("~"), "trading.db")


def init_db():
    conn = sqlite3.connect(DB_PATH)
    c    = conn.cursor()

    c.execute("""
        CREATE TABLE IF NOT EXISTS trades (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT, stock TEXT, action TEXT,
            price REAL, qty INTEGER, pnl REAL,
            reason TEXT, regime TEXT, ai_score REAL
        )
    """)
    c.execute("""
        CREATE TABLE IF NOT EXISTS ai_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT, stock TEXT, action TEXT,
            confidence TEXT, ai_score REAL,
            global_risk TEXT, key_signal TEXT,
            reason TEXT, raw TEXT
        )
    """)
    c.execute("""
        CREATE TABLE IF NOT EXISTS errors (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT, error TEXT, context TEXT
        )
    """)
    c.execute("""
        CREATE TABLE IF NOT EXISTS daily_summary (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT, regime TEXT, final_value REAL,
            daily_pnl REAL, trade_count INTEGER, block_count INTEGER DEFAULT 0
        )
    """)

    # [Fix B] blocked_signals — 기존에 init_db()에 없었던 테이블
    c.execute("""
        CREATE TABLE IF NOT EXISTS blocked_signals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT,
            stock TEXT,
            code TEXT,
            price REAL,
            target REAL,
            stop_loss REAL,
            target_gap_pct REAL,
            ml_signal TEXT,
            final_score REAL,
            rsi REAL,
            regime TEXT,
            errors TEXT,
            target_src TEXT
        )
    """)

    # [Fix A] risk_monitor — 재시작 후에도 포지션 유지되는 핵심 테이블
    c.execute("""
        CREATE TABLE IF NOT EXISTS risk_monitor (
            id               INTEGER PRIMARY KEY AUTOINCREMENT,
            stock_code       TEXT    NOT NULL UNIQUE,
            stock_name       TEXT    DEFAULT '',
            avg_price        INTEGER NOT NULL,
            stop_loss_price  INTEGER NOT NULL,
            target_price     INTEGER NOT NULL,
            qty              INTEGER NOT NULL,
            regime           TEXT    DEFAULT 'SIDEWAYS',
            entry_time       TEXT,
            status           TEXT    DEFAULT 'ACTIVE',
            registered_at    TEXT    NOT NULL,
            updated_at       TEXT
        )
    """)

    conn.commit()
    conn.close()


# ── [Fix C] 재시작 시 보유종목 → risk_monitor 복구 ─────────────
def sync_holdings_to_risk_monitor(holdings_from_kis: list) -> int:
    """
    KIS get_balance() output1 리스트를 받아 risk_monitor에 UPSERT.
    재시작 시 monitor_positions(메모리)와 risk_monitor(DB)를 동기화.

    호출 위치: main.py 시작 직후 on_startup() 내부

    Returns: 동기화된 종목 수
    """
    if not holdings_from_kis:
        return 0

    conn  = sqlite3.connect(DB_PATH)
    c     = conn.cursor()
    count = 0
    now   = now_kst().strftime("%Y-%m-%d %H:%M:%S")

    for h in holdings_from_kis:
        code = (h.get("stck_shrn_iscd") or h.get("pdno", "")).strip()
        name = h.get("prdt_name", "")
        qty  = int(h.get("hldg_qty", 0))
        avg  = int(float(h.get("pchs_avg_pric", 0)))

        if not code or qty <= 0 or avg <= 0:
            continue

        # 손절/목표: 이미 DB에 있으면 유지, 없으면 기본값 계산
        c.execute("SELECT stop_loss_price, target_price FROM risk_monitor WHERE stock_code=?", (code,))
        existing = c.fetchone()
        if existing:
            stop_price   = existing[0]
            target_price = existing[1]
        else:
            stop_price   = round(avg * 0.93)   # 기본 -7%
            target_price = round(avg * 1.10)   # 기본 +10%

        c.execute("""
            INSERT INTO risk_monitor
                (stock_code, stock_name, avg_price, stop_loss_price, target_price,
                 qty, status, registered_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?)
            ON CONFLICT(stock_code) DO UPDATE SET
                avg_price       = excluded.avg_price,
                qty             = excluded.qty,
                status          = 'ACTIVE',
                updated_at      = excluded.updated_at
        """, (code, name, avg, stop_price, target_price, qty, now, now))
        count += 1

    conn.commit()
    conn.close()
    print(f"[RISK SYNC] {count}개 종목 DB 동기화 완료")
    return count


def register_risk_position(code: str, name: str, avg_price: int,
                            stop_loss: int, target: int, qty: int,
                            regime: str = "SIDEWAYS") -> None:
    """
    /buy 체결 직후 호출 — risk_monitor에 포지션 즉시 등록.
    monitor_positions(메모리)와 항상 함께 업데이트해야 함.
    """
    conn = sqlite3.connect(DB_PATH)
    c    = conn.cursor()
    now  = now_kst().strftime("%Y-%m-%d %H:%M:%S")
    c.execute("""
        INSERT INTO risk_monitor
            (stock_code, stock_name, avg_price, stop_loss_price, target_price,
             qty, regime, entry_time, status, registered_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?)
        ON CONFLICT(stock_code) DO UPDATE SET
            avg_price       = excluded.avg_price,
            stop_loss_price = excluded.stop_loss_price,
            target_price    = excluded.target_price,
            qty             = excluded.qty,
            regime          = excluded.regime,
            entry_time      = excluded.entry_time,
            status          = 'ACTIVE',
            updated_at      = excluded.updated_at
    """, (code, name, avg_price, stop_loss, target, qty, regime,
          now_kst().strftime("%H:%M"), now, now))
    conn.commit()
    conn.close()


def close_risk_position(code: str, reason: str = "SOLD") -> None:
    """매도 완료 후 risk_monitor 상태 CLOSED 처리."""
    conn = sqlite3.connect(DB_PATH)
    c    = conn.cursor()
    c.execute("""
        UPDATE risk_monitor
        SET status = ?, updated_at = ?
        WHERE stock_code = ?
    """, (reason, now_kst().strftime("%Y-%m-%d %H:%M:%S"), code))
    conn.commit()
    conn.close()


def get_risk_positions() -> list:
    """ACTIVE 포지션 전체 반환 — /risk 커맨드 및 재시작 복구용."""
    conn = sqlite3.connect(DB_PATH)
    c    = conn.cursor()
    c.execute("""
        SELECT stock_code, stock_name, avg_price, stop_loss_price,
               target_price, qty, regime, entry_time
        FROM risk_monitor
        WHERE status = 'ACTIVE'
        ORDER BY registered_at
    """)
    rows = c.fetchall()
    conn.close()
    return [
        {
            "code":       r[0],
            "name":       r[1],
            "avg_price":  r[2],
            "stop_loss":  r[3],
            "target":     r[4],
            "qty":        r[5],
            "regime":     r[6],
            "entry_time": r[7],
        }
        for r in rows
    ]


# ── 기존 함수들 (변경 없음) ─────────────────────────────────────

def log_trade(stock, action, price, qty, pnl, reason, regime="", ai_score=0, trader_id=None):
    if trader_id is None:
        trader_id = os.getenv("TRADER_ID", "A").upper()
    conn = sqlite3.connect(DB_PATH)
    c    = conn.cursor()
    c.execute("""
        INSERT INTO trades
        (date,stock,action,price,qty,pnl,reason,regime,ai_score,trader_id)
        VALUES (?,?,?,?,?,?,?,?,?,?)
    """, (now_kst().strftime("%Y-%m-%d %H:%M:%S"),
          stock, action, price, qty, pnl, reason, regime, ai_score, trader_id))
    conn.commit()
    conn.close()


def log_ai(stock, ai_result, trader_id=None):
    if trader_id is None:
        trader_id = os.getenv("TRADER_ID", "A").upper()
    conn = sqlite3.connect(DB_PATH)
    c    = conn.cursor()
    c.execute("""
        INSERT INTO ai_logs
        (date,stock,action,confidence,ai_score,global_risk,key_signal,reason,raw,trader_id)
        VALUES (?,?,?,?,?,?,?,?,?,?)
    """, (now_kst().strftime("%Y-%m-%d %H:%M:%S"),
          stock,
          ai_result.get("action", ""),
          ai_result.get("confidence", ""),
          ai_result.get("ai_score", 0),
          ai_result.get("global_risk", ""),
          ai_result.get("key_signal", ""),
          ai_result.get("reason", ""),
          ai_result.get("raw", ""),
          trader_id))
    conn.commit()
    conn.close()


def log_error(error, context="", trader_id=None):
    if trader_id is None:
        trader_id = os.getenv("TRADER_ID", "A").upper()
    conn = sqlite3.connect(DB_PATH)
    c    = conn.cursor()
    c.execute("""
        INSERT INTO errors (date,error,context,trader_id) VALUES (?,?,?,?)
    """, (now_kst().strftime("%Y-%m-%d %H:%M:%S"),
          str(error), context, trader_id))
    conn.commit()
    conn.close()


def log_daily(regime, final_value, daily_pnl, trade_count, block_count=0, trader_id=None):
    if trader_id is None:
        trader_id = os.getenv("TRADER_ID", "A").upper()
    conn = sqlite3.connect(DB_PATH)
    c    = conn.cursor()
    c.execute("""
        INSERT INTO daily_summary
        (date,regime,final_value,daily_pnl,trade_count,block_count,trader_id)
        VALUES (?,?,?,?,?,?,?)
    """, (now_kst().strftime("%Y-%m-%d"),
          regime, final_value, daily_pnl, trade_count, block_count, trader_id))
    conn.commit()
    conn.close()


def log_blocked(stock, errors):
    """v4.3: 차단된 매수 신호를 DB에 저장."""
    price   = stock.get("price", 0)
    target  = stock.get("target", 0)
    gap_pct = round((target / price - 1) * 100, 1) if price > 0 else 0
    conn = sqlite3.connect(DB_PATH)
    c    = conn.cursor()
    c.execute("""
        INSERT INTO blocked_signals
        (date,stock,code,price,target,stop_loss,target_gap_pct,
         ml_signal,final_score,rsi,regime,errors,target_src)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
    """, (
        now_kst().strftime("%Y-%m-%d %H:%M:%S"),
        stock.get("name", ""),
        stock.get("code", ""),
        price,
        target,
        stock.get("stop_loss", 0),
        gap_pct,
        stock.get("ml_signal", ""),
        stock.get("final_score", 0),
        stock.get("rsi", 0),
        stock.get("regime", ""),
        "|".join(errors),
        stock.get("target_src", "UNKNOWN")
    ))
    conn.commit()
    conn.close()


def get_blocked_stats(days=7):
    """최근 N일 차단 통계 — 자주 막히는 사유 파악용."""
    conn = sqlite3.connect(DB_PATH)
    c    = conn.cursor()
    c.execute("""
        SELECT code, stock, errors, COUNT(*) as cnt
        FROM blocked_signals
        WHERE date >= datetime('now', ?)
        GROUP BY code, errors
        ORDER BY cnt DESC
        LIMIT 20
    """, (f"-{days} days",))
    rows = c.fetchall()
    conn.close()
    return rows


def get_recent_trades(limit=20):
    conn = sqlite3.connect(DB_PATH)
    c    = conn.cursor()
    c.execute("SELECT * FROM trades ORDER BY id DESC LIMIT ?", (limit,))
    rows = c.fetchall()
    conn.close()
    return rows


def get_daily_stats():
    conn  = sqlite3.connect(DB_PATH)
    c     = conn.cursor()
    today = now_kst().strftime("%Y-%m-%d")
    c.execute(
        "SELECT COUNT(*), SUM(pnl) FROM trades WHERE date LIKE ?",
        (f"{today}%",)
    )
    row = c.fetchone()
    conn.close()
    return {"count": row[0] or 0, "pnl": row[1] or 0}


init_db()
print("DB initialized OK")


# ── PWA: cache_balance ───────────────────────────────────────
def update_cache_balance(trader_id, total_asset, realized_pnl, unrealized_pnl, cash, positions_json):
    conn = sqlite3.connect(DB_PATH)
    c    = conn.cursor()
    c.execute("""
        INSERT INTO cache_balance
        (trader_id,total_asset,realized_pnl,unrealized_pnl,cash,positions_json,updated_at)
        VALUES (?,?,?,?,?,?,?)
        ON CONFLICT(trader_id) DO UPDATE SET
            total_asset=excluded.total_asset,
            realized_pnl=excluded.realized_pnl,
            unrealized_pnl=excluded.unrealized_pnl,
            cash=excluded.cash,
            positions_json=excluded.positions_json,
            updated_at=excluded.updated_at
    """, (trader_id, total_asset, realized_pnl, unrealized_pnl, cash, positions_json,
          now_kst().strftime("%Y-%m-%d %H:%M:%S")))
    conn.commit()
    conn.close()


def get_cache_balance(trader_id):
    conn = sqlite3.connect(DB_PATH)
    c    = conn.cursor()
    row = c.execute(
        "SELECT total_asset,realized_pnl,unrealized_pnl,cash,positions_json,updated_at FROM cache_balance WHERE trader_id=?",
        (trader_id,)
    ).fetchone()
    conn.close()
    if not row:
        return None
    return {
        "total_asset": row[0],
        "realized_pnl": row[1],
        "unrealized_pnl": row[2],
        "cash": row[3],
        "positions_json": row[4],
        "updated_at": row[5],
    }


def get_dashboard_data(trader_id):
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    today = now_kst().strftime("%Y-%m-%d")

    row = c.execute("SELECT total_asset,realized_pnl,unrealized_pnl,cash,positions_json,updated_at FROM cache_balance WHERE trader_id=?", (trader_id,)).fetchone()
    balance = None
    if row:
        balance = {"total_asset": row[0], "realized_pnl": row[1], "unrealized_pnl": row[2], "cash": row[3], "positions": row[4], "updated_at": row[5]}

    ds = c.execute("SELECT regime, block_count, final_value, daily_pnl FROM daily_summary WHERE trader_id=? ORDER BY id DESC LIMIT 1", (trader_id,)).fetchone()
    market = None
    if ds:
        market = {"regime": ds[0], "block_count": ds[1], "final_value": ds[2], "daily_pnl": ds[3]}

    buys = c.execute("SELECT stock, ai_score, reason FROM ai_logs WHERE date LIKE ? AND action = ? AND trader_id=? ORDER BY id DESC LIMIT 5", (today + "%", "BUY", trader_id)).fetchall()
    buy_list = [{"stock": r[0], "score": r[1], "reason": r[2]} for r in buys]

    blocked = c.execute("SELECT stock, ml_signal, final_score, errors FROM blocked_signals WHERE date LIKE ? ORDER BY id DESC LIMIT 10", (today + "%",)).fetchall()
    blocked_list = [{"stock": r[0], "signal": r[1], "score": r[2], "reason": r[3]} for r in blocked]

    conn.close()
    return {"balance": balance, "market": market, "today_buys": buy_list, "today_blocked": blocked_list}


def get_watchlist(trader_id):
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    rows = c.execute("SELECT id, symbol, name, created_at FROM watchlist WHERE trader_id=? ORDER BY id DESC", (trader_id,)).fetchall()
    conn.close()
    return [{"id": r[0], "symbol": r[1], "name": r[2], "created_at": r[3]} for r in rows]


def add_watchlist(trader_id, symbol, name):
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    try:
        c.execute("INSERT INTO watchlist (trader_id, symbol, name, created_at) VALUES (?,?,?,?)", (trader_id, symbol, name, now_kst().strftime("%Y-%m-%d %H:%M:%S")))
        conn.commit()
        ok = True
        err = None
    except sqlite3.IntegrityError as e:
        ok = False
        err = str(e)
    conn.close()
    return ok, err


def remove_watchlist(trader_id, item_id):
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("DELETE FROM watchlist WHERE id=? AND trader_id=?", (item_id, trader_id))
    deleted = c.rowcount
    conn.commit()
    conn.close()
    return deleted


def get_ai_history(trader_id, limit=30):
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    rows = c.execute("SELECT date, stock, action, confidence, ai_score, global_risk, key_signal, reason FROM ai_logs WHERE trader_id=? ORDER BY id DESC LIMIT ?", (trader_id, limit)).fetchall()
    conn.close()
    return [{"date": r[0], "stock": r[1], "action": r[2], "confidence": r[3], "ai_score": r[4], "global_risk": r[5], "key_signal": r[6], "reason": r[7]} for r in rows]
