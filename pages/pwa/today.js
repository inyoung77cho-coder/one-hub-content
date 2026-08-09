// [N4] '오늘' — 4대 그래픽 타일: ①주식·나 vs AI(히어로) ②ETF·부동산 ③리포트 ④종합자산 할일.
//   설계 원칙: 텍스트 단락 대신 숫자·막대·배지로 한눈에. 나 vs AI를 첫 화면 최상단 히어로로 승격.
//   데이터는 전부 기존 소스: 원장(lib/ledger) · /api/pwa-dashboard · /api/pwa-pending ·
//   /api/pwa/re/feed · lib/verdictLedger(판단 기록) · /api/today/news. 새로 만든 저장소 없음.
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/router";
import { getTrader, useTrader } from "../../lib/trader";
import { dedupBy } from "../../lib/useDedup";
import { getLedger as getAssetLedger } from "../../lib/ledger";
import HoldingsNews from "../../components/HoldingsNews";
import ReportTeaser from "../../components/ReportTeaser";
import { getLedger as getDecisionLedger, computeShowdown, matureLedger } from "../../lib/verdictLedger";
import { computeWallets, getSeed, resetSeed, streakNarrative, wonG, getNickname, setNickname } from "../../lib/gameWallet";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer } from "recharts";
import { initGameSync } from "../../lib/gameSync";
import { samplePolicy } from "../../lib/sampleSize";
import { getStoryRegionOverride, REGIONS, getNewRegions, ackNewRegions } from "../../lib/storyRegion";
import { recordSnapshot as recordRegionSnapshot, getRegionDelta } from "../../lib/storyRegionHistory";
import { getHoldings as getEtfHoldings } from "../../lib/etfHoldings";
import TraderBadge from "../../components/shared/TraderBadge";
import BottomNav from "../../components/BottomNav";
import DataState from "../../components/DataState";
import LastUpdated from "../../components/LastUpdated";
import MarketStatusBadge from "../../components/MarketStatusBadge";
import RotatingPageTitle from "../../components/RotatingPageTitle";
import ShareButton from "../../components/ShareButton";
import FeedbackButton from "../../components/FeedbackButton";
import { getAnnouncements } from "../../lib/reports";

