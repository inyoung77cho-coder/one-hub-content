// [N4] '오늘' — 4대 그래픽 타일: ①주식·나 vs AI(히어로) ②ETF·부동산 ③리포트 ④종합자산 할일.
//   설계 원칙: 텍스트 단락 대신 숫자·막대·배지로 한눈에. 나 vs AI를 첫 화면 최상단 히어로로 승격.
//   데이터는 전부 기존 소스: 원장(lib/ledger) · /api/pwa-dashboard · /api/pwa-pending ·
//   /api/pwa/re/feed · lib/verdictLedger(판단 기록) · /api/today/news. 새로 만든 저장소 없음.
import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/router";
import { getTrader, useTrader } from "../../lib/trader";
import { dedupBy } from "../../lib/useDedup";
import { getLedger as getAssetLedger } from "../../lib/ledger";
import HoldingsNews from "../../components/HoldingsNews";
import ReportTeaser from "../../components/ReportTeaser";
import ReExplore from "../../components/ReExplore";
import AlertSettingsCard from "../../components/AlertSettingsCard";
import { getStoryRegionOverride, REGIONS, getNewRegions, ackNewRegions } from "../../lib/storyRegion";
import { recordSnapshot as recordRegionSnapshot, getRegionDelta } from "../../lib/storyRegionHistory";
import { getHoldings as getEtfHoldings } from "../../lib/etfHoldings";
import { recommendEtfs } from "../../lib/etfRecommend";
import { getTargetClass, computeClassDrift, topDriftMessage } from "../../lib/targetClass"; // [S23 T-2] ETF 조치 근거 통일(자산군 목표)
import { taxFocusOf, currentMonth } from "../../lib/taxCalendar"; // [S23 T-7] 절세 팁을 달력에 연결(DAY% 회전 제거)
import { getTodayCadence } from "../../lib/todayCadence"; // [S23 T-6] 주간·월간·분기 훅
import { recordVisit } from "../../lib/visitLog"; // [S23 T-10] 방문일 계기판(스트릭 배지 아님)
import useSwipeTabs from "../../components/shared/useSwipeTabs"; // [S24-5] 페이지 내 좌우 탭 스와이프
import { briefingScript } from "../../lib/briefingScript"; // [S24-9] 오늘 브리핑 대본(화면과 같은 소스)
import BriefingSpeak from "../../components/BriefingSpeak"; // [S24-9] 한국어 읽어주기
import { deriveUrgency, deriveStance } from "../../components/shared/KisHoldingsCard"; // [S20-3] 조치 판정 규칙 재사용(복제 금지)
import { computeAiFreshness } from "../../lib/aiFreshness"; // [S20-3] AI 갱신 상태(AI 탭과 공유)
import { recordSnapshot as recordAssetSnapshot, getDelta as getAssetDelta, getHistory as getAssetHistory, getAssetSeries } from "../../lib/assetHistory"; // [S20-3/S23 T-4/S24-1] 총자산 전일 대비·곡선(단위 일관)
import Sparkline from "../../components/shared/Sparkline"; // [S23 T-4] 총자산 스파크라인(종합자산과 공용)
import { getSnapshots as getDuelSnapshots } from "../../lib/portfolioDuel"; // [S20-3] 대결 결과 배너 판정용
import { getTodayDecision, getLedger as getVerdictLedger } from "../../lib/verdictLedger"; // [S23 T-1/T-5] 판단 기록·재등장 판정
import { getVerdictScorecard } from "../../lib/verdictStats"; // [S24-8] 성적표 상시 진입 요약
import { recordDecisionWithPrice } from "../../lib/recordDecision"; // [S23 T-1] 가격 확보→기록(추천 카드와 공유)
import { cachedJson } from "../../lib/quoteCache"; // [S20-3] /api/pwa-ai-daily 중복 GET dedup
import TraderBadge from "../../components/shared/TraderBadge";
import BottomNav from "../../components/BottomNav";
import DataState from "../../components/DataState";
import LastUpdated from "../../components/LastUpdated";
import MarketStatusBadge from "../../components/MarketStatusBadge";
import RotatingPageTitle from "../../components/RotatingPageTitle";
import ShareButton from "../../components/ShareButton";
import FeedbackButton from "../../components/FeedbackButton";
import { getAnnouncements } from "../../lib/reports";

const CAT_KO = { global: "글로벌", macro: "거시", markets: "증시", realestate: "부동산", policy: "정책", affairs: "시사" };
// [사용자 지시] 오늘의 이야기 — 주식/부동산/ETF/기타 카드 구분. Comments.js 카테고리는 전체/주식/ETF/부동산이라
//   "전체"(미지정) 글은 여기서 "기타"로 보여준다.
const STORY_CATS = [["주식", "📈"], ["부동산", "🏠"], ["ETF", "📊"], ["기타", "💬"]];
const pctTxt = (v) => `${Number(v) >= 0 ? "+" : ""}${Number(v).toFixed(2)}%`;
const rePct = (v) => (v == null ? "-" : `${v > 0 ? "+" : ""}${Number(v).toFixed(1)}%`);
// [시황 브리핑] 텔레그램 "Today News"/"보유종목 관련 뉴스" 원문 텍스트를 카드용으로 최소 파싱.
//   구조화를 새로 만들지 않고 news_collector.py가 이미 만든 포맷 그대로 줄 단위로 나눈다.
//   원문 뉴스 제목이 스크래핑 단계에서 HTML 엔티티(&quot; 등)로 인코딩된 채 넘어오는 경우가 있어
//   같이 디코딩한다 — React는 일반 텍스트 렌더링에서 엔티티를 자동으로 풀어주지 않는다.
function decodeHtmlEntities(str) {
  if (!str) return str;
  return str
    .replace(/&quot;/g, "\"")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}
function parseThemedNews(msg) {
  if (!msg) return [];
  const sections = [];
  let cur = null;
  for (const raw of String(msg).split("\n")) {
    const line = raw.trim();
    if (!line || line === "Today News") continue;
    if (line.startsWith("[") && line.endsWith("]")) {
      cur = { theme: line.slice(1, -1), items: [] };
      sections.push(cur);
    } else if (line.startsWith("-") && cur) {
      cur.items.push(decodeHtmlEntities(line.replace(/^-+\s*/, "")));
    }
  }
  return sections;
}
function parsePortfolioNews(msg) {
  if (!msg) return [];
  return String(msg).split("\n").map((l) => l.trim())
    .filter((l) => l && l !== "[보유종목 관련 뉴스]")
    .map((l) => decodeHtmlEntities(l.replace(/^-+\s*/, "")));
}
// 백엔드가 positions를 문자열로 주는 경우가 있어 방어적으로 파싱
function parsePositions(dash) {
  let p = dash?.balance?.positions;
  if (typeof p === "string") { try { p = JSON.parse(p); } catch { p = null; } }
  return Array.isArray(p) ? p : [];
}

