import json
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
import json
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
            target_src TEXT,
            trader_id TEXT DEFAULT 'A'
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

    # [v9.0 Trade Memory] trade_reflections — 포지션 1개의 생애주기(가설→결과→교훈) 기록
    c.execute("""
        CREATE TABLE IF NOT EXISTS trade_reflections (
            id                INTEGER PRIMARY KEY AUTOINCREMENT,
            trader_id         TEXT    NOT NULL,
            stock_code        TEXT    NOT NULL,
            stock_name        TEXT    DEFAULT '',

            entry_trade_id    INTEGER,
            exit_trade_id     INTEGER,

            entry_date        TEXT    NOT NULL,
            regime_at_entry   TEXT,
            heat_at_entry     REAL,
            final_score       REAL,
            ml_signal         TEXT,
            entry_reason      TEXT,
            entry_hypothesis  TEXT,
            entry_price       REAL,
            qty               INTEGER,
            target_price      REAL,
            stop_loss_price   REAL,

            exit_date         TEXT,
            exit_price        REAL,
            exit_reason       TEXT,
            pnl_amount        REAL,
            pnl_rate          REAL,
            holding_days      INTEGER,
            outcome           TEXT    DEFAULT 'OPEN',

            reflection_text   TEXT,
            lesson_tag        TEXT,

            created_at        TEXT    NOT NULL,
            updated_at        TEXT
        )
    """)
    c.execute("CREATE INDEX IF NOT EXISTS idx_tr_trader  ON trade_reflections(trader_id)")
    c.execute("CREATE INDEX IF NOT EXISTS idx_tr_outcome ON trade_reflections(outcome)")
    c.execute("CREATE INDEX IF NOT EXISTS idx_tr_tag     ON trade_reflections(lesson_tag)")
    c.execute("CREATE INDEX IF NOT EXISTS idx_tr_open    ON trade_reflections(trader_id, stock_code, outcome)")


    # [event_log] 통합 이벤트 로그 -- 모든 의사결정/거래/상태변화를 단일 스트림으로 기록
    c.execute("""
        CREATE TABLE IF NOT EXISTS event_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT,
            trader_id TEXT,
            event_type TEXT,
            stock TEXT,
            summary TEXT,
            payload TEXT
        )
    """)
    c.execute("CREATE INDEX IF NOT EXISTS idx_event_log_type ON event_log(event_type)")
    c.execute("CREATE INDEX IF NOT EXISTS idx_event_log_trader ON event_log(trader_id)")
    c.execute("CREATE INDEX IF NOT EXISTS idx_event_log_date ON event_log(date)")

    # [v8.3] pending_signals — PWA 승인/거절 버튼 연동용
    c.execute("""
        CREATE TABLE IF NOT EXISTS pending_signals (
            code         TEXT,
            trader_id    TEXT DEFAULT 'A',
            name         TEXT,
            action       TEXT,
            qty          INTEGER,
            price        INTEGER,
            reason       TEXT,
            final_score  REAL,
            regime       TEXT,
            ml_signal    TEXT,
            target       INTEGER,
            stop_loss    INTEGER,
            status       TEXT DEFAULT 'pending',
            created_at   TEXT,
            updated_at   TEXT,
            PRIMARY KEY (code, trader_id)
        )
    """)

    # [v8.4] app_state — 런타임 설정 영속화 (AI모드 등, 재시작 후에도 유지)
    c.execute("""
        CREATE TABLE IF NOT EXISTS app_state (
            trader_id  TEXT DEFAULT 'A',
            key        TEXT,
            value      TEXT,
            updated_at TEXT,
            PRIMARY KEY (trader_id, key)
        )
    """)

    # [v9.0] screening_candidates -- AI 선별 전 기술 스코어링 상위 후보 (PWA 표시 전용, 실거래 로직과 분리)
    c.execute("""
        CREATE TABLE IF NOT EXISTS screening_candidates (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            trader_id   TEXT DEFAULT 'A',
            analysis_id TEXT,
            code        TEXT,
            name        TEXT,
            sector      TEXT,
            score       REAL,
            rsi         REAL,
            change_1d   REAL,
            change_5d   REAL,
            vol_ratio   REAL,
            regime      TEXT,
            created_at  TEXT
        )
    """)
    c.execute("CREATE INDEX IF NOT EXISTS idx_screening_trader ON screening_candidates(trader_id)")

    # [v9.0] push_subscriptions -- PWA Web Push 구독 정보 (텔레그램 미러링 발송용)
    c.execute("""
        CREATE TABLE IF NOT EXISTS push_subscriptions (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            trader_id   TEXT DEFAULT 'A',
            endpoint    TEXT NOT NULL UNIQUE,
            p256dh      TEXT NOT NULL,
            auth        TEXT NOT NULL,
            created_at  TEXT
        )
    """)
    c.execute("CREATE INDEX IF NOT EXISTS idx_push_trader ON push_subscriptions(trader_id)")

    conn.commit()
    conn.close()