const DAY = 86400000;
const MATURE_DAYS = 3; // 판단 → 채점까지(나 vs AI)
const CAT_KO = { global: "글로벌", macro: "거시", markets: "증시", realestate: "부동산", policy: "정책", affairs: "시사" };
// [사용자 지시] 오늘의 이야기 — 주식/부동산/ETF/기타 카드 구분. Comments.js 카테고리는 전체/주식/ETF/부동산이라
//   "전체"(미지정) 글은 여기서 "기타"로 보여준다.
const STORY_CATS = [["주식", "📈"], ["부동산", "🏠"], ["ETF", "📊"], ["기타", "💬"]];
const regimeKo = (r) => ({ BULL: "상승", BEAR: "하락", SIDE: "횡보", SIDEWAYS: "횡보", NEUTRAL: "중립" }[String(r || "").toUpperCase()] || null);
const pctTxt = (v) => `${Number(v) >= 0 ? "+" : ""}${Number(v).toFixed(2)}%`;
const rePct = (v) => (v == null ? "-" : `${v > 0 ? "+" : ""}${Number(v).toFixed(1)}%`);
// [사용자 지시] 지갑 큰 숫자는 "원" 없이, 그 아래 증감(+xx원)에만 "원"을 남긴다.
const wonNum = (n) => wonG(n).replace(/원$/, "");
const mmdd = (ms) => { const d = new Date(ms); return `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

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
  const [decisions, setDecisions] = useState([]);
  const [myComplex, setMyComplex] = useState("");
  const [status, setStatus] = useState("loading");
  const [at, setAt] = useState(null);
  const [notis, setNotis] = useState([]); // [알림] 텔레그램/리포트 알림 피드
  const [opNotes, setOpNotes] = useState([]); // [알림] OneHub 신고가(spot_price)
  const [reBrief, setReBrief] = useState(null); // [사용자 지시] 내 부동산 vs 지역 대장단지 가격 비교(re/briefing 재사용)
  const [storyComments, setStoryComments] = useState([]); // [사용자 지시] 오늘의 이야기 — 카테고리별(주식/부동산/ETF/기타) 미리보기
  const [regionDelta, setRegionDelta] = useState(null); // [이야기 탭] 지역별 이야기 건수 증감(참석자 추적 불가 — 건수로 대체, 확인 완료)
  const [newRegions, setNewRegions] = useState([]); // [이야기 탭] REGIONS에 새로 추가된 동(로컬 "본 목록" 대비)
  const [news, setNews] = useState(null); // [뉴스 통합] 오늘의 뉴스 — 부모가 한 번 fetch 해 카테고리별로 나눠 쓴다
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
  const [nick, setNick] = useState("나"); // [닉네임] 나 vs AI에서 "나" 대신 표시
  const [view, setView] = useState(0); // [OS-2] 0=대결 1=부동산 2=ETF 3=이야기 — 종목변경 순환에 맞춰 콘텐츠 필터
  const [trendClick, setTrendClick] = useState(null); // [사용자 지시] 그래프 클릭 시 그 시점 판단 차이를 그 자리에서 설명(AI 페이지로 이동 안 함)

  const load = useCallback(() => {
    const tr = getTrader();
    initGameSync(tr); // [2026-08-05] 시드/닉네임/원장 서버 하이드레이션 + 이후 변경 서버 미러링
    setStatus((s) => (dash ? "stale" : "loading"));
    let myProp = null;
    try { myProp = JSON.parse(localStorage.getItem("onehub_re_my_property") || "null"); setMyComplex(myProp?.name || ""); } catch (e) {}
    try { setDecisions(getDecisionLedger(tr) || []); } catch (e) { setDecisions([]); }
    // [2026-08-03] 나 vs AI 누적 손익이 매일 시드머니로 리셋된 것처럼 보이던 버그 수정.
    //   matureLedger(스냅샷 축적)가 예전엔 index.js의 ?tab=report 진입 때만 돌아서, "오늘"
    //   페이지만 보는 사용자는 판단이 영영 성숙(3거래일 채점)되지 않아 늘 seed 그대로였다.
    //   "오늘"이 기본 랜딩이 된 지금은 여기서도 직접 성숙시켜야 한다.
    const fetchPrice = async (code) => {
      try {
        const r = await fetch(`/api/analyze-stock?code=${code}`);
        const d = await r.json();
        return Number(d?.current_price ?? d?.price) || null;
      } catch { return null; }
    };
    matureLedger(tr, fetchPrice).then((list) => setDecisions(list || [])).catch(() => {});
    Promise.all([
      fetch(`/api/pwa-dashboard?trader=${tr}`).then((r) => r.json()).catch(() => null),
      fetch(`/api/pwa-pending?trader=${tr}`).then((r) => r.json()).catch(() => null),
      fetch(`/api/pwa/re/feed`).then((r) => r.json()).catch(() => null),
      getAssetLedger(tr).catch(() => null),
    ]).then(([d, p, f, L]) => {
      setDash(d); setPend(p); setFeed(f); setLedger(L); setAt(new Date());
      setStatus(d || L ? "ok" : "error");
    });
    fetch(`/api/notifications?trader=${tr}`).then((r) => r.json())
      .then((n) => { if (n?.ok && Array.isArray(n.items)) setNotis(dedupBy(n.items, (x) => x.id ?? `${x.title || ""}|${x.body || ""}|${x.sent_at || x.created_at || ""}`)); }).catch(() => {});
    fetch(`/api/today/news`).then((r) => r.json())
      .then((d) => { setNews(Array.isArray(d?.items) ? d.items : []); }).catch(() => setNews([]));
    // [사용자 지시] 브리핑이 항상 백엔드 기본 지역(서현동)만 보여주던 문제 — 내 단지의 법정동을
    //   찾아 region= 으로 넘겨 "보유 주택 지역" 시황이 나오게 한다. 단지가 없거나 동을 못 찾으면
    //   기존처럼 기본 지역 그대로(에러 아님).
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
    {
      const region = getStoryRegionOverride() || Object.values(REGIONS)[0][0];
      fetch(`/api/comments?date=${encodeURIComponent(region)}`).then((r) => r.json())
        .then((d) => { if (Array.isArray(d?.comments)) setStoryComments(d.comments); }).catch(() => {});
    }
    // [이야기 탭] 지역별 이야기 건수 오늘치를 받아 로컬에 하루 1건 적립 → 전날 대비 증감 계산.
    fetch(`/api/story-region-stats`).then((r) => r.json())
      .then((d) => {
        if (!d?.ok || !d.counts) return;
        recordRegionSnapshot(d.counts);
        setRegionDelta(getRegionDelta());
      }).catch(() => {});
    setNewRegions(getNewRegions());
    if (myProp?.name) fetch(`/api/input/re-spot?complex_name=${encodeURIComponent(myProp.name)}`).then((r) => r.json())
      .then((s) => { if (s?.ok && Array.isArray(s.items)) setOpNotes(s.items); }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dash]);

  useEffect(() => {
    load();
    const on = () => load();
    window.addEventListener("onehub-trader-change", on);
    window.addEventListener("onehub-assets-change", on);
    return () => {
      window.removeEventListener("onehub-trader-change", on);
      window.removeEventListener("onehub-assets-change", on);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setNick(getNickname());
    const on = () => setNick(getNickname());
    window.addEventListener("onehub-game-change", on);
    return () => window.removeEventListener("onehub-game-change", on);
  }, []);

  const dismissNewRegions = useCallback((e) => {
    e.stopPropagation();
    ackNewRegions();
    setNewRegions([]);
  }, []);

  const editNickname = useCallback((e) => {
    e.stopPropagation();
    const cur = getNickname();
    const next = typeof window !== "undefined" ? window.prompt("나 vs AI에서 쓸 닉네임 (8자 이내)", cur === "나" ? "" : cur) : null;
    if (next != null) setNickname(next);
  }, []);

  const positions = parsePositions(dash);
  const regime = regimeKo(dash?.market?.regime);
  const cands = dash?.recommend_stocks ?? [];
  const blocked = dash?.today_blocked ?? [];
  const pendItems = pend?.ok ? (pend.items ?? []) : [];

  // ── 결정 대기: 승인 대기 + 손절선 임박(주식 · 나 vs AI 도메인의 액션 항목)
  const nearStop = positions.filter((p) => {
    const sl = Number(p.stop_loss) || 0, cur = Number(p.current_price) || 0;
    return sl > 0 && cur > 0 && cur <= sl * 1.02;
  });

  const blockLine = blocked.length > 0
    ? `AI가 ${cands.length + blocked.length > 0 ? `후보 ${cands.length + blocked.length}종목 중 ` : ""}${blocked.length}종목을 매수 기준 미달로 걸렀습니다.`
    : cands.length > 0
    ? `AI가 매수 후보 ${cands.length}종목을 추렸습니다.`
    : "오늘은 AI가 살펴본 종목 중 매수 기준을 넘은 게 없습니다.";

  // ── 나 vs AI: 채점 임박 + 이미 채점된 승부
  const tr2 = trader || "A";
  const mine = decisions.filter((d) => (d.trader || "A") === tr2);
  const pendingJudge = mine.filter((d) => Date.now() - d.ts < MATURE_DAYS * DAY);
  const soonest = pendingJudge.length ? Math.min(...pendingJudge.map((d) => d.ts)) + MATURE_DAYS * DAY : null;
  const vsShowdown = (() => {
    const w3 = computeShowdown(mine, 3);
    if (w3.ready) return w3;
    const w7 = computeShowdown(mine, 7);
    return w7.ready ? w7 : null;
  })();
  const vsMax = vsShowdown ? Math.max(Math.abs(vsShowdown.myRet), Math.abs(vsShowdown.aiRet), 1) : 1;
  // [사용자 지시] AI 페이지 "나 vs AI 가상 지갑 대결" 카드와 동일한 방식 — 시드가 설정돼 있으면
  //   vsShowdown(3·7일 채점 완료)을 기다리지 않고 항상 지갑 대시보드를 보여준다(3일 창으로 고정,
  //   AI 페이지 game-dash와 동일). 정산분이 없으면 seed 그대로 잔고만 보여주고 그래프는 숨김.
  const wallet = computeWallets(computeShowdown(mine, 3), getSeed());
  const walletNarr = wallet ? streakNarrative(wallet.settled) : null;
  // [사용자 지시] x축 한 칸 = 하루. 같은 날 여러 종목이 정산되면 그날 하나의 점으로 묶는다
  //   (예전엔 정산 건마다 점을 찍어 같은 날짜 라벨이 여러 번 반복됐다).
  const dLabel = (ts) => { const d = new Date(ts); return `${d.getMonth() + 1}/${d.getDate()}`; };
  const walletTrend = (() => {
    if (!wallet || !wallet.settled.length) return [];
    const chron = [...wallet.settled].sort((a, b) => a.ts - b.ts);
    const byDay = new Map();
    chron.forEach((s) => {
      const key = dLabel(s.ts);
      if (!byDay.has(key)) byDay.set(key, []);
      byDay.get(key).push(s);
    });
    let myCum = wallet.seed, aiCum = wallet.seed;
    // 시드(출발) 지점은 첫 정산일과 날짜가 겹치지 않도록 하루 전으로 표기.
    const startLabel = dLabel(chron[0].ts - DAY);
    const t = [{ label: startLabel, [nick]: myCum, AI: aiCum, _ev: null }];
    [...byDay.entries()].forEach(([label, items]) => {
      const myPnl = items.reduce((s, it) => s + (it.myPnl || 0), 0);
      const aiPnl = items.reduce((s, it) => s + (it.aiPnl || 0), 0);
      myCum += myPnl; aiCum += aiPnl;
      t.push({ label, [nick]: myCum, AI: aiCum, _ev: { date: label, items, myPnl, aiPnl } });
    });
    return t;
  })();
  // [사용자 지시] 며칠째·언제부터 대결 중인지 그래프 위에 간단히 표기
  const walletDaysIn = wallet && wallet.settled.length
    ? Math.max(1, Math.floor((Date.now() - Math.min(...wallet.settled.map((s) => s.ts))) / DAY) + 1)
    : 0;
  const walletStartLabel = wallet && wallet.settled.length ? dLabel(Math.min(...wallet.settled.map((s) => s.ts))) : "";
  // [사용자 지시] 그래프 클릭 → AI 페이지로 안 넘어가고 그 지점 판단 차이를 간단히 설명
  const onWalletTrendClick = (e) => setTrendClick(e?.activePayload?.[0]?.payload?._ev || null);
  // [사용자 지시] 그래프 아래 날짜별 차이 금액 옆에 왜 차이 나는지(종목·금액) 간단히 나열 —
  //   클릭하지 않아도 바로 보이도록. 최근 정산분부터 최대 4건.
  const walletDiffLines = wallet ? [...wallet.settled].sort((a, b) => b.ts - a.ts).slice(0, 4).map((s) => ({
    key: s.ts, date: `${new Date(s.ts).getMonth() + 1}/${new Date(s.ts).getDate()}`, name: s.name,
    diff: (s.myPnl || 0) - (s.aiPnl || 0),
  })) : [];

  // ── AI 학습 진행도
  const pol = samplePolicy(mine.length);

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
  const stockTodos = [
    ...nearStop.slice(0, 3).map((p, i) => {
      const sl = Number(p.stop_loss) || 0;
      const cur = Number(p.current_price) || 0;
      const breached = sl > 0 && cur > 0 && cur < sl;
      const distPct = sl > 0 && cur > 0 ? (cur / sl - 1) * 100 : null;
      return {
        key: `stop-${p.code || i}`,
        title: `${p.name} ${pctTxt(p.pnl_rate)}`,
        sub: breached ? `손절선 ${sl.toLocaleString()}원 이탈 — 매도 검토 필요` : `손절선까지 ${Math.abs(distPct).toFixed(1)}% 남음`,
        onClick: () => router.push("/pwa?tab=portfolio"),
      };
    }),
    ...pendItems.slice(0, 3).map((p, i) => ({
      key: `pend-${p.code || i}`,
      title: p.name || p.stock || p.code,
      sub: p.reason || "AI 매수 제안 — 승인/거절 필요",
      onClick: () => router.push("/pwa?tab=portfolio"),
    })),
    ...criticalNotis.map((n, i) => ({
      key: `noti-${n.id ?? i}`,
      title: n.title || n.message || "알림",
      sub: null,
      onClick: null,
    })),
  ];
  const [checked, setChecked] = useState(() => new Set());
  useEffect(() => {
    try {
      const raw = localStorage.getItem(`onehub_today_check_${todayStr}`);
      if (raw) setChecked(new Set(JSON.parse(raw)));
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const toggleCheck = (key) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      try { localStorage.setItem(`onehub_today_check_${todayStr}`, JSON.stringify([...next])); } catch {}
      return next;
    });
  };

  return (
    <div className="td">
      <header className="td-hd">
        <button className="td-logo" onClick={() => router.push("/pwa/today")} aria-label="오늘">ONE<span className="td-dot">·</span>HUB</button>
        <div className="td-ic">
          <TraderBadge />
          <button className="td-search" onClick={() => router.push("/pwa?tab=analyze")} aria-label="AI 종목 검색">🔍</button>
          <FeedbackButton variant="icon" />
          <button className="td-search" onClick={() => router.push("/pwa/settings")} aria-label="설정">⚙️</button>
        </div>
      </header>

      <div className="td-titlewrap">
        <RotatingPageTitle
          fixed="오늘"
          mutedSuffix
          items={[{ suffix: "의 대결" }, { suffix: "의 부동산" }, { suffix: "의 ETF" }, { suffix: "의 이야기" }]}
          onChange={(i) => setView(i)}
          onLabelClick={(item) => { if (item.suffix === "의 이야기") router.push("/pwa/story"); }}
        />
      </div>
      {/* [사용자 지시] KRX/NXT 장운영 배지는 "오늘의 대결"(주식) 탭에서만 — 부동산/ETF/이야기엔 불필요 */}
      <div className="td-market">{view === 0 && <MarketStatusBadge />}{at && <span className="td-fresh3"><LastUpdated timestamp={at} onRefresh={load} /></span>}</div>

      <DataState status={status} hasData={!!dash || !!ledger} onRetry={load} skeletonLines={4} skeletonBlock>

        {/* ══ "오늘의 대결" — 카드1(대결) · 카드2(주식 뉴스) · 카드3(주식 할일) 3장으로 통일 ══ */}
        {view === 0 && (<>
        {/* 카드1 — AI vs 나 · 주식. [사용자 지시] AI 페이지 "나 vs AI 가상 지갑 대결" 카드 형식을
            그대로 재사용하되 이 카드는 밝은 카드로(다른 두 카드와 통일), 최대한 한 줄 요약. */}
        <section className="card hero" onClick={() => router.push("/pwa?tab=report&sec=vs")} role="button" tabIndex={0}>
          <div className="hero-eyebrow">
            <span className="hero-lbl">⚔ AI vs 나 · 주식 대결{regime ? ` · ${regime}` : ""}</span>
            <span className="hero-virtual">가상·모의</span>
          </div>

          {wallet ? (
            <>
              {walletNarr && <div className="hero-narr">📖 {walletNarr}</div>}
              <div className="hero-wallets">
                <div className="hero-w">
                  <button type="button" className="hero-wl" onClick={editNickname} title="닉네임 바꾸기">{nick} ✎</button>
                  <b className="hero-wb">{wonNum(wallet.myBalance)}</b>
                  <span className={`hero-wg ${wallet.myGain > 0 ? "up" : wallet.myGain < 0 ? "dn" : ""}`}>{wallet.myGain > 0 ? "+" : ""}{wonG(wallet.myGain)}</span>
                </div>
                <div className="hero-vs">VS</div>
                <div className="hero-w">
                  <span className="hero-wl">AI</span>
                  <b className="hero-wb">{wonNum(wallet.aiBalance)}</b>
                  <span className={`hero-wg ${wallet.aiGain > 0 ? "up" : wallet.aiGain < 0 ? "dn" : ""}`}>{wallet.aiGain > 0 ? "+" : ""}{wonG(wallet.aiGain)}</span>
                </div>
              </div>
              <div className="hero-bar"><div className="hero-bar-me" style={{ width: `${Math.max(6, Math.min(94, wallet.myBalance + wallet.aiBalance > 0 ? (wallet.myBalance / (wallet.myBalance + wallet.aiBalance)) * 100 : 50))}%` }} /></div>
              <div className="hero-lead">
                {wallet.leader === "me" ? <b className="up">🏆 내가 {wonG(Math.abs(wallet.diff))} 앞섬</b> : wallet.leader === "ai" ? <b className="dn">🤖 AI가 {wonG(Math.abs(wallet.diff))} 앞섬</b> : <b>⚖️ 접전</b>} · 매판 잔고의 {Math.round((wallet.betPct ?? 0.1) * 100)}%(복리, 가상)
                <ShareButton compact title="ONE-HUB 나 vs AI 대결"
                  text={wallet.leader === "me" ? `내가 AI보다 ${wonG(Math.abs(wallet.diff))} 앞서고 있어요! 나도 AI랑 대결해볼래?` : wallet.leader === "ai" ? `AI한테 ${wonG(Math.abs(wallet.diff))} 지고 있어요 — 나도 AI랑 대결해볼래?` : "AI와 팽팽한 접전 중! 나도 대결해볼래?"}
                  url="https://one-hub-content.vercel.app/pwa/today" />
              </div>
              {walletTrend.length > 1 && (
                // [사용자 지시] 그래프는 클릭해도 AI 페이지로 이동하지 않고 그 자리에서 설명 — 카드 전체의
                //   onClick(navigate)이 버블링으로 걸려도 여기서 멈춘다.
                <div className="hero-trend" onClick={(e) => e.stopPropagation()}>
                  <div className="hero-trend-top">
                    <span className="hero-trend-days">{walletDaysIn}일째 · {walletStartLabel} 시작</span>
                  </div>
                  <ResponsiveContainer width="100%" height={130}>
                    <LineChart data={walletTrend} margin={{ top: 6, right: 8, left: 0, bottom: 0 }} onClick={onWalletTrendClick}>
                      <XAxis dataKey="label" stroke="var(--color-ink-3)" fontSize={10} tickLine={false} />
                      <YAxis hide domain={["dataMin", "dataMax"]} />
                      <Line type="monotone" dataKey={nick} stroke="var(--color-success)" strokeWidth={2} dot={{ r: 2, cursor: "pointer" }} activeDot={{ r: 5, cursor: "pointer" }} />
                      <Line type="monotone" dataKey="AI" stroke="var(--purple)" strokeWidth={2} dot={{ r: 2, cursor: "pointer" }} activeDot={{ r: 5, cursor: "pointer" }} />
                    </LineChart>
                  </ResponsiveContainer>
                  {trendClick ? (
                    <div className="hero-trend-explain">
                      <button type="button" className="hero-trend-x" onClick={() => setTrendClick(null)} aria-label="닫기">✕</button>
                      <div className="hero-trend-explain-t">{trendClick.date} · {trendClick.items.length}종목 정산</div>
                      {trendClick.items.map((it, i) => (
                        <div className="hero-trend-explain-b" key={i}>
                          {it.name} · 나:{it.decision === "take" ? "매수" : "관망"} · AI:매수 · 가격 {it.ret >= 0 ? "+" : ""}{it.ret}%
                          {" · "}{nick} <b className={it.myPnl >= 0 ? "up" : "dn"}>{wonG(it.myPnl)}</b> vs AI <b className={it.aiPnl >= 0 ? "up" : "dn"}>{wonG(it.aiPnl)}</b>
                        </div>
                      ))}
                      {trendClick.items.length > 1 && (
                        <div className="hero-trend-explain-b">
                          합계 차이 <b className={(trendClick.myPnl - trendClick.aiPnl) >= 0 ? "up" : "dn"}>{(trendClick.myPnl - trendClick.aiPnl) >= 0 ? "+" : ""}{wonG(trendClick.myPnl - trendClick.aiPnl)}</b>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="hero-trend-hint">점을 눌러보세요 — 그날 차이를 바로 설명해 드립니다</div>
                  )}
                  {/* [사용자 지시] 날짜별 차이 금액 옆에 원인(종목)을 클릭 없이 바로 표기 */}
                  {walletDiffLines.length > 0 && (
                    <div className="hero-diff-list">
                      {walletDiffLines.map((l) => (
                        <div className="hero-diff-row" key={l.key}>
                          <span className="hero-diff-date">{l.date}</span>
                          <span className="hero-diff-name">{l.name}</span>
                          <span className={`hero-diff-amt ${l.diff >= 0 ? "up" : "dn"}`}>{l.diff >= 0 ? "+" : ""}{wonG(l.diff)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {pendingJudge.length > 0 && (
                <div className="hero-pending">
                  <div className="hero-ph">⏳ 진행 중 대결 {pendingJudge.length}건 — 매일 마크투마켓, 3일째 확정</div>
                  {pendingJudge.slice(0, 4).map((e, i) => {
                    const elapsed = Math.floor((Date.now() - e.ts) / DAY);
                    const dday = Math.max(0, MATURE_DAYS - elapsed);
                    // [사용자 지시] 1일/3일/5일 체크포인트로 나열 — 최종 판정(3일)은 그대로,
                    //   이미 쌓인 일별 가격 스냅샷(entry.snaps)으로 진행상황만 매일 미리보기.
                    const snapAt = (daysAfter) => {
                      const target = e.ts + daysAfter * DAY;
                      const list = (e.snaps || []).filter((s) => s.ts <= target).sort((a, b) => b.ts - a.ts);
                      return list[0] || null;
                    };
                    const retAt = (daysAfter) => {
                      const s = snapAt(daysAfter);
                      return s && e.entry ? (s.price / e.entry - 1) * 100 : null;
                    };
                    const ret1 = elapsed >= 1 ? retAt(1) : null;
                    return (
                      <div className="hero-prow2" key={i}>
                        <div className="hero-prow-top"><span className="hero-pn">{e.name}</span><span className="hero-pj">나:{e.decision === "take" ? "매수" : "관망"} · AI:매수</span><span className="hero-dday">D-{dday}</span></div>
                        <div className="hero-pcheck">1일차 {ret1 != null ? pctTxt(ret1) : "당일"} · 3일차(확정) D-{dday} · 5일차 참고 예정</div>
                      </div>
                    );
                  })}
                </div>
              )}
              {wallet.settled.length > 0 && (
                <div className="hero-recent">
                  <div className="hero-ph">🏁 최근 결과</div>
                  {wallet.settled.slice(0, 4).map((s, i) => (
                    <div className="hero-rrow" key={i}><span className="hero-rw">{s.winner === "me" ? "🏆" : s.winner === "ai" ? "💀" : "⚖️"}</span><span className="hero-pn">{s.name}</span><span className={`hero-rret ${s.ret >= 0 ? "up" : "dn"}`}>{s.ret >= 0 ? "+" : ""}{s.ret}%</span><span className="hero-rwin">{s.winner === "me" ? "나 승" : s.winner === "ai" ? "AI 승" : "무"}</span></div>
                  ))}
                </div>
              )}
              <div className="hero-foot">🎮 가상·모의 게임 · 실제 자산 아님 · 판단은 본인 책임(투자자문 아님) · <button type="button" className="hero-reset" onClick={(e) => { e.stopPropagation(); if (typeof window === "undefined" || window.confirm("게임을 초기화할까요? (가상 지갑만 리셋, 판단 기록은 유지)")) resetSeed(); }}>시드 변경</button></div>
            </>
          ) : vsShowdown ? (
            <>
              <div className="vsbars">
                <div className="vsrow">
                  <span className="vsrow-lbl" onClick={editNickname} role="button" tabIndex={0} title="닉네임 바꾸기">{nick} ✎</span>
                  <span className="vsrow-track"><span className={`vsrow-fill ${vsShowdown.myRet >= 0 ? "up" : "dn"}`} style={{ width: `${Math.min(100, (Math.abs(vsShowdown.myRet) / vsMax) * 100)}%` }} /></span>
                  <span className={`vsrow-val ${vsShowdown.myRet >= 0 ? "up" : "dn"}`}>{pctTxt(vsShowdown.myRet)}</span>
                </div>
                <div className="vsrow">
                  <span className="vsrow-lbl">AI</span>
                  <span className="vsrow-track"><span className={`vsrow-fill ${vsShowdown.aiRet >= 0 ? "up" : "dn"}`} style={{ width: `${Math.min(100, (Math.abs(vsShowdown.aiRet) / vsMax) * 100)}%` }} /></span>
                  <span className={`vsrow-val ${vsShowdown.aiRet >= 0 ? "up" : "dn"}`}>{pctTxt(vsShowdown.aiRet)}</span>
                </div>
              </div>
              <div className="hero-sub">{vsShowdown.winner === "me" ? "내 판단 승" : vsShowdown.winner === "ai" ? "AI 승" : "무승부"}{pendingJudge.length > 0 ? ` · 채점 중 ${pendingJudge.length}건` : ""}</div>
              <ShareButton compact title="ONE-HUB · 나 vs AI" text={`나 ${pctTxt(vsShowdown.myRet)} vs AI ${pctTxt(vsShowdown.aiRet)} — 나도 AI랑 대결해볼래?`} url="https://one-hub-content.vercel.app/pwa/today" />
            </>
          ) : pendingJudge.length > 0 ? (
            <>
              <div className="hero-big"><span className="live-dot" />{pendingJudge.length}건 채점 중</div>
              <div className="hero-sub">내 판단과 AI를 3거래일 뒤 비교해요 · 결과는 {soonest ? mmdd(soonest) : "-"}부터</div>
            </>
          ) : cands.length > 0 ? (
            <>
              <div className="hero-big">AI 매수 후보 {cands.length}종목</div>
              <div className="hero-sub">{blockLine}</div>
              <button className="hero-cta" onClick={(e) => { e.stopPropagation(); router.push("/pwa?tab=recommend"); }}>오늘 판단하기 →</button>
            </>
          ) : (
            <>
              <div className="hero-big hero-quiet">오늘은 관망</div>
              <div className="hero-sub">{blockLine}</div>
              {mine.length === 0 ? (
                <button className="hero-cta" onClick={(e) => { e.stopPropagation(); router.push("/pwa?tab=analyze"); }}>첫 판단으로 시작하기 →</button>
              ) : blocked.length > 0 ? (
                <button className="hero-cta ghost" onClick={(e) => { e.stopPropagation(); router.push("/pwa?tab=report&sec=verify"); }}>무엇을 왜 걸렀나 →</button>
              ) : null}
            </>
          )}
          {!wallet && <div className="hero-foot">누적 판단 {pol.count}건{pol.remaining > 0 ? ` · ${pol.remaining}건 남으면 채점 통계 공개` : ""}</div>}
        </section>

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

        {/* 카드3 — 오늘의 할 일 · 주식(체크리스트, 매일 자정 초기화) */}
        <section className="card sc">
          <div className="sc-h">오늘의 할 일 · 주식</div>
          {stockTodos.length === 0 ? (
            <div className="sc-empty">오늘은 특별히 할 일이 없어요 · 관망</div>
          ) : (
            <div className="sc-list">
              {stockTodos.map((t) => {
                const done = checked.has(t.key);
                return (
                  <div className={`sc-row ${done ? "done" : ""}`} key={t.key}>
                    <button type="button" className="sc-check" onClick={() => toggleCheck(t.key)} aria-label={done ? "완료 취소" : "완료 표시"}>{done ? "✓" : ""}</button>
                    <button type="button" className="sc-body" onClick={() => (t.onClick ? t.onClick() : toggleCheck(t.key))}>
                      <span className="sc-t">{t.title}</span>
                      {t.sub && <span className="sc-s">{t.sub}</span>}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </section>
        </>)}

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

        {/* 카드2 — [사용자 지시] 오늘의 할 일 · ETF (체크박스로 확인 후 취소선) */}
        {view === 2 && (() => {
          const todo = [myEtfNews, ...etfNews].filter(Boolean).filter((n, i, arr) => arr.findIndex((x) => x.id === n.id) === i).slice(0, 3);
          return (
            <section className="card sc">
              <div className="sc-h">✅ 오늘의 할 일 · ETF</div>
              {todo.length > 0 ? (
                <div className="sc-list">
                  {todo.map((n) => {
                    const key = `etf-${n.id}`;
                    const done = checked.has(key);
                    return (
                      <div className={`sc-row ${done ? "done" : ""}`} key={key}>
                        <button type="button" className="sc-check" onClick={() => toggleCheck(key)} aria-label={done ? "완료 취소" : "완료 표시"}>{done ? "✓" : ""}</button>
                        <button type="button" className="sc-body" onClick={() => openNewsDetail(n)}>
                          <span className="sc-t">{n.headline}</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="sc-empty">오늘은 특별히 확인할 ETF 이슈가 없어요.</div>
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
        {view === 3 && (
          <section className="card tile" onClick={() => router.push("/pwa/story")} role="button" tabIndex={0}>
            <div className="tile-h">💬 오늘의 이야기</div>
            <p className="tile-headline">{storyHeadline}</p>
          </section>
        )}
        {view === 3 && STORY_CATS.map(([cat, ic]) => {
          const items = cat === "기타"
            ? storyComments.filter((c) => (c.category || "전체") === "전체")
            : storyComments.filter((c) => c.category === cat);
          return (
            <section className="card tile story-cat" key={cat} onClick={() => router.push("/pwa/story")} role="button" tabIndex={0}>
              <div className="tile-h">{ic} {cat} 이야기 <span className="story-cat-n">{items.length}</span></div>
              {items.length > 0 ? (
                <div className="story-cat-list">
                  {items.slice(-2).reverse().map((c) => (
                    <div className="story-cat-row" key={c.id}>
                      <span className="story-cat-nick">{c.nick}</span>
                      <span className="story-cat-text">{c.text}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="tile-empty">아직 {cat} 이야기가 없어요. 첫 글을 남겨보세요.</div>
              )}
            </section>
          );
        })}

        {/* ══ 지역별 이야기 건수 증감 — [확인 완료] 참석자(고유 사용자) 추적 장치가 없어
             동별 이야기 "건수" 증감으로 대체(lib/storyRegionHistory.js, 로컬 일별 스냅샷) ══ */}
        {view === 3 && (
          <section className="card tile">
            <div className="tile-h">📊 지역별 이야기 증감</div>
            {regionDelta ? (
              regionDelta.deltas.filter((d) => d.delta !== 0).length > 0 ? (
                <div className="story-cat-list">
                  {regionDelta.deltas.filter((d) => d.delta !== 0).slice(0, 5).map((d) => (
                    <div className="story-cat-row" key={d.region}>
                      <span className="story-cat-nick">{d.region}</span>
                      <span className="story-cat-text">{d.count}건</span>
                      <span className={d.delta > 0 ? "story-delta-up" : "story-delta-down"}>
                        {d.delta > 0 ? "▲" : "▼"}{Math.abs(d.delta)}
                      </span>
                    </div>
                  ))}
                  <p className="tile-sub">{regionDelta.prevDate} 대비</p>
                </div>
              ) : (
                <div className="tile-empty">어제와 비교해 변화가 없어요.</div>
              )
            ) : (
              <div className="tile-empty">데이터를 쌓는 중이에요 — 내일부터 전날 대비 증감이 보여요.</div>
            )}
          </section>
        )}

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
        .td-hd { display: flex; align-items: center; justify-content: space-between; padding: calc(env(safe-area-inset-top, 0px) + 12px) 2px 10px; }
        .td-logo { font-weight: 800; font-size: 20px; letter-spacing: -.5px; color: var(--color-ink); background: none; border: none; padding: 0; cursor: pointer; font-family: var(--font-sans); }
        .td-dot { color: var(--color-success); }
        .td-ic { display: flex; align-items: center; gap: 8px; }
        .td-search { width: 34px; height: 34px; border-radius: 50%; background: var(--color-card); border: none; display: grid; place-items: center; font-size: 15px; cursor: pointer; box-shadow: var(--shadow-card); }
        .td-titlewrap { display: flex; align-items: center; gap: 8px; margin: 6px 2px 6px; }
        .td-market { display: flex; align-items: center; gap: 10px; background: var(--color-card); border: 1px solid var(--color-line); border-radius: 12px; padding: 8px 12px; margin: 0 2px 14px; box-shadow: var(--shadow-card); }
        .td-fresh3 { margin-left: auto; }
        .card { background: var(--color-card); border: 1px solid var(--color-line); border-radius: var(--radius-card, 14px); padding: 16px; margin-bottom: 12px; box-shadow: var(--shadow-card); }
        .td-modal-bg { position: fixed; inset: 0; z-index: 300; background: rgba(10,15,25,.5); display: flex; align-items: flex-end; justify-content: center; }
        .td-modal { position: relative; width: 100%; max-width: 480px; max-height: 78vh; overflow-y: auto; background: var(--color-card); border-radius: 18px 18px 0 0; padding: 22px 20px calc(env(safe-area-inset-bottom, 0px) + 22px); }
        .td-modal-close { position: absolute; top: 14px; right: 14px; width: 30px; height: 30px; border-radius: 50%; border: none; background: var(--color-card-soft, var(--color-line)); color: var(--color-ink-2); font-size: 14px; cursor: pointer; }
        .td-modal-h { font-size: 1.02rem; font-weight: 800; color: var(--color-ink); line-height: 1.4; margin: 10px 40px 6px 0; word-break: keep-all; }
        .td-modal-meta { font-size: 0.72rem; color: var(--color-ink-3); margin-bottom: 14px; }
        .td-modal-body { font-size: 0.86rem; color: var(--color-ink-2); line-height: 1.7; word-break: keep-all; display: flex; flex-direction: column; gap: 8px; }
        .td-modal-share { margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--color-line); display: flex; justify-content: flex-end; }

        /* ══ 카드1: AI vs 나 · 주식 — [사용자 지시] 3카드 모두 밝은 카드로 통일(.card가 배경/테두리/
           그림자 제공), 여기선 클릭 가능 커서만 추가. 하위 요소는 전부 잉크 토큰(라이트 카드용)으로. ══ */
        .hero { cursor: pointer; }
        .hero-eyebrow { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 14px; }
        .hero-lbl { font-size: 12px; font-weight: 700; color: var(--color-ink-3); }
        .hero-virtual { font-size: 10px; font-weight: 800; color: var(--color-ink-3); background: var(--color-card-soft); border-radius: 999px; padding: 2px 8px; flex-shrink: 0; }
        .hero-narr { font-size: 0.76rem; color: var(--color-ink-2); background: var(--color-card-soft); border-radius: 9px; padding: 7px 10px; margin-bottom: 10px; word-break: keep-all; }
        .up { color: var(--color-success); } .dn { color: var(--purple, var(--color-danger)); }
        .vsbars { display: flex; flex-direction: column; gap: 9px; margin-bottom: 10px; }
        .vsrow { display: flex; align-items: center; gap: 9px; }
        .vsrow-lbl { flex: none; width: 22px; font-size: 12px; font-weight: 800; color: var(--color-ink-2); background: none; border: none; padding: 0; cursor: pointer; font-family: var(--font-sans); }
        .vsrow-track { flex: 1; height: 9px; border-radius: 999px; background: var(--color-card-soft); overflow: hidden; }
        .vsrow-fill { display: block; height: 100%; border-radius: 999px; }
        .vsrow-fill.up { background: var(--color-success); }
        .vsrow-fill.dn { background: var(--color-danger); }
        .vsrow-val { flex: none; width: 62px; text-align: right; font-family: ui-monospace, monospace; font-size: 13px; font-weight: 800; font-variant-numeric: tabular-nums; }
        .vsrow-val.up { color: var(--color-success); }
        .vsrow-val.dn { color: var(--color-danger); }
        /* [사용자 지시] AI 페이지 "나 vs AI 가상 지갑 대결" 형식 — 지갑 잔고 박스 + VS + 진행률 바 */
        .hero-wallets { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
        .hero-w { flex: 1; display: flex; flex-direction: column; gap: 3px; align-items: center; background: var(--color-card-soft); border-radius: 12px; padding: 12px 6px; text-align: center; }
        .hero-wl { font-size: 11px; font-weight: 700; color: var(--color-ink-2); background: none; border: none; padding: 0; cursor: pointer; font-family: var(--font-sans); }
        .hero-wb { font-size: 1.05rem; font-weight: 900; font-family: ui-monospace, monospace; color: var(--color-ink); }
        .hero-wg { font-size: 11px; font-weight: 800; font-family: ui-monospace, monospace; }
        .hero-wg.up { color: var(--color-success); } .hero-wg.dn { color: var(--color-danger); }
        .hero-vs { font-size: 12px; font-weight: 900; color: var(--color-ink-3); flex-shrink: 0; }
        .hero-bar { height: 8px; border-radius: 4px; background: var(--color-card-soft); overflow: hidden; margin-bottom: 10px; }
        .hero-bar-me { height: 100%; background: var(--color-success); border-radius: 4px; transition: width .4s; }
        .hero-lead { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; font-size: 0.76rem; color: var(--color-ink-2); word-break: keep-all; }
        .hero-trend { margin: 10px -4px 2px; }
        .hero-trend-top { padding: 0 4px; margin-bottom: 2px; }
        .hero-trend-days { font-size: 0.66rem; font-weight: 700; color: var(--color-ink-3); }
        .hero-trend-hint { font-size: 0.64rem; color: var(--color-ink-3); text-align: center; margin-top: 2px; }
        .hero-trend-explain { position: relative; margin-top: 6px; padding: 9px 24px 9px 9px; background: var(--color-card-soft); border-radius: 9px; }
        .hero-trend-x { position: absolute; top: 5px; right: 5px; width: 18px; height: 18px; border: none; background: none; color: var(--color-ink-3); font-size: 10px; cursor: pointer; }
        .hero-trend-explain-t { font-size: 0.74rem; font-weight: 800; color: var(--color-ink); margin-bottom: 3px; }
        .hero-trend-explain-b { font-size: 0.72rem; color: var(--color-ink-2); line-height: 1.5; word-break: keep-all; }
        .hero-diff-list { display: flex; flex-direction: column; margin-top: 6px; }
        .hero-diff-row { display: flex; align-items: center; gap: 8px; padding: 4px 2px; font-size: 0.7rem; }
        .hero-diff-date { flex: none; color: var(--color-ink-3); font-family: ui-monospace, monospace; }
        .hero-diff-name { flex: 1; min-width: 0; color: var(--color-ink-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .hero-diff-amt { flex: none; font-weight: 800; font-family: ui-monospace, monospace; }
        .hero-pending, .hero-recent { margin-top: 10px; padding-top: 10px; border-top: 1px dashed var(--color-line); display: flex; flex-direction: column; gap: 5px; }
        .hero-ph { font-size: 0.68rem; font-weight: 800; color: var(--color-ink-3); margin-bottom: 2px; }
        .hero-prow, .hero-rrow { display: flex; align-items: center; gap: 7px; font-size: 0.74rem; }
        .hero-prow2 { display: flex; flex-direction: column; gap: 2px; padding: 3px 0; }
        .hero-prow-top { display: flex; align-items: center; gap: 7px; }
        .hero-pcheck { font-size: 0.64rem; color: var(--color-ink-3); }
        .hero-pn { flex: 1; min-width: 0; color: var(--color-ink); font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .hero-pj { flex: none; color: var(--color-ink-3); font-size: 0.68rem; }
        .hero-dday { flex: none; color: var(--color-warning-ink, var(--color-warning)); font-weight: 800; font-size: 0.68rem; }
        .hero-rw { flex: none; }
        .hero-rret { flex: none; font-weight: 800; font-family: ui-monospace, monospace; }
        .hero-rwin { flex: none; color: var(--color-ink-3); font-size: 0.68rem; }
        .hero-reset { border: none; background: none; color: var(--color-primary); font-weight: 800; cursor: pointer; padding: 0; font-family: var(--font-sans); font-size: inherit; }
        .hero-big { font-size: 22px; font-weight: 800; letter-spacing: -.4px; margin-bottom: 6px; display: flex; align-items: center; gap: 8px; color: var(--color-ink); }
        .hero-big.hero-quiet { color: var(--color-ink-2); font-size: 19px; }
        .hero-sub { font-size: 12.5px; color: var(--color-ink-2); line-height: 1.5; word-break: keep-all; margin-bottom: 4px; }
        .hero-cta { width: 100%; margin-top: 10px; min-height: 46px; border: none; border-radius: 12px; background: var(--color-primary); color: #fff; font-size: 0.88rem; font-weight: 800; cursor: pointer; font-family: var(--font-sans); }
        .hero-cta.ghost { background: var(--color-card-soft); color: var(--color-ink); border: 1px solid var(--color-line); }
        .hero-foot { font-size: 0.66rem; color: var(--color-ink-3); margin-top: 10px; padding-top: 10px; border-top: 1px dashed var(--color-line); }
        .live-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--color-success); display: inline-block; animation: td-pulse 1.6s ease-in-out infinite; }
        @keyframes td-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }

        /* ══ 카드2: 주식 뉴스 ══ */
        .sn-h { font-size: 0.86rem; font-weight: 800; color: var(--color-ink); margin-bottom: 8px; }
        .sn-sub { margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--color-line); }
        .sn-sub-h { font-size: 0.68rem; font-weight: 800; color: var(--color-ink-3); text-transform: uppercase; letter-spacing: .04em; margin-bottom: 6px; }

        /* ══ 카드3: 오늘의 할 일 · 주식(체크리스트, 매일 자정 초기화) ══ */
        .sc-h { font-size: 0.86rem; font-weight: 800; color: var(--color-ink); margin-bottom: 10px; }
        .sc-empty { font-size: 0.82rem; color: var(--color-ink-2); padding: 6px 2px; }
        .sc-list { display: flex; flex-direction: column; }
        .sc-row { display: flex; align-items: flex-start; gap: 10px; padding: 9px 2px; border-bottom: 1px solid var(--color-line); }
        .sc-row:last-child { border-bottom: none; }
        .sc-check { flex: none; width: 22px; height: 22px; margin-top: 1px; border-radius: 7px; border: 1.5px solid var(--color-line); background: var(--color-card-soft); color: #fff; font-size: 13px; font-weight: 900; display: grid; place-items: center; cursor: pointer; }
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

