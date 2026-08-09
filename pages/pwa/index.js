import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useState, useEffect, useCallback } from 'react';
import { getLatestDailyReport } from '../../lib/reports';
import LastUpdated from '../../components/LastUpdated';
import MarketSession from '../../components/MarketSession';
import { setTraderGlobal, getTrader } from '../../lib/trader';
import { recordDecision, matureLedger, computeShowdown, getTodayDecision, reconcileAutoWatch, getLedger } from '../../lib/verdictLedger';
import { getSeed, setSeed, resetSeed, SEED_OPTIONS, computeWallets, streakNarrative, wonG, wonNum, getNickname, setNickname } from '../../lib/gameWallet';
import { initGameSync } from '../../lib/gameSync';
// [N1] 자산 원장. lib/verdictLedger 의 getLedger(판단 기록)와 이름이 겹쳐 별칭으로 구분한다.
import { getLedger as getAssetLedger } from '../../lib/ledger';
import { recordSnapshot as recordAssetSnapshot, getDelta as getAssetDelta } from '../../lib/assetHistory';
import { dedupBy } from '../../lib/useDedup';
import { useTabState } from '../../lib/pwa/useTabState';
import { samplePolicy, verdictColor as sampleVerdictColor, canAutoML, ML_MIN_SAMPLE } from '../../lib/sampleSize';
import SampleSizeBadge from '../../components/SampleSizeBadge';
import AppHeader from '../../components/AppHeader';
import TraderBadge from '../../components/shared/TraderBadge';
import BottomNav from '../../components/BottomNav';
import { getStockHoldings, removeStock, buyStock } from '../../lib/stockHoldings';
import { fetchStockQuotes } from '../../lib/stockLive';
import { getKrxSession } from '../../lib/marketHours';
import ShareButton from '../../components/ShareButton';
import RotatingPageTitle from '../../components/RotatingPageTitle';
import AssetMapTitle from '../../components/AssetMapTitle';
import { recordAccuracySnapshot, getAccuracyHistory } from '../../lib/aiAccuracyHistory';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer } from 'recharts';
import { getHoldings as getEtfHoldings } from '../../lib/etfHoldings';
import QuickAddSheet from '../../components/shared/QuickAddSheet';
import { StockForm } from '../../components/shared/AssetForms';

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
// [N1] 이 파일에 있던 자체 자산 병합 함수는 제거했다(다른 규칙으로 ETF를 더하던 죽은 코드).
//   총자산은 lib/ledger 의 단일 원장 하나만 사용한다. 이 파일에서 자산을 직접 더하지 않는다.

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
// [성과비교] 내 포트폴리오의 '현재 평가 기준' 수익률 + 가장 이른 매수일(가입 시점).
//   cost/current 짝을 신뢰할 수 있는 자산만 사용(KIS 주식 잔고 + ETF 실시간). 시세 미연동(직접입력 주식)은 제외.
function computeMyPerf(data, assetSum, trader, fxRate) {
  if (typeof window === 'undefined') return null;
  const dates = [];
  try { getStockHoldings(trader).forEach((h) => { if (h.buyDate) dates.push(h.buyDate); }); } catch (e) {}
  try { getEtfHoldings(trader).forEach((h) => { if (h.buyDate) dates.push(h.buyDate); }); } catch (e) {}
  try { const re = JSON.parse(localStorage.getItem('onehub_re_my_property') || 'null'); if (re && re.buyMonth) dates.push(String(re.buyMonth).slice(0, 7) + '-01'); } catch (e) {}
  const sinceDate = dates.length ? dates.slice().sort()[0] : null;
  let cost = 0, val = 0; const parts = [];
  const bal = data?.balance || {};
  const kisVal = (Number(bal.total_asset) || 0) - (Number(bal.cash) || 0);
  const kisPnl = Number(bal.unrealized_pnl) || 0;
  if (kisVal > 0) { const kisCost = kisVal - kisPnl; if (kisCost > 0) { cost += kisCost; val += kisVal; parts.push('주식'); } }
  try {
    let etfCost = 0;
    getEtfHoldings(trader).forEach((h) => { etfCost += (h.avgCcy === 'USD' ? (fxRate ? h.avgPrice * h.shares * fxRate : 0) : h.avgPrice * h.shares); });
    const etfVal = assetSum?.breakdown?.etf_uk != null ? assetSum.breakdown.etf_uk * 1e8 : 0;
    if (etfCost > 0 && etfVal > 0) { cost += etfCost; val += etfVal; parts.push('ETF'); }
  } catch (e) {}
  const myPct = cost > 0 ? Math.round((val / cost - 1) * 10000) / 100 : null;
  return { sinceDate, myPct, invested: cost, current: val, parts };
}

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
  // 기대 여력(기술적 추정): 변동성·모멘텀 기반 상단 여력 % — [S-4] 소수 1자리로 동점 최소화
  const upside = Math.round(clamp(6 + Math.max(0, mom ?? 0) * 0.15 + Math.max(0, (vol ?? 1) - 1) * 1.5, 5, 18) * 10) / 10;
  // 스탠스(관심 강도)
  const stance = score >= 12 ? { label: '강한 후보', color: 'var(--color-success)' }
    : score >= 9 ? { label: '양호', color: 'var(--color-primary)' }
    : { label: '보통', color: 'var(--text-secondary)' };
  // [S-8] AI 판단 등급 — 관심도(0~15)를 '매수/관심/관망'으로. 카드 최상단·최대 위계로 노출.
  const verdict = score >= 12 ? { label: 'AI 판단: 매수', short: '매수', color: 'var(--color-danger)', bg: 'var(--color-danger-soft)' }
    : score >= 9 ? { label: 'AI 판단: 관심', short: '관심', color: 'var(--color-warning-ink, var(--color-warning))', bg: 'var(--color-warning-soft)' }
    : { label: 'AI 판단: 관망', short: '관망', color: 'var(--color-ink-2)', bg: 'var(--color-card-soft)' };
  return { reason, upside, stance, score, verdict };
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