def migrate_risk_monitor_trader_id():
    """
    [v9.0] risk_monitor에 trader_id 컬럼 추가 (인계문서 미해결 이슈 #2).
    SQLite는 UNIQUE 제약을 ALTER로 못 바꾸므로 테이블 재생성 방식.
    멱등(idempotent) — trader_id 컬럼이 이미 있으면 바로 리턴, 여러 번 호출해도 안전.

    ⚠️ 마이그레이션 전 데이터(stock_code UNIQUE라 A/B가 섞였을 수 있음)는 신뢰하지 않는다.
       이 함수 실행 직후 main.py의 on_startup()에서 sync_holdings_to_risk_monitor()가
       자동으로 KIS 실잔고로 덮어쓴다(각 프로세스가 자기 TRADER_ID로).
    """
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()

    cols = [row[1] for row in c.execute("PRAGMA table_info(risk_monitor)").fetchall()]
    if "trader_id" in cols:
        conn.close()
        return False  # 이미 마이그레이션됨 — no-op

    print("[MIGRATE] risk_monitor에 trader_id 컬럼 추가 시작...")
    c.execute("ALTER TABLE risk_monitor RENAME TO risk_monitor_old")
    c.execute("""
        CREATE TABLE risk_monitor (
            id               INTEGER PRIMARY KEY AUTOINCREMENT,
            trader_id        TEXT    NOT NULL DEFAULT 'A',
            stock_code       TEXT    NOT NULL,
            stock_name       TEXT    DEFAULT '',
            avg_price        INTEGER NOT NULL,
            stop_loss_price  INTEGER NOT NULL,
            target_price     INTEGER NOT NULL,
            qty              INTEGER NOT NULL,
            regime           TEXT    DEFAULT 'SIDEWAYS',
            entry_time       TEXT,
            status           TEXT    DEFAULT 'ACTIVE',
            registered_at    TEXT    NOT NULL,
            updated_at       TEXT,
            UNIQUE(trader_id, stock_code)
        )
    """)
    default_trader = os.getenv("TRADER_ID", "A").upper()
    c.execute("""
        INSERT INTO risk_monitor
            (trader_id, stock_code, stock_name, avg_price, stop_loss_price,
             target_price, qty, regime, entry_time, status, registered_at, updated_at)
        SELECT ?, stock_code, stock_name, avg_price, stop_loss_price,
               target_price, qty, regime, entry_time, status, registered_at, updated_at
        FROM risk_monitor_old
    """, (default_trader,))
    c.execute("DROP TABLE risk_monitor_old")
    conn.commit()
    conn.close()
    print("[MIGRATE] risk_monitor 마이그레이션 완료")
    return True


# ── [Fix C] 재시작 시 보유종목 → risk_monitor 복구 ─────────────
def sync_holdings_to_risk_monitor(holdings_from_kis: list, trader_id: str = None) -> int:
    """
    KIS get_balance() output1 리스트를 받아 risk_monitor에 UPSERT.
    재시작 시 monitor_positions(메모리)와 risk_monitor(DB)를 동기화.

    호출 위치: main.py 시작 직후 on_startup() 내부

    Returns: 동기화된 종목 수
    """
    if trader_id is None:
        trader_id = os.getenv("TRADER_ID", "A").upper()
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
        c.execute("SELECT stop_loss_price, target_price FROM risk_monitor WHERE trader_id=? AND stock_code=?", (trader_id, code))
        existing = c.fetchone()
        if existing:
            stop_price   = existing[0]
            target_price = existing[1]
        else:
            stop_price   = round(avg * 0.93)   # 기본 -7%
            target_price = round(avg * 1.10)   # 기본 +10%

        c.execute("""
            INSERT INTO risk_monitor
                (trader_id, stock_code, stock_name, avg_price, stop_loss_price, target_price,
                 qty, status, registered_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?)
            ON CONFLICT(trader_id, stock_code) DO UPDATE SET
                avg_price       = excluded.avg_price,
                qty             = excluded.qty,
                status          = 'ACTIVE',
                updated_at      = excluded.updated_at
        """, (trader_id, code, name, avg, stop_price, target_price, qty, now, now))
        count += 1

    conn.commit()
    conn.close()
    print(f"[RISK SYNC] ({trader_id}) {count}개 종목 DB 동기화 완료")
    return count


def register_risk_position(code: str, name: str, avg_price: int,
                            stop_loss: int, target: int, qty: int,
                            regime: str = "SIDEWAYS", trader_id: str = None) -> None:
    """
    /buy 체결 직후 호출 — risk_monitor에 포지션 즉시 등록.
    monitor_positions(메모리)와 항상 함께 업데이트해야 함.

    [v9.0] 분할매수 2·3차 호출 시 qty/avg_price는 반드시 "누적값"을 넘길 것
    (monitor_positions[code]["qty"] 등) — 레그 단위 수량을 넘기면 DB가
    마지막 레그 수량으로 덮어써지는 버그가 있었음 (2026-06-20 수정).
    """
    if trader_id is None:
        trader_id = os.getenv("TRADER_ID", "A").upper()
    conn = sqlite3.connect(DB_PATH)
    c    = conn.cursor()
    now  = now_kst().strftime("%Y-%m-%d %H:%M:%S")
    c.execute("""
        INSERT INTO risk_monitor
            (trader_id, stock_code, stock_name, avg_price, stop_loss_price, target_price,
             qty, regime, entry_time, status, registered_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?)
        ON CONFLICT(trader_id, stock_code) DO UPDATE SET
            avg_price       = excluded.avg_price,
            stop_loss_price = excluded.stop_loss_price,
            target_price    = excluded.target_price,
            qty             = excluded.qty,
            regime          = excluded.regime,
            entry_time      = excluded.entry_time,
            status          = 'ACTIVE',
            updated_at      = excluded.updated_at
    """, (trader_id, code, name, avg_price, stop_loss, target, qty, regime,
          now_kst().strftime("%H:%M"), now, now))
    conn.commit()
    conn.close()


def close_risk_position(code: str, reason: str = "SOLD", trader_id: str = None) -> None:
    """매도 완료 후 risk_monitor 상태 CLOSED 처리."""
    if trader_id is None:
        trader_id = os.getenv("TRADER_ID", "A").upper()
    conn = sqlite3.connect(DB_PATH)
    c    = conn.cursor()
    c.execute("""
        UPDATE risk_monitor
        SET status = ?, updated_at = ?
        WHERE stock_code = ? AND trader_id = ?
    """, (reason, now_kst().strftime("%Y-%m-%d %H:%M:%S"), code, trader_id))
    conn.commit()
    conn.close()


