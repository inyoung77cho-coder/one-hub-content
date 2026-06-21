import Head from 'next/head';
import Link from 'next/link';
import { useState, useEffect, useCallback } from 'react';

export default function PWADashboard() {
  const [tab, setTab] = useState('dashboard');
  const [data, setData] = useState(null);
  const [trader, setTrader] = useState('A');
  const [error, setError] = useState(null);
  const [mounted, setMounted] = useState(false);

  // [v8.6] 라이트 테마 기본, 다크(터미널) 테마는 옵션으로 보존 — localStorage에 저장
  const [theme, setTheme] = useState('light');

  // Analyze tab state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeResult, setAnalyzeResult] = useState(null);
  const [analyzeError, setAnalyzeError] = useState(null);
  const [analyzeExpanded, setAnalyzeExpanded] = useState(false); // [v8.5] 요약 우선 노출, 상세는 더보기로 접음
  const [recentSearches, setRecentSearches] = useState([]); // [v8.5] 최근 검색 종목 (localStorage)

  // [v8.5] 승인대기 카드 상태 — 중복 메뉴(6버튼 그리드) 제거 후 단일 상태로 단순화
  const [pendingOpen, setPendingOpen] = useState(false);
  const [pendingList, setPendingList] = useState([]);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [pendingError, setPendingError] = useState(null);
  const [actingCode, setActingCode] = useState(null); // 승인/거절 처리 중인 종목코드

  useEffect(() => {
    setMounted(true);
    // [v8.5] 최근 검색 종목 불러오기
    try {
      const saved = window.localStorage.getItem('onehub_recent_searches');
      if (saved) setRecentSearches(JSON.parse(saved));
    } catch (e) { /* localStorage 미지원 환경 — 무시 */ }
    // [v8.6] 저장된 테마 불러오기 (기본값: light)
    try {
      const savedTheme = window.localStorage.getItem('onehub_theme');
      if (savedTheme === 'light' || savedTheme === 'dark') setTheme(savedTheme);
    } catch (e) { /* 무시 */ }
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(prev => {
      const next = prev === 'light' ? 'dark' : 'light';
      try { window.localStorage.setItem('onehub_theme', next); } catch (e) {}
      return next;
    });
  }, []);

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

  // [v8.5] 대시보드 진입 시 즉시 1회 로드 → 배지 숫자가 처음부터 정확하게 표시됨 (기존엔 패널을 한 번 열어야만 숫자가 채워졌음)
  useEffect(() => {
    if (!mounted) return;
    loadPending();
  }, [mounted, loadPending]);

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
    setAnalyzeExpanded(false);
    setSearchResults([]);
    setSearchQuery(name);
    // [v8.5] 최근 검색에 추가 (중복 제거, 최신순, 최대 5개)
    setRecentSearches(prev => {
      const next = [{ code, name }, ...prev.filter(s => s.code !== code)].slice(0, 5);
      try { window.localStorage.setItem('onehub_recent_searches', JSON.stringify(next)); } catch (e) {}
      return next;
    });
    try {
      const res = await fetch(`/api/analyze-stock?code=${code}`);
      const d = await res.json();
      if (d.ok) setAnalyzeResult(d);
      else setAnalyzeError(d.error || '분석 실패');
    } catch(e) { setAnalyzeError(String(e)); }
    finally { setAnalyzing(false); }
  }, []);

  const regimeClass = (r) => r === 'BULL' ? 'bull' : r === 'BEAR' ? 'bear' : 'side';
  const regimeIcon = (r) => r === 'BULL' ? '☀️' : r === 'BEAR' ? '🌧️' : '☁️';
  const regimeMarket = (r) => r === 'BULL' ? 'BULL MARKET' : r === 'BEAR' ? 'BEAR MARKET' : 'SIDEWAYS MARKET';
  const regimeKo = (r) => r === 'BULL' ? '상승장' : r === 'BEAR' ? '하락장' : '횡보장';
  const actionColor = (a) => a === 'BUY' ? 'var(--accent-buy)' : a === 'SELL' ? 'var(--accent-sell)' : 'var(--text-tertiary)';
  const eventLabel = (t) => ({ BUY:'BUY', SELL:'SELL', BLOCK:'BLOCK', ANALYZE:'AI', HEAT_UPDATE:'HEAT', DAILY_SUMMARY:'SUM' }[t] || '-');
  const heatTier = (h) => h == null ? null : h >= 70 ? 'hot' : h >= 40 ? 'warm' : 'cold';
  const heatColor = (h) => { const t = heatTier(h); return t === 'hot' ? 'var(--accent-buy)' : t === 'warm' ? 'var(--accent-warn)' : 'var(--accent-sell)'; };
  const heatLabel = (h) => { const t = heatTier(h); return t === 'hot' ? 'HOT' : t === 'warm' ? 'WARM' : 'COLD'; };
  // [v8.5] 차단 신호 한글 라벨 — STRONG_SELL 등 ML 용어를 일반 투자자가 바로 이해하도록 변환
  const blockedLabel = (signal) => {
    const s = (signal || '').toUpperCase();
    if (s.includes('STRONG_SELL')) return '매수 차단 · AI 강한 매도신호';
    if (s.includes('SELL')) return '매수 차단 · AI 매도신호';
    if (s.includes('ML')) return '매수 차단 · ML 하락예측';
    return '매수 차단';
  };
  // [v8.6] Hero 추천행동 — "AI가 뭘 했는가"가 아니라 "지금 내가 뭘 해야 하는가"를 한 줄로
  const heroVerdict = (regime, heat) => {
    const t = heatTier(heat);
    if (regime === 'BEAR') return '방어 우선';
    if (regime === 'BULL') return t === 'hot' ? '신중 매수' : '적극 매수';
    return t === 'hot' ? '신중 관망' : '관망';
  };
  const heroMessage = (regime, heat) => {
    const t = heatTier(heat);
    if (regime === 'BULL') {
      if (t === 'hot') return '시장이 뜨겁습니다 — 추격매수보다 눌림목을 기다리세요';
      if (t === 'warm') return '상승 흐름 속 선별 매수하기 좋은 날이에요';
      return '상승장이지만 아직 과열은 아니에요 — 비중을 조금씩 늘려보세요';
    }
    if (regime === 'BEAR') return '하락장 — 신규 매수보다 보유 종목 방어에 집중하세요';
    if (t === 'hot') return '횡보장 속 과열 신호 — 신중하게 접근하세요';
    return '뚜렷한 방향이 없어요 — 관망하며 기회를 기다리세요';
  };
  const heroBorderTint = (regime) => {
    const c = regime === 'BULL' ? 'var(--accent-buy)' : regime === 'BEAR' ? 'var(--accent-sell)' : 'var(--accent-warn)';
    return `color-mix(in srgb, ${c} 25%, var(--border))`;
  };

  let positions = [];
  if (data?.balance?.positions) {
    try { positions = JSON.parse(data.balance.positions); } catch(e) {}
  }

  // [v8.7] 포트폴리오 요약 — 보유종목 평가수익률 + 오늘 변동
  const portCostBasis = positions.reduce((sum, p) => sum + (Number(p.avg_price||0) * Number(p.qty||0)), 0);
  const portEvalTotal = positions.reduce((sum, p) => sum + Number(p.eval_amount||0), 0);
  const portReturnPct = portCostBasis > 0 ? ((portEvalTotal - portCostBasis) / portCostBasis * 100) : null;
  const todayPnl = data?.market?.daily_pnl ?? null;

  // Mission stats 계산
  const buyCount = data?.today_buys?.length ?? 0;
  const blockCount = data?.market?.block_count ?? 0;
  const watchCount = data?.recent_decisions?.filter(e => e.event_type === 'ANALYZE').length ?? 0;
  const heat = data?.market?.heat_score ?? null;
  const regime = data?.market?.regime ?? null;
