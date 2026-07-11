import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useState, useEffect, useCallback } from 'react';
import { getLatestDailyReport } from '../../lib/reports';
import LastUpdated from '../../components/LastUpdated';
import { setTraderGlobal, getTrader } from '../../lib/trader';
import { recordDecision, matureLedger, computeShowdown, getTodayDecision } from '../../lib/verdictLedger';
import { fetchAssetsTotal } from '../../lib/assetsTotal';

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

// [v10 UI] 온보딩 입력 자산(onehub_onboard_assets)을 총자산 집계에 병합.
//   백엔드 total-asset 값이 있으면 우선, 없으면 온보딩 입력값으로 폴백. total_uk 재계산.
function mergeOnboardAssets(d) {
  let onb = null;
  try { onb = JSON.parse(window.localStorage.getItem('onehub_onboard_assets') || 'null'); } catch (e) {}
  const b = { ...(d?.breakdown || {}) };
  // 백엔드 집계 값 + 온보딩 입력 값을 합산(둘 다 없으면 null)
  const add = (x, y) => {
    if (x == null && y == null) return null;
    return Math.round(((Number(x) || 0) + (Number(y) || 0)) * 100) / 100;
  };
  const stock_uk = add(b.stock_uk, onb && onb.stock_uk);
  const etf_uk = add(b.etf_uk, onb && onb.etf_uk);
  const realestate_uk = add(b.realestate_uk, onb && onb.realestate_uk);
  const cash_uk = add(b.cash_uk, onb && onb.cash_uk); // 온보딩 보유 현금(주식계좌 예수금은 렌더에서 합산)
  const parts = [stock_uk, etf_uk, realestate_uk, cash_uk].filter(v => v != null);
  if (parts.length === 0 && (d?.total_uk == null)) return null;
  const total_uk = Math.round(parts.reduce((s, v) => s + Number(v), 0) * 100) / 100;
  return { total_uk, breakdown: { stock_uk, etf_uk, realestate_uk, cash_uk } };
}

// [AI 판단근거] 최종 점수 가중치(합=1.0) — 화면 산출식에도 동일하게 노출해 공신력 확보.
const SCORE_WEIGHTS = { macro: 0.15, ml: 0.35, technical: 0.30, risk: 0.20 };

// [AI 판단근거] 종목별 서브점수(Macro/ML/Technical/Risk) 유도.
//   백엔드 집계 서브점수가 상수 플레이스홀더(예: 0/50/0/50)로 내려와 모든 종목이 동일하게 보이는 문제를
//   보완: 종목별 실제 신호(레짐·RSI·거래량·5일 모멘텀·ml_score)로 재계산해 종목마다 다른 값을 산출한다.
function deriveScores(x) {
  const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));
  const rsi = x?.rsi != null ? Number(x.rsi) : null;
  const vol = x?.vol_ratio != null ? Number(x.vol_ratio) : null;
  const mom = x?.change_5d != null ? Number(x.change_5d) : null;
  const regimeBase = { STRONG_BULL: 80, BULL: 70, SIDEWAYS: 50, NEUTRAL: 50, BEAR: 32, STRONG_BEAR: 22 }[x?.regime] ?? 50;
  // Macro: 시장 레짐 + 종목 모멘텀의 시장 정합
  const macro = clamp(regimeBase + (mom ?? 0) * 0.5);
  // ML Signal: 모델 확률(ml_score)과 모멘텀·거래량 신호를 결합(백엔드 값이 중립 상수여도 종목별로 차등)
  const ml = clamp(0.5 * (x?.ml_score != null ? Number(x.ml_score) : 50) + 0.5 * (50 + (mom ?? 0) * 1.8 + ((vol ?? 1) - 1) * 6));
  // Technical: RSI 건강도(55 근방 가점) + 모멘텀 + 거래량 확인
  const technical = clamp(50 + (mom ?? 0) * 1.0 + ((vol ?? 1) - 1) * 6 - Math.max(0, Math.abs((rsi ?? 50) - 55) - 10) * 1.5);
  // Risk(높을수록 안전): 과열 RSI·거래량 급증·하락 모멘텀이 리스크
  const risk = clamp(72 - Math.max(0, (rsi ?? 50) - 70) * 2.2 - Math.max(0, (vol ?? 1) - 2.5) * 7 - Math.max(0, -(mom ?? 0)) * 1.4);
  // 최종(종합) 점수 = 4개 지표 가중 평균 → 서브점수와 일관되게, 직관적으로 산출
  const final = clamp(macro * SCORE_WEIGHTS.macro + ml * SCORE_WEIGHTS.ml + technical * SCORE_WEIGHTS.technical + risk * SCORE_WEIGHTS.risk);
  return { macro, ml, technical, risk, final };
}

// 종합 점수 → 등급(관심도 후보이므로 매수/매도 명령이 아닌 '매력도' 표현)
function scoreGrade(fs) {
  if (fs >= 80) return { label: '매우 우수', color: 'var(--color-success)' };
  if (fs >= 65) return { label: '우수', color: 'var(--color-success)' };
  if (fs >= 50) return { label: '양호', color: 'var(--color-warning)' };
  if (fs >= 35) return { label: '보통', color: 'var(--color-warning)' };
  return { label: '주의', color: 'var(--color-danger)' };
}

// [§3-3 피드백7] 추천 카드 인라인 메타 — 왜 후보인지(근거 1줄) + 스탠스 + 기대 여력(기술적 추정).
//   백엔드 미도달 + 후보에 가격 필드 없음 → 목표가(원)는 상세(AI분석)에서, 리스트엔 종목 신호 기반 요약.
function deriveRecMeta(s) {
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const rsi = s?.rsi != null ? Number(s.rsi) : null;
  const vol = s?.vol_ratio != null ? Number(s.vol_ratio) : null;
  const mom = s?.change_5d != null ? Number(s.change_5d) : null;
  const score = Math.round(s?.score ?? 0);
  // 근거 1줄: 가장 두드러진 신호 우선
  let reason;
  if (vol != null && vol >= 2.5) reason = `거래량 급증(${vol.toFixed(1)}배) · ${(mom ?? 0) >= 0 ? '상승' : '조정'} 모멘텀`;
  else if (rsi != null && rsi <= 35) reason = `과매도 반등 구간 · 저가 매수 관심`;
  else if (mom != null && mom >= 10) reason = `5일 +${mom}% 강세 · 추세 지속 관심`;
  else if (rsi != null && rsi >= 45 && rsi <= 62) reason = `RSI 중립 · 수급 개선 관찰`;
  else if (vol != null && vol >= 1.3) reason = `거래량 ${vol.toFixed(1)}배 · 관심 유입`;
  else reason = `기술 지표 상위 관심 후보`;
  // 기대 여력(기술적 추정): 변동성·모멘텀 기반 상단 여력 %
  const upside = Math.round(clamp(6 + Math.max(0, mom ?? 0) * 0.15 + Math.max(0, (vol ?? 1) - 1) * 1.5, 5, 18));
  // 스탠스(관심 강도)
  const stance = score >= 12 ? { label: '강한 후보', color: 'var(--color-success)' }
    : score >= 9 ? { label: '양호', color: 'var(--color-primary)' }
    : { label: '보통', color: 'var(--text-secondary)' };
  return { reason, upside, stance, score };
}

// [§3-4 피드백8] 보유 종목 AI 스탠스(유지/추가/축소/매도) + 근거 1줄 — 목표가/손절가 기반.
function deriveStance(p) {
  const n = (x) => (x == null || isNaN(Number(x)) ? null : Number(x));
  const cur = n(p.current_price) ?? 0, avg = n(p.avg_price) ?? 0, tgt = n(p.target) ?? 0, stp = n(p.stop_loss) ?? 0;
  const pnl = p.pnl_rate ?? 0;
  const won = (v) => `${Math.round(v).toLocaleString()}원`;
  const upside = (tgt > 0 && cur > 0) ? (tgt / cur - 1) * 100 : null;
  if (tgt > 0 && cur >= tgt)
    return { label: "축소", color: "var(--color-success)", reason: `목표가 ${won(tgt)} 도달 — 차익 실현(익절) 검토` };
  if (stp > 0 && cur > 0 && cur <= stp)
    return { label: "매도", color: "var(--color-danger)", reason: `손절선 ${won(stp)} 도달 — 리스크 관리 매도 검토` };
  if (pnl >= 5 && (upside == null || upside > 3))
    return { label: "추가", color: "var(--color-primary)", reason: `추세 양호${upside != null ? ` · 목표가까지 +${upside.toFixed(0)}% 여력` : ""}${stp > 0 ? `, 손절선 ${won(stp)} 미접촉` : ""}` };
  if (avg > 0 && cur > 0 && cur < avg * 0.95)
    return { label: "유지", color: "var(--color-warning)", reason: `평단 대비 하락 · ${stp > 0 ? `손절선 ${won(stp)}까지 관찰` : "추세 관찰"}` };
  return { label: "유지", color: "var(--color-ink-2)", reason: `${upside != null ? `목표가 ${won(tgt)}까지 +${upside.toFixed(0)}% 여력` : "추세 관찰 중"}${stp > 0 ? `, 손절선 ${won(stp)} 미접촉` : ""}` };
}

// [§3-4] 차단 사유 → 해제 조건(그래서 어떻게 되면 풀리나) 1줄
function unblockCondition(reason, signal) {
  const r = `${reason || ""} ${signal || ""}`.toLowerCase();
  if (r.includes("거래량")) return "거래량이 평소 대비 1.2배 이상 회복되면 재검토";
  if (r.includes("rsi") || r.includes("과열")) return "RSI 과열 해소(70 미만) 시 재평가";
  if (r.includes("기술") || r.includes("score") || r.includes("점수")) return "기술 점수(MA·수급)가 기준선 위로 오르면 해제";
  if (r.includes("macro") || r.includes("거시") || r.includes("regime")) return "시장 레짐이 BULL로 전환되면 재검토";
  if (r.includes("ml") || r.includes("하락") || r.includes("sell")) return "ML 하락예측이 중립·매수로 전환되면 해제";
  return "조건 충족 시 다음 스크리닝에서 자동 재평가";
}

// [Queue] KST 장중(평일 09:00~15:30) 여부 — 장외 승인은 예약으로 전환
function isMarketHoursKST() {
  const kst = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
  const day = kst.getDay();
  if (day === 0 || day === 6) return false;
  const t = kst.getHours() * 60 + kst.getMinutes();
  return t >= 9 * 60 && t < 15 * 60 + 30;
}