def get_risk_positions(trader_id: str = None) -> list:
    """ACTIVE 포지션 전체 반환 — /risk 커맨드 및 재시작 복구용."""
    if trader_id is None:
        trader_id = os.getenv("TRADER_ID", "A").upper()
    conn = sqlite3.connect(DB_PATH)
    c    = conn.cursor()
    c.execute("""
        SELECT stock_code, stock_name, avg_price, stop_loss_price,
               target_price, qty, regime, entry_time
        FROM risk_monitor
        WHERE status = 'ACTIVE' AND trader_id = ?
        ORDER BY registered_at
    """, (trader_id,))
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


# ── [v9.0 Trade Memory] trade_reflections ──────────────────────

def create_reflection(code: str, name: str, avg_price: float, qty: int,
                       target: float, stop_loss: float, regime: str = "",
                       heat: float = None, final_score: float = None,
                       ml_signal: str = "", entry_reason: str = "",
                       entry_hypothesis: str = "", trader_id: str = None) -> None:
    """
    매수 체결 직후 register_risk_position() 옆에 나란히 호출.

    [분할매수] 같은 trader_id+stock_code의 OPEN 행이 이미 있으면(2·3차 레그)
    entry_date/entry_hypothesis는 보존하고 avg_price/qty/target/stop_loss만 갱신한다.
    avg_price/qty는 반드시 누적값(monitor_positions[code] 기준)을 넘길 것.
    """
    if trader_id is None:
        trader_id = os.getenv("TRADER_ID", "A").upper()
    now = now_kst().strftime("%Y-%m-%d %H:%M:%S")
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()

    existing = c.execute("""
        SELECT id FROM trade_reflections
        WHERE trader_id=? AND stock_code=? AND outcome='OPEN'
        ORDER BY id DESC LIMIT 1
    """, (trader_id, code)).fetchone()

    if existing:
        c.execute("""
            UPDATE trade_reflections
            SET entry_price=?, qty=?, target_price=?, stop_loss_price=?,
                regime_at_entry=?, updated_at=?
            WHERE id=?
        """, (avg_price, qty, target, stop_loss, regime, now, existing[0]))
    else:
        c.execute("""
            INSERT INTO trade_reflections
                (trader_id, stock_code, stock_name, entry_date, regime_at_entry,
                 heat_at_entry, final_score, ml_signal, entry_reason, entry_hypothesis,
                 entry_price, qty, target_price, stop_loss_price, outcome,
                 created_at, updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'OPEN', ?,?)
        """, (trader_id, code, name, now, regime, heat, final_score, ml_signal,
              entry_reason, entry_hypothesis, avg_price, qty, target, stop_loss,
              now, now))

    conn.commit()
    conn.close()


def _auto_reflection(outcome, exit_reason, pnl_rate, holding_days):
    """[v9.0] 매도 결과로 reflection_text · lesson_tag 자동 생성."""
    pr = pnl_rate or 0
    hd = holding_days or 0
    reason = (exit_reason or "").upper()

    # lesson_tag 분류
    if outcome == "WIN":
        if "STOP" in reason or "LOSS" in reason:
            tag = "손절후_반등"           # 손절했는데 올랐음 — 손절선 재검토
        elif pr >= 15:
            tag = "대박_익절"
        elif hd <= 2:
            tag = "단기_스윙_성공"
        else:
            tag = "정상_익절"
    elif outcome == "LOSS":
        if "STOP" in reason or "AUTO_STOP" in reason:
            tag = "손절_실행"             # 손절선 도달 → 정상 리스크 관리
        elif "MANUAL" in reason:
            tag = "수동_손절"
        elif hd >= 10:
            tag = "장기보유_손실"
        else:
            tag = "조기_손실"
    elif outcome == "BREAKEVEN":
        tag = "본전_매도"
    else:
        tag = "미분류"

    # reflection_text 생성
    pnl_str = f"{pr:+.1f}%" if pr else "-"
    hd_str  = f"{hd}일" if hd else "-"
    if outcome == "WIN":
        text = f"✅ 수익 {pnl_str} / 보유 {hd_str} / {exit_reason} — 진입 가설 적중."
        if tag == "단기_스윙_성공":
            text += " 단기 스윙 전략 유효. 유사 셋업 반복 탐색."
        elif tag == "대박_익절":
            text += " 강한 모멘텀 구간. 다음엔 분할매도 검토."
    elif outcome == "LOSS":
        text = f"❌ 손실 {pnl_str} / 보유 {hd_str} / {exit_reason} — 진입 가설 불일치."
        if tag == "손절_실행":
            text += " 손절 규칙 준수. 추가 손실 차단 성공."
        elif tag == "장기보유_손실":
            text += " 장기 보유 중 추세 역전. 중간 점검 강화 필요."
    elif outcome == "BREAKEVEN":
        text = f"⚪ 본전 매도 / 보유 {hd_str} / {exit_reason}."
    else:
        text = f"알 수 없는 결과 / {exit_reason}"

    return text, tag