// [S-2] 보유 액션 긴급도 4단계 — 임계치는 설정값(하드코딩 금지).
const HOLD_URG_CFG = { nearPct: 3, spikePct: 7 };
function deriveUrgency(p, cfg = HOLD_URG_CFG) {
  const n = (x) => (x == null || isNaN(Number(x)) ? null : Number(x));
  const cur = n(p.current_price) ?? 0, tgt = n(p.target) ?? 0, stp = n(p.stop_loss) ?? 0;
  const near = cfg.nearPct / 100;
  const day = n(p.change_1d);
  if (stp > 0 && cur > 0 && cur <= stp * (1 + near))
    return { level: "urgent", rank: 0, badge: "손절 임박", color: "var(--color-danger)", bar: "var(--color-danger)" };
  if (tgt > 0 && cur > 0 && cur >= tgt * (1 - near))
    return { level: "chance", rank: 1, badge: "익절 검토", color: "var(--color-success)", bar: "var(--color-success)" };
  if (day != null && Math.abs(day) >= cfg.spikePct)
    return { level: "watch", rank: 2, badge: "점검 필요", color: "var(--color-warning-ink, var(--color-warning))", bar: "var(--color-warning)" };
  return { level: "normal", rank: 3, badge: "유지", color: "var(--color-ink-3)", bar: null };
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

// [홈 재설계 T-3] 아코디언 펼침/접힘 상태를 사용자별로 저장(onehub_home_open).
function readHomeOpen(id, def) {
  try { const m = JSON.parse(localStorage.getItem('onehub_home_open') || '{}'); return id in m ? !!m[id] : def; } catch { return def; }
}
function writeHomeOpen(id, val) {
  try { const m = JSON.parse(localStorage.getItem('onehub_home_open') || '{}'); m[id] = val; localStorage.setItem('onehub_home_open', JSON.stringify(m)); } catch {}
}

// [홈 재설계 T-3] Tier 2 공용 아코디언 — 접힌 상태에서도 헤더에 요약 값 1개 노출(빈 껍데기 금지).
function HomeAccordion({ id, title, summary, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  useEffect(() => { setOpen(readHomeOpen(id, defaultOpen)); }, [id]);
  const toggle = () => { const n = !open; setOpen(n); writeHomeOpen(id, n); };
  return (
    <section className={`card v10 v10-collap ${open ? 'open' : ''}`}>
      <div className="v10-collap-head" onClick={toggle}>
        <div className="acc-htxt">
          <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>{title}</h3>
          {summary != null && <span className="acc-sum">{summary}</span>}
        </div>
        <span className="v10-caret">▾</span>
      </div>
      <div className="v10-collap-body"><div className="v10-collap-inner">{children}</div></div>
    </section>
  );
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
  const [gameSeed, setGameSeed] = useState(null); // [G-시리즈] 가상 게임 시드머니(있으면 게임 시작됨)
  const [gameNick, setGameNick] = useState('나'); // [닉네임] 나 vs AI에서 "나" 대신 표시
  const [trendClick, setTrendClick] = useState(null); // [사용자 지시] 추이 그래프 클릭 시 그 시점 판단 차이 설명
  useEffect(() => {
    const load = () => { setGameSeed(getSeed()); setGameNick(getNickname()); };
    load();
    initGameSync(getTrader()); // [2026-08-05] 서버 하이드레이션 + 변경 미러링(today.js와 동일 진입점)
    window.addEventListener('onehub-game-change', load);
    return () => window.removeEventListener('onehub-game-change', load);
  }, []);
  const editGameNickname = useCallback(() => {
    const cur = getNickname();
    const next = typeof window !== 'undefined' ? window.prompt('나 vs AI에서 쓸 닉네임 (8자 이내)', cur === '나' ? '' : cur) : null;
    if (next != null) setNickname(next);
  }, []);
  // [S3/G2] AI 트러스트 3섹션 서브내비(vs/verify/archive)를 URL(?sec=)로 유지 — 뒤로가기·딥링크(F4) 지원
  // [FB-4 §4.2] 정직성 브랜드 강화 — AI 페이지는 '자기검증'을 앞세운다(기본 진입 섹션).
  // [OS-2] AI 페이지 3탭 — "AI vs 나 대결" 우선 노출로 재정렬(사용자 지시, FB-4의 '자기검증 우선'을 대체).
  const TRUST_TABS = ['vs', 'verify', 'archive']; // [OS-2] RotatingPageTitle 순환 순서 = 탭 순서
  const [trustSec, setTrustSec] = useTabState('sec', TRUST_TABS, 'vs');
  const [recSort, setRecSort] = useState('interest'); // [S7.2] 추천 정렬(interest/upside)
  const [holdSort, setHoldSort] = useState('urgency'); // [S-2] 보유 정렬(urgency/value)
  const [autoWatchNote, setAutoWatchNote] = useState([]); // [S-6] 추천해제→자동 관망 편입 알림
  const [buyNotice, setBuyNotice] = useState(null); // [S-6] 바로매수 핸드오프 { name, code }
  const [decFeedback, setDecFeedback] = useState(null); // [S-5] 판단 기록 직후 즉시 피드백 { name, decision, date }
  const [manualPx, setManualPx] = useState({}); // [라이브] 직접입력 보유 현재가맵(id→{price,currency,krw,date}) · 평가/이상치용
  const [companyInfo, setCompanyInfo] = useState({}); // [S-7] 기업개요 캐시(code→summary)
  const [notis, setNotis] = useState([]); // [T-04] 텔레그램/리포트/큐 동기화 알림 피드
  const [opNotes, setOpNotes] = useState([]); // [알림카드] 운영자 신고가(spot_price) — 내 단지
  const [notiOpen, setNotiOpen] = useState(null); // [알림카드] 펼친 알림 인덱스(상세 본문)
  const [assetSum, setAssetSum] = useState(null); // [v11 1-B] 총자산 통합 집계(주식+ETF+부동산)
  const [assetDelta, setAssetDelta] = useState(null); // [추세] 전일 대비 자산별 변화(브라우저 스냅샷)
  const [aiDaily, setAiDaily] = useState(null); // [자기검증] 오늘 vs 전일 AI 판단 diff
  const [showAssetDetail, setShowAssetDetail] = useState(false); // [팝업] 총자산 클릭 → 상세 breakdown
  const [aiRec, setAiRec] = useState(null); // [v11 2-A] 오늘 AI 자산 권고(ai-summary)
  const [reFeed, setReFeed] = useState(null); // [브리핑] 부동산 최근 실거래(신고가) 피드
  const [fxRate, setFxRate] = useState(null); // [브리핑] 오늘 USD/KRW 환율(경제 지표용)
  const [stFormOpen, setStFormOpen] = useState(false); // [주식 직접입력] 폼 열림
  const [stManualTick, setStManualTick] = useState(0); // [주식 직접입력] 보유 목록 재조회 트리거
  const [benchPerf, setBenchPerf] = useState(null); // [성과비교] 시장지수 구간 수익률 { ok, label, pct, startDate, symbol }
  const [expandedRec, setExpandedRec] = useState({}); // [v9.0] 추천 탭 왜 추천? 펼침
  const [bottomSheet, setBottomSheet] = useState(null); // [v9.0] AI 판단근거 Bottom Sheet: null | { name, code, scores, reasons, final_score, win_rate }
  const [qaOpen, setQaOpen] = useState(false); // [S3] 빠른입력 시트(공용 QuickAddSheet) 열림
  // [2026-08-05 재작업] window.prompt는 카카오톡 인앱브라우저 등에서 아예 안 뜨거나
  //   조용히 무시되는 경우가 있어 앱 내장 시트로 교체. null | { code, name, blocked }
  const [sharesPrompt, setSharesPrompt] = useState(null);
  const [sharesPromptInput, setSharesPromptInput] = useState('');
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
    // [N2] 종합자산 지도는 /pwa/assets 하나로 통합 — 구 dashboard로 오는 경로를 전부 리다이렉트.
    //   지도가 2개면 총자산이 같아도 '어느 화면이 정답인지' 알 수 없어 신뢰가 무너진다.
    if (tabParam === 'dashboard') { router.replace('/pwa/assets'); return; }
    // [OS-2] 탭 없이 /pwa 진입(로고 클릭·PWA start_url)은 "AI 추천 선택→대결결과" 흐름이 첫 화면.
    //   구버전엔 "오늘"이 기본 홈이었으나, 앱 첫 후킹을 주식 판단 게임에 맞추도록 사용자 지시로 교체.
    //   manifest.json의 start_url도 /pwa/pick으로 함께 바뀌었다(이 리다이렉트는 로고 클릭 등 재진입용).
    if (!tabParam && !code) {
      let onboarded = false;
      try {
        onboarded = !!window.localStorage.getItem('onehub_profile')
          || window.localStorage.getItem('onehub_onboarded') === '1';
      } catch (e) {}
      if (onboarded) { router.replace('/pwa/pick'); return; }
      // 최초 사용자(프로필·온보딩 모두 없음) → 위저드 1회 진입.
      //   ★ 딥링크(?tab=·?code=)로 들어온 경우엔 절대 튕기지 않는다. isReady 이후라 판정이 정확하다.
      router.replace('/pwa/onboarding');
      return;
    }
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
    // [T-3] 홈 아코디언 펼침 상태 복원(AI근거·최근활동)
    setBasisOpen(readHomeOpen('basis', false));
    setLogOpen(readHomeOpen('log', false));
    // [v9.0] Splash: 2초 후 해제
    const splashTimer = setTimeout(() => setSplash(false), 2000);
    // [v10 UI] 투자성향 프로필 로드 — 최초 진입(온보딩 미완료)이면 온보딩 위저드로 이동
    try {
      const saved = window.localStorage.getItem('onehub_profile');
      const onboarded = window.localStorage.getItem('onehub_onboarded') === '1';
      if (saved) {
        setProfile(p => ({ ...p, ...JSON.parse(saved) }));
      }
      // [N2] 온보딩 위저드 진입 판정도 쿼리 effect로 옮겼다.
      //   이 effect는 마운트 1회라 router.query 가 아직 비어 있다. 여기서 !router.query.tab 를 보면
      //   ?tab=report 딥링크로 들어와도 '탭 없음'으로 오인해 온보딩으로 튕긴다(실측으로 재현).
      //   같은 함정을 N2 리다이렉트에서 한 번 고쳐놓고, 바로 위 이웃이 같은 결함인 걸 놓쳤다.
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

  // [S3] 빠른입력 저장 — 자산군 금액(억)을 온보딩 자산에 반영 → 총자산 즉시 갱신
  // [S3] 빠른입력(QuickAddSheet) 저장 시 총자산 즉시 재조회(낙관적 갱신 이벤트 수신)
  useEffect(() => {
    const onAssets = () => {
      getAssetLedger(trader)
        .then(a => setAssetSum(a?.total_uk != null ? a : null))
        .catch(() => {});
    };
    window.addEventListener('onehub-assets-change', onAssets);
    return () => window.removeEventListener('onehub-assets-change', onAssets);
  }, [trader]);

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
    // [알림카드 item6] 운영자 신고가(spot_price) — 내 단지 기준. 운영자가 기입한 내용도 카드에 포함.
    try {
      const mp = JSON.parse(localStorage.getItem('onehub_re_my_property') || 'null');
      if (mp?.name) {
        fetch(`/api/input/re-spot?complex_name=${encodeURIComponent(mp.name)}`)
          .then(r => r.json())
          .then(d => { if (d?.ok && Array.isArray(d.items)) setOpNotes(d.items); })
          .catch(() => {});
      }
    } catch (e) {}
    // [N1] 총자산 = 단일 원장(lib/ledger). ETF 실시간 평가·온보딩 미러링은 원장이 내부에서 처리하므로
    //   여기서 다시 조정하지 않는다(과거 이중 조정·미러 오염의 원인).
    getAssetLedger(trader)
      .then(a => {
        if (a?.total_uk != null) {
          setAssetSum(a);
          // [추세] 홈은 '총자산 소유 페이지' — 오늘치 스냅샷을 여기서 정본으로 적립.
          recordAssetSnapshot(trader, a);
          setAssetDelta(getAssetDelta(trader));
        } else setAssetSum(null);
      })
      .catch(() => setAssetSum(null));
    fetch(`/api/realestate/v2/ai-summary?trader_id=${trader}`)
      .then(r => r.json())
      .then(d => { if (d && Array.isArray(d.summary_items)) setAiRec(d); })
      .catch(() => {});
    // [브리핑] 부동산 최근 실거래(신고가) 피드 + 오늘 환율 — 판단 근거 카드용
    fetch(`/api/pwa/re/feed`)
      .then(r => r.json())
      .then(d => { if (d && Array.isArray(d.feed)) setReFeed(d); })
      .catch(() => {});
    fetch(`/api/fx/usdkrw`)
      .then(r => r.json())
      .then(d => { if (d?.ok && d.rate) setFxRate(d.rate); })
      .catch(() => {});
  }, [mounted, trader]);

  // [성과비교] 가장 이른 매수일 기준으로 시장지수 구간 수익률 조회(보유가 해외 우세면 S&P, 아니면 KOSPI)
  useEffect(() => {
    if (!mounted) return;
    const perf = computeMyPerf(data, assetSum, trader, fxRate);
    const sd = perf?.sinceDate;
    if (!sd) { setBenchPerf(null); return; }
    let overseas = 0, domestic = 0;
    try { getEtfHoldings(trader).forEach((h) => (h.market === 'us' ? overseas++ : domestic++)); getStockHoldings(trader).forEach((h) => (h.market === 'us' ? overseas++ : domestic++)); } catch (e) {}
    const symbol = overseas > domestic ? 'spx' : 'kospi';
    fetch(`/api/index/history?symbol=${symbol}&from=${sd}`)
      .then((r) => r.json())
      .then((d) => setBenchPerf({ ...d, from: sd, symbol }))
      .catch(() => setBenchPerf({ ok: false, from: sd, symbol }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, trader, assetSum, fxRate, stManualTick]);

  useEffect(() => {
    if (!mounted) return;
    // [기록] AI 자기검증(차단 적중률) — ML 누적 학습 현황 카드용
    fetch(`/api/pwa/accuracy?trader_id=${trader}`)
      .then(r => r.json())
      .then(d => { if (d && d.ok) setAccuracy(d); })
      .catch(() => {});
    // [자기검증] 오늘 vs 전일 AI 판단 변화
    fetch(`/api/pwa-ai-daily?trader=${trader}`)
      .then(r => r.json())
      .then(d => { if (d && d.ok) setAiDaily(d); })
      .catch(() => {});
  }, [mounted, trader]);

  // [사용자 지시] AI 개선노트·학습 현황이 "지금 시점"만 보여줘 시점별 개선을 알 수 없던 문제 —
  //   백엔드에 히스토리가 없어 앱을 열 때마다 이번 주(월요일 기준) 적중률을 로컬에 적립한다.
  useEffect(() => {
    if (!accuracy?.ok) return;
    const s = accuracy.summary || {};
    if (s.accuracy_pct == null) return;
    const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
    const monday = new Date(kst); monday.setUTCDate(kst.getUTCDate() - ((kst.getUTCDay() + 6) % 7));
    const applyDate = `${monday.getUTCFullYear()}-${String(monday.getUTCMonth() + 1).padStart(2, '0')}-${String(monday.getUTCDate()).padStart(2, '0')}`;
    recordAccuracySnapshot({ date: applyDate, accuracyPct: s.accuracy_pct, totalChecked: s.total_checked ?? null });
  }, [accuracy]);

  // [S-7] 판단근거 시트 열릴 때 기업개요 온디맨드 로드(캐시)
  useEffect(() => {
    const code = bottomSheet?.code;
    if (!code || companyInfo[code] !== undefined) return;
    let alive = true;
    fetch(`/api/input/company-info?code=${encodeURIComponent(code)}`).then((r) => r.json())
      .then((d) => { if (alive) setCompanyInfo((m) => ({ ...m, [code]: d?.summary || null })); })
      .catch(() => { if (alive) setCompanyInfo((m) => ({ ...m, [code]: null })); });
    return () => { alive = false; };
  }, [bottomSheet?.code]);

  // [라이브 시세][ⓖ] 직접입력(KIS 외 증권사) 보유의 현재가를 자동 갱신 → 평가액이 실시간에 가깝게 반영.
  //   manualPx: id → { price, currency, krw, date }. 원장(getLedger)과 동일 소스(/api/etf/quote)로 일관.
  //   KIS는 서버가 1분 주기로 잔고를 갱신하므로, 수동입력 종목도 같은 주기로 자동 재조회해 격차를 없앤다
  //   (기존엔 접속 시 1회뿐이라 화면을 오래 켜두면 시세가 낡아졌음). 백그라운드 탭은 폴링을 건너뛰고,
  //   탭이 다시 보이면 즉시 재조회한다.
  useEffect(() => {
    if (!mounted) return;
    let alive = true;
    const refresh = async () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      const list = getStockHoldings(trader);
      if (!list.length) { if (alive) setManualPx({}); return; }
      const { quotes } = await fetchStockQuotes(list);
      if (alive) setManualPx(quotes);
    };
    refresh();
    const id = setInterval(refresh, 60000);
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive = false;
      clearInterval(id);
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisible);
    };
  }, [mounted, trader, stManualTick]);

  // [S-6] 추천 리스트가 갱신될 때, 직전에 노출됐다가 사라진(해제된) 무액션 종목을
  //   자동 '관망'(auto_watch)으로 편입 → 추천 종목의 '나 vs AI' 편입률 100%(데이터 유실 0).
  useEffect(() => {
    if (!mounted || !data?.screening_candidates) return;
    const current = dedupBy(data.screening_candidates, (c) => c.code || c.name).map((s) => ({ code: s.code, name: s.name }));
    const auto = reconcileAutoWatch(current, trader);
    if (auto.length) setAutoWatchNote(auto);
    // [게임 규율] 추천 종목의 확신 점수(code→score) 저장 → 나 vs AI에서 AI가 매수/관망 판정에 사용.
    try {
      const m = JSON.parse(localStorage.getItem('onehub_rec_scores') || '{}');
      [...(data.screening_candidates || []), ...(data.today_buys || [])].forEach((s) => {
        if (s && s.code) { const v = Number(s.final_score ?? s.score); if (!Number.isNaN(v)) m[s.code] = v; }
      });
      localStorage.setItem('onehub_rec_scores', JSON.stringify(m));
    } catch {}
  }, [mounted, trader, data?.screening_candidates]);

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
    // [S-5] 즉시 피드백 — 결과 확인일(3일 뒤) 명시
    const _rd = new Date(Date.now() + 3 * 86400000);
    setDecFeedback({ name, decision, date: `${_rd.getMonth() + 1}/${_rd.getDate()}` });
    clearTimeout(logDecision._t); logDecision._t = setTimeout(() => setDecFeedback(null), 5000);
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
        // [업체 정보] 백엔드가 주는 업종/요약을 있으면 그대로 노출(허위 생성 금지)
        const info = d?.sector || d?.업종 || d?.industry || d?.summary || d?.technical_summary || d?.key_signal || null;
        // [목표가 기간] 백엔드 horizon 우선, 없으면 상승여력 크기로 추정
        const horizonDays = Number(d?.horizon_days ?? d?.target_days) || null;
        merge({ cur, tgt, stp, ok: !!tgt, info: info ? String(info).slice(0, 80) : null, horizonDays });
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
  const heatLabel = (h) => { const t = heatTier(h); return t === 'hot' ? '과열' : t === 'warm' ? '따뜻' : '냉각'; };
  // [S15-C1] 시장 국면(Regime) 한글 매핑 — 화면에 영문 코드 노출 금지
  const rgKo = (r) => ({ BULL: '상승장', BEAR: '하락장', SIDE: '횡보', SIDEWAYS: '횡보', NEUTRAL: '중립' }[String(r || '').toUpperCase()] || r || '-');
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
  // [S1.4] 보유 종목도 종목코드 기준 공용 dedup(이중 방어)
  positions = dedupBy(positions, (p) => p.code || p.stock || p.name);

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
  // [AI-5] 추천(관심)이면서 매수 차단인 종목 식별 — 추천 카드에 '최종 판단'을 병기해 관심+차단 모순 해소.
  const blockedCodeSet = new Set((data?.today_blocked ?? data?.blocked_stocks ?? []).map(b => String(b?.code ?? b?.stock ?? '')).filter(Boolean));
  const isBlockedCode = (code) => code != null && blockedCodeSet.has(String(code));
  // [AI-5] 차단 종목을 '샀어요'로 기록할 땐 오염 방지 경고 후 확인.
  // [2026-08-05 재작업] window.prompt/confirm은 카카오톡 인앱브라우저 등에서 아예 안 뜨거나
  //   조용히 무시돼 '샀어요'가 아무 반응 없어 보이는 사고가 있었다 — 앱 내장 시트(sharesPrompt)로 교체.
  //   샀어요 = 나 vs AI 게임 판단(%)일 뿐 실제 보유수량은 안 남았다 — 몇 주 샀는지 물어서
  //   답하면 '직접 입력 보유'에도 자동 등록(건너뛰어도 게임 기록엔 영향 없음).
  const logTake = (code, name) => {
    if (isBlockedCode(code)) {
      setSharesPrompt({ code, name, needsBlockedConfirm: true });
      return;
    }
    logDecision(code, name, 'take');
    setSharesPromptInput('');
    setSharesPrompt({ code, name });
  };
  const confirmBlockedTake = () => {
    if (!sharesPrompt) return;
    const { code, name } = sharesPrompt;
    logDecision(code, name, 'take');
    setSharesPromptInput('');
    setSharesPrompt({ code, name });
  };
  const submitSharesPrompt = async () => {
    if (!sharesPrompt) return;
    const { code, name } = sharesPrompt;
    const shares = Number(sharesPromptInput);
    if (!(shares > 0)) { setSharesPrompt(null); return; }
    setSharesPrompt((p) => (p ? { ...p, saving: true, err: '' } : p));
    let px = 0;
    try {
      const r = await fetch(`/api/analyze-stock?code=${code}`);
      const d = await r.json();
      px = Number(d?.current_price ?? d?.price) || 0;
    } catch {}
    if (!px) {
      setSharesPrompt((p) => (p ? { ...p, saving: false, err: '현재가를 불러오지 못했습니다 — 자산 탭에서 직접 추가해 주세요.' } : p));
      return;
    }
    const res = buyStock({ name, code, shares, avgPrice: px, trader, priceBasis: 'current' });
    if (res.ok) window.dispatchEvent(new Event('onehub-assets-change'));
    setSharesPrompt(null);
  };
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

  // [T-2] TOP PICK — 종목코드 dedup + 스코어 차등 + 근거 태그 2개 + 타이브레이커.
  const _mkPick = (x, isBuy) => ({
    code: x.code || null,
    name: x.stock || x.name || '',
    score: Number(x.final_score ?? x.score ?? 0),
    isBuy,
    reasons: x.reasons || null,
    rsi: x.rsi != null ? Number(x.rsi) : null,
    volRatio: x.vol_ratio != null ? Number(x.vol_ratio) : null,
    chg5: x.change_5d != null ? Number(x.change_5d) : null,
    chg1: x.change_1d != null ? Number(x.change_1d) : null,
  });
  const _pickPool = [
    ...(data?.today_buys || []).map(b => _mkPick(b, true)),
    ...(data?.screening_candidates || []).map(s => _mkPick(s, false)),
  ].filter(p => p.name);
  // [S-4] dedup: 홈·추천 공용 dedupBy 사용(종목코드 기준). 매수신호·고스코어 우선을 위해 사전 정렬 후 첫 항목 채택.
  const _ordered = [..._pickPool].sort((a, b) => (Number(b.isBuy) - Number(a.isBuy)) || (b.score - a.score));
  // 타이브레이커: 종합 스코어 → 모멘텀(5일) → 유동성(거래량비)
  const _picks = dedupBy(_ordered, (p) => p.code || p.name).sort((a, b) =>
    (b.score - a.score) || ((b.chg5 ?? 0) - (a.chg5 ?? 0)) || ((b.volRatio ?? 0) - (a.volRatio ?? 0))
  ).slice(0, 3);
  const _pickTags = (p) => {
    const tags = [];
    if (p.reasons) String(p.reasons).split(/[,|·/;]+/).map(s => s.trim()).filter(Boolean).forEach(t => tags.push(t));
    if (p.isBuy && tags.length < 2) tags.push('매수 신호');
    if (tags.length < 2 && (p.volRatio ?? 0) >= 1.3) tags.push('거래량 급증');
    if (tags.length < 2 && (p.chg5 ?? 0) > 0) tags.push(`5일 +${Number(p.chg5).toFixed(1)}%`);
    if (tags.length < 2 && (p.rsi ?? 0) >= 55) tags.push(`RSI ${Math.round(p.rsi)}`);
    if (tags.length < 2 && (p.chg1 ?? 0) !== 0) tags.push(`전일 ${p.chg1 > 0 ? '+' : ''}${Number(p.chg1).toFixed(1)}%`);
    return tags.slice(0, 2);
  };
  // 차등 스코어(동점 방지): 종합 + 모멘텀·유동성 미세 가중 → 소수 1자리
  const topPicks = _picks.map((p, i) => ({
    ...p, rank: i + 1, tags: _pickTags(p),
    dispScore: Math.round((p.score + (p.chg5 ?? 0) * 0.01 + (p.volRatio ?? 0) * 0.001) * 10) / 10,
  }));
  // 유의미한 차등이 없으면 랭킹 대신 '관심 종목'(근거 없는 랭킹 금지)
  const topPicksRanked = topPicks.length > 1 && new Set(topPicks.map(p => p.dispScore)).size === topPicks.length;

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
        {/* [UI 통일] 공통 헤더 — ONE·HUB + 🔍만(＋·⚙️는 하단 BottomNav). */}
        <AppHeader onSearch={() => setTab('analyze')} />

        {/* [N2] 상단 5탭 제거 — 하단 4탭(BottomNav)과 공존해 '내비가 둘'인 상태가 원 지적이었다.
            도달성은 유지된다: 종합자산·AI = 하단탭, 주식·ETF·부동산 = 자산 지도 범례.
            주식 내부 이동은 아래 서브탭(보유·추천)이 담당한다. */}
        {/* [사용자 지시] 종합자산 자산지도에서 "보유/추천 자세히"로 들어온 경우에도 상단 메뉴(종합자산
            자산지도)가 그대로 이어지도록. "주식" 탭 클릭 시 assets.js로 복귀 — stockTab은 그쪽에서
            localStorage로 기억해 원 위치(보유/추천)로 복귀한다. */}
        {['recommend','portfolio'].includes(tab) && (
          <AssetMapTitle current="주식" />
        )}
        {/* [S2 IA] 주식 카테고리 서브탭 — 보유 · 추천 (기록은 트러스트 탭으로) */}
        {['recommend','portfolio'].includes(tab) && (
          <nav className="pwa-subtabs">
            {[['portfolio','보유'],['recommend','추천']].map(([t,label]) => (
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
            {/* [알림카드 #5·#6] 오늘 알림 확인 — 텔레그램 상세 본문 + 운영자 신고가. 푸시 클릭 시 여기서 상세 확인. */}
            {(notis.length > 0 || opNotes.length > 0) && (
              <section className="pwa-card noti-card" id="noti-card">
                <span className="pwa-card-label">🔔 오늘 알림 · 상세 확인</span>
                <div className="noti-list">
                  {opNotes.slice(0, 3).map((s, i) => (
                    <div className="noti-item op" key={`op${i}`}>
                      <span className="noti-ic">🏢</span>
                      <div className="noti-b">
                        <div className="noti-t">OneHub 신고가 · {s.complex_name}{s.area_m2 ? ` ${Math.round(s.area_m2)}㎡` : ''}<span className="noti-src">OneHub</span></div>
                        <div className="noti-d open">{s.price_manwon ? `${(s.price_manwon / 10000).toFixed(2)}억` : ''} · {s.kind || '신고'}{s.reporter ? ` · ${s.reporter}` : ''}{s.status === 'tentative' ? ' · 미확정(참고)' : ''}</div>
                      </div>
                      {s.created_at && <span className="noti-ts mono">{String(s.created_at).slice(5, 16)}</span>}
                    </div>
                  ))}
                  {notis.slice(0, 6).map((n, i) => {
                    const title = n.title || n.message || n.text || '알림';
                    const body = n.body || n.detail || '';
                    const t = n.noti_type || n.type || '';
                    const src = n.source || '';
                    const isOp = /operator|운영자|manual/i.test(src);
                    const ic = isOp ? '🧑‍💼' : /buy|매수|신호/i.test(t + title) ? '📈' : /sell|매도|손절|익절/i.test(t + title) ? '📉' : /report|리포트/i.test(t + title) ? '📄' : /critical|error|오류|circuit/i.test(t + title) ? '⚠️' : '🔔';
                    const ts = n.sent_at || n.created_at || n.timestamp || null;
                    const when = ts ? String(ts).replace('T', ' ').slice(5, 16) : null;
                    const open = notiOpen === i;
                    const hasDetail = body && body.trim() && body.trim() !== title.trim();
                    return (
                      <div className={`noti-item ${n.is_read ? '' : 'unread'}`} key={i} onClick={() => hasDetail && setNotiOpen(open ? null : i)} style={{ cursor: hasDetail ? 'pointer' : 'default' }}>
                        <span className="noti-ic">{ic}</span>
                        <div className="noti-b">
                          <div className="noti-t">{title}{isOp && <span className="noti-src">OneHub</span>}{hasDetail && <span className="noti-more">{open ? '▲' : '▾'}</span>}</div>
                          {hasDetail && open && <div className="noti-d open">{body}</div>}
                        </div>
                        {when && <span className="noti-ts mono">{when}</span>}
                      </div>
                    );
                  })}
                </div>
                <p className="noti-foot">📱 텔레그램으로 받은 알림과 OneHub 신고가를 여기서 확인합니다 · 항목을 누르면 상세가 펼쳐집니다.</p>
              </section>
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
                const etfPct = (totalUk && b.etf_uk != null) ? Math.round((b.etf_uk / totalUk) * 1000) / 10 : null;
                const riskGrade = rePct == null ? null : rePct > 70 ? '높음' : rePct >= 40 ? '중간' : '낮음';
                const stance = buyCount > 0 ? `${buyCount}종목 매수` : '선별 관망';
                // [오늘의 액션] 주식만이 아닌 크로스에셋 실행 항목 2~3개(항상 최소 2개)
                const actions = [];
                actions.push(buyCount > 0
                  ? { ic: '📈', k: '주식', t: `매수 신호 ${buyCount}종목 — 추천 탭에서 확인`, go: () => setTab('recommend') }
                  : { ic: '📈', k: '주식', t: `매수 조건 미달 — 선별 관망 유지${blockCount > 0 ? ` (${blockCount}건 차단)` : ''}`, go: () => setTab('recommend') });
                actions.push({ ic: '💠', k: 'ETF', t: etfPct != null ? `보유 비중 ${etfPct}% — 계좌별 리밸런싱·세제 점검` : '계좌별(연금·ISA) 비중·세제 점검', go: () => router.push('/pwa/etf') });
                if (rePct != null) actions.push({ ic: '🏠', k: '부동산', t: rePct > 70 ? `자산의 ${rePct}% 집중 — 신규 매입 보류·쏠림 축소` : '갈아타기·전세 갭 추이 점검', go: () => router.push('/pwa/realestate') });
                // 크로스에셋 결론: 부동산 구조 쏠림 > 시장 스탠스 순으로 한 줄 결론 산출
                let concl, why;
                if (rePct != null && rePct > 70) {
                  concl = <>오늘은 <em>{stance}</em>. 자산의 <b>{rePct}%가 부동산</b> — 쏠림을 줄일 때입니다.</>;
                  why = <>부동산 구조 리스크 <b>{riskGrade}</b>. 실물이라 즉시 조정은 어렵지만, 오늘 들어오는 <b>현금·매매 수익은 부동산 외 자산</b>(주식·ETF·현금)으로만 배분하세요. 신규 부동산 매입은 보류가 낫습니다.{buyCount === 0 ? ` 주식은 시장 온도 Heat ${heat ?? '-'}로 선별 관망 중입니다.` : ` 주식은 조건 충족 ${buyCount}종목에 매수 신호가 있습니다.`}</>;
                } else if (rePct != null) {
                  concl = <>오늘은 <em>{stance}</em>. 자산 배분 균형은 <b>{riskGrade === '낮음' ? '양호' : '보통'}</b>합니다.</>;
                  why = <>부동산 {rePct}%로 구조 리스크 <b>{riskGrade}</b>. 시장 온도 <b>{heat ?? '-'} ({heatLabel(heat) || '-'})</b> · 국면 <b>{rgKo(regime)}</b>. {buyCount > 0 ? `주식 ${buyCount}종목 매수 신호.` : `매수 조건 미달로 ${blockCount || 0}건을 걸렀습니다.`}</>;
                } else {
                  concl = <>오늘은 <em>{stance}</em>. {buyCount > 0 ? `조건 충족 ${buyCount}종목 매수 신호.` : '매수 조건 미달, 선별 관망.'}</>;
                  why = <>시장 온도 <b>{heat ?? '-'} ({heatLabel(heat) || '-'})</b> · 국면 <b>{rgKo(regime)}</b>. {blockCount > 0 ? `후보 ${blockCount}건은 기준 미달로 걸렀습니다. ` : ''}부동산·현금을 입력하면 자산 전체 기준 판단으로 넓혀집니다.</>;
                }
                return (
                  <section className="home-hero">
                    <div className="hh-eyebrow">
                      <div className="hh-eyebrow-top">
                        <span className="hh-label">🧭 오늘의 통합 AI 판단</span>
                      </div>
                      <span className="hh-scope">주식 · ETF · 부동산 · 현금 통합</span>
                    </div>
                    <h1 className="hh-h1">{concl}</h1>
                    {totalUk != null && (
                      <div className="hh-total">총자산 <b>{totalUk}억</b>{rePct != null && <span className="hh-total-sub"> · 부동산 {rePct}%</span>}</div>
                    )}
                    {/* [오늘의 액션] 최소 2가지 크로스에셋 실행 항목 — 카드만 보고 오늘 할 일 파악 */}
                    <div className="hh-actions">
                      <div className="hh-actions-h">✅ 오늘의 액션</div>
                      {actions.map((a, i) => (
                        <button className="hh-act" key={i} onClick={(e) => { e.stopPropagation(); a.go && a.go(); }}>
                          <span className="hh-act-ic">{a.ic}</span>
                          <span className="hh-act-k">{a.k}</span>
                          <span className="hh-act-t">{a.t}</span>
                          <span className="hh-act-go">→</span>
                        </button>
                      ))}
                    </div>
                    {/* 근거: 버튼/이탈 없이 카드 안 '왜?' 인라인 펼치기 (원칙4) */}
                    <button className="hh-why" onClick={() => setHeroWhyOpen(o => !o)} aria-expanded={heroWhyOpen}>
                      <span>왜 이렇게 판단했나?</span><span className={`hh-why-caret ${heroWhyOpen ? 'open' : ''}`}>▾</span>
                    </button>
                    {heroWhyOpen && (
                      <div className="hh-why-body">
                        <div className="hh-reason">{why}</div>
                        <div className="hh-foot">
                          <span className="hh-chip">국면 <span className="v">{rgKo(regime)}</span></span>
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

              {/* [T-3 Tier 1] TOP PICK — 히어로(결론+액션) 직후. 첫 화면 스크롤 0 목표. */}
              {topPicks.length > 0 && (
                <section className="card v10 tp-card">
                  <div className="v10-sect"><h3>{topPicksRanked ? '⭐ 오늘의 TOP PICK' : '👀 오늘의 관심 종목'}</h3><a onClick={() => setTab('recommend')}>추천 전체 →</a></div>
                  <div className="v10-pick-note">{topPicksRanked ? '기술 스코어링 상위 · 실제 매수 신호와 별개' : '스코어 차등이 유의미하지 않아 순위 없이 표시'}</div>
                  {topPicks.map((p) => (
                    <div className="tp-row" key={p.code || p.name}>
                      <div className="tp-l">
                        {topPicksRanked && <div className="tp-medal" style={{ background: p.rank === 1 ? 'var(--color-warning)' : p.rank === 2 ? 'var(--color-ink-3)' : 'var(--color-warning-ink)' }}>{p.rank}</div>}
                        <div className="tp-meta">
                          <span className="tp-name">{p.name}{p.isBuy && <span className="tp-buy">매수신호</span>}</span>
                          <span className="tp-tags">{p.tags.length ? p.tags.map((t, j) => <span className="tp-tag" key={j}>{t}</span>) : <span className="tp-tag muted">기술 스코어 상위</span>}</span>
                        </div>
                      </div>
                      <div className="tp-r">
                        {topPicksRanked && <span className="tp-score mono" title="종합 스코어(모멘텀·유동성 반영)">{p.dispScore.toFixed(1)}</span>}
                        <button className="v10-mini-btn" onClick={() => setTab('recommend')}>AI<br />분석</button>
                      </div>
                    </div>
                  ))}
                </section>
              )}

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
                        {heat != null && <div className="mini-g heat"><span className="mini-dot" style={{ left: `${Math.max(0, Math.min(100, heat))}%` }} /></div>}
                      </div>
                      <div className="mp-chip">
                        <span className="mp-ck">😨 공포·탐욕</span>
                        <span className="mp-cv" style={{ color: fgColor(fearGreed) }}>{fearGreed ?? '-'} {fearGreed != null ? `· ${fgLabel(fearGreed)}` : ''}</span>
                        {fearGreed != null && <div className="mini-g fg"><span className="mini-dot" style={{ left: `${Math.max(0, Math.min(100, fearGreed))}%`, background: fgColor(fearGreed) }} /></div>}
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
                const rePctA = totalUk && assetSum?.breakdown?.realestate_uk != null ? Math.round((Number(assetSum.breakdown.realestate_uk) / totalUk) * 1000) / 10 : null;
                return (
                  <>
                  <HomeAccordion id="assets" title="💰 자산 구성" summary={`총 ${totalUk != null ? totalUk + '억' : '—'}${rePctA != null ? ` · 부동산 ${rePctA}%` : ''}`}>
                    <div className="v10-total" onClick={() => setShowAssetDetail(true)} style={{ cursor: 'pointer' }}><span className="v10-total-lbl">총자산</span><span className="v10-total-amt mono">{totalUk != null ? `${totalUk}억` : '—'}</span>{assetDelta && assetDelta.total != null && Math.abs(assetDelta.total) >= 0.005 && (<span className={`v10-tdelta ${assetDelta.total > 0 ? 'up' : assetDelta.total < 0 ? 'down' : 'flat'}`}>{assetDelta.total >= 0 ? '▲' : '▼'} {Math.abs(assetDelta.total).toFixed(2)}억</span>)}<span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--color-muted)' }}>상세 ▸</span></div>
                    {[
                      ['주식', 'var(--color-primary)', assetSum?.breakdown?.stock_uk, '/pwa?tab=recommend', 'stock'],
                      ['ETF', 'var(--color-success)', assetSum?.breakdown?.etf_uk, '/pwa/etf', 'etf'],
                      ['부동산', 'var(--color-ink-3)', assetSum?.breakdown?.realestate_uk, '/pwa/realestate', 'realty'],
                      ['현금', 'var(--color-warning)', cashUk, '/pwa/onboarding', 'cash'],
                    ].map(([label, color, val, href, dkey]) => {
                      // [추세] 전일 대비 변화액(억). 0.005억 미만은 노이즈로 숨김.
                      const dv = assetDelta ? assetDelta[dkey] : null;
                      const dShow = dv != null && Math.abs(dv) >= 0.005;
                      const dCls = dv > 0 ? 'up' : dv < 0 ? 'down' : 'flat';
                      return (
                      <div className="v10-arow" key={label}>
                        <span className="v10-aname"><i className="v10-adot" style={{ background: color }} />{label}</span>
                        {val != null
                          ? <span className="v10-aval mono">{val}억{dShow && <em className={`v10-adelta ${dCls}`}>{dv >= 0 ? '+' : '−'}{Math.abs(dv).toFixed(2)}</em>}</span>
                          : <span className="v10-miss"><span className="v10-miss-tag">미입력</span><button className="v10-miss-btn" onClick={() => { window.location.href = href; }}>입력하기 →</button></span>}
                      </div>
                      );
                    })}
                    {/* [S2 IA] AI자산(배분 정밀 진단)은 대시보드에서 진입 — 상시 노출 링크 */}
                    <button className="v10-diag-link" onClick={() => { window.location.href = '/pwa/ai-advisor'; }}>
                      🩺 AI 배분 정밀 진단 · 포트폴리오 주치의 <span>→</span>
                    </button>
                  </HomeAccordion>
                  {showAssetDetail && (() => {
                    const rows = [
                      ['주식', assetSum?.breakdown?.stock_uk, 'var(--color-primary)'],
                      ['ETF', assetSum?.breakdown?.etf_uk, 'var(--color-success)'],
                      ['부동산', assetSum?.breakdown?.realestate_uk, 'var(--color-ink-3)'],
                      ['현금', cashUk, 'var(--color-warning)'],
                    ];
                    const denom = totalUk || rows.reduce((s, r) => s + (Number(r[1]) || 0), 0) || 1;
                    return (
                      <div onClick={() => setShowAssetDetail(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
                        <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 380, background: 'var(--color-card)', color: 'var(--color-text)', borderRadius: 16, padding: 18, boxShadow: '0 12px 40px rgba(0,0,0,.3)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                            <b style={{ fontSize: 15 }}>총자산 상세</b>
                            <button onClick={() => setShowAssetDetail(false)} style={{ border: 'none', background: 'transparent', fontSize: 18, color: 'var(--color-muted)', cursor: 'pointer' }}>✕</button>
                          </div>
                          <div className="mono" style={{ fontSize: 26, fontWeight: 800, marginBottom: 12 }}>{totalUk != null ? `${totalUk}억` : '—'}</div>
                          {rows.map((r) => {
                            const label = r[0], val = r[1], color = r[2];
                            const v = Number(val);
                            const has = val != null && !Number.isNaN(v);
                            const pct = has ? Math.round((v / denom) * 1000) / 10 : null;
                            return (
                              <div key={label} style={{ marginBottom: 10 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 14 }}>
                                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><i style={{ width: 9, height: 9, borderRadius: '50%', background: color, display: 'inline-block' }} />{label}</span>
                                  <span style={{ fontWeight: 700 }}>{has ? `${v}억` : '미입력'}{has && pct != null ? <span style={{ color: 'var(--color-muted)', fontWeight: 500, marginLeft: 6 }}>{pct}%</span> : null}</span>
                                </div>
                                {has && <div style={{ height: 6, borderRadius: 99, background: 'var(--color-line)', marginTop: 5, overflow: 'hidden' }}><div style={{ width: `${Math.min(100, pct || 0)}%`, height: '100%', background: color }} /></div>}
                              </div>
                            );
                          })}
                          <div style={{ fontSize: 11.5, color: 'var(--color-muted)', marginTop: 8 }}>주식=KIS 실시간 · ETF=평가액 · 부동산=AI 추정 시세. 미입력 자산군은 입력 시 반영됩니다.</div>
                        </div>
                      </div>
                    );
                  })()}
                  </>
                );
              })()}

              {/* [브리핑] ③ 오늘의 브리핑 · 판단 근거 — 상단 '판단·액션'과 다른 '근거'를 제시.
                    경제지표 + 부동산 신고가·실거래 + 내 자산 활동(실데이터만, 허위 헤드라인 금지) */}
              <HomeAccordion id="briefing" title="📰 오늘의 브리핑 · 판단 근거" summary={`국면 ${regime || '-'} · 시장온도 ${heat ?? '-'}`}>
                {/* A) 시장·경제 지표 — 실측 매크로(경제 브리핑의 근거) */}
                <div className="bf-block">
                  <div className="bf-h">🌐 시장·경제 지표</div>
                  <div className="bf-macro">
                    {regime && <span className={`bf-chip ${regimeClass(regime)}`}>국면 {regime}</span>}
                    {heat != null && <span className="bf-chip">시장온도 {heat}</span>}
                    {fearGreed != null && <span className="bf-chip">공포·탐욕 {fearGreed}</span>}
                    {vix != null && <span className="bf-chip">VIX {vix}</span>}
                    {fxRate != null && <span className="bf-chip">환율 {Math.round(fxRate).toLocaleString()}원</span>}
                  </div>
                  <div className="bf-macro-read">{regime === 'BEAR' ? '위험선호 위축 — 방어적 배분 우위' : regime === 'BULL' ? (heat != null && heat >= 70 ? '상승세 과열 — 추격보다 눌림목 대기' : '상승 우호 — 선별 매수 유효') : '중립 — 지표 확인 후 선별 대응'}</div>
                </div>

                {/* B) 부동산 신고가·실거래 — raw_transactions 기반 실데이터(변동률>0 = 직전 대비 신고가) */}
                <div className="bf-block">
                  <div className="bf-h">🏠 부동산 신고가·실거래</div>
                  {reFeed?.feed?.length > 0 ? (
                    <>
                      {[...reFeed.feed].sort((a, b) => (b.변동률 ?? -999) - (a.변동률 ?? -999)).slice(0, 2).map((f, i) => (
                        <button className="bf-re" key={`${f.단지명}-${f.거래일}-${i}`} onClick={() => router.push('/pwa/realestate')}>
                          <span className="bf-re-l">
                            <b className="bf-re-name">{f.단지명}</b>
                            <span className="bf-re-sub">{f.전용면적}㎡{f.층 ? ` · ${f.층}층` : ''}{f.거래일 ? ` · ${f.거래일.slice(5)}` : ''}</span>
                          </span>
                          <span className="bf-re-r">
                            <b className="bf-re-px">{f.거래금액_억}억</b>
                            {f.변동률 != null && <span className={`bf-re-chg ${f.변동률 > 0 ? 'up' : f.변동률 < 0 ? 'dn' : 'fl'}`}>{f.변동률 > 0 ? `▲${f.변동률}% 신고가` : f.변동률 < 0 ? `▼${Math.abs(f.변동률)}%` : '−'}</span>}
                          </span>
                        </button>
                      ))}
                      <div className="bf-note">국토부 실거래가 기준 · 동일 단지·평형 직전 거래 대비{reFeed.updated ? ` · ${reFeed.updated}` : ''}</div>
                    </>
                  ) : (
                    <div className="bf-empty">관심·보유 단지를 등록하면 최근 실거래·신고가가 표시됩니다. <button className="bf-empty-link" onClick={() => router.push('/pwa/realestate')}>부동산 열기 →</button></div>
                  )}
                </div>

                {/* C) 내 자산 활동 알림은 상단 '🔔 오늘 알림 · 상세 확인' 카드로 이동(#5·#6) — 중복 제거 */}

                {/* D) 오늘 AI 실행 — 판단이 실제 행동으로 이어진 근거(집계) */}
                <div className="bf-exec">
                  <span className="bf-exec-h">오늘 AI 실행</span>
                  <span className="bf-exec-items">
                    <span>매수 <b style={{ color: 'var(--color-success)' }}>{buyCount}</b></span>
                    <span>매도 <b style={{ color: 'var(--color-danger)' }}>{sellCount}</b></span>
                    <span>관망 <b style={{ color: 'var(--color-primary)' }}>{watchCount}</b></span>
                    <span>차단 <b style={{ color: 'var(--color-ink-3)' }}>{blockCount}</b></span>
                    <span>승인대기 <b>{pendingList.length}</b></span>
                  </span>
                </div>
                <a className="acc-more" onClick={() => setTab('report')}>기록 전체 →</a>
              </HomeAccordion>

              {/* [T-1] 성과 카드 — 접힘형 기본 + 현재/원인/다음수 3블록. 수치 단독·귀책 프레이밍 금지. */}
              {(() => {
                const perf = mounted ? computeMyPerf(data, assetSum, trader, fxRate) : null;
                const months = perf?.sinceDate ? Math.max(1, Math.round((Date.now() - new Date(perf.sinceDate).getTime()) / (86400000 * 30.4))) : null;
                const my = perf?.myPct;
                const bench = benchPerf?.ok ? benchPerf.pct : null;
                const excess = (my != null && bench != null) ? Math.round((my - bench) * 100) / 100 : null;
                const bd = assetSum?.breakdown || {};
                const tot = (Number(bd.stock_uk) || 0) + (Number(bd.etf_uk) || 0) + (Number(bd.realestate_uk) || 0) + (Number(bd.cash_uk) || 0);
                const rePct = tot > 0 && bd.realestate_uk != null ? Math.round((Number(bd.realestate_uk) / tot) * 1000) / 10 : null;
                const improved = excess != null && excess < 0 ? Math.round(excess * 0.28 * 100) / 100 : null;

                // 성과 미산출(수치 없음) — 프레이밍 규칙 무관, 입력 유도만
                if (!perf?.sinceDate || my == null) {
                  return (
                    <section className="card cmp-card">
                      <div className="v10-sect"><h3>📈 시장 대비 내 성과</h3></div>
                      <div className="cmp-cta">보유에 <b>매수일</b>을 입력하면 그때부터 <b>내 자산 vs 시장지수</b>를 비교해 드립니다. <button className="cmp-cta-link" onClick={() => setTab('portfolio')}>주식 보유 입력 →</button></div>
                    </section>
                  );
                }
                const summary = excess != null
                  ? `시장 대비 ${excess >= 0 ? '+' : ''}${excess.toFixed(1)}%p · ${excess >= 0 ? '초과 성과' : '개선 시나리오 보기'}`
                  : `내 자산 ${my >= 0 ? '+' : ''}${my.toFixed(1)}% · 지수 비교 준비중`;
                return (
                  <HomeAccordion id="perf" title="📈 시장 대비 내 성과" summary={summary} defaultOpen={false}>
                    <div className="pf-block">
                      <div className="pf-k">현재</div>
                      <div className="pf-cur">
                        <span className="pf-cur-i">내 자산 <b className={my >= 0 ? 'up' : 'dn'}>{my >= 0 ? '+' : ''}{my.toFixed(2)}%</b></span>
                        <span className="pf-cur-i">{benchPerf?.label || (benchPerf?.symbol === 'spx' ? 'S&P 500' : 'KOSPI')} <b className={bench == null ? '' : bench >= 0 ? 'up' : 'dn'}>{bench == null ? '—' : `${bench >= 0 ? '+' : ''}${bench.toFixed(2)}%`}</b></span>
                        {excess != null && <span className="pf-excess">시장 대비 <b>{excess >= 0 ? '+' : ''}{excess.toFixed(2)}%p</b></span>}
                      </div>
                      {months && <div className="pf-since">🗓️ {perf.sinceDate}부터 {months}개월 관리 기준</div>}
                    </div>
                    {excess != null && excess < 0 && (
                      <div className="pf-block">
                        <div className="pf-k">원인</div>
                        <div className="pf-cause">{rePct != null && rePct >= 40
                          ? <>자산의 <b>부동산 {rePct}% 쏠림</b>과 저베타 구성이 지수 상승 국면에서 상대 성과를 눌렀습니다.</>
                          : <>저베타·방어적 구성이 지수 상승 국면에서 상대 성과를 눌렀습니다.</>}</div>
                      </div>
                    )}
                    <div className="pf-block pf-next">
                      <div className="pf-k">다음 수</div>
                      <div className="pf-action">{improved != null
                        ? <>리밸런싱·차단 신호를 반영하면 <b>시장 대비 {improved}%p 수준까지 개선 여지</b>가 있습니다 <span className="pf-assume">(가정 기반 추정)</span>.</>
                        : <>리밸런싱·차단 신호로 구성 균형과 하방 방어를 점검해 보세요.</>}</div>
                      <div className="pf-ctas">
                        <button className="pf-cta primary" onClick={() => router.push('/pwa/ai-advisor')}>리밸런싱 시뮬레이션 →</button>
                        <button className="pf-cta" onClick={() => setTab('recommend')}>차단 신호 보기 →</button>
                      </div>
                    </div>
                    <div className="cmp-foot">내 수익률=현재 평가(주식·ETF 실측), 지수=매수일 종가 대비. 개선 추정치는 가정 기반 참고값입니다.</div>
                  </HomeAccordion>
                );
              })()}

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
                    <div className="v10-collap-head" onClick={() => setBasisOpen(o => { writeHomeOpen('basis', !o); return !o; })}>
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

              {/* [T-3] TOP PICK은 Tier 1(히어로 직후)로 이동됨 */}

              {/* [T-3 Tier 2] ⑥ 보유 종목 */}
              <HomeAccordion id="holdings" title="💼 보유 종목" summary={positions.length ? `${positions.length}건` : '없음'}>
                {positions.length === 0
                  ? <div className="pwa-empty">아직 보유 종목이 없어요 — 추가하면 여기에 표시됩니다</div>
                  : positions.slice(0, 5).map((p, i) => (
                    <div className="v10-hold-row" key={i}><span className="v10-hold-name">{p.name}</span><span className={`v10-hold-pct ${(p.pnl_rate ?? 0) >= 0 ? 'up' : 'down'}`}>{(p.pnl_rate ?? 0) >= 0 ? '+' : ''}{p.pnl_rate}%</span></div>
                  ))}
                <a className="acc-more" onClick={() => setTab('portfolio')}>전체 {positions.length}건 →</a>
              </HomeAccordion>

              {/* [T-3 Tier 2] ⑦ 타임라인 — 오늘 AI 분석 흐름 */}
              <HomeAccordion id="timeline" title="🎬 오늘 AI 분석 흐름" summary={`매수 ${buyCount} · 차단 ${blockCount}`}>
                <div className="v10-tl">
                  <div className="v10-tl-item"><div className="v10-tl-time">분석 시작</div><div className="v10-tl-title">시장 분석</div><div className="v10-tl-desc">국면 {rgKo(regime)} · 온도 {heat ?? '-'} · 공포탐욕 {fearGreed ?? '-'}</div></div>
                  <div className="v10-tl-item"><div className="v10-tl-time">스크리닝</div><div className="v10-tl-title">📊 종목 스크리닝</div><div className="v10-tl-desc">후보 {(data.screening_candidates || []).length}종목 선별</div></div>
                  <div className="v10-tl-item"><div className="v10-tl-time">최종 결정</div><div className="v10-tl-title">✅ 최종 결정</div><div className="v10-tl-desc">매수 {buyCount}건 · 차단 {blockCount}건 — 선별 실행</div></div>
                </div>
              </HomeAccordion>

              {/* [v10 UI 시안] ⑧ 최근 활동 — 접기(같은 사유 묶기) */}
              <section className={`card v10 v10-collap ${logOpen ? 'open' : ''}`}>
                <div className="v10-collap-head" onClick={() => setLogOpen(o => { writeHomeOpen('log', !o); return !o; })}>
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
            {/* [사용자 지시] 추천 관심종목 — 종합자산(assets.js)에서 "추천 자세히"로 들어와도 동일한
                라이트 카드 형태를 유지하도록 통일(보유 탭의 acc-hero와 동일 패턴). 제목/업데이트 2줄 정렬 */}
            <section className="rec-hero">
              <div className="rec-hero-top">
                <span className="rec-hero-title">🔍 추천 관심종목</span>
              </div>
              {/* [§3.5] 의미 없는 '방금' 대신 증시 세션 표기 — 매매 시간에 맞춰 맥락을 준다. */}
              <div className="rec-hero-upd"><MarketSession /></div>
              <p className="rec-hero-desc">AI 매수 선별 전 기술 스코어링 상위 후보입니다. 실제 매수 신호와는 별개입니다.</p>
            </section>

            {/* [매매 승인] 추천 탭 상단 — AI 매매 제안 승인/거절 카드 (승인대기 있을 때만) */}
            {pendingList.length > 0 && (
              <section className="pwa-card approve-card">
                <div className="approve-head">
                  <span className="approve-title">🤝 AI 매매 제안 · 승인 대기 <b>{pendingList.length}건</b></span>
                  {!isMarketHoursKST() && <span className="approve-off">{getKrxSession().label} · 예약 승인</span>}
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
                // [S1.4] 종목코드 기준 공용 dedup(이중 방어) 후 정렬
                const uniqCands = dedupBy(data.screening_candidates, (c) => c.code || c.name);
                // [S7.2] 정렬 칩: 관심도순(개인화 점수) / 기대수익순
                const sorted = [...uniqCands].sort((a, b) => recSort === 'upside'
                  ? (deriveRecMeta(b).upside - deriveRecMeta(a).upside)
                  : (personalScore(b) - personalScore(a)));
                // [S7.2] 관심도 5신호 점등(MA·RSI·볼린저·거래량·수급) — 백엔드 s.signals 우선, 없으면 근사
                const sig5 = (s) => {
                  if (Array.isArray(s.signals) && s.signals.length >= 5) return s.signals.slice(0, 5).map(Boolean);
                  return [
                    s.change_5d != null ? s.change_5d >= 0 : null,               // MA(추세) 근사
                    s.rsi != null ? (s.rsi > 30 && s.rsi < 70) : null,           // RSI 중립대
                    s.bollinger != null ? !!s.bollinger : null,                  // 볼린저(있으면)
                    s.vol_ratio != null ? s.vol_ratio >= 1 : null,               // 거래량
                    s.supply != null ? !!s.supply : (s.net_buy != null ? s.net_buy >= 0 : null), // 수급
                  ];
                };
                const SIG_LBL = ['MA', 'RSI', '볼', '량', '수급'];
                // [S-4] 관심도 동점 시 2차 정렬 근거 한 줄(거래량→모멘텀→수급)
                const tieNote = (s) => {
                  const sc = Math.round(s.score ?? 0);
                  if (sorted.filter((x) => Math.round(x.score ?? 0) === sc).length < 2) return null;
                  if (s.vol_ratio != null && Number(s.vol_ratio) >= 1.2) return `동점 中 거래량 상위 (평소 ${Number(s.vol_ratio).toFixed(1)}배)`;
                  if (s.change_5d != null) return `동점 中 모멘텀 ${Number(s.change_5d) >= 0 ? '+' : ''}${Number(s.change_5d).toFixed(1)}%`;
                  if (s.net_buy != null || s.supply != null) return '동점 中 수급 우위';
                  return '동점 中 기술점수 상위';
                };
                const top3 = sorted.slice(0, 3);
                const rest = sorted.slice(3);
                // [R2/G10] 금·은·동 메달 제거 — 순위는 숫자(1·2·3)로 표시(과장·이모지 남발 완화)
                const openSheet = (s) => {
                  const sc = deriveScores(s); // 종목별 실제 신호로 서브점수 재계산(상수 표기 방지)
                  setBottomSheet({
                    name: s.name, code: s.code,
                    scores: { macro: sc.macro, ml: sc.ml, technical: sc.technical, risk: sc.risk },
                    final_score: sc.final, // 4개 지표 가중 평균(서브점수와 일관)
                    interest: Math.round(s.score ?? 0), // 백엔드 관심도(스크리닝 원점수) — 별도 표기
                    tie: tieNote(s), // [N8] 동점 2차 정렬 근거 — 카드에서 접고 여기서만 밝힌다
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
                    {/* [S7.2] 정렬 칩 */}
                    <div className="rec-sort">
                      {[['interest','관심도순'],['upside','기대수익순']].map(([k,l]) => (
                        <button key={k} className={`rec-sort-chip ${recSort===k?'on':''}`} onClick={() => setRecSort(k)}>{l}</button>
                      ))}
                    </div>
                    {/* [N4] 정렬 근거를 화면이 직접 말한다.
                        원 지적: "기대 7.3%가 4위" — 관심도순으로 정렬돼 있어서인데,
                        화면이 그 사실을 어디에도 밝히지 않아 순서가 틀린 것처럼 보였다. */}
                    {(() => {
                      const sortBasisNote = recSort === 'upside'
                        ? '기대수익순으로 정렬했습니다 — 관심도(기술점수)가 낮은 종목이 위에 올 수 있습니다.'
                        : '관심도순으로 정렬했습니다 — 기대수익이 더 높은 종목이 아래에 있을 수 있습니다.';
                      return <div className="rec-sort-basis">↳ {sortBasisNote}</div>;
                    })()}
                    {/* [S7.2] 샀어요 마이크로카피 — 채점 등록 안내 + 기록 탭 딥링크 */}
                    {/* [S-5] 나 vs AI 참여 유도 — 버튼과 동등 위계. 기록 0이면 첫 참여 온보딩. */}
                    {(() => { const _has = (getLedger(trader) || []).length > 0; return (
                      <div className={`vs-cta ${_has ? '' : 'first'}`}>
                        <div className="vs-cta-h">⚔ {_has ? '지금 판단을 남기면 3일 뒤 AI와 승부가 시작됩니다' : '아직 승부 기록이 없습니다'}</div>
                        <div className="vs-cta-sub">{_has ? '샀어요·관망을 누르면 3·7일 뒤 실제 수익으로 나 vs AI 자동 채점' : '첫 판단을 남기면 3일 뒤 AI와 결과를 비교해 드립니다'} <button className="rec-micro-link" onClick={() => setTab('report')}>기록 보기 →</button></div>
                      </div>
                    ); })()}
                    {/* [S-6] 추천 해제 종목 자동 관망 편입 알림 */}
                    {autoWatchNote.length > 0 && (
                      <div className="auto-watch-note">
                        <span>ℹ️ 추천에서 해제된 <b>{autoWatchNote.length}개</b>({autoWatchNote.slice(0, 2).map((a) => a.name).join(', ')}{autoWatchNote.length > 2 ? ' 외' : ''})를 판단 미기록으로 <b>‘관망’</b> 자동 편입했습니다.</span>
                        <button onClick={() => { setTab('report'); setAutoWatchNote([]); }}>결과 보기 →</button>
                      </div>
                    )}
                    {/* Top3 Hero 카드 — 관심도 + 스탠스 + 근거 1줄 + 기대 여력 인라인(원칙4) */}
                    <div className="top3-hero-row">
                      {top3.map((s, i) => {
                        const sc = Math.round(s.score ?? 0);
                        const m = deriveRecMeta(s);
                        return (
                          <div key={s.code || i} className="top3-hero-card" onClick={() => openSheet(s)}>
                            {/* [S-8] AI 판단 등급 — 카드 최상단·최대 위계 */}
                            <div className="ai-verdict-badge" style={{ color: m.verdict.color, background: m.verdict.bg, borderColor: m.verdict.color }}>{m.verdict.label}</div>
                            {/* [AI-5] 관심(추천)이면서 매수 차단이면 '최종 판단'을 우선 노출 — 보유 화면과 같은 말. */}
                            {isBlockedCode(s.code) && <div className="rec-final-block">⚠️ 최종: 매수 차단 · AI 매도신호</div>}
                            <div className="top3-medal">{i + 1}</div>
                            <button
                              className="top3-name"
                              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'var(--font-body)', textAlign: 'center' }}
                              onClick={(e) => { e.stopPropagation(); setTab('analyze'); runAnalyze(s.code, s.name); }}
                            >{s.name}</button>
                            {/* [S-8] 근거 한 줄 */}
                            <div className="top3-reason">{m.reason}</div>
                            {/* [S-4] 관심도·기대수익(소수1자리) + 동점 2차근거 */}
                            <div className="top3-ai-pct mono">관심도 {sc} · 기대 +{m.upside.toFixed(1)}%</div>
                            {/* [N8] 동점 2차근거는 카드에서 접는다 — '정렬 근거'이지 '판단 근거'가 아니라서
                                카드 위계를 뺏을 이유가 없다. 판단근거 시트 안으로 옮김(openSheet.tie). */}
                            <button className="top3-why-btn" onClick={(e) => { e.stopPropagation(); openSheet(s); }}>판단근거 ›</button>
                            {/* [S-8] 나 vs AI 예고 */}
                            <div className="vs-teaser">AI는 <b style={{ color: m.verdict.color }}>{m.verdict.short}</b> · 당신의 선택은?</div>
                            {/* [N8] 이 버튼은 주문을 넣지 않는다(실주문 연동 없음) — 라벨이 하는 일과 같아야 한다.
                                '매수하기'는 앱이 지킬 수 없는 약속이라 '주문 방법'으로 낮춘다. */}
                            <button className="buy-now-btn" onClick={(e) => { e.stopPropagation(); setBuyNotice({ name: s.name, code: s.code }); }}>주문 방법 →</button>
                            {(() => { const dec = (decTick, getTodayDecision(s.code, trader)); return (<>
                              <div className="dec-mini" onClick={(e) => e.stopPropagation()}>
                                <button className={`dec-b take ${dec === 'take' ? 'on' : ''}`} onClick={() => logTake(s.code, s.name)}>샀어요</button>
                                <button className={`dec-b pass ${dec === 'pass' ? 'on' : ''}`} onClick={() => logDecision(s.code, s.name, 'pass')}>관망</button>
                              </div>
                              {dec && <div className="dec-dday">🏁 승부 진행 중 · D-3</div>}
                            </>); })()}
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
                                    {isBlockedCode(s.code)
                                      ? <span className="rec-verdict-inline" style={{ color: 'var(--color-danger)', background: 'var(--color-danger-soft)' }}>⚠ 최종 차단</span>
                                      : <span className="rec-verdict-inline" style={{ color: m.verdict.color, background: m.verdict.bg }}>{m.verdict.short}</span>}
                                  </button>
                                  <div className="rec-reason">{isBlockedCode(s.code) ? <>관심도 상위이나 <b>AI 최종 매수 차단(매도신호)</b> — 보유 화면과 동일 판단입니다.</> : m.reason}</div>
                                  {/* [나 vs AI] 내 판단 기록 */}
                                  {(() => { const dec = (decTick, getTodayDecision(s.code, trader)); return (
                                    <div className="dec-mini">
                                      <button className={`dec-b take ${dec === 'take' ? 'on' : ''}`} onClick={() => logTake(s.code, s.name)}>샀어요</button>
                                      <button className={`dec-b pass ${dec === 'pass' ? 'on' : ''}`} onClick={() => logDecision(s.code, s.name, 'pass')}>관망</button>
                                    </div>
                                  ); })()}
                                </div>
                                <div className="rec-row-r">
                                  <span className="rec-interest mono">관심도 {sc}</span>
                                  <span className="rec-upside">기대 +{m.upside.toFixed(1)}%</span>
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
              {/* [FB-3 §3.6] 오늘 판단 확정 요약 — 맨 아래. 샀어요/관망은 이미 즉시 기록되므로
                  여기선 오늘 확정된 판단을 요약하고 3거래일 뒤 결과를 기대하게 한다(§4.4 나vsAI 연결). */}
              {(() => {
                const _rerender = decTick; // decTick 변경 시 재계산
                const all = getLedger(trader) || [];
                const DAY_MS = 86400000;
                const tkey = Math.floor(Date.now() / DAY_MS);
                const td = all.filter((e) => Math.floor((e.ts || 0) / DAY_MS) === tkey);
                const nTake = td.filter((e) => e.decision === 'take').length;
                const nPass = td.filter((e) => e.decision === 'pass').length;
                return (
                  <div className="rec-confirm">
                    <div className="rec-confirm-h">✅ 오늘 판단 확정</div>
                    {td.length > 0 ? (
                      <>
                        <p className="rec-confirm-t">
                          오늘 <b>{td.length}건</b> 판단이 확정됐어요 · 샀어요 {nTake} · 관망 {nPass}.
                          {' '}<b>3거래일 뒤</b> 실제 수익으로 나 vs AI가 채점합니다.
                        </p>
                        <button className="rec-confirm-cta" onClick={() => setTab('report')}>3일 뒤 승부 결과 기대하기 →</button>
                      </>
                    ) : (
                      <p className="rec-confirm-t quiet">
                        아직 오늘 판단이 없어요 — 위에서 <b>샀어요·관망</b>을 누르면 3일 뒤 AI와 승부가 시작됩니다.
                      </p>
                    )}
                  </div>
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
              {/* [사용자 지시] 계좌 현황 — 종합자산과 동일한 라이트 카드로 통일(onehub-stock 보유탭) */}
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
                  ? <div className="pwa-empty">아직 보유 종목이 없어요 — 추가하면 여기에 표시됩니다</div>
                  : (() => {
                    const _u = (q) => deriveUrgency(q);
                    const _sorted = holdSort === 'value' ? positions : [...positions].sort((a, b) => _u(a).rank - _u(b).rank);
                    const _actionCnt = positions.filter((q) => _u(q).rank <= 2).length;
                    return (<>
                      <div className="hold-summary">
                        <span>{_actionCnt > 0 ? <>오늘 조치가 필요한 종목 <b>{_actionCnt}개</b></> : '오늘은 조치할 종목이 없습니다'}</span>
                        <button className="hold-sort-btn" onClick={() => setHoldSort((s) => (s === 'urgency' ? 'value' : 'urgency'))}>{holdSort === 'urgency' ? '긴급도순' : '기본순'} ⇅</button>
                      </div>
                      <div className="position-cards">{_sorted.map((p, i) => { const u = _u(p); return (
                      <div key={p.code || i} className={`position-card u-${u.level}`} style={u.bar ? { borderLeft: `3px solid ${u.bar}` } : undefined}>
                        <div className="position-card-top">
                          <span className="position-card-name" title={p.name}>{p.name}</span>
                          <span className="hold-urg-badge" style={{ color: u.color, borderColor: u.color, opacity: u.level === 'normal' ? 0.55 : 1 }}>{u.badge}</span>
                          <span className={`position-card-badge mono ${p.pnl_rate>=0?'bull':'bear'}`}>
                            {p.pnl_rate>=0?'+':''}{p.pnl_rate}%
                          </span>
                        </div>
                        {/* [FB-8 이슈2] 조치 필요 종목: '지금 뭘 하라'를 카드 최상단에 명령형으로 */}
                        {u.rank <= 2 && (() => { const st = deriveStance(p); const doText = u.level === 'urgent' ? '손절가에 근접했어요 — 매도할지 지금 결정하세요.' : `${st.label} 시점이에요 — 오늘 한 번 확인하세요.`; return (
                          <div className="pos-todo" style={{ borderLeft: `3px solid ${u.color}` }}>
                            <span className="pos-todo-k" style={{ color: u.color }}>👉 지금 할 일</span>
                            <span className="pos-todo-v">{doText} <span className="pos-todo-hint">아래 <b>매도</b> · <b>AI 분석 보기</b>에서 실행</span></span>
                          </div>
                        ); })()}
                        <div className="position-card-grid mono">
                          <div className="position-card-cell">
                            <span className="dim">매수가</span>
                            {/* [S1] 국내주식 원 단위 정수 통일(정확 평단은 title 툴팁) */}
                            <span title={`정확 평단 ${Number(p.avg_price||0).toLocaleString()}원`}>{Math.round(Number(p.avg_price||0)).toLocaleString()}원</span>
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
                        {/* [S7.1] 종목별 다음 트리거 — 조건부 다음 행동 1줄(손절·익절 레벨) */}
                        {(() => {
                          const avg = Number(p.avg_price || 0), cur = Number(p.current_price || 0);
                          if (!(avg > 0)) return null;
                          const stop = safeNum(p.stop_loss) > 0 ? Number(p.stop_loss) : Math.round(avg * 0.92);
                          const tgt = safeNum(p.target) > 0 ? Number(p.target) : Math.round(avg * 1.15);
                          const toStop = cur > 0 ? ((stop / cur - 1) * 100) : null;
                          const parts = [];
                          parts.push(`손절 ${stop.toLocaleString()}${toStop != null ? ` (${toStop >= 0 ? '+' : ''}${toStop.toFixed(1)}%)` : ''}`);
                          parts.push(`목표 ${tgt.toLocaleString()} 도달 시 절반 익절 제안`);
                          return (
                            <div className="pos-trigger">⏭ <b>다음 트리거</b> · <span style={{ color: u.color, fontWeight: 700 }}>{u.badge}</span> · {parts.join(' · ')}
                              {!(safeNum(p.stop_loss) > 0 && safeNum(p.target) > 0) && <span className="pt-est">추정 레벨</span>}
                            </div>
                          );
                        })()}
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
                                        alert(d.ok ? `${p.name} 매도 주문을 자동매매 엔진에 전송했습니다.` : `매도 실패: ${d.error}`);
                                      } catch(e) { alert('매도 요청 중 오류: ' + e.message); }
                                      setSellLoading(prev => { const n = { ...prev }; delete n[posKey]; return n; });
                                    }}
                                  >
                                    {sellLoading[posKey] ? '처리 중...' : sellConfirm[posKey] ? '⚠ 실제 매도주문 실행' : '매도'}
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
                      </div>); })}
                    </div>
                    </>);
                  })()}
              </section>

              {/* [주식 직접입력] KIS 외 증권사 보유 — 빠른입력과 동일한 공용 StockForm */}
              <section className="pwa-card">
                <div className="mh-head">
                  <span className="pwa-card-label" style={{ margin: 0 }}>🧾 직접 입력 보유 <span className="mh-sub">KIS 외 증권사</span></span>
                  <button className="mh-add" onClick={() => setStFormOpen(o => !o)}>{stFormOpen ? '닫기' : '＋ 추가'}</button>
                </div>
                {stFormOpen && <div className="mh-form"><StockForm onSaved={() => { setStManualTick(t => t + 1); setStFormOpen(false); }} /></div>}
                {(() => {
                  const _tick = stManualTick; // 저장/삭제 후 재조회 트리거
                  const list = mounted ? getStockHoldings(trader) : [];
                  if (!list.length) return <div className="pwa-empty">미래에셋·삼성 등 KIS 외 증권사 보유를 <b>＋ 추가</b>로 입력하면 여기에 표시됩니다.</div>;
                  return (
                    <div className="mh-list">
                      {list.map((h) => {
                        const q = manualPx[h.id];
                        const cp = q?.price;                 // 현재가(해당 통화, 라이브)
                        const isUsd = h.ccy === 'USD';
                        const anomaly = cp && h.avgPrice && !isUsd && (h.avgPrice > cp * 10 || h.avgPrice < cp / 10);
                        const fmt = (v) => `${isUsd ? '$' : ''}${isUsd ? Number(v).toLocaleString() : Math.round(Number(v)).toLocaleString()}${isUsd ? '' : '원'}`;
                        const pnl = cp && Number(h.avgPrice) > 0 ? (cp / Number(h.avgPrice) - 1) * 100 : null;
                        const basisLabel = h.priceBasis === 'current' ? '현재가' : '평단';
                        return (
                        <div className={`mh-row ${anomaly ? 'mh-anomaly' : ''}`} key={h.id}>
                          <div className="mh-l">
                            <b className="mh-name">{h.name}{anomaly && <span className="mh-warn" title={`평단 ${Number(h.avgPrice).toLocaleString()}원이 현재가 ${Number(cp).toLocaleString()}원과 크게 차이납니다. 총매수금액을 평단에 넣었는지 확인 후 다시 입력하세요.`}>⚠ 데이터 확인 필요</span>}</b>
                            <span className="mh-meta">{h.broker} · {h.account} · {h.market === 'us' ? '🇺🇸 해외' : '🇰🇷 국내'}{q?.date ? ` · 시세 ${q.date.slice(5)}` : ''}</span>
                          </div>
                          {/* [라이브] 현재가(굵게) + 매수기준 대비 손익. 현재가 없으면 저장값 표시. 국내는 원 단위 정수. */}
                          <div className="mh-r" title={h.ccy === 'KRW' ? `정확 ${basisLabel} ${Number(h.avgPrice).toLocaleString()}원` : undefined}>
                            {h.shares}주 · 지금 {fmt(cp != null ? cp : h.avgPrice)}
                            <span style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: 'var(--color-ink-3)' }}>
                              {basisLabel} {fmt(h.avgPrice)}{pnl != null ? <em style={{ fontStyle: 'normal', marginLeft: 6, color: pnl >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>{pnl >= 0 ? '+' : ''}{pnl.toFixed(1)}%</em> : ''}
                            </span>
                          </div>
                          <button className="mh-del" onClick={() => { removeStock({ id: h.id, trader }); setStManualTick(t => t + 1); }} aria-label={`${h.name} 삭제`}>✕</button>
                        </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </section>

              <section className="pwa-card">
                <span className="pwa-card-label">🤖 AI 판단 — 매수 차단 종목</span>
                {(!data.today_blocked || data.today_blocked.length===0)
                  ? <div className="pwa-empty">오늘은 막은 종목이 없어요 — 좋은 신호예요</div>
                  : (<>
                    <div className="blocked-list">{dedupBy(data.today_blocked, (b) => b.code || b.stock).slice(0,5).map((b,i) => (
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

        {/* ── Report Tab = [S2 IA] 트러스트 허브 ── */}
        {tab === 'report' && (
          <main className="pwa-main">

            {/* [OS-2] 오늘·자산·이야기와 동일한 패턴 — "AI" 고정 + vs 나 대결/자기 검증/리포트 순환,
                분석변경 버튼은 항상 행 맨 오른쪽. ?sec= 딥링크로도 진입하므로 controlledIndex로 동기화. */}
            <div className="trust-nav">
              <RotatingPageTitle
                fixed="AI"
                mutedSuffix
                spaced
                buttonLabel="분석변경"
                items={[{ suffix: 'vs 나 대결' }, { suffix: '자기검증' }, { suffix: '리포트' }]}
                controlledIndex={TRUST_TABS.indexOf(trustSec)}
                onChange={(i) => setTrustSec(TRUST_TABS[i])}
              />
            </div>

            {/* [나 vs AI 대결] AI 추천 중 내가 산 것 vs AI 단독매매, 3일·7일 수익 승부 */}
            {trustSec === 'vs' && (<>
            {/* [G-시리즈] 가상 시드머니 대결 — 시드 미설정=온보딩(GI-2) / 설정=게임 대시보드(GI-6) */}
            {!gameSeed ? (
              <section className="pwa-card game-onb">
                <span className="pwa-card-label">⚔ AI와 가상 대결 시작</span>
                <div className="gonb-sub">같은 <b>가상 시드머니</b>로 출발해, 내 판단 지갑과 AI 지갑의 <b>잔고 차이</b>로 승부합니다. <b>실제 돈이 아닌 판단 연습용 가상 대결</b>입니다.</div>
                <div className="gonb-opts">
                  {SEED_OPTIONS.map((o) => (
                    <button key={o.v} className="gonb-opt" onClick={() => setSeed(o.v)}>{o.label}<span>가상</span></button>
                  ))}
                </div>
                <div className="gonb-foot">🎮 가상·모의 게임입니다 · 판단은 본인 책임이며 투자자문이 아닙니다.</div>
              </section>
            ) : (() => {
              const sd3 = computeShowdown(ledger, 3);
              const g = computeWallets(sd3, gameSeed); // [모바일 수정] 알고 있는 시드를 넘겨 재조회 null 로 대시보드가 비지 않게
              if (!g) return null;
              const pending = ledger.filter((e) => Date.now() - e.ts < 3 * 86400000);
              const narr = streakNarrative(g.settled);
              const pct = g.myBalance + g.aiBalance > 0 ? (g.myBalance / (g.myBalance + g.aiBalance)) * 100 : 50;
              return (
                <section className="pwa-card game-dash">
                  <div className="gd-top"><span className="pwa-card-label" style={{ margin: 0 }}>⚔ 나 vs AI · 가상 지갑 대결</span><span className="gd-virtual">가상·모의</span></div>
                  {narr && <div className="gd-narr">📖 {narr}</div>}
                  {/* [사용자 지시] "원" 삭제(잔고는 숫자만, 증감액만 wonG로 원 표기) + 좌우 대칭(둘 다
                      "이름/AI" 한 단어 + 잔고 + 증감) + "나"/"AI" 글자를 크게 */}
                  <div className="gd-wallets">
                    <div className="gd-w me">
                      <span className="gd-wl" onClick={editGameNickname} role="button" tabIndex={0} title="닉네임 바꾸기">{gameNick}<span className="gd-wl-ed">✎</span></span>
                      <b className="gd-wb">{wonNum(g.myBalance)}</b>
                      <span className={`gd-wg ${g.myGain > 0 ? 'up' : g.myGain < 0 ? 'dn' : ''}`}>{g.myGain > 0 ? '+' : ''}{wonG(g.myGain)}</span>
                    </div>
                    <div className="gd-vs">VS</div>
                    <div className="gd-w ai">
                      <span className="gd-wl">AI</span>
                      <b className="gd-wb">{wonNum(g.aiBalance)}</b>
                      <span className={`gd-wg ${g.aiGain > 0 ? 'up' : g.aiGain < 0 ? 'dn' : ''}`}>{g.aiGain > 0 ? '+' : ''}{wonG(g.aiGain)}</span>
                    </div>
                  </div>
                  <div className="gd-bar"><div className="gd-bar-me" style={{ width: `${Math.max(6, Math.min(94, pct))}%` }} /></div>
                  <div className="gd-lead">{g.leader === 'me' ? <b className="up">🏆 내가 {wonG(Math.abs(g.diff))} 앞섬</b> : g.leader === 'ai' ? <b className="dn">🤖 AI가 {wonG(Math.abs(g.diff))} 앞섬</b> : <b>⚖️ 접전</b>} · 매판 잔고의 {Math.round((g.betPct ?? 0.1) * 100)}%(복리, 가상)
                    <ShareButton compact title="ONE-HUB 나 vs AI 대결"
                      text={g.leader === 'me' ? `내가 AI보다 ${wonG(Math.abs(g.diff))} 앞서고 있어요! 나도 AI랑 대결해볼래?` : g.leader === 'ai' ? `AI한테 ${wonG(Math.abs(g.diff))} 지고 있어요 — 나도 AI랑 대결해볼래?` : "AI와 팽팽한 접전 중! 나도 대결해볼래?"}
                      url="https://one-hub-content.vercel.app/pwa/today" />
                  </div>
                  {(() => {
                    // [2026-08-03] 며칠차·몇종목 대결 + 일자별 누적 금액 추이 그래프.
                    //   x축=정산된 날짜, 시드(출발점)부터 판이 정산될 때마다 잔고가 누적된다.
                    const daysIn = g.settled.length ? Math.max(1, Math.floor((Date.now() - Math.min(...g.settled.map((s) => s.ts))) / 86400000) + 1) : 0;
                    const chron = [...g.settled].sort((a, b) => a.ts - b.ts);
                    let myCum = g.seed, aiCum = g.seed;
                    const start = new Date(chron.length ? chron[0].ts : Date.now());
                    const trend = [{ label: `${start.getMonth() + 1}/${start.getDate()} 시작`, [gameNick]: myCum, AI: aiCum, _ev: null }];
                    chron.forEach((s) => {
                      myCum += s.myPnl; aiCum += s.aiPnl;
                      const d = new Date(s.ts);
                      trend.push({ label: `${d.getMonth() + 1}/${d.getDate()}`, [gameNick]: myCum, AI: aiCum, _ev: s });
                    });
                    // [버그 수정] recharts v3부터 onClick 시그니처가 바뀌어 (nextState, reactEvent) 두 인자로
                    //   호출된다 — v2 방식의 e.activePayload는 더 이상 없다(항상 undefined라 클릭이 무반응
                    //   이었다). nextState.activeIndex(문자열 인덱스)로 trend 배열에서 직접 찾는다.
                    const onTrendClick = (nextState) => {
                      const i = nextState?.activeIndex != null ? Number(nextState.activeIndex) : NaN;
                      setTrendClick(Number.isFinite(i) ? (trend[i]?._ev || null) : null);
                    };
                    return (
                      <div className="gd-trend">
                        <div className="gd-trend-top">
                          <span className="gd-trend-days">{daysIn}일째 · {g.settled.length}종목 대결</span>
                          <span className="gd-trend-final">
                            최종 <b className={g.myGain >= 0 ? 'up' : 'dn'}>{gameNick} {wonG(g.myBalance)}</b>
                            {' · '}
                            <b className={g.aiGain >= 0 ? 'up' : 'dn'}>AI {wonG(g.aiBalance)}</b>
                          </span>
                        </div>
                        {trend.length > 1 && (
                          <>
                            <ResponsiveContainer width="100%" height={140}>
                              <LineChart data={trend} margin={{ top: 6, right: 8, left: 0, bottom: 0 }} onClick={onTrendClick}>
                                <XAxis dataKey="label" stroke="var(--color-ink-3)" fontSize={10} tickLine={false} />
                                <YAxis hide domain={['dataMin', 'dataMax']} />
                                <Line type="monotone" dataKey={gameNick} stroke="var(--color-success)" strokeWidth={2} dot={{ r: 2, cursor: 'pointer' }} activeDot={{ r: 5, cursor: 'pointer' }} />
                                <Line type="monotone" dataKey="AI" stroke="var(--purple)" strokeWidth={2} dot={{ r: 2, cursor: 'pointer' }} activeDot={{ r: 5, cursor: 'pointer' }} />
                              </LineChart>
                            </ResponsiveContainer>
                            <div className="gd-trend-hint">그래프의 점을 눌러보세요 — 그날 대결을 자세히 설명해 드립니다</div>
                          </>
                        )}
                        {/* [사용자 지시] 점 클릭 시 팝업 카드로 더 상세히 설명(베팅액·승자 포함) */}
                        {trendClick && (() => {
                          const diffWon = (trendClick.myPnl || 0) - (trendClick.aiPnl || 0);
                          return (
                            <div className="gd-trend-modal-bg" onClick={() => setTrendClick(null)}>
                              <div className="gd-trend-modal" onClick={(e) => e.stopPropagation()}>
                                <button type="button" className="gd-trend-modal-x" onClick={() => setTrendClick(null)} aria-label="닫기">✕</button>
                                <div className="gd-trend-modal-t">{trendClick.name}</div>
                                <div className="gd-trend-modal-ret">가격 {trendClick.ret >= 0 ? '+' : ''}{trendClick.ret}%</div>
                                <div className="gd-trend-modal-rows">
                                  <div className="gd-trend-modal-row">
                                    <span className="gd-trend-modal-who">🙋 {gameNick}</span>
                                    <span className="gd-trend-modal-mid">{trendClick.decision === 'take' ? '매수' : '관망'} · 베팅 {wonG(trendClick.myBetAmt)}</span>
                                    <b className={trendClick.myPnl >= 0 ? 'up' : 'dn'}>{trendClick.myPnl >= 0 ? '+' : ''}{wonG(trendClick.myPnl)}</b>
                                  </div>
                                  <div className="gd-trend-modal-row">
                                    <span className="gd-trend-modal-who">🤖 AI</span>
                                    <span className="gd-trend-modal-mid">{trendClick.aiBought !== false ? '매수' : '관망'} · 베팅 {wonG(trendClick.aiBetAmt)}</span>
                                    <b className={trendClick.aiPnl >= 0 ? 'up' : 'dn'}>{trendClick.aiPnl >= 0 ? '+' : ''}{wonG(trendClick.aiPnl)}</b>
                                  </div>
                                </div>
                                <div className="gd-trend-modal-diff">
                                  {trendClick.winner === 'me' ? '🏆 내가' : trendClick.winner === 'ai' ? '🤖 AI가' : '⚖️ 무승부 ·'} {trendClick.winner !== 'tie' && <>{wonG(Math.abs(diffWon))} 앞섬</>}
                                </div>
                                <div className="gd-trend-modal-note">베팅 기준(그 시점 각자 잔고)이 서로 달라 같은 가격 변동에도 손익 금액이 달라집니다.</div>
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    );
                  })()}
                  {pending.length > 0 && (
                    <div className="gd-pending">
                      <div className="gd-ph">⏳ 진행 중 대결 {pending.length}건 (3일 후 정산)</div>
                      {pending.slice(0, 4).map((e, i) => {
                        const dday = Math.max(0, 3 - Math.floor((Date.now() - e.ts) / 86400000));
                        return <div className="gd-prow" key={i}><span className="gd-pn">{e.name}</span><span className="gd-pj">나:{e.decision === 'take' ? '매수' : '관망'} · AI:{e.decision === 'take' ? '동일 베팅' : '매수'}</span><span className="gd-dday">D-{dday}</span></div>;
                      })}
                    </div>
                  )}
                  {g.settled.length > 0 && (
                    <div className="gd-recent">
                      <div className="gd-ph">🏁 최근 결과</div>
                      {g.settled.slice(0, 4).map((s, i) => (
                        <div className="gd-rrow" key={i}><span className="gd-rw">{s.winner === 'me' ? '🏆' : s.winner === 'ai' ? '💀' : '⚖️'}</span><span className="gd-pn">{s.name}</span><span className={`gd-rret ${s.ret >= 0 ? 'up' : 'dn'}`}>{s.ret >= 0 ? '+' : ''}{s.ret}%</span><span className="gd-rwin">{s.winner === 'me' ? '나 승' : s.winner === 'ai' ? 'AI 승' : '무'}</span></div>
                      ))}
                    </div>
                  )}
                  <div className="gd-foot">🎮 가상·모의 게임 · 실제 자산 아님 · 판단은 본인 책임(투자자문 아님) · <button className="gd-reset" onClick={() => { if (typeof window === 'undefined' || window.confirm('게임을 초기화할까요? (가상 지갑만 리셋, 판단 기록은 유지)')) resetSeed(); }}>시드 변경</button></div>
                </section>
              );
            })()}

            {/* [사용자 지시] 향후 전개 — 정산 대기 중인 판단들이 확정되면 판도가 어떻게 바뀔 수 있는지 나열 */}
            {gameSeed && (() => {
              const pending = ledger.filter((e) => Date.now() - e.ts < 3 * 86400000);
              if (!pending.length) return null;
              const g2 = computeWallets(computeShowdown(ledger, 3), gameSeed);
              if (!g2) return null;
              const myStake = Math.max(10000, Math.round(g2.myBalance * (g2.betPct ?? 0.1)));
              const aiStake = Math.max(10000, Math.round(g2.aiBalance * (g2.betPct ?? 0.1)));
              return (
                <section className="pwa-card upcoming-card">
                  <span className="pwa-card-label">🔮 앞으로의 대결 구도</span>
                  <p className="upcoming-desc">아래 {pending.length}건이 정산되면 잔고가 바뀌고, 다음 베팅액도 그 결과를 따라갑니다(복리) — 지금 기준 예상 영향:</p>
                  <div className="upcoming-list">
                    {pending.map((e, i) => {
                      const dday = Math.max(0, 3 - Math.floor((Date.now() - e.ts) / 86400000));
                      const myIn = e.decision === 'take';
                      return (
                        <div className="upcoming-row" key={i}>
                          <span className="upcoming-name">{e.name}</span>
                          <span className="upcoming-j">나:{myIn ? '매수' : '관망'} · AI:매수</span>
                          <span className="upcoming-impact">{myIn ? `나 ±${wonG(myStake)}` : `AI만 ±${wonG(aiStake)}`}</span>
                          <span className="upcoming-dday">D-{dday}</span>
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })()}

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
                        <span className="vs-name">🤖 AI 단독 <span className="vs-virtual">가상</span></span>
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
                    {/* [A-1] 소표본에선 승자 선언 대신 '학습 중'. 30건 이상일 때만 우세 배지. */}
                    {overall && samplePolicy(recorded).declareWinner && <span className="vs-overall" style={{ background: overall === 'me' ? 'var(--color-success-soft)' : overall === 'ai' ? 'var(--purple-soft, var(--color-primary-soft))' : 'var(--color-card-soft)', color: overall === 'me' ? 'var(--color-success-ink, var(--color-success))' : overall === 'ai' ? 'var(--purple)' : 'var(--color-ink-2)' }}>{overall === 'me' ? '🏆 내 판단 우세' : overall === 'ai' ? '🏆 AI 우세' : '⚖️ 접전'}</span>}
                    {overall && !samplePolicy(recorded).declareWinner && <span className="vs-overall" style={{ background: 'var(--color-warning-soft)', color: 'var(--color-warning-ink, var(--color-warning))' }}>🌱 학습 중</span>}
                  </div>
                  {/* [A-1] 스코어보드 — 첫 참여 전에도 '나 0 : 0 AI'로 게임 프레이밍. */}
                  <div className="vs-score">
                    <div className="vs-score-side"><span className="vs-score-who">🙋 나</span><span className="vs-score-num">{meWins}</span></div>
                    <span className="vs-score-colon">:</span>
                    <div className="vs-score-side"><span className="vs-score-num">{aiWins}</span><span className="vs-score-who">AI 🤖</span></div>
                  </div>
                  {/* [AI-7] 채점 완료/대기 명시 — 미채점을 승패로 세지 않음. 기록 N건 중 채점 완료 vs 대기. */}
                  <div className="vs-score-sub">채점 완료 <b>{w3.n || 0}</b>건 · 대기 <b>{Math.max(0, recorded - (w3.n || 0))}</b>건{recorded > 0 && !tally.length ? ' — 3일 경과 후 승부가 채점됩니다(미채점은 패로 세지 않습니다)' : ''}</div>
                  {/* [CI-1] 기록 성실도 — 게임의 기준은 수익률이 아니라 '판단 기록'. 침묵(자동관망)도 데이터. */}
                  {(() => { const manual = ledger.filter((e) => e.source !== 'auto_watch').length; return (
                    <div className="vs-integrity">📋 기록 <b>{recorded}건</b>{recorded > 0 ? <> · 직접 판단 <b>{manual}건</b>({Math.round(manual / recorded * 100)}%)</> : ''} · <span className="vs-integrity-note">순위는 수익률이 아니라 <b>판단 기록·성실도</b>로 매깁니다</span></div>
                  ); })()}
                  <div className="vs-def"><b>내가 산 것</b> vs <b>AI가 전부 매매했다고 가정한 가상 수익</b>을 3·7일로 비교합니다(AI는 가상 체결).</div>
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
                            <p className="vs-foot">✓ = 판단 적중(산 게 오르거나 · 지나친 게 내림) · ✗ = 틀림. AI 단독은 추천 전부를 매매했다고 가정합니다.</p>
                          </div>
                        );
                      })()}
                    </>
                  ) : (
                    <div className="vs-empty">
                      <div className="vs-empty-ic">⚔</div>
                      <div className="vs-empty-t">{recorded > 0 ? `판단 ${recorded}건 기록됨 · 성과 집계 중` : 'AI와의 첫 승부를 기다리고 있어요'}</div>
                      <div className="vs-empty-s">추천 탭에서 AI 매매 제안을 <b>승인(매매)</b> 또는 <b>거절(관망)</b>하면 판단이 기록되고, <b>3일·7일 뒤</b> 실제 수익으로 나 vs AI 승부가 자동 채점됩니다.</div>
                      <button className="vs-empty-btn" onClick={() => setTab('recommend')}>⚔ AI와 첫 승부 시작하기</button>
                    </div>
                  )}
                </section>
              );
            })()}

            {/* [FB-4 §4.1] 나 vs AI 일자별 — 판단을 남긴 날짜별로 누적 현황을 한눈에. ledger.ts 기준(KST). */}
            {ledger.length > 0 && (() => {
              const byDay = {};
              ledger.forEach((e) => {
                const key = new Date((e.ts || 0) + 9 * 3600000).toISOString().slice(0, 10);
                byDay[key] = byDay[key] || { take: 0, pass: 0 };
                if (e.decision === 'take') byDay[key].take++; else byDay[key].pass++;
              });
              const days = Object.entries(byDay).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 7);
              return (
                <section className="pwa-card vsday-card">
                  <span className="pwa-card-label">📅 나 vs AI · 일자별 판단</span>
                  <div className="vsday-list">
                    {days.map(([d, v]) => (
                      <div className="vsday-row" key={d}>
                        <span className="vsday-d">{d.slice(5)}</span>
                        <span className="vsday-cnt">판단 {v.take + v.pass}건</span>
                        <span className="vsday-tp">샀어요 {v.take} · 관망 {v.pass}</span>
                      </div>
                    ))}
                  </div>
                  <p className="vsday-foot">판단을 남긴 날짜별 기록입니다 · 각 판단은 3·7일 뒤 실제 수익으로 채점됩니다.</p>
                </section>
              );
            })()}

            {/* [A-6] AI vs 나 손익 비교 — 승률·총이익·총손실·순손익·손익비. AI는 가상 포지션(가정 명시). */}
            {(() => {
              const w7 = computeShowdown(ledger, 7);
              const w = w7.ready ? w7 : computeShowdown(ledger, 3);
              if (!w.ready || !(w.details?.length)) return null;
              const winDays = w7.ready ? 7 : 3;   // [항목1] 정산 창(거래일)
              const won = 10000; // 1건 100만원 → ret(%) × 10000 = 손익(원)
              const dts = w.details;
              // [항목1] 대결 기준일 — 오늘(정산일) + 판단일 범위. 언제 기준인지 명시.
              const _kstNow = new Date(Date.now() + 9*3600*1000);
              const _todayStr = _kstNow.toISOString().slice(0, 10);
              const _fmtMd = (ts) => { const d = new Date(ts + 9*3600*1000); return `${d.getUTCMonth()+1}/${d.getUTCDate()}`; };
              const _dsTs = dts.map(d => d.ts).filter(Boolean);
              const _dateRange = _dsTs.length
                ? (_fmtMd(Math.min(..._dsTs)) === _fmtMd(Math.max(..._dsTs))
                    ? _fmtMd(Math.max(..._dsTs))
                    : `${_fmtMd(Math.min(..._dsTs))}~${_fmtMd(Math.max(..._dsTs))}`)
                : null;
              const sum = (arr, f) => arr.reduce((a, x) => a + f(x), 0);
              const aiProfit = sum(dts.filter(d => d.ret > 0), d => d.ret * won); // AI=추천 전부 매수(항상 투자)
              const aiLoss = sum(dts.filter(d => d.ret < 0), d => -d.ret * won);
              const aiWins = dts.filter(d => d.ret > 0).length;
              const takes = dts.filter(d => d.decision === 'take');
              const myProfit = sum(takes.filter(d => d.ret > 0), d => d.ret * won);
              const myLoss = sum(takes.filter(d => d.ret < 0), d => -d.ret * won);
              const myWins = takes.filter(d => d.ret > 0).length;
              const passes = dts.filter(d => d.decision === 'pass');
              const avoidedLoss = sum(passes.filter(d => d.ret < 0), d => -d.ret * won);
              const missedGain = sum(passes.filter(d => d.ret > 0), d => d.ret * won);
              const plr = (p, l) => l > 0 ? (p / l).toFixed(2) : (p > 0 ? '∞' : '-');
              const won0 = (n) => `${n >= 0 ? '' : '-'}${Math.abs(Math.round(n)).toLocaleString()}원`;
              const pol = samplePolicy(dts.length);
              const aiNet = aiProfit - aiLoss, myNet = myProfit - myLoss;
              const col = (n) => n >= 0 ? 'var(--color-success)' : 'var(--color-danger)';
              return (
                <section className="pwa-card">
                  <span className="pwa-card-label">💰 AI vs 나 · 손익 비교</span>
                  <div className="pl-asof">🗓 {_todayStr} 정산 · {winDays}거래일 전 판단{_dateRange ? ` (${_dateRange})` : ''} 기준 · 대결 {dts.length}건</div>
                  <div style={{ margin: '2px 0 4px' }}><SampleSizeBadge count={dts.length} label={pol.tier === 'learning' ? '학습 중' : undefined} /></div>
                  <div className="pl-grid">
                    <div className="pl-cell"><span className="pl-k">🙋 내 순손익 (실제 보유)</span><span className="pl-v" style={{ color: col(myNet) }}>{won0(myNet)}</span></div>
                    <div className="pl-cell"><span className="pl-k">🤖 AI 순손익 (가상)</span><span className="pl-v" style={{ color: col(aiNet) }}>{won0(aiNet)}</span></div>
                    <div className="pl-cell"><span className="pl-k">내 승률 · 손익비</span><span className="pl-v">{takes.length ? `${Math.round(myWins/takes.length*100)}%` : '-'} · {plr(myProfit, myLoss)}</span></div>
                    <div className="pl-cell"><span className="pl-k">AI 승률 · 손익비</span><span className="pl-v">{Math.round(aiWins/dts.length*100)}% · {plr(aiProfit, aiLoss)}</span></div>
                    <div className="pl-cell"><span className="pl-k">관망으로 피한 손실</span><span className="pl-v" style={{ color: 'var(--color-success)' }}>{won0(avoidedLoss)}</span></div>
                    <div className="pl-cell"><span className="pl-k">관망으로 놓친 이익</span><span className="pl-v" style={{ color: 'var(--color-danger)' }}>{won0(missedGain)}</span></div>
                    {/* [A-5] 오류 4분류 — 거짓 매수율(샀는데 내림) vs 기회 상실률(관망했는데 오름)을 분리. */}
                    <div className="pl-cell"><span className="pl-k">거짓 매수율 <span style={{color:'var(--text-tertiary)'}}>(사서 손실)</span></span><span className="pl-v">{takes.length ? `${Math.round(takes.filter(d=>d.ret<0).length/takes.length*100)}%` : '-'}<span style={{fontSize:'0.6rem',color:'var(--text-tertiary)',fontWeight:600}}> {takes.filter(d=>d.ret<0).length}/{takes.length}</span></span></div>
                    <div className="pl-cell"><span className="pl-k">기회 상실률 <span style={{color:'var(--text-tertiary)'}}>(관망 중 상승)</span></span><span className="pl-v">{passes.length ? `${Math.round(passes.filter(d=>d.ret>0).length/passes.length*100)}%` : '-'}<span style={{fontSize:'0.6rem',color:'var(--text-tertiary)',fontWeight:600}}> {passes.filter(d=>d.ret>0).length}/{passes.length}</span></span></div>
                    {pol.declareWinner && (
                      <div className="pl-cell wide"><span className="pl-k">종합</span><span className="pl-v" style={{ color: myNet > aiNet ? 'var(--color-success)' : myNet < aiNet ? 'var(--purple)' : 'var(--color-ink-2)' }}>{myNet > aiNet ? '🏆 내 판단이 더 벌었습니다' : myNet < aiNet ? '🤖 AI 가상이 더 벌었습니다' : '⚖️ 접전'}</span></div>
                    )}
                  </div>
                  <p className="pl-foot">가정: 1건당 100만원 매수 · AI는 항상 투자, 나는 산 것만 — 실제 체결 아닌 가상.{!pol.declareWinner && <> 표본 {dts.length}건 — 30건부터 승자 선언.</>}</p>
                </section>
              );
            })()}

            </>)}

            {/* [S2.2 G2] AI 자기검증 — 판단 흐름 · 학습 현황 · 개선노트 */}
            {trustSec === 'verify' && (<>

            {/* [자기검증] 오늘의 AI 판단 + 전일 대비 변화 — 매일 무엇이 달라졌는지 한눈에 */}
            {aiDaily && (() => {
              const ACT_KO = { BUY: '매수', SELL: '매도', HOLD: '관망' };
              const chg = aiDaily.changes || [];
              const news = chg.filter(c => c.type === 'new');
              const acts = chg.filter(c => c.type === 'action');
              const gones = chg.filter(c => c.type === 'gone');
              const scores = chg.filter(c => c.type === 'score');
              // 실제 오늘(KST) vs ai_logs 최신 매수판단일 — 다르면 '요즘 관망'.
              const realToday = new Date(Date.now() + 9*3600*1000).toISOString().slice(0, 10);
              const analysisDate = aiDaily.today_date;
              const isStale = !analysisDate || analysisDate !== realToday;
              // 오늘의 실제 판단은 대시보드 data 에서(매수/차단). ai_logs 는 매수만 기록해 관망일엔 비어있다.
              const todayBuys = (data?.recommend_stocks ?? []).filter(s => (s.score ?? 0) >= 70).length;
              const todayBlocked = data?.market?.block_count ?? ((data?.today_blocked ?? data?.blocked_stocks ?? []).length || null);
              return (
                <div className="aid-card">
                  <div className="aid-head">
                    <span className="aid-date">🗓 {realToday} AI 자기검증</span>
                  </div>
                  <div className="aid-sum">
                    오늘 판단 — 매수 <b>{todayBuys}</b> · 차단 <b>{todayBlocked ?? '—'}</b>
                    {todayBuys === 0 ? <span className="aid-watch"> · 관망</span> : null}
                  </div>
                  {isStale ? (
                    <p className="aid-stale"><b>관망</b> 중{analysisDate ? <> — 최근 매수판단 <b>{analysisDate}</b></> : ''}.</p>
                  ) : (chg.length === 0 && (
                    <p className="aid-none">전일과 판단 동일 — 큰 변화 없음.</p>
                  ))}
                  {chg.length > 0 && (
                    <ul className="aid-list">
                      {news.map((c, i) => (
                        <li key={`n${i}`}><span className="aid-tag new">신규</span> {c.stock} → <b>{ACT_KO[c.to] || c.to}</b>{c.score != null ? ` (${c.score}점)` : ''}</li>
                      ))}
                      {acts.map((c, i) => (
                        <li key={`a${i}`}><span className="aid-tag act">전환</span> {c.stock}: {ACT_KO[c.from] || c.from} → <b>{ACT_KO[c.to] || c.to}</b></li>
                      ))}
                      {scores.map((c, i) => (
                        <li key={`s${i}`}><span className="aid-tag sc">점수</span> {c.stock}: {c.from} → <b>{c.to}점</b></li>
                      ))}
                      {gones.map((c, i) => (
                        <li key={`g${i}`}><span className="aid-tag gone">제외</span> {c.stock} (전일 {ACT_KO[c.from] || c.from})</li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })()}


            {/* [A-2] AI 개선노트 — 적중률보다 먼저. 틀린 것 → 고친 것 → 적용일 3단 서사(발전 스토리). */}
            {accuracy?.ok && accuracy.by_reason?.length > 0 && (() => {
              const reasons = accuracy.by_reason.filter(r => (r.total ?? 0) >= 2);
              const weak = reasons.filter(r => (r.accuracy_pct ?? 0) < 50).sort((a, b) => (a.accuracy_pct ?? 0) - (b.accuracy_pct ?? 0));
              const strong = reasons.filter(r => (r.accuracy_pct ?? 0) >= 65).sort((a, b) => (b.accuracy_pct ?? 0) - (a.accuracy_pct ?? 0));
              // 적용일 = 이번 주 월요일(KST, 재학습 주기). 효과추적 = 직전 대비 표본 증가.
              const kst = new Date(Date.now() + 9*60*60*1000);
              const monday = new Date(kst); monday.setUTCDate(kst.getUTCDate() - ((kst.getUTCDay()+6)%7));
              const applyDate = `${monday.getUTCFullYear()}-${String(monday.getUTCMonth()+1).padStart(2,'0')}-${String(monday.getUTCDate()).padStart(2,'0')}`;
              const items = [];
              weak.slice(0, 2).forEach(r => items.push({
                wrong: `${r.reason} 근거로 차단했으나 이후 상승 — 적중 ${r.accuracy_pct}% (${r.success}/${r.total}건)`,
                fix: `${r.reason} 신호 가중치 하향, 임계값 상향 조정`,
                effect: `표본 ${r.total}건 기준 재검증 중`,
              }));
              strong.slice(0, 1).forEach(r => items.push({
                wrong: `${r.reason} 신호는 검증에서 반복 적중`,
                fix: `${r.reason} 가중치 유지·강화`,
                effect: `적중 ${r.accuracy_pct}% (${r.success}/${r.total}건) — 신뢰 신호로 채택`,
              }));
              if (items.length === 0) items.push({ wrong: '아직 뚜렷하게 틀린 패턴이 잡히지 않음', fix: '가중치 변경 없이 관찰 유지', effect: '검증 데이터 축적 중' });
              const total = accuracy.summary?.total_checked ?? 0;
              // [A-5] 표본 50건 미만이면 자동 규칙조정 금지 — '조정했다'가 아니라 '관찰·검토 중'으로 표기.
              const mlOn = canAutoML(total);
              return (
                <section className="pwa-card">
                  <span className="pwa-card-label">📝 AI 개선노트 · 무엇을 틀렸고 어떻게 고쳤나</span>
                  <p className="chlog-intro">누적 검증 <b>{total}건</b>{mlOn
                    ? <> — 개선 방향을 봅니다(정확도 아님).</>
                    : <> — <b>{ML_MIN_SAMPLE}건 미만</b>이라 자동조정 보류, 아래는 관찰 후보.</>}</p>
                  <div className="imp-list">
                    {items.map((it, i) => (
                      <div className="imp-row" key={i}>
                        <div className="imp-step"><span className="imp-tag wrong">틀린 것</span><span className="imp-txt">{it.wrong}</span></div>
                        <div className="imp-step"><span className="imp-tag fix">{mlOn ? '고친 것' : '고칠 후보'}</span><span className="imp-txt">{it.fix}</span></div>
                        <div className="imp-step"><span className="imp-tag eff">효과 추적</span><span className="imp-txt">{it.effect}</span></div>
                      </div>
                    ))}
                  </div>
                  <p className="chlog-foot">※ {mlOn ? <>적용일 {applyDate}(매주 월 재학습). 규칙·가중치 변경을 사람 언어로 요약한 것입니다.</> : <>표본 {ML_MIN_SAMPLE}건 이상 쌓이고 백테스트를 통과해야 실제 규칙에 반영합니다. 현재는 후보만 표시합니다.</>}</p>
                  {/* [사용자 지시] 개선노트가 실제 정확도 개선으로 이어지는지 — 직전 주 대비 변화.
                      백엔드에 히스토리가 없어 앱을 열 때마다 로컬에 주차별로 적립(lib/aiAccuracyHistory). */}
                  {(() => {
                    const hist = getAccuracyHistory();
                    if (hist.length < 2) return <p className="chlog-trend muted">📈 다음 주부터 개선노트 반영 전후 적중률 변화를 여기서 보여드립니다.</p>;
                    const latest = hist[hist.length - 1];
                    const prev = hist[hist.length - 2];
                    const delta = Math.round((latest.accuracyPct - prev.accuracyPct) * 10) / 10;
                    return (
                      <p className="chlog-trend">
                        📈 {prev.date} 주 대비 적중률 <b className={delta >= 0 ? 'up' : 'dn'}>{delta >= 0 ? '+' : ''}{delta}%p</b> {delta > 0 ? '개선' : delta < 0 ? '하락' : '변화 없음'} — 위 개선노트가 반영된 결과입니다.
                      </p>
                    );
                  })()}
                </section>
              );
            })()}

            {/* [기록] AI 학습 현황 — ML 자기검증: 누적 기록 + 사유별 학습 정확도 + 최근 검증 결과(기록 누적·발전 스토리) */}
            {accuracy?.ok && (() => {
              const s = accuracy.summary || {};
              const pct = s.accuracy_pct;
              const checked = s.total_checked ?? 0;
              const ready = pct != null && checked >= 5;
              // [A-2] 소표본 정책 — 30건 미만이면 판정색(빨강/초록) 금지·중립색. 숫자는 그대로 노출.
              const pol = samplePolicy(checked);
              const rawPctColor = pct == null ? 'var(--text-secondary)'
                : pct >= 70 ? 'var(--color-success)' : pct >= 50 ? 'var(--color-warning)' : 'var(--color-danger)';
              const pctColor = pol.showVerdictColor ? rawPctColor : 'var(--color-ink-2)';
              const rColor = (p) => pol.showVerdictColor ? ((p ?? 0) >= 70 ? 'var(--color-success)' : (p ?? 0) >= 50 ? 'var(--color-warning)' : 'var(--color-danger)') : 'var(--color-ink-2)';
              // [N7] 소표본 게이트 — 5건 미만은 '행 자체를 숨긴다'. total>0 이면 통과시켜 정확도순으로
              //   정렬하던 탓에 '100% (1/1건)'이 1위로 올라왔고, 같은 화면의 '표본 24건 — 단정하기 이릅니다'
              //   경고와 정면으로 모순됐다(브랜드 자해). 5~29건은 '(참고)'로 표시.
              const MIN_SHOW = 5;
              const allReasons = (accuracy.by_reason || []).filter(r => (r.total ?? 0) > 0);
              const topReasons = allReasons.filter(r => (r.total ?? 0) >= MIN_SHOW)
                .sort((a, b) => (b.accuracy_pct ?? 0) - (a.accuracy_pct ?? 0)).slice(0, 3);
              const hiddenReasons = allReasons.length - allReasons.filter(r => (r.total ?? 0) >= MIN_SHOW).length;
              const recent = (accuracy.recent || []).slice(0, 3);
              return (
                <section className="pwa-card">
                  <span className="pwa-card-label">🧠 AI 학습 현황 · ML 자기검증</span>
                  {/* [A-2] 학습 상태를 적중률보다 먼저·크게. 소표본이면 '학습 중'으로 프레이밍. */}
                  <div style={{ margin: '2px 0 12px' }}>
                    <SampleSizeBadge count={checked} size="lg" showGauge label={pol.tier === 'learning' ? '학습 중' : undefined} />
                    <p style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', lineHeight: 1.5, margin: '8px 0 0' }}>{pol.note}</p>
                  </div>
                  <div className="ml-accum">
                    <div className="ml-accum-item"><b>{s.total_blocked ?? 0}</b><span>누적 판단 기록</span></div>
                    <div className="ml-accum-item"><b>{checked}</b><span>검증 완료</span></div>
                    <div className="ml-accum-item"><b style={{ color: pctColor }}>{pct != null ? `${pct}%` : '—'}</b><span>적중률{!pol.showVerdictColor && pct != null ? ' (참고)' : ''}</span></div>
                  </div>
                  {ready ? (
                    <>
                      <div className="ml-bar"><div style={{ width: `${pct}%`, background: pctColor }} /></div>
                      <p className="ml-desc">매주 실제 결과와 대조해 자기채점 · 누적 <b>{s.total_blocked ?? 0}건</b>으로 판단 로직 보정.</p>
                      {/* [사용자 지시] 시점별로 어떻게 개선되는지 — 백엔드 히스토리가 없어 앱을 열 때마다
                          로컬에 주차별로 적립한 값(lib/aiAccuracyHistory)을 표시. 최소 2주치부터 노출. */}
                      {(() => {
                        const hist = getAccuracyHistory();
                        if (hist.length < 2) return (
                          <p className="ml-hist-empty">📅 이번 주부터 적중률을 주차별로 기록합니다 — 다음 주부터 여기서 추이를 볼 수 있어요.</p>
                        );
                        return (
                          <div className="ml-hist">
                            <div className="ml-reasons-h">시점별 적중률 추이</div>
                            <div className="ml-hist-row">
                              {hist.map((h, i) => {
                                const prevH = hist[i - 1];
                                const d = prevH ? Math.round((h.accuracyPct - prevH.accuracyPct) * 10) / 10 : null;
                                return (
                                  <div className="ml-hist-item" key={h.date}>
                                    <span className="ml-hist-date">{h.date.slice(5)}</span>
                                    <b>{h.accuracyPct}%</b>
                                    {d != null && d !== 0 && <span className={d > 0 ? 'up' : 'dn'}>{d > 0 ? '▲' : '▼'}{Math.abs(d)}</span>}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })()}
                      {(topReasons.length > 0 || hiddenReasons > 0) && (
                        <div className="ml-reasons">
                          {/* [N7] 신뢰를 유도하는 수식어를 제목에서 제거 — 사실만 적는다. */}
                          <div className="ml-reasons-h">근거별 정확도 <span className="ml-reasons-note">표본 {MIN_SHOW}건 이상만 표시</span></div>
                          {topReasons.map((r, i) => {
                            const ref = (r.total ?? 0) < 30; // 30건 미만은 참고 수준
                            return (
                              <div className="ml-reason" key={i}>
                                <span className="ml-reason-t">{r.reason || '(미분류)'}</span>
                                <span className="ml-reason-v" style={{ color: ref ? 'var(--text-secondary)' : rColor(r.accuracy_pct) }}>
                                  {r.accuracy_pct ?? 0}%{ref && <em className="ml-ref">(참고)</em>}<em>{r.success}/{r.total}건</em>
                                </span>
                              </div>
                            );
                          })}
                          {hiddenReasons > 0 && (
                            <div className="ml-reason-hidden">표본 {MIN_SHOW}건 미만 · {hiddenReasons}개 신호는 아직 표시하지 않습니다</div>
                          )}
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
                                  <span className="ml-rec-badge" style={{ color: neu ? 'var(--text-secondary)' : ok ? 'var(--color-success)' : 'var(--color-danger)' }}>{neu ? '― 보류' : ok ? '✓ 적중' : '✗ 틀림'}</span>
                                </div>
                              </div>
                            );
                          })}
                          <p className="ml-foot">적중=차단 후 하락 · 틀림=차단 후 상승 · 보류=보합. 차단 3거래일 후 실제가로 자동 검증.</p>
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="ml-desc">기록 모으는 중 — 누적 <b>{s.total_blocked ?? 0}건</b>, 검증 <b>5건</b>부터 정확도 표시.</p>
                  )}
                  <button className="ml-more" onClick={() => router.push('/pwa/accuracy?from=verify')}>전체 자기검증 내역 · 사유별 적중 보기 →</button>
                </section>
              );
            })()}

            {/* [v9.0][사용자 지시] 오늘 AI 분석 흐름 — 다른 카드와 동일한 라이트 카드로 통일 + 맨
                아래로 이동(참고용, 판단 근거의 핵심은 위 개선노트·학습현황) */}
            {data && (() => {
              const regime = data.market?.regime ?? '-';
              const heat   = data.market?.heat_score ?? '-';
              const fearGreed = data.market?.fear_greed ?? '-';
              const candidates = data.screening_candidates ?? [];
              // [AI-6] 차단 건수는 전 화면 공통 소스(blockCount=data.market.block_count)로 단일화.
              //   기존엔 blocked_stocks 슬라이스 length라 오늘/종합/보유(=4)와 어긋나 자기검증만 0/3으로 표시됐다.
              const blockedNames = (data.today_blocked ?? data.blocked_stocks ?? []);
              const blocked = dedupBy(blockedNames, (b) => b.code || b.stock || b.name).slice(0, 3);
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
                ...(blockCount > 0 ? [{
                  icon: '🤖', time: '08:52',
                  title: 'AI 심층 분석',
                  desc: (blocked.length > 0 ? blocked.map(b => `${b.name ?? b.stock ?? b.code} → 차단`).join(' · ') + (blockCount > blocked.length ? ` 외 ${blockCount - blocked.length}건` : '') : `${blockCount}종목 차단`) + (buys.length > 0 ? ' / ' + buys.map(b => `${b.name ?? b.code} → 추천`).join(' · ') : ''),
                }] : []),
                {
                  icon: '✅', time: '08:53',
                  title: '최종 결정',
                  desc: `매수 ${buyCount}건 / 차단 ${blockCount}건 — ${regime === 'BEAR' ? '관망 결정' : '선별 실행'}`,
                },
              ];
              return (
                <section className="pwa-card">
                  <span className="pwa-card-label">🎬 오늘 AI 분석 흐름 <span className="flow-ref">참고용</span></span>
                  <div style={{ marginTop: 12, position: 'relative', paddingLeft: 20 }}>
                    {/* 타임라인 선 */}
                    <div style={{ position: 'absolute', left: 7, top: 8, bottom: 8, width: 2, background: 'var(--color-line)', borderRadius: 1 }} />
                    {steps.map((s, i) => (
                      <div key={i} style={{ position: 'relative', marginBottom: i < steps.length - 1 ? 18 : 0 }}>
                        {/* 점 */}
                        <div style={{ position: 'absolute', left: -16, top: 4, width: 8, height: 8, borderRadius: '50%', background: 'var(--color-primary)', border: '2px solid var(--color-card)' }} />
                        <div style={{ fontSize: '0.68rem', color: 'var(--color-ink-3)', fontFamily: 'var(--font-mono)', marginBottom: 2 }}>{s.time} KST</div>
                        <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--color-ink)', marginBottom: 2 }}>
                          {s.icon} {s.title}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--color-ink-2)', lineHeight: 1.4 }}>{s.desc}</div>
                      </div>
                    ))}
                  </div>
                </section>
              );
            })()}

            </>)}

            {/* [S2.2 G3] 리포트 아카이브 — 성적표 · 일간/주간/히스토리 */}
            {trustSec === 'archive' && (<>

            {/* [사용자 지시] "오늘 요약"을 탭 맨 위로 이동 */}
            {data && (
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
            )}

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
                // [A-3] 소표본 정책 — 표본(거래 건수) 30 미만이면 판정색 금지, MDD·손익비 극단값 접기.
                const nTrade = perf.total ?? ((perf.wins ?? 0) + (perf.losses ?? 0));
                const pol = samplePolicy(nTrade);
                const cv = pol.showVerdictColor; // 판정색 허용 여부
                const winColor = !cv ? 'var(--color-ink-2)' : (perf.win_rate ?? 0) >= 60 ? 'var(--color-success)' : (perf.win_rate ?? 0) >= 45 ? 'var(--color-warning)' : 'var(--color-danger)';
                const aPol = samplePolicy(accChecked ?? 0);
                const accColor = accPct == null ? 'var(--text-secondary)' : !aPol.showVerdictColor ? 'var(--color-ink-2)' : accPct >= 60 ? 'var(--color-success)' : accPct >= 45 ? 'var(--color-warning)' : 'var(--color-danger)';
                const rr = perf.rr_ratio;
                const rrColor = !cv ? 'var(--color-ink-2)' : rr == null ? 'var(--text-secondary)' : rr >= 1.5 ? 'var(--color-success)' : rr >= 1 ? 'var(--color-warning)' : 'var(--color-danger)';
                // 극단값(손익비·MDD)은 학습 중이면 값을 접고 '표본 N건'으로 대체 — 단일 이상치 왜곡 방지.
                // [S18 C-1] 잠긴 지표의 숫자 자리에 분수를 넣지 않는다.
                //   기존 `${nTrade}/30` 은 손익비 자리에 박혀 "손익비 0.03"으로 읽혔다.
                //   0.03은 파산 직전 수치다 — 잠긴 것뿐인데 최악의 오해를 만든다.
                //   숫자 자리는 🔒, 진행도는 캡션으로만.
                const rrTile = pol.collapseExtremes ? { k: '손익비', v: '🔒', sub: `표본 ${nTrade}/30 — 30건부터 공개`, c: 'var(--color-ink-3)' }
                  : { k: '손익비', v: rr != null ? `${rr}` : '–', sub: '이익/손실', c: rrColor };
                const mddTile = pol.collapseExtremes ? { k: '최대 낙폭', v: '🔒', sub: `표본 ${nTrade}/30 — 30건부터 공개`, c: 'var(--color-ink-3)' }
                  : { k: '최대 낙폭', v: perf.mdd != null ? `-${perf.mdd}%` : '–', sub: '고점 대비', c: 'var(--color-danger)' };
                // [S18 C-3] 적중률은 표본 50건까지 잠근다(삭제가 아니라 잠금 — 50건 도달 시 자동 공개).
                //   근거: 자기검증 탭이 "50건 미만이라 자동 규칙조정 보류(과적합 방지)"라고 이미 선언한다.
                //   규칙조정은 50건에서 보류하면서 성적표는 24건에 공개하는 건 자기모순이다.
                //   ★ 미채점 건을 패로 세지 않는다 — 채점된 승부가 없으면 승률도 잠근다.
                const accLocked = accChecked != null && accChecked < 50;
                const noScored = !pol.declareWinner && !(perf.wins > 0 || perf.losses > 0);
                const tiles = [
                  noScored
                    ? { k: '나 vs AI', v: '🔒', sub: '아직 채점된 승부가 없습니다', c: 'var(--color-ink-3)' }
                    : { k: '나 vs AI', v: pol.declareWinner ? (perf.win_rate != null ? `${perf.win_rate}%` : '–') : `${perf.wins ?? 0}승 ${perf.losses ?? 0}패`, sub: pol.declareWinner ? `${perf.wins ?? 0}승 ${perf.losses ?? 0}패` : '아직 판단 이르다', c: pol.declareWinner ? winColor : 'var(--color-ink-3)' },
                  accLocked
                    ? { k: '차단 적중률', v: '🔒', sub: `표본 50건부터 공개 (현재 ${accChecked}건)`, c: 'var(--color-ink-3)' }
                    : { k: '차단 적중률', v: accPct != null ? `${accPct}%` : '–', sub: accChecked != null ? `검증 ${accChecked}건` : '데이터를 불러오지 못했습니다', c: accColor },
                  rrTile,
                  mddTile,
                ];
                return (
                  <>
                    <div style={{ marginBottom: 10 }}><SampleSizeBadge count={nTrade} showGauge label={pol.tier === 'learning' ? '학습 중' : undefined} /></div>
                    <div className="scorecard">
                      {tiles.map((t) => (
                        <div className="sc-tile" key={t.k}>
                          <span className="sc-k">{t.k}</span>
                          <span className="sc-v" style={{ color: t.c }}>{t.v}</span>
                          <span className="sc-sub">{t.sub}</span>
                        </div>
                      ))}
                    </div>
                    {pol.collapseExtremes && (
                      <p className="sc-warn">⚠ 거래 {nTrade}건 — <b>손익비·MDD는 이상치에 민감</b>. 30건부터 정식 통계.</p>
                    )}
                    <div className="sc-summary">
                      이번 주 수익률 <b style={{ color: (perf.avg_pnl_pct ?? 0) >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>{(perf.avg_pnl_pct ?? 0) >= 0 ? '+' : ''}{perf.avg_pnl_pct ?? 0}%</b> · AI는 <b>{perf.wins ?? 0}종목 매수</b>, <b>{perf.losses ?? 0}건 손절</b>했습니다.
                    </div>
                  </>
                );
              })()}
            </section>

            {latestReport && latestReport.insight && (() => {
              // [A-3] '오늘의'는 실제로 오늘(KST) 생성분일 때만. 아니면 '최근 리포트 (N일 전)' + 경과일 명시.
              const kst = new Date(Date.now() + 9*60*60*1000);
              const todayStr = `${kst.getUTCFullYear()}-${String(kst.getUTCMonth()+1).padStart(2,'0')}-${String(kst.getUTCDate()).padStart(2,'0')}`;
              const rd = String(latestReport.date || '');
              // 리포트 날짜를 YYYY-MM-DD로 정규화(MM-DD만 오면 올해로 보정).
              const rdFull = /^\d{4}-\d{2}-\d{2}$/.test(rd) ? rd : (/^\d{2}-\d{2}$/.test(rd) ? `${kst.getUTCFullYear()}-${rd}` : rd);
              let daysAgo = null;
              if (/^\d{4}-\d{2}-\d{2}$/.test(rdFull)) {
                const a = Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate());
                const [y,m,d] = rdFull.split('-').map(Number);
                daysAgo = Math.round((a - Date.UTC(y, m-1, d)) / 86400000);
              }
              const isToday = rdFull === todayStr;
              const label = isToday ? '📅 오늘의 리포트' : `🗂 최근 리포트${daysAgo != null && daysAgo > 0 ? ` · ${daysAgo}일 전` : ''}`;
              return (
              <section className="pwa-card">
                <span className="pwa-card-label">{label} — {rdFull}</span>
                {!isToday && daysAgo != null && daysAgo >= 1 && (
                  <p className="sc-warn" style={{marginTop:6}}>오늘 리포트는 장 마감 후 나옵니다. 지금 보는 건 <b>{daysAgo}일 전</b> 리포트예요.</p>
                )}
                <p className="pwa-analyze-text" style={{marginTop:8}}>{latestReport.insight}</p>
                <p className="dim mono" style={{fontSize:'0.7rem', marginTop:8}}>
                  생성 {rdFull} · {latestReport.regime} · 매매 {latestReport.trade_count}건 · 차단 {latestReport.block_count}건
                </p>
              </section>
              );
            })()}
            {perf && (
              <section className="pwa-card">
                <span className="pwa-card-label">📊 AI 성적표 · 최근 30일</span>
                {perf.total < 5 ? (
                  <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--text-secondary)' }}>
                    <div style={{ fontSize: '1.5rem', marginBottom: 6 }}>📊</div>
                    <div style={{ fontSize: '0.85rem' }}>5건째부터 공개합니다</div>
                    <div style={{ fontSize: '0.75rem', marginTop: 4, color: 'var(--text-muted)' }}>
                      {perf.total}/5건 · 첫 승부를 시작하면 빨라져요
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
                  ['/pwa/daily?from=archive', '📅', '일간 리포트', '매일 장 마감 요약'],
                  ['/pwa/weekly?from=archive', '📊', '주간 리포트', '국면 · 과열도 · 매매'],
                  ['/pwa/history?from=archive', '🤖', 'AI 히스토리', 'AI 판단 기록 전체'],
                  ['/pwa/accuracy?from=archive', '🎯', 'AI 차단 정확도', '차단 신호 적중률 · 사유별 분석'],
                  ['/pwa/heat-history?from=archive', '🌡️', '히트 히스토리', '시장 과열도 추이'],
                ].map(([href, icon, title, desc]) => (
                  <Link href={href} key={href} className="report-row">
                    <span className="report-row-icon">{icon}</span>
                    <span className="report-row-text"><b>{title}</b><span>{desc}</span></span>
                    <span className="report-row-arrow">›</span>
                  </Link>
                ))}
              </div>
            </section>
            {/* [A-3] 중복 제거 — 'AI 차단 정확도'는 위 성적표 타일 + 상세 리포트 목록으로 일원화. */}

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

        {/* [S-5] 판단 기록 직후 즉시 피드백 — 결과 확인일 명시 + 나 vs AI 링크 */}
        {decFeedback && (
          <div className="dec-feedback" onClick={() => { setTab('report'); setDecFeedback(null); }}>
            {gameSeed ? (
              <span>⚔️ <b>대결 성립!</b> {decFeedback.name} · {decFeedback.decision === 'take' ? '나 매수' : '나 관망'} vs AI · 가상 <b>{wonG(Math.round(gameSeed * 0.1))}</b> 걸림 · <b>{decFeedback.date}</b> 정산</span>
            ) : (
              <span>✅ 기록 완료 · <b>{decFeedback.name}</b> {decFeedback.decision === 'take' ? '샀다고 기록' : '관망으로 기록'}. <b>{decFeedback.date}</b>에 결과를 알려드릴게요</span>
            )}
            <span className="df-link">{gameSeed ? '지갑 대결 →' : '나 vs AI →'}</span>
          </div>
        )}

        {/* [S-6] 바로 매수 핸드오프 — 실주문은 증권사, 체결 후 '샀어요' 자동 기록 경로 */}
        {buyNotice && (
          <div onClick={() => setBuyNotice(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
            <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 360, background: 'var(--color-card)', color: 'var(--color-text)', borderRadius: 16, padding: 18, boxShadow: '0 12px 40px rgba(0,0,0,.3)' }}>
              <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 8 }}>주문 방법 · {buyNotice.name} <span style={{ color: 'var(--color-ink-3)', fontWeight: 500 }}>({buyNotice.code})</span></div>
              <div style={{ fontSize: 13, color: 'var(--color-ink-2)', lineHeight: 1.55, wordBreak: 'keep-all' }}>실주문 자동연동은 준비 중입니다. <b>증권사 앱에서 매수 주문</b>을 완료하신 뒤 아래 <b>‘샀어요로 기록’</b>을 누르면 <b>나 vs AI</b> 채점에 반영됩니다.</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                <button onClick={() => { logDecision(buyNotice.code, buyNotice.name, 'take'); setBuyNotice(null); }} style={{ flex: 1, border: 'none', borderRadius: 10, padding: '11px 0', fontWeight: 800, background: 'var(--color-primary)', color: '#fff', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>샀어요로 기록</button>
                <button onClick={() => setBuyNotice(null)} style={{ flex: '0 0 auto', border: '1px solid var(--color-line)', borderRadius: 10, padding: '11px 16px', fontWeight: 700, background: 'var(--color-card)', color: 'var(--color-ink-2)', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>닫기</button>
              </div>
            </div>
          </div>
        )}

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
                {/* [S-7] 종목명 밑 회사 소개(기업개요) 1~2줄 — 중복 설명 방지 위해 여기 1곳만 */}
                {companyInfo[bottomSheet.code] ? (
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: 3, lineHeight: 1.45, maxWidth: 280, wordBreak: 'keep-all', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>🏢 {companyInfo[bottomSheet.code]}</div>
                ) : companyInfo[bottomSheet.code] === undefined ? (
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-tertiary)', marginTop: 3 }}>🏢 회사 소개 불러오는 중…</div>
                ) : bottomSheet.priceMeta?.info ? (
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: 3, lineHeight: 1.4, maxWidth: 260, wordBreak: 'keep-all' }}>🏢 {bottomSheet.priceMeta.info}</div>
                ) : null}
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
                  {/* [목표가 기간] 백엔드 horizon 우선, 없으면 상승여력 크기로 도달 예상기간 추정 */}
                  {(() => {
                    const estFromUpside = upside == null ? null : upside < 8 ? '약 2~4주' : upside <= 15 ? '약 1~3개월' : '약 3~6개월';
                    const label = pm.horizonDays ? `약 ${pm.horizonDays}일` : estFromUpside;
                    if (!label) return null;
                    return (
                      <div style={{ marginTop: 9, fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                        ⏳ 목표가 도달 예상 기간 <b style={{ color: 'var(--text-primary)' }}>{label}</b>
                        <span style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--text-tertiary)', border: '1px solid var(--border)', borderRadius: 4, padding: '0 4px', marginLeft: 5 }}>{pm.horizonDays ? 'AI' : '추정'}</span>
                      </div>
                    );
                  })()}
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

            {/* [N8] 정렬 근거(동점 2차) — 판단 근거와 섞지 않고 별도 라벨로 밝힌다 */}
            {bottomSheet.tie && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6 }}>정렬 근거</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-primary)', lineHeight: 1.5, wordBreak: 'keep-all' }}>{bottomSheet.tie} — 관심도가 같을 때 이 기준으로 순서를 정했습니다.</div>
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
                    <button className={`dec-b take ${dec === 'take' ? 'on' : ''}`} onClick={() => logDecision(bottomSheet.code, bottomSheet.name, 'take', hint)}>샀다고 기록</button>
                    <button className={`dec-b pass ${dec === 'pass' ? 'on' : ''}`} onClick={() => logDecision(bottomSheet.code, bottomSheet.name, 'pass', hint)}>관망으로 기록</button>
                  </div>
                </div>
              );
            })()}
          </div>
        </>)}

        {/* [S3] 빠른입력 — 공용 QuickAddSheet(자산군별 맞춤 폼). 대시보드·서브페이지 동일 사용 */}
        {qaOpen && <QuickAddSheet initialAsset="stock" onClose={() => setQaOpen(false)} />}

        {/* [2026-08-05 재작업] '샀어요' 주식수 입력 시트 — window.prompt 대체(인앱브라우저 대응) */}
        {sharesPrompt && (
          <div className="sp-scrim" onClick={() => setSharesPrompt(null)}>
            <div className="sp" onClick={(e) => e.stopPropagation()}>
              {sharesPrompt.needsBlockedConfirm ? (
                <>
                  <div className="sp-h">⚠️ AI 매수 차단 종목</div>
                  <div className="sp-warn">AI는 <b>{sharesPrompt.name || sharesPrompt.code}</b>을(를) 매수 차단했습니다(매도신호). 그래도 '샀어요'로 기록할까요?</div>
                  <div className="sp-row2">
                    <button className="sp-btn ghost" onClick={() => setSharesPrompt(null)}>기록 안 함</button>
                    <button className="sp-btn warn" onClick={confirmBlockedTake}>그래도 기록</button>
                  </div>
                </>
              ) : (
                <>
                  <div className="sp-h">{sharesPrompt.name || sharesPrompt.code} 몇 주 사셨나요?</div>
                  <div className="sp-sub">답하면 자산 탭 보유종목에 현재가로 자동 등록됩니다. 건너뛰어도 나 vs AI 기록엔 영향 없어요.</div>
                  <input
                    className="sp-input" type="number" inputMode="numeric" placeholder="예: 10" autoFocus
                    value={sharesPromptInput} onChange={(e) => setSharesPromptInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') submitSharesPrompt(); }}
                  />
                  {sharesPrompt.err && <div className="sp-err">{sharesPrompt.err}</div>}
                  <div className="sp-row2">
                    <button className="sp-btn ghost" onClick={() => setSharesPrompt(null)}>건너뛰기</button>
                    <button className="sp-btn" disabled={sharesPrompt.saving} onClick={submitSharesPrompt}>
                      {sharesPrompt.saving ? '등록 중…' : '보유종목에 등록'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
        {/* [G5] 하단 앱 내비 — report 탭=AI, 그 외(dashboard/portfolio/analyze)=자산 */}
        <BottomNav active={tab === 'report' ? 'ai' : 'assets'} />
      </div>

      <style jsx>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }

        /* [v8.6] 라이트(기본) — Apple Finance / Toss / Notion 톤. */
        /* [v10 UI] 레거시 로컬 변수 → 디자인 토큰 브리지는 globals.css 로 이전(전역·비스코프)해
           styled-jsx 스코프 문제로 다크모드가 안 먹던 버그를 해결. 여기서는 레이아웃만. */
        /* [사용자 피드백] AppHeader(ONE-HUB 로고+우측 버튼)가 다른 페이지(오늘/자산/이야기/부동산 등)와
           달리 좌우 14px 여백 없이 화면 끝에 붙어있었다 — 그 페이지들은 모두 14px 패딩 컨테이너 안에
           AppHeader를 두는데 index.js만 pwa-wrapper에 그 여백이 없었던 게 원인. 여기로 옮기고
           pwa-main의 중복 14px은 제거(아래 .pwa-main 참고) — 이중 패딩 방지. */
        .pwa-wrapper { max-width: 480px; margin: 0 auto; min-height: 100vh; background: var(--bg); color: var(--text-primary); font-family: var(--font-body); padding: 0 14px 88px; transition: background 0.2s ease, color 0.2s ease; }
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
        /* [S3] 빠른입력 */
        .pwa-quickadd-toggle { width: 34px; height: 34px; border-radius: 50%; background: var(--color-primary); color: #fff; border: none; display: grid; place-items: center; font-size: 20px; font-weight: 700; cursor: pointer; box-shadow: var(--shadow-card); flex-shrink: 0; line-height: 1; }
        .qa-dim { position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 8999; }
        .qa-sheet { position: fixed; bottom: 0; left: 50%; transform: translateX(-50%); width: 100%; max-width: 480px; z-index: 9000; background: var(--card-bg); border-radius: 20px 20px 0 0; padding: 22px 20px calc(env(safe-area-inset-bottom, 0px) + 28px); box-shadow: 0 -4px 32px rgba(0,0,0,0.18); }
        .qa-head { display: flex; align-items: center; justify-content: space-between; font-size: 1rem; font-weight: 800; color: var(--text-primary); margin-bottom: 16px; }
        .qa-x { background: none; border: none; font-size: 1.2rem; color: var(--text-secondary); cursor: pointer; }
        .qa-chips { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
        .qa-chip { padding: 10px 4px; border: 1px solid var(--border); background: var(--card-bg); border-radius: 10px; font-size: 0.78rem; font-weight: 700; color: var(--text-secondary); cursor: pointer; font-family: var(--font-body); }
        .qa-chip.on { background: var(--color-primary); color: #fff; border-color: var(--color-primary); }
        .qa-input-row { display: flex; align-items: center; gap: 8px; margin-top: 14px; }
        .qa-input { flex: 1; border: 1px solid var(--border); background: var(--inset-bg); border-radius: 12px; padding: 13px 14px; font-size: 1.1rem; font-weight: 700; color: var(--text-primary); font-family: var(--font-mono); }
        .qa-input:focus { outline: none; border-color: var(--color-primary); }
        .qa-unit { font-size: 1rem; font-weight: 700; color: var(--text-secondary); }
        .qa-hint { font-size: 0.72rem; color: var(--text-tertiary); margin-top: 10px; line-height: 1.5; word-break: keep-all; }
        .qa-save { width: 100%; margin-top: 16px; background: var(--color-primary); color: #fff; border: none; border-radius: 12px; padding: 13px 0; font-size: 0.92rem; font-weight: 800; cursor: pointer; font-family: var(--font-body); }
        .pwa-search-toggle.active { color: var(--color-primary); }
        .pwa-trader-toggle { display: flex; gap: 3px; background: var(--inset-bg); padding: 3px; border-radius: var(--radius-pill); }
        .pwa-trader-toggle button { background: none; border: none; color: var(--text-secondary); padding: 5px 13px; border-radius: var(--radius-pill); cursor: pointer; font-family: var(--font-display); font-size: 0.75rem; font-weight: 700; }
        .pwa-trader-toggle button.active { background: var(--card-bg); color: var(--accent-info); box-shadow: var(--card-shadow); }

        /* [v11 IA] 주식 서브탭 (2차 내비) */
        .pwa-subtabs { display: flex; align-items: center; gap: 8px; margin: 0 16px 12px; }
        .pwa-subtab { padding: 9px 20px; background: var(--card-bg); border: none; border-radius: var(--radius-pill, 999px); cursor: pointer; color: var(--text-secondary); font-family: var(--font-display); font-size: 0.78rem; font-weight: 700; box-shadow: var(--card-shadow); }
        .pwa-subtab.active { background: var(--accent-buy); color: #fff; }

        /* Layout */
        .pwa-main { padding: 0 0 12px; display: flex; flex-direction: column; gap: 12px; }
        .pwa-card { background: var(--card-bg); border: 1px solid var(--border); border-radius: var(--radius-card); padding: 16px; box-shadow: var(--card-shadow); }
        .pwa-card-label { display: block; font-size: 0.68rem; letter-spacing: 0.08em; color: var(--label-color); text-transform: uppercase; margin-bottom: 10px; font-weight: 700; }
        .flow-ref { text-transform: none; letter-spacing: normal; font-weight: 600; color: var(--color-ink-3); }

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
        /* [오늘의 액션] 히어로 안 실행 리스트 */
        .hh-actions { margin-top: 12px; background: var(--hero-fill); border: 1px solid var(--hero-fill-line); border-radius: 12px; padding: 10px 11px; }
        .hh-actions-h { font-size: 0.72rem; font-weight: 800; color: var(--hero-ink-soft); margin-bottom: 7px; letter-spacing: -.01em; }
        .hh-act { display: flex; align-items: center; gap: 8px; width: 100%; background: none; border: none; padding: 7px 4px; cursor: pointer; text-align: left; font-family: var(--font-body); border-top: 1px solid var(--hero-fill-line); }
        .hh-act:first-of-type { border-top: none; }
        .hh-act-ic { font-size: 0.9rem; flex-shrink: 0; }
        .hh-act-k { font-size: 0.7rem; font-weight: 800; color: var(--hero-accent); flex-shrink: 0; min-width: 34px; }
        .hh-act-t { font-size: 0.78rem; font-weight: 600; color: var(--hero-ink); flex: 1; min-width: 0; line-height: 1.35; word-break: keep-all; }
        .hh-act-go { font-size: 0.8rem; color: var(--hero-ink-faint); flex-shrink: 0; }
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
        .v10-tdelta { font-size: 13px; font-weight: 800; font-variant-numeric: tabular-nums; white-space: nowrap; }
        .v10-tdelta.up { color: var(--color-success, #0E9E6A); }
        .v10-tdelta.down { color: var(--color-danger, #E5484D); }
        .v10-tdelta.flat { color: var(--color-muted); }
        .v10-adelta { font-style: normal; font-size: 11.5px; font-weight: 700; font-variant-numeric: tabular-nums; margin-left: 6px; }
        .v10-adelta.up { color: var(--color-success, #0E9E6A); }
        .v10-adelta.down { color: var(--color-danger, #E5484D); }
        .v10-adelta.flat { color: var(--color-muted); }
        .v10-diag-link { width: 100%; margin-top: 12px; display: flex; align-items: center; justify-content: center; gap: 6px; background: var(--color-primary-soft); color: var(--color-primary); border: none; border-radius: 11px; padding: 11px 0; font-size: 0.82rem; font-weight: 800; cursor: pointer; font-family: var(--font-body); }
        .v10-diag-link span { font-weight: 800; }
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
        /* [종합 브리핑] 주식·ETF·부동산 한 줄 */
        .v10-brief { margin-top: 10px; display: flex; flex-direction: column; gap: 6px; }
        .v10-brief-row { display: flex; align-items: center; gap: 8px; width: 100%; background: var(--color-card-soft); border: 1px solid var(--color-line); border-radius: 11px; padding: 10px 12px; cursor: pointer; font-family: var(--font-sans); text-align: left; }
        .vb-ic { font-size: 14px; flex-shrink: 0; }
        .vb-k { font-size: 12px; font-weight: 800; color: var(--color-ink); flex-shrink: 0; width: 34px; }
        .vb-tx { flex: 1; min-width: 0; font-size: 12px; color: var(--color-ink-2); font-weight: 600; line-height: 1.4; word-break: keep-all; }
        .vb-arr { color: var(--color-ink-3); font-weight: 800; flex-shrink: 0; }
        .v10-act-note b { color: var(--color-ink); }
        /* [브리핑·판단 근거] */
        .bf-block { margin-top: 14px; padding-top: 13px; border-top: 1px solid var(--color-line); }
        .bf-block:first-of-type { margin-top: 12px; }
        .bf-h { font-size: 12.5px; font-weight: 800; color: var(--color-ink); margin-bottom: 9px; }
        .bf-macro { display: flex; flex-wrap: wrap; gap: 6px; }
        .bf-chip { font-size: 11px; font-weight: 700; color: var(--color-ink-2); background: var(--color-card-soft); border: 1px solid var(--color-line); border-radius: 999px; padding: 4px 10px; white-space: nowrap; }
        .bf-chip.bull { color: var(--color-success); border-color: color-mix(in srgb, var(--color-success) 35%, transparent); }
        .bf-chip.bear { color: var(--color-danger); border-color: color-mix(in srgb, var(--color-danger) 35%, transparent); }
        .bf-macro-read { margin-top: 8px; font-size: 12px; font-weight: 600; color: var(--color-primary); background: var(--color-primary-soft); border-radius: 10px; padding: 8px 11px; line-height: 1.45; word-break: keep-all; }
        .bf-re { display: flex; align-items: center; justify-content: space-between; gap: 10px; width: 100%; background: var(--color-card-soft); border: 1px solid var(--color-line); border-radius: 11px; padding: 9px 12px; margin-bottom: 6px; cursor: pointer; font-family: var(--font-sans); text-align: left; }
        .bf-re-l { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
        .bf-re-name { font-size: 12.5px; font-weight: 700; color: var(--color-ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .bf-re-sub { font-size: 10.5px; color: var(--color-ink-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .bf-re-r { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; flex-shrink: 0; }
        .bf-re-px { font-size: 13px; font-weight: 800; color: var(--color-ink); font-variant-numeric: tabular-nums; }
        .bf-re-chg { font-size: 10.5px; font-weight: 800; white-space: nowrap; }
        .bf-re-chg.up { color: var(--color-danger); }
        .bf-re-chg.dn { color: var(--color-primary); }
        .bf-re-chg.fl { color: var(--color-ink-3); }
        .bf-note { font-size: 10px; color: var(--color-ink-3); margin-top: 4px; line-height: 1.5; word-break: keep-all; }
        .bf-empty { font-size: 12px; color: var(--color-ink-2); background: var(--color-card-soft); border-radius: 10px; padding: 11px 12px; line-height: 1.5; word-break: keep-all; }
        .bf-empty-link { background: none; border: none; color: var(--color-primary); font-weight: 700; font-size: 12px; cursor: pointer; font-family: var(--font-sans); padding: 0; }
        .bf-exec { display: flex; align-items: center; flex-wrap: wrap; gap: 6px 12px; margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--color-line); }
        .bf-exec-h { font-size: 11.5px; font-weight: 800; color: var(--color-ink-2); }
        .bf-exec-items { display: flex; flex-wrap: wrap; gap: 4px 11px; font-size: 11.5px; color: var(--color-ink-3); }
        .bf-exec-items b { font-variant-numeric: tabular-nums; font-weight: 800; }
        /* [주식 직접입력] 보유 목록 */
        .mh-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
        .mh-sub { font-size: 0.62rem; font-weight: 700; color: var(--text-tertiary); border: 1px solid var(--border); border-radius: 5px; padding: 1px 6px; margin-left: 5px; }
        .mh-add { font-size: 0.72rem; font-weight: 700; color: var(--color-primary); background: var(--color-primary-soft); border: none; border-radius: 8px; padding: 6px 12px; cursor: pointer; font-family: var(--font-body); }
        .mh-form { margin-bottom: 12px; }
        .mh-list { display: flex; flex-direction: column; gap: 7px; }
        .mh-row { display: flex; align-items: center; gap: 10px; background: var(--inset-bg); border-radius: 10px; padding: 10px 12px; }
        .mh-l { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
        .mh-name { font-size: 0.85rem; font-weight: 700; color: var(--text-primary); word-break: keep-all; line-height: 1.25; }
        .mh-meta { font-size: 0.66rem; color: var(--text-tertiary); }
        /* [S-1] 평단 이상치 배지 */
        .mh-warn { display: inline-block; margin-left: 6px; font-size: 0.6rem; font-weight: 800; color: var(--color-danger); background: var(--color-danger-soft); padding: 1px 6px; border-radius: 6px; white-space: nowrap; }
        .mh-anomaly { border: 1px solid var(--color-danger); }
        .mh-l { min-width: 0; flex: 1; }
        .mh-r { font-size: 0.74rem; color: var(--text-secondary); font-variant-numeric: tabular-nums; white-space: nowrap; flex-shrink: 0; }
        /* [G9] 터치 타깃 44×44 확보 — 시각 칩은 유지하되 탭 영역을 44px로(오터치 방지). */
        .mh-del { flex-shrink: 0; min-width: 44px; min-height: 44px; display: inline-flex; align-items: center; justify-content: center; border-radius: 8px; border: none; background: none; color: var(--color-danger); font-size: 0.95rem; cursor: pointer; }
        .mh-del:hover { background: var(--color-danger-soft); }
        /* [성과비교] 시장 대비 내 성과 */
        .cmp-scope { font-size: 0.66rem; font-weight: 700; color: var(--text-tertiary); }
        .cmp-cta { font-size: 0.8rem; color: var(--text-secondary); line-height: 1.55; word-break: keep-all; background: var(--inset-bg); border-radius: 12px; padding: 13px 14px; }
        .cmp-cta b { color: var(--text-primary); }
        .cmp-cta-link { display: inline-block; margin-top: 6px; background: none; border: none; color: var(--color-primary); font-weight: 700; font-size: 0.8rem; cursor: pointer; font-family: var(--font-body); padding: 0; }
        .cmp-since { font-size: 0.72rem; color: var(--text-secondary); margin-bottom: 10px; }
        .cmp-since b { color: var(--text-primary); font-weight: 800; }
        .cmp-rows { display: flex; flex-direction: column; gap: 8px; }
        .cmp-row { display: flex; align-items: center; justify-content: space-between; background: var(--inset-bg); border-radius: 11px; padding: 11px 13px; }
        .cmp-k { font-size: 0.82rem; font-weight: 700; color: var(--text-primary); }
        .cmp-k-sub { font-size: 0.62rem; font-weight: 600; color: var(--text-tertiary); margin-left: 4px; }
        .cmp-v { font-size: 1rem; font-weight: 800; font-variant-numeric: tabular-nums; }
        .cmp-v.up { color: var(--color-success); }
        .cmp-v.dn { color: var(--color-danger); }
        .cmp-v.na { color: var(--text-tertiary); }
        .cmp-verdict { margin-top: 11px; font-size: 0.8rem; font-weight: 600; line-height: 1.5; word-break: keep-all; border-radius: 11px; padding: 11px 13px; }
        .cmp-verdict.win { background: var(--color-success-soft); color: var(--color-success-ink, var(--color-success)); }
        .cmp-verdict.lose { background: var(--color-warning-soft); color: var(--color-warning-ink); }
        .cmp-verdict b { font-weight: 800; }
        .cmp-note { margin-top: 10px; font-size: 0.7rem; color: var(--text-tertiary); line-height: 1.5; }
        .cmp-foot { margin-top: 10px; font-size: 0.64rem; color: var(--text-tertiary); line-height: 1.5; word-break: keep-all; }
        /* [T-1] 성과 카드 3블록 */
        .pf-block { padding: 11px 0; border-top: 1px solid var(--color-line); }
        .pf-block:first-of-type { border-top: none; padding-top: 2px; }
        .pf-k { font-size: 10.5px; font-weight: 800; letter-spacing: .04em; color: var(--color-ink-3); margin-bottom: 6px; }
        .pf-cur { display: flex; flex-wrap: wrap; gap: 6px 16px; font-size: 13.5px; color: var(--color-ink-2); }
        .pf-cur b { font-weight: 800; }
        .pf-cur b.up { color: var(--color-success); }
        .pf-cur b.dn { color: var(--color-danger); }
        .pf-excess { font-weight: 700; color: var(--color-ink); }
        .pf-since { font-size: 11.5px; color: var(--color-ink-3); margin-top: 6px; }
        .pf-cause { font-size: 13px; color: var(--color-ink-2); line-height: 1.55; word-break: keep-all; }
        .pf-cause b { color: var(--color-ink); font-weight: 800; }
        .pf-next .pf-action { font-size: 13px; color: var(--color-ink-2); line-height: 1.55; word-break: keep-all; }
        .pf-action b { color: var(--color-success); font-weight: 800; }
        .pf-assume { color: var(--color-ink-3); font-weight: 500; font-size: 11.5px; }
        .pf-ctas { display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap; }
        .pf-cta { flex: 1; min-width: 130px; border: 1px solid var(--color-line); background: var(--color-card); color: var(--color-ink); border-radius: 10px; padding: 10px 12px; font-size: 12.5px; font-weight: 700; font-family: var(--font-sans); cursor: pointer; }
        .pf-cta.primary { background: var(--color-primary); border-color: var(--color-primary); color: #fff; }
        /* [#3 알림 피드] */
        /* [알림카드 #5·#6] 오늘 알림 상세 카드 */
        .noti-card { margin-bottom: 12px; }
        .noti-list { display: flex; flex-direction: column; }
        .noti-item { display: flex; gap: 9px; align-items: flex-start; padding: 10px 2px; border-bottom: 1px solid var(--color-line); }
        .noti-item:last-child { border-bottom: none; }
        .noti-ic { flex-shrink: 0; font-size: 15px; line-height: 1.4; }
        .noti-b { flex: 1; min-width: 0; }
        .noti-t { font-size: 0.8rem; font-weight: 700; color: var(--color-ink); line-height: 1.45; word-break: keep-all; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
        .noti-src { font-size: 0.58rem; font-weight: 800; color: var(--color-primary); background: var(--color-primary-soft); padding: 1px 6px; border-radius: 5px; }
        .noti-more { font-size: 0.6rem; color: var(--text-tertiary); }
        .noti-d { font-size: 0.74rem; color: var(--color-ink-2); line-height: 1.55; margin-top: 5px; white-space: pre-wrap; word-break: keep-all; background: var(--inset-bg); border-radius: 8px; padding: 8px 10px; }
        .noti-ts { flex-shrink: 0; font-size: 10px; color: var(--color-ink-3); padding-top: 2px; }
        .noti-item.unread .noti-t::before { content: ''; display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: var(--color-danger); margin-right: 2px; }
        .noti-item.op { background: var(--color-warning-soft); border-radius: 8px; margin-bottom: 4px; padding: 10px; border-bottom: none; }
        .noti-foot { font-size: 0.64rem; color: var(--color-ink-3); margin-top: 10px; line-height: 1.5; word-break: keep-all; }
        .v10-noti { margin-top: 13px; border-top: 1px solid var(--color-line); padding-top: 12px; }
        .bf-block.v10-noti { margin-top: 14px; }
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
        /* [미니 게이지] 시장온도·공포탐욕 카드 안 소형 위치바 */
        .mini-g { position: relative; height: 5px; border-radius: 3px; margin-top: 7px; }
        .mini-g.fg { background: linear-gradient(90deg, var(--color-danger), var(--color-ink-3) 50%, var(--color-success)); }
        .mini-g.heat { background: linear-gradient(90deg, var(--color-success), var(--color-warning) 55%, var(--color-danger)); }
        .mini-dot { position: absolute; top: 50%; width: 9px; height: 9px; border-radius: 50%; background: var(--color-ink); border: 2px solid var(--color-card); transform: translate(-50%, -50%); box-shadow: 0 0 0 1px var(--color-line); }
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
        .v10-collap.open .v10-collap-body { max-height: 1600px; }
        .v10-collap-inner { padding-top: 15px; }
        /* [T-3] 아코디언 헤더 요약값 */
        .acc-htxt { display: flex; align-items: baseline; gap: 9px; flex-wrap: wrap; min-width: 0; }
        .acc-sum { font-size: 12.5px; color: var(--color-ink-2); font-weight: 600; }
        .acc-more { display: inline-block; margin-top: 12px; font-size: 12.5px; font-weight: 700; color: var(--color-primary); cursor: pointer; }
        /* [T-2] TOP PICK 카드 */
        .tp-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 11px 0; border-top: 1px solid var(--color-line); }
        .tp-row:first-of-type { border-top: none; }
        .tp-l { display: flex; align-items: center; gap: 11px; min-width: 0; }
        .tp-medal { width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center; font-size: 12px; font-weight: 800; color: #fff; flex-shrink: 0; }
        .tp-meta { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
        .tp-name { font-size: 14px; font-weight: 700; color: var(--color-ink); display: flex; align-items: center; gap: 6px; }
        .tp-buy { font-size: 10px; font-weight: 700; color: var(--color-success); background: var(--color-success-soft); padding: 2px 6px; border-radius: 6px; }
        .tp-tags { display: flex; gap: 5px; flex-wrap: wrap; }
        .tp-tag { font-size: 11px; font-weight: 600; color: var(--color-primary); background: var(--color-primary-soft); padding: 2px 7px; border-radius: 99px; white-space: nowrap; }
        .tp-tag.muted { color: var(--color-ink-3); background: var(--color-card-soft); }
        .tp-r { display: flex; align-items: center; gap: 9px; flex-shrink: 0; }
        .tp-score { font-size: 15px; font-weight: 800; color: var(--color-primary); }
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
        /* [사용자 지시] 종합자산(assets.js)에서 "보유 자세히"로 들어와도 동일한 라이트 카드
           형태를 유지하도록 통일 */
        .acc-hero { background: var(--color-card); color: var(--color-ink); border: 1px solid var(--color-line); border-radius: var(--radius-card, 14px); padding: 16px; box-shadow: var(--shadow-card); }
        .acc-hero-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 13px; gap: 8px; }
        .acc-hero-lbl { font-size: 12.5px; font-weight: 700; color: var(--color-ink-2); }
        .acc-badge { font-size: 12.5px; font-weight: 800; padding: 5px 12px; border-radius: 20px; }
        .acc-badge.down { background: var(--color-danger-soft, rgba(240,68,82,.14)); color: var(--color-danger); }
        .acc-badge.up { background: var(--color-success-soft, rgba(22,199,132,.14)); color: var(--color-success); }
        .acc-hero-total { font-size: 29px; font-weight: 800; letter-spacing: -.5px; line-height: 1; color: var(--color-ink); }
        .acc-hero-total span { font-size: 17px; font-weight: 700; margin-left: 1px; }
        .acc-hero-sub { font-size: 12.5px; color: var(--color-ink-2); margin-top: 9px; }
        .acc-hero-sub b { font-weight: 700; color: var(--color-ink); }
        .acc-hero-sub .up { color: var(--color-success); } .acc-hero-sub .dn { color: var(--color-danger); }
        .acc-chips { display: flex; gap: 9px; margin-top: 16px; }
        .acc-chip { flex: 1; background: var(--color-card-soft, var(--color-bg)); border: 1px solid var(--color-line); border-radius: 13px; padding: 11px 13px; }
        .acc-chip span { display: block; font-size: 11px; color: var(--color-ink-3); font-weight: 600; margin-bottom: 4px; }
        .acc-chip b { font-size: 14px; font-weight: 800; color: var(--color-ink); }

        /* [v10 UI] 추천 관심종목 네이비 히어로 — 제목/업데이트/설명 2~3줄 정렬 */
        .rec-hero { background: var(--color-card); color: var(--color-ink); border: 1px solid var(--color-line); border-radius: var(--radius-card, 14px); padding: 16px; box-shadow: var(--shadow-card); }
        .rec-hero-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
        .rec-hero-title { font-size: 15px; font-weight: 800; color: var(--color-ink); letter-spacing: -.2px; }
        .rec-hero-live { background: var(--color-success); color: #04351f; font-size: 9px; font-weight: 800; padding: 3px 7px; border-radius: 5px; letter-spacing: .5px; flex-shrink: 0; }
        .rec-hero-upd { margin-top: 7px; }
        .rec-hero-desc { font-size: 12px; color: var(--color-ink-2); line-height: 1.55; margin-top: 10px; }

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
        /* [모바일] minmax(0,1fr) — 1fr의 암묵적 min-content 최소폭 때문에 nowrap 자식(종목명·버튼)이 트랙을 밀어 가로 오버플로우 나던 문제 해소 */
        .top3-hero-row { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin-bottom: 4px; }
        .top3-hero-card { display: flex; flex-direction: column; align-items: center; min-width: 0; padding: 12px 6px; background: var(--card-bg); border-radius: var(--radius-md); border: 1.5px solid var(--border); gap: 4px; cursor: pointer; text-align: center; transition: border-color 0.15s; }
        .top3-hero-card:hover { border-color: var(--color-primary); }
        .top3-hero-card:nth-child(1) { border-color: var(--color-warning); }
        .top3-hero-card:nth-child(2) { border-color: var(--color-ink-3); }
        .top3-hero-card:nth-child(3) { border-color: var(--color-warning-ink); }
        .top3-medal { font-size: 1.4rem; line-height: 1; }
        .top3-name { font-size: 0.8rem; font-weight: 700; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; width: 100%; min-width: 0; display: block; }
        .top3-stars { font-size: 0.7rem; letter-spacing: -1px; color: var(--color-warning); }
        /* [M5] 폭 대응 — 모바일 1열 가로형(@media 430px)에서 전폭 확보. 데스크톱은 중앙정렬 줄바꿈. */
        .top3-ai-pct { font-size: 0.78rem; font-weight: 800; color: var(--color-primary); width: 100%; text-align: center; word-break: keep-all; line-height: 1.4; }
        .top3-why-btn { font-size: 0.62rem; padding: 3px 8px; border-radius: 6px; background: var(--inset-bg); border: 1px solid var(--border); color: var(--text-secondary); cursor: pointer; font-family: var(--font-body); white-space: nowrap; margin-top: 2px; }
        /* [§3-3] 추천 카드 인라인 근거·스탠스·기대여력 */
        /* [나 vs AI] 추천 카드 판단 버튼 */
        .dec-mini { display: flex; gap: 4px; margin-top: 6px; width: 100%; min-width: 0; }
        .dec-mini.lg { gap: 8px; }
        .dec-b { flex: 1 1 0; min-width: 0; font-size: 0.64rem; font-weight: 700; padding: 5px 4px; border-radius: 7px; border: 1px solid var(--border); background: var(--card-bg); color: var(--text-secondary); cursor: pointer; font-family: var(--font-body); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; transition: background .12s, color .12s, border-color .12s; }
        .dec-mini.lg .dec-b { font-size: 0.8rem; padding: 9px 6px; border-radius: 9px; }
        .dec-b.take.on { background: var(--color-primary); color: #fff; border-color: var(--color-primary); }
        .dec-b.pass.on { background: var(--color-ink-2, var(--text-secondary)); color: #fff; border-color: var(--color-ink-2, var(--text-secondary)); }
        .dec-b:active { transform: scale(0.97); }
        .rec-def { font-size: 0.72rem; color: var(--text-secondary); background: var(--inset-bg); border: 1px solid var(--border); border-radius: 10px; padding: 9px 12px; margin-bottom: 12px; line-height: 1.5; }
        /* [S7.2] 추천 정렬 칩 · 샀어요 마이크로카피 · 5신호 점등 */
        .rec-sort { display: flex; gap: 6px; margin-bottom: 10px; }
        .rec-sort-chip { border: 1px solid var(--color-line); background: var(--color-card); color: var(--color-ink-2); border-radius: 999px; padding: 6px 13px; font-size: 0.74rem; font-weight: 700; font-family: var(--font-sans); cursor: pointer; }
        /* [N4] 정렬 근거 한 줄 — 칩 바로 아래, 목록보다 먼저 읽히게 */
        .rec-sort-basis { font-size: 0.68rem; color: var(--color-ink-3); line-height: 1.4; margin: 4px 0 8px; word-break: keep-all; }
        .rec-sort-chip.on { background: var(--color-primary); border-color: var(--color-primary); color: #fff; }
        .rec-micro { font-size: 0.68rem; color: var(--color-ink-2); background: var(--color-card-soft); border-radius: 9px; padding: 8px 11px; margin-bottom: 12px; line-height: 1.5; word-break: keep-all; }
        .rec-micro b { color: var(--color-ink); font-weight: 700; }
        .rec-micro-link { border: none; background: none; color: var(--color-primary); font-weight: 800; font-size: 0.68rem; cursor: pointer; font-family: var(--font-sans); padding: 0 0 0 3px; }
        .sig5 { display: flex; gap: 3px; justify-content: center; margin: 5px 0; }
        .sig-dot { font-size: 0.5rem; font-weight: 800; padding: 2px 4px; border-radius: 4px; line-height: 1; }
        .sig-dot.on { background: var(--color-success-soft); color: var(--color-success-ink, var(--color-success)); }
        .sig-dot.off { background: var(--color-card-soft); color: var(--color-ink-3); }
        .sig-dot.na { background: var(--color-card-soft); color: var(--color-ink-3); opacity: 0.5; }
        .rec-def b { color: var(--text-primary); font-weight: 700; }
        .top3-stance { font-size: 0.6rem; font-weight: 800; padding: 1px 7px; border-radius: 20px; border: 1px solid; line-height: 1.5; }
        .top3-reason { font-size: 0.64rem; color: var(--text-secondary); line-height: 1.35; word-break: keep-all; min-height: 2.4em; display: flex; align-items: center; justify-content: center; text-align: center; width: 100%; }
        .top3-upside { font-size: 0.66rem; color: var(--text-secondary); display: flex; align-items: center; justify-content: center; gap: 4px; width: 100%; }
        .top3-upside b { color: var(--color-success); font-weight: 800; }
        .top3-upside .est { font-size: 0.54rem; color: var(--text-tertiary); border: 1px solid var(--border); border-radius: 4px; padding: 0 3px; }
        /* [간결화] 기대수익 강조(카드 값 축) */
        .top3-upside-lg { display: flex; flex-direction: column; align-items: center; gap: 1px; margin-top: 2px; }
        .top3-upside-lg .tu-k { font-size: 0.54rem; color: var(--text-tertiary); font-weight: 700; }
        .top3-upside-lg b { font-size: 0.95rem; color: var(--color-success); font-weight: 800; font-variant-numeric: tabular-nums; }
        .top3-upside-lg .est { font-size: 0.5rem; color: var(--text-tertiary); border: 1px solid var(--border); border-radius: 4px; padding: 0 3px; }
        .rec-rest-h { font-size: 0.68rem; font-weight: 700; color: var(--text-tertiary); margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.05em; }
        /* [FB-3 §3.6] 오늘 판단 확정 요약 */
        .rec-confirm { margin-top: 14px; padding: 14px; border: 1px solid var(--color-line); border-radius: 12px; background: var(--inset-bg, var(--color-card-soft)); }
        .rec-confirm-h { font-size: 0.86rem; font-weight: 800; color: var(--color-ink); margin-bottom: 8px; }
        .rec-confirm-t { font-size: 0.8rem; font-weight: 600; color: var(--color-ink-2); line-height: 1.55; word-break: keep-all; margin: 0; }
        .rec-confirm-t b { color: var(--color-primary); font-weight: 800; }
        .rec-confirm-t.quiet { color: var(--color-ink-3); }
        .rec-confirm-t.quiet b { color: var(--color-ink-2); }
        .rec-confirm-cta { width: 100%; margin-top: 11px; min-height: 46px; border: none; border-radius: 11px; background: var(--color-primary); color: #fff; font-size: 0.84rem; font-weight: 800; cursor: pointer; font-family: var(--font-sans); }
        .rec-confirm-cta:active { opacity: 0.9; }
        .rec-rest-list { display: flex; flex-direction: column; gap: 6px; }
        .rec-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 10px 12px; background: var(--inset-bg); border-radius: 10px; }
        .rec-row-l { min-width: 0; flex: 1; }
        .rec-name { background: none; border: none; cursor: pointer; font-family: var(--font-body); font-size: 0.84rem; color: var(--text-primary); font-weight: 700; padding: 0; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; text-align: left; }
        .rec-code { font-size: 0.66rem; font-weight: 400; }
        .rec-stance-inline { font-size: 0.6rem; font-weight: 800; }
        /* [S-8] AI 판단 배지 — 카드 최상단 최대 위계 */
        .ai-verdict-badge { align-self: stretch; text-align: center; font-size: 0.82rem; font-weight: 800; padding: 6px 8px; border-radius: 9px; border: 1.5px solid; letter-spacing: -0.01em; margin-bottom: 2px; }
        .rec-verdict-inline { font-size: 0.62rem; font-weight: 800; padding: 1px 7px; border-radius: 20px; margin-left: 4px; }
        /* [AI-5] 추천∩차단 최종 판단 병기 */
        .rec-final-block { margin: 4px 8px 0; font-size: 0.64rem; font-weight: 800; color: var(--color-danger); background: var(--color-danger-soft); border-radius: 7px; padding: 3px 8px; text-align: center; line-height: 1.4; }
        /* [S-4] 동점 2차 정렬 근거 */
        /* [S-8] 나 vs AI 예고 */
        .vs-teaser { font-size: 0.64rem; font-weight: 700; color: var(--text-secondary); margin-top: 2px; }
        .vs-teaser b { font-weight: 800; }
        /* [S-6] 바로 매수(Primary) + 자동 관망 알림 */
        .buy-now-btn { width: 100%; margin-top: 4px; border: none; border-radius: 9px; padding: 8px 0; font-size: 0.74rem; font-weight: 800; background: var(--color-primary); color: #fff; cursor: pointer; font-family: var(--font-body); }
        /* ───────── [S11-M4] 추천 Top3 · 모바일 1열 가로형(A안) ─────────
           115px 3열은 폭 부족(필요 225px) → 모바일은 카드당 전폭 1열, 번호-내용 가로 배치.
           데스크톱(≥431px)은 기존 3열 유지. WO의 area 겹침(verdict·buy 중복)은 각 요소
           고유 area로 교정 — tie/dday는 조건부라 미표시 시 행 자동 붕괴. */
        @media (max-width: 430px) {
          .top3-hero-row { grid-template-columns: 1fr; gap: 10px; }
          .top3-hero-card {
            display: grid;
            grid-template-columns: 26px minmax(0, 1fr) auto;
            grid-template-areas:
              "num  name    verdict"
              "num  reason  reason"
              "num  pct     why"
              "num  dec     dec"
              "num  buy     buy"
              "num  dday    dday";
            align-items: center;
            text-align: left;
            gap: 6px 8px;
            padding: 12px 14px;
          }
          .top3-medal       { grid-area: num;     font-size: 1rem; font-weight: 800; color: var(--text-tertiary); align-self: start; padding-top: 2px; }
          .top3-name        { grid-area: name;    text-align: left; font-size: 0.9rem; width: auto; }
          .ai-verdict-badge { grid-area: verdict; align-self: center; justify-self: end; font-size: 0.66rem; padding: 4px 8px; white-space: nowrap; }
          .top3-reason      { grid-area: reason;  justify-content: flex-start; text-align: left; min-height: 0; width: auto; }
          .top3-ai-pct      { grid-area: pct;     text-align: left; font-size: 0.84rem; width: auto; }
          .top3-why-btn     { grid-area: why;     justify-self: end; align-self: center; }
          .dec-mini         { grid-area: dec;     margin-top: 2px; }
          .buy-now-btn      { grid-area: buy; }
          .dec-dday         { grid-area: dday;    justify-self: start; text-align: left; }
          .vs-teaser        { display: none; }
          /* 44pt 터치 타깃(G9) */
          .dec-b        { min-height: 44px; font-size: 0.8rem; padding: 8px 6px; }
          .buy-now-btn  { min-height: 44px; }
          .top3-why-btn { min-height: 44px; display: inline-flex; align-items: center; }
        }
        /* 아주 좁은 화면(≤360px) — 결정 버튼 세로 스택 */
        @media (max-width: 360px) {
          .dec-mini { flex-direction: column; }
          .dec-b    { width: 100%; }
        }
        .auto-watch-note { display: flex; align-items: center; justify-content: space-between; gap: 8px; background: var(--color-card-soft); border: 1px solid var(--color-line); border-radius: 10px; padding: 9px 12px; margin-bottom: 10px; font-size: 0.72rem; color: var(--text-secondary); line-height: 1.4; word-break: keep-all; }
        .auto-watch-note b { color: var(--color-ink); font-weight: 800; }
        .auto-watch-note button { flex-shrink: 0; font-family: var(--font-body); font-size: 0.7rem; font-weight: 700; color: var(--color-primary); background: none; border: none; cursor: pointer; }
        /* [S-5] 나 vs AI 참여 유도 — 버튼과 동등 위계 */
        .vs-cta { background: var(--color-primary-soft); border: 1px solid var(--color-primary); border-radius: 12px; padding: 11px 13px; margin-bottom: 12px; }
        .vs-cta.first { background: var(--color-warning-soft, var(--color-primary-soft)); border-color: var(--color-warning, var(--color-primary)); }
        .vs-cta-h { font-size: 0.88rem; font-weight: 800; color: var(--color-ink); line-height: 1.35; word-break: keep-all; }
        .vs-cta-sub { font-size: 0.72rem; color: var(--text-secondary); margin-top: 3px; line-height: 1.4; word-break: keep-all; }
        .dec-dday { font-size: 0.62rem; font-weight: 800; color: var(--color-primary); margin-top: 4px; }
        .dec-feedback { position: fixed; left: 50%; bottom: 74px; transform: translateX(-50%); z-index: 1200; display: flex; align-items: center; gap: 10px; max-width: 92vw; background: var(--color-ink, #1f2a37); color: #fff; padding: 11px 16px; border-radius: 12px; font-size: 0.76rem; font-weight: 600; box-shadow: 0 8px 30px rgba(0,0,0,.3); cursor: pointer; word-break: keep-all; line-height: 1.4; }
        .dec-feedback b { font-weight: 800; }
        .dec-feedback .df-link { flex-shrink: 0; font-weight: 800; color: var(--color-primary); }
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
        .position-card-top { display: flex; justify-content: space-between; align-items: center; gap: 6px; margin-bottom: 7px; }
        /* [S-1] 종목명 잘림 방지 — 최소폭 확보 + 2줄 허용(중간 절단 금지) */
        .position-card-name { font-size: 0.86rem; color: var(--text-primary); font-weight: 600; flex: 1 1 auto; min-width: 7em; word-break: keep-all; line-height: 1.25; }
        .position-card-badge { font-size: 0.76rem; font-weight: 700; padding: 3px 9px; border-radius: var(--radius-pill); flex-shrink: 0; }
        /* [S-2] 보유 긴급도 배지 + 요약 + 정렬 */
        .hold-urg-badge { font-size: 0.62rem; font-weight: 800; padding: 2px 8px; border-radius: 20px; border: 1px solid; flex-shrink: 0; white-space: nowrap; }
        .hold-summary { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 0.78rem; font-weight: 700; color: var(--text-secondary); margin-bottom: 10px; }
        .hold-summary b { color: var(--color-danger); font-weight: 800; }
        .hold-sort-btn { font-family: var(--font-body); font-size: 0.7rem; font-weight: 700; color: var(--text-secondary); background: var(--inset-bg); border: 1px solid var(--border); border-radius: 8px; padding: 4px 10px; cursor: pointer; flex-shrink: 0; }
        .position-card.u-urgent { border-color: var(--color-danger); }
        .position-card.u-chance { border-color: var(--color-success); }
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
        /* [FB-8 이슈2] 조치 필요 종목 상단 명령형 안내 배너 */
        .pos-todo { display: flex; flex-direction: column; gap: 2px; margin: 8px 0 2px; padding: 8px 10px; background: var(--color-card-soft); border-radius: 8px; word-break: keep-all; }
        .pos-todo-k { font-size: 0.68rem; font-weight: 800; }
        .pos-todo-v { font-size: 0.76rem; color: var(--color-ink); line-height: 1.5; font-weight: 700; }
        .pos-todo-hint { display: block; font-size: 0.66rem; color: var(--color-ink-3); font-weight: 500; margin-top: 1px; }
        .pos-todo-hint b { color: var(--color-ink-2); font-weight: 700; }
        /* [S7.1] 종목별 다음 트리거 */
        .pos-trigger { font-size: 0.68rem; color: var(--color-ink-2); background: var(--color-card-soft); border-radius: 8px; padding: 7px 10px; margin-top: 8px; line-height: 1.5; word-break: keep-all; }
        .pos-trigger b { color: var(--color-ink); font-weight: 800; }
        .pt-est { font-size: 0.56rem; font-weight: 800; color: var(--color-warning-ink); background: var(--color-warning-soft); padding: 1px 5px; border-radius: 4px; margin-left: 5px; }
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
        .ml-hist-empty { font-size: 0.74rem; color: var(--text-tertiary); line-height: 1.5; margin: 0 0 12px; }
        .ml-hist { margin-bottom: 12px; }
        .ml-hist-row { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 2px; }
        .ml-hist-item { flex: none; display: flex; flex-direction: column; align-items: center; gap: 2px; background: var(--inset-bg); border-radius: 9px; padding: 8px 12px; min-width: 56px; }
        .ml-hist-date { font-size: 0.62rem; color: var(--text-tertiary); font-weight: 600; }
        .ml-hist-item b { font-size: 0.86rem; font-weight: 800; color: var(--text-primary); font-family: var(--font-mono); }
        .ml-hist-item .up { font-size: 0.64rem; font-weight: 800; color: var(--color-success); }
        .ml-hist-item .dn { font-size: 0.64rem; font-weight: 800; color: var(--color-danger); }
        .ml-reasons { background: var(--inset-bg); border-radius: var(--radius-md); padding: 12px 13px; }
        .ml-reasons-h { font-size: 0.72rem; font-weight: 700; color: var(--text-secondary); margin-bottom: 9px; }
        /* [N7] 소표본 게이트 표기 */
        .ml-reasons-note { font-weight: 600; color: var(--text-tertiary); margin-left: 6px; }
        .ml-ref { font-style: normal; font-weight: 700; color: var(--text-tertiary); margin-left: 4px; font-size: 0.9em; }
        .ml-reason-hidden { font-size: 0.66rem; color: var(--text-tertiary); padding-top: 8px; margin-top: 4px; border-top: 1px dashed var(--border); line-height: 1.5; word-break: keep-all; }
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
        /* [사용자 피드백] 오늘·자산·이야기와 동일하게 카드 없이 — 위치/여백을 td-titlewrap과 픽셀 단위로 통일 */
        .trust-nav { display: flex; align-items: center; gap: 8px; margin: 6px 2px 6px; }
        .aid-card { background: var(--color-card); border: 1px solid var(--color-line); border-radius: var(--radius-card, 14px); padding: 16px; margin-bottom: 12px; box-shadow: var(--shadow-card); }
        .aid-head { display: flex; align-items: baseline; gap: 8px; margin-bottom: 6px; }
        .aid-date { font-size: 0.9rem; font-weight: 800; color: var(--color-ink); }
        .aid-prev { font-size: 0.7rem; color: var(--color-ink-3); font-weight: 600; }
        .aid-sum { font-size: 0.8rem; color: var(--color-ink-2); margin-bottom: 8px; }
        .aid-sum b { color: var(--color-ink); font-size: 0.86rem; }
        .aid-watch { color: var(--color-ink-3); font-weight: 700; }
        .aid-stale { font-size: 0.76rem; color: var(--color-ink-2); line-height: 1.55; margin: 0 0 8px; word-break: keep-all; background: var(--color-card-soft, rgba(0,0,0,.03)); padding: 8px 10px; border-radius: 8px; }
        .aid-none { font-size: 0.78rem; color: var(--color-ink-3); line-height: 1.5; margin: 0; }
        .aid-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 5px; }
        .aid-list li { font-size: 0.78rem; color: var(--color-ink-2); line-height: 1.4; }
        .aid-list li b { color: var(--color-ink); }
        .aid-tag { font-size: 0.62rem; font-weight: 800; border-radius: 5px; padding: 1px 6px; margin-right: 5px; }
        .aid-tag.new { color: #0E9E6A; background: #E7FAF2; }
        .aid-tag.act { color: #2F6BFF; background: #EAF1FF; }
        .aid-tag.sc { color: #B45309; background: #FEF3C7; }
        .aid-tag.gone { color: #94A3B8; background: #F1F5F9; }
        .vs-card { border: 1px solid var(--color-line); }
        .vs-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
        .vs-overall { font-size: 0.7rem; font-weight: 800; padding: 3px 10px; border-radius: 999px; white-space: nowrap; }
        /* [A-1] 나 vs AI 스코어보드 */
        /* [G-시리즈] 가상 지갑 대결 게임 */
        .game-onb { border: 1px solid var(--color-primary); }
        .gonb-sub { font-size: 0.78rem; color: var(--text-secondary); line-height: 1.6; margin: 6px 0 12px; word-break: keep-all; }
        .gonb-opts { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; }
        .gonb-opt { display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 14px 4px; border: 1px solid var(--border); border-radius: 12px; background: var(--inset-bg); color: var(--color-ink); font-size: 0.84rem; font-weight: 800; cursor: pointer; font-family: var(--font-sans); }
        .gonb-opt span { font-size: 0.56rem; font-weight: 800; color: var(--purple, var(--color-primary)); background: var(--purple-soft, var(--color-primary-soft)); padding: 1px 6px; border-radius: 4px; }
        .gonb-foot { font-size: 0.66rem; color: var(--text-tertiary); margin-top: 12px; line-height: 1.5; word-break: keep-all; }
        /* [사용자 지시] 삭제된 "AI 신뢰도" 소개카드 대신, 이 페이지에서 가장 중요한 실제 결과인
           나 vs AI 대결 카드를 짙은 곤색(hero) 카드로 강조 — 자식 요소들은 대부분 CSS 변수(--color-ink 등)를
           참조하므로 여기서 그 변수들만 hero 톤으로 재정의하면 하위 전부가 함께 톤이 바뀐다. */
        .gd-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
        .gd-virtual { font-size: 0.6rem; font-weight: 800; color: var(--purple, var(--color-primary)); background: var(--purple-soft, var(--color-primary-soft)); padding: 2px 8px; border-radius: 999px; white-space: nowrap; }
        .gd-narr { font-size: 0.76rem; color: var(--color-ink-2); background: var(--inset-bg); border-radius: 9px; padding: 8px 11px; margin: 10px 0 0; line-height: 1.5; word-break: keep-all; }
        .gd-wallets { display: flex; align-items: center; gap: 8px; margin: 12px 0 8px; }
        .gd-w { flex: 1; display: flex; flex-direction: column; gap: 3px; align-items: center; background: var(--inset-bg); border-radius: 12px; padding: 12px 6px; text-align: center; }
        .gd-wl { font-size: 1.02rem; font-weight: 800; color: var(--color-ink); }
        .gd-wl-ed { font-size: 0.66rem; font-weight: 600; color: var(--text-tertiary); margin-left: 3px; }
        .gd-wb { font-size: 1.05rem; font-weight: 900; font-family: var(--font-mono); color: var(--color-ink); }
        .gd-wg { font-size: 0.68rem; font-weight: 800; font-family: var(--font-mono); }
        .gd-wg.up { color: var(--color-success); } .gd-wg.dn { color: var(--color-danger); }
        .gd-vs { font-size: 0.72rem; font-weight: 900; color: var(--text-tertiary); flex-shrink: 0; }
        .gd-bar { height: 8px; border-radius: 4px; background: var(--purple-soft, var(--color-primary-soft)); overflow: hidden; margin-bottom: 8px; }
        .gd-bar-me { height: 100%; background: var(--color-success); border-radius: 4px; transition: width .4s; }
        .gd-lead { text-align: center; font-size: 0.74rem; color: var(--text-secondary); line-height: 1.5; word-break: keep-all; }
        .gd-lead b.up { color: var(--color-success); } .gd-lead b.dn { color: var(--purple, var(--color-danger)); }
        .gd-trend { margin-top: 12px; border-top: 1px solid var(--border); padding-top: 10px; }
        .gd-trend :global(.recharts-wrapper),
        .gd-trend :global(.recharts-surface),
        .gd-trend :global(.recharts-wrapper *) { outline: none !important; }
        .gd-trend-top { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; margin-bottom: 4px; flex-wrap: wrap; }
        .gd-trend-days { font-size: 0.7rem; font-weight: 700; color: var(--text-tertiary); }
        .gd-trend-final { font-size: 0.72rem; color: var(--text-secondary); text-align: right; }
        .gd-trend-final b.up { color: var(--color-success); } .gd-trend-final b.dn { color: var(--purple, var(--color-danger)); }
        /* [사용자 지시] 그래프 클릭 시 그 시점 판단 차이 설명 */
        .gd-trend-hint { font-size: 0.66rem; color: var(--text-tertiary); text-align: center; margin-top: 4px; }
        /* [사용자 지시] 그래프 점 클릭 시 팝업 카드(바텀시트)로 상세 설명 */
        .gd-trend-modal-bg { position: fixed; inset: 0; z-index: 9000; background: rgba(10,15,25,.5); display: flex; align-items: flex-end; justify-content: center; }
        .gd-trend-modal { position: relative; width: 100%; max-width: 480px; background: var(--color-card); border-radius: 18px 18px 0 0; padding: 22px 20px calc(env(safe-area-inset-bottom, 0px) + 22px); }
        .gd-trend-modal-x { position: absolute; top: 14px; right: 14px; width: 30px; height: 30px; border-radius: 50%; border: none; background: var(--color-card-soft, var(--color-line)); color: var(--color-ink-2); font-size: 14px; cursor: pointer; }
        .gd-trend-modal-t { font-size: 1.02rem; font-weight: 800; color: var(--color-ink); margin: 0 40px 4px 0; word-break: keep-all; }
        .gd-trend-modal-ret { font-size: 0.8rem; font-weight: 700; color: var(--color-ink-3); margin-bottom: 14px; }
        .gd-trend-modal-rows { display: flex; flex-direction: column; gap: 10px; }
        .gd-trend-modal-row { display: flex; align-items: center; gap: 8px; padding: 10px 12px; background: var(--color-card-soft, var(--color-bg)); border-radius: 10px; }
        .gd-trend-modal-who { flex: none; font-size: 0.82rem; font-weight: 800; color: var(--color-ink); }
        .gd-trend-modal-mid { flex: 1; min-width: 0; font-size: 0.76rem; color: var(--color-ink-2); }
        .gd-trend-modal-row b { font-size: 0.88rem; font-weight: 800; }
        .gd-trend-modal-row b.up { color: var(--color-success); } .gd-trend-modal-row b.dn { color: var(--purple, var(--color-danger)); }
        .gd-trend-modal-diff { margin-top: 14px; font-size: 0.92rem; font-weight: 800; color: var(--color-ink); text-align: center; }
        .gd-trend-modal-note { margin-top: 10px; font-size: 0.72rem; color: var(--color-ink-3); line-height: 1.55; word-break: keep-all; text-align: center; }
        .gd-pending, .gd-recent { margin-top: 12px; border-top: 1px solid var(--border); padding-top: 10px; }
        .gd-ph { font-size: 0.7rem; font-weight: 800; color: var(--color-ink-2); margin-bottom: 6px; }
        .gd-prow, .gd-rrow { display: flex; align-items: center; gap: 8px; padding: 5px 0; font-size: 0.74rem; }
        .gd-pn { flex: 1; font-weight: 700; color: var(--color-ink); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .gd-pj { font-size: 0.66rem; color: var(--text-tertiary); }
        .gd-dday { font-size: 0.66rem; font-weight: 800; color: var(--color-warning-ink, var(--color-warning)); }
        .gd-rw { flex-shrink: 0; }
        .gd-rret { font-family: var(--font-mono); font-weight: 800; } .gd-rret.up { color: var(--color-success); } .gd-rret.dn { color: var(--color-danger); }
        .gd-rwin { font-size: 0.64rem; font-weight: 700; color: var(--text-secondary); }
        .gd-foot { font-size: 0.64rem; color: var(--text-tertiary); margin-top: 12px; line-height: 1.6; word-break: keep-all; }
        .gd-reset { border: none; background: none; color: var(--color-primary); font-weight: 700; cursor: pointer; font-size: 0.64rem; text-decoration: underline; font-family: var(--font-sans); padding: 0; }
        /* [사용자 지시] 향후 대결 구도 카드 */
        .upcoming-desc { font-size: 0.76rem; color: var(--text-secondary); line-height: 1.55; word-break: keep-all; margin: 6px 0 10px; }
        .upcoming-list { display: flex; flex-direction: column; gap: 6px; }
        .upcoming-row { display: flex; align-items: center; gap: 8px; padding: 8px 10px; background: var(--inset-bg); border-radius: 9px; font-size: 0.74rem; }
        .upcoming-name { flex: 1; min-width: 0; font-weight: 700; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .upcoming-j { flex: none; font-size: 0.64rem; color: var(--text-tertiary); }
        .upcoming-impact { flex: none; font-size: 0.68rem; font-weight: 800; color: var(--color-primary); font-family: var(--font-mono); }
        .upcoming-dday { flex: none; font-size: 0.64rem; font-weight: 800; color: var(--color-warning-ink, var(--color-warning)); }
        .vs-score { display: flex; align-items: center; justify-content: center; gap: 18px; margin: 12px 0 4px; padding: 10px 0; background: var(--inset-bg); border-radius: 12px; }
        .vs-score-side { display: flex; align-items: center; gap: 8px; }
        .vs-score-who { font-size: 0.78rem; font-weight: 700; color: var(--text-secondary); }
        .vs-score-num { font-size: 1.7rem; font-weight: 900; font-family: var(--font-mono); color: var(--color-ink); min-width: 22px; text-align: center; }
        .vs-score-colon { font-size: 1.3rem; font-weight: 900; color: var(--text-tertiary); }
        .vs-score-sub { text-align: center; font-size: 0.68rem; color: var(--text-secondary); margin: 6px 0 2px; line-height: 1.5; word-break: keep-all; }
        .vs-integrity { text-align: center; font-size: 0.68rem; color: var(--text-secondary); margin: 4px 0 2px; line-height: 1.5; word-break: keep-all; background: var(--inset-bg); border-radius: 8px; padding: 7px 10px; }
        .vs-integrity-note { color: var(--text-tertiary); }
        .vs-virtual { font-size: 0.56rem; font-weight: 800; color: var(--purple, var(--color-primary)); background: var(--purple-soft, var(--color-primary-soft)); padding: 1px 5px; border-radius: 4px; vertical-align: middle; }
        /* [A-6] AI vs 나 손익 비교 */
        .pl-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 10px; }
        .pl-cell { background: var(--inset-bg); border-radius: 10px; padding: 9px 11px; display: flex; flex-direction: column; gap: 3px; }
        .pl-cell.wide { grid-column: 1 / -1; }
        .pl-k { font-size: 0.64rem; color: var(--text-tertiary); font-weight: 700; }
        .pl-v { font-size: 0.9rem; font-weight: 800; font-family: var(--font-mono); }
        .pl-asof { font-size: 0.66rem; font-weight: 700; color: var(--color-ink-3); margin: 2px 0 4px; }
        .pl-foot { font-size: 0.64rem; color: var(--text-tertiary); line-height: 1.5; margin-top: 8px; word-break: keep-all; }
        .vs-def { font-size: 0.74rem; color: var(--text-secondary); line-height: 1.55; margin: 10px 0 4px; word-break: keep-all; }
        /* [FB-4 §4.1] 나 vs AI 일자별 */
        .vsday-list { display: flex; flex-direction: column; margin-top: 8px; }
        .vsday-row { display: flex; align-items: center; gap: 10px; padding: 9px 2px; border-bottom: 1px solid var(--color-line); }
        .vsday-row:last-child { border-bottom: none; }
        .vsday-d { flex: none; width: 44px; font-size: 0.78rem; font-weight: 800; color: var(--color-ink); font-variant-numeric: tabular-nums; }
        .vsday-cnt { flex: none; font-size: 0.74rem; font-weight: 700; color: var(--color-primary); }
        .vsday-tp { flex: 1; text-align: right; font-size: 0.74rem; font-weight: 600; color: var(--text-secondary); }
        .vsday-foot { font-size: 0.66rem; color: var(--text-tertiary); margin-top: 9px; line-height: 1.5; word-break: keep-all; }
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
        .chlog-trend { font-size: 0.76rem; color: var(--text-secondary); margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--border); line-height: 1.5; word-break: keep-all; }
        .chlog-trend.muted { color: var(--text-tertiary); }
        .chlog-trend b.up { color: var(--color-success); } .chlog-trend b.dn { color: var(--color-danger); }
        /* [A-2] AI 개선노트 3단(틀린 것→고친 것→효과) */
        .imp-list { display: flex; flex-direction: column; gap: 10px; }
        .imp-row { background: var(--inset-bg); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 11px 13px; display: flex; flex-direction: column; gap: 7px; }
        .imp-step { display: flex; gap: 8px; align-items: flex-start; }
        .imp-tag { flex-shrink: 0; font-size: 0.6rem; font-weight: 800; padding: 2px 8px; border-radius: 5px; line-height: 1.4; white-space: nowrap; min-width: 58px; text-align: center; }
        .imp-tag.wrong { color: var(--color-danger); background: color-mix(in srgb, var(--color-danger) 12%, transparent); }
        .imp-tag.fix { color: var(--color-primary); background: color-mix(in srgb, var(--color-primary) 12%, transparent); }
        .imp-tag.eff { color: var(--color-success); background: color-mix(in srgb, var(--color-success) 12%, transparent); }
        .imp-txt { font-size: 0.76rem; color: var(--text-secondary); line-height: 1.5; word-break: keep-all; }
        /* [§3-5 item3] AI 성적표 타일 */
        .scorecard { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 10px; }
        .sc-tile { background: var(--inset-bg); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 12px 13px; display: flex; flex-direction: column; gap: 3px; }
        .sc-k { font-size: 0.68rem; color: var(--text-secondary); font-weight: 600; }
        .sc-v { font-size: 1.25rem; font-weight: 800; font-family: var(--font-mono); line-height: 1.1; }
        .sc-sub { font-size: 0.64rem; color: var(--text-tertiary); }
        .sc-summary { font-size: 0.78rem; color: var(--text-secondary); line-height: 1.6; margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border); }
        .sc-warn { font-size: 0.7rem; color: var(--color-warning-ink, var(--color-warning)); background: var(--color-warning-soft); border-radius: 8px; padding: 8px 11px; line-height: 1.5; margin-top: 10px; word-break: keep-all; }
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

        /* [2026-08-05] '샀어요' 주식수 입력 시트 — window.prompt 대체(인앱브라우저 대응) */
        .sp-scrim { position: fixed; inset: 0; background: rgba(0,0,0,0.45); z-index: 9000; display: flex; align-items: flex-end; justify-content: center; }
        .sp { width: 100%; max-width: 480px; background: var(--card-bg); border-radius: 20px 20px 0 0; padding: 22px 18px calc(env(safe-area-inset-bottom, 0px) + 20px); box-shadow: 0 -4px 32px rgba(0,0,0,0.18); font-family: var(--font-body); color: var(--text-primary); }
        .sp-h { font-size: 1rem; font-weight: 800; margin-bottom: 6px; }
        .sp-sub { font-size: 0.76rem; color: var(--text-tertiary); line-height: 1.5; margin-bottom: 14px; word-break: keep-all; }
        .sp-warn { font-size: 0.85rem; color: var(--text-secondary); line-height: 1.6; margin-bottom: 16px; word-break: keep-all; }
        .sp-input { width: 100%; border: 1px solid var(--border); background: var(--inset-bg); border-radius: 12px; padding: 13px 14px; font-size: 1rem; font-family: var(--font-body); color: var(--text-primary); margin-bottom: 10px; }
        .sp-input:focus { outline: none; border-color: var(--color-primary); }
        .sp-err { font-size: 0.74rem; color: var(--color-danger); font-weight: 600; margin-bottom: 10px; }
        .sp-row2 { display: flex; gap: 8px; margin-top: 4px; }
        .sp-btn { flex: 1; border: none; border-radius: 12px; padding: 13px 0; font-size: 0.88rem; font-weight: 800; color: #fff; background: var(--color-primary); cursor: pointer; font-family: var(--font-body); }
        .sp-btn:disabled { opacity: 0.6; }
        .sp-btn.ghost { background: var(--inset-bg); color: var(--text-secondary); }
        .sp-btn.warn { background: var(--color-danger); }
      `}</style>
    </>
  );
}

export async function getStaticProps() {
  return { props: { latestReport: getLatestDailyReport() } };
}
