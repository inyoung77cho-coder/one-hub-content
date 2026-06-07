import sqlite3
conn = sqlite3.connect('/home/ubuntu/one-hub/auto_trade/trading.db')

print("=== ai_logs 최근 10건 ===")
rows = conn.execute("SELECT date, stock, action, global_risk, key_signal FROM ai_logs ORDER BY date DESC LIMIT 10").fetchall()
for r in rows:
    print(r)

print("\n=== trades 최근 10건 ===")
rows = conn.execute("SELECT date, stock, action, pnl, regime FROM trades ORDER BY date DESC LIMIT 10").fetchall()
for r in rows:
    print(r)