def close_reflection(code: str, exit_reason: str, exit_price: float = None,
                      trader_id: str = None) -> None:
    """
    매도 완료 후 close_risk_position() 옆에 나란히 호출 — exit/pnl/outcome 기록.

    exit_price=None인 경우(STARTUP_SYNC 등 — 봇이 모르는 사이 매도되어 실제 체결가를
    알 수 없는 경우): pnl 계산을 생략하고 outcome='UNKNOWN'으로 표시한다.
    """
    if trader_id is None:
        trader_id = os.getenv("TRADER_ID", "A").upper()
    now = now_kst().strftime("%Y-%m-%d %H:%M:%S")
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()

    row = c.execute("""
        SELECT id, entry_date, entry_price, qty FROM trade_reflections
        WHERE trader_id=? AND stock_code=? AND outcome='OPEN'
        ORDER BY id DESC LIMIT 1
    """, (trader_id, code)).fetchone()

    if not row:
        print(f"[REFLECTION] WARN: {trader_id}/{code} OPEN 행 없음 — close_reflection 스킵")
        conn.close()
        return

    rid, entry_date, entry_price, qty = row
    entry_price = entry_price or 0
    qty = qty or 0

    if exit_price is None:
        pnl_amount, pnl_rate, outcome = None, None, "UNKNOWN"
    else:
        pnl_amount = round((exit_price - entry_price) * qty) if entry_price and qty else None
        pnl_rate   = round((exit_price / entry_price - 1) * 100, 2) if entry_price else None
        outcome    = "WIN" if (pnl_amount or 0) > 0 else "LOSS" if (pnl_amount or 0) < 0 else "BREAKEVEN"

    holding_days = None
    try:
        d0 = datetime.strptime(entry_date[:10], "%Y-%m-%d")
        d1 = datetime.strptime(now[:10], "%Y-%m-%d")
        holding_days = (d1 - d0).days
    except Exception:
        pass

    # [v9.0] reflection_text / lesson_tag 자동 생성
    reflection_text, lesson_tag = _auto_reflection(
        outcome=outcome, exit_reason=exit_reason,
        pnl_rate=pnl_rate, holding_days=holding_days,
    )

    c.execute("""
        UPDATE trade_reflections
        SET exit_date=?, exit_price=?, exit_reason=?, pnl_amount=?, pnl_rate=?,
            holding_days=?, outcome=?, reflection_text=?, lesson_tag=?, updated_at=?
        WHERE id=?
    """, (now, exit_price, exit_reason, pnl_amount, pnl_rate, holding_days, outcome,
          reflection_text, lesson_tag, now, rid))
    conn.commit()
    conn.close()


def backfill_reflections_from_risk_monitor(trader_id: str = None) -> int:
    """
    [1회성] 이미 risk_monitor에 있는 ACTIVE 포지션에 대해 trade_reflections 행을 만든다.
    이미 OPEN 행이 있는 종목은 건너뜀(멱등).
    """
    if trader_id is None:
        trader_id = os.getenv("TRADER_ID", "A").upper()
    positions = get_risk_positions(trader_id)
    count = 0
    for p in positions:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        existing = c.execute("""
            SELECT id FROM trade_reflections
            WHERE trader_id=? AND stock_code=? AND outcome='OPEN'
        """, (trader_id, p["code"])).fetchone()
        conn.close()
        if existing:
            continue
        create_reflection(
            code=p["code"], name=p["name"], avg_price=p["avg_price"], qty=p["qty"],
            target=p["target"], stop_loss=p["stop_loss"], regime=p.get("regime", ""),
            entry_reason="[backfill] 과거 데이터 — 원본 매수 근거 없음",
            trader_id=trader_id,
        )
        count += 1
    print(f"[BACKFILL] ({trader_id}) trade_reflections {count}건 생성")
    return count


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

    log_event("BUY" if action.upper() == "BUY" else "SELL", trader_id=trader_id,
              stock=stock, summary=f"{stock} {action} {qty}주 @ {price} (PnL: {pnl})",
              payload={"stock": stock, "action": action, "price": price, "qty": qty,
                       "pnl": pnl, "reason": reason, "regime": regime, "ai_score": ai_score})


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

    log_event("ANALYZE", trader_id=trader_id, stock=stock,
              summary=f"{stock} AI분석 - {ai_result.get('action','')} (confidence: {ai_result.get('confidence','')})",
              payload=ai_result)


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

    log_event("DAILY_SUMMARY", trader_id=trader_id, stock=None,
              summary=f"{regime} 장세 / 거래 {trade_count}건 / 차단 {block_count}건 / PnL {daily_pnl}",
              payload={"regime": regime, "final_value": final_value, "daily_pnl": daily_pnl,
                       "trade_count": trade_count, "block_count": block_count})


