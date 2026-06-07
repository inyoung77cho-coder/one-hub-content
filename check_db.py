import sqlite3
conn = sqlite3.connect('/home/ubuntu/one-hub/auto_trade/trading.db')
tables = conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
print([t[0] for t in tables])
for t in tables:
    print(f"\n=== {t[0]} ===")
    cols = conn.execute(f"PRAGMA table_info({t[0]})").fetchall()
    print([c[1] for c in cols])