const heroAction = regime === 'BEAR' ? 'SELL' : regime === 'BULL' ? 'BUY' : null;

  // [v8.7] Hero 추천종목 — today_buys 우선, 없으면 screening_candidates로 대체
  const topBuy = data?.today_buys?.length
    ? [...data.today_buys].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0]
    : null;
  const topScreen = !topBuy && data?.screening_candidates?.length
    ? [...data.screening_candidates].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0]
    : null;

  // [v8.7] "오늘 AI가 한 일" 결론 한 줄 — 숫자보다 먼저 보여줄 요약 문장
  const missionSummary = buyCount > 0
    ? `오늘 ${buyCount}건 매수 신호가 나왔어요`
    : blockCount > 0
      ? `오늘은 매수 없이 ${blockCount}건을 신중하게 걸렀어요`
      : watchCount > 0
        ? `오늘은 ${watchCount}건 분석했지만 매수 조건은 안 됐어요`
        : '오늘은 아직 활동 기록이 없어요';

  // [v8.7] TOP PICK 3 — 매수신호 우선, 부족하면 관심종목(screening_candidates)으로 채움
  const topPicksRaw = (data?.today_buys || []).map(b => ({
    name: b.stock, score: b.score, isBuy: true, reason: b.reason,
  }));
  if (topPicksRaw.length < 3 && data?.screening_candidates?.length) {
    const usedNames = new Set(topPicksRaw.map(p => p.name));
    const fillers = [...data.screening_candidates]
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      .filter(s => !usedNames.has(s.name))
      .slice(0, 3 - topPicksRaw.length)
      .map(s => ({ name: s.name, score: s.score, isBuy: false, reason: null }));
    topPicksRaw.push(...fillers);
  }
  const topPicks = topPicksRaw.slice(0, 3);

  return (
    <>
      <Head>
        <title>ONE-HUB Dashboard</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content={theme === 'light' ? '#F4F9FF' : '#0B0E14'} />
        <link href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Syne:wght@400;700;800&display=swap" rel="stylesheet" />
        <link href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css" rel="stylesheet" />
      </Head>
      <div className={`pwa-wrapper theme-${theme}`}>
        <header className="pwa-header">
          <div className="pwa-brand">
            <span className="pwa-brand-dot" />
            <h1 className="pwa-title">ONE-HUB</h1>
          </div>
          <div className="pwa-header-actions">
            <div className="pwa-trader-toggle">
              <button className={trader==='A'?'active':''} onClick={()=>setTrader('A')}>A</button>
              <button className={trader==='B'?'active':''} onClick={()=>setTrader('B')}>B</button>
            </div>
            <button
              className="pwa-theme-toggle"
              onClick={toggleTheme}
              aria-label="테마 전환"
              title={theme === 'light' ? '다크 모드로 전환' : '라이트 모드로 전환'}
            >
              {theme === 'light' ? '🌙' : '☀️'}
            </button>
          </div>
        </header>

        <nav className="pwa-tabs">
          {['dashboard','analyze','portfolio','report'].map(t => (
            <button key={t} className={`pwa-tab ${tab===t?'active':''}`} onClick={()=>setTab(t)}>
              {t==='dashboard'?'홈':t==='analyze'?'분석':t==='portfolio'?'보유':'기록'}
            </button>
          ))}
        </nav>

        {error && <div className="pwa-error">Error: {error}</div>}

        {/* ── Dashboard Tab — "오늘 뭘 해야 하는가" 우선순위 ── */}
        {tab === 'dashboard' && (
          <main className="pwa-main">
            {!data && !error && (
              <div className="pwa-loading">
                <div className="pwa-spinner" />
                <span>데이터 로딩 중...</span>
              </div>
            )}
            {data && (<>

              {/* [v8.6] Hero — 오늘의 시장. 기존 regime 카드를 대체하는 시그니처 요소 */}
              <section className="hero-card" style={{ borderColor: heroBorderTint(regime) }}>
                <div className="hero-eyebrow">{regimeIcon(regime)} 오늘의 시장</div>
                <div className="hero-regime">
                  <span className={`hero-regime-text ${regimeClass(regime)}`}>{regimeMarket(regime)}</span>
                  <span className="hero-regime-ko dim">{regimeKo(regime)}</span>
                </div>
                {heat !== null && (
                  <div className="hero-heat">
                    <div className="hero-heat-top">
                      <span className="hero-heat-label">AI 투자온도</span>
                      <span className="hero-heat-val" style={{ color: heatColor(heat) }}>
                        {heat}<span className="hero-heat-unit">점 · {heatLabel(heat)}</span>
                      </span>
                    </div>
                    <div className="heat-bar" role="img" aria-label={`투자온도 ${heat}점`}>
                      {Array.from({ length: 10 }).map((_, i) => (
                        <span
                          key={i}
                          className="heat-bar-seg"
                          style={i < Math.round(heat / 10) ? { background: heatColor(heat) } : undefined}
                        />
                      ))}
                    </div>
                  </div>
                )}
                <div className="hero-action">
                  <span className="hero-action-badge" style={{ color: actionColor(heroAction), borderColor: actionColor(heroAction) }}>
                    추천행동 · {heroVerdict(regime, heat)}
                  </span>
                  <p className="hero-action-text">{heroMessage(regime, heat)}</p>
                  {(topBuy || topScreen) && (
                    <div className="hero-pick">
                      <span className="hero-pick-label">{topBuy ? '오늘의 추천 종목' : '오늘의 주목 종목'}</span>
                      <div className="hero-pick-row">
                        <span className="hero-pick-name">{topBuy ? topBuy.stock : topScreen.name}</span>
                        {topBuy && <span className="hero-pick-score mono">AI 확신도 {Math.round(topBuy.score)}%</span>}
                      </div>
                      <button
                        className="hero-pick-btn"
                        onClick={() => document.getElementById('recommend-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                      >
                        추천종목 보기 →
                      </button>
                    </div>
                  )}
                </div>
              </section>

              {/* AI 활동 요약 — 4칸 그리드 */}
              <section className="pwa-card">
                <span className="pwa-card-label">오늘 AI가 한 일</span>
                <p className="mission-summary">{missionSummary}</p>
                <div className="mission-grid">
                  <div className="mission-cell buy">
                    <span className="mission-num">{buyCount}</span>
                    <span className="mission-lbl">매수</span>
                  </div>
                  <div className="mission-cell block">
                    <span className="mission-num">{blockCount}</span>
                    <span className="mission-lbl">차단</span>
                  </div>
                  <div className="mission-cell analyze">
                    <span className="mission-num">{watchCount}</span>
                    <span className="mission-lbl">분석</span>
                  </div>
                  <div className="mission-cell hold">
                    <span className="mission-num">{positions.length}</span>
                    <span className="mission-lbl">보유</span>
                  </div>
                </div>
              </section>

              {/* [v8.5] 승인대기 카드 — 기존 6버튼 그리드를 제거하고 단일 카드로 통합 (중복 메뉴 해소) */}
              <section className="pwa-card pending-panel">
                <button
                  className="pwa-card-label"
                  style={{ background:'none', border:'none', padding:0, cursor:'pointer', display:'flex', alignItems:'center', gap:8, width:'100%' }}
                  onClick={() => setPendingOpen(o => !o)}
                >
                  <span style={{flex:1, textAlign:'left'}}>⏳ 승인대기 ({pendingList.length}건)</span>
                  <span className="dim mono" style={{fontSize:'0.7rem'}}>{pendingOpen ? '접기 ▲' : '펼치기 ▼'}</span>
                </button>
                {pendingOpen && (<>
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
                </>)}
              </section>

              {/* [v8.7] 추천종목 — 오늘의 TOP PICK (매수신호 없어도 관심종목으로 항상 최대 3개 노출) */}
              <section className="pwa-card" id="recommend-section">
                <span className="pwa-card-label">✅ 오늘의 TOP PICK</span>
                {topPicks.length === 0
                  ? <div className="pwa-empty">오늘 매수 없음 — {regime === 'BEAR' ? '헤지/방어 스캔 중' : '관망 중'}</div>
                  : <div className="pwa-action-list">{topPicks.map((p, i) => (
                      <div key={i} className="pwa-action-row">
                        <span className="pwa-action-stock">{['🥇','🥈','🥉'][i] || ''} {p.name}</span>
                        {p.isBuy
                          ? <span className="pwa-action-score mono dim">AI 확신도 {Math.round(p.score)}%</span>
                          : <span className="pwa-action-score mono dim">관심도 {Math.round(p.score)}</span>}
                        {p.reason && <span className="pwa-action-reason">{p.reason}</span>}
                      </div>))}
                    </div>}
              </section>

              {/* [v8.6] 보유종목 미리보기 — Hero 다음 우선순위로 신설 (전체 화면은 보유 탭) */}
              <section className="pwa-card">
                <span className="pwa-card-label">💼 보유 종목</span>
                {positions.length === 0
                  ? <div className="pwa-empty">보유 종목 없음</div>
                  : (<>
                      <div className="position-cards">
                        {positions.slice(0, 3).map((p, i) => (
                          <div key={i} className="position-card-mini">
                            <span className="position-mini-name">{p.name}</span>
                            <span className={`position-mini-pnl ${p.pnl_rate>=0?'bull':'bear'}`}>
                              {p.pnl_rate>=0?'+':''}{p.pnl_rate}%
                            </span>
                          </div>
                        ))}
                      </div>
                      <button className="pwa-link-btn" onClick={() => setTab('portfolio')}>
                        보유종목 전체보기 ({positions.length}건) →
                      </button>
                    </>)}
              </section>

              {/* 차단 top3 — [v8.5] STRONG_SELL 등 원시 ML 코드 대신 한글 설명 노출 */}
              {blockCount > 0 && (
                <section className="pwa-card">
                  <span className="pwa-card-label">⛔ 매수 차단 사유 (상위 3)</span>
                  <div className="pwa-blocked-list">
                    {(data.today_blocked || []).slice(0,3).map((b,i) => (
                      <div key={i} className="pwa-blocked-row">
                        <span className="pwa-blocked-stock">{b.stock}</span>
                        <span className="pwa-blocked-signal mono dim bear">{blockedLabel(b.signal)}</span>
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
              {/* [v8.5] 최근 검색 */}
              {searchResults.length === 0 && recentSearches.length > 0 && (
                <div className="recent-search-wrap">
                  <span className="recent-search-label">최근 검색</span>
                  <div className="recent-search-chips">
                    {recentSearches.map((s,i) => (
                      <button key={i} className="recent-search-chip" onClick={() => runAnalyze(s.code, s.name)}>
                        {s.name}
                      </button>
                    ))}
                  </div>
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
                {/* [v8.5] 요약 카드 — 액션/확신도/핵심신호를 한눈에. 기존엔 결론을 보려면 6장 카드를 끝까지 스크롤해야 했음 */}
                <section className="pwa-card">
                  <span className="pwa-card-label">{analyzeResult.name} ({analyzeResult.code})</span>
                  <div className="pwa-analyze-header">
                    <span className="pwa-analyze-action" style={{color: actionColor(analyzeResult.action)}}>
                      {analyzeResult.action === 'BUY' ? '🟢 매수' : analyzeResult.action === 'SELL' ? '🔴 매도' : '⚪ 관망'}
                    </span>
                    <span className="pwa-analyze-conf-badge mono" style={{borderColor: actionColor(analyzeResult.action), color: actionColor(analyzeResult.action)}}>
                      AI 확신도 {analyzeResult.confidence_score}%
                    </span>
                  </div>
                  {/* [v8.7] 결론 먼저 — 목표가/손절가/기대수익을 토글 밖 메인 카드로 승격 */}
                  <div className="pwa-price-grid" style={{marginTop:12}}>
                    <div className="pwa-price-item">
                      <span className="dim">목표가</span>
                      <span className="mono bull">{analyzeResult.target?.toLocaleString()}원</span>
                    </div>
                    <div className="pwa-price-item">
                      <span className="dim">손절가</span>
                      <span className="mono bear">{analyzeResult.stop_loss?.toLocaleString()}원</span>
                    </div>
                    {analyzeResult.current_price > 0 && (
                      <div className="pwa-price-item">
                        <span className="dim">기대수익</span>
                        <span className="mono bull">
                          {((analyzeResult.target / analyzeResult.current_price - 1) * 100).toFixed(1)}%
                        </span>
                      </div>
                    )}
                  </div>
                  {analyzeResult.key_signal && <p className="pwa-analyze-text" style={{marginTop:10}}>{analyzeResult.key_signal}</p>}
                </section>

                {analyzeResult.verdict && (
                  <section className="pwa-card pwa-verdict">
                    <span className="pwa-card-label">✅ 결론</span>
                    <p className="pwa-analyze-text">{analyzeResult.verdict}</p>
                  </section>
                )}

                <button
                  className="pwa-report-btn"
                  style={{ cursor:'pointer', textAlign:'center', width:'100%' }}
                  onClick={() => setAnalyzeExpanded(v => !v)}
                >
                  {analyzeExpanded ? '왜? 접기 ▲' : '왜? — AI 판단 근거 보기 (기술/매크로) ▼'}
                </button>

                {analyzeExpanded && (<>
                  {analyzeResult.technical_summary && (
                    <section className="pwa-card">
                      <span className="pwa-card-label">📈 기술적 분석</span>
                      <p className="dim mono" style={{fontSize:'0.72rem', marginBottom:6}}>
                        현재가 {analyzeResult.current_price?.toLocaleString()}원 · RSI {analyzeResult.rsi?.toFixed(1)}
                      </p>
                      <p className="pwa-analyze-text">{analyzeResult.technical_summary}</p>
                    </section>
                  )}
                  {analyzeResult.macro_alignment && (
                    <section className="pwa-card">
                      <span className="pwa-card-label">🌐 매크로</span>
                      <p className="pwa-analyze-text">{analyzeResult.macro_alignment}</p>
                    </section>
                  )}
                  {analyzeResult.caution && (
                    <section className="pwa-card pwa-caution">
                      <span className="pwa-card-label">⚠️ 주의</span>
                      <p className="pwa-analyze-text">{analyzeResult.caution}</p>
                    </section>
                  )}
                </>)}
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
                  {portReturnPct !== null && (
                    <div className="pwa-bal-item">
                      <span className="dim">평가수익률</span>
                      <span className={`mono ${portReturnPct>=0?'bull':'bear'}`}>
                        {portReturnPct>=0?'+':''}{portReturnPct.toFixed(2)}%
                      </span>
                    </div>
                  )}
                  {todayPnl !== null && (
                    <div className="pwa-bal-item">
                      <span className="dim">오늘 변동</span>
                      <span className={`mono ${todayPnl>=0?'bull':'bear'}`}>
                        {todayPnl>=0?'+':''}{Number(todayPnl).toLocaleString()}원
                      </span>
                    </div>
                  )}
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
                  : <div className="position-cards">{positions.map((p,i) => (
                      <div key={i} className="position-card">
                        <div className="position-card-top">
                          <span className="position-card-name">{p.name}</span>
                          <span className={`position-card-badge mono ${p.pnl_rate>=0?'bull':'bear'}`}>
                            {p.pnl_rate>=0?'+':''}{p.pnl_rate}%
                          </span>
                        </div>
                        <div className="position-card-grid mono">
                          <div className="position-card-cell">
                            <span className="dim">매수가</span>
                            <span>{Number(p.avg_price||0).toLocaleString()}원</span>
                          </div>
                          <div className="position-card-cell">
                            <span className="dim">현재가</span>
                            <span>{Number(p.current_price||0).toLocaleString()}원</span>
                          </div>
                          <div className="position-card-cell">
                            <span className="dim">수량</span>
                            <span>{p.qty}주</span>
                          </div>
                          <div className="position-card-cell">
                            <span className="dim">평가손익</span>
                            <span className={p.pnl_amount>=0?'bull':'bear'}>
                              {p.pnl_amount>=0?'+':''}{Number(p.pnl_amount||0).toLocaleString()}원
                            </span>
                          </div>
                          {p.target > 0 && (
                            <div className="position-card-cell">
                              <span className="dim">목표가</span>
                              <span className="bull">{Number(p.target).toLocaleString()}원</span>
                            </div>
                          )}
                          {p.stop_loss > 0 && (
                            <div className="position-card-cell">
                              <span className="dim">손절가</span>
                              <span className="bear">{Number(p.stop_loss).toLocaleString()}원</span>
                            </div>
                          )}
                        </div>
                        {p.entry_hypothesis && (
                          <div className="position-card-ai">
                            <span className="position-card-ai-label">🤖 AI 의견</span>
                            <p className="position-card-ai-text">{p.entry_hypothesis}</p>
                          </div>
                        )}
                      </div>))}
                    </div>}
              </section>
              <section className="pwa-card">
                <span className="pwa-card-label">🤖 AI 판단 — 매수 차단 종목</span>
                {(!data.today_blocked || data.today_blocked.length===0)
                  ? <div className="pwa-empty">차단 종목 없음</div>
                  : <div className="pwa-blocked-list">{data.today_blocked.slice(0,5).map((b,i) => (
                      <div key={i} className="pwa-blocked-row">
                        <span className="pwa-blocked-stock">{b.stock}</span>
                        <span className="pwa-blocked-signal mono dim">{blockedLabel(b.signal)}</span>
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
              <span className="pwa-card-label">일간 / 주간 리포트</span>
              <div className="report-cards">
                <Link href="/daily" className="report-card">
                  <span className="report-card-icon">📅</span>
                  <span className="report-card-title">일간 리포트</span>
                  <span className="report-card-desc">매일 장마감 요약</span>
                </Link>
                <Link href="/weekly" className="report-card">
                  <span className="report-card-icon">📊</span>
                  <span className="report-card-title">주간 리포트</span>
                  <span className="report-card-desc">MDD·승률·손익비</span>
                </Link>
                <Link href="/history" className="report-card">
                  <span className="report-card-icon">🤖</span>
                  <span className="report-card-title">AI 히스토리</span>
                  <span className="report-card-desc">AI 판단 기록</span>
                </Link>
                <Link href="/heat-history" className="report-card">
                  <span className="report-card-icon">🌡</span>
                  <span className="report-card-title">히트 히스토리</span>
                  <span className="report-card-desc">시장 과열도 추이</span>
                </Link>
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

        /* [v8.6] 라이트(기본) — Apple Finance / Toss / Notion 톤. */
        .pwa-wrapper.theme-light {
          --bg: #F4F9FF;
          --card-bg: #FFFFFF;
          --inset-bg: #EAF3FC;
          --border: #DCE9F7;
          --text-primary: #16213D;
          --text-secondary: #5B7088;
          --text-tertiary: #93A6BC;
          --accent-buy: #00D26A;
          --accent-sell: #FF5B5B;
          --accent-warn: #FFA73C;
          --accent-info: #4A90E2;
          --label-color: var(--text-secondary);
          --font-display: 'Syne', sans-serif;
          --font-body: 'Pretendard', -apple-system, BlinkMacSystemFont, 'Malgun Gothic', sans-serif;
          --font-mono: 'Pretendard', -apple-system, BlinkMacSystemFont, sans-serif;
          --radius-card: 20px;
          --radius-md: 14px;
          --radius-sm: 10px;
          --radius-pill: 999px;
          --card-shadow: 0 2px 16px rgba(20, 38, 68, 0.07);
          --hero-bg: linear-gradient(135deg, #EAF3FC 0%, #FFFFFF 65%);
        }

        /* [v8.6] 다크(터미널) — 기존 디자인을 옵션으로 보존 */
        .pwa-wrapper.theme-dark {
          --bg: #0B0E14;
          --card-bg: #12161F;
          --inset-bg: #0B0E14;
          --border: #1E2330;
          --text-primary: #E8E6E3;
          --text-secondary: #888888;
          --text-tertiary: #555555;
          --accent-buy: #00FF85;
          --accent-sell: #FF4444;
          --accent-warn: #FFAA00;
          --accent-info: #4488FF;
          --label-color: var(--accent-buy);
          --font-display: 'Syne', sans-serif;
          --font-body: 'Space Mono', monospace;
          --font-mono: 'Space Mono', monospace;
          --radius-card: 8px;
          --radius-md: 6px;
          --radius-sm: 6px;
          --radius-pill: 6px;
          --card-shadow: none;
          --hero-bg: var(--card-bg);
        }

        .pwa-wrapper { min-height: 100vh; background: var(--bg); color: var(--text-primary); font-family: var(--font-body); padding-bottom: 40px; transition: background 0.2s ease, color 0.2s ease; }
        button, input { font-family: inherit; }
        button:focus-visible, input:focus-visible { outline: 2px solid var(--accent-info); outline-offset: 2px; }
        :global(.pwa-wrapper a:focus-visible) { outline: 2px solid var(--accent-info); outline-offset: 2px; }
        @media (prefers-reduced-motion: reduce) { .pwa-spinner { animation-duration: 0.001s; } }

        /* Header */
        .pwa-header { display: flex; justify-content: space-between; align-items: center; padding: 18px 20px 12px; }
        .pwa-brand { display: flex; align-items: center; gap: 8px; }
        .pwa-brand-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--accent-buy); flex-shrink: 0; }
        .pwa-title { font-family: var(--font-display); font-size: 1.15rem; font-weight: 800; letter-spacing: 0.04em; color: var(--text-primary); }
        .pwa-header-actions { display: flex; align-items: center; gap: 8px; }
        .pwa-trader-toggle { display: flex; gap: 3px; background: var(--inset-bg); padding: 3px; border-radius: var(--radius-pill); }
        .pwa-trader-toggle button { background: none; border: none; color: var(--text-secondary); padding: 5px 13px; border-radius: var(--radius-pill); cursor: pointer; font-family: var(--font-display); font-size: 0.75rem; font-weight: 700; }
        .pwa-trader-toggle button.active { background: var(--card-bg); color: var(--accent-info); box-shadow: var(--card-shadow); }
        .theme-dark .pwa-trader-toggle button.active { background: var(--accent-buy); color: var(--bg); box-shadow: none; }
        .pwa-theme-toggle { width: 32px; height: 32px; border-radius: 50%; border: 1px solid var(--border); background: var(--card-bg); cursor: pointer; font-size: 0.9rem; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }

        /* Tabs */
        .pwa-tabs { display: flex; }
        .pwa-tab { flex: 1; padding: 10px 4px; background: none; border: none; cursor: pointer; color: var(--text-tertiary); font-family: var(--font-display); font-size: 0.72rem; font-weight: 700; letter-spacing: 0.02em; }
        .theme-light .pwa-tabs { background: var(--inset-bg); padding: 4px; border-radius: var(--radius-md); margin: 4px 16px 8px; gap: 2px; }
        .theme-light .pwa-tab.active { background: var(--card-bg); color: var(--text-primary); border-radius: 10px; box-shadow: var(--card-shadow); }
        .theme-dark .pwa-tabs { border-bottom: 1px solid var(--border); }
        .theme-dark .pwa-tab { text-transform: uppercase; font-family: var(--font-mono); font-size: 0.65rem; border-bottom: 2px solid transparent; }
        .theme-dark .pwa-tab.active { color: var(--accent-buy); border-bottom-color: var(--accent-buy); }

        /* Layout */
        .pwa-main { padding: 8px 16px 12px; display: flex; flex-direction: column; gap: 12px; }
        .pwa-card { background: var(--card-bg); border: 1px solid var(--border); border-radius: var(--radius-card); padding: 16px; box-shadow: var(--card-shadow); }
        .pwa-card-label { display: block; font-size: 0.68rem; letter-spacing: 0.08em; color: var(--label-color); text-transform: uppercase; margin-bottom: 10px; font-weight: 700; }

        /* [v8.6] Hero 카드 — "오늘의 시장" */
        .hero-card { background: var(--hero-bg); border: 1px solid var(--border); border-radius: var(--radius-card); padding: 20px; box-shadow: var(--card-shadow); display: flex; flex-direction: column; gap: 14px; }
        .hero-eyebrow { font-size: 0.78rem; color: var(--text-secondary); font-weight: 600; }
        .hero-regime { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
        .hero-regime-text { font-family: var(--font-display); font-size: 1.5rem; font-weight: 800; }
        .hero-regime-ko { font-size: 0.8rem; }
        .hero-heat-top { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px; }
        .hero-heat-label { font-size: 0.72rem; color: var(--text-secondary); }
        .hero-heat-val { font-family: var(--font-display); font-size: 1.3rem; font-weight: 800; }
        .hero-heat-unit { font-family: var(--font-body); font-size: 0.7rem; font-weight: 500; margin-left: 4px; color: var(--text-secondary); }
        .heat-bar { display: flex; gap: 3px; }
        .heat-bar-seg { flex: 1; height: 10px; border-radius: 4px; background: var(--inset-bg); }
        .hero-action { display: flex; flex-direction: column; gap: 8px; padding-top: 6px; border-top: 1px solid var(--border); }
        .hero-action-badge { align-self: flex-start; font-size: 0.72rem; font-weight: 700; padding: 5px 12px; border: 1px solid; border-radius: var(--radius-pill); }
        .hero-action-text { font-size: 0.8rem; line-height: 1.5; color: var(--text-primary); }
        .hero-pick { display: flex; flex-direction: column; gap: 6px; margin-top: 4px; padding-top: 10px; border-top: 1px dashed var(--border); }
        .hero-pick-label { font-size: 0.72rem; color: var(--text-secondary); font-weight: 600; }
        .hero-pick-row { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
        .hero-pick-name { font-size: 0.95rem; font-weight: 700; color: var(--text-primary); }
        .hero-pick-score { font-size: 0.72rem; color: var(--accent-buy); }
        .hero-pick-btn { align-self: flex-start; background: none; border: none; padding: 0; margin-top: 2px; font-size: 0.76rem; font-weight: 600; color: var(--accent-info); cursor: pointer; }

        /* Mission 4칸 그리드 */
        .mission-summary { font-size: 0.82rem; color: var(--text-primary); font-weight: 600; margin: 2px 0 10px; }
        .mission-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
        .mission-cell { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 12px 4px; border-radius: var(--radius-md); }
        .mission-num { font-family: var(--font-display); font-size: 1.5rem; font-weight: 800; line-height: 1; }
        .mission-lbl { font-size: 0.6rem; color: var(--text-secondary); letter-spacing: 0.04em; margin-top: 2px; }
        .mission-cell.buy { background: color-mix(in srgb, var(--accent-buy) 12%, var(--card-bg)); }
        .mission-cell.buy .mission-num { color: var(--accent-buy); }
        .mission-cell.block { background: color-mix(in srgb, var(--accent-sell) 12%, var(--card-bg)); }
        .mission-cell.block .mission-num { color: var(--accent-sell); }
        .mission-cell.analyze { background: color-mix(in srgb, var(--accent-info) 12%, var(--card-bg)); }
        .mission-cell.analyze .mission-num { color: var(--accent-info); }
        .mission-cell.hold { background: var(--inset-bg); }
        .mission-cell.hold .mission-num { color: var(--text-primary); }

        /* 승인대기 카드 */
        .pending-panel { border-color: color-mix(in srgb, var(--accent-buy) 25%, var(--border)); }
        .pending-list { display: flex; flex-direction: column; gap: 10px; }
        .pending-card { background: var(--inset-bg); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 14px; display: flex; flex-direction: column; gap: 8px; }
        .pending-top { display: flex; justify-content: space-between; align-items: center; }
        .pending-name { font-size: 0.85rem; color: var(--text-primary); }
        .pending-regime { font-size: 0.65rem; padding: 2px 8px; border: 1px solid currentColor; border-radius: var(--radius-pill); }
        .pending-mid { font-size: 0.75rem; }
        .pending-price-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 0.78rem; }
        .pending-price-grid > div { display: flex; flex-direction: column; gap: 2px; }
        .pending-reason { font-size: 0.72rem; color: var(--text-secondary); line-height: 1.5; }
        .pending-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 2px; }
        .pending-btn { padding: 11px 0; border-radius: var(--radius-sm); font-family: var(--font-display); font-size: 0.8rem; font-weight: 700; cursor: pointer; border: 1px solid; transition: opacity 0.15s, transform 0.1s; }
        .pending-btn:active { transform: scale(0.98); }
        .pending-btn:disabled { opacity: 0.5; cursor: default; }
        .pending-btn.approve { background: color-mix(in srgb, var(--accent-buy) 14%, var(--card-bg)); border-color: var(--accent-buy); color: var(--accent-buy); }
        .pending-btn.approve:hover:not(:disabled) { background: color-mix(in srgb, var(--accent-buy) 24%, var(--card-bg)); }
        .pending-btn.reject { background: color-mix(in srgb, var(--accent-sell) 14%, var(--card-bg)); border-color: var(--accent-sell); color: var(--accent-sell); }
        .pending-btn.reject:hover:not(:disabled) { background: color-mix(in srgb, var(--accent-sell) 24%, var(--card-bg)); }

        /* 공통 색상 */
        .bull { color: var(--accent-buy); }
        .bear { color: var(--accent-sell); }
        .side { color: var(--accent-warn); }
        .dim { color: var(--text-tertiary); }
        .mono { font-family: var(--font-mono); font-variant-numeric: tabular-nums; }

        /* 타임라인 이벤트 색상 */
        .tl-buy { background: color-mix(in srgb, var(--accent-buy) 14%, var(--card-bg)); color: var(--accent-buy); }
        .tl-sell { background: color-mix(in srgb, var(--accent-sell) 14%, var(--card-bg)); color: var(--accent-sell); }
        .tl-block { background: color-mix(in srgb, var(--accent-sell) 14%, var(--card-bg)); color: var(--accent-sell); }
        .tl-analyze { background: color-mix(in srgb, var(--accent-info) 14%, var(--card-bg)); color: var(--accent-info); }
        .tl-heat_update { background: color-mix(in srgb, var(--accent-warn) 14%, var(--card-bg)); color: var(--accent-warn); }
        .tl-daily_summary { background: var(--inset-bg); color: var(--text-secondary); }

        /* 검색 */
        .pwa-search-wrap { margin-bottom: 8px; }
        .pwa-search-input { width: 100%; background: var(--inset-bg); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 11px 14px; color: var(--text-primary); font-family: var(--font-body); font-size: 0.85rem; outline: none; transition: border-color 0.15s; }
        .pwa-search-input:focus { border-color: var(--accent-info); }
        .pwa-search-results { display: flex; flex-direction: column; gap: 6px; margin-top: 8px; }
        .recent-search-wrap { margin-top: 12px; }
        .recent-search-label { display: block; font-size: 0.65rem; letter-spacing: 0.04em; color: var(--text-tertiary); margin-bottom: 6px; }
        .recent-search-chips { display: flex; flex-wrap: wrap; gap: 6px; }
        .recent-search-chip { background: var(--inset-bg); border: 1px solid var(--border); border-radius: var(--radius-pill); padding: 6px 14px; color: var(--text-secondary); font-family: var(--font-body); font-size: 0.75rem; cursor: pointer; transition: all 0.15s; }
        .recent-search-chip:hover { border-color: var(--accent-buy); color: var(--accent-buy); }
        .pwa-search-item { background: var(--inset-bg); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 10px 14px; cursor: pointer; display: flex; align-items: center; gap: 10px; text-align: left; width: 100%; transition: border-color 0.15s; }
        .pwa-search-item:hover { border-color: var(--accent-buy); }
        .pwa-si-name { color: var(--text-primary); font-size: 0.85rem; flex: 1; }
        .pwa-si-code { font-size: 0.72rem; }
        .pwa-si-theme { font-size: 0.68rem; color: var(--text-tertiary); }

        /* 분석 중 */
        .pwa-analyzing { display: flex; align-items: center; gap: 12px; justify-content: center; padding: 28px; }
        .pwa-spinner { width: 20px; height: 20px; border: 2px solid var(--border); border-top-color: var(--accent-buy); border-radius: 50%; animation: spin 0.8s linear infinite; flex-shrink: 0; }
        @keyframes spin { to { transform: rotate(360deg); } }

        /* 분석 결과 */
        .pwa-analyze-header { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; flex-wrap: wrap; }
        .pwa-analyze-action { font-family: var(--font-display); font-size: 1.25rem; font-weight: 800; }
        .pwa-analyze-conf-badge { font-size: 0.75rem; font-weight: 700; padding: 5px 12px; border: 1px solid; border-radius: var(--radius-pill); }
        .pwa-price-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .pwa-price-item { display: flex; flex-direction: column; gap: 3px; }
        .pwa-price-item span:first-child { font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-tertiary); }
        .pwa-price-item span:last-child { font-size: 0.88rem; color: var(--text-primary); }
        .pwa-analyze-text { font-size: 0.8rem; line-height: 1.65; color: var(--text-secondary); }
        .pwa-verdict { border-color: color-mix(in srgb, var(--accent-buy) 30%, var(--border)); }
        .pwa-caution { border-color: color-mix(in srgb, var(--accent-warn) 30%, var(--border)); }

        /* 포트폴리오 */
        .pwa-balance-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .pwa-bal-item { display: flex; flex-direction: column; gap: 3px; }
        .pwa-bal-item span:first-child { font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-tertiary); }
        .pwa-bal-item span:last-child { font-size: 0.85rem; color: var(--text-primary); }
        /* [v8.5] 보유종목 카드 */
        .position-cards { display: flex; flex-direction: column; gap: 10px; }
        .position-card { background: var(--inset-bg); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 14px; }
        .position-card-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
        .position-card-name { font-size: 0.88rem; color: var(--text-primary); font-weight: 600; }
        .position-card-badge { font-size: 0.8rem; font-weight: 700; padding: 4px 10px; border-radius: var(--radius-pill); }
        .position-card-badge.bull { background: color-mix(in srgb, var(--accent-buy) 16%, var(--card-bg)); }
        .position-card-badge.bear { background: color-mix(in srgb, var(--accent-sell) 16%, var(--card-bg)); }
        .position-card-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 14px; }
        .position-card-cell { display: flex; flex-direction: column; gap: 2px; font-size: 0.8rem; }
        .position-card-cell .dim { font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.03em; }
        .position-card-ai { margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--border); }
        .position-card-ai-label { display: block; font-size: 0.62rem; letter-spacing: 0.04em; color: var(--accent-info); margin-bottom: 4px; font-weight: 700; }
        .position-card-ai-text { font-size: 0.76rem; line-height: 1.55; color: var(--text-secondary); }

        /* [v8.6] 홈 화면 보유종목 미리보기 */
        .position-card-mini { display: flex; justify-content: space-between; align-items: center; background: var(--inset-bg); border-radius: var(--radius-sm); padding: 10px 14px; }
        .position-mini-name { font-size: 0.82rem; color: var(--text-primary); }
        .position-mini-pnl { font-size: 0.82rem; font-weight: 700; }
        .pwa-link-btn { width: 100%; background: none; border: none; padding: 10px 0 0; color: var(--accent-info); font-size: 0.75rem; font-weight: 700; cursor: pointer; text-align: center; }

        /* [v8.5] 리포트 카드 */
        .report-cards { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .report-card { display: flex; flex-direction: column; gap: 5px; background: var(--inset-bg); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 16px 14px; text-decoration: none; transition: border-color 0.15s, transform 0.1s; }
        .report-card:hover { border-color: var(--accent-buy); }
        .report-card:active { transform: scale(0.98); }
        .report-card-icon { font-size: 1.4rem; }
        .report-card-title { font-size: 0.85rem; color: var(--text-primary); font-weight: 700; }
        .report-card-desc { font-size: 0.68rem; color: var(--text-tertiary); }

        /* 액션/차단 리스트 */
        .pwa-action-list, .pwa-blocked-list { display: flex; flex-direction: column; gap: 10px; }
        .pwa-action-row, .pwa-blocked-row { display: flex; flex-direction: column; gap: 3px; padding-bottom: 10px; border-bottom: 1px solid var(--border); }
        .pwa-action-row:last-child, .pwa-blocked-row:last-child { border-bottom: none; padding-bottom: 0; }
        .pwa-action-stock, .pwa-blocked-stock { font-size: 0.85rem; color: var(--text-primary); font-weight: 600; }
        .pwa-action-score, .pwa-blocked-signal { font-size: 0.68rem; }
        .pwa-action-reason, .pwa-blocked-reason { font-size: 0.74rem; color: var(--text-secondary); }

        /* 타임라인 */
        .pwa-timeline { display: flex; flex-direction: column; gap: 10px; }
        .pwa-timeline-row { display: flex; align-items: flex-start; gap: 8px; }
        .pwa-tl-icon { font-size: 0.62rem; padding: 3px 7px; border-radius: var(--radius-pill); white-space: nowrap; font-weight: 700; }
        .pwa-tl-time { font-size: 0.68rem; white-space: nowrap; color: var(--text-tertiary); }
        .pwa-tl-summary { font-size: 0.75rem; color: var(--text-secondary); }

        /* 리포트 */
        .pwa-report-btn { display: block; padding: 13px; background: var(--inset-bg); border: 1px solid var(--border); border-radius: var(--radius-sm); color: var(--text-primary); text-decoration: none; font-size: 0.82rem; font-weight: 600; transition: border-color 0.15s; }
        .pwa-report-btn:hover { border-color: var(--accent-buy); color: var(--accent-buy); }
        .pwa-report-summary { display: flex; flex-direction: column; gap: 4px; }
        .pwa-rs-row { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--border); }
        .pwa-rs-row:last-child { border-bottom: none; }
        .pwa-rs-row span:first-child { font-size: 0.75rem; color: var(--text-secondary); }
        .pwa-rs-row span:last-child { font-size: 0.85rem; color: var(--text-primary); }

        /* 공통 */
        .pwa-empty { font-size: 0.78rem; color: var(--text-tertiary); padding: 10px 0; }
        .pwa-loading { display: flex; align-items: center; justify-content: center; gap: 12px; padding: 48px; font-size: 0.82rem; color: var(--text-tertiary); }
        .pwa-error { color: var(--accent-sell); font-size: 0.78rem; padding: 14px 16px; }
        .pwa-footer { padding: 24px; text-align: center; }
        .pwa-footer :global(a) { color: var(--text-tertiary); text-decoration: none; font-size: 0.75rem; }
      `}</style>
    </>
  );
}
