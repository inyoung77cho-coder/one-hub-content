// [N4] '오늘' — 4대 그래픽 타일: ①주식·나 vs AI(히어로) ②ETF·부동산 ③리포트 ④종합자산 할일.
//   설계 원칙: 텍스트 단락 대신 숫자·막대·배지로 한눈에. 나 vs AI를 첫 화면 최상단 히어로로 승격.
//   데이터는 전부 기존 소스: 원장(lib/ledger) · /api/pwa-dashboard · /api/pwa-pending ·
//   /api/pwa/re/feed · lib/verdictLedger(판단 기록) · /api/today/news. 새로 만든 저장소 없음.
import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/router";
import { getTrader, useTrader } from "../../lib/trader";
import { dedupBy } from "../../lib/useDedup";
import { getLedger as getAssetLedger } from "../../lib/ledger";
import AutoReportCard from "../../components/AutoReportCard";
import HoldingsNews from "../../components/HoldingsNews";
import ReportTeaser from "../../components/ReportTeaser";
import { getLedger as getDecisionLedger, computeShowdown, matureLedger } from "../../lib/verdictLedger";
import { computeWallets, getSeed, wonG, getNickname, setNickname } from "../../lib/gameWallet";
import { samplePolicy } from "../../lib/sampleSize";
import { pickInsight } from "../../lib/crossInsight";
import TraderBadge from "../../components/shared/TraderBadge";
import BottomNav from "../../components/BottomNav";
import DataState from "../../components/DataState";
import LastUpdated from "../../components/LastUpdated";