def log_blocked(stock, errors, trader_id="A"):
    """v4.3: 차단된 매수 신호를 DB에 저장."""
    # [v8.5] PWA/리포트에 노출되는 차단사유를 ML_STRONG_SELL 같은 원시 코드 대신
    # signal_validator의 기존 한글 매핑(_ERROR_KO)으로 변환. 함수 내부 import로
    # 모듈 최상단 순환참조 위험을 피함 (db_logger ↔ signal_validator 간 의존성 없음 확인됨).
    from signal_validator import _ERROR_KO
    errors_ko = [_ERROR_KO.get(e, e) for e in errors]
    price   = stock.get("price", 0)
    target  = stock.get("target", 0)
    gap_pct = round((target / price - 1) * 100, 1) if price > 0 else 0
    conn = sqlite3.connect(DB_PATH)
    c    = conn.cursor()
    c.execute("""
        INSERT INTO blocked_signals
        (date,stock,code,price,target,stop_loss,target_gap_pct,
         ml_signal,final_score,rsi,regime,errors,target_src,trader_id)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
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
        "|".join(errors_ko),
        stock.get("target_src", "UNKNOWN"),
        trader_id
    ))
    conn.commit()
    conn.close()

    log_event("BLOCK", trader_id=trader_id, stock=stock.get("name",""),
              summary=f"{stock.get('name','')} 매수 차단 - {', '.join(errors_ko)}",
              payload={**stock, "errors": errors})

    # [S18] block_accuracy 파이프라인 — 사후검증(3거래일 후 채점) 대상으로 등록한다.
    #   왜: log_blocked 는 blocked_signals 에만 썼고 block_accuracy 에 INSERT 하는 코드가
    #       어디에도 없었다. 그 결과 채점기(block_accuracy_checker)와 크론은 정상인데
    #       입력이 없어 2026-06-14~16 의 38건에서 한 달째 고정됐고, 화면의 검증 건수가
    #       변하지 않았다. 여기서 연결한다.
    #   보수적 원칙: 실패해도 위 차단 기록에는 영향을 주지 않는다(완전 격리).
    try:
        _register_block_accuracy(stock, errors_ko, trader_id)
    except Exception as _e:
        print(f"[block_accuracy] 등록 실패(차단 기록에는 영향 없음): {_e}")


def _register_block_accuracy(stock, errors_ko, trader_id="A"):
    """차단 건을 사후검증 대기로 등록. 같은 날 같은 종목은 1행만 만든다.

    중복을 DB 레벨에서 막는 이유(B-4): 한 종목이 여러 사유로 걸리면 행이 여러 개 생겨
    화면의 차단 건수가 종목 수보다 커진다(관측: 8개 항목 = 실제 5종목).
    사유가 여럿이면 한 행에 모아 적는다.
    check_date/check_price/result 는 비워 둔다 — block_accuracy_checker 가 T+3 거래일에 채운다.
    """
    price = stock.get("price", 0)
    code = str(stock.get("code", "") or "").strip()
    name = stock.get("name", "") or code
    if not code or not (price and price > 0):
        return  # 코드·가격이 없으면 사후검증이 불가능하다. 조용히 건너뛴다.
    reason = ", ".join(errors_ko) if errors_ko else "사유 미기재"
    now = now_kst().strftime("%Y-%m-%d %H:%M:%S")
    conn = sqlite3.connect(DB_PATH)
    try:
        c = conn.cursor()
        c.execute("""
            INSERT INTO block_accuracy
                (block_date, code, stock, block_price, block_reason, trader_id, created_at)
            SELECT ?, ?, ?, ?, ?, ?, ?
            WHERE NOT EXISTS (
                SELECT 1 FROM block_accuracy
                WHERE code = ? AND trader_id = ? AND date(block_date) = date(?)
            )
        """, (now, code, name, price, reason, trader_id, now,
              code, trader_id, now))
        conn.commit()
    finally:
        conn.close()



def get_blocked_stats(days=7, trader_id=None):
    """최근 N일 차단 통계 — 자주 막히는 사유 파악용. trader_id 지정시 필터링."""
    conn = sqlite3.connect(DB_PATH)
    c    = conn.cursor()
    where_clause = "WHERE date >= datetime('now', ?)"
    params = [f"-{days} days"]
    if trader_id:
        where_clause += " AND trader_id = ?"
        params.append(trader_id)
    c.execute(f"""
        SELECT code, stock, errors, COUNT(*) as cnt
        FROM blocked_signals
        {where_clause}
        GROUP BY code, errors
        ORDER BY cnt DESC
        LIMIT 20
    """, params)
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


def get_daily_stats(trader_id=None):
    # [v9.0 P0-4] trader_id 필터 누락 시 A/B 계좌 손익이 합산되어 표시되는 문제 수정.
    if trader_id is None:
        trader_id = os.getenv("TRADER_ID", "A").upper()
    conn  = sqlite3.connect(DB_PATH)
    c     = conn.cursor()
    today = now_kst().strftime("%Y-%m-%d")
    c.execute(
        "SELECT COUNT(*), SUM(pnl) FROM trades WHERE date LIKE ? AND trader_id=?",
        (f"{today}%", trader_id)
    )
    row = c.fetchone()
    conn.close()
    return {"count": row[0] or 0, "pnl": row[1] or 0}


init_db()
migrate_risk_monitor_trader_id()
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

    # [v9.0] 보유종목에 AI 매수 가설(entry_hypothesis) 병합 — PWA "AI 의견" 필드용
    if balance and balance.get("positions"):
        try:
            _positions = json.loads(balance["positions"])
            _refl_rows = c.execute("""
                SELECT stock_code, entry_hypothesis, entry_reason
                FROM trade_reflections
                WHERE trader_id=? AND outcome='OPEN'
            """, (trader_id,)).fetchall()
            _refl_map = {r[0]: {"entry_hypothesis": r[1] or "", "entry_reason": r[2] or ""} for r in _refl_rows}
            # [v8.7] risk_monitor의 목표가/손절가 병합 -- PWA 보유종목 카드 표시용
            _risk_rows = c.execute("""
                SELECT stock_code, target_price, stop_loss_price
                FROM risk_monitor
                WHERE trader_id=? AND status='ACTIVE'
            """, (trader_id,)).fetchall()
            _risk_map = {r[0]: {"target": r[1], "stop_loss": r[2]} for r in _risk_rows}
            for _p in _positions:
                _match = _refl_map.get(_p.get("code", ""), {})
                _p["entry_hypothesis"] = _match.get("entry_hypothesis", "")
                _p["entry_reason"] = _match.get("entry_reason", "")
                _rmatch = _risk_map.get(_p.get("code", ""), {})
                _p["target"] = _rmatch.get("target", 0)
                _p["stop_loss"] = _rmatch.get("stop_loss", 0)
            balance["positions"] = json.dumps(_positions, ensure_ascii=False)
        except Exception as _e:
            print(f"[DASHBOARD] entry_hypothesis 병합 실패(무시): {_e}")

    ds = c.execute("SELECT regime, block_count, final_value, daily_pnl FROM daily_summary WHERE trader_id=? ORDER BY id DESC LIMIT 1", (trader_id,)).fetchone()
    market = None
    if ds:
        market = {"regime": ds[0], "block_count": ds[1], "final_value": ds[2], "daily_pnl": ds[3]}

    # [v8.5] Heat 표시 버그 수정 — daily_summary엔 heat_score 컬럼이 없어서
    # PWA Heat Gauge/Report 요약이 항상 빈 값이었음. heat_history 최신값을 market에 병합.
    hh = c.execute("SELECT heat_score, fear_greed, vix FROM heat_history WHERE trader_id=? ORDER BY id DESC LIMIT 1", (trader_id,)).fetchone()
    if market is not None:
        market["heat_score"]  = hh[0] if hh else None
        market["fear_greed"]  = hh[1] if hh else None
        market["vix"]         = round(float(hh[2]), 1) if hh and hh[2] else None
        # [v8.7] 레짐 지속일 — app_state에서 읽음 (patch5에서 매 사이클 갱신)
        try:
            _rd = c.execute("SELECT value FROM app_state WHERE trader_id=? AND key='regime_days'", (trader_id,)).fetchone()
            market["regime_days"] = int(_rd[0]) if _rd else None
        except Exception:
            market["regime_days"] = None

    buys = c.execute("SELECT stock, ai_score, reason FROM ai_logs WHERE date LIKE ? AND action = ? AND trader_id=? ORDER BY id DESC LIMIT 5", (today + "%", "BUY", trader_id)).fetchall()
    buy_list = [{"stock": r[0], "score": r[1], "reason": r[2]} for r in buys]

    blocked = c.execute("SELECT stock, ml_signal, final_score, errors FROM blocked_signals WHERE date LIKE ? AND trader_id=? ORDER BY id DESC LIMIT 10", (today + "%", trader_id)).fetchall()
    blocked_list = [{"stock": r[0], "signal": r[1], "score": r[2], "reason": r[3]} for r in blocked]

    recent_decisions = get_events(trader_id=trader_id, limit=10)

    try:
        screening_candidates = get_screening_candidates(trader_id)
    except Exception as _e:
        print(f"[DASHBOARD] screening_candidates 조회 실패(무시): {_e}")
        screening_candidates = []

    # [v8.8] PART 3: stop_state ?? (????? risk_monitor ??)
    stop_states = {}
    try:
        _ss_rows = c.execute("""
            SELECT stock_code, stop_state FROM risk_monitor
            WHERE trader_id=? AND status='ACTIVE'
        """, (trader_id,)).fetchall()
        stop_states = {r[0]: r[1] for r in _ss_rows}
    except Exception as _e:
        print(f"[DASHBOARD] stop_state ?? ??(??): {_e}")

    # [v8.8] PART 3: after_market ?? (app_state? ??? ?? ?)
    after_market_summary = None
    try:
        _am = c.execute("SELECT value FROM app_state WHERE trader_id=? AND key='after_market_summary'", (trader_id,)).fetchone()
        if _am:
            after_market_summary = _am[0]
    except Exception:
        pass

    conn.close()

    # [v8.8] Pre-flight: 포지션/현금 기준 추천 가능 여부 마킹
    MAX_POS = int(os.getenv("MAX_POSITIONS", "5"))
    MIN_ORDER = 300000  # 최소 주문 금액 30만원
    try:
        _cash = float(balance.get("cash", 0)) if balance else 0
        _pos_count = len(json.loads(balance.get("positions", "[]"))) if balance else 0
    except Exception:
        _cash = 0; _pos_count = 0
    _cash_ok = _cash >= MIN_ORDER
    _pos_ok = _pos_count < MAX_POS
    for sc in screening_candidates:
        sc["preflight_ok"] = _cash_ok and _pos_ok
        sc["preflight_reason"] = "" if (_cash_ok and _pos_ok) else (
            "보유종목 한도" if not _pos_ok else "현금 부족"
        )

    return {
        "balance": balance, "market": market,
        "today_buys": buy_list, "today_blocked": blocked_list,
        "recent_decisions": recent_decisions,
        "screening_candidates": screening_candidates,
        "stop_states": stop_states,
        "after_market_summary": after_market_summary,
    }


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


def save_screening_candidates(candidates, trader_id=None, regime="", analysis_id=""):
    """[v9.0] screen_top_stocks() 내부 호출 -- AI 선별 전 기술 스코어링 상위 후보를
    PWA 관심종목/스캔결과 표시용으로 저장. 실거래 로직과 분리된 표시 전용 데이터.
    fail-open: 호출부에서 항상 try/except로 감쌀 것."""
    if trader_id is None:
        trader_id = os.getenv("TRADER_ID", "A").upper()
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    now = now_kst_str()
    c.execute("DELETE FROM screening_candidates WHERE trader_id=?", (trader_id,))
    for s in candidates:
        c.execute("""
            INSERT INTO screening_candidates
            (trader_id, analysis_id, code, name, sector, score, rsi,
             change_1d, change_5d, vol_ratio, regime, created_at,
             macro_score, tech_score, ml_score, risk_score, reasons, final_score)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        """, (
            trader_id, analysis_id,
            s.get("code", ""), s.get("name", ""), s.get("sector", ""),
            s.get("score", 0), s.get("rsi", 0),
            s.get("change_1d", 0), s.get("change_5d", 0),
            s.get("vol_ratio", 0), regime, now,
            s.get("macro_score"), s.get("tech_score"),
            s.get("ml_score"),
            s.get("risk_score"),
            ",".join(s.get("reasons", [])) if isinstance(s.get("reasons"), list) else s.get("reasons", ""),
            s.get("final_score", s.get("score", 0))
        ))
    conn.commit()
    conn.close()


def get_screening_candidates(trader_id=None):
    """PWA 관심종목/스캔결과 조회용."""
    if trader_id is None:
        trader_id = os.getenv("TRADER_ID", "A").upper()
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    rows = c.execute("""
        SELECT code, name, sector, score, rsi, change_1d, change_5d, vol_ratio, regime, created_at,
               macro_score, tech_score, ml_score, risk_score, reasons, final_score
        FROM screening_candidates WHERE trader_id=? ORDER BY score DESC
    """, (trader_id,)).fetchall()
    conn.close()
    return [
        {"code": r[0], "name": r[1], "sector": r[2], "score": r[3], "rsi": r[4],
         "change_1d": r[5], "change_5d": r[6], "vol_ratio": r[7], "regime": r[8], "created_at": r[9],
         "macro_score": r[10] or 0, "tech_score": r[11] or 0, "ml_score": r[12] or 50,
         "risk_score": r[13] or 50,
         "reasons": [x for x in (r[14] or "").split(",") if x],
         "final_score": r[15] or r[3]}
        for r in rows
    ]


def save_push_subscription(trader_id, endpoint, p256dh, auth):
    """[v9.0] PWA Web Push 구독 등록/갱신. endpoint UNIQUE라 재구독 시 자동 갱신."""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    now = now_kst_str()
    c.execute("""
        INSERT INTO push_subscriptions (trader_id, endpoint, p256dh, auth, created_at)
        VALUES (?,?,?,?,?)
        ON CONFLICT(endpoint) DO UPDATE SET
            trader_id  = excluded.trader_id,
            p256dh     = excluded.p256dh,
            auth       = excluded.auth,
            created_at = excluded.created_at
    """, (trader_id, endpoint, p256dh, auth, now))
    conn.commit()
    conn.close()


def get_push_subscriptions(trader_id=None):
    """[v9.0] push_bot.py에서 발송 대상 조회용. trader_id 없으면 전체."""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    if trader_id:
        rows = c.execute(
            "SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE trader_id=?",
            (trader_id,)
        ).fetchall()
    else:
        rows = c.execute("SELECT endpoint, p256dh, auth FROM push_subscriptions").fetchall()
    conn.close()
    return [{"endpoint": r[0], "p256dh": r[1], "auth": r[2]} for r in rows]


def delete_push_subscription(endpoint):
    """[v9.0] 만료/취소된 구독 정리 (404/410 응답 시 push_bot.py가 호출)."""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("DELETE FROM push_subscriptions WHERE endpoint=?", (endpoint,))
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


def log_heat_score(heat_score, heat_grade, regime, market_data, trader_id=None):
    if trader_id is None:
        trader_id = os.getenv("TRADER_ID", "A").upper()
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("""
        INSERT INTO heat_history
        (date,heat_score,heat_grade,regime,nasdaq_chg,sox_chg,vix,fear_greed,usdkrw,macro_score,trader_id)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)
    """, (now_kst().strftime("%Y-%m-%d %H:%M:%S"),
          heat_score, heat_grade, regime,
          market_data.get("nasdaq_chg"), market_data.get("sox_chg"),
          market_data.get("vix"), market_data.get("fear_greed"),
          market_data.get("usdkrw"), market_data.get("macro_score"),
          trader_id))
    conn.commit()
    conn.close()

    log_event("HEAT_UPDATE", trader_id=trader_id, stock=None,
              summary=f"Heat Score {heat_score} ({heat_grade}) - {regime}",
              payload={"heat_score": heat_score, "heat_grade": heat_grade,
                       "regime": regime, **market_data})


def get_heat_history(trader_id, limit=50):
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    rows = c.execute("SELECT date, heat_score, heat_grade, regime, nasdaq_chg, sox_chg, vix, fear_greed, usdkrw, macro_score FROM heat_history WHERE trader_id=? ORDER BY id DESC LIMIT ?", (trader_id, limit)).fetchall()
    conn.close()
    items = [{"date": r[0], "heat_score": r[1], "heat_grade": r[2], "regime": r[3], "nasdaq_chg": r[4], "sox_chg": r[5], "vix": r[6], "fear_greed": r[7], "usdkrw": r[8], "macro_score": r[9]} for r in rows]
    items.reverse()
    return items


def log_event(event_type, trader_id="A", stock=None, summary="", payload=None):
    """
    통합 이벤트 로그 기록 (dual-write).
    event_type: BUY / SELL / BLOCK / ANALYZE / HEAT_UPDATE / REGIME_CHANGE / ERROR / DAILY_SUMMARY 등
    payload: dict -- 그대로 JSON 직렬화하여 저장
    """
    conn = sqlite3.connect(DB_PATH)
    c    = conn.cursor()
    c.execute("""
        INSERT INTO event_log (date, trader_id, event_type, stock, summary, payload)
        VALUES (?,?,?,?,?,?)
    """, (
        now_kst().strftime("%Y-%m-%d %H:%M:%S"),
        trader_id, event_type, stock, summary,
        json.dumps(payload or {}, ensure_ascii=False, default=str)
    ))
    conn.commit()
    conn.close()


def get_events(trader_id=None, event_type=None, limit=50):
    """최근 이벤트 조회 -- PWA 최근 결정 블록, /intelligence 통합 페이지용."""
    conn = sqlite3.connect(DB_PATH)
    c    = conn.cursor()
    where = []
    params = []
    if trader_id:
        where.append("trader_id=?")
        params.append(trader_id)
    if event_type:
        where.append("event_type=?")
        params.append(event_type)
    where_clause = ("WHERE " + " AND ".join(where)) if where else ""
    c.execute(f"""
        SELECT date, trader_id, event_type, stock, summary, payload
        FROM event_log
        {where_clause}
        ORDER BY id DESC LIMIT ?
    """, params + [limit])
    rows = c.fetchall()
    conn.close()
    return [
        {"date": r[0], "trader_id": r[1], "event_type": r[2],
         "stock": r[3], "summary": r[4], "payload": json.loads(r[5]) if r[5] else {}}
        for r in rows
    ]


# ── [v8.3] PWA 승인대기 (pending_signals) ──────────────────────────
def sync_pending_to_db(code: str, p: dict, trader_id: str = "A") -> None:
    """main.py의 pending[code] 등록/갱신 시 DB에도 동기화 (PWA 조회용)."""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    now = now_kst_str()
    c.execute("""
        INSERT INTO pending_signals
        (code, trader_id, name, action, qty, price, reason,
         final_score, regime, ml_signal, target, stop_loss,
         status, created_at, updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?, 'pending', ?, ?)
        ON CONFLICT(code, trader_id) DO UPDATE SET
            name=excluded.name, action=excluded.action, qty=excluded.qty,
            price=excluded.price, reason=excluded.reason,
            final_score=excluded.final_score, regime=excluded.regime,
            ml_signal=excluded.ml_signal, target=excluded.target,
            stop_loss=excluded.stop_loss, updated_at=excluded.updated_at
    """, (
        code, trader_id, p.get("name", ""), p.get("action", "BUY"),
        p.get("qty", 0), p.get("price", 0), p.get("reason", ""),
        p.get("final_score", 0), p.get("regime", ""),
        p.get("ml_signal", "HOLD"), p.get("target", 0),
        p.get("stop_loss", 0), now, now
    ))
    conn.commit()
    conn.close()


def remove_pending_from_db(code: str, trader_id: str = "A", final_status: str = "done") -> None:
    """main.py의 pending에서 제거(매수완료/거절/만료) 시 DB 상태도 정리."""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("""
        UPDATE pending_signals SET status=?, updated_at=?
        WHERE code=? AND trader_id=? AND status NOT IN ('done','rejected')
    """, (final_status, now_kst_str(), code, trader_id))
    conn.commit()
    conn.close()


def get_pending_requests(trader_id: str = "A", statuses=None) -> list:
    """PWA에서 승인/거절 요청한 항목 조회 (main.py 폴링용)."""
    if statuses is None:
        statuses = ["approve_requested", "reject_requested"]
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    qmarks = ",".join(["?"] * len(statuses))
    c.execute(f"""
        SELECT * FROM pending_signals
        WHERE trader_id=? AND status IN ({qmarks})
    """, (trader_id, *statuses))
    rows = [dict(r) for r in c.fetchall()]
    conn.close()
    return rows


def mark_pending_status(code: str, trader_id: str, status: str) -> None:
    """status 갱신 (approved / rejected / done 등)."""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("""
        UPDATE pending_signals SET status=?, updated_at=?
        WHERE code=? AND trader_id=?
    """, (status, now_kst_str(), code, trader_id))
    conn.commit()
    conn.close()


def queue_pending(code: str, trader_id: str, scheduled_at: str) -> None:
    """장외 예약 승인: status=queued + 예약시각 기록. 09:00 queue_release가 릴리스."""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute(
        "UPDATE pending_signals SET status=?, queued_at=?, scheduled_at=?, updated_at=? "
        "WHERE code=? AND trader_id=?",
        ("queued", now_kst_str(), scheduled_at, now_kst_str(), code, trader_id))
    conn.commit()
    conn.close()


def get_pwa_pending_list(trader_id: str = "A") -> list:
    """PWA 승인대기 카드 목록 조회 (status='pending'만, 최신순)."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    c.execute("""
        SELECT * FROM pending_signals
        WHERE trader_id=? AND status IN ('pending','queued')
        ORDER BY created_at DESC
    """, (trader_id,))
    rows = [dict(r) for r in c.fetchall()]
    conn.close()
    return rows


def expire_all_pending(trader_id: str = "A") -> list:
    """자정 리셋(reset_daily_state) 시 남은 pending_signals 일괄 만료 처리.

    [S17-0 Part1] 만료 '조건'은 바꾸지 않는다 — 만료는 버그가 아니라 안전장치다
      (오래된 신호가 며칠 뒤 다른 가격에 체결되는 것을 막는다).
      문제는 만료된 사실을 아무도 몰랐다는 것 → 무엇을 만료시켰는지 반환·기록한다.
      기존 호출부는 반환값을 무시해도 동작이 동일하다.
    """
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    cond = "trader_id=? AND status NOT IN ('done','rejected','expired','queued')"
    victims = [dict(r) for r in c.execute(
        f"SELECT code, name, action, status, final_score FROM pending_signals WHERE {cond}",
        (trader_id,)).fetchall()]
    c.execute(f"UPDATE pending_signals SET status='expired', updated_at=? WHERE {cond}",
              (now_kst_str(), trader_id))
    conn.commit()
    conn.close()
    if victims:
        print(f"[S17-0] pending 만료 {len(victims)}건 (trader={trader_id}): "
              f"{[(v['code'], v['status']) for v in victims]}")
    return victims


# ── [v8.4] 런타임 상태 영속화 (app_state) ──────────────────────────
def set_app_state(trader_id: str, key: str, value) -> None:
    """AI모드 등 런타임 설정을 DB에 저장 (재시작 후 복원용). value는 자동으로 문자열화."""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("""
        INSERT INTO app_state (trader_id, key, value, updated_at)
        VALUES (?,?,?,?)
        ON CONFLICT(trader_id, key) DO UPDATE SET
            value=excluded.value, updated_at=excluded.updated_at
    """, (trader_id, key, json.dumps(value), now_kst_str()))
    conn.commit()
    conn.close()


def get_app_state(trader_id: str, key: str, default=None):
    """저장된 런타임 설정 조회. 없으면 default 반환."""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("SELECT value FROM app_state WHERE trader_id=? AND key=?", (trader_id, key))
    row = c.fetchone()
    conn.close()
    if row is None:
        return default
    try:
        return json.loads(row[0])
    except (TypeError, ValueError):
        return default
