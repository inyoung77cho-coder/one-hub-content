import sqlite3
conn = sqlite3.connect('/home/ubuntu/one-hub/auto_trade/trading.db')
rows = conn.execute("SELECT date, regime, final_value, daily_pnl, trade_count, block_count FROM daily_summary ORDER BY date ASC").fetchall()
for r in rows:
    print(r)