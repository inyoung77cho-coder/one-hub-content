import Head from 'next/head';
import Link from 'next/link';
import { useState, useEffect, useCallback } from 'react';

export default function PWADashboard() {
  const [tab, setTab] = useState('dashboard');
  const [data, setData] = useState(null);
  const [trader, setTrader] = useState('A');
  const [error, setError] = useState(null);
  const [mounted, setMounted] = useState(false);

  // Analyze tab state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeResult, setAnalyzeResult] = useState(null);
  const [analyzeError, setAnalyzeError] = useState(null);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!mounted) return;
    fetch(`/api/pwa-dashboard?trader=${trader}`)
      .then(r => r.json())
      .then(d => { if (d.ok) setData(d); else setError(d.error || 'failed'); })
      .catch(e => setError(String(e)));
  }, [mounted, trader]);

  const searchStocks = useCallback(async (q) => {
    if (!q || q.length < 1) { setSearchResults([]); return; }
    try {
      const res = await fetch(`/api/stocks-search?q=${encodeURIComponent(q)}`);
      const d = await res.json();
      if (d.ok) setSearchResults(d.results || []);
    } catch(e) { console.error(e); }
  }, []);

  const runAnalyze = useCallback(async (code, name) => {
    setAnalyzing(true);
    setAnalyzeResult(null);
    setAnalyzeError(null);
    setSearchResults([]);
    setSearchQuery(name);
    try {
      const res = await fetch(`/api/analyze-stock?code=${code}`);
      const d = await res.json();
      if (d.ok) setAnalyzeResult(d);
      else setAnalyzeError(d.error || '분석 실패');
    } catch(e) { setAnalyzeError(String(e)); }
    finally { setAnalyzing(false); }
  }, []);

  const regimeClass = (r) => r === 'BULL' ? 'bull' : r === 'BEAR' ? 'bear' : 'side';
  const regimeLabel = (r) => r === 'BULL' ? 'UP' : r === 'BEAR' ? 'DOWN' : 'SIDE';
  const actionColor = (a) => a === 'BUY' ? '#00FF85' : a === 'SELL' ? '#FF4444' : '#888';
  const eventLabel = (t) => ({ BUY:'BUY', SELL:'SELL', BLOCK:'BLOCK', ANALYZE:'AI', HEAT_UPDATE:'HEAT', DAILY_SUMMARY:'SUM' }[t] || '-');

  let positions = [];
  if (data?.balance?.positions) {
    try { positions = JSON.parse(data.balance.positions); } catch(e) {}
  }

  return (
    <>
      <Head>
        <title>ONE-HUB Dashboard</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Syne:wght@400;700;800&display=swap" rel="stylesheet" />
      </Head>
      <div className="pwa-wrapper">
        <header className="pwa-header">
          <h1 className="pwa-title">ONE-HUB</h1>
          <div className="pwa-trader-toggle">
            <button className={trader==='A'?'active':''} onClick={()=>setTrader('A')}>A</button>
            <button className={trader==='B'?'active':''} onClick={()=>setTrader('B')}>B</button>
          </div>
        </header>

        <nav className="pwa-tabs">
          {['dashboard','analyze','portfolio','report'].map(t => (
            <button key={t} className={`pwa-tab ${tab===t?'active':''}`} onClick={()=>setTab(t)}>
              {t==='dashboard'?'Home':t==='analyze'?'Analyze':t==='portfolio'?'Portfolio':'Report'}
            </button>
          ))}
        </nav>

        {error && <div className="pwa-error">Error: {error}</div>}

        {/* ── Dashboard Tab ── */}
        {tab === 'dashboard' && (
          <main className="pwa-main">
            {!data && !error && <div className="pwa-loading">Loading...</div>}
            {data && (<>
              <section className="pwa-card">
                <span className="pwa-card-label">Market Status</span>
                <div className="pwa-market-row">
                  <span className={`pwa-regime ${regimeClass(data.market?.regime)}`}>{regimeLabel(data.market?.regime)}</span>
                  <span className="pwa-market-stat">Blocked {data.market?.block_count ?? 0}</span>
                  <span className="pwa-market-stat">PnL {data.balance?.unrealized_pnl?.toLocaleString() ?? '-'}</span>
                </div>
              </section>
              <section className="pwa-card">
                <span className="pwa-card-label">Today Actions</span>
                {(!data.today_buys || data.today_buys.length === 0)
                  ? <div className="pwa-empty">No new buys today.</div>
                  : <div className="pwa-action-list">{data.today_buys.map((b,i) => (
                      <div key={i} className="pwa-action-row">
                        <span className="pwa-action-stock">{b.stock}</span>
                        <span className="pwa-action-score mono dim">score {b.score}</span>
                        <span className="pwa-action-reason">{b.reason}</span>
                      </div>))}
                    </div>}
              </section>
              <section className="pwa-card">
                <span className="pwa-card-label">Recent Decisions</span>
                {(!data.recent_decisions || data.recent_decisions.length === 0)
                  ? <div className="pwa-empty">No recorded decisions yet.</div>
                  : <div className="pwa-timeline">{data.recent_decisions.map((e,i) => (
                      <div key={i} className="pwa-timeline-row">
                        <span className="pwa-tl-icon mono">{eventLabel(e.event_type)}</span>
                        <span className="pwa-tl-time mono dim">{e.date?.slice(5,16)}</span>
                        <span className="pwa-tl-summary">{e.summary}</span>
                      </div>))}
                    </div>}
              </section>
            </>)}
          </main>
        )}

        {/* ── Analyze Tab ── */}
        {tab === 'analyze' && (
          <main className="pwa-main">
            <section className="pwa-card">
              <span className="pwa-card-label">종목 AI 분석</span>
              <div className="pwa-search-wrap">
                <input
                  className="pwa-search-input"
                  placeholder="종목명 입력 (예: 삼성전자)"
                  value={searchQuery}
                  onChange={e => { setSearchQuery(e.target.value); searchStocks(e.target.value); }}
                />
              </div>
              {searchResults.length > 0 && (
                <div className="pwa-search-results">
                  {searchResults.map((s,i) => (
                    <button key={i} className="pwa-search-item" onClick={() => runAnalyze(s.code, s.name)}>
                      <span className="pwa-si-name">{s.name}</span>
                      <span className="pwa-si-code mono dim">{s.code}</span>
                      <span className="pwa-si-theme dim">{s.theme}</span>
                    </button>
                  ))}
                </div>
              )}
            </section>

            {analyzing && (
              <section className="pwa-card pwa-analyzing">
                <div className="pwa-spinner" />
                <span className="dim">AI 분석 중... (10~20초)</span>
              </section>
            )}

            {analyzeError && (
              <section className="pwa-card">
                <div className="pwa-error">분석 실패: {analyzeError}</div>
              </section>
            )}

            {analyzeResult && !analyzing && (
              <>
                <section className="pwa-card">
                  <span className="pwa-card-label">{analyzeResult.name} ({analyzeResult.code})</span>
                  <div className="pwa-analyze-header">
                    <span className="pwa-analyze-action" style={{color: actionColor(analyzeResult.action)}}>
                      {analyzeResult.action === 'BUY' ? '🟢 매수' : analyzeResult.action === 'SELL' ? '🔴 매도' : '⚪ 관망'}
                    </span>
                    <span className="pwa-analyze-conf mono dim">{analyzeResult.confidence}</span>
                  </div>
                  <div className="pwa-price-grid">
                    <div className="pwa-price-item">
                      <span className="dim">현재가</span>
                      <span className="mono">{analyzeResult.current_price?.toLocaleString()}원</span>
                    </div>
                    <div className="pwa-price-item">
                      <span className="dim">목표가</span>
                      <span className="mono bull">{analyzeResult.target?.toLocaleString()}원</span>
                    </div>
                    <div className="pwa-price-item">
                      <span className="dim">손절가</span>
                      <span className="mono bear">{analyzeResult.stop_loss?.toLocaleString()}원</span>
                    </div>
                    <div className="pwa-price-item">
                      <span className="dim">RSI</span>
                      <span className="mono">{analyzeResult.rsi?.toFixed(1)}</span>
                    </div>
                  </div>
                </section>

                {analyzeResult.key_signal && (
                  <section className="pwa-card">
                    <span className="pwa-card-label">🔑 핵심신호</span>
                    <p className="pwa-analyze-text">{analyzeResult.key_signal}</p>
                  </section>
                )}
                {analyzeResult.technical_summary && (
                  <section className="pwa-card">
                    <span className="pwa-card-label">📈 기술적 분석</span>
                    <p className="pwa-analyze-text">{analyzeResult.technical_summary}</p>
                  </section>
                )}
                {analyzeResult.macro_alignment && (
                  <section className="pwa-card">
                    <span className="pwa-card-label">🌐 매크로</span>
                    <p className="pwa-analyze-text">{analyzeResult.macro_alignment}</p>
                  </section>
                )}
                {analyzeResult.verdict && (
                  <section className="pwa-card pwa-verdict">
                    <span className="pwa-card-label">✅ 결론</span>
                    <p className="pwa-analyze-text">{analyzeResult.verdict}</p>
                  </section>
                )}
                {analyzeResult.caution && (
                  <section className="pwa-card pwa-caution">
                    <span className="pwa-card-label">⚠️ 주의</span>
                    <p className="pwa-analyze-text">{analyzeResult.caution}</p>
                  </section>
                )}
              </>
            )}
          </main>
        )}

        {/* ── Portfolio Tab ── */}
        {tab === 'portfolio' && (
          <main className="pwa-main">
            {!data && !error && <div className="pwa-loading">Loading...</div>}
            {data && (<>
              <section className="pwa-card">
                <span className="pwa-card-label">계좌 현황</span>
                <div className="pwa-balance-grid">
                  <div className="pwa-bal-item">
                    <span className="dim">총 자산</span>
                    <span className="mono">{data.balance?.total_asset?.toLocaleString() ?? '-'}원</span>
                  </div>
                  <div className="pwa-bal-item">
                    <span className="dim">예수금</span>
                    <span className="mono">{data.balance?.cash?.toLocaleString() ?? '-'}원</span>
                  </div>
                  <div className="pwa-bal-item">
                    <span className="dim">실현손익</span>
                    <span className={`mono ${(data.balance?.realized_pnl??0)>=0?'bull':'bear'}`}>
                      {data.balance?.realized_pnl?.toLocaleString() ?? '-'}원
                    </span>
                  </div>
                  <div className="pwa-bal-item">
                    <span className="dim">평가손익</span>
                    <span className={`mono ${(data.balance?.unrealized_pnl??0)>=0?'bull':'bear'}`}>
                      {data.balance?.unrealized_pnl?.toLocaleString() ?? '-'}원
                    </span>
                  </div>
                </div>
              </section>
              <section className="pwa-card">
                <span className="pwa-card-label">보유 종목</span>
                {positions.length === 0
                  ? <div className="pwa-empty">보유 종목 없음</div>
                  : <div className="pwa-positions">{positions.map((p,i) => (
                      <div key={i} className="pwa-position-row">
                        <span className="pwa-pos-name">{p.name}</span>
                        <span className="pwa-pos-qty mono dim">{p.qty}주</span>
                        <span className={`pwa-pos-pnl ${p.pnl_amount>=0?'bull':'bear'}`}>
                          {p.pnl_rate>=0?'+':''}{p.pnl_rate}%
                        </span>
                      </div>))}
                    </div>}
              </section>
              <section className="pwa-card">
                <span className="pwa-card-label">AI Reasoning - Blocked</span>
                {(!data.today_blocked || data.today_blocked.length===0)
                  ? <div className="pwa-empty">차단 종목 없음</div>
                  : <div className="pwa-blocked-list">{data.today_blocked.slice(0,5).map((b,i) => (
                      <div key={i} className="pwa-blocked-row">
                        <span className="pwa-blocked-stock">{b.stock}</span>
                        <span className="pwa-blocked-signal mono dim">{b.signal}</span>
                        <span className="pwa-blocked-reason">{b.reason}</span>
                      </div>))}
                    </div>}
              </section>
            </>)}
          </main>
        )}

        {/* ── Report Tab ── */}
        {tab === 'report' && (
          <main className="pwa-main">
            <section className="pwa-card">
              <span className="pwa-card-label">Daily / Weekly Report</span>
              <div className="pwa-report-links">
                <Link href="/daily" className="pwa-report-btn">📅 Daily Reports</Link>
                <Link href="/weekly" className="pwa-report-btn">📊 Weekly Reports</Link>
                <Link href="/history" className="pwa-report-btn">🤖 AI History</Link>
                <Link href="/heat-history" className="pwa-report-btn">🌡 Heat History</Link>
              </div>
            </section>
            {data && (
              <section className="pwa-card">
                <span className="pwa-card-label">오늘 요약</span>
                <div className="pwa-report-summary">
                  <div className="pwa-rs-row"><span className="dim">Regime</span><span className={`mono ${regimeClass(data.market?.regime)}`}>{data.market?.regime}</span></div>
                  <div className="pwa-rs-row"><span className="dim">Heat</span><span className="mono">{data.market?.heat_score ?? '-'}/100</span></div>
                  <div className="pwa-rs-row"><span className="dim">Blocked</span><span className="mono">{data.market?.block_count ?? 0}건</span></div>
                  <div className="pwa-rs-row"><span className="dim">실현손익</span><span className={`mono ${(data.balance?.realized_pnl??0)>=0?'bull':'bear'}`}>{data.balance?.realized_pnl?.toLocaleString() ?? 0}원</span></div>
                </div>
              </section>
            )}
          </main>
        )}

        <footer className="pwa-footer">
          <Link href="/" className="mono dim">← Back to ONE-HUB</Link>
        </footer>
      </div>

      <style jsx>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .pwa-wrapper { min-height: 100vh; background: #0B0E14; color: #E8E6E3; font-family: 'Space Mono', monospace; padding-bottom: 40px; }
        .pwa-header { display: flex; justify-content: space-between; align-items: center; padding: 18px 20px 10px; border-bottom: 1px solid #1E2330; }
        .pwa-title { font-family: 'Syne', sans-serif; font-size: 1.2rem; font-weight: 800; color: #00FF85; letter-spacing: 0.08em; }
        .pwa-trader-toggle { display: flex; gap: 6px; }
        .pwa-trader-toggle button { background: #1A1F2E; border: 1px solid #2A3040; color: #888; padding: 4px 12px; border-radius: 4px; cursor: pointer; font-family: 'Space Mono', monospace; font-size: 0.75rem; }
        .pwa-trader-toggle button.active { background: #00FF85; color: #0B0E14; border-color: #00FF85; font-weight: 700; }
        .pwa-tabs { display: flex; border-bottom: 1px solid #1E2330; }
        .pwa-tab { flex: 1; padding: 10px 4px; background: none; border: none; color: #555; cursor: pointer; font-family: 'Space Mono', monospace; font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 2px solid transparent; transition: all 0.15s; }
        .pwa-tab.active { color: #00FF85; border-bottom-color: #00FF85; }
        .pwa-main { padding: 12px 16px; display: flex; flex-direction: column; gap: 12px; }
        .pwa-card { background: #12161F; border: 1px solid #1E2330; border-radius: 8px; padding: 14px; }
        .pwa-card-label { display: block; font-size: 0.6rem; letter-spacing: 0.12em; color: #00FF85; text-transform: uppercase; margin-bottom: 10px; }
        .pwa-market-row { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
        .pwa-regime { font-family: 'Syne', sans-serif; font-size: 1.4rem; font-weight: 800; }
        .pwa-regime.bull { color: #00FF85; }
        .pwa-regime.bear { color: #FF4444; }
        .pwa-regime.side { color: #FFAA00; }
        .bull { color: #00FF85; }
        .bear { color: #FF4444; }
        .side { color: #FFAA00; }
        .pwa-market-stat { font-size: 0.75rem; color: #888; }
        .pwa-search-wrap { margin-bottom: 8px; }
        .pwa-search-input { width: 100%; background: #0B0E14; border: 1px solid #2A3040; border-radius: 6px; padding: 10px 12px; color: #E8E6E3; font-family: 'Space Mono', monospace; font-size: 0.8rem; outline: none; }
        .pwa-search-input:focus { border-color: #00FF85; }
        .pwa-search-results { display: flex; flex-direction: column; gap: 4px; margin-top: 6px; }
        .pwa-search-item { background: #0B0E14; border: 1px solid #2A3040; border-radius: 6px; padding: 8px 12px; cursor: pointer; display: flex; align-items: center; gap: 10px; text-align: left; }
        .pwa-search-item:hover { border-color: #00FF85; }
        .pwa-si-name { color: #E8E6E3; font-size: 0.8rem; flex: 1; }
        .pwa-si-code { font-size: 0.7rem; }
        .pwa-si-theme { font-size: 0.65rem; }
        .pwa-analyzing { display: flex; align-items: center; gap: 12px; justify-content: center; padding: 24px; }
        .pwa-spinner { width: 20px; height: 20px; border: 2px solid #1E2330; border-top-color: #00FF85; border-radius: 50%; animation: spin 0.8s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .pwa-analyze-header { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }
        .pwa-analyze-action { font-family: 'Syne', sans-serif; font-size: 1.2rem; font-weight: 700; }
        .pwa-analyze-conf { font-size: 0.7rem; }
        .pwa-price-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .pwa-price-item { display: flex; flex-direction: column; gap: 3px; }
        .pwa-price-item span:first-child { font-size: 0.6rem; text-transform: uppercase; letter-spacing: 0.08em; }
        .pwa-price-item span:last-child { font-size: 0.85rem; }
        .pwa-analyze-text { font-size: 0.75rem; line-height: 1.6; color: #C8C6C3; }
        .pwa-verdict { border-color: #00FF8533; }
        .pwa-caution { border-color: #FFAA0033; }
        .pwa-balance-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .pwa-bal-item { display: flex; flex-direction: column; gap: 3px; }
        .pwa-bal-item span:first-child { font-size: 0.6rem; text-transform: uppercase; letter-spacing: 0.08em; color: #888; }
        .pwa-bal-item span:last-child { font-size: 0.8rem; }
        .pwa-positions { display: flex; flex-direction: column; gap: 8px; }
        .pwa-position-row { display: flex; align-items: center; gap: 10px; }
        .pwa-pos-name { flex: 1; font-size: 0.8rem; }
        .pwa-pos-qty { font-size: 0.7rem; }
        .pwa-pos-pnl { font-size: 0.8rem; font-weight: 700; }
        .pwa-action-list, .pwa-blocked-list { display: flex; flex-direction: column; gap: 8px; }
        .pwa-action-row, .pwa-blocked-row { display: flex; flex-direction: column; gap: 2px; padding-bottom: 8px; border-bottom: 1px solid #1E2330; }
        .pwa-action-row:last-child, .pwa-blocked-row:last-child { border-bottom: none; }
        .pwa-action-stock, .pwa-blocked-stock { font-size: 0.8rem; color: #E8E6E3; }
        .pwa-action-score, .pwa-blocked-signal { font-size: 0.65rem; }
        .pwa-action-reason, .pwa-blocked-reason { font-size: 0.7rem; color: #888; }
        .pwa-timeline { display: flex; flex-direction: column; gap: 8px; }
        .pwa-timeline-row { display: flex; align-items: flex-start; gap: 8px; }
        .pwa-tl-icon { font-size: 0.6rem; background: #1E2330; padding: 2px 5px; border-radius: 3px; white-space: nowrap; }
        .pwa-tl-time { font-size: 0.65rem; white-space: nowrap; }
        .pwa-tl-summary { font-size: 0.7rem; color: #888; }
        .pwa-report-links { display: flex; flex-direction: column; gap: 8px; }
        .pwa-report-btn { display: block; padding: 12px; background: #0B0E14; border: 1px solid #2A3040; border-radius: 6px; color: #E8E6E3; text-decoration: none; font-size: 0.8rem; transition: border-color 0.15s; }
        .pwa-report-btn:hover { border-color: #00FF85; color: #00FF85; }
        .pwa-report-summary { display: flex; flex-direction: column; gap: 8px; }
        .pwa-rs-row { display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-bottom: 1px solid #1E2330; }
        .pwa-rs-row:last-child { border-bottom: none; }
        .pwa-rs-row span:first-child { font-size: 0.7rem; }
        .pwa-rs-row span:last-child { font-size: 0.8rem; }
        .pwa-balance-summary { font-size: 0.65rem; margin-top: 8px; }
        .pwa-empty { font-size: 0.75rem; color: #555; padding: 8px 0; }
        .pwa-loading { text-align: center; padding: 40px; font-size: 0.8rem; color: #555; }
        .pwa-error { color: #FF4444; font-size: 0.75rem; padding: 12px 16px; }
        .pwa-footer { padding: 20px; text-align: center; }
        .mono { font-family: 'Space Mono', monospace; }
        .dim { color: #555; }
      `}</style>
    </>
  );
}