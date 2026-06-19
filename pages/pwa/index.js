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

  // [v8.3] 승인대기 (Mission Menu) state
  const [activePanel, setActivePanel] = useState(null); // null | 'market' | 'ai' | 'pending' | 'watchlist' | 'holdings' | 'trades'
  const [pendingList, setPendingList] = useState([]);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [pendingError, setPendingError] = useState(null);
  const [actingCode, setActingCode] = useState(null); // 승인/거절 처리 중인 종목코드

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!mounted) return;
    fetch(`/api/pwa-dashboard?trader=${trader}`)
      .then(r => r.json())
      .then(d => { if (d.ok) setData(d); else setError(d.error || 'failed'); })
      .catch(e => setError(String(e)));
  }, [mounted, trader]);

  const loadPending = useCallback(async () => {
    setPendingLoading(true);
    setPendingError(null);
    try {
      const res = await fetch(`/api/pwa-pending?trader=${trader}`);
      const d = await res.json();
      if (d.ok) setPendingList(d.items || []);
      else setPendingError(d.error || '조회 실패');
    } catch (e) { setPendingError(String(e)); }
    finally { setPendingLoading(false); }
  }, [trader]);

  useEffect(() => {
    if (!mounted) return;
    if (activePanel === 'pending') loadPending();
  }, [mounted, activePanel, loadPending]);

  const actOnPending = useCallback(async (code, action) => {
    setActingCode(code);
    try {
      const res = await fetch(`/api/${action}-pending`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, trader }),
      });
      const d = await res.json();
      if (d.ok) {
        // 낙관적 업데이트: 처리된 항목 즉시 목록에서 제거
        setPendingList(prev => prev.filter(p => p.code !== code));
      } else {
        setPendingError(d.error || '처리 실패');
      }
    } catch (e) { setPendingError(String(e)); }
    finally { setActingCode(null); }
  }, [trader]);

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
  const regimeLabel = (r) => r === 'BULL' ? '📈 BULL' : r === 'BEAR' ? '📉 BEAR' : '➡️ SIDE';
  const regimeSub = (r) => r === 'BULL' ? '상승장 — 적극 매수' : r === 'BEAR' ? '하락장 — 헤지/방어 스캔' : '횡보장 — 선별 접근';
  const actionColor = (a) => a === 'BUY' ? '#00FF85' : a === 'SELL' ? '#FF4444' : '#888';
  const eventLabel = (t) => ({ BUY:'BUY', SELL:'SELL', BLOCK:'BLOCK', ANALYZE:'AI', HEAT_UPDATE:'HEAT', DAILY_SUMMARY:'SUM' }[t] || '-');
  const heatColor = (h) => h >= 70 ? '#00FF85' : h >= 40 ? '#FFAA00' : '#FF4444';
  const heatLabel = (h) => h >= 70 ? 'HOT' : h >= 40 ? 'WARM' : 'COLD';

  let positions = [];
  if (data?.balance?.positions) {
    try { positions = JSON.parse(data.balance.positions); } catch(e) {}
  }

  // Mission stats 계산
  const buyCount = data?.today_buys?.length ?? 0;
  const blockCount = data?.market?.block_count ?? 0;
  const watchCount = data?.recent_decisions?.filter(e => e.event_type === 'ANALYZE').length ?? 0;
  const heat = data?.market?.heat_score ?? null;
  const regime = data?.market?.regime ?? null;

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
              {t==='dashboard'?'Today':t==='analyze'?'Analyze':t==='portfolio'?'Portfolio':'Report'}
            </button>
          ))}
        </nav>

        {error && <div className="pwa-error">Error: {error}</div>}

        {/* ── Dashboard Tab — Mission View ── */}
        {tab === 'dashboard' && (
          <main className="pwa-main">
            {!data && !error && (
              <div className="pwa-loading">
                <div className="pwa-spinner" />
                <span>데이터 로딩 중...</span>
              </div>
            )}
            {data && (<>

              {/* Regime 헤더 카드 */}
              <section className={`pwa-card regime-card regime-${regimeClass(regime)}`}>
                <div className="regime-main">
                  <span className={`regime-badge ${regimeClass(regime)}`}>{regimeLabel(regime)}</span>
                  <span className="regime-sub">{regimeSub(regime)}</span>
                </div>
                {heat !== null && (
                  <div className="heat-pill" style={{borderColor: heatColor(heat)}}>
                    <span className="heat-label" style={{color: heatColor(heat)}}>HEAT</span>
                    <span className="heat-val" style={{color: heatColor(heat)}}>{heat}</span>
                    <span className="heat-tag" style={{color: heatColor(heat)}}>{heatLabel(heat)}</span>
                  </div>
                )}
              </section>

              {/* AI 활동 요약 — 4칸 그리드 */}
              <section className="pwa-card">
                <span className="pwa-card-label">오늘 AI가 한 일</span>
                <div className="mission-grid">
                  <div className="mission-cell">
                    <span className="mission-num bull">{buyCount}</span>
                    <span className="mission-lbl">매수</span>
                  </div>
                  <div className="mission-cell">
                    <span className="mission-num bear">{blockCount}</span>
                    <span className="mission-lbl">차단</span>
                  </div>
                  <div className="mission-cell">
                    <span className="mission-num side">{watchCount}</span>
                    <span className="mission-lbl">분석</span>
                  </div>
                  <div className="mission-cell">
                    <span className="mission-num dim">{positions.length}</span>
                    <span className="mission-lbl">보유</span>
                  </div>
                </div>
              </section>

              {/* [v8.3] 6버튼 메뉴판 — 텔레그램 명령어 없이 버튼만으로 의사결정 */}
              <section className="pwa-card">
                <span className="pwa-card-label">바로가기</span>
                <div className="menu-grid">
                  <button className={`menu-btn ${activePanel==='market'?'active':''}`} onClick={()=>setActivePanel(p=>p==='market'?null:'market')}>
                    <span className="menu-icon">📊</span><span className="menu-lbl">오늘 시장</span>
                  </button>
                  <button className={`menu-btn ${activePanel==='ai'?'active':''}`} onClick={()=>setActivePanel(p=>p==='ai'?null:'ai')}>
                    <span className="menu-icon">🤖</span><span className="menu-lbl">AI 추천</span>
                  </button>
                  <button className={`menu-btn ${activePanel==='pending'?'active':''}`} onClick={()=>setActivePanel(p=>p==='pending'?null:'pending')}>
                    <span className="menu-icon">⏳</span><span className="menu-lbl">승인대기</span>
                    {pendingList.length > 0 && <span className="menu-badge">{pendingList.length}</span>}
                  </button>
                  <button className={`menu-btn ${activePanel==='watchlist'?'active':''}`} onClick={()=>setActivePanel(p=>p==='watchlist'?null:'watchlist')}>
                    <span className="menu-icon">👁️</span><span className="menu-lbl">관심종목</span>
                  </button>
                  <button className="menu-btn" onClick={()=>{setActivePanel(null); setTab('portfolio');}}>
                    <span className="menu-icon">💼</span><span className="menu-lbl">내 보유종목</span>
                  </button>
                  <button className={`menu-btn ${activePanel==='trades'?'active':''}`} onClick={()=>setActivePanel(p=>p==='trades'?null:'trades')}>
                    <span className="menu-icon">📝</span><span className="menu-lbl">오늘 매매</span>
                  </button>
                </div>
              </section>

              {/* 승인대기 패널 */}
              {activePanel === 'pending' && (
                <section className="pwa-card pending-panel">
                  <span className="pwa-card-label">⏳ 승인대기 ({pendingList.length}건)</span>
                  {pendingLoading && <div className="pwa-empty">불러오는 중...</div>}
                  {pendingError && <div className="pwa-error">{pendingError}</div>}
                  {!pendingLoading && !pendingError && pendingList.length === 0 && (
                    <div className="pwa-empty">현재 승인 대기 중인 종목이 없습니다.</div>
                  )}
                  {!pendingLoading && pendingList.length > 0 && (
                    <div className="pending-list">
                      {pendingList.map((p) => (
                        <div key={p.code} className="pending-card">
                          <div className="pending-top">
                            <span className="pending-name">{p.name} <span className="dim mono">({p.code})</span></span>
                            <span className={`pending-regime mono ${regimeClass(p.regime)}`}>{p.regime}</span>
                          </div>
                          <div className="pending-mid mono">
                            <span className="dim">score</span> <span>{p.final_score}</span>
                            <span className="dim" style={{marginLeft:10}}>{p.ml_signal}</span>
                          </div>
                          <div className="pending-price-grid mono">
                            <div><span className="dim">목표가</span> <span className="bull">{Number(p.target||0).toLocaleString()}원</span></div>
                            <div><span className="dim">손절가</span> <span className="bear">{Number(p.stop_loss||0).toLocaleString()}원</span></div>
                          </div>
                          {p.reason && <div className="pending-reason">{p.reason}</div>}
                          <div className="pending-actions">
                            <button
                              className="pending-btn approve"
                              disabled={actingCode === p.code}
                              onClick={() => actOnPending(p.code, 'approve')}
                            >{actingCode === p.code ? '처리 중...' : '✅ 승인'}</button>
                            <button
                              className="pending-btn reject"
                              disabled={actingCode === p.code}
                              onClick={() => actOnPending(p.code, 'skip')}
                            >{actingCode === p.code ? '처리 중...' : '❌ 거절'}</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              )}

              {/* AI 추천 패널 — 오늘 매수 실행분 재노출 */}
              {activePanel === 'ai' && (
                <section className="pwa-card">
                  <span className="pwa-card-label">🤖 AI 추천 (오늘 매수 실행분)</span>
                  {buyCount === 0
                    ? <div className="pwa-empty">오늘 AI 매수 추천 없음</div>
                    : <div className="pwa-action-list">{data.today_buys.map((b,i) => (
                        <div key={i} className="pwa-action-row">
                          <span className="pwa-action-stock">{b.stock}</span>
                          <span className="pwa-action-score mono dim">score {b.score}</span>
                          <span className="pwa-action-reason">{b.reason}</span>
                        </div>))}
                      </div>}
                </section>
              )}

              {/* 관심종목 패널 — Portfolio 탭 관심종목 섹션으로 이동 안내 */}
              {activePanel === 'watchlist' && (
                <section className="pwa-card">
                  <span className="pwa-card-label">👁️ 관심종목</span>
                  <div className="pwa-empty">
                    관심종목 추가/조회는 Portfolio 탭에서 확인할 수 있습니다.
                  </div>
                  <button className="pwa-report-btn" style={{marginTop:8, cursor:'pointer'}} onClick={()=>{setActivePanel(null); setTab('portfolio');}}>
                    Portfolio 탭으로 이동 →
                  </button>
                </section>
              )}

              {/* 오늘 시장 패널 — Regime/Heat 상세 */}
              {activePanel === 'market' && (
                <section className="pwa-card">
                  <span className="pwa-card-label">📊 오늘 시장</span>
                  <div className="pwa-rs-row"><span className="dim">Regime</span><span className={`mono ${regimeClass(regime)}`}>{regimeLabel(regime)}</span></div>
                  <div className="pwa-rs-row"><span className="dim">Heat Score</span><span className="mono" style={{color: heatColor(heat ?? 0)}}>{heat ?? '-'}</span></div>
                  <div className="pwa-rs-row"><span className="dim">차단 건수</span><span className="mono bear">{blockCount}건</span></div>
                </section>
              )}

              {/* 오늘 매매 패널 — 매수/매도 타임라인 단축뷰 */}
              {activePanel === 'trades' && (
                <section className="pwa-card">
                  <span className="pwa-card-label">📝 오늘 매매</span>
                  {(!data.recent_decisions || data.recent_decisions.filter(e => ['BUY','SELL'].includes(e.event_type)).length === 0)
                    ? <div className="pwa-empty">오늘 매매 기록 없음</div>
                    : <div className="pwa-timeline">{data.recent_decisions.filter(e => ['BUY','SELL'].includes(e.event_type)).slice(0,10).map((e,i) => (
                        <div key={i} className="pwa-timeline-row">
                          <span className={`pwa-tl-icon mono tl-${e.event_type?.toLowerCase()}`}>{eventLabel(e.event_type)}</span>
                          <span className="pwa-tl-time mono dim">{e.date?.slice(5,16)}</span>
                          <span className="pwa-tl-summary">{e.summary}</span>
                        </div>))}
                      </div>}
                </section>
              )}

              {/* 오늘 매수 */}
              <section className="pwa-card">
                <span className="pwa-card-label">✅ 매수 실행</span>
                {buyCount === 0
                  ? <div className="pwa-empty">오늘 매수 없음 — {regime === 'BEAR' ? '헤지/방어 스캔 중' : '관망 중'}</div>
                  : <div className="pwa-action-list">{data.today_buys.map((b,i) => (
                      <div key={i} className="pwa-action-row">
                        <span className="pwa-action-stock">{b.stock}</span>
                        <span className="pwa-action-score mono dim">score {b.score}</span>
                        <span className="pwa-action-reason">{b.reason}</span>
                      </div>))}
                    </div>}
              </section>

              {/* 차단 top3 */}
              {blockCount > 0 && (
                <section className="pwa-card">
                  <span className="pwa-card-label">⛔ 차단 사유 (상위 3)</span>
                  <div className="pwa-blocked-list">
                    {(data.today_blocked || []).slice(0,3).map((b,i) => (
                      <div key={i} className="pwa-blocked-row">
                        <span className="pwa-blocked-stock">{b.stock}</span>
                        <span className="pwa-blocked-signal mono dim bear">{b.signal}</span>
                        <span className="pwa-blocked-reason">{b.reason}</span>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* 최근 활동 타임라인 */}
              <section className="pwa-card">
                <span className="pwa-card-label">📋 최근 활동</span>
                {(!data.recent_decisions || data.recent_decisions.length === 0)
                  ? <div className="pwa-empty">기록된 활동 없음</div>
                  : <div className="pwa-timeline">{data.recent_decisions.slice(0,8).map((e,i) => (
                      <div key={i} className="pwa-timeline-row">
                        <span className={`pwa-tl-icon mono tl-${e.event_type?.toLowerCase()}`}>{eventLabel(e.event_type)}</span>
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
            {!data && !error && <div className="pwa-loading"><div className="pwa-spinner" /><span>Loading...</span></div>}
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
                <span className="pwa-card-label">AI Reasoning — Blocked</span>
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
                  <div className="pwa-rs-row"><span className="dim">Heat</span><span className="mono" style={{color: heatColor(heat)}}>{heat ?? '-'}/100</span></div>
                  <div className="pwa-rs-row"><span className="dim">매수</span><span className="mono bull">{buyCount}건</span></div>
                  <div className="pwa-rs-row"><span className="dim">차단</span><span className="mono bear">{blockCount}건</span></div>
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

        /* Header */
        .pwa-header { display: flex; justify-content: space-between; align-items: center; padding: 18px 20px 10px; border-bottom: 1px solid #1E2330; }
        .pwa-title { font-family: 'Syne', sans-serif; font-size: 1.2rem; font-weight: 800; color: #00FF85; letter-spacing: 0.08em; }
        .pwa-trader-toggle { display: flex; gap: 6px; }
        .pwa-trader-toggle button { background: #1A1F2E; border: 1px solid #2A3040; color: #888; padding: 4px 12px; border-radius: 4px; cursor: pointer; font-family: 'Space Mono', monospace; font-size: 0.75rem; }
        .pwa-trader-toggle button.active { background: #00FF85; color: #0B0E14; border-color: #00FF85; font-weight: 700; }

        /* Tabs */
        .pwa-tabs { display: flex; border-bottom: 1px solid #1E2330; }
        .pwa-tab { flex: 1; padding: 10px 4px; background: none; border: none; color: #555; cursor: pointer; font-family: 'Space Mono', monospace; font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 2px solid transparent; transition: all 0.15s; }
        .pwa-tab.active { color: #00FF85; border-bottom-color: #00FF85; }

        /* Layout */
        .pwa-main { padding: 12px 16px; display: flex; flex-direction: column; gap: 12px; }
        .pwa-card { background: #12161F; border: 1px solid #1E2330; border-radius: 8px; padding: 14px; }
        .pwa-card-label { display: block; font-size: 0.6rem; letter-spacing: 0.12em; color: #00FF85; text-transform: uppercase; margin-bottom: 10px; }

        /* Regime 카드 */
        .regime-card { display: flex; justify-content: space-between; align-items: center; }
        .regime-card.regime-bull { border-color: #00FF8533; }
        .regime-card.regime-bear { border-color: #FF444433; }
        .regime-card.regime-side { border-color: #FFAA0033; }
        .regime-main { display: flex; flex-direction: column; gap: 4px; }
        .regime-badge { font-family: 'Syne', sans-serif; font-size: 1.3rem; font-weight: 800; }
        .regime-badge.bull { color: #00FF85; }
        .regime-badge.bear { color: #FF4444; }
        .regime-badge.side { color: #FFAA00; }
        .regime-sub { font-size: 0.65rem; color: #888; }
        .heat-pill { border: 1px solid; border-radius: 8px; padding: 8px 14px; display: flex; flex-direction: column; align-items: center; gap: 2px; min-width: 64px; }
        .heat-label { font-size: 0.55rem; letter-spacing: 0.1em; }
        .heat-val { font-family: 'Syne', sans-serif; font-size: 1.4rem; font-weight: 800; line-height: 1; }
        .heat-tag { font-size: 0.55rem; letter-spacing: 0.08em; }

        /* Mission 4칸 그리드 */
        .mission-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
        .mission-cell { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 10px 4px; background: #0B0E14; border-radius: 6px; border: 1px solid #1E2330; }
        .mission-num { font-family: 'Syne', sans-serif; font-size: 1.6rem; font-weight: 800; line-height: 1; }
        .mission-lbl { font-size: 0.58rem; color: #555; letter-spacing: 0.06em; }

        /* [v8.3] 6버튼 메뉴판 */
        .menu-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
        .menu-btn { position: relative; display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 14px 6px; background: #0B0E14; border: 1px solid #1E2330; border-radius: 8px; color: #C8C6C3; cursor: pointer; font-family: 'Space Mono', monospace; transition: all 0.15s; }
        .menu-btn:hover { border-color: #2A3040; }
        .menu-btn.active { border-color: #00FF85; background: #00FF8511; color: #00FF85; }
        .menu-icon { font-size: 1.2rem; line-height: 1; }
        .menu-lbl { font-size: 0.68rem; letter-spacing: 0.02em; }
        .menu-badge { position: absolute; top: 6px; right: 8px; background: #FF4444; color: #fff; font-size: 0.6rem; font-weight: 700; border-radius: 10px; padding: 1px 6px; min-width: 16px; text-align: center; }

        /* [v8.3] 승인대기 카드 */
        .pending-panel { border-color: #00FF8533; }
        .pending-list { display: flex; flex-direction: column; gap: 10px; }
        .pending-card { background: #0B0E14; border: 1px solid #1E2330; border-radius: 8px; padding: 12px; display: flex; flex-direction: column; gap: 8px; }
        .pending-top { display: flex; justify-content: space-between; align-items: center; }
        .pending-name { font-size: 0.85rem; color: #E8E6E3; }
        .pending-regime { font-size: 0.65rem; padding: 2px 8px; border: 1px solid currentColor; border-radius: 4px; }
        .pending-mid { font-size: 0.72rem; }
        .pending-price-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 0.75rem; }
        .pending-price-grid > div { display: flex; flex-direction: column; gap: 2px; }
        .pending-reason { font-size: 0.7rem; color: #888; line-height: 1.5; }
        .pending-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 2px; }
        .pending-btn { padding: 10px 0; border-radius: 6px; font-family: 'Space Mono', monospace; font-size: 0.78rem; font-weight: 700; cursor: pointer; border: 1px solid; transition: opacity 0.15s; }
        .pending-btn:disabled { opacity: 0.5; cursor: default; }
        .pending-btn.approve { background: #00FF8522; border-color: #00FF85; color: #00FF85; }
        .pending-btn.approve:hover:not(:disabled) { background: #00FF8533; }
        .pending-btn.reject { background: #FF444422; border-color: #FF4444; color: #FF4444; }
        .pending-btn.reject:hover:not(:disabled) { background: #FF444433; }

        /* 공통 색상 */
        .bull { color: #00FF85; }
        .bear { color: #FF4444; }
        .side { color: #FFAA00; }
        .dim { color: #555; }
        .mono { font-family: 'Space Mono', monospace; }

        /* 타임라인 이벤트 색상 */
        .tl-buy { background: #00FF8522; color: #00FF85; }
        .tl-sell { background: #FF444422; color: #FF4444; }
        .tl-block { background: #FF444422; color: #FF8888; }
        .tl-analyze { background: #4488FF22; color: #4488FF; }
        .tl-heat_update { background: #FFAA0022; color: #FFAA00; }
        .tl-daily_summary { background: #88888822; color: #888; }

        /* 검색 */
        .pwa-search-wrap { margin-bottom: 8px; }
        .pwa-search-input { width: 100%; background: #0B0E14; border: 1px solid #2A3040; border-radius: 6px; padding: 10px 12px; color: #E8E6E3; font-family: 'Space Mono', monospace; font-size: 0.8rem; outline: none; }
        .pwa-search-input:focus { border-color: #00FF85; }
        .pwa-search-results { display: flex; flex-direction: column; gap: 4px; margin-top: 6px; }
        .pwa-search-item { background: #0B0E14; border: 1px solid #2A3040; border-radius: 6px; padding: 8px 12px; cursor: pointer; display: flex; align-items: center; gap: 10px; text-align: left; }
        .pwa-search-item:hover { border-color: #00FF85; }
        .pwa-si-name { color: #E8E6E3; font-size: 0.8rem; flex: 1; }
        .pwa-si-code { font-size: 0.7rem; }
        .pwa-si-theme { font-size: 0.65rem; }

        /* 분석 중 */
        .pwa-analyzing { display: flex; align-items: center; gap: 12px; justify-content: center; padding: 24px; }
        .pwa-spinner { width: 20px; height: 20px; border: 2px solid #1E2330; border-top-color: #00FF85; border-radius: 50%; animation: spin 0.8s linear infinite; flex-shrink: 0; }
        @keyframes spin { to { transform: rotate(360deg); } }

        /* 분석 결과 */
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

        /* 포트폴리오 */
        .pwa-balance-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .pwa-bal-item { display: flex; flex-direction: column; gap: 3px; }
        .pwa-bal-item span:first-child { font-size: 0.6rem; text-transform: uppercase; letter-spacing: 0.08em; color: #888; }
        .pwa-bal-item span:last-child { font-size: 0.8rem; }
        .pwa-positions { display: flex; flex-direction: column; gap: 8px; }
        .pwa-position-row { display: flex; align-items: center; gap: 10px; }
        .pwa-pos-name { flex: 1; font-size: 0.8rem; }
        .pwa-pos-qty { font-size: 0.7rem; }
        .pwa-pos-pnl { font-size: 0.8rem; font-weight: 700; }

        /* 액션/차단 리스트 */
        .pwa-action-list, .pwa-blocked-list { display: flex; flex-direction: column; gap: 8px; }
        .pwa-action-row, .pwa-blocked-row { display: flex; flex-direction: column; gap: 2px; padding-bottom: 8px; border-bottom: 1px solid #1E2330; }
        .pwa-action-row:last-child, .pwa-blocked-row:last-child { border-bottom: none; }
        .pwa-action-stock, .pwa-blocked-stock { font-size: 0.8rem; color: #E8E6E3; }
        .pwa-action-score, .pwa-blocked-signal { font-size: 0.65rem; }
        .pwa-action-reason, .pwa-blocked-reason { font-size: 0.7rem; color: #888; }

        /* 타임라인 */
        .pwa-timeline { display: flex; flex-direction: column; gap: 8px; }
        .pwa-timeline-row { display: flex; align-items: flex-start; gap: 8px; }
        .pwa-tl-icon { font-size: 0.6rem; padding: 2px 5px; border-radius: 3px; white-space: nowrap; background: #1E2330; color: #888; }
        .pwa-tl-time { font-size: 0.65rem; white-space: nowrap; }
        .pwa-tl-summary { font-size: 0.7rem; color: #888; }

        /* 리포트 */
        .pwa-report-links { display: flex; flex-direction: column; gap: 8px; }
        .pwa-report-btn { display: block; padding: 12px; background: #0B0E14; border: 1px solid #2A3040; border-radius: 6px; color: #E8E6E3; text-decoration: none; font-size: 0.8rem; transition: border-color 0.15s; }
        .pwa-report-btn:hover { border-color: #00FF85; color: #00FF85; }
        .pwa-report-summary { display: flex; flex-direction: column; gap: 8px; }
        .pwa-rs-row { display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-bottom: 1px solid #1E2330; }
        .pwa-rs-row:last-child { border-bottom: none; }
        .pwa-rs-row span:first-child { font-size: 0.7rem; }
        .pwa-rs-row span:last-child { font-size: 0.8rem; }

        /* 공통 */
        .pwa-empty { font-size: 0.75rem; color: #555; padding: 8px 0; }
        .pwa-loading { display: flex; align-items: center; justify-content: center; gap: 12px; padding: 40px; font-size: 0.8rem; color: #555; }
        .pwa-error { color: #FF4444; font-size: 0.75rem; padding: 12px 16px; }
        .pwa-footer { padding: 20px; text-align: center; }
      `}</style>
    </>
  );
}
