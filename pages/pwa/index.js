import Head from 'next/head';
import Link from 'next/link';
import { useState, useEffect } from 'react';

export default function PWADashboard() {
  const API = process.env.NEXT_PUBLIC_ENGINE_API_URL || "http://54.180.54.132:5001";
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
        else setError(d.error || '?곗씠?곕? 遺덈윭?????놁뒿?덈떎.');
      })
      .catch(e => setError(String(e)));
  }, [mounted, trader]);

  const regimeIcon = (regime) => {
    if (regime === 'BULL') return '?뱢';
    if (regime === 'BEAR') return '?뱣';
    return '??;
  };
  const regimeLabel = (regime) => {
    if (regime === 'BULL') return '?곸듅??;
    if (regime === 'BEAR') return '?섎씫??;
    return '?〓낫??;
  };
  const regimeClass = (regime) => {
    if (regime === 'BULL') return 'bull';
    if (regime === 'BEAR') return 'bear';
    return 'side';
  };

  const eventIcon = (type) => {
    switch (type) {
      case 'BUY': return '?윟';
      case 'SELL': return '?뵶';
      case 'BLOCK': return '?슟';
      case 'ANALYZE': return '?뵇';
      case 'HEAT_UPDATE': return '?뙜截?;
      case 'DAILY_SUMMARY': return '?뱥';
      default: return '??;
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
        <title>ONE-HUB ???ㅻ뒛????쒕낫??/title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Space+Mono:ital,wght@0,400;0,700;1,400&family=Syne:wght@400;600;700;800&display=swap" rel="stylesheet" />
      </Head>

      <div className="pwa-wrapper">
        <header className="pwa-header">
          <h1 className="pwa-title">?ㅻ뒛??ONE-HUB</h1>
          <div className="pwa-trader-toggle">
            <button className={trader === 'A' ? 'active' : ''} onClick={() => setTrader('A')}>A</button>
            <button className={trader === 'B' ? 'active' : ''} onClick={() => setTrader('B')}>B</button>
          </div>
        </header>

        {error && <div className="pwa-error">?좑툘 {error}</div>}
        {!data && !error && <div className="pwa-loading">遺덈윭?ㅻ뒗 以?..</div>}

        {data && (
          <main className="pwa-main">

            {/* 1. ?쒖옣 ?곹깭 */}
            <section className="pwa-card">
              <span className="pwa-card-label">?쒖옣 ?곹깭</span>
              <div className="pwa-market-row">
                <span className={`pwa-regime ${regimeClass(data.market?.regime)}`}>
                  {regimeIcon(data.market?.regime)} {regimeLabel(data.market?.regime)}
                </span>
                <span className="pwa-market-stat">李⑤떒 {data.market?.block_count ?? 0}嫄?/span>
                <span className="pwa-market-stat">?됯??먯씡 {data.balance?.unrealized_pnl?.toLocaleString() ?? '-'}</span>
              </div>
            </section>

            {/* 2. 蹂댁쑀 醫낅ぉ */}
            <section className="pwa-card">
              <span className="pwa-card-label">蹂댁쑀 醫낅ぉ</span>
              {positions.length === 0 ? (
                <div className="pwa-empty">蹂댁쑀 以묒씤 醫낅ぉ???놁뒿?덈떎.</div>
              ) : (
                <div className="pwa-positions">
                  {positions.map((p, i) => (
                    <div key={i} className="pwa-position-row">
                      <span className="pwa-pos-name">{p.name}</span>
                      <span className="pwa-pos-qty mono dim">{p.qty}二?/span>
                      <span className={`pwa-pos-pnl ${p.pnl_amount >= 0 ? 'pos' : 'neg'}`}>
                        {p.pnl_rate >= 0 ? '+' : ''}{p.pnl_rate}%
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <div className="pwa-balance-summary mono dim">
                珥앹옄??{data.balance?.total_asset?.toLocaleString() ?? '-'} 쨌 ?꾧툑 {data.balance?.cash?.toLocaleString() ?? '-'}
              </div>
            </section>

            {/* 3. ?ㅻ뒛 ?≪뀡 */}
            <section className="pwa-card">
              <span className="pwa-card-label">?ㅻ뒛 ?≪뀡</span>
              {(!data.today_buys || data.today_buys.length === 0) ? (
                <div className="pwa-empty">?ㅻ뒛 ?좉퇋 留ㅼ닔媛 ?놁뒿?덈떎.</div>
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

            {/* 4. AI 洹쇨굅 ???ㅻ뒛??李⑤떒 */}
            <section className="pwa-card">
              <span className="pwa-card-label">AI 洹쇨굅 ???ㅻ뒛??李⑤떒</span>
              {(!data.today_blocked || data.today_blocked.length === 0) ? (
                <div className="pwa-empty">?ㅻ뒛 李⑤떒???좏샇媛 ?놁뒿?덈떎.</div>
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

            {/* 5. 理쒓렐 寃곗젙 */}
            <section className="pwa-card">
              <span className="pwa-card-label">理쒓렐 寃곗젙</span>
              {(!data.recent_decisions || data.recent_decisions.length === 0) ? (
                <div className="pwa-empty">?꾩쭅 湲곕줉??寃곗젙???놁뒿?덈떎. ?곗씠?곌? ?꾩쟻?섎㈃ ?ш린???쒖떆?⑸땲??</div>
              ) : (
                <div className="pwa-timeline">
                  {data.recent_decisions.map((e, i) => (
                    <div key={i} className="pwa-timeline-row">
                      <span className="pwa-tl-icon">{eventIcon(e.event_type)}</span>
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
          <Link href="/" className="mono dim">??ONE-HUB ?덉쑝濡?/Link>
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
        .pwa-tl-icon { font-size: 1rem; }
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