export default function TodayPage({ announcements = [] }) {
  const router = useRouter();
  const [trader] = useTrader();
  const [dash, setDash] = useState(null);
  const [pend, setPend] = useState(null);
  const [feed, setFeed] = useState(null);
  const [ledger, setLedger] = useState(null);
  const [myComplex, setMyComplex] = useState("");
  const [reMyProp, setReMyProp] = useState(null); // [이관] 오늘의 부동산 스크리너용 내 단지 상세(전체 객체)
  const [status, setStatus] = useState("loading");
  const [at, setAt] = useState(null);
  const [aiDaily, setAiDaily] = useState(null); // [S20-3] 오늘 vs 전일 AI 판단 diff(AI 탭과 동일 소스)
  const [assetDelta, setAssetDelta] = useState(null); // [S20-3] 총자산 전일 대비(lib/assetHistory)
  const [notis, setNotis] = useState([]); // [알림] 텔레그램/리포트 알림 피드
  const [opNotes, setOpNotes] = useState([]); // [알림] OneHub 신고가(spot_price)
  const [reBrief, setReBrief] = useState(null); // [사용자 지시] 내 부동산 vs 지역 대장단지 가격 비교(re/briefing 재사용)
  const reBriefLoadedRef = useRef(false); // [S21-1] 부동산 탭 진입 시 1회만 briefing 로드
  const [storyComments, setStoryComments] = useState([]); // [사용자 지시] 오늘의 이야기 — 카테고리별(주식/부동산/ETF/기타) 미리보기
  const [regionDelta, setRegionDelta] = useState(null); // [이야기 탭] 지역별 이야기 건수 증감(참석자 추적 불가 — 건수로 대체, 확인 완료)
  const [newRegions, setNewRegions] = useState([]); // [이야기 탭] REGIONS에 새로 추가된 동(로컬 "본 목록" 대비)
  const [news, setNews] = useState(null); // [뉴스 통합] 오늘의 뉴스 — 부모가 한 번 fetch 해 카테고리별로 나눠 쓴다
  const [brief, setBrief] = useState(null); // [시황 브리핑] 텔레그램 "ONE-HUB Market Brief"와 같은 스냅샷 — 대결 탭 카드용
  const [briefOpen, setBriefOpen] = useState(false); // [시황 브리핑] 전체 지표 더보기 토글
  const [newsBrief, setNewsBrief] = useState(null); // [시황 브리핑] 텔레그램 "Today News"/"보유종목 관련 뉴스" 원문 스냅샷
  const [newsOpen, setNewsOpen] = useState(false); // ETF·부동산 타일 뉴스 더보기
  // [2026-08-05] 뉴스 상세는 useState가 아니라 URL(?news=id)에서 파생 — history에 진짜 항목이
  //   쌓이므로 뒤로가기를 누르면 페이지를 벗어나지 않고 팝업만 닫히고 스크롤 위치가 그대로 남는다.
  //   (예전엔 순수 React state라 back을 누르면 "오늘" 페이지 자체를 벗어났다.)
  const newsDetail = router.query.news && Array.isArray(news)
    ? news.find((n) => String(n.id) === String(router.query.news)) || null
    : null;
  const openNewsDetail = (n) => {
    router.push({ pathname: router.pathname, query: { ...router.query, news: n.id } }, undefined, { shallow: true, scroll: false });
  };
  const closeNewsDetail = () => {
    if (router.query.news) router.back();
  };
  const [view, setView] = useState(0); // [OS-2] 0=자산 1=부동산 2=ETF 3=이야기
  // [S23 T-3] 화면을 URL(?v=)에 싣는다 — 공유·새로고침·딥링크 유지. 뉴스 모달(?news=)과 같은 쿼리에 공존.
  const V_NAMES = ["assets", "re", "etf", "story"];
  const vToIdx = (v) => { const i = V_NAMES.indexOf(String(v || "")); return i >= 0 ? i : 0; };
  useEffect(() => {
    if (!router.isReady) return; // [검증 교훈] isReady 전 query 는 빈값 → 딥링크 튕김 방지
    setView(vToIdx(router.query.v));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady, router.query.v]);
  const goView = (i) => {
    // [S24-5 함정6] 탭 전환은 router.replace — push 를 쓰면 뒤로가기를 여러 번 눌러야 페이지를 벗어난다.
    //   뉴스 모달(?news=)만 push 를 유지(openNewsDetail).
    setView(i);
    router.replace({ pathname: router.pathname, query: { ...router.query, v: V_NAMES[i] } }, undefined, { shallow: true, scroll: false });
  };
  const swipe = useSwipeTabs({ index: view, count: 4, onChange: goView });
  // [ETF] 오늘의 ETF — 주간 상승률 최고(국내/해외) 실데이터(movers). ETF 뷰 진입 시 1회 로드.
  const [etfMovers, setEtfMovers] = useState(null);
  useEffect(() => {
    if (view !== 2 || etfMovers != null) return;
    let alive = true;
    fetch(`/api/pwa/etf/movers?trader=${getTrader()}`).then((r) => r.json())
      .then((d) => { if (alive) setEtfMovers(d && !d.error ? d : {}); })
      .catch(() => { if (alive) setEtfMovers({}); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  const load = useCallback(() => {
    const tr = getTrader();
    setStatus((s) => (dash ? "stale" : "loading"));
    let myProp = null;
    try { myProp = JSON.parse(localStorage.getItem("onehub_re_my_property") || "null"); setMyComplex(myProp?.name || ""); setReMyProp(myProp || null); } catch (e) {}
    Promise.all([
      cachedJson(`/api/pwa-dashboard?trader=${tr}`), // [S21-5] 오늘/AI 탭 공유 URL → 중복 GET dedup
      fetch(`/api/pwa-pending?trader=${tr}`).then((r) => r.json()).catch(() => null),
      getAssetLedger(tr).catch(() => null),
    ]).then(([d, p, L]) => {
      setDash(d); setPend(p); setLedger(L); setAt(new Date()); // [S23 T-8] re/feed 는 부동산 화면 지연 로드로 이동
      setStatus(d || L ? "ok" : "error");
      // [S20-3] 총자산이 유효할 때만 오늘치 스냅샷 적립 후 전일 대비 계산(assets.js 와 동일 규칙).
      if (L && L.ok && L.total_uk != null) { recordAssetSnapshot(tr, L); setAssetDelta(getAssetDelta(tr)); }
    });
    // [S20-3] 상단 3행 요약 중 'AI 변화 한 줄' — AI 탭(index.js)과 같은 URL이라 캐시를 공유한다.
    cachedJson(`/api/pwa-ai-daily?trader=${tr}`).then((d) => { if (d && d.ok) setAiDaily(d); }).catch(() => {});
    fetch(`/api/notifications?trader=${tr}`).then((r) => r.json())
      .then((n) => { if (n?.ok && Array.isArray(n.items)) setNotis(dedupBy(n.items, (x) => x.id ?? `${x.title || ""}|${x.body || ""}|${x.sent_at || x.created_at || ""}`)); }).catch(() => {});
    cachedJson(`/api/today/news`) // [S21-5] HoldingsNews 와 같은 URL → 중복 GET dedup
      .then((d) => { setNews(Array.isArray(d?.items) ? d.items : []); }).catch(() => setNews([]));
    fetch(`/api/pwa-market-brief`).then((r) => r.json())
      .then((d) => { if (d?.ok && d.brief) setBrief(d.brief); }).catch(() => {});
    fetch(`/api/pwa-today-news-brief`).then((r) => r.json())
      .then((d) => { if (d?.ok && d.brief) setNewsBrief(d.brief); }).catch(() => {});
    // [S23 T-8] re/feed·re-spot(부동산)·comments·story-region-stats(이야기)는 기본 화면에서 안 쓰이므로
    //   각 화면 활성 시(초기 ?v= 진입 포함) 지연 로드한다(loadReData·loadStoryData). 여기선 로컬 계산만.
    setNewRegions(getNewRegions());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dash]);

  // [S23 T-8] 부동산 화면 데이터 — re/feed(대장 대비), re-spot(운영자 신고가). 화면 활성 시 1회.
  const reDataLoadedRef = useRef(false);
  const loadReData = useCallback(() => {
    fetch(`/api/pwa/re/feed`).then((r) => r.json()).then((f) => setFeed(f)).catch(() => {});
    let myProp = null;
    try { myProp = JSON.parse(localStorage.getItem("onehub_re_my_property") || "null"); } catch (e) {}
    if (myProp?.name) fetch(`/api/input/re-spot?complex_name=${encodeURIComponent(myProp.name)}`).then((r) => r.json())
      .then((s) => { if (s?.ok && Array.isArray(s.items)) setOpNotes(s.items); }).catch(() => {});
  }, []);
  // [S23 T-8] 이야기 화면 데이터 — comments, story-region-stats. 화면 활성 시 1회.
  const storyLoadedRef = useRef(false);
  const loadStoryData = useCallback(() => {
    const region = getStoryRegionOverride() || Object.values(REGIONS)[0][0];
    fetch(`/api/comments?date=${encodeURIComponent(region)}`).then((r) => r.json())
      .then((d) => { if (Array.isArray(d?.comments)) setStoryComments(d.comments); }).catch(() => {});
    fetch(`/api/story-region-stats`).then((r) => r.json())
      .then((d) => { if (!d?.ok || !d.counts) return; recordRegionSnapshot(d.counts); setRegionDelta(getRegionDelta()); }).catch(() => {});
  }, []);

  useEffect(() => {
    try { recordVisit(getTrader()); } catch (e) {} // [S23 T-10] 오늘 접속 기록(주간 리포트 계기판)
    load();
    const on = () => { reBriefLoadedRef.current = false; reDataLoadedRef.current = false; storyLoadedRef.current = false; load(); }; // [S21-1/S23 T-8] 자산 변경 시 지연 데이터도 재로드 허용
    window.addEventListener("onehub-trader-change", on);
    window.addEventListener("onehub-assets-change", on);
    return () => {
      window.removeEventListener("onehub-trader-change", on);
      window.removeEventListener("onehub-assets-change", on);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // [S21-1] 부동산 브리핑 지연 로드 — 부동산 탭(view===1) 진입 시 1회만 호출한다.
  //   내 단지 법정동으로 region 을 잡아 briefing, 그 값으로 reBrief/reHeadline/myLeaderGapPct 채움.
  const loadReBrief = useCallback(() => {
    let myProp = null;
    try { myProp = JSON.parse(localStorage.getItem("onehub_re_my_property") || "null"); } catch (e) {}
    const loadBriefing = (region) =>
      fetch(`/api/pwa/re/briefing${region ? `?region=${encodeURIComponent(region)}` : ""}`).then((r) => r.json())
        .then((b) => { if (b && !b.error) setReBrief(b); }).catch(() => {});
    if (myProp?.name) {
      fetch(`/api/pwa/re/complexAreas?complex=${encodeURIComponent(myProp.name)}`).then((r) => r.json())
        .then((d) => loadBriefing(d?.법정동 || null))
        .catch(() => loadBriefing(null));
    } else {
      loadBriefing(null);
    }
  }, []);
  useEffect(() => {
    // [S23 T-8] 조건은 '탭을 눌렀을 때'가 아니라 '해당 화면이 활성일 때' — ?v=re/story 직접 진입도 포함.
    if (view === 1) {
      if (!reBriefLoadedRef.current) { reBriefLoadedRef.current = true; loadReBrief(); }
      if (!reDataLoadedRef.current) { reDataLoadedRef.current = true; loadReData(); }
    }
    if (view === 3 && !storyLoadedRef.current) { storyLoadedRef.current = true; loadStoryData(); }
  }, [view, loadReBrief, loadReData, loadStoryData]);

  const dismissNewRegions = useCallback((e) => {
    e.stopPropagation();
    ackNewRegions();
    setNewRegions([]);
  }, []);

  const positions = parsePositions(dash);
  const pendItems = pend?.ok ? (pend.items ?? []) : [];

  // ── 결정 대기: 승인 대기 + 손절선 임박(주식 · 나 vs AI 도메인의 액션 항목)
  const nearStop = positions.filter((p) => {
    const sl = Number(p.stop_loss) || 0, cur = Number(p.current_price) || 0;
    return sl > 0 && cur > 0 && cur <= sl * 1.02;
  });

  const bd = ledger?.breakdown || {};
  const ukTxt = (v) => (v == null || !Number.isFinite(Number(v)) ? null : `${Number(v).toFixed(1)}억`);

  // [사용자 지시] 내 부동산 가격 평균 변동 — 이미 받아오던 feed(실거래 피드)에서 내 단지만 추출.
  //   평형별 상세 비교는 이 페이지의 데이터로는 어려워(부동산 페이지 전용 API 필요) 링크로 안내.
  const myFeedEntry = myComplex ? (feed?.feed || []).find((f) => f.단지명 === myComplex) || null : null;
  const myLeaderGapPct = myFeedEntry?.거래금액_억 && reBrief?.leader_price
    ? (Number(myFeedEntry.거래금액_억) / Number(reBrief.leader_price)) * 100
    : null;

  // ── 뉴스: 카테고리로 뷰 배분(대결=증시, 부동산=부동산, ETF=글로벌/거시/정책)
  const allNews = news || [];
  const stockNews = allNews.filter((n) => n.category === "markets").slice(0, 6);
  const realestateNews = allNews.filter((n) => n.category === "realestate").slice(0, 8);
  const etfNews = allNews.filter((n) => ["global", "macro", "policy"].includes(n.category)).slice(0, 8);

  // ── 오늘(KST) 날짜 문자열 — 아래 헤드라인 계산과 criticalNotis 필터 둘 다에서 씀.
  const kd = new Date(Date.now() + 9 * 3600 * 1000);
  const todayStr = `${kd.getUTCFullYear()}-${String(kd.getUTCMonth() + 1).padStart(2, "0")}-${String(kd.getUTCDate()).padStart(2, "0")}`;

  // ══ [S20-3] 오늘 탭 상단 3행 요약 — ①총자산 ②오늘 조치할 종목 ③AI 변화 한 줄 ══
  //   설계 목적(사용자 정의): "자산의 처분 유무를 확인하고 현재 자산을 이해하는 관문."
  // ── 행1: 총자산 전일 대비(assets.js 와 같은 표기 규칙을 로컬에 소량 복제 — import 금지 지시)
  const dvUk = (v) => (v == null ? null : `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(2)}억`);
  const dCls = (v) => (v == null ? "" : v > 0.004 ? "up" : v < -0.004 ? "dn" : "flat");
  const totalUk = ledger?.total_uk != null && Number.isFinite(Number(ledger.total_uk)) ? Number(ledger.total_uk) : null;
  // [S23 T-2] 운용자산 위계 — assets.js(S22-7)와 같은 규칙. 계산은 lib/ledger.js 필드를 읽기만 한다(다시 빼지 않음).
  const residenceUk = bd.residence_uk != null ? Number(bd.residence_uk) : null;
  const hasResidence = residenceUk != null && residenceUk > 0.005;
  const operatingUk = bd.operating_uk != null ? Number(bd.operating_uk) : totalUk;
  const headUk = hasResidence ? operatingUk : totalUk;               // 1행 큰 숫자
  // [S24-1] 전일 대비 — 운용 델타 우선, 없으면(구 스냅샷) 총자산 델타로 폴백하되 라벨에 기준을 밝힌다.
  const headDelta = hasResidence ? (assetDelta?.operating ?? assetDelta?.total ?? null) : (assetDelta?.total ?? null);
  const headDeltaBasis = (hasResidence && assetDelta?.operating == null && headDelta != null) ? " · 총자산 기준" : "";
  const realtyDelta = assetDelta?.residence ?? assetDelta?.realty ?? null; // 부동산(실거주) 시세 갱신 — 별도 줄
  // ── 행2: 오늘 조치할 종목 — 목표가 도달/손절 근접만(deriveUrgency rank<=2), 최대 3개
  const actionStocks = positions
    .filter((p) => deriveUrgency(p).rank <= 2)
    .sort((a, b) => deriveUrgency(a).rank - deriveUrgency(b).rank)
    .slice(0, 3);
  // [S23 T-3] 세그먼트 배지 — 자산=조치 종목, 부동산=신고가(지연 로드 후), ETF=배지 없음, 이야기=새 소식. 0이면 렌더 안 함.
  const segBadges = [actionStocks.length, opNotes.length, 0, (newRegions?.length || 0)];
  // 조치 근거 1줄 — KisHoldingsCard 와 동일한 목표가 잔여/손절 근접 계산.
  const actionReason = (p) => {
    const cur = Number(p.current_price) || 0, tgt = Number(p.target) || 0, sl = Number(p.stop_loss) || 0;
    const u = deriveUrgency(p);
    if (u.rank === 0 && sl > 0 && cur > 0) return `손절선까지 ${((sl / cur - 1) * 100).toFixed(1)}%`;
    if (u.rank === 1 && tgt > 0 && cur > 0) return `목표가까지 +${((tgt / cur - 1) * 100).toFixed(1)}%`;
    if (p.change_1d != null) return `당일 ${Number(p.change_1d) >= 0 ? "+" : ""}${Number(p.change_1d)}% 급변`;
    return deriveStance(p).reason;
  };
  // 조치가 없을 때도 근거와 함께 — '손절선 최근접 −X.X%'(KisHoldingsCard toStop 과 동일 부호).
  const toStops = positions
    .map((p) => { const sl = Number(p.stop_loss) || 0, cur = Number(p.current_price) || 0; return sl > 0 && cur > 0 ? (sl / cur - 1) * 100 : null; })
    .filter((x) => x != null);
  const nearestToStop = toStops.length ? Math.max(...toStops) : null;
  // 자산군 확장 — ETF 리밸런싱 이탈(보유가 있고 규칙기반 갭이 잡힐 때만), 부동산 대장 대비 포지션.
  const etfHoldingsCnt = getEtfHoldings(trader).length;
  // [S23 T-2 #4] ETF 조치 근거를 assets.js '오늘의 한 수'와 같은 소스로 통일 — 자산군 목표(onehub_target_class)
  //   이탈. 두 화면이 다른 목표(ETF 내부배분 vs 자산군배분)로 다른 말을 하던 것을 하나로.
  const opClass = {
    stock: bd.stock_uk != null ? Number(bd.stock_uk) : 0,
    etf: bd.etf_uk != null ? Number(bd.etf_uk) : 0,
    realestate: Math.max(0, (bd.realestate_uk != null ? Number(bd.realestate_uk) : 0) - (residenceUk || 0)),
    cash: bd.cash_uk != null ? Number(bd.cash_uk) : 0,
  };
  let etfRebalMsg = null;
  try {
    const classMsg = topDriftMessage(computeClassDrift(opClass, getTargetClass()));
    if (classMsg && classMsg.tone === "warn") etfRebalMsg = classMsg.text;
  } catch (e) {}
  // [S23 T-6] 주간·월간·분기 훅 — 발동한 날에만 카드 1장. 기존 소스만 사용, 데이터 없으면 빈 배열.
  const cadenceHooks = (() => { try { return getTodayCadence({ trader, opClass }); } catch (e) { return []; } })();
  // ── 행3: AI 변화 한 줄(AI 탭과 동일 규칙 — lib/aiFreshness)
  const aiFreshness = computeAiFreshness(aiDaily, dash);
  // ── 대결 결과 배너 — 오늘 스냅샷이 찍힌 날에만 노출(없으면 렌더 안 함).
  const duelSnaps = getDuelSnapshots(trader);
  const duelResultToday = duelSnaps.length > 0 && duelSnaps[duelSnaps.length - 1].date === todayStr;
  // ── '봇이 보낸 뉴스' 정직한 날짜 — 배치 날짜가 오늘이 아니면 '오늘 신규 없음 · 최근 {날짜}'.
  const botNewsStale = newsBrief?.date && newsBrief.date !== todayStr;

  // [사용자 지시] 대결 탭 이외 탭들도 맨 위 카드가 비어 보이지 않도록 — 그날 가장 중요한 항목 한 줄
  //   요약. 우선순위 폭포: 내 보유 관련 실제 변동 → 그 외 실제 이벤트(신고가·저평가) → 배경 정보(지역
  //   시황) → 마지막 안내 문구. "내 것"이 있으면 항상 최우선(가장 개인적으로 의미 있는 정보이므로).
  const reHeadline = myFeedEntry?.변동률 != null
    ? `🏠 ${myComplex} 최근 실거래 ${myFeedEntry.거래금액_억}억 · 직전 대비 ${rePct(myFeedEntry.변동률)}`
    : opNotes.length > 0
    ? `🏢 ${opNotes[0].complex_name}${opNotes[0].price_manwon ? ` ${(opNotes[0].price_manwon / 10000).toFixed(2)}억` : ""} 신고가 발생`
    : reBrief?.under?.length > 0
    ? `📉 ${reBrief.under[0].단지명} 지역 대비 +${Number(reBrief.under[0].gap).toFixed(1)}% 저평가`
    : reBrief?.leader
    ? `🏠 지역 대장 ${reBrief.leader}${reBrief.leader_price != null ? ` ${Number(reBrief.leader_price).toFixed(2)}억` : ""} · 분기 ${rePct(reBrief.chg_q)}`
    : "오늘의 부동산 뉴스와 신고가를 아래에서 확인하세요.";
  // [사용자 지시] ETF 헤드라인 — 보유 중인 ETF 티커가 언급된 뉴스를 최우선으로.
  const myEtfTickers = getEtfHoldings(trader).map((h) => String(h.ticker || "").trim()).filter((t) => t.length >= 2);
  const myEtfNews = myEtfTickers.length > 0
    ? allNews.find((n) => myEtfTickers.some((tk) => `${n.headline || ""} ${n.summary_md || ""}`.includes(tk)))
    : null;
  // [사용자 지시] global/macro/policy로 분류된 뉴스엔 ETF와 무관한 지정학·시사 기사가 많이 섞여
  //   있어, 그대로 1순위 대체로 쓰면 "ETF 관련"이라 보기 어려운 헤드라인이 뜬다. 지수·환율·금리 등
  //   ETF 가격에 실제로 연동되는 키워드가 있는 것만 2순위로 인정하고, 그마저 없으면 평가액(실데이터)
  //   기반 안내로 대체 — 무관한 뉴스를 "ETF 정보"인 것처럼 보여주지 않는다.
  const ETF_KW = /코스피|코스닥|나스닥|S&P|다우|지수|금리|환율|달러|연준|Fed|금값|국채|증시/i;
  const etfRelNews = etfNews.find((n) => ETF_KW.test(`${n.headline || ""} ${n.summary_md || ""}`));
  const etfHeadline = myEtfNews
    ? `📌 보유 ETF 관련 · ${myEtfNews.headline}`
    : etfRelNews
    ? `📰 ${etfRelNews.headline}`
    : ukTxt(bd.etf_uk)
    ? `📊 ETF 평가 ${ukTxt(bd.etf_uk)} · 오늘은 보유 ETF 관련 특이 뉴스가 없어요.`
    : "오늘은 특별한 ETF 관련 이슈가 없어요 — 평소 배분을 유지하세요.";
  const storySorted = [...storyComments].sort((a, b) => (b.ts || 0) - (a.ts || 0));
  // ts는 클라 시각(ms) — KST 자정 이후분만 "오늘"로 센다(todayStr은 위에서 이미 계산).
  const isToday = (c) => {
    const kd2 = new Date((c.ts || 0) + 9 * 3600 * 1000);
    return `${kd2.getUTCFullYear()}-${String(kd2.getUTCMonth() + 1).padStart(2, "0")}-${String(kd2.getUTCDate()).padStart(2, "0")}` === todayStr;
  };
  const storyTodayList = storySorted.filter(isToday);
  // [사용자 지시] "가장 중요하거나 재미있는" 댓글 — 좋아요 등 참여 데이터가 없어 가장 가까운 대리
  //   지표로 "오늘 중 가장 긴(내용이 실린) 글"을 쓴다. 오늘 글이 없으면 최근 글로 대체.
  const storyPick = storyTodayList.length > 0
    ? [...storyTodayList].sort((a, b) => String(b.text || "").length - String(a.text || "").length)[0]
    : storySorted[0] || null;
  const storyHeadline = storyPick
    ? storyTodayList.length > 0
      ? `💬 오늘 ${storyTodayList.length}개의 새 이야기 · "${String(storyPick.text || "").slice(0, 28)}${String(storyPick.text || "").length > 28 ? "…" : ""}"`
      : `💬 최근 이야기 "${String(storyPick.text || "").slice(0, 28)}${String(storyPick.text || "").length > 28 ? "…" : ""}"`
    : "아직 등록된 동네 이야기가 없어요 — 첫 이야기를 남겨보세요.";

  // ── 오늘 중요 알림(매매·손절·서킷 등) — 히어로에 접어 넣는다. OneHub 신고가·루틴 알림은 제외.
  const RT = /오늘 해야 하는 것|전략 성과|최근 30일|Report|리포트|브리핑|Morning|Evening|Started|Status/i;
  const IMP = /매수|매도|체결|손절|익절|승인|신호|차단|자율|서킷|circuit|오류|error|급등|급락|주문|대결|승부|채점|OPEN|CLOSED/i;
  const criticalNotis = notis.filter((n) => {
    const ts = String(n.sent_at || n.created_at || "");
    const txt = `${n.title || ""} ${n.noti_type || ""} ${n.body || ""}`;
    const isCrit = /critical|important/i.test(n.noti_type || "");
    const isRoutine = RT.test(n.title || "");
    return ts.startsWith(todayStr) && (isCrit || IMP.test(txt)) && !isRoutine;
  }).slice(0, 3);

  // ── [사용자 지시] "오늘의 대결" 탭 카드3 — 주식 관련 할일 체크리스트(손절임박·AI매수제안·중요알림).
  //   체크 상태는 오늘 날짜(todayStr) 키로 저장 — 자정 넘어가면 다른 키가 되어 자동 초기화된다.
  //   (체크는 "확인함" 표시일 뿐, 실제 포트폴리오 위험이 해소된 게 아니므로 매일 새로 보여줘야 안전)
  // [S23 T-1/T-5] '할 일' = 판단을 요구하는 주식 항목만. 각 행에서 그 자리에서 매도/보유/관망을 기록한다.
  //   손절 임박·승인 대기가 판단 대상. 뉴스는 '읽을 거리'로 분리(아래), 알림은 정보 행으로 남긴다.
  const RETRIGGER_DROP_PCT = -4; // 어제 판단 이후 이만큼 더 빠지면 '판단 재검토'로 다시 올린다(하드코딩 상수 단일화)
  const stockActionable = [
    ...nearStop.slice(0, 3).map((p, i) => {
      const sl = Number(p.stop_loss) || 0;
      const cur = Number(p.current_price) || 0;
      const breached = sl > 0 && cur > 0 && cur < sl;
      const distPct = sl > 0 && cur > 0 ? (cur / sl - 1) * 100 : null;
      return {
        kind: "stock", code: p.code, name: p.name, entry: cur > 0 ? cur : null,
        title: `${p.name} ${pctTxt(p.pnl_rate)}`,
        sub: breached ? `손절선 ${sl.toLocaleString()}원 이탈 — 매도 검토 필요` : (distPct != null ? `손절선까지 ${Math.abs(distPct).toFixed(1)}% 남음` : "손절 근접"),
      };
    }),
    ...pendItems.slice(0, 3).map((p) => ({
      kind: "stock", code: p.code, name: p.name || p.stock || p.code, entry: null,
      title: p.name || p.stock || p.code,
      sub: p.reason || "AI 매수 제안 — 매수/관망 판단",
    })),
  ];
  // 오늘 이미 판단한 종목은 목록에서 제외(getTodayDecision).
  const notDecidedTodos = stockActionable.filter((t) => !t.code || !getTodayDecision(t.code, trader));
  // 어제 판단 후 임계 이상 추가 하락한 종목은 '판단 재검토'로 다시 올린다(원장 entry 대비 현재가). 다른 앱이 못 하는 화면.
  const recheckTodos = (() => {
    try {
      const led = getVerdictLedger(trader) || [];
      const byCode = {};
      led.forEach((e) => { if (e.code && (!byCode[e.code] || e.ts > byCode[e.code].ts)) byCode[e.code] = e; });
      const out = [];
      positions.forEach((p) => {
        const prev = byCode[p.code];
        if (!prev || !(Number(prev.entry) > 0) || getTodayDecision(p.code, trader)) return;
        const cur = Number(p.current_price) || 0;
        if (!(cur > 0)) return;
        const chg = (cur / Number(prev.entry) - 1) * 100;
        if (chg <= RETRIGGER_DROP_PCT) out.push({
          kind: "stock", code: p.code, name: p.name, entry: cur, recheck: true,
          title: `${p.name} 판단 재검토`,
          sub: `${prev.decision === "take" ? "보유" : "관망"} 판단 · 이후 ${chg.toFixed(1)}% 추가 하락`,
        });
      });
      return out;
    } catch (e) { return []; }
  })();
  const todoStock = [...notDecidedTodos, ...recheckTodos].filter((t, i, arr) => arr.findIndex((x) => x.code && x.code === t.code) === i);
  const todoNoti = criticalNotis.map((n, i) => ({ kind: "noti", key: `noti-${n.id ?? i}`, title: n.title || n.message || "알림" }));

  // [S23 T-1] 이번 세션 즉시 피드백('✓ 기록됨 · HH:MM')·인라인 오류(alert 금지).
  const [recorded, setRecorded] = useState({}); // code → { decision, at }
  const [decErr, setDecErr] = useState({});     // code → 메시지
  const [readOpen, setReadOpen] = useState(false); // [S24-6] 읽을 거리(뉴스 3장 통합) 기본 접힘
  // choice: 'sell'|'hold'|'pass'. 원장 스키마는 take/pass 2값 — 보유=take, 매도·관망=pass(둘 다 미보유,
  //   하락하면 정답으로 채점). 눌린 라벨은 UI 피드백용으로 따로 보관한다.
  const recordTodo = async (item, choice) => {
    if (!item.code) return;
    const decision = choice === "hold" ? "take" : "pass";
    setDecErr((m) => { const n = { ...m }; delete n[item.code]; return n; });
    try {
      await recordDecisionWithPrice({ code: item.code, name: item.name, decision, trader, source: "today", priceHint: item.entry });
      const now = new Date();
      setRecorded((m) => ({ ...m, [item.code]: { label: choice, at: `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}` } }));
    } catch (e) {
      setDecErr((m) => ({ ...m, [item.code]: "기록 실패 — 잠시 후 다시 시도해 주세요" }));
    }
  };
  const recordedCount = Object.keys(recorded).length;
  // [S23 T-1] 비판단 행(부동산 관심단지·이야기)용 '확인함' 토글 — 세션 전용(onehub_today_check localStorage 제거:
  //   날짜별 키가 무한 누적되고 정리 코드가 없던 문제 해소). 판단 원장과 무관한 단순 표시.
  const [checked, setChecked] = useState(() => new Set());
  const toggleCheck = (key) => setChecked((prev) => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  // [S23 T-5] 할 일 0건이 '좋은 상태'임을 근거와 함께 말한다 — 손절선 최근접 거리(%).
  const nearestStopPct = (() => {
    let best = null;
    positions.forEach((p) => { const sl = Number(p.stop_loss) || 0; const cur = Number(p.current_price) || 0; if (sl > 0 && cur > 0) { const d = (cur / sl - 1) * 100; if (best == null || d < best) best = d; } });
    return best;
  })();
  // [S24-7] 조치가 없어도 매일 바뀌는 진짜 콘텐츠 = 내 과거 판단의 경과. 최근 판단 3건의 이후 수익률.
  const priceByCode = (() => { const m = {}; positions.forEach((p) => { if (p.code) m[String(p.code)] = Number(p.current_price) || 0; }); return m; })();
  const verdictProgress = (() => {
    let led = [];
    try { led = getVerdictLedger(trader) || []; } catch (e) {}
    return led
      .filter((e) => e.code && Number(e.entry) > 0)
      .sort((a, b) => (b.ts || 0) - (a.ts || 0))
      .slice(0, 3)
      .map((e) => {
        const cur = priceByCode[String(e.code)] || null;
        const ret = cur > 0 ? (cur / Number(e.entry) - 1) * 100 : null;
        const days = Math.max(0, Math.floor((Date.now() - (e.ts || Date.now())) / 86400000));
        const mature = days >= 3;
        const correct = ret == null ? null : (e.decision === "pass" ? ret < 0 : ret >= 0);
        return { code: e.code, name: e.name || e.code, decision: e.decision, ret, days, mature, correct, backfilled: !!e.entry_backfilled };
      });
  })();
  // [S24-7] 판단 기록이 아예 없을 때 — 손절선 최근접 3종목(관망 버튼용).
  const observeStocks = [...positions]
    .filter((p) => p.code && Number(p.current_price) > 0 && !getTodayDecision(p.code, trader))
    .map((p) => { const sl = Number(p.stop_loss) || 0; const cur = Number(p.current_price) || 0; return { p, dist: sl > 0 ? (cur / sl - 1) * 100 : 999 }; })
    .sort((a, b) => a.dist - b.dist)
    .slice(0, 3)
    .map((x) => ({ code: x.p.code, name: x.p.name, entry: Number(x.p.current_price) || null, dist: x.dist }));
  // [S24-9] 오늘 브리핑 대본 — 화면과 같은 값(운용자산·조치·판단 경과)으로. S24-1 이후라 숫자 정합.
  const briefScript = (() => {
    try {
      const d = new Date();
      return briefingScript({
        dateLabel: `${d.getMonth() + 1}월 ${d.getDate()}일`,
        headUk, hasResidence, deltaUk: headDelta,
        todoCount: todoStock.length,
        positionCount: positions.length,
        progress: verdictProgress,
        aiLine: aiFreshness && typeof aiFreshness.line === "string" ? aiFreshness.line : null,
      });
    } catch (e) { return ""; }
  })();

  return (
    <div className="td" onTouchStart={swipe.onTouchStart} onTouchMove={swipe.onTouchMove} onTouchEnd={swipe.onTouchEnd}>
      {/* [사용자 지시] 상위 메뉴는 고정하고 그 아래 내용만 스크롤 */}
      <div className="sticky-hdr">
        <header className="td-hd">
          <button className="td-logo" onClick={() => router.push("/pwa/today")} aria-label="오늘">ONE<span className="td-dot">·</span>HUB</button>
          <div className="td-ic">
            <TraderBadge />
            <button className="td-search" onClick={() => router.push("/pwa?tab=analyze")} aria-label="AI 종목 검색">🔍</button>
            <FeedbackButton variant="icon" />
            <button className="td-search" onClick={() => router.push("/pwa/settings")} aria-label="설정">⚙️</button>
          </div>
        </header>

        {/* [S23 T-3] 4칸 세그먼트 탭 — 네 화면이 다 보이고, 현재 위치를 알고, 바로 오간다. URL(?v=)에 실린다. */}
        <div className="td-titlewrap">
          <div className="td-seg" role="tablist" aria-label="오늘 화면">
            {["자산", "부동산", "ETF", "이야기"].map((label, i) => (
              <button key={i} role="tab" aria-selected={view === i} className={`td-seg-b ${view === i ? "on" : ""}`} onClick={() => goView(i)}>
                {label}
                {segBadges[i] > 0 && <span className="td-seg-badge">{segBadges[i]}</span>}
              </button>
            ))}
          </div>
        </div>
      </div>
      {/* [사용자 지시] KRX/NXT 장운영 배지는 "오늘의 대결"(주식) 탭에서만 — 부동산/ETF/이야기엔 불필요 */}
      <div className="td-market">{view === 0 && <MarketStatusBadge />}{at && <span className="td-fresh3"><LastUpdated timestamp={at} onRefresh={load} /></span>}</div>

      <DataState status={status} hasData={!!dash || !!ledger} onRetry={load} skeletonLines={4} skeletonBlock>

        {/* ══ "오늘의 대결" — 카드1(대결) · 카드2(주식 뉴스) · 카드3(주식 할일) 3장으로 통일 ══ */}
        {view === 0 && (<div className="td-v0">
        {/* [S24-6] 화면 위계 — flex order 로 재배치(JSX 이동 없이): ①요약 ②판단 ③주기훅 ④읽을거리. */}
        {/* [S23 T-6] 주기 훅 — 발동한 날에만(월/월초/분기초/11월) 카드 1장. 매일은 안 뜬다. */}
        {cadenceHooks.length > 0 && (
          <section className="card td-cadence" style={{ order: 3 }}>
            {cadenceHooks.map((h) => (
              <button type="button" className="tc-row" key={h.key} onClick={() => router.push(h.href)}>
                <span className="tc-ic">{h.icon}</span>
                <span className="tc-body"><b className="tc-t">{h.title}</b><span className="tc-s">{h.text}</span></span>
                <span className="tc-arrow">›</span>
              </button>
            ))}
          </section>
        )}
        {/* [S20-3] 카드0 — 오늘 1화면 요약 3행: ①총자산 ②오늘 조치할 종목 ③AI 변화. 최상단 고정. */}
        <section className="card td-sum" style={{ order: 1 }}>
          {/* 행1 — [S23 T-2] 운용자산(실거주 제외) + 운용 전일 대비 + 마지막 갱신. 실거주 없으면 총자산. */}
          <div className="tds-row tds-asset">
            <span className="tds-k">{hasResidence ? "운용자산" : "총자산"}</span>
            {headUk != null ? (
              <b className="tds-total">{headUk.toFixed(2)}억</b>
            ) : (
              <b className="tds-total tds-muted">불러오는 중…</b>
            )}
            {headDelta != null ? (
              <span className={`tds-dchip ${dCls(headDelta)}`}>{headDelta >= 0 ? "▲" : "▼"} {dvUk(headDelta)} <i>{assetDelta?.days > 1 ? `${assetDelta.days}일 전 대비` : "어제 대비"}{headDeltaBasis}</i></span>
            ) : headUk != null ? (
              <span className="tds-dnew">오늘부터 기록 — 내일부터 전일 대비 표시</span>
            ) : null}
            {/* [S24-1] 30일 곡선 — 단위 일관 시계열(operating/total 혼합 금지). 2건 미만이면 '기록 중 N일째'. */}
            {(() => {
              const s = getAssetSeries(trader, hasResidence).slice(-30);
              if (s.length >= 2) return <Sparkline data={s} className="tds-spark" />;
              const n = getAssetHistory(trader).length;
              return n >= 1 ? <span className="tds-dnew">기록 중 · {n}일째</span> : null;
            })()}
            {at && <span className="tds-fresh"><LastUpdated timestamp={at} onRefresh={load} /></span>}
          </div>
          {/* [S24-9] 오늘 요약 한국어로 들려주기 — 출퇴근·운전 중. 버튼 탭에서만 재생(iOS), MediaSession. */}
          {briefScript && (
            <div className="tds-speakrow">
              <BriefingSpeak script={briefScript} />
              {/* [S25-10] 각 페이지를 통합한 하루 한 클립 */}
              <button type="button" className="tds-cliplink" onClick={() => router.push("/pwa/clip")}>🎧 오늘 브리핑 전체 듣기 →</button>
            </div>
          )}
          {/* [S23 T-2] 총자산·실거주는 작은 줄로(assets.js 와 같은 문구·기호). 시세 갱신은 판단 성과와 분리. */}
          {hasResidence && (
            <div className="tds-subtotals">
              <span>총자산 {totalUk != null ? totalUk.toFixed(2) : "-"}억</span>
              <span>🔑 실거주 {residenceUk.toFixed(2)}억 · 못 파는 자산</span>
              {realtyDelta != null && Math.abs(realtyDelta) > 0.004 && (
                <span className="tds-realty-upd">실거래 반영 · 부동산 {realtyDelta >= 0 ? "+" : "−"}{Math.abs(realtyDelta).toFixed(2)}억</span>
              )}
            </div>
          )}

          {/* 행2 — 오늘 조치할 종목(목표가 도달/손절 근접) */}
          <div className="tds-row tds-act">
            <span className="tds-k">오늘 조치</span>
            <div className="tds-actbody">
              {actionStocks.length > 0 ? (
                actionStocks.map((p, i) => {
                  const u = deriveUrgency(p), st = deriveStance(p);
                  return (
                    <button type="button" className="tds-actrow" key={p.code || i} onClick={() => router.push("/pwa?tab=portfolio")}>
                      <span className="tds-badge" style={{ color: u.color, borderColor: u.color }}>{u.badge}</span>
                      <span className="tds-nm">{p.name}</span>
                      <span className="tds-stance" style={{ color: st.color }}>{st.label}</span>
                      <span className="tds-reason">{actionReason(p)}</span>
                    </button>
                  );
                })
              ) : (
                <div className="tds-none">
                  {positions.length > 0
                    ? `${positions.length}종목 모두 유지 구간${nearestToStop != null ? ` · 손절선 최근접 ${nearestToStop.toFixed(1)}%` : ""}`
                    : "증권사 연동 보유 종목이 없어요 — 조치할 주식이 없습니다."}
                </div>
              )}
              {/* 자산군 확장 — ETF 리밸런싱 · 부동산 대장 대비(주식만이 아닌 3축 통합) */}
              <div className="tds-more">
                {etfRebalMsg ? (
                  <button type="button" className="tds-morerow" onClick={() => router.push("/pwa/etf?etf=rec")}>
                    <span className="tds-mk">📊 ETF</span><span className="tds-mv">{etfRebalMsg}</span>
                  </button>
                ) : (
                  <button type="button" className="tds-morerow" onClick={() => router.push("/pwa/etf?etf=rec")}>
                    <span className="tds-mk">📊 ETF</span><span className="tds-mv tds-link">리밸런싱 확인 →</span>
                  </button>
                )}
                {myFeedEntry && myLeaderGapPct != null ? (
                  <button type="button" className="tds-morerow" onClick={() => router.push("/pwa/realestate")}>
                    <span className="tds-mk">🏠 부동산</span><span className="tds-mv">{myComplex} 대장 대비 {myLeaderGapPct.toFixed(1)}% 수준</span>
                  </button>
                ) : (
                  <button type="button" className="tds-morerow" onClick={() => router.push("/pwa/realestate")}>
                    <span className="tds-mk">🏠 부동산</span><span className="tds-mv tds-link">내 단지 포지션 →</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* 행3 — 어제 대비 AI 변화 한 줄 */}
          {aiFreshness.hasData && (
            <div className={`tds-row tds-ai ${aiFreshness.stale ? "stale" : "ok"}`}>
              <span className="tds-k">AI 변화</span>
              <span className="tds-aitext">
                {aiFreshness.stale
                  ? <>오늘 새 매수 판단 없음{aiFreshness.analysisDate ? <> · 최근 분석 <b>{aiFreshness.analysisDate}</b></> : null}</>
                  : <>오늘 분석 완료{aiFreshness.diffs.length > 0 ? <> · {aiFreshness.diffs.join(" · ")}</> : null}</>}
              </span>
            </div>
          )}
        </section>

        {/* [S20-3] 대결 카드는 AI 탭으로 이동. 결과가 나온 날만 배너 한 줄로(테두리 없는 한 줄 — 카드 아님). */}
        {duelResultToday && (
          <button type="button" className="td-duel-banner" style={{ order: 4 }} onClick={() => router.push("/pwa?tab=report&sec=vs")}>
            🏆 오늘의 <b>나 vs AI</b> 대결 결과가 나왔어요 · AI 탭에서 보기 →
          </button>
        )}

        {/* [S24-6] 읽을 거리 — 시황·봇 뉴스·주식 뉴스 3장을 한 묶음으로. 기본 접힘, 헤더에 건수만(삭제 아님·접기). */}
        <button type="button" className="card td-readhead td-demote" style={{ order: 5 }} onClick={() => setReadOpen((o) => !o)}>
          <span className="td-readhead-t">📰 읽을 거리</span>
          {(() => { const n = (stockNews?.length || 0) + (brief ? 1 : 0) + (newsBrief ? 1 : 0); return n > 0 ? <span className="td-readhead-n">오늘 {n}건</span> : null; })()}
          <span className="td-readhead-x">{readOpen ? "접기 ▲" : "펼치기 ▼"}</span>
        </button>
        {readOpen && (<div style={{ order: 5 }}>

        {/* 카드1.5 — 시황 브리핑. 텔레그램 "ONE-HUB Market Brief"와 같은 스냅샷을
            /api/pwa-market-brief로 받아 압축 요약. 데이터가 아직 없으면(신규 배포 직후 등)
            그냥 안 보여준다 — 빈 카드보다 정직한 생략이 낫다. */}
        {brief && (
          <section className="card mb">
            <div className="sn-h">📡 오늘 시황 브리핑{brief.date ? ` · ${brief.date}` : ""}</div>
            <div className="mb-badges">
              {brief.heat_grade && (
                <span className={`mb-badge mb-heat-${String(brief.heat_grade).toLowerCase()}`}>
                  Heat {brief.heat_score != null ? Math.round(brief.heat_score) : "-"} · {brief.heat_grade}
                </span>
              )}
              {brief.fg_rating && <span className="mb-badge">Fear&amp;Greed {brief.fg_score != null ? Math.round(brief.fg_score) : "-"} · {brief.fg_rating}</span>}
            </div>
            <div className="tile-2col">
              <div className="mini-stat">
                <div className="mini-body">
                  <div className="mini-t">Nasdaq</div>
                  <div className={`mini-s ${(brief.nasdaq_chg ?? 0) > 0 ? "up" : (brief.nasdaq_chg ?? 0) < 0 ? "dn" : ""}`}>
                    {brief.nasdaq_price ?? "-"} ({pctTxt(brief.nasdaq_chg ?? 0)})
                  </div>
                </div>
              </div>
              <div className="mini-stat">
                <div className="mini-body">
                  <div className="mini-t">SOX</div>
                  <div className={`mini-s ${(brief.sox_chg ?? 0) > 0 ? "up" : (brief.sox_chg ?? 0) < 0 ? "dn" : ""}`}>
                    {brief.sox_price ?? "-"} ({pctTxt(brief.sox_chg ?? 0)})
                  </div>
                </div>
              </div>
            </div>
            {briefOpen && (
              <div className="sn-sub">
                <div className="sn-sub-h">전체 지표</div>
                <div className="mb-grid">
                  <div>S&amp;P500 {brief.sp500_price ?? "-"} ({pctTxt(brief.sp500_chg ?? 0)})</div>
                  <div>VIX {brief.vix ?? "-"}</div>
                  <div>DXY {brief.dxy_price ?? "-"} ({pctTxt(brief.dxy_chg ?? 0)})</div>
                  <div>WTI ${brief.wti ?? "-"}</div>
                  <div>Gold ${brief.gold ?? "-"}</div>
                  <div>Copper ${brief.copper_price ?? "-"} ({pctTxt(brief.copper_chg ?? 0)})</div>
                  <div>USD/KRW {brief.usdkrw ?? "-"}</div>
                  <div>US10Y {brief.us10y ?? "-"}%</div>
                  <div>YieldCurve {brief.yc_spread ?? "-"}%{brief.yc_inverted ? " (INVERTED)" : ""}</div>
                </div>
              </div>
            )}
            <button type="button" className="tile-more" onClick={() => setBriefOpen((v) => !v)}>
              {briefOpen ? "접기 ▲" : "전체 지표 더보기 →"}
            </button>
          </section>
        )}

        {/* 카드1.6 — 텔레그램 "Today News"/"보유종목 관련 뉴스" 원문 스냅샷.
            아래 카드2(주식 뉴스)와는 다른 소스(onehub-news 서비스)라 헷갈리지 않도록 별도 카드로 분리. */}
        {newsBrief && (parseThemedNews(newsBrief.news_msg).length > 0 || parsePortfolioNews(newsBrief.portfolio_news_msg).length > 0) && (
          <section className="card mb">
            {/* [S20-3] 항목이 실제로는 며칠 전 것일 수 있어, 배치 날짜가 오늘이 아니면 정직하게 표기. */}
            <div className="sn-h">🗞 봇이 보낸 뉴스{newsBrief.date ? (botNewsStale ? ` · 오늘 신규 없음 · 최근 ${newsBrief.date}` : ` · 오늘(${newsBrief.date})`) : ""}</div>
            {parsePortfolioNews(newsBrief.portfolio_news_msg).length > 0 && (
              <div className="mb-news-block">
                <div className="sn-sub-h">보유 종목 관련</div>
                {parsePortfolioNews(newsBrief.portfolio_news_msg).map((line, i) => (
                  <div key={i} className="mb-news-row">{line}</div>
                ))}
              </div>
            )}
            {parseThemedNews(newsBrief.news_msg).map((sec) => (
              <div key={sec.theme} className="mb-news-block">
                <div className="sn-sub-h">{sec.theme}</div>
                {sec.items.map((line, i) => (
                  <div key={i} className="mb-news-row">{line}</div>
                ))}
              </div>
            ))}
          </section>
        )}

        {/* 카드2 — 주식 뉴스(보유 종목 관련 + 주요 뉴스 통합) */}
        <section className="card sn">
          <div className="sn-h">주식 뉴스</div>
          <HoldingsNews trader={trader} onOpenNews={openNewsDetail} bare />
          {stockNews.length > 0 ? (
            <div className="sn-sub">
              <div className="sn-sub-h">주요 뉴스</div>
              {stockNews.slice(0, 4).map((n) => (
                <button className="tile-news-row" key={n.id} onClick={() => openNewsDetail(n)}>
                  <span className="tile-news-t">{n.headline}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="tile-empty">오늘 새로 올라온 증시 뉴스가 없어요.</div>
          )}
        </section>
        </div>)}

        {/* 카드3 — 오늘의 할 일 · 주식 [S23 T-1] 각 행에서 바로 매도/보유/관망을 기록(페이지 안 떠남). */}
        {/* [S24-6] 이 앱의 유일한 차별점 — 다섯 장 중 하나만 시각적으로 들어올린다(promote). */}
        <section className="card sc td-promote" style={{ order: 2 }}>
          <div className="sc-h">오늘의 할 일 · 주식</div>
          {todoStock.length === 0 && todoNoti.length === 0 ? (
            /* [S24-7] 조용한 날에도 판단 카드는 비어 있지 않다. 우선순위 폭포: 경과 → 관찰 → 안내. */
            <div className="sc-quiet">
              {verdictProgress.length > 0 ? (
                <>
                  <div className="sc-empty">오늘은 손댈 게 없습니다{positions.length > 0 ? ` · ${positions.length}종목 모두 유지 구간` : ""}{nearestStopPct != null ? ` · 손절선 최근접 ${nearestStopPct.toFixed(1)}%` : ""}</div>
                  <div className="sc-prog-h">내 판단, 그 뒤로</div>
                  {verdictProgress.map((v) => (
                    <div className="sc-prog-row" key={v.code}>
                      <span className="sc-prog-nm">{v.days}일 전 {v.decision === "take" ? "보유" : "관망"} 판단 · {v.name}{v.backfilled && <i className="sc-prog-est"> (진입가 추정)</i>}</span>
                      <span className={`sc-prog-ret ${v.ret == null ? "" : v.ret >= 0 ? "up" : "dn"}`}>
                        {v.ret == null ? "집계 중" : `${v.ret >= 0 ? "+" : ""}${v.ret.toFixed(1)}%`}
                        {v.mature && v.correct != null ? (v.correct ? " ✓" : " ✗") : (v.ret != null ? " · 진행 중" : "")}
                      </span>
                    </div>
                  ))}
                </>
              ) : observeStocks.length > 0 ? (
                <>
                  <div className="sc-empty">오늘 조치할 종목은 없습니다 · {positions.length}종목 모두 유지 구간</div>
                  <div className="sc-prog-h">가장 가까운 종목을 관망으로 남겨두면 나중에 성적표에 잡힙니다</div>
                  {observeStocks.map((o) => {
                    const rec = recorded[o.code];
                    return (
                      <div className="sc-drow" key={o.code}>
                        <div className="sc-dbody"><span className="sc-t">{o.name}</span><span className="sc-s">손절선까지 {Math.abs(o.dist).toFixed(1)}%</span></div>
                        {rec ? <span className="sc-recorded">✓ 관망 기록됨 · {rec.at}</span> : (
                          <div className="sc-decbtns"><button type="button" className="sc-decb pass" onClick={() => recordTodo({ code: o.code, name: o.name, entry: o.entry }, "pass")}>관망</button></div>
                        )}
                      </div>
                    );
                  })}
                  <div className="sc-note-quiet">기록하지 않아도 됩니다.</div>
                </>
              ) : (
                <div className="sc-empty">{positions.length > 0 ? "오늘은 특별히 할 일이 없어요" : "증권사 계좌를 연동하면 보유 종목의 조치·판단이 여기 올라옵니다."}</div>
              )}
            </div>
          ) : (
            <div className="sc-list">
              {todoStock.map((t) => {
                const rec = recorded[t.code];
                return (
                  <div className={`sc-drow ${t.recheck ? "recheck" : ""}`} key={t.code}>
                    <div className="sc-dbody">
                      <span className="sc-t">{t.title}</span>
                      {t.sub && <span className="sc-s">{t.sub}</span>}
                      {decErr[t.code] && <span className="sc-err">{decErr[t.code]}</span>}
                    </div>
                    {rec ? (
                      <span className="sc-recorded">✓ {rec.label === "sell" ? "매도" : rec.label === "hold" ? "보유" : "관망"} 기록됨 · {rec.at}</span>
                    ) : (
                      <div className="sc-decbtns">
                        <button type="button" className="sc-decb sell" onClick={() => recordTodo(t, "sell")}>매도</button>
                        <button type="button" className="sc-decb hold" onClick={() => recordTodo(t, "hold")}>보유</button>
                        <button type="button" className="sc-decb pass" onClick={() => recordTodo(t, "pass")}>관망</button>
                      </div>
                    )}
                  </div>
                );
              })}
              {todoNoti.map((t) => (
                <div className="sc-drow noti" key={t.key}>
                  <div className="sc-dbody"><span className="sc-t">🔔 {t.title}</span></div>
                </div>
              ))}
            </div>
          )}
          {/* [S24-8] 성적표 상시 진입 — 기록 유무와 무관하게 항상 한 줄. 닭·달걀 문제 해소. */}
          {(() => {
            let vs = null; try { vs = getVerdictScorecard(trader); } catch (e) {}
            const total = vs ? vs.total : 0;
            let txt;
            if (recordedCount > 0) txt = `오늘 ${recordedCount}건 기록 · 내 판단 성적표 →`;
            else if (total === 0) txt = "아직 판단 기록이 없습니다 · 성적표가 어떤 화면인지 보기 →";
            else if (vs && vs.scored < 30) txt = `내 판단 ${total}건 · ${Math.max(0, 30 - vs.scored)}건 더 쌓이면 승률을 판정합니다 · 성적표 →`;
            else txt = `내 판단 ${total}건${vs && vs.winRate != null ? ` · 승률 ${vs.winRate}%` : ""} · 성적표 →`;
            return <button type="button" className="sc-record-link" onClick={() => router.push("/pwa/record")}>{txt}</button>;
          })()}
        </section>
        </div>)}

        {/* ══ "오늘의 부동산" — [사용자 지시] 4카드: 내부동산·지역비교 / 신고가 공지 / 뉴스 / 오늘 할일(관심단지) ══ */}
        {view === 1 && (<>
          {/* 카드1 — 내 부동산 및 지역 가격 비교 현황 */}
          <section className="card tile">
            <div className="tile-h">🏠 내 부동산 · 지역 비교</div>
            <p className="tile-headline">{reHeadline}</p>
            <button className="mini-stat mini-stat-full" onClick={() => router.push("/pwa/realestate")}>
              <span className="mini-ic re">🏠</span>
              <span className="mini-body">
                <span className="mini-t">{myComplex || "부동산 홈"}</span>
                <span className="mini-s">{myComplex ? "내 단지 상세·시세 보기" : "관심 단지를 등록하면 시세를 비교합니다"}</span>
              </span>
              <span className="mini-go">→</span>
            </button>
            {/* [사용자 지시] 내 단지 실거래 변동 — feed(실거래 피드)에서 내 단지 최근 거래만 뽑아 표시 */}
            {myFeedEntry && (
              <div className="tile-spot">
                {myComplex} 최근 실거래 <b>{myFeedEntry.거래금액_억}억</b>{myFeedEntry.거래일 ? ` · ${String(myFeedEntry.거래일).slice(5)}` : ""}
                {myFeedEntry.변동률 != null && <> · 직전 대비 <b className={myFeedEntry.변동률 >= 0 ? "up" : "dn"}>{rePct(myFeedEntry.변동률)}</b></>}
                {myLeaderGapPct != null && <> · 대장 대비 <b>{myLeaderGapPct.toFixed(1)}% 수준</b></>}
              </div>
            )}
            {reBrief && !reBrief.error && (
              <div className="tile-spot">
                지역 대장 <b>{reBrief.leader}</b>{reBrief.leader_price != null ? ` ${Number(reBrief.leader_price).toFixed(2)}억` : ""}
                {" · "}분기 <b className={reBrief.chg_q >= 0 ? "up" : "dn"}>{rePct(reBrief.chg_q)}</b>{" · "}연간 <b className={reBrief.chg_yr >= 0 ? "up" : "dn"}>{rePct(reBrief.chg_yr)}</b>
              </div>
            )}
            {myComplex && (
              <div className="tile-empty">평형별 상세 비교는 부동산 페이지에서 확인하세요.</div>
            )}
          </section>

          {/* 카드2 — 신고가 공지 */}
          {opNotes.length > 0 && (
            <section className="card tile">
              <div className="tile-h">🏢 신고가 공지</div>
              <div className="tile-news">
                {opNotes.slice(0, 4).map((o, i) => (
                  <button className="tile-news-row" key={o.id || i} onClick={() => router.push("/pwa/realestate")}>
                    <span className="tile-news-t">
                      {o.complex_name}{o.area_m2 ? ` · ${Math.round(Number(o.area_m2) / 3.3058)}평` : ""}{o.price_manwon ? ` · ${(o.price_manwon / 10000).toFixed(2)}억` : ""}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* 카드3 — 부동산 뉴스 */}
          <section className="card tile">
            <div className="tile-h">📰 부동산 뉴스</div>
            {realestateNews.length > 0 ? (
              <div className="tile-news">
                {(newsOpen ? realestateNews : realestateNews.slice(0, 4)).map((n) => (
                  <button className="tile-news-row" key={n.id} onClick={() => openNewsDetail(n)}>
                    <span className={`tile-news-cat c-${n.category}`}>{CAT_KO[n.category] || "뉴스"}</span>
                    <span className="tile-news-t">{n.headline}</span>
                  </button>
                ))}
                {realestateNews.length > 4 && (
                  <button className="tile-more" onClick={() => setNewsOpen((v) => !v)}>{newsOpen ? "접기" : `+${realestateNews.length - 4}건 더보기`}</button>
                )}
              </div>
            ) : (
              <div className="tile-empty">오늘 새로 올라온 부동산 뉴스가 없어요.</div>
            )}
            <ReportTeaser />
          </section>

          {/* 카드4 — 오늘의 할 일: 관심(저평가) 단지. [사용자 지시] 체크박스로 확인 후 취소선 */}
          <section className="card sc">
            <div className="sc-h">✅ 오늘의 할 일 · 부동산</div>
            {reBrief?.under?.length > 0 ? (
              <div className="sc-list">
                {reBrief.under.slice(0, 3).map((u, i) => {
                  const key = `re-${u.단지명 || i}`;
                  const done = checked.has(key);
                  return (
                    <div className={`sc-row ${done ? "done" : ""}`} key={key}>
                      <button type="button" className="sc-check" onClick={() => toggleCheck(key)} aria-label={done ? "완료 취소" : "완료 표시"}>{done ? "✓" : ""}</button>
                      <button type="button" className="sc-body" onClick={() => router.push("/pwa/realestate")}>
                        <span className="sc-t">{u.단지명}</span>
                        <span className="sc-s">+{Number(u.gap).toFixed(1)}% 저평가</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="sc-empty">오늘은 새로 확인할 관심 단지 정보가 없어요.</div>
            )}
          </section>

          {/* [이관] 투자 스크리너 + ONE Score 랭킹 + 거시 환경(부동산 페이지 → 오늘) */}
          <ReExplore myProp={reMyProp} onRegister={() => router.push("/pwa/realestate")} />

          {/* [이관] 관심단지 저평가 알림 */}
          <AlertSettingsCard />

          {/* [이관] 내 세금 계산기 링크 */}
          <a className="re-tax-nav" href="/pwa/tax">
            <span className="re-tax-ic">💰</span>
            <span className="re-tax-body">
              <span className="re-tax-t">내 세금</span>
              <span className="re-tax-s">공시가격으로 재산세·종부세 추정 계산</span>
            </span>
            <span className="re-tax-go">→</span>
          </a>

          {/* [이관] 협력업체 매물 등록 */}
          <a href="/partners/realestate" className="re-partner-cta">
            <span className="rpc-l"><span className="rpc-ic">🤝</span><span><b>협력업체 매물 등록</b><span className="rpc-sub">중개·시행사이신가요? 매물 정보를 등록하세요</span></span></span>
            <span className="rpc-arrow">→</span>
          </a>
        </>)}

        {/* ══ "오늘의 ETF" — 글로벌·거시·정책 뉴스 + 관련 할일 ══ */}
        {view === 2 && (
          <section className="card tile">
            <div className="tile-h">📊 오늘의 ETF</div>
            <p className="tile-headline">{etfHeadline}</p>
            <button className="mini-stat mini-stat-full" onClick={() => router.push("/pwa/etf")}>
              <span className="mini-ic etf">📊</span>
              <span className="mini-body">
                <span className="mini-t">ETF 홈</span>
                <span className="mini-s">{ukTxt(bd.etf_uk) ? `평가 ${ukTxt(bd.etf_uk)} · 리밸런싱 확인` : "국내/해외 배분 보기"}</span>
              </span>
              <span className="mini-go">→</span>
            </button>

            {etfNews.length > 0 ? (
              <div className="tile-news">
                <div className="tile-news-h">글로벌 · 거시 · 정책 뉴스</div>
                {(newsOpen ? etfNews : etfNews.slice(0, 4)).map((n) => (
                  <button className="tile-news-row" key={n.id} onClick={() => openNewsDetail(n)}>
                    <span className={`tile-news-cat c-${n.category}`}>{CAT_KO[n.category] || "뉴스"}</span>
                    <span className="tile-news-t">{n.headline}</span>
                    {/* [사용자 지시] 뉴스/정보 업데이트에는 날짜 기입 */}
                    {n.created_at && <span className="tile-news-date">{String(n.created_at).slice(5, 10)}</span>}
                  </button>
                ))}
                {etfNews.length > 4 && (
                  <button className="tile-more" onClick={() => setNewsOpen((v) => !v)}>{newsOpen ? "접기" : `+${etfNews.length - 4}건 더보기`}</button>
                )}
              </div>
            ) : (
              <div className="tile-empty">오늘 새로 올라온 ETF 관련 뉴스가 없어요.</div>
            )}
          </section>
        )}

        {/* 카드1.5 — [ETF Phase3] 오늘의 ETF 한 수: 하루 한 종목 추천(규칙기반 회전) + 절세 팁 */}
        {view === 2 && (() => {
          const DAY = Math.floor(Date.now() / 86400000);
          let pick = null;
          try {
            const target = JSON.parse(localStorage.getItem("onehub_target_alloc") || "null");
            const recs = recommendEtfs({ holdings: getEtfHoldings(), positions: [], target, overlap: null });
            if (recs.length) pick = recs[DAY % recs.length];
          } catch (e) {}
          // [S23 T-7] DAY% 회전 삭제 → 세금 달력(taxCalendar). 이 달에 해당 항목이 없으면 카드 미렌더.
          const taxFocus2 = taxFocusOf(currentMonth());
          // 내 숫자(실현 기반 — 평단과 무관해 S22-1 이상치의 영향을 받지 않음: 안전).
          let taxNum = null;
          try {
            const realized = JSON.parse(localStorage.getItem("onehub_etf_realized") || "[]");
            const yr = String(new Date().getFullYear());
            const net = (Array.isArray(realized) ? realized : []).filter((r) => String(r.date || "").startsWith(yr)).reduce((s, r) => s + (Number(r.gainKrw) || 0), 0);
            taxNum = { net, remain: Math.max(0, 2500000 - Math.max(0, net)) };
          } catch (e) {}
          const mv = etfMovers && (etfMovers.domestic || etfMovers.overseas) ? etfMovers : null;
          const mvRow = (label, m) => m ? (
            <button type="button" className="etf1-mv" onClick={() => router.push("/pwa/etf")}>
              <span className="etf1-mv-k">{label}</span>
              <span className="etf1-mv-nm">{m.name}</span>
              <span className={`etf1-mv-pct ${m.pct >= 0 ? "up" : "dn"}`}>{m.pct >= 0 ? "+" : ""}{m.pct}%</span>
            </button>
          ) : null;
          return (
            <section className="card sc">
              {/* [S23 T-7] 'DAY% 회전'을 '오늘의'라고 부르지 않는다 — 규칙 기반 순환 안내로 정직하게. */}
              <div className="sc-h">🎯 ETF 한 수 <span style={{ fontWeight: 600, fontSize: "0.66rem", color: "var(--color-ink-3)" }}>규칙 기반 안내</span></div>
              {mv && (
                <div className="etf1-movers">
                  <div className="etf1-mv-h">🔥 이번 주 상승률 최고 <span>최근 7일 · 실거래 종가</span></div>
                  {mvRow("국내", mv.domestic)}
                  {mvRow("해외", mv.overseas)}
                </div>
              )}
              {pick ? (
                <div className="etf1-reco">
                  <div className="etf1-nm">📌 {pick.name}</div>
                  <div className="etf1-why">{pick.reasonRule}</div>
                </div>
              ) : (
                <div className="sc-empty">보유·목표배분을 입력하면 규칙 기반 후보 한 종목이 표시돼요.</div>
              )}
              {/* [S23 T-7] 절세는 세금 달력 — 이 달에 해당 항목이 있을 때만. 내 실현 숫자를 함께(있으면). */}
              {taxFocus2 && (
                <div className="etf1-tax">🗓️ <b>{taxFocus2.title}</b> · {taxFocus2.desc}
                  {taxNum && <div className="etf1-taxnum">올해 실현 {taxNum.net.toLocaleString()}원 · 연 250만 공제 남은 <b>{taxNum.remain.toLocaleString()}원</b></div>}
                </div>
              )}
              <button className="tile-more" onClick={() => router.push("/pwa/etf?etf=rec")}>추천·절세 자세히 보기 →</button>
              <div className="etf1-disc">규칙기반 참고 정보 · 투자자문/특정종목 권유 아님.</div>
            </section>
          );
        })()}

        {/* 카드2 — [S23 T-5] 기사를 읽는 건 '할 일'이 아니다 → '읽을 거리'로 분리(판단 요구 없음). */}
        {view === 2 && (() => {
          const reads = [myEtfNews, ...etfNews].filter(Boolean).filter((n, i, arr) => arr.findIndex((x) => x.id === n.id) === i).slice(0, 3);
          return (
            <section className="card sc">
              <div className="sc-h">📰 읽을 거리 · ETF</div>
              {reads.length > 0 ? (
                <div className="sc-list">
                  {reads.map((n) => (
                    <button type="button" className="sc-readrow" key={`etf-${n.id}`} onClick={() => openNewsDetail(n)}>
                      <span className="sc-t">{n.headline}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="sc-empty">오늘 새 ETF 관련 소식이 없어요.</div>
              )}
              <button className="tile-more" onClick={() => router.push("/pwa/etf")}>ETF 리밸런싱 확인하러 가기 →</button>
            </section>
          );
        })()}

        {/* ══ 새 지역 추가 안내 — [확인 완료] REGIONS(lib/storyRegion.js)에 늘어난 동을 로컬 "본 목록" 대비로 감지 ══ */}
        {view === 3 && newRegions.length > 0 && (
          <section className="card tile story-newregion">
            <div className="tile-h">🆕 새로운 지역이 추가됐어요</div>
            <p className="tile-headline">{newRegions.join(", ")} 이야기를 이제 이곳에서 볼 수 있어요.</p>
            <button className="tile-more" onClick={dismissNewRegions}>확인했어요</button>
          </section>
        )}

        {/* ══ "오늘의 이야기" — [사용자 지시] 주식/부동산/ETF/기타로 나눠 카드 작성 ══ */}
        {/* [S23 T-9] 이야기 요약 한 장 — 4개 카테고리 카드 통합. 비었을 때 안내는 한 번만.
            지역별 증감 카드는 /pwa/story 로 이관(여기선 미표시, 스냅샷 적립은 loadStoryData 에서 계속). */}
        {view === 3 && (() => {
          const total = storyComments.length;
          const cnt = (c) => storyComments.filter((x) => x.category === c).length;
          const rep = total > 0 ? storyComments[storyComments.length - 1] : null;
          return (
            <section className="card tile" onClick={() => router.push("/pwa/story")} role="button" tabIndex={0}>
              <div className="tile-h">💬 오늘의 이야기 {total > 0 && <span className="story-cat-n">{total}건</span>}</div>
              {total > 0 ? (
                <>
                  <p className="tile-sub">주식 {cnt("주식")} · 부동산 {cnt("부동산")} · ETF {cnt("ETF")}</p>
                  {rep && (
                    <div className="story-cat-row" style={{ marginTop: 8 }}>
                      <span className="story-cat-nick">{rep.nick}</span>
                      <span className="story-cat-text">{rep.text}</span>
                    </div>
                  )}
                </>
              ) : (
                <p className="tile-headline">{storyHeadline}</p>
              )}
            </section>
          );
        })()}

        {/* ══ Youtube/단톡방 업데이트 공지 — [확인 완료] content/announcements/*.md,
             관리자가 직접 커밋(content/daily와 동일 패턴, 새 백엔드 없음) ══ */}
        {view === 3 && (
          <section className="card tile">
            <div className="tile-h">📢 업데이트 공지</div>
            {announcements.length > 0 ? (
              <div className="story-cat-list">
                {announcements.map((a) => (
                  a.url ? (
                    <a className="story-announce-row" key={a.date + a.title} href={a.url} target="_blank" rel="noopener noreferrer">
                      <span className="mini-ic">{a.icon}</span>
                      <span className="mini-body">
                        <span className="mini-t">{a.title}</span>
                        {a.body && <span className="mini-s">{a.body}</span>}
                      </span>
                    </a>
                  ) : (
                    <div className="story-announce-row" key={a.date + a.title}>
                      <span className="mini-ic">{a.icon}</span>
                      <span className="mini-body">
                        <span className="mini-t">{a.title}</span>
                        {a.body && <span className="mini-s">{a.body}</span>}
                      </span>
                    </div>
                  )
                ))}
              </div>
            ) : (
              <div className="tile-empty">아직 등록된 공지가 없어요.</div>
            )}
          </section>
        )}

      </DataState>

      {newsDetail && (
        <div className="td-modal-bg" onClick={closeNewsDetail}>
          <div className="td-modal" onClick={(e) => e.stopPropagation()}>
            <button className="td-modal-close" onClick={closeNewsDetail} aria-label="닫기">✕</button>
            <span className={`tile-news-cat c-${newsDetail.category}`}>{CAT_KO[newsDetail.category] || "뉴스"}</span>
            <h3 className="td-modal-h">{newsDetail.headline}</h3>
            <div className="td-modal-meta">{newsDetail.source_label || "OneHub 제공"}{newsDetail.created_at ? ` · ${String(newsDetail.created_at).slice(0, 10)}` : ""}</div>
            <div className="td-modal-body">
              {String(newsDetail.summary_md || "").split("\n").map((l, i) => l.trim() && <p key={i}>{l.replace(/^\s*[-*]\s*/, "")}</p>)}
            </div>
            <div className="td-modal-share"><ShareButton title={newsDetail.headline} text={newsDetail.headline} url="https://one-hub-content.vercel.app/pwa/today" /></div>
          </div>
        </div>
      )}

      <BottomNav active="today" />

      <style jsx>{`
        .td { max-width: 480px; margin: 0 auto; padding: 0 14px calc(env(safe-area-inset-bottom, 0px) + 140px); font-family: var(--font-sans); color: var(--color-ink); min-height: 100vh; background: var(--color-bg); }
        /* [사용자 지시] 상위 메뉴 고정 */
        .sticky-hdr { position: sticky; top: 0; z-index: 140; background: var(--color-bg); margin: 0 -14px; padding: 0 14px; }
        .td-hd { display: flex; align-items: center; justify-content: space-between; padding: calc(env(safe-area-inset-top, 0px) + 12px) 2px 10px; }
        .td-logo { font-weight: 800; font-size: 20px; letter-spacing: -.5px; color: var(--color-ink); background: none; border: none; padding: 0; cursor: pointer; font-family: var(--font-sans); }
        .td-dot { color: var(--color-success); }
        .td-ic { display: flex; align-items: center; gap: 8px; }
        .td-search { width: 34px; height: 34px; border-radius: 50%; background: var(--color-card); border: none; display: grid; place-items: center; font-size: 15px; cursor: pointer; box-shadow: var(--shadow-card); }
        .td-titlewrap { display: flex; align-items: center; gap: 8px; margin: 6px 2px 6px; }
        .td-seg { display: flex; gap: 4px; width: 100%; background: var(--inset-bg, var(--color-card-soft, rgba(0,0,0,0.04))); border: 1px solid var(--color-line); border-radius: 12px; padding: 3px; }
        .td-seg-b { flex: 1 1 0; display: inline-flex; align-items: center; justify-content: center; gap: 5px; border: none; background: transparent; color: var(--color-ink-2); border-radius: 9px; padding: 8px 4px; font-size: 0.82rem; font-weight: 700; font-family: var(--font-sans); cursor: pointer; }
        .td-seg-b.on { background: var(--color-card); color: var(--color-ink); box-shadow: var(--shadow-card); }
        .td-seg-badge { min-width: 16px; height: 16px; padding: 0 4px; display: inline-flex; align-items: center; justify-content: center; font-size: 0.62rem; font-weight: 800; color: var(--color-on-primary); background: var(--color-primary); border-radius: 999px; }
        .td-market { display: flex; align-items: center; gap: 10px; background: var(--color-card); border: 1px solid var(--color-line); border-radius: 12px; padding: 8px 12px; margin: 0 2px 14px; box-shadow: var(--shadow-card); }
        .td-fresh3 { margin-left: auto; }
        .card { background: var(--color-card); border: 1px solid var(--color-line); border-radius: var(--radius-card, 14px); padding: 16px; margin-bottom: 12px; box-shadow: var(--shadow-card); }

        /* ══ [S20-3] 카드0: 오늘 1화면 요약 3행 ══ */
        .td-sum { padding: 14px 14px 12px; display: flex; flex-direction: column; gap: 10px; }
        .tds-row { display: flex; align-items: flex-start; gap: 8px; }
        .tds-row + .tds-row { padding-top: 10px; border-top: 1px solid var(--color-line); }
        .tds-k { flex-shrink: 0; width: 52px; font-size: 0.66rem; font-weight: 800; color: var(--color-ink-3); padding-top: 3px; letter-spacing: -.2px; }
        .tds-asset { align-items: baseline; flex-wrap: wrap; }
        .tds-total { font-size: 1.32rem; font-weight: 800; color: var(--color-ink); font-variant-numeric: tabular-nums; letter-spacing: -.5px; }
        .tds-total.tds-muted { font-size: 0.9rem; color: var(--color-ink-3); font-weight: 700; }
        .tds-dchip { font-size: 0.72rem; font-weight: 800; padding: 2px 8px; border-radius: 999px; font-variant-numeric: tabular-nums; }
        .tds-dchip i { font-style: normal; font-weight: 600; opacity: .8; }
        .tds-dchip.up { background: var(--color-success-soft, rgba(14,158,106,.12)); color: var(--color-success); }
        .tds-dchip.dn { background: var(--color-danger-soft, rgba(229,72,77,.12)); color: var(--color-danger); }
        .tds-dchip.flat { background: var(--color-card-soft, rgba(0,0,0,.04)); color: var(--color-ink-3); }
        .tds-dnew { font-size: 0.7rem; color: var(--color-ink-3); }
        .tds-fresh { margin-left: auto; font-size: 0.68rem; }
        .tds-subtotals { display: flex; gap: 12px; flex-wrap: wrap; margin: 2px 0 2px; font-size: 0.72rem; color: var(--color-ink-3); }
        .tds-subtotals .tds-realty-upd { color: var(--color-ink-2); font-weight: 600; }
        .tds-spark { margin-left: 6px; }
        /* [S24-6] view0 카드 위계 — flex order 로 재배치, 판단만 승격·나머지 약화 */
        .td-v0 { display: flex; flex-direction: column; }
        .td-promote { border: 1.5px solid var(--color-primary); box-shadow: 0 10px 28px rgba(10,22,44,0.14); }
        .td-demote { box-shadow: none; }
        .td-readhead { display: flex; align-items: center; gap: 8px; width: 100%; text-align: left; padding: 12px 14px; font-family: var(--font-sans); cursor: pointer; }
        .td-readhead-t { font-size: 0.86rem; font-weight: 800; color: var(--color-ink); }
        .td-readhead-n { font-size: 0.72rem; font-weight: 700; color: var(--color-ink-3); }
        .td-readhead-x { margin-left: auto; font-size: 0.76rem; color: var(--color-ink-3); }
        /* [S23 T-6] 주기 훅 카드 */
        .td-cadence { border-left: 3px solid var(--color-primary); padding: 6px 12px; }
        .tc-row { display: flex; align-items: center; gap: 10px; width: 100%; text-align: left; background: none; border: none; padding: 8px 2px; cursor: pointer; font-family: var(--font-sans); }
        .tc-ic { flex: none; font-size: 1.1rem; }
        .tc-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
        .tc-t { font-size: 0.84rem; font-weight: 800; color: var(--color-ink); }
        .tc-s { font-size: 0.76rem; color: var(--color-ink-2); word-break: keep-all; }
        .tc-arrow { flex: none; color: var(--color-ink-3); font-size: 1.1rem; }
        .etf1-taxnum { margin-top: 6px; font-size: 0.74rem; color: var(--color-ink-2); font-variant-numeric: tabular-nums; }
        .tds-speakrow { margin: 6px 0 2px; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
        .tds-cliplink { border: none; background: none; color: var(--color-primary); font-size: 0.74rem; font-weight: 700; font-family: var(--font-sans); cursor: pointer; padding: 0; }
        .tds-actbody { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
        .tds-actrow { display: flex; align-items: center; gap: 6px; width: 100%; background: none; border: none; padding: 0; cursor: pointer; font-family: var(--font-sans); text-align: left; }
        .tds-badge { flex-shrink: 0; font-size: 0.6rem; font-weight: 800; border: 1px solid; border-radius: 999px; padding: 1px 6px; }
        .tds-nm { flex-shrink: 0; font-size: 0.8rem; font-weight: 800; color: var(--color-ink); max-width: 40%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .tds-stance { flex-shrink: 0; font-size: 0.72rem; font-weight: 700; }
        .tds-reason { margin-left: auto; font-size: 0.68rem; color: var(--color-ink-3); font-variant-numeric: tabular-nums; white-space: nowrap; }
        .tds-none { font-size: 0.78rem; color: var(--color-ink-2); line-height: 1.5; word-break: keep-all; }
        .tds-more { display: flex; flex-direction: column; gap: 4px; margin-top: 2px; padding-top: 8px; border-top: 1px dashed var(--color-line); }
        .tds-morerow { display: flex; align-items: center; gap: 8px; width: 100%; background: none; border: none; padding: 0; cursor: pointer; font-family: var(--font-sans); text-align: left; }
        .tds-mk { flex-shrink: 0; font-size: 0.7rem; font-weight: 800; color: var(--color-ink-2); width: 62px; }
        .tds-mv { font-size: 0.72rem; color: var(--color-ink-2); line-height: 1.45; word-break: keep-all; }
        .tds-mv.tds-link { color: var(--color-primary); font-weight: 700; }
        .tds-ai .tds-aitext { font-size: 0.78rem; color: var(--color-ink); line-height: 1.5; word-break: keep-all; }
        .tds-ai .tds-aitext b { color: var(--color-ink); }
        .tds-ai.stale .tds-aitext { color: var(--color-ink-2); }
        .tds-ai .tds-k::before { content: ""; display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: var(--color-success); margin-right: 4px; vertical-align: middle; }
        .tds-ai.stale .tds-k::before { background: var(--color-ink-3); }

        /* [S20-3] 대결 결과 배너(결과 나온 날만) */
        .td-duel-banner { display: block; width: 100%; text-align: left; background: var(--color-primary-soft, rgba(60,110,240,.1)); color: var(--color-primary); border: 1px solid var(--color-primary-soft, transparent); border-radius: 12px; padding: 11px 14px; margin-bottom: 12px; font-size: 0.8rem; font-weight: 600; cursor: pointer; font-family: var(--font-sans); }
        .td-duel-banner b { font-weight: 800; }

        .td-modal-bg { position: fixed; inset: 0; z-index: 300; background: rgba(10,15,25,.5); display: flex; align-items: flex-end; justify-content: center; }
        .td-modal { position: relative; width: 100%; max-width: 480px; max-height: 78vh; overflow-y: auto; background: var(--color-card); border-radius: 18px 18px 0 0; padding: 22px 20px calc(env(safe-area-inset-bottom, 0px) + 22px); }
        .td-modal-close { position: absolute; top: 14px; right: 14px; width: 30px; height: 30px; border-radius: 50%; border: none; background: var(--color-card-soft, var(--color-line)); color: var(--color-ink-2); font-size: 14px; cursor: pointer; }
        .td-modal-h { font-size: 1.02rem; font-weight: 800; color: var(--color-ink); line-height: 1.4; margin: 10px 40px 6px 0; word-break: keep-all; }
        .td-modal-meta { font-size: 0.72rem; color: var(--color-ink-3); margin-bottom: 14px; }
        .td-modal-body { font-size: 0.86rem; color: var(--color-ink-2); line-height: 1.7; word-break: keep-all; display: flex; flex-direction: column; gap: 8px; }
        .td-modal-share { margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--color-line); display: flex; justify-content: flex-end; }

        .up { color: var(--color-success); } .dn { color: var(--purple, var(--color-danger)); }

        /* ══ 카드1.5: 시황 브리핑 ══ */
        .mb-badges { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 10px; }
        .mb-badge { font-size: 0.68rem; font-weight: 800; padding: 4px 9px; border-radius: 999px; background: var(--color-card-soft); color: var(--color-ink-2); white-space: nowrap; }
        .mb-heat-hot { background: var(--color-danger-soft, #FDECEE); color: var(--color-danger); }
        .mb-heat-warm { background: var(--color-warning-soft); color: var(--color-warning-ink, var(--color-warning)); }
        .mb-heat-cool { background: var(--color-primary-soft, var(--color-card-soft)); color: var(--color-primary); }
        .mb-heat-cold { background: var(--color-card-soft); color: var(--color-ink-3); }
        .mb-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 12px; font-size: 0.76rem; color: var(--color-ink-2); margin-bottom: 6px; font-variant-numeric: tabular-nums; }
        .mb-news-block { margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--color-line); }
        .mb-news-block:first-child { margin-top: 0; padding-top: 0; border-top: none; }
        .mb-news-row { font-size: 0.78rem; color: var(--color-ink); line-height: 1.55; word-break: keep-all; padding: 3px 0; }

        /* ══ 카드2: 주식 뉴스 ══ */
        .sn-h { font-size: 0.86rem; font-weight: 800; color: var(--color-ink); margin-bottom: 8px; }
        .sn-sub { margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--color-line); }
        .sn-sub-h { font-size: 0.68rem; font-weight: 800; color: var(--color-ink-3); text-transform: uppercase; letter-spacing: .04em; margin-bottom: 6px; }

        /* ══ 카드3: 오늘의 할 일 · 주식(체크리스트, 매일 자정 초기화) ══ */
        .sc-h { font-size: 0.86rem; font-weight: 800; color: var(--color-ink); margin-bottom: 10px; }
        .sc-empty { font-size: 0.82rem; color: var(--color-ink-2); padding: 6px 2px; word-break: keep-all; }
        /* [S23 T-1] 판단 기록 행 */
        .sc-drow { display: flex; align-items: center; gap: 10px; padding: 9px 2px; border-bottom: 1px solid var(--color-line); }
        .sc-drow:last-child { border-bottom: none; }
        .sc-drow.recheck { background: var(--color-warning-soft, transparent); border-radius: 8px; padding: 9px 8px; }
        .sc-dbody { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
        .sc-decbtns { flex: none; display: flex; gap: 5px; }
        .sc-decb { border: 1px solid var(--color-line); background: var(--color-card); border-radius: 8px; padding: 6px 10px; font-size: 0.74rem; font-weight: 700; font-family: var(--font-sans); cursor: pointer; color: var(--color-ink-2); }
        .sc-decb.sell { border-color: var(--color-danger); color: var(--color-danger); }
        .sc-decb.hold { border-color: var(--color-primary); color: var(--color-primary); }
        .sc-recorded { flex: none; font-size: 0.74rem; font-weight: 700; color: var(--color-success, #16a34a); }
        .sc-err { font-size: 0.7rem; color: var(--color-danger, #dc2626); }
        .sc-record-link { width: 100%; margin-top: 10px; border: none; background: none; text-align: left; font-size: 0.78rem; font-weight: 700; color: var(--color-primary); cursor: pointer; font-family: var(--font-sans); padding: 4px 2px; }
        .sc-readrow { display: block; width: 100%; text-align: left; background: none; border: none; border-bottom: 1px solid var(--color-line); padding: 9px 2px; cursor: pointer; font-family: var(--font-sans); }
        .sc-readrow:last-child { border-bottom: none; }
        /* [S24-7] 조용한 날 — 내 판단 경과 / 오늘의 관찰 */
        .sc-prog-h { font-size: 0.74rem; font-weight: 700; color: var(--color-ink-3); margin: 10px 0 6px; word-break: keep-all; }
        .sc-prog-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 0.8rem; padding: 5px 0; border-bottom: 1px solid var(--color-line); }
        .sc-prog-row:last-child { border-bottom: none; }
        .sc-prog-nm { color: var(--color-ink-2); }
        .sc-prog-est { font-style: normal; font-size: 0.66rem; color: var(--color-ink-3); }
        .sc-prog-ret { font-variant-numeric: tabular-nums; font-weight: 700; flex: none; }
        .sc-prog-ret.up { color: var(--color-success, #16a34a); }
        .sc-prog-ret.dn { color: var(--color-danger, #dc2626); }
        .sc-note-quiet { font-size: 0.7rem; color: var(--color-ink-3); margin-top: 8px; }
        .etf1-reco { background: var(--color-primary-soft); border-radius: 11px; padding: 12px 13px; margin-bottom: 10px; }
        .etf1-nm { font-size: 0.9rem; font-weight: 800; color: var(--color-ink); }
        .etf1-why { font-size: 0.78rem; color: var(--color-ink-2); line-height: 1.5; margin-top: 5px; word-break: keep-all; }
        .etf1-tax { font-size: 0.78rem; color: var(--color-ink-2); line-height: 1.55; padding: 10px 12px; background: var(--color-card-soft); border-radius: 10px; word-break: keep-all; }
        .etf1-tax b { color: var(--color-primary); }
        .etf1-disc { font-size: 0.64rem; color: var(--color-ink-3); margin-top: 6px; }
        .etf1-movers { margin-bottom: 12px; }
        .etf1-mv-h { font-size: 0.76rem; font-weight: 800; color: var(--color-ink); margin-bottom: 7px; }
        .etf1-mv-h span { font-size: 0.62rem; font-weight: 600; color: var(--color-ink-3); margin-left: 5px; }
        .etf1-mv { display: flex; align-items: center; gap: 8px; width: 100%; text-align: left; background: var(--color-card-soft); border: none; border-radius: 10px; padding: 9px 11px; margin-bottom: 6px; cursor: pointer; font-family: var(--font-sans); }
        .etf1-mv-k { flex-shrink: 0; font-size: 0.62rem; font-weight: 800; color: var(--color-on-primary); background: var(--color-ink-3); border-radius: 5px; padding: 2px 6px; }
        .etf1-mv-nm { flex: 1; min-width: 0; font-size: 0.78rem; font-weight: 700; color: var(--color-ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .etf1-mv-pct { flex-shrink: 0; font-size: 0.82rem; font-weight: 800; font-family: ui-monospace, monospace; }
        .etf1-mv-pct.up { color: var(--color-danger); } .etf1-mv-pct.dn { color: var(--color-primary); }
        .sc-list { display: flex; flex-direction: column; }
        .sc-row { display: flex; align-items: flex-start; gap: 10px; padding: 9px 2px; border-bottom: 1px solid var(--color-line); }
        .sc-row:last-child { border-bottom: none; }
        .sc-check { flex: none; width: 22px; height: 22px; margin-top: 1px; border-radius: 7px; border: 1.5px solid var(--color-line); background: var(--color-card-soft); color: var(--color-on-primary); font-size: 13px; font-weight: 900; display: grid; place-items: center; cursor: pointer; }
        .sc-row.done .sc-check { background: var(--color-success); border-color: var(--color-success); }
        .sc-body { flex: 1; min-width: 0; text-align: left; background: none; border: none; padding: 0; display: flex; flex-direction: column; gap: 2px; cursor: pointer; font-family: var(--font-sans); }
        .sc-t { font-size: 0.82rem; font-weight: 800; color: var(--color-ink); }
        .sc-s { font-size: 0.72rem; color: var(--color-ink-2); word-break: keep-all; line-height: 1.4; }
        .sc-row.done .sc-t, .sc-row.done .sc-s { text-decoration: line-through; color: var(--color-ink-3); }

        /* ══ 타일 공통 ══ */
        .tile-h { font-size: 0.92rem; font-weight: 800; color: var(--color-ink); margin-bottom: 12px; }
        /* [사용자 지시] 대결 탭 외 나머지 탭도 맨 위가 비어 보이지 않도록 — 오늘의 핵심 한 줄 */
        .tile-headline { font-size: 0.82rem; color: var(--color-ink-2); line-height: 1.5; word-break: keep-all; margin: -6px 0 12px; }
        .tile-2col { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 10px; }
        .mini-stat { display: flex; align-items: center; gap: 8px; text-align: left; padding: 12px 10px; border-radius: 12px; background: var(--color-card-soft, var(--color-bg)); border: 1px solid var(--color-line); cursor: pointer; font-family: var(--font-sans); min-height: 64px; }
        .mini-stat-full { width: 100%; margin-bottom: 12px; }
        .tile-empty { font-size: 0.8rem; color: var(--color-ink-3); padding: 10px 2px; }
        .story-cat { cursor: pointer; }
        .story-cat-n { font-size: 0.68rem; font-weight: 700; color: var(--color-ink-3); margin-left: 4px; }
        .story-cat-list { display: flex; flex-direction: column; gap: 6px; }
        .story-cat-row { display: flex; gap: 7px; align-items: baseline; font-size: 0.78rem; }
        .story-cat-nick { flex: none; font-weight: 800; color: var(--color-ink-2); }
        .story-cat-text { flex: 1; min-width: 0; color: var(--color-ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .story-delta-up { flex: none; font-size: 0.76rem; font-weight: 800; color: var(--color-success); }
        .story-delta-down { flex: none; font-size: 0.76rem; font-weight: 800; color: var(--color-danger); }
        .tile-sub { font-size: 0.68rem; color: var(--color-ink-3); margin: 4px 0 0; }
        .story-newregion { background: var(--color-primary-soft, var(--color-card-soft)); }
        .story-announce-row { display: flex; align-items: flex-start; gap: 8px; padding: 8px 2px; text-decoration: none; color: inherit; font-family: var(--font-sans); }
        .mini-ic { flex: none; font-size: 20px; width: 26px; text-align: center; }
        .mini-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
        .mini-t { font-size: 0.8rem; font-weight: 800; color: var(--color-ink); }
        .mini-s { font-size: 0.68rem; font-weight: 600; color: var(--color-ink-2); word-break: keep-all; line-height: 1.35; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
        .mini-go { flex: none; font-size: 0.78rem; font-weight: 800; color: var(--color-primary); }
        .tile-spot { font-size: 0.76rem; font-weight: 700; color: var(--color-warning-ink, var(--color-warning)); background: var(--color-warning-soft); border-radius: 9px; padding: 8px 10px; margin-bottom: 10px; word-break: keep-all; }
        .tile-news { margin-bottom: 6px; }
        .tile-news-h { font-size: 0.68rem; font-weight: 800; color: var(--color-ink-3); text-transform: uppercase; letter-spacing: .04em; margin-bottom: 6px; }
        .tile-news-row { display: flex; align-items: baseline; gap: 7px; width: 100%; text-align: left; padding: 6px 2px; background: none; border: none; cursor: pointer; font-family: var(--font-sans); }
        .tile-news-cat { flex: none; font-size: 0.58rem; font-weight: 800; padding: 2px 6px; border-radius: 999px; background: var(--color-card-soft, var(--color-line)); color: var(--color-ink-2); white-space: nowrap; }
        .tile-news-cat.c-global { background: #EEF2FF; color: #4F5BD5; }
        .tile-news-cat.c-macro { background: #EAF1FF; color: #2F6BFF; }
        .tile-news-cat.c-realestate { background: #FFF6E5; color: #B45309; }
        .tile-news-cat.c-policy { background: #F6EEFF; color: #7A4CE0; }
        .tile-news-t { font-size: 0.78rem; color: var(--color-ink); line-height: 1.4; word-break: keep-all; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; }
        .tile-news-date { flex: none; font-size: 0.64rem; color: var(--color-ink-3); }
        .tile-more { width: 100%; margin-top: 4px; border: none; background: none; color: var(--color-primary); font-size: 0.74rem; font-weight: 800; cursor: pointer; padding: 4px 2px; text-align: left; font-family: var(--font-sans); }

        /* [이관] 내 세금 링크 */
        .re-tax-nav { display: flex; align-items: center; gap: 14px; background: linear-gradient(135deg, var(--color-primary-soft), var(--color-card)); border: 1px solid var(--color-line, #E8EEF7); border-radius: var(--radius-card); box-shadow: var(--shadow-card); padding: 20px; margin-bottom: 12px; text-decoration: none; }
        .re-tax-ic { font-size: 30px; flex: none; }
        .re-tax-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
        .re-tax-t { font-size: 1.05rem; font-weight: 800; color: var(--color-ink, #12213B); }
        .re-tax-s { font-size: 0.82rem; color: var(--color-ink-2, #64748B); }
        .re-tax-go { font-size: 1.3rem; font-weight: 800; color: var(--color-primary, #2F6BFF); flex: none; }
        /* [이관] 협력업체 매물 CTA */
        .re-partner-cta { display: flex; align-items: center; justify-content: space-between; gap: 10px; text-decoration: none; background: var(--color-card); border: 1px solid var(--color-line); border-radius: var(--radius-card, 14px); padding: 14px 16px; margin: 4px 0 14px; box-shadow: var(--shadow-card); }
        .re-partner-cta .rpc-l { display: flex; align-items: center; gap: 10px; }
        .re-partner-cta .rpc-ic { font-size: 20px; }
        .re-partner-cta b { display: block; color: var(--color-ink); font-size: 0.92rem; }
        .re-partner-cta .rpc-sub { display: block; color: var(--color-muted); font-size: 0.76rem; margin-top: 2px; }
        .re-partner-cta .rpc-arrow { color: var(--color-primary); font-weight: 700; }

        /* ══ 종합자산 · 할일 ══ */
      `}</style>
      <style jsx global>{`body { background: var(--color-bg); margin: 0; }`}</style>
    </div>
  );
}

// [이야기 탭 공지] content/announcements/*.md — 관리자가 파일을 커밋하면 노출(가짜 공지 없음).
export async function getStaticProps() {
  return { props: { announcements: getAnnouncements(5) }, revalidate: 300 };
}