const DAY = 86400000;
const MATURE_DAYS = 3; // 판단 → 채점까지(나 vs AI)
const CAT_KO = { global: "글로벌", macro: "거시", markets: "증시", realestate: "부동산", policy: "정책", affairs: "시사" };
const regimeKo = (r) => ({ BULL: "상승", BEAR: "하락", SIDE: "횡보", SIDEWAYS: "횡보", NEUTRAL: "중립" }[String(r || "").toUpperCase()] || null);
const pctTxt = (v) => `${Number(v) >= 0 ? "+" : ""}${Number(v).toFixed(2)}%`;
const mmdd = (ms) => { const d = new Date(ms); return `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

// 백엔드가 positions를 문자열로 주는 경우가 있어 방어적으로 파싱
function parsePositions(dash) {
  let p = dash?.balance?.positions;
  if (typeof p === "string") { try { p = JSON.parse(p); } catch { p = null; } }
  return Array.isArray(p) ? p : [];
}

export default function TodayPage({ reports }) {
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

  const load = useCallback(() => {
    const tr = getTrader();
    setStatus((s) => (dash ? "stale" : "loading"));
    try { const mp = JSON.parse(localStorage.getItem("onehub_re_my_property") || "null"); setMyComplex(mp?.name || ""); } catch (e) {}
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
    try {
      const mp = JSON.parse(localStorage.getItem("onehub_re_my_property") || "null");
      if (mp?.name) fetch(`/api/input/re-spot?complex_name=${encodeURIComponent(mp.name)}`).then((r) => r.json())
        .then((s) => { if (s?.ok && Array.isArray(s.items)) setOpNotes(s.items); }).catch(() => {});
    } catch (e) {}
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

  const editNickname = useCallback((e) => {
    e.stopPropagation();
    const cur = getNickname();
    const next = typeof window !== "undefined" ? window.prompt("나 vs AI에서 쓸 닉네임 (8자 이내)", cur === "나" ? "" : cur) : null;
    if (next != null) setNickname(next);
  }, []);

  const positions = parsePositions(dash);
  const regime = regimeKo(dash?.market?.regime);
  const regimeRaw = String(dash?.market?.regime || "").toUpperCase();
  const heat = dash?.market?.heat_score;
  const cands = dash?.recommend_stocks ?? [];
  const blocked = dash?.today_blocked ?? [];
  const pendItems = pend?.ok ? (pend.items ?? []) : [];

  // ── 결정 대기: 승인 대기 + 손절선 임박(주식 · 나 vs AI 도메인의 액션 항목)
  const nearStop = positions.filter((p) => {
    const sl = Number(p.stop_loss) || 0, cur = Number(p.current_price) || 0;
    return sl > 0 && cur > 0 && cur <= sl * 1.02;
  });
  const decideCount = pendItems.length + nearStop.length;

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
  // [금액 표기] 가상 시드머니 지갑(설정된 경우만) — 실제 매매와 완전 분리된 게임머니. 미설정이면 %만 표시.
  const wallet = vsShowdown ? computeWallets(vsShowdown, getSeed()) : null;
  // [며칠 경쟁] 첫 판단 기록일부터 오늘까지
  const daysCompeting = mine.length ? Math.max(1, Math.floor((Date.now() - Math.min(...mine.map((d) => d.ts))) / DAY) + 1) : 0;
  // [주요 판단 차이] 내가 관망(pass)했는데 결과가 크게 갈린 종목을 최우선(details는 이미 |ret| 내림차순) — 없으면 최대 변동 종목.
  const keyDiff = vsShowdown ? (vsShowdown.details.find((d) => d.decision === "pass") || vsShowdown.details[0]) : null;
  const keyDiffLine = keyDiff
    ? keyDiff.decision === "pass"
      ? `${keyDiff.name} 관망 — ${keyDiff.ret >= 0 ? `AI만 매수해 ${pctTxt(keyDiff.ret)} 앞섰습니다` : `손실 ${pctTxt(keyDiff.ret)}를 피해 유리했습니다`}`
      : `${keyDiff.name} — 나·AI 모두 매수, ${pctTxt(keyDiff.ret)}`
    : null;

  // ── AI 학습 진행도
  const pol = samplePolicy(mine.length);

  // ── 자산군 교차 판단 — 하루 1개
  const insight = pickInsight(ledger, { regime: dash?.market?.regime, heat: dash?.market?.heat_score, blockedCount: blocked.length });

  const bd = ledger?.breakdown || {};
  const ukTxt = (v) => (v == null || !Number.isFinite(Number(v)) ? null : `${Number(v).toFixed(1)}억`);

  // ── 뉴스: 카테고리로 타일 배분(①주식=증시, ②ETF·부동산=글로벌/거시/부동산/정책)
  const allNews = news || [];
  const stockNews = allNews.filter((n) => n.category === "markets").slice(0, 6);
  const macroNews = allNews.filter((n) => ["global", "macro", "realestate", "policy"].includes(n.category)).slice(0, 8);

  // ── 오늘 중요 알림(매매·손절·서킷 등) — 히어로에 접어 넣는다. OneHub 신고가·루틴 알림은 제외.
  const kd = new Date(Date.now() + 9 * 3600 * 1000);
  const todayStr = `${kd.getUTCFullYear()}-${String(kd.getUTCMonth() + 1).padStart(2, "0")}-${String(kd.getUTCDate()).padStart(2, "0")}`;
  const RT = /오늘 해야 하는 것|전략 성과|최근 30일|Report|리포트|브리핑|Morning|Evening|Started|Status/i;
  const IMP = /매수|매도|체결|손절|익절|승인|신호|차단|자율|서킷|circuit|오류|error|급등|급락|주문|대결|승부|채점|OPEN|CLOSED/i;
  const criticalNotis = notis.filter((n) => {
    const ts = String(n.sent_at || n.created_at || "");
    const txt = `${n.title || ""} ${n.noti_type || ""} ${n.body || ""}`;
    const isCrit = /critical|important/i.test(n.noti_type || "");
    const isRoutine = RT.test(n.title || "");
    return ts.startsWith(todayStr) && (isCrit || IMP.test(txt)) && !isRoutine;
  }).slice(0, 3);

  return (
    <div className="td">
      <header className="td-hd">
        <button className="td-logo" onClick={() => router.push("/pwa/today")} aria-label="오늘">ONE<span className="td-dot">·</span>HUB</button>
        <div className="td-ic">
          <TraderBadge />
          <button className="td-search" onClick={() => router.push("/pwa?tab=analyze")} aria-label="AI 종목 검색">🔍</button>
        </div>
      </header>

      <div className="td-title">오늘{at && <span className="td-fresh"><LastUpdated timestamp={at} onRefresh={load} /></span>}</div>

      <DataState status={status} hasData={!!dash || !!ledger} onRetry={load} skeletonLines={4} skeletonBlock>

        {/* ══ ① 히어로: 주식 · 나 vs AI ══ */}
        <section className="hero" onClick={() => router.push("/pwa?tab=report&sec=vs")} role="button" tabIndex={0}>
          <div className="hero-eyebrow">
            <span className="hero-lbl">📈 주식 · 나 vs AI{daysCompeting > 0 ? ` · ${daysCompeting}일째` : ""}{vsShowdown ? ` · ${vsShowdown.n}종목` : ""}</span>
            {regime && (
              <span className={`hero-regime r-${regimeRaw.toLowerCase()}`}>{regime}{heat != null ? ` · 온도 ${heat}` : ""}</span>
            )}
          </div>

          {vsShowdown ? (
            <>
              <div className={`hero-winner w-${vsShowdown.winner}`}>
                {vsShowdown.winner === "me" ? "🏆 내 판단 승" : vsShowdown.winner === "ai" ? "💀 AI 승" : "⚖️ 무승부"}
              </div>
              <div className="vsbars">
                <div className="vsrow">
                  <span className="vsrow-lbl" onClick={editNickname} role="button" tabIndex={0} title="닉네임 바꾸기">{nick} ✎</span>
                  <span className="vsrow-track"><span className={`vsrow-fill ${vsShowdown.myRet >= 0 ? "up" : "dn"}`} style={{ width: `${Math.min(100, (Math.abs(vsShowdown.myRet) / vsMax) * 100)}%` }} /></span>
                  <span className={`vsrow-val ${vsShowdown.myRet >= 0 ? "up" : "dn"}`}>{pctTxt(vsShowdown.myRet)}{wallet ? <em className="vsrow-won">{wonG(wallet.myGain)}</em> : null}</span>
                </div>
                <div className="vsrow">
                  <span className="vsrow-lbl">AI</span>
                  <span className="vsrow-track"><span className={`vsrow-fill ${vsShowdown.aiRet >= 0 ? "up" : "dn"}`} style={{ width: `${Math.min(100, (Math.abs(vsShowdown.aiRet) / vsMax) * 100)}%` }} /></span>
                  <span className={`vsrow-val ${vsShowdown.aiRet >= 0 ? "up" : "dn"}`}>{pctTxt(vsShowdown.aiRet)}{wallet ? <em className="vsrow-won">{wonG(wallet.aiGain)}</em> : null}</span>
                </div>
              </div>
              {wallet && <div className="hero-watermark">가상 시드머니 {wonG(wallet.seed)} 기준 · 실제 매매 아님</div>}
              {keyDiffLine && <div className="hero-keydiff">🔍 {keyDiffLine}</div>}
              <div className="hero-sub">{pendingJudge.length > 0 ? `채점 중 ${pendingJudge.length}건 · ` : ""}기록 전체 보기 →</div>
            </>
          ) : pendingJudge.length > 0 ? (
            <>
              <div className="hero-big"><span className="live-dot" />{pendingJudge.length}건 채점 중</div>
              <div className="hero-sub">가장 빠른 결과 {soonest ? mmdd(soonest) : "-"} · 기록 보기 →</div>
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

          {/* 결정 대기 칩 — 손절 임박·승인 대기가 있을 때만 */}
          {decideCount > 0 && (
            <button className="hero-alert" onClick={(e) => { e.stopPropagation(); router.push("/pwa?tab=portfolio"); }}>
              ⚠️ 결정 대기 {decideCount}건 — 지금 확인 →
            </button>
          )}

          {/* 오늘 중요 알림 — 매매·손절·서킷 등, 있을 때만 */}
          {criticalNotis.length > 0 && (
            <div className="hero-notis">
              {criticalNotis.map((n, i) => (
                <div className="hero-noti-row" key={n.id ?? i}>🔔 {n.title || n.message || "알림"}</div>
              ))}
            </div>
          )}

          {/* 증시 뉴스 — 있을 때만, 최대 2줄 */}
          {stockNews.length > 0 && (
            <div className="hero-news">
              {stockNews.slice(0, 2).map((n) => (
                <button className="hero-news-row" key={n.id} onClick={(e) => { e.stopPropagation(); openNewsDetail(n); }}>📰 {n.headline}</button>
              ))}
            </div>
          )}
        </section>

        {/* 내 보유종목 관련 뉴스 — 있을 때만 (히어로 바로 아래, 같은 도메인) */}
        <HoldingsNews trader={trader} />

        {/* ══ ② ETF & 부동산 ══ */}
        <section className="card tile">
          <div className="tile-h">📊🏠 ETF & 부동산</div>
          <div className="tile-2col">
            <button className="mini-stat" onClick={() => router.push("/pwa/etf")}>
              <span className="mini-ic etf">📊</span>
              <span className="mini-body">
                <span className="mini-t">ETF</span>
                <span className="mini-s">{ukTxt(bd.etf_uk) ? `평가 ${ukTxt(bd.etf_uk)}` : "국내/해외 배분 보기"}</span>
              </span>
              <span className="mini-go">→</span>
            </button>
            <button className="mini-stat" onClick={() => router.push("/pwa/realestate")}>
              <span className="mini-ic re">🏠</span>
              <span className="mini-body">
                <span className="mini-t">부동산</span>
                <span className="mini-s">{myComplex ? `내 단지 ${myComplex}` : "관심 단지 동향 보기"}</span>
              </span>
              <span className="mini-go">→</span>
            </button>
          </div>

          {opNotes.length > 0 && (
            <div className="tile-spot">🏢 OneHub 신고가 · {opNotes[0].complex_name} {opNotes[0].price_manwon ? `${(opNotes[0].price_manwon / 10000).toFixed(2)}억` : ""}{opNotes.length > 1 ? ` 외 ${opNotes.length - 1}건` : ""}</div>
          )}

          {macroNews.length > 0 && (
            <div className="tile-news">
              <div className="tile-news-h">글로벌 · 거시 · 부동산 뉴스</div>
              {(newsOpen ? macroNews : macroNews.slice(0, 3)).map((n) => (
                <button className="tile-news-row" key={n.id} onClick={() => openNewsDetail(n)}>
                  <span className={`tile-news-cat c-${n.category}`}>{CAT_KO[n.category] || "뉴스"}</span>
                  <span className="tile-news-t">{n.headline}</span>
                </button>
              ))}
              {macroNews.length > 3 && (
                <button className="tile-more" onClick={() => setNewsOpen((v) => !v)}>{newsOpen ? "접기" : `+${macroNews.length - 3}건 더보기`}</button>
              )}
            </div>
          )}

          <ReportTeaser />
        </section>

        {/* ══ ③ 종합자산 · 오늘의 할일 ══ */}
        <section className="card tile">
          <div className="tile-h">💼 종합자산 · 오늘의 할일</div>

          {decideCount === 0 && !insight ? (
            <div className="todo-empty">오늘은 특별히 할 일이 없어요 · 관망</div>
          ) : (
            <div className="todo-list">
              {nearStop.slice(0, 2).map((p, i) => {
                const sl = Number(p.stop_loss) || 0;
                const cur = Number(p.current_price) || 0;
                const breached = sl > 0 && cur > 0 && cur < sl;
                const distPct = sl > 0 && cur > 0 ? ((cur / sl - 1) * 100) : null;
                return (
                  <div className="todo-row urgent" key={p.code || i}>
                    <span className="todo-ic">⚠️</span>
                    <span className="todo-body">
                      <span className="todo-t">{p.name} <em className="todo-pct">{pctTxt(p.pnl_rate)}</em></span>
                      <span className="todo-s">{breached ? `손절선 ${sl.toLocaleString()}원 이탈 — 매도 검토 필요` : `손절선까지 ${Math.abs(distPct).toFixed(1)}% 남음`}{p.ai_verdict ? ` · AI: ${p.ai_verdict}` : ""}</span>
                    </span>
                  </div>
                );
              })}
              {pendItems.slice(0, 2).map((p, i) => (
                <div className="todo-row urgent" key={p.code || `p${i}`}>
                  <span className="todo-ic">✅</span>
                  <span className="todo-body">
                    <span className="todo-t">{p.name || p.stock || p.code}</span>
                    <span className="todo-s">{p.reason || "AI 매수 제안 — 승인/거절이 필요합니다"}</span>
                  </span>
                </div>
              ))}
              {decideCount > 0 && (
                <button className="todo-cta" onClick={() => router.push("/pwa?tab=portfolio")}>지금 판단하기 →</button>
              )}
              {insight && (
                <div className="todo-row insight">
                  <span className="todo-ic">🔗</span>
                  <span className="todo-body">
                    <span className="todo-t">자산을 묶어 보면</span>
                    <span className="todo-s">{insight.text}</span>
                    <button className="todo-link" onClick={() => router.push(insight.cta.href)}>{insight.cta.label}</button>
                  </span>
                </div>
              )}
            </div>
          )}

          <button className="tile-nav-row" onClick={() => router.push("/pwa/assets")}>
            <span className="tile-nav-ic">💰</span>
            <span className="tile-nav-body">
              <span className="tile-nav-t">종합자산</span>
              <span className="tile-nav-s">{ukTxt(ledger?.total_uk) ? `총자산 ${ukTxt(ledger.total_uk)}` : "자산을 입력하면 한눈에 모입니다"}</span>
            </span>
            <span className="tile-nav-go">→</span>
          </button>

          <div className="ai-prog-mini">누적 판단 {pol.count}건{pol.remaining > 0 ? ` · ${pol.remaining}건 남으면 채점 통계 공개` : ` · 채점 기준(${pol.target}건) 충족`}</div>
        </section>

        {/* ══ ④ Daily & Weekly 리포트 — 맨 아래 ══ */}
        <AutoReportCard reports={reports} />

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
        .td-title { display: flex; align-items: center; gap: 8px; font-size: 20px; font-weight: 800; letter-spacing: -.4px; margin: 6px 2px 14px; font-family: var(--font-display, var(--font-sans)); }
        .td-fresh { margin-left: auto; }
        .card { background: var(--color-card); border: 1px solid var(--color-line); border-radius: var(--radius-card, 14px); padding: 16px; margin-bottom: 12px; box-shadow: var(--shadow-card); }
        .td-modal-bg { position: fixed; inset: 0; z-index: 300; background: rgba(10,15,25,.5); display: flex; align-items: flex-end; justify-content: center; }
        .td-modal { position: relative; width: 100%; max-width: 480px; max-height: 78vh; overflow-y: auto; background: var(--color-card); border-radius: 18px 18px 0 0; padding: 22px 20px calc(env(safe-area-inset-bottom, 0px) + 22px); }
        .td-modal-close { position: absolute; top: 14px; right: 14px; width: 30px; height: 30px; border-radius: 50%; border: none; background: var(--color-card-soft, var(--color-line)); color: var(--color-ink-2); font-size: 14px; cursor: pointer; }
        .td-modal-h { font-size: 1.02rem; font-weight: 800; color: var(--color-ink); line-height: 1.4; margin: 10px 40px 6px 0; word-break: keep-all; }
        .td-modal-meta { font-size: 0.72rem; color: var(--color-ink-3); margin-bottom: 14px; }
        .td-modal-body { font-size: 0.86rem; color: var(--color-ink-2); line-height: 1.7; word-break: keep-all; display: flex; flex-direction: column; gap: 8px; }

        /* ══ 히어로: 주식 · 나 vs AI ══ */
        .hero { background: linear-gradient(135deg, var(--hero-grad-1), var(--hero-grad-2)); color: var(--hero-ink); border-radius: var(--radius-hero, 22px); padding: 20px 18px; box-shadow: var(--shadow-float); margin-bottom: 12px; cursor: pointer; }
        .hero-eyebrow { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 14px; }
        .hero-lbl { font-size: 12px; font-weight: 700; color: var(--hero-ink-sub); }
        .hero-regime { font-size: 10px; font-weight: 800; padding: 3px 9px; border-radius: 999px; background: var(--hero-fill); border: 1px solid var(--hero-fill-line); letter-spacing: .3px; }
        .hero-regime.r-bull { color: var(--hero-accent); }
        .hero-regime.r-bear { color: var(--hero-danger); }
        .hero-winner { font-size: 22px; font-weight: 800; letter-spacing: -.4px; margin-bottom: 12px; }
        .hero-winner.w-me { color: var(--hero-accent); }
        .hero-winner.w-ai { color: var(--hero-danger); }
        .hero-winner.w-tie { color: var(--hero-ink-soft); }
        .vsbars { display: flex; flex-direction: column; gap: 9px; margin-bottom: 12px; }
        .vsrow { display: flex; align-items: center; gap: 9px; }
        .vsrow-lbl { flex: none; width: 22px; font-size: 12px; font-weight: 800; color: var(--hero-ink-sub); }
        .vsrow-track { flex: 1; height: 9px; border-radius: 999px; background: var(--hero-fill); overflow: hidden; }
        .vsrow-fill { display: block; height: 100%; border-radius: 999px; }
        .vsrow-fill.up { background: var(--hero-accent); }
        .vsrow-fill.dn { background: var(--hero-danger); }
        .vsrow-val { flex: none; width: 62px; text-align: right; font-family: ui-monospace, monospace; font-size: 13px; font-weight: 800; font-variant-numeric: tabular-nums; }
        .vsrow-val.up { color: var(--hero-accent); }
        .vsrow-val.dn { color: var(--hero-danger); }
        .vsrow-won { display: block; font-style: normal; font-size: 10px; font-weight: 600; color: var(--hero-ink-faint); margin-top: 1px; }
        .hero-watermark { font-size: 10px; color: var(--hero-ink-faint); margin-bottom: 8px; }
        .hero-keydiff { font-size: 0.78rem; color: var(--hero-ink-soft); line-height: 1.5; word-break: keep-all; margin-bottom: 8px; padding: 8px 10px; background: var(--hero-fill); border-radius: 9px; }
        .hero-big { font-size: 26px; font-weight: 800; letter-spacing: -.4px; margin-bottom: 6px; display: flex; align-items: center; gap: 8px; }
        .hero-big.hero-quiet { color: var(--hero-ink-soft); font-size: 22px; }
        .hero-sub { font-size: 13px; color: var(--hero-ink-soft); line-height: 1.5; word-break: keep-all; margin-bottom: 4px; }
        .hero-cta { width: 100%; margin-top: 10px; min-height: 46px; border: none; border-radius: 12px; background: #fff; color: var(--hero-grad-2); font-size: 0.88rem; font-weight: 800; cursor: pointer; font-family: var(--font-sans); }
        .hero-cta.ghost { background: var(--hero-fill); color: var(--hero-ink); border: 1px solid var(--hero-fill-line); }
        .hero-alert { width: 100%; margin-top: 12px; min-height: 42px; border: 1px solid var(--hero-danger); border-radius: 11px; background: color-mix(in srgb, var(--hero-danger) 18%, transparent); color: var(--hero-ink); font-size: 0.82rem; font-weight: 800; cursor: pointer; font-family: var(--font-sans); }
        .hero-notis { margin-top: 12px; padding-top: 10px; border-top: 1px solid var(--hero-fill-line); display: flex; flex-direction: column; gap: 4px; }
        .hero-noti-row { font-size: 0.76rem; color: var(--hero-ink-soft); line-height: 1.5; word-break: keep-all; }
        .hero-news { margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--hero-fill-line); display: flex; flex-direction: column; gap: 4px; }
        .hero-news-row { display: block; width: 100%; text-align: left; border: none; background: none; padding: 0; font-family: var(--font-sans); cursor: pointer; font-size: 0.74rem; color: var(--hero-ink-faint); line-height: 1.5; word-break: keep-all; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .live-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--hero-accent); display: inline-block; animation: td-pulse 1.6s ease-in-out infinite; }
        @keyframes td-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }

        /* ══ 타일 공통 ══ */
        .tile-h { font-size: 0.92rem; font-weight: 800; color: var(--color-ink); margin-bottom: 12px; }
        .tile-2col { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 10px; }
        .mini-stat { display: flex; align-items: center; gap: 8px; text-align: left; padding: 12px 10px; border-radius: 12px; background: var(--color-card-soft, var(--color-bg)); border: 1px solid var(--color-line); cursor: pointer; font-family: var(--font-sans); min-height: 64px; }
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
        .tile-more { width: 100%; margin-top: 4px; border: none; background: none; color: var(--color-primary); font-size: 0.74rem; font-weight: 800; cursor: pointer; padding: 4px 2px; text-align: left; font-family: var(--font-sans); }

        /* ══ 종합자산 · 할일 ══ */
        .todo-empty { font-size: 0.82rem; color: var(--color-ink-2); padding: 10px 2px 4px; }
        .todo-list { display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px; }
        .todo-row { display: flex; gap: 9px; align-items: flex-start; padding: 9px 10px; border-radius: 11px; }
        .todo-row.urgent { background: var(--color-danger-soft); }
        .todo-row.insight { background: var(--color-primary-soft); }
        .todo-ic { flex: none; font-size: 15px; line-height: 1.5; }
        .todo-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
        .todo-t { font-size: 0.82rem; font-weight: 800; color: var(--color-ink); }
        .todo-pct { font-style: normal; font-weight: 800; color: var(--color-danger); }
        .todo-s { font-size: 0.74rem; color: var(--color-ink-2); word-break: keep-all; line-height: 1.45; }
        .todo-link { align-self: flex-start; margin-top: 4px; border: none; background: none; color: var(--color-primary); font-size: 0.76rem; font-weight: 800; cursor: pointer; padding: 0; font-family: var(--font-sans); }
        .todo-cta { width: 100%; min-height: 44px; border: none; border-radius: 11px; background: var(--color-primary); color: #fff; font-size: 0.84rem; font-weight: 800; cursor: pointer; font-family: var(--font-sans); }
        .todo-cta.soft { background: var(--color-card-soft, var(--color-line)); color: var(--color-ink); }
        .tile-nav-row { display: flex; align-items: center; gap: 10px; width: 100%; text-align: left; padding: 11px 2px; background: none; border: none; border-top: 1px solid var(--color-line); cursor: pointer; font-family: var(--font-sans); min-height: 48px; margin-top: 4px; }
        .tile-nav-ic { flex: none; font-size: 17px; width: 24px; text-align: center; }
        .tile-nav-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
        .tile-nav-t { font-size: 0.82rem; font-weight: 800; color: var(--color-ink); }
        .tile-nav-s { font-size: 0.72rem; font-weight: 600; color: var(--color-ink-2); word-break: keep-all; }
        .tile-nav-go { flex: none; font-size: 0.9rem; font-weight: 800; color: var(--color-primary); }
        .ai-prog-mini { margin-top: 12px; padding-top: 10px; border-top: 1px dashed var(--color-line); font-size: 0.66rem; color: var(--color-ink-3); }
      `}</style>
      <style jsx global>{`body { background: var(--color-bg); margin: 0; }`}</style>
    </div>
  );
}

// [FB-2 §2.7] 자동 리포트 최신 요약을 빌드타임에 읽어 AutoReportCard 로 주입.
//   런타임 API 없이 content/*.md frontmatter 의 실제 insight 만 사용(날조 없음).
function latestFrontmatter(subdir) {
  try {
    const dir = path.join(process.cwd(), "content", subdir);
    if (!fs.existsSync(dir)) return null;
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".md")).sort().reverse();
    for (const f of files) {
      const { data } = matter(fs.readFileSync(path.join(dir, f), "utf8"));
      if (data && data.published !== false) return data;
    }
  } catch (e) {}
  return null;
}

export async function getStaticProps() {
  const d = latestFrontmatter("daily");
  const w = latestFrontmatter("weekly");
  const reports = {
    daily: d ? { insight: d.insight || d.title || null, date: d.date || null, slug: d.slug || null } : null,
    weekly: w ? { insight: w.insight || w.title || null, week: w.week || null, date: w.date || null, slug: w.slug || null } : null,
  };
  return { props: { reports }, revalidate: 600 };
}