// [v9.0][11] AI Confidence 별점 — 실제 AI 확신도(%)에서만 사용.
// 별점은 항상 같은 % 구간표에서 도출해 "18%인데 별 5개" 같은 불일치가 나지 않도록 함.
function confidenceStars(pct) {
  const p = Math.max(0, Math.min(100, Number(pct) || 0));
  const stars = p >= 85 ? 5 : p >= 70 ? 4 : p >= 55 ? 3 : p >= 40 ? 2 : 1;
  return '★'.repeat(stars) + '☆'.repeat(5 - stars);
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
  const [accuracy, setAccuracy] = useState(null); // [기록] AI 자기검증(차단 적중률) 누적 — ML 학습 현황 카드
  const [ledger, setLedger] = useState([]); // [나 vs AI] 내 판단(매매/관망) 원장 + 3·7일 성과
  const [decTick, setDecTick] = useState(0); // [나 vs AI] 추천 카드 판단 버튼 상태 리렌더 트리거
  const [notis, setNotis] = useState([]); // [T-04] 텔레그램/리포트/큐 동기화 알림 피드
  const [assetSum, setAssetSum] = useState(null); // [v11 1-B] 총자산 통합 집계(주식+ETF+부동산)
  const [aiRec, setAiRec] = useState(null); // [v11 2-A] 오늘 AI 자산 권고(ai-summary)
  const [expandedRec, setExpandedRec] = useState({}); // [v9.0] 추천 탭 왜 추천? 펼침
  const [bottomSheet, setBottomSheet] = useState(null); // [v9.0] AI 판단근거 Bottom Sheet: null | { name, code, scores, reasons, final_score, win_rate }
  const [basisOpen, setBasisOpen] = useState(false); // [v10 UI] 홈 'AI 판단 근거' 접기
  const [heroWhyOpen, setHeroWhyOpen] = useState(false); // [v11-ux] 홈 통합 판단 '왜?' 인라인 펼치기(근거 버튼 제거)
  const [logOpen, setLogOpen] = useState(false);     // [v10 UI] 홈 '최근 활동' 접기
  const [sellConfirm, setSellConfirm] = useState({}); // [v8.7] 매도 1단계 확인 상태: { [code]: true }
  const [sellLoading, setSellLoading] = useState({}); // [v8.7] 매도 처리 중 상태

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
    // [v10 UI] 딥링크(?tab=)로 진입 시 = 다른 페이지에서 넘어온 재방문 → 스플래시 건너뜀(버그#3)
    if (tabParam) { setTab(tabParam); setSplash(false); }
    if (code && name) {
      setSearchQuery(name);
      // 분석 자동 실행
      setTimeout(() => {
        setTab('analyze');
        setAnalyzeResult(null);
        setAnalyzing(true);
        fetch(`/api/pwa/analyze?code=${code}&name=${encodeURIComponent(name)}&trader_id=${getTrader()}`)
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
    // [v10 UI] 투자성향 프로필 로드 — 최초 진입(온보딩 미완료)이면 온보딩 위저드로 이동
    try {
      const saved = window.localStorage.getItem('onehub_profile');
      const onboarded = window.localStorage.getItem('onehub_onboarded') === '1';
      if (saved) {
        setProfile(p => ({ ...p, ...JSON.parse(saved) }));
      }
      // 프로필도 없고 온보딩도 안 했으면 최초 사용자 → 위저드 1회 진입(시안 onehub-onboarding)
      if (!saved && !onboarded && !router.query.tab && !router.query.code) {
        router.replace('/pwa/onboarding');
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
    // [§3-8] 저장된 트레이더 계좌 불러오기 (설정·타 페이지와 단일 소스 공유)
    try {
      const savedTrader = window.localStorage.getItem('onehub_trader');
      if (savedTrader === 'A' || savedTrader === 'B') setTrader(savedTrader);
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
    // [§3-8] 다른 페이지(설정 등)에서 계좌 전환 시 즉시 동기화 → 데이터 자동 재요청
    const onTrader = (e) => setTrader(e?.detail === 'B' ? 'B' : 'A');
    window.addEventListener('onehub-trader-change', onTrader);
    return () => { clearTimeout(splashTimer); window.removeEventListener('onehub-trader-change', onTrader); };
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
      // [v10 UI] <html data-theme> 단일 소스 동기화 — 디자인 토큰 기반 컴포넌트 즉시 반영
      try { window.dispatchEvent(new Event('onehub-theme-change')); } catch (e) {}
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
    fetch(`/api/pwa/accuracy?trader_id=${trader}`)
      .then(r => r.json())
      .then(d => { if (d.ok) setAccuracy(d); })
      .catch(() => {});
    fetch(`/api/notifications?trader=${trader}`)
      .then(r => r.json())
      .then(d => { if (d.ok && Array.isArray(d.items)) setNotis(d.items); })
      .catch(() => {});
    // [S1.1] 총자산 단일 소스(/api/assets/total, 미배포 시 기존 total-asset+온보딩 폴백)
    fetchAssetsTotal(trader)
      .then(a => setAssetSum(a?.total_uk != null ? { total_uk: a.total_uk, breakdown: a.breakdown, realty_state: a.realty_state, source: a.source } : null))
      .catch(() => setAssetSum(null));
    fetch(`/api/realestate/v2/ai-summary?trader_id=${trader}`)
      .then(r => r.json())
      .then(d => { if (d && Array.isArray(d.summary_items)) setAiRec(d); })
      .catch(() => {});
    // [기록] AI 자기검증(차단 적중률) — ML 누적 학습 현황 카드용
    fetch(`/api/pwa/accuracy?trader_id=${trader}`)
      .then(r => r.json())
      .then(d => { if (d && d.ok) setAccuracy(d); })
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
    // [나 vs AI] AI 제안에 대한 내 판단 기록 — 승인/예약=매매(take), 거절/스킵=관망(pass)
    const _p = pendingList.find((x) => x.code === code);
    if (_p) recordDecision({
      code, name: _p.name,
      entry: Number(_p.current_price ?? _p.price) || null,
      decision: action === 'skip' ? 'pass' : 'take',
      trader,
    });
    // [Queue] 장외 승인 → 다음장 09:00 예약 승인으로 전환
    if (action === 'approve' && !isMarketHoursKST()) {
      const ok = window.confirm(
        '현재 장외 시간입니다.\n다음 영업일 09:00에 예약 승인으로 등록하시겠습니까?\n(09:00 자동 릴리스 — 유효 신호만 체결)');
      if (!ok) return;
      setActingCode(code);
      try {
        const res = await fetch('/api/queue-pending', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, trader }),
        });
        const d = await res.json();
        if (d.ok) {
          setPendingList(prev => prev.map(p => p.code === code
            ? { ...p, status: 'queued', scheduled_at: d.scheduled_at } : p));
        } else { setPendingError(d.error || '예약 실패'); }
      } catch (e) { setPendingError(String(e)); }
      finally { setActingCode(null); }
      return;
    }
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
  }, [trader, pendingList]);

  // [나 vs AI] 추천 카드에서 직접 판단 기록 — 후보엔 가격 필드가 없으므로 현재가를 조회해 진입가로 저장
  const logDecision = useCallback(async (code, name, decision, priceHint) => {
    // 즉시 기록(버튼 상태 바로 반영) → 진입가는 조회 후 백필
    recordDecision({ code, name, entry: Number(priceHint) || null, decision, trader });
    setDecTick((t) => t + 1);
    if (!Number(priceHint)) {
      try {
        const r = await fetch(`/api/analyze-stock?code=${code}`);
        const d = await r.json();
        const entry = Number(d?.current_price ?? d?.price) || null;
        if (entry) { recordDecision({ code, name, entry, decision, trader }); setDecTick((t) => t + 1); }
      } catch {}
    }
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

  // [#7 목표가] 추천 바텀시트가 열리면 실제 목표가·손절가(analyze-stock)를 비동기 병합.
  //   스크리닝 후보엔 가격 필드가 없으므로, 상세 시트에서만 백엔드 확정 목표가를 노출한다.
  useEffect(() => {
    const code = bottomSheet?.code;
    if (!code || bottomSheet.priceMeta !== undefined) return;
    let alive = true;
    const merge = (pm) => setBottomSheet((s) => (s && s.code === code ? { ...s, priceMeta: pm } : s));
    fetch(`/api/analyze-stock?code=${code}`)
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        const cur = Number(d?.current_price ?? d?.price) || null;
        const tgt = Number(d?.target) || null;
        const stp = Number(d?.stop_loss) || null;
        merge({ cur, tgt, stp, ok: !!tgt });
      })
      .catch(() => { if (alive) merge({ ok: false }); });
    return () => { alive = false; };
  }, [bottomSheet?.code]);

  // [나 vs AI] 기록 탭 진입 시 원장 성숙(현재가 스냅샷 축적) 후 승부 계산
  useEffect(() => {
    if (tab !== 'report') return;
    let alive = true;
    const fetchPrice = async (code) => {
      try {
        const r = await fetch(`/api/analyze-stock?code=${code}`);
        const d = await r.json();
        return Number(d?.current_price ?? d?.price) || null;
      } catch { return null; }
    };
    matureLedger(trader, fetchPrice).then((list) => { if (alive) setLedger(list); });
    return () => { alive = false; };
  }, [tab, trader]);

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
  const fgReason = (f) => {
    const t = fgTier(f);
    if (t === 'extreme_fear') return 'VIX 급등 + 나스닥 하락 + 기관 매도세';
    if (t === 'fear') return '기술주 조정 + 경기침체 우려';
    if (t === 'neutral') return '방향성 탐색 중';
    if (t === 'greed') return 'AI 모멘텀 + 실적 기대';
    if (t === 'extreme_greed') return '과열 주의 — 단기 조정 가능성';
    return '';
  };
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
  const sellCount = data?.today_sells?.length ?? 0;
  const passCount = blockCount; // PASS = AI가 차단한 종목 수
  const heat = data?.market?.heat_score ?? null;
  const fearGreed = data?.market?.fear_greed ?? null;
  const vix = data?.market?.vix ?? null;
  const regimeDays = data?.market?.regime_days ?? null;
  const regime = data?.market?.regime ?? null;
  const heroAction = regime === 'BEAR' ? 'SELL' : regime === 'BULL' ? 'BUY' : null;

  // [v8.7] 3단 Hero — 오늘 행동 판단 (신규매수 / 추가매수 / 현금유지)
  // 오늘 행동 판단 — BEAR/BULL/SIDEWAYS 분기
  // [v9.0][29] 개인 맞춤 대시보드 -- 투자성향별로 신규/추가매수 Heat 기준 조정
  // (보수형: 더 확실할 때만 매수 신호 / 공격형: 더 낮은 Heat에서도 기회로 인식)
  const heatBias = profile.style === 'conservative' ? 15 : profile.style === 'aggressive' ? -15 : 0;
  const actionNew   = regime === 'BULL' && (heat ?? 0) >= 40 + heatBias;
  const actionNewWarn = regime === 'SIDEWAYS';                   // SIDEWAYS: 신규매수 ⚠️
  const actionAdd   = regime === 'BULL' && (heat ?? 0) >= 60 + heatBias;
  const actionCash  = regime === 'BEAR' || (regime === 'SIDEWAYS') || (heat ?? 0) < 40 + heatBias;
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
        <meta name="theme-color" content={theme === 'light' ? '#EAF1FA' : '#0F1B30'} />
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
          {/* [브랜드] 하단 태그라인 캡션 — 조용한 보조 요소 */}
          <div className="splash-caption">AI ASSET OS</div>
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

      <div className={`pwa-wrapper pwa-shell theme-${theme}`} style={{ display: splash ? 'none' : undefined }}>
        <header className="pwa-header">
          <button className="pwa-brand" onClick={() => setTab('dashboard')} aria-label="홈으로">
            <span className="pwa-logo">ONE<span className="pwa-logo-dot">·</span>HUB</span>
          </button>
          <div className="pwa-header-actions">
            {/* [v10 UI] A/B 트레이더 토글 제거 — 헤더 줄바꿈/탭바 이동 유발. 기본 계좌 A 고정(설정에서 변경) */}
            {/* [v9.1 PWA-01] 검색: 중앙 FAB → 우측 상단 아이콘으로 이동 */}
            <button
              className={`pwa-search-toggle ${tab==='analyze'?'active':''}`}
              onClick={() => setTab('analyze')}
              aria-label="AI 종목 검색"
              title="AI 종목 검색"
            >
              🔍
            </button>
            <button
              className="pwa-theme-toggle"
              onClick={() => router.push('/pwa/settings')}
              aria-label="설정"
              title="설정 · 테마 · 시스템 상태"
            >
              ⚙️
            </button>
          </div>
        </header>

        {/* [v11 IA] 자산 카테고리 네비 — 홈 · AI자산 · 주식 · ETF · 부동산 · 설정 */}
        <nav className="pwa-tabs">
          {[
            ['dashboard','홈'],
            ['ai','AI자산'],
            ['stock','주식'],
            ['etf','ETF'],
            ['realestate','부동산'],
            // [설정] 탭 제거 — 헤더 ⚙️ 아이콘과 중복. 설정은 아이콘으로만 진입.
          ].map(([t,label]) => {
            const routes = { etf: '/pwa/etf', realestate: '/pwa/realestate', ai: '/pwa/ai-advisor' };
            const stockTabs = ['recommend','portfolio','report','analyze'];
            const isActive = t === 'stock' ? stockTabs.includes(tab) : tab === t;
            const go = () => {
              if (routes[t]) { window.location.href = routes[t]; return; }
              if (t === 'stock') { setTab('portfolio'); return; }
              setTab(t);
            };
            return (
              <button key={t} className={`pwa-tab ${isActive?'active':''}`} onClick={go}>
                {label}
              </button>
            );
          })}
        </nav>
        {/* [v11 IA] 주식 카테고리 서브탭 — 추천 · 보유 · 기록 */}
        {['recommend','portfolio','report'].includes(tab) && (
          <nav className="pwa-subtabs">
            {[['portfolio','보유'],['recommend','추천'],['report','기록']].map(([t,label]) => (
              <button key={t} className={`pwa-subtab ${tab===t?'active':''}`} onClick={()=>setTab(t)}>
                {label}
              </button>
            ))}
          </nav>
        )}

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

              {/* [v11-ux] 홈 히어로 — 오늘의 '통합' AI 판단(cross-asset). 근거는 버튼 대신 인라인 '왜?' 아코디언 */}
              {(() => {
                // 총자산 스냅샷(홈 = 총자산 소유 페이지). 부동산 비중이 최상위 판단 축.
                const acctCashUk = data?.balance?.cash != null ? Math.round((data.balance.cash / 1e8) * 100) / 100 : 0;
                const b = assetSum?.breakdown || {};
                const totalUk = assetSum?.total_uk != null ? Math.round((assetSum.total_uk + acctCashUk) * 100) / 100 : null;
                const reUk = b.realestate_uk;
                const rePct = (totalUk && reUk != null) ? Math.round((reUk / totalUk) * 1000) / 10 : null;
                const riskGrade = rePct == null ? null : rePct > 70 ? '높음' : rePct >= 40 ? '중간' : '낮음';
                const stance = buyCount > 0 ? `${buyCount}종목 매수` : '선별 관망';
                // 크로스에셋 결론: 부동산 구조 쏠림 > 시장 스탠스 순으로 한 줄 결론 산출
                let concl, why;
                if (rePct != null && rePct > 70) {
                  concl = <>오늘은 <em>{stance}</em>. 자산의 <b>{rePct}%가 부동산</b> — 쏠림을 줄일 때입니다.</>;
                  why = <>부동산 구조 리스크 <b>{riskGrade}</b>. 실물이라 즉시 조정은 어렵지만, 오늘 들어오는 <b>현금·매매 수익은 부동산 외 자산</b>(주식·ETF·현금)으로만 배분하세요. 신규 부동산 매입은 보류가 낫습니다.{buyCount === 0 ? ` 주식은 시장 온도 Heat ${heat ?? '-'}로 선별 관망 중입니다.` : ` 주식은 조건 충족 ${buyCount}종목에 매수 신호가 있습니다.`}</>;
                } else if (rePct != null) {
                  concl = <>오늘은 <em>{stance}</em>. 자산 배분 균형은 <b>{riskGrade === '낮음' ? '양호' : '보통'}</b>합니다.</>;
                  why = <>부동산 {rePct}%로 구조 리스크 <b>{riskGrade}</b>. 시장 온도 <b>Heat {heat ?? '-'} ({heatLabel(heat) || '-'})</b> · Regime <b>{regime || '-'}</b>. {buyCount > 0 ? `주식 ${buyCount}종목 매수 신호.` : `매수 조건 미달로 ${blockCount || 0}건을 걸렀습니다.`}</>;
                } else {
                  concl = <>오늘은 <em>{stance}</em>. {buyCount > 0 ? `조건 충족 ${buyCount}종목 매수 신호.` : '매수 조건 미달, 선별 관망.'}</>;
                  why = <>시장 온도 <b>Heat {heat ?? '-'} ({heatLabel(heat) || '-'})</b> · Regime <b>{regime || '-'}</b>. {blockCount > 0 ? `후보 ${blockCount}건은 기준 미달로 걸렀습니다. ` : ''}부동산·현금을 입력하면 자산 전체 기준 판단으로 넓혀집니다.</>;
                }
                return (
                  <section className="home-hero">
                    <div className="hh-eyebrow">
                      <div className="hh-eyebrow-top">
                        <span className="hh-label">🧭 오늘의 통합 AI 판단</span>
                        <span className="hh-live">LIVE</span>
                      </div>
                      <span className="hh-scope">주식 · ETF · 부동산 · 현금 통합</span>
                    </div>
                    <h1 className="hh-h1">{concl}</h1>
                    {totalUk != null && (
                      <div className="hh-total">총자산 <b>{totalUk}억</b>{rePct != null && <span className="hh-total-sub"> · 부동산 {rePct}%</span>}</div>
                    )}
                    {/* 근거: 버튼/이탈 없이 카드 안 '왜?' 인라인 펼치기 (원칙4) */}
                    <button className="hh-why" onClick={() => setHeroWhyOpen(o => !o)} aria-expanded={heroWhyOpen}>
                      <span>왜 이렇게 판단했나?</span><span className={`hh-why-caret ${heroWhyOpen ? 'open' : ''}`}>▾</span>
                    </button>
                    {heroWhyOpen && (
                      <div className="hh-why-body">
                        <div className="hh-reason">{why}</div>
                        <div className="hh-foot">
                          <span className="hh-chip">Regime <span className="v">{regime || '-'}</span></span>
                          <span className="hh-chip">Heat <span className="v">{heat ?? '-'}</span></span>
                          {fearGreed !== null && <span className="hh-chip">Fear&amp;Greed <span className="v">{fearGreed}</span></span>}
                          {rePct != null && <span className="hh-chip">부동산 <span className="v">{rePct}%</span></span>}
                        </div>
                        <a className="hh-detail" onClick={() => { window.location.href = '/pwa/ai-advisor'; }}>자산 전체 상세 판단(AI자산) →</a>
                      </div>
                    )}
                  </section>
                );
              })()}

              {/* [#4 MarketPulse] 시장 맥박 — 뉴스·변화를 lively하게. 실측 지표만(허위 헤드라인 금지) */}
              {(() => {
                if (!data?.market) return null;
                const ht = heatTier(heat);
                const htLabel = heatLabel(heat);
                const htColor = heatColor(heat);
                const rc = regimeClass(regime);
                const candCnt = (data.screening_candidates || []).length;
                // 한 줄 시장 읽기 — regime × heat × 공포탐욕 조합에서 파생
                const pulseRead = (() => {
                  if (regime === 'BEAR') return `하락 국면 · 위험선호 위축${fearGreed != null && fearGreed < 45 ? ' — 공포 구간, 무리한 매수 자제' : ''}`;
                  if (regime === 'BULL') return ht === 'hot'
                    ? '상승세 과열 — 추격보다 눌림목 대기'
                    : '상승 우호 — 선별 매수 유효';
                  return `방향성 탐색 · 변동성 관리 우선${fearGreed != null && fearGreed >= 56 ? ' — 탐욕 구간 경계' : ''}`;
                })();
                return (
                  <section className="card mp">
                    <div className="mp-head">
                      <span className="mp-title"><span className="mp-live" /> 📡 시장 맥박</span>
                      {regimeDays != null && <span className="mp-days">{regimeKo(regime)} {regimeDays}일째</span>}
                    </div>
                    <div className="mp-chips">
                      <div className={`mp-chip ${rc}`}>
                        <span className="mp-ck">{regimeIcon(regime)} 국면</span>
                        <span className="mp-cv">{regimeKo(regime) || '-'}</span>
                      </div>
                      <div className="mp-chip">
                        <span className="mp-ck">🌡️ 시장온도</span>
                        <span className="mp-cv" style={{ color: htColor }}>{heat ?? '-'} {htLabel ? `· ${htLabel}` : ''}</span>
                      </div>
                      <div className="mp-chip">
                        <span className="mp-ck">😨 공포·탐욕</span>
                        <span className="mp-cv">{fearGreed ?? '-'} {fearGreed != null ? `· ${fgLabel(fearGreed)}` : ''}</span>
                      </div>
                    </div>
                    <div className="mp-read">{pulseRead}</div>
                    <div className="mp-foot">
                      {vix != null && <span className="mp-tag">VIX {vix}</span>}
                      <span className="mp-tag">오늘 후보 {candCnt}종목 감지</span>
                      <span className="mp-tag">매수 {buyCount} · 차단 {blockCount}</span>
                    </div>
                  </section>
                );
              })()}

              {/* [v10 UI 시안] ② 총자산 — 라벨/금액 + 자산별 행(부동산 미입력 CTA) */}
              {(() => {
                // 현금 = 주식계좌 예수금(원→억) + 온보딩 입력 보유 현금(억)
                const acctCashUk = data?.balance?.cash != null
                  ? Math.round((Number(data.balance.cash) / 1e8) * 100) / 100 : null;
                const onbCashUk = assetSum?.breakdown?.cash_uk ?? null;
                const cashUk = (acctCashUk == null && onbCashUk == null)
                  ? null
                  : Math.round(((acctCashUk || 0) + (onbCashUk || 0)) * 100) / 100;
                // 표시 총자산 = 온보딩 병합 합계 + 주식계좌 예수금(병합에는 미포함)
                const baseTotal = assetSum?.total_uk ?? null;
                const totalUk = (baseTotal == null && acctCashUk == null)
                  ? null
                  : Math.round(((baseTotal || 0) + (acctCashUk || 0)) * 100) / 100;
                return (
                  <section className="card v10">
                    <div className="v10-total"><span className="v10-total-lbl">총자산</span><span className="v10-total-amt mono">{totalUk != null ? `${totalUk}억` : '—'}</span></div>
                    {[
                      ['주식', 'var(--color-primary)', assetSum?.breakdown?.stock_uk, '/pwa?tab=recommend'],
                      ['ETF', 'var(--color-success)', assetSum?.breakdown?.etf_uk, '/pwa/etf'],
                      ['부동산', 'var(--color-ink-3)', assetSum?.breakdown?.realestate_uk, '/pwa/realestate'],
                      ['현금', 'var(--color-warning)', cashUk, '/pwa/onboarding'],
                    ].map(([label, color, val, href]) => (
                      <div className="v10-arow" key={label}>
                        <span className="v10-aname"><i className="v10-adot" style={{ background: color }} />{label}</span>
                        {val != null
                          ? <span className="v10-aval mono">{val}억</span>
                          : <span className="v10-miss"><span className="v10-miss-tag">미입력</span><button className="v10-miss-btn" onClick={() => { window.location.href = href; }}>입력하기 →</button></span>}
                      </div>
                    ))}
                  </section>
                );
              })()}

              {/* [v10 UI 시안] ③ 오늘의 행동 — 4셀 + 요약 노트 */}
              <section className="card v10">
                <div className="v10-sect"><h3>🎯 오늘의 행동</h3><a onClick={() => setTab('report')}>기록 →</a></div>
                <div className="v10-acts">
                  {[
                    ['매수', buyCount, 'var(--color-success)'],
                    ['매도', sellCount, 'var(--color-danger)'],
                    ['관망', watchCount, 'var(--color-primary)'],
                    ['차단', blockCount, 'var(--color-ink-3)'],
                  ].map(([k, n, c]) => (
                    <div className="v10-act" key={k}><div className="v10-act-n mono" style={{ color: c }}>{n}</div><div className="v10-act-k">{k}</div></div>
                  ))}
                </div>
                <div className="v10-act-note">AI는 오늘 {buyCount > 0 ? <><b>{buyCount}종목을 매수</b>했습니다.</> : blockCount > 0 ? <>매수 없이 <b>{blockCount}건을 신중히 차단</b>했습니다.</> : <><b>선별 관망</b>했습니다.</>} 승인 대기 <b>{pendingList.length}건</b>.</div>

                {/* [#3 알림 피드] 텔레그램·리포트·큐 동기화 알림을 액션 카드 안에 인라인 노출 */}
                {notis.length > 0 && (
                  <div className="v10-noti">
                    <div className="v10-noti-h">🔔 최근 알림</div>
                    {notis.slice(0, 4).map((n, i) => {
                      const title = n.title || n.message || n.body || n.text || '알림';
                      const t = n.type || n.category || '';
                      const ic = /buy|매수|signal|신호/i.test(t + title) ? '📈'
                        : /sell|매도|손절|익절/i.test(t + title) ? '📉'
                        : /report|리포트/i.test(t + title) ? '📄'
                        : /error|오류|실패|circuit/i.test(t + title) ? '⚠️' : '🔔';
                      const ts = n.created_at || n.timestamp || n.time || n.date || null;
                      const when = ts ? String(ts).replace('T', ' ').slice(5, 16) : null;
                      return (
                        <div className="v10-noti-row" key={i}>
                          <span className="v10-noti-ic">{ic}</span>
                          <span className="v10-noti-tx">{title}</span>
                          {when && <span className="v10-noti-ts mono">{when}</span>}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* [v10 UI 시안] ④ AI 판단 근거 — 접기(요약 한 줄 → 지표/확률바) */}
              {regime && (() => {
                const h = heat ?? 50, fg = fearGreed ?? 50, v = vix ?? 18;
                let buyP, sellP, waitP;
                if (regime === 'BULL') { buyP = Math.round(40 + (h / 100) * 35); sellP = Math.round(5 + ((100 - fg) / 100) * 10); }
                else if (regime === 'BEAR') { sellP = Math.round(40 + ((100 - h) / 100) * 35); buyP = Math.round(5 + (fg / 100) * 10); }
                else { waitP = Math.round(45 + ((50 - Math.abs(h - 50)) / 50) * 20); buyP = Math.round((100 - waitP) * (h / 100)); sellP = 100 - buyP - waitP; }
                buyP = Math.max(0, Math.min(buyP ?? 0, 100)); sellP = Math.max(0, Math.min(sellP ?? 0, 100)); waitP = Math.max(0, 100 - buyP - sellP);
                return (
                  <section className={`card v10 v10-collap ai-basis-card ${basisOpen ? 'open' : ''}`}>
                    <div className="v10-collap-head" onClick={() => setBasisOpen(o => !o)}>
                      <div className="v10-basis-txt"><h3>🧠 AI 판단 근거</h3><p className="v10-basis-sum">시장 온도 {heat != null && heat < 40 ? '낮음' : heat != null && heat >= 70 ? '높음' : '보통'} · 매수 확률 <b>{buyP}%</b> · {buyP >= 50 ? '매수 우세' : waitP >= sellP ? '관망 우세' : '매도 우세'}</p></div>
                      <span className="v10-caret">▾</span>
                    </div>
                    <div className="v10-collap-body"><div className="v10-collap-inner">
                      <div className="v10-metrics">
                        <div className="v10-metric"><div className="v10-mk">VIX</div><div className="v10-mv mono">{v}</div></div>
                        <div className="v10-metric"><div className="v10-mk">Fear&amp;Greed</div><div className="v10-mv mono" style={{ color: 'var(--color-danger)' }}>{fg}</div></div>
                        <div className="v10-metric"><div className="v10-mk">Heat</div><div className="v10-mv mono" style={{ color: 'var(--color-primary)' }}>{heat ?? '-'}</div></div>
                      </div>
                      {[['매수', buyP, 'var(--color-success)'], ['관망', waitP, 'var(--color-warning)'], ['매도', sellP, 'var(--color-danger)']].map(([k, p, c]) => (
                        <div className="v10-bar-row" key={k}><span className="v10-bk">{k}</span><div className="v10-track"><div className="v10-fill" style={{ width: `${p}%`, background: c }} /></div><span className="v10-bv mono" style={{ color: c }}>{p}%</span></div>
                      ))}
                    </div></div>
                  </section>
                );
              })()}

              {/* [v10 UI 시안] ⑤ TOP PICK — 공동순위 */}
              {topPicks.length > 0 && (
                <section className="card v10">
                  <div className="v10-sect"><h3>⭐ 오늘의 TOP PICK</h3><a onClick={() => setTab('recommend')}>추천 전체 →</a></div>
                  <div className="v10-pick-note">매수 선별 전 기술 스코어링 상위 후보 · 실제 매수 신호와 별개</div>
                  {topPicks.map((p, i) => {
                    const rank = topPicks.filter(x => (x.score ?? 0) > (p.score ?? 0)).length + 1;
                    const tie = topPicks.filter(x => (x.score ?? 0) === (p.score ?? 0)).length > 1;
                    return (
                      <div className="v10-pick-row" key={i}>
                        <div className="v10-pick-l"><div className="v10-medal" style={{ background: rank === 1 ? 'var(--color-warning)' : rank === 2 ? 'var(--color-ink-3)' : 'var(--color-warning-ink)' }}>{rank}</div><span className="v10-pick-name">{p.name}{tie && <span className="v10-tie">공동 {rank}위</span>}</span></div>
                        <div className="v10-pick-r"><span className="v10-pick-score">{p.isBuy ? '매수신호' : `관심도 ${p.score ?? '-'}`}</span><button className="v10-mini-btn" onClick={() => setTab('recommend')}>AI<br />분석</button></div>
                      </div>
                    );
                  })}
                </section>
              )}

              {/* [v10 UI 시안] ⑥ 보유 종목 */}
              <section className="card v10">
                <div className="v10-sect"><h3>💼 보유 종목</h3><a onClick={() => setTab('portfolio')}>전체 {positions.length}건 →</a></div>
                {positions.length === 0
                  ? <div className="pwa-empty">보유 종목 없음</div>
                  : positions.slice(0, 5).map((p, i) => (
                    <div className="v10-hold-row" key={i}><span className="v10-hold-name">{p.name}</span><span className={`v10-hold-pct ${(p.pnl_rate ?? 0) >= 0 ? 'up' : 'down'}`}>{(p.pnl_rate ?? 0) >= 0 ? '+' : ''}{p.pnl_rate}%</span></div>
                  ))}
              </section>

              {/* [v10 UI 시안] ⑦ 타임라인 — 오늘 AI 분석 흐름 */}
              <section className="card v10">
                <div className="v10-sect"><h3>🎬 오늘 AI 분석 흐름</h3></div>
                <div className="v10-tl">
                  <div className="v10-tl-item"><div className="v10-tl-time">분석 시작</div><div className="v10-tl-title">🔍 시장 분석</div><div className="v10-tl-desc">Regime {regime || '-'} · Heat {heat ?? '-'} · 공포탐욕 {fearGreed ?? '-'}</div></div>
                  <div className="v10-tl-item"><div className="v10-tl-time">스크리닝</div><div className="v10-tl-title">📊 종목 스크리닝</div><div className="v10-tl-desc">후보 {(data.screening_candidates || []).length}종목 선별</div></div>
                  <div className="v10-tl-item"><div className="v10-tl-time">최종 결정</div><div className="v10-tl-title">✅ 최종 결정</div><div className="v10-tl-desc">매수 {buyCount}건 · 차단 {blockCount}건 — 선별 실행</div></div>
                </div>
              </section>

              {/* [v10 UI 시안] ⑧ 최근 활동 — 접기(같은 사유 묶기) */}
              <section className={`card v10 v10-collap ${logOpen ? 'open' : ''}`}>
                <div className="v10-collap-head" onClick={() => setLogOpen(o => !o)}>
                  <h3 style={{ fontSize: '15px', fontWeight: 700 }}>🧾 최근 활동</h3>
                  <span className="v10-caret">▾</span>
                </div>
                {(() => {
                  const decs = data.recent_decisions || [];
                  if (decs.length === 0) return <div className="pwa-empty" style={{ marginTop: 13 }}>기록된 활동 없음</div>;
                  const groups = {};
                  decs.forEach(e => { const key = e.summary || '-'; groups[key] = (groups[key] || 0) + 1; });
                  const top = Object.entries(groups).sort((a, b) => b[1] - a[1])[0];
                  return (<>
                    <div className="v10-log-group"><div className="v10-log-l"><span className="v10-log-badge">{decs[0]?.event_type || 'LOG'}</span><span className="v10-log-txt">{top[0]}</span></div><span className="v10-log-cnt">×{top[1]}건</span></div>
                    <div className="v10-collap-body"><div className="v10-collap-inner">
                      <div className="v10-tl">{decs.slice(0, 6).map((e, i) => (<div className="v10-tl-item" key={i}><div className="v10-tl-time">{e.date?.slice(5, 16)}</div><div className="v10-tl-desc">{e.summary}</div></div>))}</div>
                    </div></div>
                  </>);
                })()}
              </section>

            </>)}
          </main>
        )}

        {/* ── Recommend Tab ── [v9.0] AI 매수 선별 전 기술 스코어링 상위 후보 — 실거래와 분리된 관심종목 전용 화면 */}
        {tab === 'recommend' && (
          <main className="pwa-main">
            {/* [v10 UI] 추천 관심종목 — 네이비 히어로(타 페이지와 통일). 제목/업데이트 2줄 정렬 */}
            <section className="rec-hero">
              <div className="rec-hero-top">
                <span className="rec-hero-title">🔍 추천 관심종목</span>
                <span className="rec-hero-live">LIVE</span>
              </div>
              <div className="rec-hero-upd"><LastUpdated timestamp={data?.ok ? new Date() : null} staleAfterSeconds={180} /></div>
              <p className="rec-hero-desc">AI 매수 선별 전 기술 스코어링 상위 후보입니다. 실제 매수 신호와는 별개입니다.</p>
            </section>

            {/* [매매 승인] 추천 탭 상단 — AI 매매 제안 승인/거절 카드 (승인대기 있을 때만) */}
            {pendingList.length > 0 && (
              <section className="pwa-card approve-card">
                <div className="approve-head">
                  <span className="approve-title">🤝 AI 매매 제안 · 승인 대기 <b>{pendingList.length}건</b></span>
                  {!isMarketHoursKST() && <span className="approve-off">장외 · 예약 승인</span>}
                </div>
                <div className="pending-list">
                  {pendingList.map((p) => {
                    const rr = (p.price > 0 && p.target > 0 && p.stop_loss > 0)
                      ? (() => { const rw = (p.target / p.price - 1) * 100; const rk = (1 - p.stop_loss / p.price) * 100; return { rw, rk, r: rk > 0 ? rw / rk : null }; })()
                      : null;
                    const rrColor = !rr || rr.r == null ? 'var(--text-secondary)' : rr.r >= 2 ? 'var(--color-success)' : rr.r >= 1.5 ? 'var(--color-warning)' : 'var(--color-danger)';
                    const queued = p.status === 'queued';
                    return (
                      <div key={p.code} className="pending-card">
                        <div className="pending-top">
                          <span className="pending-name">{p.name} <span className="dim mono">({p.code})</span></span>
                          {p.regime && <span className={`pending-regime mono ${regimeClass(p.regime)}`}>{p.regime}</span>}
                        </div>
                        <div className="pending-price-grid mono">
                          <div><span className="dim">목표가</span> <span className="bull">{Number(p.target || 0).toLocaleString()}원</span></div>
                          <div><span className="dim">손절가</span> <span className="bear">{Number(p.stop_loss || 0).toLocaleString()}원</span></div>
                        </div>
                        {rr && (
                          <div className="pending-price-grid rr-3col mono" style={{ marginTop: 2 }}>
                            <div><span className="dim">예상수익</span> <span className="bull">+{rr.rw.toFixed(1)}%</span></div>
                            <div><span className="dim">손절률</span> <span className="bear">-{rr.rk.toFixed(1)}%</span></div>
                            <div><span className="dim">RR</span> <span style={{ color: rrColor, fontWeight: 700 }}>{rr.r != null ? rr.r.toFixed(1) : '-'}</span></div>
                          </div>
                        )}
                        {p.reason && <div className="pending-reason">{p.reason}</div>}
                        {queued ? (
                          <div className="pending-queued">
                            ⏰ {p.scheduled_at ? `${p.scheduled_at} 예약` : '다음장 09:00 예약'} · 자동 릴리스 대기
                            <button className="pending-btn reject" style={{ marginTop: 8, width: '100%' }} disabled={actingCode === p.code} onClick={() => actOnPending(p.code, 'skip')}>{actingCode === p.code ? '처리 중...' : '❌ 예약 취소'}</button>
                          </div>
                        ) : (
                          <div className="pending-actions">
                            <button className="pending-btn approve" disabled={actingCode === p.code} onClick={() => actOnPending(p.code, 'approve')}>{actingCode === p.code ? '처리 중...' : (isMarketHoursKST() ? '✅ 승인' : '⏰ 예약 승인')}</button>
                            <button className="pending-btn reject" disabled={actingCode === p.code} onClick={() => actOnPending(p.code, 'skip')}>{actingCode === p.code ? '처리 중...' : '❌ 거절'}</button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                {pendingError && <div className="pwa-error" style={{ marginTop: 8 }}>{pendingError}</div>}
              </section>
            )}

            <section className="pwa-card">
              {!data && !error && (
                <div className="pwa-loading"><div className="pwa-spinner" /><span>데이터 로딩 중...</span></div>
              )}
              {data && (!data.screening_candidates || data.screening_candidates.length === 0) && (
                <div className="pwa-empty">오늘 스캔된 관심종목이 없습니다.</div>
              )}
              {data && data.screening_candidates && data.screening_candidates.length > 0 && (() => {
                // [v9.0][29] 개인 맞춤 대시보드 -- 투자성향별 추천 정렬 기준
                // 공격형: 점수 + 모멘텀(5일 수익률) 가점 / 보수형: 점수 + 변동성 낮은(vol_ratio 1에 근접) 종목 가점
                const personalScore = (s) => {
                  const base = s.score ?? 0;
                  if (profile.style === 'aggressive') return base + (s.change_5d ?? 0) * 0.5;
                  if (profile.style === 'conservative') return base - Math.abs((s.vol_ratio ?? 1) - 1) * 3;
                  return base;
                };
                const sorted = [...data.screening_candidates].sort((a, b) => personalScore(b) - personalScore(a));
                const top3 = sorted.slice(0, 3);
                const rest = sorted.slice(3);
                const MEDALS = ['🥇', '🥈', '🥉'];
                const openSheet = (s) => {
                  const sc = deriveScores(s); // 종목별 실제 신호로 서브점수 재계산(상수 표기 방지)
                  setBottomSheet({
                    name: s.name, code: s.code,
                    scores: { macro: sc.macro, ml: sc.ml, technical: sc.technical, risk: sc.risk },
                    final_score: sc.final, // 4개 지표 가중 평균(서브점수와 일관)
                    interest: Math.round(s.score ?? 0), // 백엔드 관심도(스크리닝 원점수) — 별도 표기
                    win_rate: s.win_rate ?? null,
                    // [v9.0][13] Why Now? -- 근거를 최대 5개까지 노출
                    reasons: [
                      ...(s.regime ? [{ text: `${s.regime} 시장 대응 종목`, positive: true }] : []),
                      { text: `ML 매수 신호 ${sc.ml}%`, positive: sc.ml > 50 },
                      ...(s.rsi != null ? [{ text: `RSI ${s.rsi}`, positive: s.rsi < 70 }] : []),
                      ...(s.vol_ratio != null ? [{ text: `거래량 평소 대비 ${s.vol_ratio.toFixed(1)}배`, positive: s.vol_ratio >= 1 }] : []),
                      ...(s.change_5d != null ? [{ text: `5일 수익률 ${s.change_5d >= 0 ? '+' : ''}${s.change_5d}%`, positive: s.change_5d >= 0 }] : []),
                    ].slice(0, 5),
                  });
                };
                return (
                  <>
                    {/* [§3-3] 관심도 정의 — 숫자가 뭘 뜻하는지 1줄 */}
                    <div className="rec-def">💡 <b>관심도</b> = MA·RSI·볼린저·거래량·수급 기술점수 합산 <b>(0~15)</b> · 매수 선별 <b>전</b> 후보</div>
                    {/* Top3 Hero 카드 — 관심도 + 스탠스 + 근거 1줄 + 기대 여력 인라인(원칙4) */}
                    <div className="top3-hero-row">
                      {top3.map((s, i) => {
                        const sc = Math.round(s.score ?? 0);
                        const m = deriveRecMeta(s);
                        return (
                          <div key={s.code || i} className="top3-hero-card" onClick={() => openSheet(s)}>
                            <div className="top3-medal">{MEDALS[i]}</div>
                            <button
                              className="top3-name"
                              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'var(--font-body)', textAlign: 'center' }}
                              onClick={(e) => { e.stopPropagation(); setTab('analyze'); runAnalyze(s.code, s.name); }}
                            >{s.name}</button>
                            <div className="top3-ai-pct mono">관심도 {sc}</div>
                            <span className="top3-stance" style={{ color: m.stance.color, borderColor: m.stance.color }}>{m.stance.label}</span>
                            <div className="top3-reason">{m.reason}</div>
                            <div className="top3-upside">기대 <b>~+{m.upside}%</b><span className="est">추정</span></div>
                            <button className="top3-why-btn" onClick={(e) => { e.stopPropagation(); openSheet(s); }}>목표가·상세 →</button>
                            {/* [나 vs AI] 내 판단 기록 — 샀어요/안 샀어요 */}
                            {(() => { const dec = (decTick, getTodayDecision(s.code, trader)); return (
                              <div className="dec-mini" onClick={(e) => e.stopPropagation()}>
                                <button className={`dec-b take ${dec === 'take' ? 'on' : ''}`} onClick={() => logDecision(s.code, s.name, 'take')}>{dec === 'take' ? '✓ 샀어요' : '샀어요'}</button>
                                <button className={`dec-b pass ${dec === 'pass' ? 'on' : ''}`} onClick={() => logDecision(s.code, s.name, 'pass')}>{dec === 'pass' ? '✓ 관망' : '관망'}</button>
                              </div>
                            ); })()}
                          </div>
                        );
                      })}
                    </div>

                    {/* 나머지 리스트 — 근거 1줄 + 스탠스 + 기대 여력 인라인 */}
                    {rest.length > 0 && (
                      <div style={{ marginTop: 12 }}>
                        <div className="rec-rest-h">그 외 관심종목</div>
                        <div className="rec-rest-list">
                          {rest.map((s, i) => {
                            const sc = Math.round(s.score ?? 0);
                            const m = deriveRecMeta(s);
                            return (
                              <div key={s.code || i} className="rec-row">
                                <div className="rec-row-l">
                                  <button className="rec-name" onClick={() => { setTab('analyze'); runAnalyze(s.code, s.name); }}>
                                    {s.name} <span className="mono dim rec-code">{s.code}</span>
                                    <span className="rec-stance-inline" style={{ color: m.stance.color }}>{m.stance.label}</span>
                                  </button>
                                  <div className="rec-reason">{m.reason}</div>
                                  {/* [나 vs AI] 내 판단 기록 */}
                                  {(() => { const dec = (decTick, getTodayDecision(s.code, trader)); return (
                                    <div className="dec-mini">
                                      <button className={`dec-b take ${dec === 'take' ? 'on' : ''}`} onClick={() => logDecision(s.code, s.name, 'take')}>{dec === 'take' ? '✓ 샀어요' : '샀어요'}</button>
                                      <button className={`dec-b pass ${dec === 'pass' ? 'on' : ''}`} onClick={() => logDecision(s.code, s.name, 'pass')}>{dec === 'pass' ? '✓ 관망' : '관망'}</button>
                                    </div>
                                  ); })()}
                                </div>
                                <div className="rec-row-r">
                                  <span className="rec-interest mono">관심도 {sc}</span>
                                  <span className="rec-upside">기대 ~+{m.upside}%</span>
                                  <button className="rec-detail" onClick={() => openSheet(s)}>상세 →</button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
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

              {/* [v9.0][28] 검색화면 고도화 -- AI추천/오늘 급등주/ETF 빠른 접근 */}
              {searchQuery.length === 0 && (() => {
                const aiRecs = (data?.today_buys?.length ? data.today_buys.map(b => ({ code: b.code, name: b.stock }))
                  : (data?.screening_candidates || []).slice().sort((a,b)=>(b.score??0)-(a.score??0))
                    .map(s => ({ code: s.code, name: s.name }))).slice(0, 5);
                const gainers = (data?.screening_candidates || []).slice()
                  .sort((a,b)=>(b.change_1d??-999)-(a.change_1d??-999))
                  .filter(s => (s.change_1d ?? 0) > 0)
                  .map(s => ({ code: s.code, name: s.name, change_1d: s.change_1d })).slice(0, 5);
                const etfQuick = [
                  { code: '069500', name: 'KODEX 200' },
                  { code: '379800', name: 'KODEX 미국S&P500' },
                  { code: '133690', name: 'TIGER 미국나스닥100' },
                  { code: '261240', name: 'KODEX 미국달러' },
                ];
                const sections = [
                  { label: '🤖 최근 AI 추천', items: aiRecs },
                  { label: '📈 오늘 급등주', items: gainers },
                  { label: '📊 ETF 빠른 검색', items: etfQuick },
                ].filter(s => s.items.length > 0);
                if (sections.length === 0) return null;
                return (
                  <div className="quick-search-sections">
                    {sections.map(sec => (
                      <div key={sec.label} className="recent-search-wrap">
                        <span className="recent-search-label">{sec.label}</span>
                        <div className="recent-search-chips">
                          {sec.items.map((s,i) => (
                            <button key={i} className="recent-search-chip" onClick={() => runAnalyze(s.code, s.name)}>
                              {s.name}{s.change_1d != null ? ` +${s.change_1d}%` : ''}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
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
                      {confidenceStars(analyzeResult.confidence_score)} AI 확신도 {analyzeResult.confidence_score}%
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
                  </div>
                  {/* [v9.0][12] Risk/Reward -- 예상수익/손절률/RR비율을 한번에 */}
                  {analyzeResult.current_price > 0 && analyzeResult.target > 0 && analyzeResult.stop_loss > 0 && (() => {
                    const cp = analyzeResult.current_price;
                    const rewardPct = (analyzeResult.target / cp - 1) * 100;
                    const riskPct = (1 - analyzeResult.stop_loss / cp) * 100;
                    const rr = riskPct > 0 ? rewardPct / riskPct : null;
                    const rrColor = rr == null ? 'var(--text-secondary)' : rr >= 2 ? 'var(--color-success)' : rr >= 1.5 ? 'var(--color-warning)' : 'var(--color-danger)';
                    return (
                      <div className="rr-summary">
                        <div className="rr-summary-row">
                          <span className="dim">예상수익</span>
                          <span className="mono bull">+{rewardPct.toFixed(1)}%</span>
                        </div>
                        <div className="rr-summary-row">
                          <span className="dim">손절률</span>
                          <span className="mono bear">-{riskPct.toFixed(1)}%</span>
                        </div>
                        <div className="rr-summary-row rr-summary-main">
                          <span className="dim">Risk/Reward</span>
                          <span className="mono" style={{ color: rrColor, fontWeight: 800 }}>{rr != null ? rr.toFixed(1) : '-'}</span>
                        </div>
                      </div>
                    );
                  })()}
                  {analyzeResult.key_signal && <p className="pwa-analyze-text" style={{marginTop:10}}>{analyzeResult.key_signal}</p>}
                </section>

                {/* [v9.0] AI 액션 플랜 카드 */}
                {(() => {
                  const cur = safeNum(analyzeResult.current_price ?? analyzeResult.price) ?? 0;
                  const tgt = safeNum(analyzeResult.target);
                  const stp = safeNum(analyzeResult.stop_loss);
                  const b1  = cur > 0 ? Math.round(cur * 0.99) : null;
                  const b2  = cur > 0 ? Math.round(cur * 0.98) : null;
                  const aiConf = analyzeResult.confidence_score ?? analyzeResult.ai_score ?? null;
                  const risk = analyzeResult.risk_level ?? (aiConf >= 70 ? '낮음' : aiConf >= 50 ? '중간' : '높음');
                  const riskColor = risk === '낮음' || risk === 'low' ? 'var(--color-success)' : risk === '중간' || risk === 'medium' ? 'var(--color-warning)' : 'var(--color-danger)';
                  const riskPct   = risk === '낮음' || risk === 'low' ? 30 : risk === '중간' || risk === 'medium' ? 60 : 90;
                  const pctStr = (base, val) => base > 0 && val > 0 ? `현재가 ${val >= base ? '+' : ''}${((val/base-1)*100).toFixed(1)}%` : '';

                  const levels = [
                    { label: '현재가',  price: cur,  color: 'var(--color-ink)' },
                    { label: '1차 매수', price: b1,  color: 'var(--color-primary)' },
                    { label: '2차 매수', price: b2,  color: 'var(--color-primary)' },
                    { label: '손절',    price: stp,  color: 'var(--color-danger)' },
                    { label: '목표가',  price: tgt,  color: 'var(--color-success)' },
                  ];

                  return (
                    <section className="pwa-card" style={{ marginTop: 0 }}>
                      <span className="pwa-card-label">📋 AI 액션 플랜</span>
                      {/* 가격레벨 타임라인 */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 0, marginTop: 12 }}>
                        {levels.map((lv, li) => (
                          lv.price > 0 ? (
                            <div key={lv.label}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
                                <span style={{ width: 10, height: 10, borderRadius: '50%', background: lv.color, flexShrink: 0, display: 'inline-block', boxShadow: `0 0 0 2px ${lv.color}30` }} />
                                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: lv.color, minWidth: 60 }}>{lv.label}</span>
                                <span style={{ fontSize: '0.82rem', fontFamily: 'var(--font-mono)', color: lv.color, fontWeight: 800, flex: 1 }}>
                                  {lv.price.toLocaleString()}원
                                </span>
                                {li > 0 && cur > 0 && lv.price > 0 && (
                                  <span style={{ fontSize: '0.68rem', color: 'var(--color-ink-3)', flexShrink: 0 }}>
                                    {lv.price >= cur ? '+' : ''}{((lv.price / cur - 1) * 100).toFixed(1)}%
                                  </span>
                                )}
                              </div>
                              {li < levels.length - 1 && (
                                <div style={{ width: 1, height: 10, background: 'var(--border)', marginLeft: 4.5, marginBottom: 0 }} />
                              )}
                            </div>
                          ) : null
                        ))}
                      </div>
                      {/* 리스크 바 */}
                      <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                            <span style={{ color: 'var(--text-secondary)' }}>리스크</span>
                            <span style={{ color: riskColor, fontWeight: 700 }}>{risk}</span>
                          </div>
                          <div style={{ height: 6, background: 'var(--inset-bg)', borderRadius: 3, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${riskPct}%`, background: riskColor, borderRadius: 3 }} />
                          </div>
                        </div>
                        {aiConf != null && (
                          <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                              <span style={{ color: 'var(--text-secondary)' }}>AI 확신도 {confidenceStars(aiConf)}</span>
                              <span style={{ color: 'var(--color-primary)', fontWeight: 700 }}>{aiConf}%</span>
                            </div>
                            <div style={{ height: 6, background: 'var(--inset-bg)', borderRadius: 3, overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${aiConf}%`, background: 'var(--color-primary)', borderRadius: 3 }} />
                            </div>
                          </div>
                        )}
                      </div>
                    </section>
                  );
                })()}

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
                  {analyzeExpanded ? 'AI 분석 보기 접기 ▲' : 'AI 분석 보기 (기술/매크로) ▼'}
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
              {/* [v10 UI 시안] 계좌 현황 — 다크 네이비 계좌 히어로(onehub-stock 보유탭) */}
              <section className="acc-hero">
                <div className="acc-hero-top">
                  <span className="acc-hero-lbl">💳 계좌 현황 · 트레이더 {trader}</span>
                  {portReturnPct !== null && (
                    <span className={`acc-badge ${portReturnPct >= 0 ? 'up' : 'down'}`}>{portReturnPct >= 0 ? '+' : ''}{portReturnPct.toFixed(2)}%</span>
                  )}
                </div>
                <div className="acc-hero-total mono">{data.balance?.total_asset?.toLocaleString() ?? '-'}<span>원</span></div>
                <div className="acc-hero-sub">
                  평가손익 <b className={(data.balance?.unrealized_pnl ?? 0) >= 0 ? 'up' : 'dn'}>{(data.balance?.unrealized_pnl ?? 0) >= 0 ? '+' : ''}{data.balance?.unrealized_pnl?.toLocaleString() ?? '-'}원</b>
                  {todayPnl !== null && <> · 오늘 변동 <b className={todayPnl >= 0 ? 'up' : 'dn'}>{todayPnl >= 0 ? '+' : ''}{Number(todayPnl).toLocaleString()}원</b></>}
                </div>
                <div className="acc-chips">
                  <div className="acc-chip"><span>예수금</span><b>{data.balance?.cash?.toLocaleString() ?? '-'}원</b></div>
                  <div className="acc-chip"><span>실현손익</span><b>{data.balance?.realized_pnl?.toLocaleString() ?? '-'}원</b></div>
                </div>
              </section>
              <section className="pwa-card">
                <span className="pwa-card-label">보유 종목</span>
                {positions.length === 0
                  ? <div className="pwa-empty">보유 종목 없음</div>
                  : <div className="position-cards">{positions.map((p,i) => (
                      <div key={i} className="position-card">
                        {/* [v10 UI §5④] 중복 'AI 분석 보기' 버튼 제거 — 상단은 손익 배지만, 분석 버튼은 하단 액션행에 1개로 통일 */}
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
                              <span className="bull">
                                {safeLocale(p.target, '원')}
                                {/* [v9.0][15] 목표가 대비 남은 상승여력 */}
                                {safeNum(p.current_price) > 0 && (
                                  <span style={{ fontSize: '0.7rem', marginLeft: 4 }}>
                                    (+{((p.target / p.current_price - 1) * 100).toFixed(1)}% 남음)
                                  </span>
                                )}
                              </span>
                            </div>
                          )}
                          {safeNum(p.stop_loss) > 0 && (
                            <div className="position-card-cell">
                              <span className="dim">손절가</span>
                              <span className="bear">{safeLocale(p.stop_loss, '원')}</span>
                            </div>
                          )}
                        </div>
                        {/* [v8.7] 지표 한줄 요약 */}
                        {(p.rsi != null || p.macd != null || p.atr != null || p.ml_score != null) && (
                          <div className="position-indicator-row">
                            {p.rsi != null && <span>RSI {p.rsi}</span>}
                            {p.macd != null && <span>MACD {p.macd > 0 ? '+' : ''}{p.macd}</span>}
                            {p.atr != null && <span>ATR {p.atr}</span>}
                            {p.ml_score != null && <span style={{ fontWeight: 700, color: 'var(--color-primary)' }}>AI {p.ml_score}</span>}
                          </div>
                        )}
                        {/* [§3-4 피드백8] AI 스탠스 + 근거 1줄 인라인 */}
                        {(() => { const st = deriveStance(p); return (
                          <div className="pos-stance">
                            <span className="pos-stance-badge" style={{ color: st.color, borderColor: st.color }}>🤖 {st.label}</span>
                            <span className="pos-stance-reason">{st.reason}</span>
                          </div>
                        ); })()}
                        {(() => {
                          // [§3-4] 상태 배지는 위 AI 스탠스로 통합(중복 제거) — 여기선 액션 버튼만
                          const posKey = p.code || i;
                          return (
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginTop: 8, gap: 5 }}>
                                <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
                                  <button
                                    style={{ fontSize: '0.68rem', padding: '3px 9px', borderRadius: 8, background: 'var(--inset-bg)', color: 'var(--text-secondary)', border: '1px solid var(--border)', cursor: 'pointer', fontFamily: 'var(--font-body)' }}
                                    onClick={() => setBottomSheet({
                                      name: p.name, code: p.code,
                                      scores: deriveScores(p), // 종목별 실제 신호로 서브점수 재계산(상수 표기 방지)
                                      final_score: deriveScores(p).final, // 4개 지표 가중 평균(서브점수와 일관)
                                      win_rate: p.win_rate ?? null,
                                      reasons: [
                                        ...(p.reason ? [{ text: p.reason, positive: true }] : []),
                                        ...(p.pnl_rate != null ? [{ text: `현재 ${p.pnl_rate >= 0 ? '+' : ''}${p.pnl_rate}% 수익중`, positive: p.pnl_rate >= 0 }] : []),
                                      ],
                                    })}
                                  >
                                    AI 분석 보기
                                  </button>
                                  <button
                                    className={`sell-btn${sellConfirm[posKey] ? ' confirm' : ''}`}
                                    disabled={sellLoading[posKey]}
                                    style={{ fontSize: '0.68rem', padding: '3px 9px', borderRadius: 8, border: 'none', cursor: sellLoading[posKey] ? 'default' : 'pointer', fontFamily: 'var(--font-body)', fontWeight: 700, background: sellConfirm[posKey] ? 'var(--color-danger)' : 'var(--color-danger-soft)', color: sellConfirm[posKey] ? '#fff' : 'var(--color-danger)', opacity: sellLoading[posKey] ? 0.6 : 1 }}
                                    onClick={async () => {
                                      if (!sellConfirm[posKey]) {
                                        setSellConfirm(prev => ({ ...prev, [posKey]: true }));
                                        setTimeout(() => setSellConfirm(prev => { const n = { ...prev }; delete n[posKey]; return n; }), 4000);
                                        return;
                                      }
                                      setSellLoading(prev => ({ ...prev, [posKey]: true }));
                                      setSellConfirm(prev => { const n = { ...prev }; delete n[posKey]; return n; });
                                      try {
                                        const res = await fetch('/api/pwa/sell', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: p.code, trader: trader }) });
                                        const d = await res.json();
                                        alert(d.ok ? `${p.name} 매도 주문 완료` : `매도 실패: ${d.error}`);
                                      } catch(e) { alert('매도 요청 중 오류: ' + e.message); }
                                      setSellLoading(prev => { const n = { ...prev }; delete n[posKey]; return n; });
                                    }}
                                  >
                                    {sellLoading[posKey] ? '처리 중...' : sellConfirm[posKey] ? '정말 매도?' : '매도'}
                                  </button>
                                </div>
                              </div>
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
                  : (<>
                    <div className="blocked-list">{[...new Map(data.today_blocked.map(b=>[b.stock,b])).values()].slice(0,5).map((b,i) => (
                      <div key={i} className="blocked-card">
                        <div className="blocked-top">
                          <span className="blocked-stock">{b.stock}</span>
                          <span className="blocked-signal mono">{blockedLabel(b.signal)}</span>
                        </div>
                        {b.reason && <div className="blocked-reason">{b.reason}</div>}
                        <div className="blocked-unblock">🔓 <b>해제 조건</b> · {unblockCondition(b.reason, b.signal)}</div>
                      </div>))}
                    </div>
                    <button className="blocked-acc" onClick={() => router.push('/pwa/accuracy')}>이 차단들이 맞았는지? 차단 정확도 보기 →</button>
                  </>)}
              </section>
            </>)}
          </main>
        )}

        {/* ── Report Tab ── */}
        {tab === 'report' && (
          <main className="pwa-main">

            {/* [나 vs AI 대결] AI 추천 중 내가 산 것 vs AI 단독매매, 3일·7일 수익 승부 */}
            {(() => {
              const w3 = computeShowdown(ledger, 3);
              const w7 = computeShowdown(ledger, 7);
              const anyReady = w3.ready || w7.ready;
              const recorded = ledger.length;
              const winLabel = (w) => w.winner === 'me' ? '내 판단 승' : w.winner === 'ai' ? 'AI 승' : '무승부';
              const winColor = (w) => w.winner === 'me' ? 'var(--color-success)' : w.winner === 'ai' ? 'var(--purple)' : 'var(--color-ink-3)';
              // 종합 승부(3·7일 합산)
              const tally = [w3, w7].filter(w => w.ready);
              const meWins = tally.filter(w => w.winner === 'me').length;
              const aiWins = tally.filter(w => w.winner === 'ai').length;
              const overall = !tally.length ? null : meWins > aiWins ? 'me' : aiWins > meWins ? 'ai' : 'tie';
              const Row = ({ label, w }) => (
                <div className="vs-row">
                  <div className="vs-row-h"><span className="vs-win">{label}</span>{w.ready
                    ? <span className="vs-badge" style={{ color: winColor(w), borderColor: winColor(w) }}>{winLabel(w)}</span>
                    : <span className="vs-pending">집계 중</span>}</div>
                  {w.ready ? (
                    <div className="vs-bars">
                      <div className="vs-side">
                        <span className="vs-name">🙋 내 판단</span>
                        <span className="vs-ret" style={{ color: w.myRet >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>{w.myRet >= 0 ? '+' : ''}{w.myRet}%</span>
                      </div>
                      <span className="vs-mid">vs</span>
                      <div className="vs-side">
                        <span className="vs-name">🤖 AI 단독</span>
                        <span className="vs-ret" style={{ color: w.aiRet >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>{w.aiRet >= 0 ? '+' : ''}{w.aiRet}%</span>
                      </div>
                    </div>
                  ) : (
                    <div className="vs-pending-txt">판단 후 {label.replace('일','')}일이 지나면 실제 수익으로 채점됩니다.</div>
                  )}
                </div>
              );
              return (
                <section className="pwa-card vs-card">
                  <div className="vs-top">
                    <span className="pwa-card-label" style={{ margin: 0 }}>🥊 나 vs AI 대결 · 누구 판단이 옳았나</span>
                    {overall && <span className="vs-overall" style={{ background: overall === 'me' ? 'var(--color-success-soft)' : overall === 'ai' ? 'var(--purple-soft, var(--color-primary-soft))' : 'var(--color-card-soft)', color: overall === 'me' ? 'var(--color-success-ink, var(--color-success))' : overall === 'ai' ? 'var(--purple)' : 'var(--color-ink-2)' }}>{overall === 'me' ? '🏆 내 판단 우세' : overall === 'ai' ? '🏆 AI 우세' : '⚖️ 접전'}</span>}
                  </div>
                  <div className="vs-def">AI 추천 종목 중 <b>내가 산 것</b>(내 판단)과 <b>AI가 전부 매매</b>했을 때(AI 단독)의 수익을 3일·7일로 비교합니다. 승인=매매 · 거절=관망으로 기록됩니다.</div>
                  {anyReady ? (
                    <>
                      <Row label="3일" w={w3} />
                      <Row label="7일" w={w7} />
                      {(w7.ready ? w7 : w3).details?.length > 0 && (() => {
                        const w = w7.ready ? w7 : w3;
                        return (
                          <div className="vs-detail">
                            <div className="vs-detail-h">종목별 판단 결과 ({w7.ready ? '7일' : '3일'})</div>
                            {w.details.slice(0, 6).map((d, i) => (
                              <div className="vs-drow" key={i}>
                                <span className="vs-dname">{d.name}</span>
                                <span className={`vs-dtag ${d.decision === 'take' ? 'take' : 'pass'}`}>{d.decision === 'take' ? '내가 삼' : '지나침'}</span>
                                <span className="vs-dret mono" style={{ color: d.ret >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>{d.ret >= 0 ? '+' : ''}{d.ret}%</span>
                                <span className="vs-dok">{d.correct ? '✓' : '✗'}</span>
                              </div>
                            ))}
                            <p className="vs-foot">✓ = 판단 적중(산 게 오르거나 · 지나친 게 내림) · ✗ = 오판. AI 단독은 추천 전부를 매매했다고 가정합니다.</p>
                          </div>
                        );
                      })()}
                    </>
                  ) : (
                    <div className="vs-empty">
                      <div className="vs-empty-ic">🥊</div>
                      <div className="vs-empty-t">{recorded > 0 ? `판단 ${recorded}건 기록됨 · 성과 집계 중` : '아직 기록된 판단이 없습니다'}</div>
                      <div className="vs-empty-s">추천 탭에서 AI 매매 제안을 <b>승인(매매)</b> 또는 <b>거절(관망)</b>하면 판단이 기록되고, <b>3일·7일 뒤</b> 실제 수익으로 나 vs AI 승부가 자동 채점됩니다.</div>
                      <button className="vs-empty-btn" onClick={() => setTab('recommend')}>추천 보러 가기 →</button>
                    </div>
                  )}
                </section>
              );
            })()}

            {/* [v9.0] 🎬 오늘 AI 분석 흐름 타임라인 */}
            {data && (() => {
              const regime = data.market?.regime ?? '-';
              const heat   = data.market?.heat_score ?? '-';
              const fearGreed = data.market?.fear_greed ?? '-';
              const candidates = data.screening_candidates ?? [];
              const blocked = (data.blocked_stocks ?? []).slice(0, 3);
              const buys = (data.recommend_stocks ?? []).filter(s => (s.score ?? 0) >= 70).slice(0, 2);
              const kst = new Date(Date.now() + 9*60*60*1000);
              const fmtTime = (d, offsetMin) => {
                const t = new Date(d.getTime() - offsetMin * 60 * 1000);
                return `${String(t.getUTCHours()).padStart(2,'0')}:${String(t.getUTCMinutes()).padStart(2,'0')}`;
              };
              const now = fmtTime(kst, 0);
              const steps = [
                {
                  icon: '🔍', time: '08:50',
                  title: '시장 분석 시작',
                  desc: `Regime: ${regime} / Heat: ${heat} / 공포탐욕: ${fearGreed}`,
                },
                {
                  icon: '📊', time: '08:51',
                  title: `${candidates.length > 0 ? candidates.length : 131}종목 스크리닝`,
                  desc: `후보: ${candidates.length}종목 선별`,
                },
                ...(blocked.length > 0 ? [{
                  icon: '🤖', time: '08:52',
                  title: 'AI 심층 분석',
                  desc: blocked.map(b => `${b.name ?? b.code} → 차단`).join(' · ') + (buys.length > 0 ? ' / ' + buys.map(b => `${b.name ?? b.code} → 추천`).join(' · ') : ''),
                }] : []),
                {
                  icon: '✅', time: '08:53',
                  title: '최종 결정',
                  desc: `매수 ${(data.recommend_stocks ?? []).filter(s => (s.score ?? 0) >= 70).length}건 / 차단 ${blocked.length}건 — ${regime === 'BEAR' ? '관망 결정' : '선별 실행'}`,
                },
              ];
              return (
                <section className="acc-hero">
                  <div className="acc-hero-lbl" style={{ marginBottom: 4 }}>🎬 오늘 AI 분석 흐름</div>
                  <div style={{ marginTop: 12, position: 'relative', paddingLeft: 20 }}>
                    {/* 타임라인 선 */}
                    <div style={{ position: 'absolute', left: 7, top: 8, bottom: 8, width: 2, background: 'var(--hero-fill-line)', borderRadius: 1 }} />
                    {steps.map((s, i) => (
                      <div key={i} style={{ position: 'relative', marginBottom: i < steps.length - 1 ? 18 : 0 }}>
                        {/* 점 */}
                        <div style={{ position: 'absolute', left: -16, top: 4, width: 8, height: 8, borderRadius: '50%', background: 'var(--hero-accent)', border: '2px solid var(--hero-grad-1)' }} />
                        <div style={{ fontSize: '0.68rem', color: 'var(--hero-ink-sub)', fontFamily: 'var(--font-mono)', marginBottom: 2 }}>{s.time} KST</div>
                        <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--hero-ink)', marginBottom: 2 }}>
                          {s.icon} {s.title}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--hero-ink-soft)', lineHeight: 1.4 }}>{s.desc}</div>
                      </div>
                    ))}
                  </div>
                </section>
              );
            })()}

            {/* [기록] AI 학습 현황 — ML 자기검증: 누적 기록 + 사유별 학습 정확도 + 최근 검증 결과(기록 누적·발전 스토리) */}
            {accuracy?.ok && (() => {
              const s = accuracy.summary || {};
              const pct = s.accuracy_pct;
              const checked = s.total_checked ?? 0;
              const ready = pct != null && checked >= 5;
              const pctColor = pct == null ? 'var(--text-secondary)'
                : pct >= 70 ? 'var(--color-success)' : pct >= 50 ? 'var(--color-warning)' : 'var(--color-danger)';
              const rColor = (p) => (p ?? 0) >= 70 ? 'var(--color-success)' : (p ?? 0) >= 50 ? 'var(--color-warning)' : 'var(--color-danger)';
              const topReasons = (accuracy.by_reason || []).filter(r => (r.total ?? 0) > 0)
                .sort((a, b) => (b.accuracy_pct ?? 0) - (a.accuracy_pct ?? 0)).slice(0, 3);
              const recent = (accuracy.recent || []).slice(0, 3);
              return (
                <section className="pwa-card">
                  <span className="pwa-card-label">🧠 AI 학습 현황 · ML 자기검증</span>
                  <div className="ml-accum">
                    <div className="ml-accum-item"><b>{s.total_blocked ?? 0}</b><span>누적 판단 기록</span></div>
                    <div className="ml-accum-item"><b>{checked}</b><span>검증 완료</span></div>
                    <div className="ml-accum-item"><b style={{ color: pctColor }}>{pct != null ? `${pct}%` : '—'}</b><span>적중률</span></div>
                  </div>
                  {ready ? (
                    <>
                      <div className="ml-bar"><div style={{ width: `${pct}%`, background: pctColor }} /></div>
                      <p className="ml-desc">AI는 매주 과거 판단을 <b>실제 주가 결과와 대조</b>해 스스로 채점합니다. 누적 <b>{s.total_blocked ?? 0}건</b>의 기록으로 사유별 정확도를 학습해 판단 로직을 지속 보정합니다.</p>
                      {topReasons.length > 0 && (
                        <div className="ml-reasons">
                          <div className="ml-reasons-h">🔬 근거별 학습 정확도 (ML이 신뢰하는 신호)</div>
                          {topReasons.map((r, i) => (
                            <div className="ml-reason" key={i}>
                              <span className="ml-reason-t">{r.reason || '(미분류)'}</span>
                              <span className="ml-reason-v" style={{ color: rColor(r.accuracy_pct) }}>{r.accuracy_pct ?? 0}%<em>{r.success}/{r.total}건</em></span>
                            </div>
                          ))}
                        </div>
                      )}
                      {recent.length > 0 && (
                        <div className="ml-recent">
                          <div className="ml-reasons-h" style={{ marginBottom: 4 }}>🗂 최근 검증 결과 (기록)</div>
                          {recent.map((r, i) => {
                            const ok = r.result === 'SUCCESS';
                            const neu = r.result === 'NEUTRAL' || !r.result;
                            return (
                              <div key={i} className="ml-rec-row">
                                <div className="ml-rec-l"><span className="ml-rec-name">{r.stock}</span><span className="ml-rec-rsn">{(r.block_reason || '').split(' / ')[0]}</span></div>
                                <div className="ml-rec-r">
                                  {r.price_change_pct != null && <span className="mono ml-rec-chg">{r.price_change_pct > 0 ? '+' : ''}{r.price_change_pct.toFixed(1)}%</span>}
                                  <span className="ml-rec-badge" style={{ color: neu ? 'var(--text-secondary)' : ok ? 'var(--color-success)' : 'var(--color-danger)' }}>{neu ? '― 보류' : ok ? '✓ 적중' : '✗ 오판'}</span>
                                </div>
                              </div>
                            );
                          })}
                          <p className="ml-foot">적중=차단 후 하락 · 오판=차단 후 상승 · 보류=보합. 차단 3거래일 후 실제가로 자동 검증.</p>
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="ml-desc">차단·판단 기록을 모으는 중입니다. 누적 <b>{s.total_blocked ?? 0}건</b> — 검증 <b>5건</b> 이상 쌓이면 학습 정확도가 표시됩니다. AI는 매주 판단을 실제 결과로 재검증하며 발전합니다.</p>
                  )}
                  <button className="ml-more" onClick={() => router.push('/pwa/accuracy')}>전체 자기검증 내역 · 사유별 적중 보기 →</button>
                </section>
              );
            })()}

            {/* [§3-5 피드백10] AI 개선노트 — 자기검증 결과로 규칙을 어떻게 조정했나(사람 언어) */}
            {accuracy?.ok && accuracy.by_reason?.length > 0 && (() => {
              const reasons = accuracy.by_reason.filter(r => (r.total ?? 0) >= 2);
              const strong = reasons.filter(r => (r.accuracy_pct ?? 0) >= 65).sort((a, b) => (b.accuracy_pct ?? 0) - (a.accuracy_pct ?? 0));
              const weak = reasons.filter(r => (r.accuracy_pct ?? 0) < 50).sort((a, b) => (a.accuracy_pct ?? 0) - (b.accuracy_pct ?? 0));
              const notes = [];
              strong.slice(0, 2).forEach(r => notes.push({ icon: '✅', kind: '유지·강화', text: `${r.reason} 필터 정확도 ${r.accuracy_pct}% — 신뢰도 높아 가중치 유지` }));
              weak.slice(0, 2).forEach(r => notes.push({ icon: '🔧', kind: '재조정 검토', text: `${r.reason} 필터 정확도 ${r.accuracy_pct}% — 오판 줄이도록 임계값 재조정 검토` }));
              if (notes.length === 0) notes.push({ icon: '🧭', kind: '관찰', text: `검증 데이터 축적 중 — 사유별 정확도가 안정되면 필터 가중치를 조정합니다` });
              const total = accuracy.summary?.total_checked ?? 0;
              return (
                <section className="pwa-card">
                  <span className="pwa-card-label">📝 AI 개선노트 · 이번 주 조정</span>
                  <p className="chlog-intro">누적 검증 <b>{total}건</b>을 반영해 AI가 스스로 판단 규칙을 이렇게 조정하고 있습니다.</p>
                  <div className="chlog-list">
                    {notes.map((n, i) => (
                      <div className="chlog-row" key={i}>
                        <span className="chlog-ic">{n.icon}</span>
                        <div className="chlog-body"><span className="chlog-kind">{n.kind}</span><span className="chlog-text">{n.text}</span></div>
                      </div>
                    ))}
                  </div>
                  <p className="chlog-foot">※ 규칙·가중치 변경을 사람 언어로 요약. 실제 파라미터는 매주 자동 재학습 시 반영됩니다.</p>
                </section>
              );
            })()}

            {/* [§3-5 item3] AI 성적표 — 이번주 요약을 성적표로 격상(승률·차단적중률·손익비·MDD) */}
            <section className="pwa-card">
              <span className="pwa-card-label">🏆 AI 성적표 · 이번 주</span>
              {!perf ? (
                <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
                  이번 주 데이터 수집 중...
                </div>
              ) : (() => {
                const accPct = accuracy?.summary?.accuracy_pct;
                const accChecked = accuracy?.summary?.total_checked;
                const winColor = (perf.win_rate ?? 0) >= 60 ? 'var(--color-success)' : (perf.win_rate ?? 0) >= 45 ? 'var(--color-warning)' : 'var(--color-danger)';
                const accColor = accPct == null ? 'var(--text-secondary)' : accPct >= 60 ? 'var(--color-success)' : accPct >= 45 ? 'var(--color-warning)' : 'var(--color-danger)';
                const rr = perf.rr_ratio;
                const rrColor = rr == null ? 'var(--text-secondary)' : rr >= 1.5 ? 'var(--color-success)' : rr >= 1 ? 'var(--color-warning)' : 'var(--color-danger)';
                const tiles = [
                  { k: '승률', v: perf.win_rate != null ? `${perf.win_rate}%` : '-', sub: `${perf.wins ?? 0}승 ${perf.losses ?? 0}패`, c: winColor },
                  { k: '차단 적중률', v: accPct != null ? `${accPct}%` : '수집중', sub: accChecked != null ? `검증 ${accChecked}건` : '누적 필요', c: accColor },
                  { k: '손익비 (R:R)', v: rr != null ? `${rr}` : '-', sub: '이익/손실', c: rrColor },
                  { k: 'MDD', v: perf.mdd != null ? `-${perf.mdd}%` : '-', sub: '최대낙폭', c: 'var(--color-danger)' },
                ];
                return (
                  <>
                    <div className="scorecard">
                      {tiles.map((t) => (
                        <div className="sc-tile" key={t.k}>
                          <span className="sc-k">{t.k}</span>
                          <span className="sc-v" style={{ color: t.c }}>{t.v}</span>
                          <span className="sc-sub">{t.sub}</span>
                        </div>
                      ))}
                    </div>
                    <div className="sc-summary">
                      이번 주 수익률 <b style={{ color: (perf.avg_pnl_pct ?? 0) >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>{(perf.avg_pnl_pct ?? 0) >= 0 ? '+' : ''}{perf.avg_pnl_pct ?? 0}%</b> · AI는 <b>{perf.wins ?? 0}종목 매수</b>, <b>{perf.losses ?? 0}건 손절</b>했습니다.
                    </div>
                  </>
                );
              })()}
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
                <span className="pwa-card-label">📊 AI 성적표 · 최근 30일</span>
                {perf.total < 5 ? (
                  <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--text-secondary)' }}>
                    <div style={{ fontSize: '1.5rem', marginBottom: 6 }}>📊</div>
                    <div style={{ fontSize: '0.85rem' }}>데이터 수집 중</div>
                    <div style={{ fontSize: '0.75rem', marginTop: 4, color: 'var(--text-muted)' }}>
                      {perf.total}건 / 최소 5건 이상 거래 후 통계가 표시됩니다
                    </div>
                  </div>
                ) : (<>
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

                  {/* [v8.7] 성과 시각화 — 누적수익률 라인 + 승률 파이 + MDD 바 */}
                  <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 12, alignItems: 'center' }}>
                    {/* 누적수익률 스파크라인 (SVG inline) */}
                    {(() => {
                      const series = perf.daily_series;
                      if (!series || series.length < 2) return (
                        <div style={{ height: 60, background: 'var(--inset-bg)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>그래프 준비 중</div>
                      );
                      const vals = series.map(s => s.cumReturn ?? 0);
                      const min = Math.min(...vals), max = Math.max(...vals);
                      const range = max - min || 1;
                      const W = 160, H = 56;
                      const pts = vals.map((v, i) => {
                        const x = (i / (vals.length - 1)) * W;
                        const y = H - ((v - min) / range) * (H - 8) - 4;
                        return `${x},${y}`;
                      }).join(' ');
                      const lastVal = vals[vals.length - 1];
                      const color = lastVal >= 0 ? 'var(--color-success)' : 'var(--color-danger)';
                      return (
                        <div>
                          <div style={{ fontSize: '0.62rem', color: 'var(--text-tertiary)', marginBottom: 2 }}>누적수익률</div>
                          <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }}>
                            <polyline fill="none" stroke={color} strokeWidth="2" points={pts} strokeLinejoin="round" strokeLinecap="round" />
                            <line x1="0" y1={H - 4 - ((0 - min) / range) * (H - 8)} x2={W} y2={H - 4 - ((0 - min) / range) * (H - 8)} stroke="var(--color-ink-3)" strokeWidth="0.5" strokeDasharray="3,2" />
                          </svg>
                          <div style={{ fontSize: '0.7rem', fontWeight: 700, color, textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                            {lastVal >= 0 ? '+' : ''}{lastVal.toFixed(1)}%
                          </div>
                        </div>
                      );
                    })()}
                    {/* 승률 도넛 (SVG inline) */}
                    {(() => {
                      const wr = perf.win_rate ?? 50;
                      const r = 22, cx = 28, cy = 28, stroke = 6;
                      const circ = 2 * Math.PI * r;
                      const filled = (wr / 100) * circ;
                      return (
                        <div style={{ textAlign: 'center', flexShrink: 0 }}>
                          <div style={{ fontSize: '0.62rem', color: 'var(--text-tertiary)', marginBottom: 2 }}>승률</div>
                          <svg width="56" height="56" viewBox="0 0 56 56">
                            <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--inset-bg)" strokeWidth={stroke} />
                            <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--color-success)" strokeWidth={stroke}
                              strokeDasharray={`${filled} ${circ}`} strokeLinecap="round"
                              transform={`rotate(-90 ${cx} ${cy})`} />
                            <text x={cx} y={cy + 4} textAnchor="middle" fontSize="10" fontWeight="800" fill="var(--color-success)" fontFamily="monospace">{wr}%</text>
                          </svg>
                        </div>
                      );
                    })()}
                    {/* MDD 바 */}
                    {(() => {
                      const mdd = Math.abs(perf.mdd ?? 0);
                      const dangerPct = Math.min(100, mdd * 5);
                      return (
                        <div style={{ flexShrink: 0, textAlign: 'center' }}>
                          <div style={{ fontSize: '0.62rem', color: 'var(--text-tertiary)', marginBottom: 2 }}>MDD</div>
                          <div style={{ width: 12, height: 52, background: 'var(--inset-bg)', borderRadius: 6, overflow: 'hidden', position: 'relative', margin: '0 auto' }}>
                            <div style={{ position: 'absolute', bottom: 0, width: '100%', height: `${dangerPct}%`, background: 'var(--color-danger)', borderRadius: 6 }} />
                          </div>
                          <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--color-danger)', marginTop: 2, fontFamily: 'var(--font-mono)' }}>-{mdd}%</div>
                        </div>
                      );
                    })()}
                  </div>
                </>)}
              </section>
            )}
            <section className="pwa-card">
              <span className="pwa-card-label">📂 상세 리포트</span>
              <div className="report-list">
                {[
                  ['/daily', '📅', '일간 리포트', '매일 장 마감 요약'],
                  ['/weekly', '📊', '주간 리포트', 'MDD · 승률 · 손익비'],
                  ['/history', '🤖', 'AI 히스토리', 'AI 판단 기록 전체'],
                  ['/heat-history', '🌡️', '히트 히스토리', '시장 과열도 추이'],
                ].map(([href, icon, title, desc]) => (
                  <Link href={href} key={href} className="report-row">
                    <span className="report-row-icon">{icon}</span>
                    <span className="report-row-text"><b>{title}</b><span>{desc}</span></span>
                    <span className="report-row-arrow">›</span>
                  </Link>
                ))}
              </div>
            </section>
            {data && (<>
              <section className="pwa-card">
                <span className="pwa-card-label">오늘 요약</span>
                <div className="report-kpi-grid">
                  {[
                    { label: 'Regime',   val: data.market?.regime ?? '-',    style: { color: regimeClass(data.market?.regime) === 'bull' ? 'var(--accent-buy)' : regimeClass(data.market?.regime) === 'bear' ? 'var(--accent-sell)' : 'var(--accent-warn)' } },
                    { label: 'Heat',     val: `${heat ?? '-'}`,              style: { color: heatColor(heat) } },
                    { label: '공포탐욕', val: fearGreed != null ? `${fearGreed} (${fgLabel(fearGreed)})` : '-', style: { color: fgColor(fearGreed) } },
                    { label: '매수',     val: `${buyCount}건`,               style: { color: 'var(--accent-buy)' } },
                    { label: '차단',     val: `${blockCount}건`,             style: { color: 'var(--accent-sell)' } },
                    { label: '실현손익', val: `${(data.balance?.realized_pnl ?? 0).toLocaleString()}원`, style: { color: (data.balance?.realized_pnl ?? 0) >= 0 ? 'var(--accent-buy)' : 'var(--accent-sell)' } },
                  ].map(({ label, val, style }) => (
                    <div key={label} className="report-kpi-item">
                      <span className="report-kpi-label">{label}</span>
                      <span className="report-kpi-val" style={style}>{val}</span>
                    </div>
                  ))}
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

            {/* [v9.0] 투자 성향 예상 결과 */}
            {(() => {
              const PROFILE_STATS = {
                conservative: { label: '보수형', icon: '🛡️', trades: '2~4회', stop: '-3%', hold: '14~21일', risk: '낮음', riskColor: 'var(--color-success)' },
                balanced:     { label: '균형형', icon: '⚖️', trades: '4~8회', stop: '-5%', hold: '7~14일',  risk: '중간', riskColor: 'var(--color-warning)' },
                aggressive:   { label: '공격형', icon: '🚀', trades: '8~15회',stop: '-7%', hold: '3~7일',   risk: '높음', riskColor: 'var(--color-danger)' },
              };
              const ps = PROFILE_STATS[profile.style] || PROFILE_STATS.balanced;
              return (
                <section className="pwa-card">
                  <span className="pwa-card-label">📊 내 투자 성향 예상 결과</span>
                  <div style={{ marginTop: 10, padding: '12px 14px', background: 'var(--inset-bg)', borderRadius: 12 }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 700, color: ps.riskColor, marginBottom: 10 }}>
                      {ps.icon} {ps.label} 선택 시
                    </div>
                    {[
                      { label: '예상 월 거래횟수', value: ps.trades },
                      { label: '평균 손절 기준',   value: ps.stop },
                      { label: '평균 보유 기간',   value: ps.hold },
                      { label: '리스크 수준',      value: `${ps.risk} ${ps.risk === '낮음' ? '🟢' : ps.risk === '중간' ? '🟡' : '🔴'}` },
                    ].map(row => (
                      <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>{row.label}</span>
                        <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{row.value}</span>
                      </div>
                    ))}
                    <p style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', marginTop: 10, lineHeight: 1.5 }}>
                      * 실제 결과는 시장 상황에 따라 달라질 수 있습니다.
                    </p>
                  </div>
                </section>
              );
            })()}

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
                  <button className={trader==='A'?'active':''} onClick={()=>{ setTrader('A'); setTraderGlobal('A'); }}>A</button>
                  <button className={trader==='B'?'active':''} onClick={()=>{ setTrader('B'); setTraderGlobal('B'); }}>B</button>
                </div>
              </div>
              <div className="profile-app-row" style={{ marginTop:10 }}>
                <span>테마</span>
                <button className="pwa-theme-toggle" onClick={toggleTheme}
                  style={{ fontSize:'0.85rem', background:'none', border:'1px solid var(--border)',
                           padding:'4px 10px', borderRadius:8, cursor:'pointer', whiteSpace:'nowrap',
                           minWidth:88, color:'var(--text-primary)' }}>
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

        {/* ── [v9.0] AI 판단근거 Bottom Sheet ── */}
        {bottomSheet && (<>
          {/* Dimmer */}
          <div
            onClick={() => setBottomSheet(null)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 8999 }}
          />
          {/* Sheet */}
          <div style={{
            position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 9000,
            background: 'var(--card-bg)', borderRadius: '20px 20px 0 0',
            padding: '24px 20px 40px', maxHeight: '80vh', overflowY: 'auto',
            boxShadow: '0 -4px 32px rgba(0,0,0,0.18)',
          }}>
            {/* 헤더 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: 4 }}>📊 AI 판단 근거</div>
                <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {bottomSheet.name} <span style={{ fontSize: '0.8rem', fontWeight: 400, color: 'var(--text-tertiary)' }}>({bottomSheet.code})</span>
                </div>
              </div>
              <button onClick={() => setBottomSheet(null)}
                style={{ background: 'none', border: 'none', fontSize: '1.3rem', cursor: 'pointer', color: 'var(--text-secondary)', lineHeight: 1, padding: '0 4px' }}>✕</button>
            </div>

            {/* [#7 목표가] 백엔드 확정 목표가·손절가 — 상세 시트 최상단 노출 */}
            {(() => {
              const pm = bottomSheet.priceMeta;
              const box = { padding: '12px 14px', background: 'var(--inset-bg)', borderRadius: 12, marginBottom: 14 };
              if (pm === undefined) return (
                <div style={{ ...box, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>🎯 목표가 불러오는 중…</div>
              );
              if (!pm.ok || !pm.tgt) return (
                <div style={{ ...box, fontSize: '0.76rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  🎯 이 종목은 <b style={{ color: 'var(--text-primary)' }}>확정 목표가가 아직 없습니다</b> — 아래 기술 점수·기대 여력(추정)을 참고하세요.
                </div>
              );
              const upside = pm.cur ? (pm.tgt / pm.cur - 1) * 100 : null;
              const risk = (pm.cur && pm.stp) ? (1 - pm.stp / pm.cur) * 100 : null;
              const rr = (upside != null && risk != null && risk > 0) ? upside / risk : null;
              const rrColor = rr == null ? 'var(--text-secondary)' : rr >= 2 ? 'var(--color-success)' : rr >= 1.5 ? 'var(--color-warning)' : 'var(--color-danger)';
              const cell = (label, val, color) => (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <span style={{ fontSize: '0.66rem', color: 'var(--text-secondary)', fontWeight: 700 }}>{label}</span>
                  <span style={{ fontSize: '0.9rem', fontWeight: 800, color, fontFamily: 'var(--font-mono)' }}>{val}</span>
                </div>
              );
              return (
                <div style={box}>
                  <div style={{ fontSize: '0.74rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: 10 }}>🎯 목표가 · 손절가 <span style={{ fontWeight: 600, fontSize: '0.64rem', color: 'var(--text-secondary)' }}>· AI 산출</span></div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                    {cell('현재가', pm.cur ? `${pm.cur.toLocaleString()}원` : '-', 'var(--text-primary)')}
                    {cell('목표가', `${pm.tgt.toLocaleString()}원`, 'var(--color-success)')}
                    {cell('손절가', pm.stp ? `${pm.stp.toLocaleString()}원` : '-', 'var(--color-danger)')}
                  </div>
                  {(upside != null || rr != null) && (
                    <div style={{ display: 'flex', gap: 14, marginTop: 11, paddingTop: 10, borderTop: '1px solid var(--border)', fontSize: '0.74rem', flexWrap: 'wrap' }}>
                      {upside != null && <span style={{ color: 'var(--text-secondary)' }}>상승 여력 <b style={{ color: 'var(--color-success)', fontFamily: 'var(--font-mono)' }}>+{upside.toFixed(1)}%</b></span>}
                      {risk != null && <span style={{ color: 'var(--text-secondary)' }}>손절 위험 <b style={{ color: 'var(--color-danger)', fontFamily: 'var(--font-mono)' }}>-{risk.toFixed(1)}%</b></span>}
                      {rr != null && <span style={{ color: 'var(--text-secondary)' }}>손익비 RR <b style={{ color: rrColor, fontFamily: 'var(--font-mono)' }}>{rr.toFixed(1)}</b></span>}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* 점수 바 4개 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
              {[
                { label: 'Macro',      score: bottomSheet.scores?.macro      ?? null, color: 'var(--color-primary)' },
                { label: 'ML Signal',  score: bottomSheet.scores?.ml         ?? null, color: 'var(--purple)' },
                { label: 'Technical',  score: bottomSheet.scores?.technical  ?? null, color: 'var(--color-primary)' },
                { label: 'Risk',       score: bottomSheet.scores?.risk       ?? null, color: 'var(--color-success)' },
              ].map(({ label, score, color }) => (
                <div key={label}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', marginBottom: 4 }}>
                    <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
                    <span style={{ fontWeight: 700, color, fontFamily: 'var(--font-mono)' }}>
                      {score != null ? `${score}점` : '-'}
                    </span>
                  </div>
                  <div style={{ height: 8, background: 'var(--color-line)', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${score ?? 0}%`, background: color, borderRadius: 4, transition: 'width 0.5s ease' }} />
                  </div>
                </div>
              ))}
            </div>

            {/* 최종 점수 + 등급 */}
            {(() => {
              const fs = bottomSheet.final_score ?? 0;
              const grade = scoreGrade(fs);
              const sc = bottomSheet.scores || {};
              const W = SCORE_WEIGHTS;
              // 최종 의견(자연어): 강점/약점 지표 요약
              const pillars = [['매크로', sc.macro], ['ML 신호', sc.ml], ['기술', sc.technical], ['안전(리스크)', sc.risk]].filter((p) => p[1] != null);
              const strong = pillars.length ? pillars.reduce((a, b) => (b[1] > a[1] ? b : a)) : null;
              const weak = pillars.length ? pillars.reduce((a, b) => (b[1] < a[1] ? b : a)) : null;
              const num = (n) => (n != null ? Number(n) : 0);
              return (
                <>
                  <div style={{ padding: '12px 14px', background: 'var(--inset-bg)', borderRadius: 12, marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                      <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.82rem' }}>최종 점수 <span style={{ fontWeight: 600, fontSize: '0.66rem', color: 'var(--text-secondary)' }}>· 4개 지표 가중 평균</span></span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontWeight: 800, fontSize: '1.05rem', color: grade.color, fontFamily: 'var(--font-mono)' }}>{fs}점</span>
                        <span style={{ fontSize: '0.72rem', fontWeight: 800, color: grade.color, padding: '2px 8px', borderRadius: 6, background: `${grade.color}18`, border: `1px solid ${grade.color}44` }}>{grade.label}</span>
                      </div>
                    </div>
                    <div style={{ height: 8, background: 'var(--color-line)', borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${fs}%`, background: grade.color, borderRadius: 4, transition: 'width 0.5s ease' }} />
                    </div>
                    {strong && weak && (
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.55, marginTop: 9 }}>
                        종합 <b style={{ color: grade.color }}>{grade.label}</b> — <b style={{ color: 'var(--text-primary)' }}>{strong[0]} {strong[1]}점</b> 강점, {weak[0]} {weak[1]}점은 상대적 약점입니다.
                      </div>
                    )}
                  </div>
                  {/* [공신력] 점수 산출식 — 최종 의견 바로 아래에 계산식 공개 */}
                  <div style={{ background: 'var(--inset-bg)', borderRadius: 12, padding: '11px 13px', marginBottom: 14, border: '1px dashed var(--border)' }}>
                    <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-secondary)', marginBottom: 7 }}>🧮 점수 산출식</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', lineHeight: 1.6, fontFamily: 'var(--font-mono)' }}>
                      최종 = 매크로×{W.macro} + ML×{W.ml} + 기술×{W.technical} + 안전×{W.risk}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-primary)', lineHeight: 1.7, fontFamily: 'var(--font-mono)', marginTop: 3 }}>
                      = {num(sc.macro)}×{W.macro} + {num(sc.ml)}×{W.ml} + {num(sc.technical)}×{W.technical} + {num(sc.risk)}×{W.risk}
                    </div>
                    <div style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--color-primary)', fontFamily: 'var(--font-mono)', marginTop: 3 }}>
                      {(() => {
                        const r1 = (n) => Math.round(n * 10) / 10;
                        const parts = [r1(num(sc.macro) * W.macro), r1(num(sc.ml) * W.ml), r1(num(sc.technical) * W.technical), r1(num(sc.risk) * W.risk)];
                        const psum = Math.round(parts.reduce((a, b) => a + b, 0) * 10) / 10;
                        return <>= {parts[0]} + {parts[1]} + {parts[2]} + {parts[3]} = {psum} <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>→</span> <span style={{ color: grade.color }}>{fs}점</span></>;
                      })()}
                    </div>
                    <div style={{ fontSize: '0.66rem', color: 'var(--text-secondary)', marginTop: 8, lineHeight: 1.5 }}>
                      가중치: ML 35% · 기술 30% · 안전(리스크) 20% · 매크로 15%. <b>안전</b>은 값이 높을수록 위험이 낮음을 뜻합니다.{bottomSheet.interest != null ? ` 스크리닝 관심도 ${bottomSheet.interest}점은 별도 지표입니다.` : ''}
                    </div>
                  </div>
                </>
              );
            })()}

            {/* 판단 근거 목록 */}
            {bottomSheet.reasons && bottomSheet.reasons.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 8 }}>판단 근거</div>
                {bottomSheet.reasons.map((r, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: '0.82rem', padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ color: r.positive ? 'var(--color-success)' : 'var(--color-danger)', fontWeight: 700, flexShrink: 0 }}>{r.positive ? '✓' : '✗'}</span>
                    <span style={{ color: 'var(--text-primary)', lineHeight: 1.4 }}>{r.text}</span>
                  </div>
                ))}
              </div>
            )}

            {/* 과거 동일조건 승률 */}
            {bottomSheet.win_rate != null && (
              <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                과거 동일 조건 승률 &nbsp;
                <span style={{ fontWeight: 800, color: bottomSheet.win_rate >= 60 ? 'var(--color-success)' : 'var(--color-warning)', fontFamily: 'var(--font-mono)' }}>
                  {bottomSheet.win_rate}%
                </span>
              </div>
            )}
            {/* [나 vs AI] 상세 시트에서 바로 내 판단 기록 (기록 탭에서 3·7일 뒤 AI와 승부) */}
            {bottomSheet.code && (() => {
              const dec = (decTick, getTodayDecision(bottomSheet.code, trader));
              const hint = bottomSheet.priceMeta?.cur || null;
              return (
                <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 8 }}>🥊 내 판단 기록 <span style={{ fontWeight: 400, color: 'var(--text-tertiary)' }}>· 기록 탭에서 3·7일 뒤 AI와 승부</span></div>
                  <div className="dec-mini lg">
                    <button className={`dec-b take ${dec === 'take' ? 'on' : ''}`} onClick={() => logDecision(bottomSheet.code, bottomSheet.name, 'take', hint)}>{dec === 'take' ? '✓ 샀어요' : '🙋 샀어요'}</button>
                    <button className={`dec-b pass ${dec === 'pass' ? 'on' : ''}`} onClick={() => logDecision(bottomSheet.code, bottomSheet.name, 'pass', hint)}>{dec === 'pass' ? '✓ 관망함' : '🤔 관망'}</button>
                  </div>
                </div>
              );
            })()}
          </div>
        </>)}
      </div>

      <style jsx>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }

        /* [v8.6] 라이트(기본) — Apple Finance / Toss / Notion 톤. */
        /* [v10 UI] 레거시 로컬 변수 → 디자인 토큰 브리지는 globals.css 로 이전(전역·비스코프)해
           styled-jsx 스코프 문제로 다크모드가 안 먹던 버그를 해결. 여기서는 레이아웃만. */
        .pwa-wrapper { max-width: 480px; margin: 0 auto; min-height: 100vh; background: var(--bg); color: var(--text-primary); font-family: var(--font-body); padding-bottom: 40px; transition: background 0.2s ease, color 0.2s ease; }
        button, input { font-family: inherit; }
        button:focus-visible, input:focus-visible { outline: 2px solid var(--accent-info); outline-offset: 2px; }
        :global(.pwa-wrapper a:focus-visible) { outline: 2px solid var(--accent-info); outline-offset: 2px; }
        @media (prefers-reduced-motion: reduce) { .pwa-spinner { animation-duration: 0.001s; } }

        /* Header — 공유 TopNav(.etf 14px + .tn 2px + .tn-hd 4px = 20px)와 기하 통일: 위치·높이 일치 */
        .pwa-header { display: flex; justify-content: space-between; align-items: center; padding: calc(env(safe-area-inset-top, 0px) + 12px) 20px 12px; }
        .pwa-brand { display: flex; align-items: center; gap: 8px; background: none; border: none; padding: 0; cursor: pointer; }
        /* [통일] 로고 글자톤 = PWA 본문/제목색(--color-ink)과 동일 (테마 대응) */
        .pwa-logo { font-family: var(--font-sans); font-weight: 800; font-size: 20px; letter-spacing: -.5px; color: var(--color-ink); }
        .pwa-logo-dot { color: var(--color-success); }
        .pwa-brand-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--accent-buy); flex-shrink: 0; animation: pulse-live 2s ease-in-out infinite; }
        @keyframes pulse-live { 0%{transform:scale(1);opacity:1;} 50%{transform:scale(1.45);opacity:0.5;} 100%{transform:scale(1);opacity:1;} }
        .pwa-title { font-family: var(--font-display); font-size: 1.15rem; font-weight: 800; letter-spacing: 0.04em; color: var(--text-primary); }
        .pwa-header-actions { display: flex; align-items: center; gap: 8px; }
        /* [v10 UI] 헤더 아이콘 = 공유 TopNav(.tn-ic button)와 동일 규격(34px·그림자·무테두리) */
        .pwa-search-toggle, .pwa-theme-toggle { width: 34px; height: 34px; border-radius: 50%; background: var(--color-card); border: none; display: grid; place-items: center; font-size: 15px; cursor: pointer; box-shadow: var(--shadow-card); flex-shrink: 0; }
        .pwa-search-toggle.active { color: var(--color-primary); }
        .pwa-trader-toggle { display: flex; gap: 3px; background: var(--inset-bg); padding: 3px; border-radius: var(--radius-pill); }
        .pwa-trader-toggle button { background: none; border: none; color: var(--text-secondary); padding: 5px 13px; border-radius: var(--radius-pill); cursor: pointer; font-family: var(--font-display); font-size: 0.75rem; font-weight: 700; }
        .pwa-trader-toggle button.active { background: var(--card-bg); color: var(--accent-info); box-shadow: var(--card-shadow); }

        /* Tabs — 공유 TopNav(.tn-tabs/.tn-tab)와 기하·타이포 통일 */
        .pwa-tabs { display: flex; align-items: center; }
        .pwa-tab { flex: 1 1 0; min-width: 0; background: none; border: none; cursor: pointer; color: var(--color-ink-3); font-family: var(--font-sans); font-size: 12.5px; font-weight: 600; letter-spacing: -.4px; }
        /* [v10 UI] 탭 = 흰 라운드 컨테이너 · 활성 = 네이비 pill (시안 통일, TopNav와 16px 인셋 일치) */
        .pwa-tabs { background: var(--color-card); padding: 4px; border-radius: 16px; margin: 0 16px 10px; gap: 2px; box-shadow: var(--shadow-card); }
        .pwa-tab { min-height: 36px; display: flex; align-items: center; justify-content: center; white-space: nowrap; line-height: 1; border-radius: 11px; }
        .pwa-tab.active { background: var(--hero-grad-1); color: #fff; font-weight: 700; border-radius: 11px; box-shadow: none; }
        @media (max-width: 380px) { .pwa-tab { font-size: 11.5px; letter-spacing: -.5px; } }
        :global([data-theme="dark"]) .pwa-tab.active { background: var(--color-primary); }
        /* [v11 IA] 주식 서브탭 (2차 내비) */
        .pwa-subtabs { display: flex; align-items: center; gap: 8px; margin: 0 16px 12px; }
        .pwa-subtab { padding: 9px 20px; background: var(--card-bg); border: none; border-radius: var(--radius-pill, 999px); cursor: pointer; color: var(--text-secondary); font-family: var(--font-display); font-size: 0.78rem; font-weight: 700; box-shadow: var(--card-shadow); }
        .pwa-subtab.active { background: var(--accent-buy); color: #fff; }

        /* Layout */
        .pwa-main { padding: 8px 16px 12px; display: flex; flex-direction: column; gap: 12px; }
        .pwa-card { background: var(--card-bg); border: 1px solid var(--border); border-radius: var(--radius-card); padding: 16px; box-shadow: var(--card-shadow); }
        .pwa-card-label { display: block; font-size: 0.68rem; letter-spacing: 0.08em; color: var(--label-color); text-transform: uppercase; margin-bottom: 10px; font-weight: 700; }

        /* [v10 UI] 홈 히어로 — 다크 네이비 결론 앵커 (시안) */
        .home-hero { background: linear-gradient(135deg, var(--hero-grad-1), var(--hero-grad-2)); color: var(--hero-ink); border-radius: var(--radius-hero); padding: 26px 22px; box-shadow: var(--shadow-float); overflow: hidden; }
        .hh-eyebrow { margin-bottom: 14px; }
        .hh-eyebrow-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
        .hh-label { font-size: 0.8rem; font-weight: 700; color: var(--hero-ink-sub); display: flex; align-items: center; gap: 6px; }
        .hh-live { background: var(--color-success); color: #04351f; font-size: 0.56rem; font-weight: 800; padding: 2px 6px; border-radius: 5px; letter-spacing: .5px; }
        .hh-date { font-size: 0.72rem; color: var(--hero-ink-faint); font-weight: 500; margin-top: 5px; }
        /* [v11-ux] 통합 판단 스코프 배지 + 총자산 + 인라인 왜? */
        .hh-scope { display: inline-block; margin-top: 7px; font-size: 0.64rem; font-weight: 700; color: var(--hero-ink-soft); background: var(--hero-fill); border: 1px solid var(--hero-fill-line); padding: 3px 9px; border-radius: 20px; letter-spacing: .2px; }
        .hh-h1 { font-size: 1.35rem; font-weight: 800; letter-spacing: -.02em; line-height: 1.35; margin-bottom: 10px; color: var(--hero-ink); font-family: var(--font-body); }
        .hh-h1 em { font-style: normal; color: var(--hero-accent); }
        .hh-total { font-size: 0.82rem; color: var(--hero-ink-soft); margin-bottom: 4px; }
        .hh-total b { color: var(--hero-ink); font-weight: 800; font-size: 0.95rem; }
        .hh-total-sub { color: var(--hero-ink-faint); }
        .hh-why { margin-top: 12px; width: 100%; display: flex; align-items: center; justify-content: space-between; background: var(--hero-fill); border: 1px solid var(--hero-fill-line); color: var(--hero-ink-soft); font-family: var(--font-body); font-weight: 700; font-size: 0.8rem; padding: 11px 14px; border-radius: 12px; cursor: pointer; }
        .hh-why-caret { transition: transform .2s; font-size: 0.7rem; }
        .hh-why-caret.open { transform: rotate(180deg); }
        .hh-why-body { margin-top: 10px; padding-top: 12px; border-top: 1px solid var(--hero-fill-line); }
        .hh-reason { font-size: 0.84rem; line-height: 1.6; color: var(--hero-ink-soft); }
        .hh-reason b { color: var(--hero-ink); font-weight: 700; }
        .hh-detail { display: inline-block; margin-top: 12px; font-size: 0.78rem; font-weight: 700; color: var(--hero-accent); cursor: pointer; }
        .hh-foot { display: flex; gap: 8px; margin-top: 14px; flex-wrap: wrap; }
        .hh-chip { background: var(--hero-fill); border: 1px solid var(--hero-fill-line); padding: 6px 11px; border-radius: 20px; font-size: 0.72rem; font-weight: 600; color: var(--hero-ink-soft); display: flex; align-items: center; gap: 5px; }
        .hh-chip .v { color: var(--hero-accent); font-weight: 700; }
        .hh-cta { margin-top: 14px; width: 100%; background: #fff; color: var(--hero-grad-1); border: none; font-family: var(--font-body); font-weight: 700; font-size: 0.86rem; padding: 13px; border-radius: 14px; cursor: pointer; }

        /* [v10 UI 시안] 홈 카드 — onehub-home-redesign.html 구조 일치 */
        .card.v10 { background: var(--color-card); border-radius: var(--radius-hero); padding: 18px; box-shadow: var(--shadow-card); }
        .v10-sect { display: flex; align-items: center; justify-content: space-between; margin-bottom: 13px; }
        .v10-sect h3 { font-size: 15px; font-weight: 700; display: flex; align-items: center; gap: 7px; color: var(--color-ink); }
        .v10-sect a { font-size: 12px; color: var(--color-primary); font-weight: 600; cursor: pointer; }
        .v10-total { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 14px; }
        .v10-total-lbl { font-size: 13px; color: var(--color-ink-2); font-weight: 600; }
        .v10-total-amt { font-size: 26px; font-weight: 800; letter-spacing: -.5px; color: var(--color-ink); }
        .v10-arow { display: flex; align-items: center; justify-content: space-between; padding: 11px 0; border-top: 1px solid var(--color-line); }
        .v10-aname { display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 600; color: var(--color-ink); }
        .v10-adot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
        .v10-aval { font-size: 14px; font-weight: 700; color: var(--color-ink); }
        .v10-miss { display: flex; align-items: center; gap: 8px; }
        .v10-miss-tag { font-size: 11px; font-weight: 700; color: var(--color-ink-3); background: var(--color-card-soft); padding: 4px 8px; border-radius: 8px; }
        .v10-miss-btn { font-family: var(--font-body); font-size: 12px; font-weight: 700; color: var(--color-primary); background: var(--color-primary-soft); border: none; padding: 6px 11px; border-radius: 9px; cursor: pointer; }
        .v10-acts { display: flex; gap: 8px; }
        .v10-act { flex: 1; text-align: center; background: var(--color-card-soft); border-radius: 14px; padding: 13px 4px; }
        .v10-act-n { font-size: 22px; font-weight: 800; line-height: 1; }
        .v10-act-k { font-size: 11px; font-weight: 600; color: var(--color-ink-3); margin-top: 5px; letter-spacing: .3px; }
        .v10-act-note { margin-top: 13px; font-size: 12.5px; color: var(--color-ink-2); background: var(--color-card-soft); border-radius: 12px; padding: 11px 13px; line-height: 1.5; }
        .v10-act-note b { color: var(--color-ink); }
        /* [#3 알림 피드] */
        .v10-noti { margin-top: 13px; border-top: 1px solid var(--color-line); padding-top: 12px; }
        .v10-noti-h { font-size: 12px; font-weight: 700; color: var(--color-ink-2); margin-bottom: 8px; }
        .v10-noti-row { display: flex; align-items: center; gap: 8px; padding: 6px 0; }
        .v10-noti-ic { flex-shrink: 0; font-size: 14px; }
        .v10-noti-tx { flex: 1; font-size: 12.5px; color: var(--color-ink); line-height: 1.4; word-break: keep-all; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
        .v10-noti-ts { flex-shrink: 0; font-size: 10.5px; color: var(--color-ink-3); }
        /* [#4 MarketPulse] */
        .mp { padding: 15px 16px; }
        .mp-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
        .mp-title { display: flex; align-items: center; gap: 7px; font-size: 14px; font-weight: 800; color: var(--color-ink); }
        .mp-live { width: 8px; height: 8px; border-radius: 50%; background: var(--color-success); animation: pulse-live 1.8s ease-in-out infinite; }
        .mp-days { font-size: 11px; font-weight: 700; color: var(--color-ink-3); background: var(--color-card-soft); border-radius: 999px; padding: 3px 10px; }
        .mp-chips { display: grid; grid-template-columns: repeat(3, 1fr); gap: 7px; }
        .mp-chip { display: flex; flex-direction: column; gap: 4px; background: var(--color-card-soft); border-radius: 12px; padding: 9px 8px; border: 1px solid var(--color-line); }
        .mp-chip.bull { border-color: color-mix(in srgb, var(--color-success) 40%, transparent); }
        .mp-chip.bear { border-color: color-mix(in srgb, var(--color-danger) 40%, transparent); }
        .mp-ck { font-size: 10.5px; color: var(--color-ink-3); font-weight: 700; white-space: nowrap; }
        .mp-cv { font-size: 13px; font-weight: 800; color: var(--color-ink); word-break: keep-all; }
        .mp-read { margin-top: 11px; font-size: 12.5px; font-weight: 600; background: var(--color-primary-soft); color: var(--color-primary); border-radius: 10px; padding: 9px 12px; line-height: 1.45; word-break: keep-all; }
        .mp-foot { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
        .mp-tag { font-size: 10.5px; font-weight: 700; color: var(--color-ink-2); background: var(--color-card-soft); border-radius: 999px; padding: 3px 9px; }
        .v10-collap-head { display: flex; align-items: center; justify-content: space-between; cursor: pointer; }
        .v10-basis-txt h3 { font-size: 15px; font-weight: 700; margin-bottom: 5px; color: var(--color-ink); }
        .v10-basis-sum { font-size: 12.5px; color: var(--color-ink-2); font-weight: 500; }
        .v10-basis-sum b { color: var(--color-ink); font-weight: 700; }
        .v10-caret { font-size: 12px; color: var(--color-ink-3); transition: transform .2s; }
        .v10-collap.open .v10-caret { transform: rotate(180deg); }
        .v10-collap-body { max-height: 0; overflow: hidden; transition: max-height .3s ease; }
        .v10-collap.open .v10-collap-body { max-height: 720px; }
        .v10-collap-inner { padding-top: 15px; }
        .v10-metrics { display: flex; gap: 8px; margin-bottom: 15px; }
        .v10-metric { flex: 1; background: var(--color-card-soft); border-radius: 12px; padding: 11px; text-align: center; }
        .v10-mk { font-size: 11px; color: var(--color-ink-3); font-weight: 600; }
        .v10-mv { font-size: 17px; font-weight: 800; margin-top: 3px; color: var(--color-ink); }
        .v10-bar-row { display: flex; align-items: center; gap: 10px; margin-bottom: 9px; }
        .v10-bk { width: 40px; font-size: 12px; font-weight: 700; color: var(--color-ink-2); }
        .v10-track { flex: 1; height: 8px; background: var(--color-line); border-radius: 6px; overflow: hidden; }
        .v10-fill { height: 100%; border-radius: 6px; }
        .v10-bv { width: 40px; text-align: right; font-size: 12px; font-weight: 700; }
        .v10-pick-note { font-size: 11.5px; color: var(--color-ink-3); margin-bottom: 12px; line-height: 1.5; }
        .v10-pick-row { display: flex; align-items: center; justify-content: space-between; padding: 11px 0; border-top: 1px solid var(--color-line); }
        .v10-pick-row:first-of-type { border-top: none; }
        .v10-pick-l { display: flex; align-items: center; gap: 11px; }
        .v10-medal { width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center; font-size: 12px; font-weight: 800; color: #fff; flex-shrink: 0; }
        .v10-pick-name { font-size: 14px; font-weight: 700; display: flex; flex-direction: column; gap: 2px; line-height: 1.2; color: var(--color-ink); }
        .v10-tie { font-size: 11px; color: var(--color-ink-3); font-weight: 500; }
        .v10-pick-r { display: flex; align-items: center; gap: 10px; }
        .v10-pick-score { font-size: 13px; font-weight: 700; color: var(--color-primary); white-space: nowrap; }
        .v10-mini-btn { font-family: var(--font-body); font-size: 11px; font-weight: 600; color: var(--color-ink-2); background: var(--color-card-soft); border: none; padding: 7px 12px; border-radius: 9px; cursor: pointer; line-height: 1.3; text-align: center; }
        .v10-hold-row { display: flex; align-items: center; justify-content: space-between; padding: 12px 0; border-top: 1px solid var(--color-line); }
        .v10-hold-row:first-of-type { border-top: none; }
        .v10-hold-name { font-size: 14px; font-weight: 600; color: var(--color-ink); }
        .v10-hold-pct { font-size: 14px; font-weight: 800; }
        .v10-hold-pct.up { color: var(--color-success); } .v10-hold-pct.down { color: var(--color-danger); }
        .v10-tl { position: relative; padding-left: 20px; }
        .v10-tl::before { content: ""; position: absolute; left: 5px; top: 6px; bottom: 6px; width: 2px; background: var(--color-line); }
        .v10-tl-item { position: relative; padding-bottom: 16px; }
        .v10-tl-item:last-child { padding-bottom: 0; }
        .v10-tl-item::before { content: ""; position: absolute; left: -19px; top: 3px; width: 12px; height: 12px; border-radius: 50%; background: var(--color-card); border: 2.5px solid var(--color-primary); }
        .v10-tl-time { font-size: 11px; color: var(--color-ink-3); font-weight: 600; }
        .v10-tl-title { font-size: 13.5px; font-weight: 700; margin: 2px 0 3px; color: var(--color-ink); }
        .v10-tl-desc { font-size: 12px; color: var(--color-ink-2); line-height: 1.5; }
        .v10-log-group { background: var(--color-card-soft); border-radius: 12px; padding: 12px 14px; display: flex; align-items: center; justify-content: space-between; margin-top: 13px; }
        .v10-log-l { display: flex; align-items: center; gap: 9px; min-width: 0; }
        .v10-log-badge { font-size: 10px; font-weight: 800; color: var(--color-warning-ink); background: var(--color-warning-soft); padding: 3px 7px; border-radius: 6px; flex-shrink: 0; }
        .v10-log-txt { font-size: 12.5px; font-weight: 600; color: var(--color-ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .v10-log-cnt { font-size: 12px; font-weight: 700; color: var(--color-ink-3); flex-shrink: 0; }

        /* [v10 UI 시안] 주식 보유/기록 다크 네이비 히어로 (계좌 현황 · AI 분석 흐름) */
        .acc-hero { background: linear-gradient(135deg, var(--hero-grad-1), var(--hero-grad-2)); color: var(--hero-ink); border-radius: var(--radius-hero); padding: 18px; box-shadow: var(--shadow-float); }
        .acc-hero-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 13px; gap: 8px; }
        .acc-hero-lbl { font-size: 12.5px; font-weight: 700; color: var(--hero-ink-sub); }
        .acc-badge { font-size: 12.5px; font-weight: 800; padding: 5px 12px; border-radius: 20px; }
        .acc-badge.down { background: rgba(240,68,82,.2); color: var(--hero-danger); }
        .acc-badge.up { background: rgba(22,199,132,.2); color: var(--hero-accent); }
        .acc-hero-total { font-size: 29px; font-weight: 800; letter-spacing: -.5px; line-height: 1; color: var(--hero-ink); }
        .acc-hero-total span { font-size: 17px; font-weight: 700; margin-left: 1px; }
        .acc-hero-sub { font-size: 12.5px; color: var(--hero-ink-soft); margin-top: 9px; }
        .acc-hero-sub b { font-weight: 700; color: var(--hero-ink); }
        .acc-hero-sub .up { color: var(--hero-accent); } .acc-hero-sub .dn { color: var(--hero-danger); }
        .acc-chips { display: flex; gap: 9px; margin-top: 16px; }
        .acc-chip { flex: 1; background: var(--hero-fill); border: 1px solid var(--hero-fill-line); border-radius: 13px; padding: 11px 13px; }
        .acc-chip span { display: block; font-size: 11px; color: var(--hero-ink-sub); font-weight: 600; margin-bottom: 4px; }
        .acc-chip b { font-size: 14px; font-weight: 800; color: var(--hero-ink); }

        /* [v10 UI] 추천 관심종목 네이비 히어로 — 제목/업데이트/설명 2~3줄 정렬 */
        .rec-hero { background: linear-gradient(135deg, var(--hero-grad-1), var(--hero-grad-2)); color: var(--hero-ink); border-radius: var(--radius-hero); padding: 18px; box-shadow: var(--shadow-float); }
        .rec-hero-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
        .rec-hero-title { font-size: 15px; font-weight: 800; color: var(--hero-ink); letter-spacing: -.2px; }
        .rec-hero-live { background: var(--color-success); color: #04351f; font-size: 9px; font-weight: 800; padding: 3px 7px; border-radius: 5px; letter-spacing: .5px; flex-shrink: 0; }
        .rec-hero-upd { margin-top: 7px; }
        .rec-hero-desc { font-size: 12px; color: var(--hero-ink-soft); line-height: 1.55; margin-top: 10px; }

        /* [v8.6] Hero 카드 — "오늘의 시장" */
        .hero-card { background: var(--hero-bg); border: 1px solid var(--border); border-radius: var(--radius-card); padding: 20px; box-shadow: var(--card-shadow); display: flex; flex-direction: column; gap: 14px; }

        /* [v9.0] Splash Screen */
        /* [색상 통일] 스플래시 배경 = 카드 표면색(--color-card)으로 → 대시보드 전환 톤 단절 제거. 색상만 교체(레이아웃/타이밍 유지) */
        .splash-screen { position: fixed; top: 0; bottom: 0; left: 50%; transform: translateX(-50%); width: 100%; max-width: 480px; z-index: 9999; background: var(--color-card); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; }
        @media (min-width: 520px) { .splash-screen { box-shadow: 0 0 0 1px var(--color-line), 0 24px 70px rgba(10, 22, 44, 0.22); } }
        /* [브랜드 시안] 워드마크 = 디스플레이 폰트(Syne) + 블루→퍼플 그라디언트 텍스트 */
        .splash-logo { font-family: var(--font-display); font-size: 2.4rem; font-weight: 800; letter-spacing: 0.05em; background: linear-gradient(90deg, var(--color-primary) 0%, var(--purple) 100%); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; color: transparent; }
        .splash-sub { font-size: 0.9rem; color: var(--color-ink-2); font-family: 'Pretendard', sans-serif; }
        .splash-dots { display: flex; gap: 8px; }
        .splash-dots span { width: 8px; height: 8px; border-radius: 50%; background: var(--color-primary); animation: splash-bounce 1.2s infinite ease-in-out; }
        .splash-dots span:nth-child(2) { animation-delay: 0.2s; }
        .splash-dots span:nth-child(3) { animation-delay: 0.4s; }
        @keyframes splash-bounce { 0%,80%,100%{transform:scale(0.8);opacity:0.5} 40%{transform:scale(1.2);opacity:1} }
        /* [브랜드] 하단 태그라인 — 워드마크가 주인공, 캡션은 절제된 연회색·넓은 자간 */
        .splash-caption { position: absolute; bottom: 26px; left: 0; right: 0; text-align: center; font-size: 11px; font-weight: 600; letter-spacing: 0.14em; color: var(--color-ink-3); font-family: 'Pretendard', sans-serif; }

        /* [v9.0] Onboarding Gate */
        .onboarding-overlay { position: fixed; inset: 0; z-index: 9000; background: rgba(15,23,42,0.72); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; padding: 20px; }
        .onboarding-card { background: var(--card-bg); border: 1px solid var(--border); border-radius: var(--radius-card); padding: 28px 22px 24px; max-width: 400px; width: 100%; box-shadow: 0 20px 60px rgba(0,0,0,0.3); }
        .onboarding-logo { font-family: var(--font-display); font-size: 1.1rem; font-weight: 800; color: var(--color-primary); letter-spacing: 0.15em; margin-bottom: 12px; }
        .onboarding-title { font-size: 1.15rem; font-weight: 700; color: var(--text-primary); margin: 0 0 6px; }
        .onboarding-desc { font-size: 0.8rem; color: var(--text-secondary); margin: 0 0 18px; line-height: 1.5; }
        .onboarding-options { display: flex; flex-direction: column; gap: 10px; margin-bottom: 20px; }
        .onboarding-opt { display: flex; align-items: flex-start; gap: 12px; padding: 13px 14px; border-radius: var(--radius-md); border: 1.5px solid var(--border); background: var(--inset-bg); cursor: pointer; text-align: left; font-family: var(--font-body); transition: border-color 0.15s, background 0.15s; }
        .onboarding-opt.selected { border-color: var(--color-primary); background: color-mix(in srgb, var(--color-primary) 10%, var(--card-bg)); }
        .onboarding-opt-icon { font-size: 1.4rem; flex-shrink: 0; margin-top: 2px; }
        .onboarding-opt-text { display: flex; flex-direction: column; gap: 2px; }
        .onboarding-opt-label { font-size: 0.88rem; font-weight: 700; color: var(--text-primary); }
        .onboarding-opt-desc { font-size: 0.76rem; color: var(--text-secondary); line-height: 1.4; }
        .onboarding-opt-sub { font-size: 0.7rem; color: var(--text-tertiary); font-style: italic; }
        .onboarding-confirm { width: 100%; padding: 12px; background: var(--color-primary); color: #fff; border: none; border-radius: var(--radius-md); font-size: 0.9rem; font-weight: 700; cursor: pointer; font-family: var(--font-body); }

        /* [v9.0] Hero 카드 v9 — Regime 크게 + AI Confidence + 오늘행동 + 버튼2 */
        .hero-v9 { background: var(--hero-bg); border: 2px solid var(--border); border-radius: var(--radius-card); padding: 22px 20px 18px; box-shadow: var(--card-shadow); display: flex; flex-direction: column; gap: 12px; }
        .hero-v9-regime-row { display: flex; align-items: baseline; justify-content: space-between; }
        .hero-v9-regime { font-family: var(--font-display); font-size: 2rem; font-weight: 800; line-height: 1.1; }
        .hero-v9-days { font-size: 0.75rem; color: var(--text-tertiary); }
        .hero-v9-brief { font-size: 0.8rem; color: var(--text-secondary); line-height: 1.4; margin: -4px 0 0; }
        .hero-v9-conf-row { display: flex; align-items: center; justify-content: space-between; padding: 8px 0; border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); }
        .hero-v9-conf-label { font-size: 0.75rem; color: var(--text-tertiary); font-weight: 600; letter-spacing: 0.04em; }
        .hero-v9-conf-val { font-family: var(--font-mono); font-size: 1.3rem; font-weight: 800; }
        .hero-v9-verdict-row { display: flex; align-items: center; justify-content: space-between; }
        .hero-v9-verdict-label { font-size: 0.75rem; color: var(--text-tertiary); font-weight: 600; }
        .hero-v9-verdict-badge { font-size: 0.8rem; font-weight: 700; padding: 5px 14px; border-radius: var(--radius-pill); }
        .hero-v9-btns { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-top: 4px; }
        /* [v9.3 PWA-09] BEAR 축소 카드 */
        .hero-v9-compact { padding: 12px 16px; gap: 8px; }
        .hero-v9-regime-compact { font-family: var(--font-display); font-size: 1.05rem; font-weight: 800; line-height: 1.2; }
        .hero-v9-compact .hero-v9-btns { grid-template-columns: repeat(2, 1fr); }
        .hero-v9-btn { width: 100%; padding: 10px 4px; border-radius: var(--radius-md); font-size: 0.78rem; font-weight: 700; cursor: pointer; border: none; font-family: var(--font-body); text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .hero-v9-btn.primary { background: var(--color-primary); color: #fff; }
        .hero-v9-btn.secondary { background: var(--inset-bg); color: var(--text-secondary); border: 1px solid var(--border); }

        /* [v8.7] Top3 Hero Cards */
        .top3-hero-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 4px; }
        .top3-hero-card { display: flex; flex-direction: column; align-items: center; padding: 12px 6px; background: var(--card-bg); border-radius: var(--radius-md); border: 1.5px solid var(--border); gap: 4px; cursor: pointer; text-align: center; transition: border-color 0.15s; }
        .top3-hero-card:hover { border-color: var(--color-primary); }
        .top3-hero-card:nth-child(1) { border-color: var(--color-warning); }
        .top3-hero-card:nth-child(2) { border-color: var(--color-ink-3); }
        .top3-hero-card:nth-child(3) { border-color: var(--color-warning-ink); }
        .top3-medal { font-size: 1.4rem; line-height: 1; }
        .top3-name { font-size: 0.8rem; font-weight: 700; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
        .top3-stars { font-size: 0.7rem; letter-spacing: -1px; color: var(--color-warning); }
        .top3-ai-pct { font-size: 0.78rem; font-weight: 800; color: var(--color-primary); }
        .top3-why-btn { font-size: 0.62rem; padding: 3px 8px; border-radius: 6px; background: var(--inset-bg); border: 1px solid var(--border); color: var(--text-secondary); cursor: pointer; font-family: var(--font-body); white-space: nowrap; margin-top: 2px; }
        /* [§3-3] 추천 카드 인라인 근거·스탠스·기대여력 */
        /* [나 vs AI] 추천 카드 판단 버튼 */
        .dec-mini { display: flex; gap: 4px; margin-top: 6px; width: 100%; }
        .dec-mini.lg { gap: 8px; }
        .dec-b { flex: 1; font-size: 0.64rem; font-weight: 700; padding: 5px 4px; border-radius: 7px; border: 1px solid var(--border); background: var(--card-bg); color: var(--text-secondary); cursor: pointer; font-family: var(--font-body); white-space: nowrap; transition: background .12s, color .12s, border-color .12s; }
        .dec-mini.lg .dec-b { font-size: 0.8rem; padding: 9px 6px; border-radius: 9px; }
        .dec-b.take.on { background: var(--color-primary); color: #fff; border-color: var(--color-primary); }
        .dec-b.pass.on { background: var(--color-ink-2, var(--text-secondary)); color: #fff; border-color: var(--color-ink-2, var(--text-secondary)); }
        .dec-b:active { transform: scale(0.97); }
        .rec-def { font-size: 0.72rem; color: var(--text-secondary); background: var(--inset-bg); border: 1px solid var(--border); border-radius: 10px; padding: 9px 12px; margin-bottom: 12px; line-height: 1.5; }
        .rec-def b { color: var(--text-primary); font-weight: 700; }
        .top3-stance { font-size: 0.6rem; font-weight: 800; padding: 1px 7px; border-radius: 20px; border: 1px solid; line-height: 1.5; }
        .top3-reason { font-size: 0.64rem; color: var(--text-secondary); line-height: 1.35; word-break: keep-all; min-height: 2.4em; display: flex; align-items: center; }
        .top3-upside { font-size: 0.66rem; color: var(--text-secondary); display: flex; align-items: center; gap: 4px; }
        .top3-upside b { color: var(--color-success); font-weight: 800; }
        .top3-upside .est { font-size: 0.54rem; color: var(--text-tertiary); border: 1px solid var(--border); border-radius: 4px; padding: 0 3px; }
        .rec-rest-h { font-size: 0.68rem; font-weight: 700; color: var(--text-tertiary); margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.05em; }
        .rec-rest-list { display: flex; flex-direction: column; gap: 6px; }
        .rec-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 10px 12px; background: var(--inset-bg); border-radius: 10px; }
        .rec-row-l { min-width: 0; flex: 1; }
        .rec-name { background: none; border: none; cursor: pointer; font-family: var(--font-body); font-size: 0.84rem; color: var(--text-primary); font-weight: 700; padding: 0; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; text-align: left; }
        .rec-code { font-size: 0.66rem; font-weight: 400; }
        .rec-stance-inline { font-size: 0.6rem; font-weight: 800; }
        .rec-reason { font-size: 0.7rem; color: var(--text-secondary); margin-top: 3px; line-height: 1.4; word-break: keep-all; }
        .rec-row-r { display: flex; flex-direction: column; align-items: flex-end; gap: 3px; flex-shrink: 0; }
        .rec-interest { font-size: 0.68rem; color: var(--text-secondary); }
        .rec-upside { font-size: 0.68rem; font-weight: 700; color: var(--color-success); }
        .rec-detail { font-size: 0.64rem; padding: 3px 9px; border-radius: 6px; background: var(--card-bg); color: var(--accent-buy); border: 1px solid var(--border); cursor: pointer; font-family: var(--font-body); font-weight: 700; white-space: nowrap; margin-top: 2px; }

        /* [v8.7] Action Summary Hero */
        .action-summary-hero { background: var(--card-bg); border-radius: var(--radius-lg); padding: 16px; margin-bottom: 12px; border: 1px solid var(--border); }
        /* [v11 1-B] 총 자산 카드 */
        .total-asset-card { margin-bottom: 10px; }
        .ta-total { font-size: 2rem; font-weight: 800; color: var(--text-primary); margin: 4px 0 12px; }
        .ta-total span { font-size: 0.95rem; margin-left: 3px; color: var(--text-secondary); }
        .ta-rows { display: flex; flex-direction: column; gap: 8px; }
        .ta-row { display: flex; align-items: center; gap: 9px; width: 100%; background: var(--inset-bg); border: 1px solid var(--border); border-radius: 10px; padding: 10px 12px; cursor: pointer; }
        .ta-dot { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; }
        .ta-lb { font-size: 0.86rem; font-weight: 700; color: var(--text-primary); }
        .ta-vl { margin-left: auto; font-size: 0.86rem; font-weight: 700; color: var(--text-primary); }
        .ta-vl.pend { color: var(--text-tertiary); font-weight: 600; }
        .ta-ar { color: var(--text-tertiary); font-size: 1.1rem; }
        /* [v11 2-A] 오늘 AI 자산 권고 카드 */
        .ai-rec-card { margin-bottom: 10px; cursor: pointer; border-color: color-mix(in srgb, var(--accent-info, var(--color-primary)) 30%, var(--border)); }
        .ai-rec-score { font-weight: 700; color: var(--accent-info, var(--color-primary)); margin-left: 6px; font-size: 0.7rem; }
        .ai-rec-list { display: flex; flex-direction: column; gap: 6px; margin: 4px 0 10px; }
        .ai-rec-item { font-size: 0.85rem; color: var(--text-primary); line-height: 1.4; }
        .ai-rec-more { font-size: 0.74rem; font-weight: 700; color: var(--accent-info, var(--color-primary)); text-align: right; }
        .action-summary-headline { font-size: 1.05rem; font-weight: 800; color: var(--text-primary); margin-bottom: 12px; }
        .action-summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
        .action-summary-pill { display: flex; flex-direction: column; align-items: center; padding: 8px 4px; border-radius: var(--radius-md); border: 1.5px solid; gap: 2px; background: var(--inset-bg); }
        .action-summary-pill-count { font-size: 1.3rem; font-weight: 800; line-height: 1; }
        .action-summary-pill-label { font-size: 0.65rem; font-weight: 700; letter-spacing: 0.06em; }

        /* [v9.0] Action Card */
        .action-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin-top: 10px; }
        .action-item { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-radius: var(--radius-md); border: 1px solid var(--border); }
        .action-item.act-yes { background: color-mix(in srgb, var(--accent-buy) 8%, var(--card-bg)); border-color: color-mix(in srgb, var(--accent-buy) 25%, var(--border)); }
        .action-item.act-no  { background: var(--inset-bg); }
        .action-item.act-warn { background: color-mix(in srgb, var(--accent-warn) 8%, var(--card-bg)); border-color: color-mix(in srgb, var(--accent-warn) 25%, var(--border)); }
        .action-icon { font-size: 1rem; line-height: 1; }
        .action-label { font-size: 0.78rem; font-weight: 600; color: var(--text-primary); }

        /* [v9.0][10] Today Mission */
        .today-mission-card { border-color: color-mix(in srgb, var(--color-warning) 30%, var(--border)); }
        .today-mission-list { display: flex; flex-direction: column; gap: 6px; margin-top: 8px; }
        .today-mission-row { display: flex; align-items: center; gap: 8px; padding: 9px 12px; border-radius: var(--radius-md); background: var(--inset-bg); }
        .today-mission-row.tm-stop { background: color-mix(in srgb, var(--accent-sell) 10%, var(--card-bg)); }
        .today-mission-row.tm-buy { background: color-mix(in srgb, var(--accent-buy) 10%, var(--card-bg)); }
        .tm-icon { font-size: 0.9rem; line-height: 1; flex-shrink: 0; }
        .tm-text { font-size: 0.82rem; font-weight: 600; color: var(--text-primary); }

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
        .ai-reason-num { font-size: 0.8rem; color: var(--color-primary); font-weight: 700; flex-shrink: 0; }
        .ai-reason-text { font-size: 0.78rem; color: var(--text-secondary); line-height: 1.4; }

        /* [v9.0] Profile Tab */
        /* 투자성향 배지 */
        .profile-badge-row { display: flex; align-items: center; justify-content: space-between; padding: 8px 14px; background: color-mix(in srgb, var(--color-primary) 8%, var(--card-bg)); border: 1px solid color-mix(in srgb, var(--color-primary) 20%, var(--border)); border-radius: var(--radius-md); }
        .profile-badge-label { font-size: 0.78rem; color: var(--text-secondary); }
        .profile-badge-label strong { color: var(--text-primary); }
        .profile-badge-change { background: none; border: none; font-size: 0.75rem; color: var(--color-primary); cursor: pointer; font-weight: 700; font-family: var(--font-body); padding: 0; }

        .profile-style-grid { display: flex; flex-direction: column; gap: 8px; }
        .profile-style-card { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-radius: var(--radius-md); border: 2px solid var(--border); background: var(--inset-bg); cursor: pointer; text-align: left; transition: border-color 0.15s, background 0.15s; }
        .profile-style-card.selected { border-color: var(--color-primary); background: color-mix(in srgb, var(--color-primary) 8%, var(--card-bg)); }
        .profile-style-icon { font-size: 1.4rem; flex-shrink: 0; }
        .profile-style-label { font-size: 0.9rem; font-weight: 700; color: var(--text-primary); flex-shrink: 0; width: 44px; }
        .profile-style-desc { font-size: 0.72rem; color: var(--text-secondary); line-height: 1.4; }
        .profile-row { display: flex; flex-direction: column; gap: 6px; }
        .profile-row-top { display: flex; justify-content: space-between; align-items: center; }
        .profile-row-label { font-size: 0.82rem; font-weight: 600; color: var(--text-primary); }
        .profile-row-val { font-size: 0.88rem; }
        .profile-slider { width: 100%; accent-color: var(--color-primary); cursor: pointer; }
        .profile-slider-hint { display: flex; justify-content: space-between; font-size: 0.64rem; color: var(--text-tertiary); margin-top: 2px; }
        .profile-period-btns { display: flex; flex-direction: column; gap: 6px; margin-top: 6px; }
        .profile-period-btn { padding: 9px 14px; border-radius: var(--radius-sm); border: 1.5px solid var(--border); background: var(--inset-bg); color: var(--text-secondary); font-size: 0.8rem; cursor: pointer; text-align: left; font-family: var(--font-body); }
        .profile-period-btn.selected { border-color: var(--color-primary); color: var(--color-primary); background: color-mix(in srgb, var(--color-primary) 8%, var(--card-bg)); font-weight: 700; }
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

        /* [매매 승인] 추천 탭 승인 카드 헤더 */
        .approve-card { border-color: color-mix(in srgb, var(--accent-buy) 30%, var(--border)); }
        .approve-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 12px; }
        .approve-title { font-size: 0.86rem; font-weight: 700; color: var(--text-primary); }
        .approve-title b { color: var(--accent-buy); font-weight: 800; }
        .approve-off { font-size: 0.66rem; font-weight: 800; color: var(--accent-warn); background: color-mix(in srgb, var(--accent-warn) 12%, transparent); border: 1px solid color-mix(in srgb, var(--accent-warn) 30%, var(--border)); padding: 3px 8px; border-radius: 7px; flex-shrink: 0; }
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
        .pending-price-grid.rr-3col { grid-template-columns: 1fr 1fr 1fr; }
        .pending-reason { font-size: 0.72rem; color: var(--text-secondary); line-height: 1.5; }
        .pending-queued { font-size: 0.75rem; font-weight: 700; color: var(--accent-warn); background: color-mix(in srgb, var(--accent-warn) 10%, transparent); border: 1px solid color-mix(in srgb, var(--accent-warn) 30%, var(--border)); border-radius: var(--radius-sm); padding: 10px; text-align: center; }
        .briefing-list { display: flex; flex-direction: column; gap: 8px; }
        .briefing-row { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid var(--border); }
        .briefing-row:last-child { border-bottom: none; }
        .bf-ic { font-size: 1rem; }
        .bf-mid { flex: 1; min-width: 0; }
        .bf-title { font-size: 0.82rem; color: var(--text-primary); font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .bf-time { font-size: 0.66rem; margin-top: 1px; }
        .bf-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--accent-buy); flex-shrink: 0; }
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

        /* [v9.0][12] Risk/Reward 요약 */
        .rr-summary { display: flex; flex-direction: column; gap: 6px; margin-top: 10px; padding: 10px 12px; background: var(--inset-bg); border-radius: var(--radius-md); }
        .rr-summary-row { display: flex; justify-content: space-between; align-items: center; font-size: 0.8rem; }
        .rr-summary-main { padding-top: 6px; border-top: 1px dashed var(--border); font-size: 0.85rem; }
        .pwa-verdict { border-color: color-mix(in srgb, var(--accent-buy) 30%, var(--border)); }
        .pwa-caution { border-color: color-mix(in srgb, var(--accent-warn) 30%, var(--border)); }

        /* 포트폴리오 */
        .pwa-balance-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .pwa-bal-item { display: flex; flex-direction: column; gap: 3px; }
        .pwa-bal-item span:first-child { font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-tertiary); }
        .pwa-bal-item span:last-child { font-size: 0.85rem; color: var(--text-primary); }
        /* [v8.5] 보유종목 카드 */
        .position-cards { display: flex; flex-direction: column; gap: 7px; }
        .position-card { background: var(--inset-bg); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 11px 13px; }
        .position-card-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 7px; }
        .position-card-name { font-size: 0.86rem; color: var(--text-primary); font-weight: 600; }
        .position-card-badge { font-size: 0.76rem; font-weight: 700; padding: 3px 9px; border-radius: var(--radius-pill); }
        .position-card-badge.bull { background: color-mix(in srgb, var(--accent-buy) 16%, var(--card-bg)); }
        .position-card-badge.bear { background: color-mix(in srgb, var(--accent-sell) 16%, var(--card-bg)); }
        .position-card-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 12px; }
        .position-card-cell { display: flex; flex-direction: column; gap: 2px; font-size: 0.78rem; }
        .position-card-cell .dim { font-size: 0.62rem; text-transform: uppercase; letter-spacing: 0.03em; }
        .position-indicator-row { display: flex; gap: 10px; font-size: 0.68rem; color: var(--text-tertiary); margin-top: 5px; flex-wrap: wrap; }
        .position-card-ai { margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--border); }
        .position-card-ai-label { display: block; font-size: 0.62rem; letter-spacing: 0.04em; color: var(--accent-info); margin-bottom: 4px; font-weight: 700; }
        .position-card-ai-text { font-size: 0.76rem; line-height: 1.55; color: var(--text-secondary); }
        /* [§3-4] 보유 AI 스탠스 + 근거 인라인 */
        .pos-stance { display: flex; align-items: flex-start; gap: 8px; margin-top: 9px; padding-top: 9px; border-top: 1px dashed var(--border); }
        .pos-stance-badge { flex-shrink: 0; font-size: 0.72rem; font-weight: 800; padding: 2px 9px; border-radius: 20px; border: 1.5px solid currentColor; }
        .pos-stance-reason { font-size: 0.74rem; color: var(--text-secondary); line-height: 1.45; word-break: keep-all; }
        /* [§3-4] 매수 차단 종목 강화 — 해제 조건 + 정확도 링크 */
        .blocked-list { display: flex; flex-direction: column; gap: 8px; }
        .blocked-card { background: var(--inset-bg); border: 1px solid var(--border); border-left: 3px solid var(--accent-sell); border-radius: var(--radius-md); padding: 11px 13px; }
        .blocked-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
        .blocked-stock { font-size: 0.86rem; font-weight: 700; color: var(--text-primary); }
        .blocked-signal { font-size: 0.66rem; color: var(--accent-sell); font-weight: 700; }
        .blocked-reason { font-size: 0.74rem; color: var(--text-secondary); margin-top: 4px; line-height: 1.45; }
        .blocked-unblock { font-size: 0.72rem; color: var(--text-secondary); margin-top: 7px; padding-top: 7px; border-top: 1px dashed var(--border); line-height: 1.45; word-break: keep-all; }
        .blocked-unblock b { color: var(--accent-buy); font-weight: 700; }
        .blocked-acc { width: 100%; margin-top: 10px; padding: 11px; background: var(--card-bg); border: 1px solid var(--border); border-radius: var(--radius-md); color: var(--accent-buy); font-family: var(--font-body); font-size: 0.78rem; font-weight: 700; cursor: pointer; }
        .blocked-acc:active { transform: scale(0.99); }

        /* [v8.6] 홈 화면 보유종목 미리보기 */
        .position-card-mini { display: flex; justify-content: space-between; align-items: center; background: var(--inset-bg); border-radius: var(--radius-sm); padding: 10px 14px; }
        .position-mini-name { font-size: 0.82rem; color: var(--text-primary); }
        .position-mini-pnl { font-size: 0.82rem; font-weight: 700; }
        .pwa-link-btn { width: 100%; background: none; border: none; padding: 10px 0 0; color: var(--accent-info); font-size: 0.75rem; font-weight: 700; cursor: pointer; text-align: center; }

        /* [v8.5] 리포트 카드 */
        /* [기록] 상세 리포트 — 전체폭 리스트(라벨/설명 줄바꿈 깨짐 방지) */
        .report-list { display: flex; flex-direction: column; gap: 8px; }
        .report-row { display: flex; align-items: center; gap: 12px; background: var(--inset-bg); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 12px 14px; text-decoration: none; transition: border-color 0.15s, transform 0.1s; }
        .report-row:hover { border-color: var(--accent-buy); }
        .report-row:active { transform: scale(0.99); }
        .report-row-icon { font-size: 1.2rem; width: 36px; height: 36px; display: grid; place-items: center; background: var(--card-bg); border-radius: 10px; flex-shrink: 0; }
        .report-row-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
        .report-row-text b { font-size: 0.86rem; color: var(--text-primary); font-weight: 700; }
        .report-row-text span { font-size: 0.72rem; color: var(--text-tertiary); word-break: keep-all; line-height: 1.4; }
        .report-row-arrow { color: var(--text-tertiary); font-size: 1.1rem; font-weight: 700; flex-shrink: 0; }
        /* [기록] AI 학습 현황(ML 자기검증) */
        .ml-accum { display: flex; gap: 8px; margin: 12px 0 10px; }
        .ml-accum-item { flex: 1; background: var(--inset-bg); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 12px 6px; text-align: center; display: flex; flex-direction: column; gap: 3px; }
        .ml-accum-item b { font-size: 1.15rem; font-weight: 800; color: var(--text-primary); font-family: var(--font-mono); }
        .ml-accum-item span { font-size: 0.66rem; color: var(--text-secondary); }
        .ml-bar { height: 8px; background: var(--inset-bg); border-radius: 4px; overflow: hidden; margin-bottom: 10px; }
        .ml-bar > div { height: 100%; border-radius: 4px; transition: width 0.7s ease; }
        .ml-desc { font-size: 0.78rem; color: var(--text-secondary); line-height: 1.6; margin: 0 0 12px; }
        .ml-desc b { color: var(--text-primary); font-weight: 700; }
        .ml-reasons { background: var(--inset-bg); border-radius: var(--radius-md); padding: 12px 13px; }
        .ml-reasons-h { font-size: 0.72rem; font-weight: 700; color: var(--text-secondary); margin-bottom: 9px; }
        .ml-reason { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 5px 0; }
        .ml-reason-t { font-size: 0.78rem; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .ml-reason-v { font-size: 0.78rem; font-weight: 800; font-family: var(--font-mono); white-space: nowrap; flex-shrink: 0; }
        .ml-reason-v em { font-style: normal; font-weight: 500; font-size: 0.68rem; color: var(--text-tertiary); margin-left: 4px; }
        .ml-more { width: 100%; margin-top: 12px; padding: 11px; background: var(--card-bg); border: 1px solid var(--border); border-radius: var(--radius-md); color: var(--accent-buy); font-family: var(--font-body); font-size: 0.78rem; font-weight: 700; cursor: pointer; }
        .ml-more:active { transform: scale(0.99); }
        .ml-recent { margin-top: 12px; }
        .ml-rec-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 7px 0; border-top: 1px solid var(--inset-bg); }
        .ml-rec-l { min-width: 0; overflow: hidden; }
        .ml-rec-name { font-size: 0.82rem; font-weight: 700; color: var(--text-primary); }
        .ml-rec-rsn { font-size: 0.68rem; color: var(--text-tertiary); margin-left: 6px; }
        .ml-rec-r { display: flex; align-items: center; gap: 8px; white-space: nowrap; flex-shrink: 0; }
        .ml-rec-chg { font-size: 0.72rem; color: var(--text-secondary); }
        .ml-rec-badge { font-size: 0.68rem; font-weight: 700; padding: 2px 8px; border-radius: 20px; background: var(--inset-bg); }
        .ml-foot { font-size: 0.66rem; color: var(--text-tertiary); margin-top: 8px; line-height: 1.5; }
        /* [나 vs AI 대결] */
        .vs-card { border: 1px solid var(--color-line); }
        .vs-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
        .vs-overall { font-size: 0.7rem; font-weight: 800; padding: 3px 10px; border-radius: 999px; white-space: nowrap; }
        .vs-def { font-size: 0.74rem; color: var(--text-secondary); line-height: 1.55; margin: 10px 0 4px; word-break: keep-all; }
        .vs-def b { color: var(--text-primary); font-weight: 700; }
        .vs-row { margin-top: 12px; padding: 12px; background: var(--color-card-soft); border-radius: 14px; }
        .vs-row-h { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
        .vs-win { font-size: 0.86rem; font-weight: 800; color: var(--text-primary); }
        .vs-badge { font-size: 0.72rem; font-weight: 800; border: 1px solid; border-radius: 8px; padding: 2px 9px; }
        .vs-pending { font-size: 0.68rem; font-weight: 700; color: var(--text-tertiary); }
        .vs-bars { display: flex; align-items: center; gap: 8px; }
        .vs-side { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 3px; background: var(--card-bg); border-radius: 10px; padding: 10px 6px; }
        .vs-name { font-size: 0.72rem; font-weight: 700; color: var(--text-secondary); white-space: nowrap; }
        .vs-ret { font-size: 1.15rem; font-weight: 800; font-family: var(--font-mono); }
        .vs-mid { font-size: 0.7rem; font-weight: 800; color: var(--text-tertiary); flex-shrink: 0; }
        .vs-pending-txt { font-size: 0.72rem; color: var(--text-tertiary); line-height: 1.5; }
        .vs-detail { margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--color-line); }
        .vs-detail-h { font-size: 0.72rem; font-weight: 800; color: var(--text-secondary); margin-bottom: 6px; }
        .vs-drow { display: flex; align-items: center; gap: 8px; padding: 5px 0; border-bottom: 1px solid var(--border); }
        .vs-dname { flex: 1; font-size: 0.8rem; font-weight: 600; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .vs-dtag { font-size: 0.64rem; font-weight: 800; padding: 2px 7px; border-radius: 6px; flex-shrink: 0; }
        .vs-dtag.take { background: var(--color-primary-soft); color: var(--color-primary); }
        .vs-dtag.pass { background: var(--color-card-soft); color: var(--text-tertiary); }
        .vs-dret { font-size: 0.8rem; font-weight: 800; flex-shrink: 0; min-width: 52px; text-align: right; }
        .vs-dok { font-size: 0.82rem; flex-shrink: 0; width: 16px; text-align: center; }
        .vs-foot { font-size: 0.64rem; color: var(--text-tertiary); margin-top: 8px; line-height: 1.5; word-break: keep-all; }
        .vs-empty { text-align: center; padding: 16px 8px 6px; }
        .vs-empty-ic { font-size: 1.7rem; margin-bottom: 6px; }
        .vs-empty-t { font-size: 0.86rem; font-weight: 700; color: var(--text-primary); }
        .vs-empty-s { font-size: 0.74rem; color: var(--text-secondary); margin-top: 6px; line-height: 1.55; word-break: keep-all; }
        .vs-empty-s b { color: var(--text-primary); font-weight: 700; }
        .vs-empty-btn { margin-top: 12px; background: var(--color-primary); color: #fff; border: none; border-radius: 10px; padding: 9px 18px; font-size: 0.8rem; font-weight: 700; cursor: pointer; }
        /* [§3-5] AI 개선노트(changelog) */
        .chlog-intro { font-size: 0.8rem; color: var(--text-secondary); line-height: 1.55; margin: 10px 0 12px; }
        .chlog-intro b { color: var(--text-primary); font-weight: 700; }
        .chlog-list { display: flex; flex-direction: column; gap: 8px; }
        .chlog-row { display: flex; gap: 10px; align-items: flex-start; background: var(--inset-bg); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 11px 13px; }
        .chlog-ic { font-size: 1rem; flex-shrink: 0; line-height: 1.4; }
        .chlog-body { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
        .chlog-kind { font-size: 0.62rem; font-weight: 800; color: var(--accent-buy); background: color-mix(in srgb, var(--accent-buy) 12%, transparent); padding: 1px 7px; border-radius: 5px; align-self: flex-start; }
        .chlog-text { font-size: 0.76rem; color: var(--text-secondary); line-height: 1.5; word-break: keep-all; }
        .chlog-foot { font-size: 0.66rem; color: var(--text-tertiary); margin-top: 10px; line-height: 1.5; }
        /* [§3-5 item3] AI 성적표 타일 */
        .scorecard { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 10px; }
        .sc-tile { background: var(--inset-bg); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 12px 13px; display: flex; flex-direction: column; gap: 3px; }
        .sc-k { font-size: 0.68rem; color: var(--text-secondary); font-weight: 600; }
        .sc-v { font-size: 1.25rem; font-weight: 800; font-family: var(--font-mono); line-height: 1.1; }
        .sc-sub { font-size: 0.64rem; color: var(--text-tertiary); }
        .sc-summary { font-size: 0.78rem; color: var(--text-secondary); line-height: 1.6; margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border); }
        .sc-summary b { font-weight: 700; color: var(--text-primary); }

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
        /* Report KPI Grid */
        .report-kpi-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 10px; }
        .report-kpi-item { background: var(--inset-bg); border-radius: var(--radius-md); padding: 10px 8px; text-align: center; }
        .report-kpi-label { display: block; font-size: 0.68rem; color: var(--text-tertiary); margin-bottom: 4px; font-weight: 600; letter-spacing: 0.04em; }
        .report-kpi-val { display: block; font-size: 0.9rem; font-weight: 800; font-family: var(--font-mono); color: var(--text-primary); }

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
