import Head from 'next/head';
import Link from 'next/link';
import { useState, useEffect } from 'react';

export default function PWADashboard() {
  const [data, setData] = useState(null);
  const [trader, setTrader] = useState('A');
  const [error, setError] = useState(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    fetch(`/api/pwa-dashboard?trader=${trader}`)
      .then(r => r.json())
      .then(d => {
        if (d.ok) setData(d);
        else setError(d.error || 'failed to load');
      })
      .catch(e => setError(String(e)));
  }, [mounted, trader]);

  const regimeLabel = (regime) => {
    if (regime === 'BULL') return 'UP';
    if (regime === 'BEAR') return 'DOWN';
    return 'SIDE';
  };
  const regimeClass = (regime) => {
    if (regime === 'BULL') return 'bull';
    if (regime === 'BEAR') return 'bear';
    return 'side';
  };

  const eventLabel = (type) => {
    switch (type) {
      case 'BUY': return 'BUY';
      case 'SELL': return 'SELL';
      case 'BLOCK': return 'BLOCK';
      case 'ANALYZE': return 'AI';
      case 'HEAT_UPDATE': return 'HEAT';
      case 'DAILY_SUMMARY': return 'SUMMARY';
      default: return '-';
    }
  };

  let positions = [];
  if (data?.balance?.positions) {
    try {
      positions = JSON.parse(data.balance.positions);
    } catch (e) {
      positions = [];
    }
  }

  return (
    <>
      <Head>
        <title>ONE-HUB Dashboard</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Space+Mono:ital,wght@0,400;0,700;1,400&family=Syne:wght@400;600;700;800&display=swap" rel="stylesheet" />
      </Head>

      <div className="pwa-wrapper">
        <header className="pwa-header">
          <h1 className="pwa-title">Today ONE-HUB</h1>
          <div className="pwa-trader-toggle">
            <button className={trader === 'A' ? 'active' : ''} onClick={() => setTrader('A')}>A</button>
            <button className={trader === 'B' ? 'active' : ''} onClick={() => setTrader('B')}>B</button>
          </div>
        </header>

        {error && <div className="pwa-error">Error: {error}</div>}
        {!data && !error && <div className="pwa-loading">Loading...</div>}

        {data && (
          <main className="pwa-main">

            <section className="pwa-card">
              <span className="pwa-card-label">Market Status</span>
              <div className="pwa-market-row">
                <span className={`pwa-regime ${regimeClass(data.market?.regime)}`}>
                  {regimeLabel(data.market?.regime)}
                </span>
                <span className="pwa-market-stat">Blocked {data.market?.block_count ?? 0}</span>
                <span className="pwa-market-stat">Unrealized {data.balance?.unrealized_pnl?.toLocaleString() ?? '-'}</span>
              </div>
            </section>

            <section className="pwa-card">
              <span className="pwa-card-label">Positions</span>
              {positions.length === 0 ? (
                <div className="pwa-empty">No positions.</div>
              ) : (
                <div className="pwa-positions">
                  {positions.map((p, i) => (
                    <div key={i} className="pwa-position-row">
                      <span className="pwa-pos-name">{p.name}</span>
                      <span className="pwa-pos-qty mono dim">{p.qty} sh</span>
                      <span className={`pwa-pos-pnl ${p.pnl_amount >= 0 ? 'pos' : 'neg'}`}>
                        {p.pnl_rate >= 0 ? '+' : ''}{p.pnl_rate}%
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <div className="pwa-balance-summary mono dim">
                Total {data.balance?.total_asset?.toLocaleString() ?? '-'} / Cash {data.balance?.cash?.toLocaleString() ?? '-'}
              </div>
            </section>

            <section className="pwa-card">
              <span className="pwa-card-label">Today Actions</span>
              {(!data.today_buys || data.today_buys.length === 0) ? (
                <div className="pwa-empty">No new buys today.</div>
              ) : (
                <div className="pwa-action-list">
                  {data.today_buys.map((b, i) => (
                    <div key={i} className="pwa-action-row">
                      <span className="pwa-action-stock">{b.stock}</span>
                      <span className="pwa-action-score mono dim">score {b.score}</span>
                      <span className="pwa-action-reason">{b.reason}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="pwa-card">
              <span className="pwa-card-label">AI Reasoning - Blocked Today</span>
              {(!data.today_blocked || data.today_blocked.length === 0) ? (
                <div className="pwa-empty">No blocked signals today.</div>
              ) : (
                <div className="pwa-blocked-list">
                  {data.today_blocked.slice(0, 5).map((b, i) => (
                    <div key={i} className="pwa-blocked-row">
                      <span className="pwa-blocked-stock">{b.stock}</span>
                      <span className="pwa-blocked-signal mono dim">{b.signal}</span>
                      <span className="pwa-blocked-reason">{b.reason}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="pwa-card">
              <span className="pwa-card-label">Recent Decisions</span>
              {(!data.recent_decisions || data.recent_decisions.length === 0) ? (
                <div className="pwa-empty">No recorded decisions yet. Will populate as data accumulates.</div>
              ) : (
                <div className="pwa-timeline">
                  {data.recent_decisions.map((e, i) => (
                    <div key={i} className="pwa-timeline-row">
                      <span className="pwa-tl-icon mono">{eventLabel(e.event_type)}</span>
                      <span className="pwa-tl-time mono dim">{e.date?.slice(5, 16)}</span>
                      <span className="pwa-tl-summary">{e.summary}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>

          </main>
        )}

        <footer className="pwa-footer">
          <Link href="/" className="mono dim">{'<- Back to ONE-HUB'}</Link>
        </footer>
      </div>

      <style jsx>{`
        .pwa-wrapper {
          min-height: 100vh;
          background: #0B0E14;
          color: #E8E6E3;
          font-family: 'Space Mono', monospace;
          padding: 1rem;
          max-width: 480px;
          margin: 0 auto;
        }
        .pwa-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1rem;
        }
        .pwa-title {
          font-family: 'Syne', sans-serif;
          font-size: 1.4rem;
          font-weight: 800;
          margin: 0;
        }
        .pwa-trader-toggle button {
          background: transparent;
          border: 1px solid #333;
          color: #8A7E6A;
          padding: 0.3rem 0.8rem;
          font-family: 'Space Mono', monospace;
          cursor: pointer;
          border-radius: 4px;
          margin-left: 0.3rem;
        }
        .pwa-trader-toggle button.active {
          background: #E8E6E3;
          color: #0B0E14;
          border-color: #E8E6E3;
        }
        .pwa-loading, .pwa-error {
          text-align: center;
          padding: 2rem;
          color: #8A7E6A;
        }
        .pwa-error { color: #E05A4F; }
        .pwa-main {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }
        .pwa-card {
          background: #14181F;
          border: 1px solid #232830;
          border-radius: 10px;
          padding: 0.9rem 1rem;
        }
        .pwa-card-label {
          display: block;
          font-family: 'Syne', sans-serif;
          font-weight: 700;
          font-size: 0.85rem;
          color: #8A7E6A;
          margin-bottom: 0.6rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .pwa-market-row {
          display: flex;
          align-items: center;
          gap: 0.8rem;
          flex-wrap: wrap;
        }
        .pwa-regime {
          font-family: 'Syne', sans-serif;
          font-weight: 700;
          padding: 0.2rem 0.6rem;
          border-radius: 6px;
          font-size: 0.9rem;
        }
        .pwa-regime.bull { color: #4ADE80; background: rgba(74,222,128,0.1); }
        .pwa-regime.bear { color: #E05A4F; background: rgba(224,90,79,0.1); }
        .pwa-regime.side { color: #8A7E6A; background: rgba(138,126,106,0.1); }
        .pwa-market-stat {
          font-size: 0.85rem;
          color: #B5AFA3;
        }
        .pwa-empty {
          color: #5C564C;
          font-size: 0.85rem;
          padding: 0.5rem 0;
        }
        .pwa-positions, .pwa-action-list, .pwa-blocked-list, .pwa-timeline {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        .pwa-position-row, .pwa-action-row, .pwa-blocked-row, .pwa-timeline-row {
          display: flex;
          align-items: center;
          gap: 0.6rem;
          font-size: 0.85rem;
          padding: 0.3rem 0;
          border-bottom: 1px solid #1C2026;
        }
        .pwa-position-row:last-child, .pwa-action-row:last-child,
        .pwa-blocked-row:last-child, .pwa-timeline-row:last-child {
          border-bottom: none;
        }
        .pwa-pos-name, .pwa-action-stock, .pwa-blocked-stock {
          font-weight: 700;
          min-width: 5.5rem;
        }
        .pwa-pos-pnl.pos { color: #4ADE80; }
        .pwa-pos-pnl.neg { color: #E05A4F; }
        .pwa-action-reason, .pwa-blocked-reason, .pwa-tl-summary {
          color: #B5AFA3;
          flex: 1;
          font-size: 0.8rem;
        }
        .pwa-balance-summary {
          margin-top: 0.6rem;
          font-size: 0.75rem;
          border-top: 1px solid #1C2026;
          padding-top: 0.5rem;
        }
        .pwa-tl-icon {
          font-size: 0.7rem;
          min-width: 4rem;
          color: #B5AFA3;
        }
        .pwa-tl-time { font-size: 0.75rem; min-width: 4.5rem; }
        .pwa-footer {
          margin-top: 1.5rem;
          text-align: center;
          font-size: 0.8rem;
        }
        .mono { font-family: 'Space Mono', monospace; }
        .dim { color: #8A7E6A; }
      `}</style>
    </>
  );
}