import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useState, useEffect, useCallback } from 'react';
import { getLatestDailyReport } from '../../lib/reports';

// [v9.0] 안전 숫자 포맷 — INVALID_PRICE/STOP/NaN/undefined → '-'
function safeLocale(v, suffix = '') {
  if (v == null || v === '' || String(v).startsWith('INVALID') || isNaN(Number(v))) return '-';
  const n = Number(v);
  return n.toLocaleString() + suffix;
}
function safeNum(v) {
  if (v == null || String(v).startsWith('INVALID')) return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

// [v9.0] PWA Web Push 구독용 — VAPID 공개키(base64url) -> Uint8Array 변환
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export default function PWADashboard({ latestReport }) {
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
  const [perf, setPerf] = useState(null); // [v8.7] 기록화면 성과 요약 (이번달 수익률/MDD/승률)
  const [expandedRec, setExpandedRec] = useState({}); // [v9.0] 추천 탭 왜 추천? 펼침
  const [expandedPos, setExpandedPos] = useState({}); // [v9.0] 보유 탭 왜? 펼침

  // [v9.0] 투자성향 프로필
  const [profile, setProfile] = useState({
    style: 'balanced',      // aggressive | balanced | conservative
    maxLoss: 10,
    investPeriod: 'mid',
    riskTolerance: 5,
  });
  const [onboarding, setOnboarding] = useState(false); // 최초 실행 온보딩

  // [v9.0] Splash Screen
  const [splash, setSplash] = useState(true);

  // [v9.0] PWA Web Push 구독 상태
  const [pushSupported, setPushSupported] = useState(false);
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushError, setPushError] = useState(null);
  const [pushBannerDismissed, setPushBannerDismissed] = useState(false);

  const router = useRouter();

  // [N1] 푸시 알림 딥링크 — URL 파라미터로 탭/종목 자동 설정
  useEffect(() => {
    if (!router.isReady) return;
    const { tab: tabParam, code, name } = router.query;
    if (tabParam) setTab(tabParam);
    if (code && name) {
      setSearchQuery(name);
      // 분석 자동 실행
      setTimeout(() => {
        setTab('analyze');
        setAnalyzeResult(null);
        setAnalyzing(true);
        fetch(`/api/pwa/analyze?code=${code}&name=${encodeURIComponent(name)}&trader_id=A`)
          .then(r => r.json())
          .then(d => { setAnalyzeResult(d); setAnalyzing(false); })
          .catch(() => setAnalyzing(false));
      }, 300);
    }
  }, [router.isReady, router.query]);

  useEffect(() => {
    setMounted(true);
    // [v9.0] Splash: 2초 후 해제
    const splashTimer = setTimeout(() => setSplash(false), 2000);
    // [v9.0] 투자성향 프로필 로드 — 없으면 온보딩 표시
    try {
      const saved = window.localStorage.getItem('onehub_profile');
      if (saved) {
        setProfile(p => ({ ...p, ...JSON.parse(saved) }));
      } else {
        // Splash 2초 후 온보딩 표시
        setTimeout(() => setOnboarding(true), 2100);
      }
    } catch (e) { /* 무시 */ }
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
    // [v9.0] PWA Web Push 지원여부 + 기존 구독상태 확인
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window) {
      setPushSupported(true);
      navigator.serviceWorker.register('/sw.js')
        .then(reg => reg.pushManager.getSubscription())
        .then(sub => setPushSubscribed(!!sub))
        .catch(() => {});
    }
    try {
      if (window.localStorage.getItem('onehub_push_banner_dismissed') === '1') {
        setPushBannerDismissed(true);
      }
    } catch (e) { /* 무시 */ }
    return () => clearTimeout(splashTimer);
  }, []);

  const saveProfile = useCallback((updates, closeOnboarding = false) => {
    setProfile(prev => {
      const next = { ...prev, ...updates };
      try { window.localStorage.setItem('onehub_profile', JSON.stringify(next)); } catch (e) {}
      return next;
    });
    if (closeOnboarding) setOnboarding(false);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(prev => {
      const next = prev === 'light' ? 'dark' : 'light';
      try { window.localStorage.setItem('onehub_theme', next); } catch (e) {}
      return next;
    });
  }, []);

  // [v9.0] PWA Web Push 구독 등록 — 텔레그램과 동일 내용을 폰 푸시로도 수신
  const subscribeToPush = useCallback(async () => {
    setPushBusy(true);
    setPushError(null);
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        throw new Error('이 브라우저는 푸시 알림을 지원하지 않습니다.');
      }
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        throw new Error('알림 권한이 거부되었습니다.');
      }
      const reg = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;

      const keyRes = await fetch('/api/push-vapid-key');
      const keyData = await keyRes.json();
      if (!keyData.ok || !keyData.key) throw new Error('VAPID 키 조회 실패');

      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(keyData.key),
        });
      }

      const subJson = sub.toJSON();
      const res = await fetch('/api/push-subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trader, endpoint: subJson.endpoint, keys: subJson.keys }),
      });
      const d = await res.json();
      if (!d.ok) throw new Error(d.error || '구독 등록 실패');

      setPushSubscribed(true);
      try { window.localStorage.setItem('onehub_push_banner_dismissed', '1'); } catch (e) {}
    } catch (e) {
      setPushError(String(e.message || e));
    } finally {
      setPushBusy(false);
    }
  }, [trader]);

  const dismissPushBanner = useCallback(() => {
    setPushBannerDismissed(true);
    try { window.localStorage.setItem('onehub_push_banner_dismissed', '1'); } catch (e) {}
  }, []);

  useEffect(() => {
    if (!mounted) return;
    fetch(`/api/pwa-dashboard?trader=${trader}`)
      .then(r => r.json())
      .then(d => { if (d.ok) setData(d); else setError(d.error || 'failed'); })
      .catch(e => setError(String(e)));
    fetch(`/api/pwa-performance?trader=${trader}&days=30`)
      .then(r => r.json())
      .then(d => { if (d.ok) setPerf(d); })
      .catch(() => {});
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
  // [v9.0] 공포탐욕지수 등급 — alternative.me 표준 구간(0-24/25-44/45-55/56-74/75-100)
  const fgTier = (f) => f == null ? null : f >= 75 ? 'extreme_greed' : f >= 56 ? 'greed' : f >= 45 ? 'neutral' : f >= 25 ? 'fear' : 'extreme_fear';
  const fgColor = (f) => { const t = fgTier(f); return (t === 'extreme_greed' || t === 'greed') ? 'var(--accent-buy)' : t === 'neutral' ? 'var(--accent-warn)' : 'var(--accent-sell)'; };
  const fgLabel = (f) => ({ extreme_greed: '극단적 탐욕', greed: '탐욕', neutral: '중립', fear: '공포', extreme_fear: '극단적 공포' }[fgTier(f)] || '-');
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
  const fearGreed = data?.market?.fear_greed ?? null;
  const vix = data?.market?.vix ?? null;
  const regimeDays = data?.market?.regime_days ?? null;
  const regime = data?.market?.regime ?? null;
  const heroAction = regime === 'BEAR' ? 'SELL' : regime === 'BULL' ? 'BUY' : null;

  // [v8.7] 3단 Hero — 오늘 행동 판단 (신규매수 / 추가매수 / 현금유지)
  // 오늘 행동 판단 — BEAR/BULL/SIDEWAYS 분기
  const actionNew   = regime === 'BULL' && (heat ?? 0) >= 40;
  const actionNewWarn = regime === 'SIDEWAYS';                   // SIDEWAYS: 신규매수 ⚠️
  const actionAdd   = regime === 'BULL' && (heat ?? 0) >= 60;
  const actionCash  = regime === 'BEAR' || (regime === 'SIDEWAYS') || (heat ?? 0) < 40;
  const heroWhy = [
    heat    !== null ? `Heat ${heatLabel(heat)} ${heat}점` : null,
    fearGreed !== null ? `공포탐욕 ${fearGreed}` : null,
    vix     !== null ? `VIX ${vix}` : null,
    regimeDays !== null ? `${regime} ${regimeDays}일째` : null,
  ].filter(Boolean).join(' · ');

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
      {/* [v9.0] Splash Screen */}
      {splash && (
        <div className="splash-screen">
          <div className="splash-logo">ONE-HUB</div>
          <div className="splash-sub">오늘 시장 분석 중...</div>
          <div className="splash-dots">
            <span /><span /><span />
          </div>
        </div>
      )}

      {/* [v9.0] 투자성향 온보딩 — 최초 실행 시 */}
      {onboarding && !splash && (
        <div className="onboarding-overlay">
          <div className="onboarding-card">
            <div className="onboarding-logo">ONE-HUB</div>
            <h2 className="onboarding-title">투자 성향을 선택하세요</h2>
            <p className="onboarding-desc">AI 판단 기준과 행동 지침이 성향에 맞게 조정됩니다.</p>
            <div className="onboarding-options">
              {[
                { key: 'conservative', icon: '🛡️', label: '보수형', desc: '안전 우선 · 손실 최소화 · 헤지/배당주 중심', sub: 'Risk 가중치 높음' },
                { key: 'balanced',     icon: '⚖️', label: '균형형', desc: '수익과 안전 균형 · 다양한 섹터 분산', sub: '기본값' },
                { key: 'aggressive',   icon: '🚀', label: '공격형', desc: '고수익 추구 · 성장주/모멘텀 집중', sub: 'ML 가중치 높음 · 적극 매매' },
              ].map(o => (
                <button
                  key={o.key}
                  className={`onboarding-opt ${profile.style === o.key ? 'selected' : ''}`}
                  onClick={() => saveProfile({ style: o.key })}
                >
                  <span className="onboarding-opt-icon">{o.icon}</span>
                  <div className="onboarding-opt-text">
                    <span className="onboarding-opt-label">{o.label}</span>
                    <span className="onboarding-opt-desc">{o.desc}</span>
                    <span className="onboarding-opt-sub">{o.sub}</span>
                  </div>
                </button>
              ))}
            </div>
            <button
              className="onboarding-confirm"
              onClick={() => saveProfile({}, true)}
            >
              시작하기 →
            </button>
          </div>
        </div>
      )}

      <div className={`pwa-wrapper theme-${theme}`} style={{ display: splash ? 'none' : undefined }}>
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
          {['dashboard','recommend','portfolio','report','profile'].map(t => (
            <button key={t} className={`pwa-tab ${tab===t?'active':''}`} onClick={()=>setTab(t)}>
              {t==='dashboard'?'홈':t==='recommend'?'추천':t==='portfolio'?'보유':t==='report'?'기록':'내 설정'}
            </button>
          ))}
        </nav>

        {error && <div className="pwa-error">Error: {error}</div>}

        {/* ── Dashboard Tab — "오늘 뭘 해야 하는가" 우선순위 ── */}
        {tab === 'dashboard' && (
          <main className="pwa-main">
            {/* [v9.0] PWA Web Push 알림 켜기 배너 */}
            {pushSupported && !pushSubscribed && !pushBannerDismissed && (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                padding: '10px 14px', marginBottom: 10, borderRadius: 'var(--radius-md, 12px)',
                background: 'var(--inset-bg, rgba(0,0,0,0.04))', border: '1px solid var(--border, rgba(0,0,0,0.08))',
              }}>
                <span style={{ fontSize: '0.78rem', lineHeight: 1.4, flex: 1 }}>
                  🔔 매수신호·리포트·손절익절 알림을 폰으로 바로 받아보세요
                </span>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button
                    onClick={subscribeToPush}
                    disabled={pushBusy}
                    style={{
                      padding: '6px 12px', fontSize: '0.74rem', fontWeight: 700,
                      borderRadius: 999, border: 'none', cursor: pushBusy ? 'default' : 'pointer',
                      background: 'var(--accent-buy)', color: '#fff', opacity: pushBusy ? 0.6 : 1,
                    }}
                  >
                    {pushBusy ? '처리 중...' : '켜기'}
                  </button>
                  <button
                    onClick={dismissPushBanner}
                    style={{
                      padding: '6px 10px', fontSize: '0.74rem', borderRadius: 999, border: 'none',
                      background: 'transparent', color: 'var(--text-tertiary)', cursor: 'pointer',
                    }}
                  >
                    나중에
                  </button>
                </div>
              </div>
            )}
            {pushError && (
              <div className="pwa-error" style={{ marginBottom: 10 }}>알림 설정 오류: {pushError}</div>
            )}
            {!data && !error && (
              <div className="pwa-loading">
                <div className="pwa-spinner" />
                <span>데이터 로딩 중...</span>
              </div>
            )}
            {data && (<>

              {/* [v9.0] Hero 카드 */}
              {(() => {
                const rColor = regime === 'BEAR' ? '#ef4444' : regime === 'BULL' ? '#22c55e' : '#f59e0b';
                const aiConf = data?.ai_confidence ?? heat;
                const verdictText = regime === 'BEAR' ? '🚫 관망' : regime === 'BULL' ? '📈 매수' : '🔍 선별매수';
                return (
                  <section className="hero-v9" style={{ borderColor: rColor }}>
                    {/* Regime 크게 */}
                    <div className="hero-v9-regime-row">
                      <span className="hero-v9-regime" style={{ color: rColor }}>
                        {regimeIcon(regime)} {regimeMarket(regime)}
                      </span>
                      {regimeDays !== null && (
                        <span className="hero-v9-days dim mono">{regimeDays}일째</span>
                      )}
                    </div>

                    {/* AI 신뢰도 */}
                    <div className="hero-v9-conf-row">
                      <div>
                        <span className="hero-v9-conf-label">AI 매수 확률</span>
                        <div style={{ fontSize: '0.65rem', color: 'var(--text-tertiary)', marginTop: 1 }}>(오늘 예측 신뢰도)</div>
                      </div>
                      <span className="hero-v9-conf-val" style={{ color: rColor }}>
                        {aiConf !== null ? `${aiConf}%` : '-'}
                      </span>
                    </div>

                    {/* 오늘 행동 */}
                    <div className="hero-v9-verdict-row">
                      <span className="hero-v9-verdict-label">오늘 행동</span>
                      <span className="hero-v9-verdict-badge" style={{
                        background: `${rColor}1a`,
                        color: rColor,
                        border: `1px solid ${rColor}55`,
                      }}>
                        {verdictText}
                      </span>
                    </div>

                    {/* 버튼 2개 */}
                    <div className="hero-v9-btns">
                      <button className="hero-v9-btn primary" onClick={() => setTab('report')}>
                        📋 오늘 리포트
                      </button>
                      <button className="hero-v9-btn secondary" onClick={() => setTab('recommend')}>
                        ⭐ 추천 보기
                      </button>
                    </div>
                  </section>
                );
              })()}

              {/* [v9.0][5] Action Card — 📋 오늘 해야 할 일 */}
              <section className="pwa-card action-card">
                <span className="pwa-card-label">📋 오늘 해야 할 일</span>
                <div className="action-grid">
                  {[
                    {
                      label: '신규매수',
                      ok:   regime === 'BULL',
                      warn: regime === 'SIDEWAYS',
                      no:   regime === 'BEAR',
                    },
                    {
                      label: '추가매수',
                      ok:   regime === 'BULL',
                      warn: false,
                      no:   regime !== 'BULL',
                    },
                    {
                      label: '물타기',
                      ok:   false,
                      warn: false,
                      no:   true,
                    },
                    {
                      label: '현금유지',
                      ok:   regime === 'BEAR' || regime === 'SIDEWAYS',
                      warn: false,
                      no:   regime === 'BULL',
                    },
                  ].map(({ label, ok, warn, no }) => (
                    <div key={label} className={`action-item ${ok ? 'act-yes' : warn ? 'act-warn' : 'act-no'}`}>
                      <span className="action-icon">{ok ? '✅' : warn ? '⚠️' : '❌'}</span>
                      <span className="action-label">{label}</span>
                    </div>
                  ))}
                </div>
              </section>

              {/* [v9.0][6] AI 판단 근거 카드 */}
              {regime && (() => {
                const h  = heat      ?? 50;
                const fg = fearGreed ?? 50;
                const v  = vix       ?? 18;

                // BUY/SELL/WAIT 확률
                let buyP, sellP, waitP;
                if (regime === 'BULL') {
                  buyP  = Math.round(40 + (h / 100) * 35);
                  sellP = Math.round(5  + ((100 - fg) / 100) * 10);
                } else if (regime === 'BEAR') {
                  sellP = Math.round(40 + ((100 - h) / 100) * 35);
                  buyP  = Math.round(5  + (fg / 100) * 10);
                } else {
                  waitP = Math.round(45 + ((50 - Math.abs(h - 50)) / 50) * 20);
                  buyP  = Math.round((100 - waitP) * (h / 100));
                  sellP = 100 - buyP - waitP;
                }
                buyP  = Math.max(0, Math.min(buyP  ?? 0, 100));
                sellP = Math.max(0, Math.min(sellP ?? 0, 100));
                waitP = Math.max(0, 100 - buyP - sellP);

                // 조건 기반 판단 이유 자동 생성
                const actionLabel = regime === 'BULL' ? '매수한' : '관망한';
                const reasons = [];
                if (regime === 'BEAR')              reasons.push('BEAR 레짐 — 전체 시장 하락 국면');
                if (fg < 20)                        reasons.push(`공포탐욕 ${fg} — 극단적 공포 구간`);
                if (heat !== null && heat < 30)     reasons.push(`Heat ${heat}점 — 시장 투자온도 낮음`);
                if (vix  !== null && vix >= 25)     reasons.push(`VIX ${vix} — 변동성 급등 경고`);
                if (fearGreed !== null && fg >= 80) reasons.push(`공포탐욕 ${fg} — 극단적 탐욕, 과열 주의`);
                if (reasons.length === 0 && regime === 'SIDEWAYS') reasons.push('뚜렷한 방향 없음 — 선별적 접근 권장');
                if (reasons.length === 0)           reasons.push('종합 지표 정상 범위 — AI 매매 기준 충족');

                return (
                  <section className="pwa-card ai-basis-card">
                    <span className="pwa-card-label">🧠 AI 판단 근거</span>

                    {/* 지표 3개 + 방향 화살표 */}
                    <div className="ai-basis-metrics" style={{ marginBottom: 14 }}>
                      {[
                        { label: 'VIX',    val: vix,      dir: v >= 20 ? '↑' : '↓', color: v >= 25 ? 'var(--accent-sell)' : v >= 20 ? 'var(--accent-warn)' : 'var(--accent-buy)' },
                        { label: 'Fear&Greed', val: fearGreed, dir: fg >= 50 ? '↑' : '↓', color: fgColor(fearGreed) },
                        { label: 'Heat',   val: heat,     dir: h >= 50 ? '↑' : '↓', color: heatColor(heat) },
                      ].map(m => m.val !== null && (
                        <div key={m.label} className="ai-basis-metric">
                          <span className="ai-basis-metric-label">{m.label}</span>
                          <span className="ai-basis-metric-val mono" style={{ color: m.color }}>
                            {m.val} <span className="ai-arrow">{m.dir}</span>
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* BUY / WAIT / SELL 확률 바 */}
                    <div className="ai-basis-bars">
                      {[
                        { label: 'BUY',  pct: buyP,  color: '#22c55e' },
                        { label: 'WAIT', pct: waitP, color: '#f59e0b' },
                        { label: 'SELL', pct: sellP, color: '#ef4444' },
                      ].map(b => (
                        <div key={b.label} className="ai-basis-bar-row">
                          <span className="ai-basis-bar-label mono">{b.label}</span>
                          <div className="ai-basis-bar-track">
                            <div className="ai-basis-bar-fill" style={{ width: `${b.pct}%`, background: b.color }} />
                          </div>
                          <span className="ai-basis-bar-pct mono" style={{ color: b.color }}>{b.pct}%</span>
                        </div>
                      ))}
                    </div>

                    {/* 판단 요약 ①②③ */}
                    <div className="ai-reasons">
                      <span className="ai-reasons-title">AI가 오늘 {actionLabel} 이유</span>
                      {reasons.slice(0, 3).map((r, i) => (
                        <div key={i} className="ai-reason-row">
                          <span className="ai-reason-num">{'①②③'[i]}</span>
                          <span className="ai-reason-text">{r}</span>
                        </div>
                      ))}
                    </div>
                  </section>
                );
              })()}

              {/* [v9.0] 투자성향 배지 */}
              <div className="profile-badge-row">
                <span className="profile-badge-label">
                  현재 투자성향:&nbsp;
                  <strong>{profile.style === 'conservative' ? '🛡️ 보수형' : profile.style === 'aggressive' ? '🚀 공격형' : '⚖️ 균형형'}</strong>
                </span>
                <button className="profile-badge-change" onClick={() => setTab('profile')}>변경 →</button>
              </div>

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
                    {[...new Map((data.today_blocked||[]).map(b=>[b.stock,b])).values()].slice(0,3).map((b,i) => (
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

        {/* ── Recommend Tab ── [v9.0] AI 매수 선별 전 기술 스코어링 상위 후보 — 실거래와 분리된 관심종목 전용 화면 */}
        {tab === 'recommend' && (
          <main className="pwa-main">
            <section className="pwa-card">
              <span className="pwa-card-label">🔍 추천 관심종목</span>
              <p className="dim" style={{fontSize:'0.72rem', marginBottom:10, lineHeight:1.5}}>
                AI 매수 선별 전 기술 스코어링 상위 후보입니다. 실제 매수 신호와는 별개입니다.
              </p>
              {!data && !error && (
                <div className="pwa-loading"><div className="pwa-spinner" /><span>데이터 로딩 중...</span></div>
              )}
              {data && (!data.screening_candidates || data.screening_candidates.length === 0) && (
                <div className="pwa-empty">오늘 스캔된 관심종목이 없습니다.</div>
              )}
              {data && data.screening_candidates && data.screening_candidates.length > 0 && (() => {
                const sorted = [...data.screening_candidates].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
                const buyList  = sorted.filter(s => (s.score ?? 0) >= 6);
                const watchList= sorted.filter(s => (s.score ?? 0) >= 4 && (s.score ?? 0) < 6);
                const obsList  = sorted.filter(s => (s.score ?? 0) < 4);
                const renderGroup = (label, icon, color, list) => list.length === 0 ? null : (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: '0.72rem', fontWeight: 700, color, marginBottom: 6 }}>
                      {icon} {label} ({list.length})
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {list.map((s, i) => {
                        const sc = Math.round(s.score ?? 0);
                        const aiPct = Math.min(100, Math.round(sc * 1.8));
                        const key = s.code || i;
                        const isExp = !!expandedRec[key];
                        return (
                          <div key={key} className="pwa-card" style={{ padding: '10px 14px', margin: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <button
                                className="pwa-search-item"
                                style={{ flex: 1, textAlign: 'left', padding: 0, background: 'none', border: 'none' }}
                                onClick={() => { setTab('analyze'); runAnalyze(s.code, s.name); }}
                              >
                                <span className="pwa-si-name">{s.name}</span>
                                <span className="pwa-si-code mono dim" style={{ marginLeft: 6 }}>{s.code}</span>
                              </button>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                                <span className="mono" style={{ fontSize: '0.72rem', color, fontWeight: 700 }}>AI Score {sc}</span>
                                <button
                                  style={{ fontSize: '0.68rem', padding: '2px 8px', borderRadius: 8, background: isExp ? '#2563eb' : 'var(--inset-bg)', color: isExp ? '#fff' : 'var(--text-secondary)', border: '1px solid var(--border)', cursor: 'pointer', fontFamily: 'var(--font-body)', whiteSpace: 'nowrap' }}
                                  onClick={() => setExpandedRec(prev => ({ ...prev, [key]: !isExp }))}
                                >
                                  왜 추천?
                                </button>
                              </div>
                            </div>
                            {/* 매수 확률 + 등락 */}
                            <div style={{ display: 'flex', gap: 10, marginTop: 4, fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>
                              <span className="mono">매수확률 {aiPct}%</span>
                              {s.change_1d != null && (
                                <span className="mono" style={{ color: s.change_1d >= 0 ? 'var(--accent-buy)' : 'var(--accent-sell)' }}>
                                  {s.change_1d >= 0 ? '+' : ''}{s.change_1d}%
                                </span>
                              )}
                            </div>
                            {/* 펼침 상세 */}
                            {isExp && (
                              <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                                {[
                                  { label: 'ML 점수', value: s.ml_score != null ? `${s.ml_score}점` : '-' },
                                  { label: 'RSI',     value: s.rsi     != null ? s.rsi      : '-' },
                                  { label: 'ATR',     value: s.atr     != null ? s.atr      : '-' },
                                  { label: '최종점수', value: `${sc}점` },
                                ].map(m => (
                                  <div key={m.label} style={{ background: 'var(--inset-bg)', borderRadius: 8, padding: '6px 10px' }}>
                                    <div style={{ fontSize: '0.65rem', color: 'var(--text-tertiary)' }}>{m.label}</div>
                                    <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{m.value}</div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
                return (
                  <>
                    {renderGroup('매수 후보', '🟢', '#2e7d32', buyList)}
                    {renderGroup('관심 종목', '🟡', '#f57c00', watchList)}
                    {renderGroup('관찰 종목', '⚪', '#757575', obsList)}
                  </>
                );
              })()}
              <button className="pwa-link-btn" onClick={() => setTab('analyze')}>
                다른 종목 직접 검색 →
              </button>
            </section>
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
                      <span className="mono bull">{safeLocale(analyzeResult.target, '원')}</span>
                    </div>
                    <div className="pwa-price-item">
                      <span className="dim">손절가</span>
                      <span className="mono bear">{safeLocale(analyzeResult.stop_loss, '원')}</span>
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
                          {safeNum(p.target) > 0 && (
                            <div className="position-card-cell">
                              <span className="dim">목표가</span>
                              <span className="bull">{safeLocale(p.target, '원')}</span>
                            </div>
                          )}
                          {safeNum(p.stop_loss) > 0 && (
                            <div className="position-card-cell">
                              <span className="dim">손절가</span>
                              <span className="bear">{safeLocale(p.stop_loss, '원')}</span>
                            </div>
                          )}
                        </div>
                        {(() => {
                          const cur = safeNum(p.current_price) ?? 0;
                          const avg = safeNum(p.avg_price) ?? 0;
                          const tgt = safeNum(p.target) ?? 0;
                          const stp = safeNum(p.stop_loss) ?? 0;
                          const pnlR = p.pnl_rate ?? 0;
                          let badge = null;
                          if (tgt > 0 && cur >= tgt)        badge = { label: '손절', color: '#ef4444', icon: '🔴', bg: '#fef2f2' };
                          else if (stp > 0 && cur <= stp)   badge = { label: '손절', color: '#ef4444', icon: '🔴', bg: '#fef2f2' };
                          else if (pnlR >= 5)                badge = { label: '추가매수', color: '#2563eb', icon: '🔵', bg: '#eff6ff' };
                          else if (avg > 0 && cur < avg * 0.97) badge = { label: '관망', color: '#f59e0b', icon: '🟡', bg: '#fffbeb' };
                          else                               badge = { label: '보유', color: '#22c55e', icon: '🟢', bg: '#f0fdf4' };
                          const posKey = p.code || i;
                          const isPosExp = !!expandedPos[posKey];
                          return (
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
                                <span style={{ fontSize: '0.78rem', fontWeight: 700, padding: '3px 10px', borderRadius: 8, background: badge.bg, color: badge.color }}>
                                  {badge.icon} {badge.label}
                                </span>
                                <button
                                  style={{ fontSize: '0.68rem', padding: '3px 10px', borderRadius: 8, background: isPosExp ? '#2563eb' : 'var(--inset-bg)', color: isPosExp ? '#fff' : 'var(--text-secondary)', border: '1px solid var(--border)', cursor: 'pointer', fontFamily: 'var(--font-body)' }}
                                  onClick={() => setExpandedPos(prev => ({ ...prev, [posKey]: !isPosExp }))}
                                >
                                  왜?
                                </button>
                              </div>
                              {isPosExp && (
                                <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                                  {[
                                    { label: 'RSI',    value: p.rsi   != null ? p.rsi   : '-' },
                                    { label: 'MACD',   value: p.macd  != null ? p.macd  : '-' },
                                    { label: 'ATR',    value: p.atr   != null ? p.atr   : '-' },
                                    { label: 'ML점수', value: p.ml_score != null ? `${p.ml_score}점` : '-' },
                                  ].map(m => (
                                    <div key={m.label} style={{ background: 'var(--inset-bg)', borderRadius: 8, padding: '6px 10px' }}>
                                      <div style={{ fontSize: '0.65rem', color: 'var(--text-tertiary)' }}>{m.label}</div>
                                      <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{m.value}</div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })()}
                        {p.entry_hypothesis && (
                          <div className="position-card-ai">
                            <span className="position-card-ai-label">🤖 AI 가설</span>
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
                  : <div className="pwa-blocked-list">{[...new Map(data.today_blocked.map(b=>[b.stock,b])).values()].slice(0,5).map((b,i) => (
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

            {/* [v9.0] 이번 주 AI 요약 카드 */}
            <section className="pwa-card">
              <span className="pwa-card-label">📊 이번 주 AI 요약</span>
              {!perf ? (
                <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
                  이번 주 데이터 수집 중...
                </div>
              ) : (
                <div style={{ marginTop: 10 }}>
                  <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: 12, lineHeight: 1.6 }}>
                    AI는 이번 주<br/>
                    <strong style={{ color: 'var(--accent-sell)' }}>🚫 {perf.losses ?? 0}종목 차단</strong>
                    {'  '}
                    <strong style={{ color: 'var(--accent-buy)' }}>✅ {perf.wins ?? 0}종목 매수</strong>
                    {'  '}
                    <strong style={{ color: 'var(--text-secondary)' }}>📉 손절 {perf.losses ?? 0}건</strong>
                  </p>
                  {/* 승률 바 */}
                  {perf.win_rate != null && (
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: 4 }}>
                        <span style={{ color: 'var(--text-secondary)' }}>승률</span>
                        <span className="mono" style={{ color: 'var(--accent-buy)', fontWeight: 700 }}>{perf.win_rate}%</span>
                      </div>
                      <div style={{ height: 8, background: 'var(--inset-bg)', borderRadius: 4, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${perf.win_rate}%`, background: 'var(--accent-buy)', borderRadius: 4 }} />
                      </div>
                    </div>
                  )}
                  {perf.avg_pnl_pct != null && (
                    <div style={{ fontSize: '0.82rem', color: perf.avg_pnl_pct >= 0 ? 'var(--accent-buy)' : 'var(--accent-sell)', fontWeight: 700 }}>
                      수익률 {perf.avg_pnl_pct >= 0 ? '+' : ''}{perf.avg_pnl_pct}%
                    </div>
                  )}
                </div>
              )}
            </section>

            {latestReport && latestReport.insight && (
              <section className="pwa-card">
                <span className="pwa-card-label">📅 오늘의 리포트 — {latestReport.date}</span>
                <p className="pwa-analyze-text" style={{marginTop:8}}>{latestReport.insight}</p>
                <p className="dim mono" style={{fontSize:'0.7rem', marginTop:8}}>
                  {latestReport.regime} · 매매 {latestReport.trade_count}건 · 차단 {latestReport.block_count}건
                </p>
              </section>
            )}
            {perf && (
              <section className="pwa-card">
                <span className="pwa-card-label">📅 최근 30일 성과</span>
                {perf.total < 5 ? (
                  <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--text-secondary)' }}>
                    <div style={{ fontSize: '1.5rem', marginBottom: 6 }}>📊</div>
                    <div style={{ fontSize: '0.85rem' }}>데이터 수집 중</div>
                    <div style={{ fontSize: '0.75rem', marginTop: 4, color: 'var(--text-muted)' }}>
                      {perf.total}건 / 최소 5건 이상 거래 후 통계가 표시됩니다
                    </div>
                  </div>
                ) : (
                  <div className="pwa-balance-grid">
                    <div className="pwa-bal-item">
                      <span className="dim">평균수익률</span>
                      <span className={`mono ${perf.avg_pnl_pct>=0?'bull':'bear'}`}>
                        {perf.avg_pnl_pct>=0?'+':''}{perf.avg_pnl_pct}%
                      </span>
                    </div>
                    <div className="pwa-bal-item">
                      <span className="dim">MDD</span>
                      <span className="mono bear">-{perf.mdd}%</span>
                    </div>
                    <div className="pwa-bal-item">
                      <span className="dim">승률</span>
                      <span className="mono">{perf.win_rate}% ({perf.wins}승 {perf.losses}패)</span>
                    </div>
                    <div className="pwa-bal-item">
                      <span className="dim">누적손익</span>
                      <span className={`mono ${perf.total_pnl>=0?'bull':'bear'}`}>
                        {perf.total_pnl>=0?'+':''}{Number(perf.total_pnl).toLocaleString()}원
                      </span>
                    </div>
                    <div className="pwa-bal-item">
                      <span className="dim">샤프지수</span>
                      <span className={`mono ${(perf.sharpe||0)>=1?'bull':(perf.sharpe||0)>=0?'':'bear'}`}>
                        {perf.sharpe ?? '-'}
                      </span>
                    </div>
                    <div className="pwa-bal-item">
                      <span className="dim">손익비</span>
                      <span className="mono">{perf.rr_ratio}</span>
                    </div>
                  </div>
                )}
              </section>
            )}
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
            {data && (<>
              <section className="pwa-card">
                <span className="pwa-card-label">오늘 요약</span>
                <div className="pwa-report-summary">
                  <div className="pwa-rs-row"><span className="dim">Regime</span><span className={`mono ${regimeClass(data.market?.regime)}`}>{data.market?.regime}</span></div>
                  <div className="pwa-rs-row"><span className="dim">Heat</span><span className="mono" style={{color: heatColor(heat)}}>{heat ?? '-'}/100{heat != null ? ` (${heatLabel(heat)})` : ''}</span></div>
                  <div className="pwa-rs-row"><span className="dim">공포탐욕</span><span className="mono" style={{color: fgColor(fearGreed)}}>{fearGreed ?? '-'}{fearGreed != null ? ` (${fgLabel(fearGreed)})` : ''}</span></div>
                  <div className="pwa-rs-row"><span className="dim">매수</span><span className="mono bull">{buyCount}건</span></div>
                  <div className="pwa-rs-row"><span className="dim">차단</span><span className="mono bear">{blockCount}건</span></div>
                  <div className="pwa-rs-row"><span className="dim">실현손익</span><span className={`mono ${(data.balance?.realized_pnl??0)>=0?'bull':'bear'}`}>{data.balance?.realized_pnl?.toLocaleString() ?? 0}원</span></div>
                </div>
              </section>

              {/* AI 정확도 링크 */}
              <Link href="/pwa/accuracy" style={{textDecoration:'none', color:'inherit'}}>
                <section className="pwa-card" style={{cursor:'pointer'}}>
                  <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                    <div>
                      <div style={{fontWeight:700, fontSize:14}}>🎯 AI 차단 정확도</div>
                      <div style={{fontSize:12, color:'var(--text-muted)', marginTop:4}}>
                        차단 신호 적중률 · 사유별 분석 · 최근 내역
                      </div>
                    </div>
                    <span style={{fontSize:20, color:'var(--text-muted)'}}>›</span>
                  </div>
                </section>
              </Link>
            </>)}
          </main>
        )}

        {/* ── Profile Tab — 투자성향 설정 ── */}
        {tab === 'profile' && (
          <main className="pwa-main">

            {/* 성향 선택 카드 */}
            <section className="pwa-card">
              <span className="pwa-card-label">투자 성향</span>
              <p className="dim" style={{ fontSize:'0.74rem', marginBottom:12, lineHeight:1.5 }}>
                성향에 맞게 Hero 행동 지침과 AI 판단 기준이 조정됩니다.
              </p>
              <div className="profile-style-grid">
                {[
                  { key:'conservative', label:'방어형', icon:'🛡️', desc:'안전 우선. 헤지·배당주 중심, 손실 최소화.' },
                  { key:'balanced',     label:'중립형', icon:'⚖️', desc:'수익과 안전 균형. 다양한 섹터 분산.' },
                  { key:'aggressive',   label:'공격형', icon:'🚀', desc:'고수익 추구. 성장주·모멘텀 집중.' },
                ].map(s => (
                  <button
                    key={s.key}
                    className={`profile-style-card ${profile.style === s.key ? 'selected' : ''}`}
                    onClick={() => saveProfile({ style: s.key })}
                  >
                    <span className="profile-style-icon">{s.icon}</span>
                    <span className="profile-style-label">{s.label}</span>
                    <span className="profile-style-desc">{s.desc}</span>
                  </button>
                ))}
              </div>
            </section>

            {/* 세부 설정 */}
            <section className="pwa-card">
              <span className="pwa-card-label">세부 설정</span>

              {/* 최대 허용 손실 */}
              <div className="profile-row">
                <div className="profile-row-top">
                  <span className="profile-row-label">최대 허용 손실</span>
                  <span className="profile-row-val mono" style={{ color:'var(--accent-sell)' }}>-{profile.maxLoss}%</span>
                </div>
                <input
                  type="range" min={3} max={30} step={1}
                  value={profile.maxLoss}
                  onChange={e => saveProfile({ maxLoss: Number(e.target.value) })}
                  className="profile-slider"
                />
                <div className="profile-slider-hint">
                  <span>안전 (-3%)</span><span>표준 (-10%)</span><span>공격 (-30%)</span>
                </div>
              </div>

              {/* 투자 기간 */}
              <div className="profile-row" style={{ marginTop:16 }}>
                <span className="profile-row-label">투자 기간</span>
                <div className="profile-period-btns">
                  {[
                    { key:'short', label:'단기 (1개월 미만)' },
                    { key:'mid',   label:'중기 (1~6개월)' },
                    { key:'long',  label:'장기 (6개월 이상)' },
                  ].map(p => (
                    <button
                      key={p.key}
                      className={`profile-period-btn ${profile.investPeriod === p.key ? 'selected' : ''}`}
                      onClick={() => saveProfile({ investPeriod: p.key })}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 리스크 감내도 */}
              <div className="profile-row" style={{ marginTop:16 }}>
                <div className="profile-row-top">
                  <span className="profile-row-label">리스크 감내도</span>
                  <span className="profile-row-val mono">{profile.riskTolerance}/10</span>
                </div>
                <input
                  type="range" min={1} max={10} step={1}
                  value={profile.riskTolerance}
                  onChange={e => saveProfile({ riskTolerance: Number(e.target.value) })}
                  className="profile-slider"
                />
                <div className="profile-slider-hint">
                  <span>낮음</span><span>중간</span><span>높음</span>
                </div>
              </div>
            </section>

            {/* 현재 설정 요약 */}
            <section className="pwa-card" style={{ background:'var(--inset-bg)' }}>
              <span className="pwa-card-label">현재 프로필 요약</span>
              <div className="profile-summary">
                <div className="profile-sum-row">
                  <span className="dim">투자 성향</span>
                  <span className="mono" style={{ fontWeight:700 }}>
                    {profile.style === 'conservative' ? '🛡️ 방어형' : profile.style === 'aggressive' ? '🚀 공격형' : '⚖️ 중립형'}
                  </span>
                </div>
                <div className="profile-sum-row">
                  <span className="dim">최대 손실 허용</span>
                  <span className="mono bear">-{profile.maxLoss}%</span>
                </div>
                <div className="profile-sum-row">
                  <span className="dim">투자 기간</span>
                  <span className="mono">{profile.investPeriod === 'short' ? '단기' : profile.investPeriod === 'long' ? '장기' : '중기'}</span>
                </div>
                <div className="profile-sum-row">
                  <span className="dim">리스크 감내도</span>
                  <span className="mono">{profile.riskTolerance}/10</span>
                </div>
              </div>
              <p className="dim" style={{ fontSize:'0.7rem', marginTop:10, lineHeight:1.5 }}>
                * 설정은 이 기기에 저장됩니다. AI 매수 기준은 서버 설정을 따릅니다.
              </p>
            </section>

            {/* Trader 전환 + 테마 */}
            <section className="pwa-card">
              <span className="pwa-card-label">앱 설정</span>
              <div className="profile-app-row">
                <span>Trader 계정</span>
                <div className="pwa-trader-toggle" style={{ margin:0 }}>
                  <button className={trader==='A'?'active':''} onClick={()=>setTrader('A')}>A</button>
                  <button className={trader==='B'?'active':''} onClick={()=>setTrader('B')}>B</button>
                </div>
              </div>
              <div className="profile-app-row" style={{ marginTop:10 }}>
                <span>테마</span>
                <button className="pwa-theme-toggle" onClick={toggleTheme} style={{ fontSize:'1.2rem', background:'none', border:'none', cursor:'pointer' }}>
                  {theme === 'light' ? '🌙 다크' : '☀️ 라이트'}
                </button>
              </div>
            </section>

          </main>
        )}

        <footer className="pwa-footer">
          <Link href="/" style={{ fontSize: 11, color: 'var(--text-tertiary)', textDecoration: 'none', opacity: 0.6 }}>
            onehub.kr
          </Link>
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

        /* [v9.0] Splash Screen */
        .splash-screen { position: fixed; inset: 0; z-index: 9999; background: #2563eb; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; }
        .splash-logo { font-family: 'Syne', sans-serif; font-size: 2.4rem; font-weight: 800; color: #fff; letter-spacing: 0.05em; }
        .splash-sub { font-size: 0.9rem; color: rgba(255,255,255,0.75); font-family: 'Pretendard', sans-serif; }
        .splash-dots { display: flex; gap: 8px; }
        .splash-dots span { width: 8px; height: 8px; border-radius: 50%; background: rgba(255,255,255,0.6); animation: splash-bounce 1.2s infinite ease-in-out; }
        .splash-dots span:nth-child(2) { animation-delay: 0.2s; }
        .splash-dots span:nth-child(3) { animation-delay: 0.4s; }
        @keyframes splash-bounce { 0%,80%,100%{transform:scale(0.8);opacity:0.5} 40%{transform:scale(1.2);opacity:1} }

        /* [v9.0] Onboarding Gate */
        .onboarding-overlay { position: fixed; inset: 0; z-index: 9000; background: rgba(15,23,42,0.72); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; padding: 20px; }
        .onboarding-card { background: var(--card-bg); border: 1px solid var(--border); border-radius: var(--radius-card); padding: 28px 22px 24px; max-width: 400px; width: 100%; box-shadow: 0 20px 60px rgba(0,0,0,0.3); }
        .onboarding-logo { font-family: var(--font-display); font-size: 1.1rem; font-weight: 800; color: #2563eb; letter-spacing: 0.15em; margin-bottom: 12px; }
        .onboarding-title { font-size: 1.15rem; font-weight: 700; color: var(--text-primary); margin: 0 0 6px; }
        .onboarding-desc { font-size: 0.8rem; color: var(--text-secondary); margin: 0 0 18px; line-height: 1.5; }
        .onboarding-options { display: flex; flex-direction: column; gap: 10px; margin-bottom: 20px; }
        .onboarding-opt { display: flex; align-items: flex-start; gap: 12px; padding: 13px 14px; border-radius: var(--radius-md); border: 1.5px solid var(--border); background: var(--inset-bg); cursor: pointer; text-align: left; font-family: var(--font-body); transition: border-color 0.15s, background 0.15s; }
        .onboarding-opt.selected { border-color: #2563eb; background: color-mix(in srgb, #2563eb 10%, var(--card-bg)); }
        .onboarding-opt-icon { font-size: 1.4rem; flex-shrink: 0; margin-top: 2px; }
        .onboarding-opt-text { display: flex; flex-direction: column; gap: 2px; }
        .onboarding-opt-label { font-size: 0.88rem; font-weight: 700; color: var(--text-primary); }
        .onboarding-opt-desc { font-size: 0.76rem; color: var(--text-secondary); line-height: 1.4; }
        .onboarding-opt-sub { font-size: 0.7rem; color: var(--text-tertiary); font-style: italic; }
        .onboarding-confirm { width: 100%; padding: 12px; background: #2563eb; color: #fff; border: none; border-radius: var(--radius-md); font-size: 0.9rem; font-weight: 700; cursor: pointer; font-family: var(--font-body); }

        /* [v9.0] Hero 카드 v9 — Regime 크게 + AI Confidence + 오늘행동 + 버튼2 */
        .hero-v9 { background: var(--hero-bg); border: 2px solid var(--border); border-radius: var(--radius-card); padding: 22px 20px 18px; box-shadow: var(--card-shadow); display: flex; flex-direction: column; gap: 12px; }
        .hero-v9-regime-row { display: flex; align-items: baseline; justify-content: space-between; }
        .hero-v9-regime { font-family: var(--font-display); font-size: 2rem; font-weight: 800; line-height: 1.1; }
        .hero-v9-days { font-size: 0.75rem; color: var(--text-tertiary); }
        .hero-v9-conf-row { display: flex; align-items: center; justify-content: space-between; padding: 8px 0; border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); }
        .hero-v9-conf-label { font-size: 0.75rem; color: var(--text-tertiary); font-weight: 600; letter-spacing: 0.04em; }
        .hero-v9-conf-val { font-family: var(--font-mono); font-size: 1.3rem; font-weight: 800; }
        .hero-v9-verdict-row { display: flex; align-items: center; justify-content: space-between; }
        .hero-v9-verdict-label { font-size: 0.75rem; color: var(--text-tertiary); font-weight: 600; }
        .hero-v9-verdict-badge { font-size: 0.8rem; font-weight: 700; padding: 5px 14px; border-radius: var(--radius-pill); }
        .hero-v9-btns { display: flex; gap: 8px; margin-top: 4px; }
        .hero-v9-btn { flex: 1; padding: 10px 0; border-radius: var(--radius-md); font-size: 0.82rem; font-weight: 700; cursor: pointer; border: none; font-family: var(--font-body); }
        .hero-v9-btn.primary { background: #2563eb; color: #fff; }
        .hero-v9-btn.secondary { background: var(--inset-bg); color: var(--text-secondary); border: 1px solid var(--border); }

        /* [v9.0] Action Card */
        .action-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin-top: 10px; }
        .action-item { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-radius: var(--radius-md); border: 1px solid var(--border); }
        .action-item.act-yes { background: color-mix(in srgb, var(--accent-buy) 8%, var(--card-bg)); border-color: color-mix(in srgb, var(--accent-buy) 25%, var(--border)); }
        .action-item.act-no  { background: var(--inset-bg); }
        .action-item.act-warn { background: color-mix(in srgb, var(--accent-warn) 8%, var(--card-bg)); border-color: color-mix(in srgb, var(--accent-warn) 25%, var(--border)); }
        .action-icon { font-size: 1rem; line-height: 1; }
        .action-label { font-size: 0.78rem; font-weight: 600; color: var(--text-primary); }

        /* [v9.0] AI 판단 근거 카드 */
        .ai-basis-bars { display: flex; flex-direction: column; gap: 8px; margin: 10px 0 14px; }
        .ai-basis-bar-row { display: flex; align-items: center; gap: 8px; }
        .ai-basis-bar-label { font-size: 0.7rem; font-weight: 700; width: 32px; color: var(--text-secondary); }
        .ai-basis-bar-track { flex: 1; height: 7px; background: var(--inset-bg); border-radius: 4px; overflow: hidden; }
        .ai-basis-bar-fill { height: 100%; border-radius: 4px; transition: width 0.6s ease; }
        .ai-basis-bar-pct { font-size: 0.72rem; width: 36px; text-align: right; }
        .ai-basis-metrics { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; padding-top: 12px; border-top: 1px solid var(--border); }
        .ai-basis-metric { display: flex; flex-direction: column; gap: 2px; }
        .ai-basis-metric-label { font-size: 0.66rem; color: var(--text-tertiary); }
        .ai-basis-metric-val { font-size: 0.9rem; font-weight: 700; color: var(--text-primary); }
        .ai-arrow { font-size: 0.75rem; opacity: 0.7; }
        .ai-reasons { margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border); display: flex; flex-direction: column; gap: 6px; }
        .ai-reasons-title { font-size: 0.68rem; font-weight: 700; color: var(--text-tertiary); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 2px; }
        .ai-reason-row { display: flex; align-items: flex-start; gap: 8px; }
        .ai-reason-num { font-size: 0.8rem; color: #2563eb; font-weight: 700; flex-shrink: 0; }
        .ai-reason-text { font-size: 0.78rem; color: var(--text-secondary); line-height: 1.4; }

        /* [v9.0] Profile Tab */
        /* 투자성향 배지 */
        .profile-badge-row { display: flex; align-items: center; justify-content: space-between; padding: 8px 14px; background: color-mix(in srgb, #2563eb 8%, var(--card-bg)); border: 1px solid color-mix(in srgb, #2563eb 20%, var(--border)); border-radius: var(--radius-md); }
        .profile-badge-label { font-size: 0.78rem; color: var(--text-secondary); }
        .profile-badge-label strong { color: var(--text-primary); }
        .profile-badge-change { background: none; border: none; font-size: 0.75rem; color: #2563eb; cursor: pointer; font-weight: 700; font-family: var(--font-body); padding: 0; }

        .profile-style-grid { display: flex; flex-direction: column; gap: 8px; }
        .profile-style-card { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-radius: var(--radius-md); border: 2px solid var(--border); background: var(--inset-bg); cursor: pointer; text-align: left; transition: border-color 0.15s, background 0.15s; }
        .profile-style-card.selected { border-color: #2563eb; background: color-mix(in srgb, #2563eb 8%, var(--card-bg)); }
        .profile-style-icon { font-size: 1.4rem; flex-shrink: 0; }
        .profile-style-label { font-size: 0.9rem; font-weight: 700; color: var(--text-primary); flex-shrink: 0; width: 44px; }
        .profile-style-desc { font-size: 0.72rem; color: var(--text-secondary); line-height: 1.4; }
        .profile-row { display: flex; flex-direction: column; gap: 6px; }
        .profile-row-top { display: flex; justify-content: space-between; align-items: center; }
        .profile-row-label { font-size: 0.82rem; font-weight: 600; color: var(--text-primary); }
        .profile-row-val { font-size: 0.88rem; }
        .profile-slider { width: 100%; accent-color: #2563eb; cursor: pointer; }
        .profile-slider-hint { display: flex; justify-content: space-between; font-size: 0.64rem; color: var(--text-tertiary); margin-top: 2px; }
        .profile-period-btns { display: flex; flex-direction: column; gap: 6px; margin-top: 6px; }
        .profile-period-btn { padding: 9px 14px; border-radius: var(--radius-sm); border: 1.5px solid var(--border); background: var(--inset-bg); color: var(--text-secondary); font-size: 0.8rem; cursor: pointer; text-align: left; font-family: var(--font-body); }
        .profile-period-btn.selected { border-color: #2563eb; color: #2563eb; background: color-mix(in srgb, #2563eb 8%, var(--card-bg)); font-weight: 700; }
        .profile-summary { display: flex; flex-direction: column; gap: 8px; margin-top: 8px; }
        .profile-sum-row { display: flex; justify-content: space-between; align-items: center; font-size: 0.82rem; }
        .profile-app-row { display: flex; justify-content: space-between; align-items: center; font-size: 0.84rem; color: var(--text-primary); }
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
        .hero-pick-rank { font-size: 0.85rem; }
        .position-card-action-badge { font-size: 0.78rem; font-weight: 700; margin-top: 8px; padding: 4px 8px; border-radius: 6px; background: var(--card-bg); border: 1px solid currentColor; display: inline-block; }
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

export async function getStaticProps() {
  return { props: { latestReport: getLatestDailyReport() } };
}
