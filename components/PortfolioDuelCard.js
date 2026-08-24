// [2026-08-23] 포트폴리오 대결 — "오늘의 대결" 완전 재설계.
//   today.js·index.js에 중복 구현되어 있던 기존 카드(gameWallet 복리베팅+verdictLedger 결정채점,
//   5단계 조건분기로 "복잡하고 재미없다"는 피드백)를 대체하는 단일 공유 컴포넌트.
//   컨셉: KIS 실보유(또는 1500만원 가상현금)를 기준으로 고정하고, 매일의 매수/매도 추천을
//   수용하는 "AI"와 내 선택대로만 반영하는 "나" 두 포트폴리오 총액을 하나의 라인차트로 비교.
import { useEffect, useState, useCallback } from "react";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer } from "recharts";
import { getTrader } from "../lib/trader";
import { fetchStockQuotes } from "../lib/stockLive";
import {
  isDuelStarted, startDuel, resetDuel, getPortfolios, getSnapshots,
  recordSnapshot, recordDuelDecision, hasDecisionToday, detectSellCandidates, portfolioValue,
  getDecisionAnalysis, correctBaseCash, computeAiFromLive, DEFAULT_CASH,
} from "../lib/portfolioDuel";

// [사용자 지시] 억 단위 반올림은 소액 계좌에서 나/AI 차이가 0.00억으로 뭉개져 보였다 —
//   원 단위 그대로(백원 단위까지) 표기해 실제 차이가 보이게 한다.
const wonFmt = (n) => (n == null ? "-" : `${Math.round(n).toLocaleString()}원`);
const BUY_AMOUNT_WON = 1000000; // [단순화] 매수 추천 크기 = 100만원어치(최소 1주) 고정 — 사이즈 커스터마이즈는 범위 밖
// [버그 수정] "나"는 실보유 시작이면 base+결정로그 재계산이 아니라 실시간 KIS 잔고를 써야
//   결정 버튼을 거치지 않고 KIS에서 직접 산/판 종목도 반영된다(실사용자 사례: 직접 매수한
//   삼성전자가 안 잡히던 문제). 렌더와 스냅샷 적립 두 곳에서 같은 계산이 필요해 모듈 함수로 분리.
function computeMyLive(dash) {
  if (!dash?.balance) return null;
  try {
    let p = dash.balance.positions;
    if (typeof p === "string") p = JSON.parse(p);
    const raw = Array.isArray(p) ? p : [];
    const positions = raw.map((pos) => {
      const qty = Number(pos.qty ?? pos.hldg_qty) || 0;
      const evalAmt = pos.eval_amount != null ? Number(pos.eval_amount) : Number(pos.current_price ?? pos.avg_price ?? 0) * qty;
      return {
        code: String(pos.code ?? pos.pdno ?? "").trim(),
        name: pos.name ?? pos.prdt_name ?? pos.code,
        qty, avgPrice: Number(pos.avg_price ?? pos.pchs_avg_pric) || 0, evalAmt,
      };
    }).filter((pos) => pos.code && pos.qty > 0);
    const stockVal = positions.reduce((s, pos) => s + pos.evalAmt, 0);
    return { cash: Number(dash.balance.cash) || 0, stockVal, positions };
  } catch (e) { return null; }
}

export default function PortfolioDuelCard() {
  const [started, setStarted] = useState(false);
  const [duel, setDuel] = useState(null); // getPortfolios() 결과
  const [snapshots, setSnapshots] = useState([]);
  const [quotes, setQuotes] = useState({}); // code -> won 단가
  const [dash, setDash] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [news, setNews] = useState([]); // [2단계] 종목별 뉴스 추적 — 전용 백엔드 없이 기존 종합뉴스에서 이름 매칭

  const trader = typeof window !== "undefined" ? getTrader() : "A";

  const reload = useCallback(() => {
    setStarted(isDuelStarted(trader));
    setDuel(getPortfolios(trader));
    setSnapshots(getSnapshots(trader));
  }, [trader]);

  useEffect(() => { reload(); }, [reload]);

  // 대시보드(오늘의 매수 후보 + KIS 보유) 로드 — 시작 전에는 KIS 보유 확인용, 시작 후엔 매수 추천용.
  useEffect(() => {
    let alive = true;
    fetch(`/api/pwa-dashboard?trader=${trader}`).then((r) => r.json()).then((d) => { if (alive) setDash(d); }).catch(() => {});
    return () => { alive = false; };
  }, [trader]);

  // [2단계] 종목별 뉴스 추적 — 티커 전용 백엔드가 없어, 기존 종합뉴스 피드(오늘 탭과 동일 소스)를
  //   받아 판단 기록 렌더 시 종목명 텍스트 매칭으로 연결한다(today.js의 myEtfNews 패턴과 동일).
  useEffect(() => {
    let alive = true;
    fetch(`/api/today/news`).then((r) => r.json()).then((d) => { if (alive) setNews(Array.isArray(d?.items) ? d.items : []); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  // 시작된 대결의 모든 보유 종목(AI+나 합집합) + [2단계] 최근 30일 내 결정 종목(매도로 이미
  //   손 뗀 종목도 판단 분석용 가격이 계속 쌓이도록) 실시간 시세 조회 → 스냅샷 1일 1회 기록.
  useEffect(() => {
    if (!started || !duel) return;
    let alive = true;
    const live = duel.base.seedType === "kis" ? computeMyLive(dash) : null;
    const aiSim = live ? computeAiFromLive(live, duel.decisions) : duel.ai;
    const mePositions = live ? live.positions : duel.me.positions;
    const codes = new Set([...aiSim.positions, ...mePositions].map((p) => p.code));
    const cutoff = Date.now() - 30 * 86400000;
    duel.decisions.forEach((d) => { if (new Date(d.date).getTime() >= cutoff) codes.add(d.code); });
    if (!codes.size) return;
    const holdings = [...codes].map((c) => ({ id: c, code: c, market: "kr" }));
    fetchStockQuotes(holdings).then(({ quotes: qs }) => {
      if (!alive) return;
      const m = {};
      Object.entries(qs).forEach(([code, q]) => { if (q?.krw != null) m[code] = q.krw; });
      setQuotes(m);
      recordSnapshot(trader, m, live ? live.cash + live.stockVal : null, live ? portfolioValue(aiSim, m) : null);
      setSnapshots(getSnapshots(trader));
    });
    return () => { alive = false; };
  }, [started, duel, trader, dash]);

  const onStart = async () => {
    setBusy(true); setErr("");
    try {
      // [버그 수정] 마운트 시 캐시된 dash를 그대로 쓰면, 백엔드 cache_balance가 1분 주기
      // 갱신이라 그 사이 KIS 조회 실패로 예수금이 일시적으로 0으로 남아있던 순간을 그대로
      // 기준에 박아넣을 수 있다(실사용자 리포트: 예수금 0으로 시작됨). 시작 직전 새로 조회.
      const fresh = await fetch(`/api/pwa-dashboard?trader=${trader}`).then((r) => r.json()).catch(() => null);
      let positions = [];
      try {
        let p = fresh?.balance?.positions;
        if (typeof p === "string") p = JSON.parse(p);
        if (Array.isArray(p)) positions = p;
      } catch (e) {}
      const kisCash = fresh?.balance?.cash != null ? Number(fresh.balance.cash) : 0;
      // 보유 종목은 있는데 예수금이 정확히 0 — 흔치 않은 조합이라 KIS 조회 일시 오류로 의심하고
      // 재시도를 유도한다(잘못된 기준은 나중에 되돌릴 수 없으므로 여기서 막는 게 안전).
      if (positions.length > 0 && kisCash === 0) {
        setErr("예수금이 0원으로 조회됐습니다 — KIS 연동이 잠시 불안정할 수 있어요. 잠시 후 다시 시도해 주세요.");
        setBusy(false);
        return;
      }
      const res = startDuel({ trader, kisPositions: positions, kisCash });
      if (!res.ok) { setErr(res.error || "시작 실패"); setBusy(false); return; }
      reload();
      try { window.dispatchEvent(new Event("onehub-assets-change")); } catch (e) {}
    } finally {
      setBusy(false);
    }
  };

  // [버그 수정] lib/portfolioDuel.js의 저장 함수들은 localStorage에 직접 쓸 뿐, 이 이벤트를
  //   스스로 발생시키지 않는다. lib/syncManager.js는 오직 이 이벤트로만 "변경분 있음"을 감지해
  //   서버로 push하므로, onStart()에서만 이 이벤트를 쐈던 것이 실사용자 버그의 원인이었다 —
  //   결정 기록·초기화·현금 보정이 로컬엔 반영돼도 서버엔 안 올라가, 다음 pull(페이지 재방문)
  //   때 초기화 시점의 옛 서버 스냅샷이 로컬을 덮어써 "고쳤는데 다시 원래대로" 로 보였다.
  //   다른 lib(etfHoldings 등)도 전부 "호출부에서 직접 dispatch"가 이 코드베이스의 관례라
  //   여기서도 mutating 함수 호출부마다 dispatch한다(lib 내부에서 일괄 처리하지 않음).
  const notifySync = () => { try { window.dispatchEvent(new Event("onehub-assets-change")); } catch (e) {} };

  const onReset = () => {
    if (!window.confirm("포트폴리오 대결을 초기화할까요?\n지금까지의 기준·결정 기록이 모두 사라지고 처음부터 다시 시작됩니다.")) return;
    resetDuel(trader);
    notifySync();
    reload();
  };

  // [버그 보정] 실보유 시작 시 캐시된 KIS 예수금이 틀리게 잡힌 경우(과거 배포분 KIS 조회
  //   오류·백엔드 필드 오류 등) — 결정 기록은 유지한 채 기준 현금만 최신값으로 바로잡는다.
  //   base.cash===0일 때만 노출하던 배너와 달리, 아래 pd-foot의 버튼은 항상 눌러 재동기화
  //   가능하게 해 "0은 아니지만 틀린 값"으로 시작된 경우도(실사용자 사례 확인) 다시 고칠 수 있다.
  const onResyncCash = async () => {
    setBusy(true); setErr("");
    try {
      const fresh = await fetch(`/api/pwa-dashboard?trader=${trader}`).then((r) => r.json()).catch(() => null);
      const kisCash = fresh?.balance?.cash != null ? Number(fresh.balance.cash) : 0;
      if (kisCash <= 0) { setErr("예수금을 다시 조회했지만 0원입니다 — 잠시 후 다시 시도해 주세요."); return; }
      correctBaseCash(trader, kisCash);
      notifySync();
      reload();
    } finally {
      setBusy(false);
    }
  };

  const decide = async (item, action, accepted) => {
    let price = quotes[item.code];
    if (price == null) {
      try {
        const q = await fetch(`/api/etf/quote?ticker=${encodeURIComponent(item.code)}&market=kr`).then((r) => r.json());
        if (q?.ok && q.price > 0) price = q.price;
      } catch (e) {}
    }
    if (price == null) price = item.price || 0;
    const qty = action === "buy" ? Math.max(1, Math.floor(BUY_AMOUNT_WON / (price || 1))) : item.qty;
    recordDuelDecision({ trader, code: item.code, name: item.name, action, qty, price, accepted });
    notifySync();
    reload();
  };

  // ── 화면: 아직 시작 안 함 ──────────────────────────────────────────
  if (!started) {
    let posCount = 0;
    try {
      let p = dash?.balance?.positions;
      if (typeof p === "string") p = JSON.parse(p);
      if (Array.isArray(p)) posCount = p.filter((x) => Number(x.qty ?? x.hldg_qty) > 0).length;
    } catch (e) {}
    return (
      <section className="pd-card">
        <div className="pd-title">🥊 포트폴리오 대결</div>
        <p className="pd-intro">
          {posCount > 0
            ? <>지금 보유 중인 KIS 종목 <b>{posCount}개</b>를 그대로 복제해서, "나"와 "AI" 두 포트폴리오를 <b>지금 이 순간부터</b> 시작합니다.</>
            : <>KIS 실보유가 확인되지 않아 <b>{wonFmt(DEFAULT_CASH)} 가상현금</b>으로 "나"와 "AI" 두 포트폴리오를 시작합니다.</>}
        </p>
        <p className="pd-intro sub">매일 나오는 매수·매도 추천을 AI는 항상 수용하고, 나는 내가 고른 대로만 반영합니다. 그 차이가 곧 대결 결과입니다.</p>
        <button type="button" className="pd-start" onClick={onStart} disabled={busy}>{busy ? "시작하는 중…" : "대결 시작하기"}</button>
        {err && <div className="pd-err">{err}</div>}
      </section>
    );
  }

  // ── 화면: 진행 중 ──────────────────────────────────────────────────
  // [버그 수정] "나"를 base+결정로그 재계산으로 표시하면, 이 게임의 수용/거부 버튼을 거치지
  //   않고 KIS에서 직접 산 종목(실사용자 사례: 삼성전자 직접 매수)이 절대 반영되지 않는다.
  //   "나"는 실제 내 계좌이므로 대시보드가 주는 실시간 KIS 잔고를 그대로 쓴다.
  // [사용자 지시: 공평한 대결] "AI"도 base 재계산이 아니라 "나"의 실시간 포트폴리오에서 시작해
  //   내가 "거부"한 추천만 반대로 뒤집어 재구성 — AI 추천을 거치지 않은 내 개별 매매(직접
  //   매수 등)는 결정 로그에 없으니 자동으로 양쪽에 동일 반영(미러링)된다. 둘 다 실보유로
  //   시작한 경우에 한함 — 가상현금 시작은 원래도 KIS와 무관하므로 base+decisions 그대로 유지.
  const myLive = duel.base.seedType === "kis" ? computeMyLive(dash) : null;
  const aiPortfolio = myLive ? computeAiFromLive(myLive, duel.decisions) : duel.ai;
  const aiVal = portfolioValue(aiPortfolio, quotes);
  const myVal = myLive ? myLive.cash + myLive.stockVal : portfolioValue(duel.me, quotes);
  const diff = myVal - aiVal;
  const diffPct = aiVal > 0 ? (diff / aiVal) * 100 : 0;
  const chartData = snapshots.map((s) => ({ label: s.date.slice(5), 나: s.myValue, AI: s.aiValue }));
  // [사용자 지시] 현금 보유액도 포함한 "통합 총액" 기준 비교임을 화면에서 바로 확인 가능하도록,
  //   현금+주식평가액 분해를 총액 아래 함께 표기(총액=cash+positions는 portfolioValue()가 이미 통합 계산).
  const sideStockVal = (side) => side.positions.reduce((s, p) => s + (quotes[p.code] != null ? quotes[p.code] : p.avgPrice) * p.qty, 0);

  // 오늘의 매수 후보(dash.recommend_stocks 중 매수 신호(score>=70)이고 오늘 아직 결정 안 한 것)
  const buyCands = (dash?.recommend_stocks || [])
    .filter((c) => c.code && (c.score ?? 0) >= 70 && !hasDecisionToday(trader, c.code, "buy"))
    .slice(0, 3);
  // 오늘의 매도 후보(AI 보유 중 손절/익절 구간)
  const sellCands = detectSellCandidates(aiPortfolio.positions, quotes).filter((c) => !hasDecisionToday(trader, c.code, "sell"));

  // [2단계] 판단별 단기(1일)/중기(1주)/장기(1개월) 분석 + 종목명으로 매칭된 관련 뉴스 1건.
  const analysisById = {};
  getDecisionAnalysis(trader).forEach((a) => { analysisById[a.id] = a; });
  const newsFor = (name) => name ? news.find((n) => `${n.headline || ""} ${n.summary_md || ""}`.includes(name)) : null;
  const recentDecisions = [...duel.decisions].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 8);

  return (
    <section className="pd-card">
      <div className="pd-title">🥊 포트폴리오 대결 <span className="pd-sub">{duel.base.startDate}부터 · {duel.base.seedType === "kis" ? "실보유 기준" : "가상현금 기준"}</span></div>

      {duel.base.seedType === "kis" && duel.base.cash === 0 && (
        <div className="pd-warn">
          ⚠ 기준 예수금이 0원으로 기록돼 있습니다 — KIS 조회 일시 오류로 보입니다.
          <button type="button" className="pd-warn-btn" onClick={onResyncCash} disabled={busy}>지금 예수금 다시 조회해 보정</button>
        </div>
      )}

      <div className="pd-vs">
        <div className="pd-vs-row">
          <div className="pd-vs-side">
            <span className="pd-vs-lbl">나 총액{myLive && <span className="pd-vs-live"> · 실시간 KIS</span>}</span>
            <span className="pd-vs-val">{wonFmt(myVal)}</span>
            <span className="pd-vs-break">
              {myLive
                ? <>현금 {wonFmt(myLive.cash)} + 주식 {wonFmt(myLive.stockVal)}</>
                : <>현금 {wonFmt(duel.me.cash)} + 주식 {wonFmt(sideStockVal(duel.me))}</>}
            </span>
          </div>
          <div className="pd-vs-side r">
            <span className="pd-vs-lbl">AI 총액</span>
            <span className="pd-vs-val">{wonFmt(aiVal)}</span>
            <span className="pd-vs-break">현금 {wonFmt(aiPortfolio.cash)} + 주식 {wonFmt(sideStockVal(aiPortfolio))}</span>
          </div>
        </div>
        <div className={`pd-vs-diff ${diff > 0 ? "pos" : diff < 0 ? "neg" : ""}`}>
          총액 차이 {diff > 0 ? "+" : ""}{wonFmt(diff)} ({diffPct > 0 ? "+" : ""}{diffPct.toFixed(2)}%)
        </div>
      </div>

      {duel.base.seedType === "kis" && (
        // [사용자 지시] 이전엔 하단 회색 텍스트링크 스타일이라 "버튼이 안 보인다"는 리포트를
        //   받음 — 총액 바로 아래, 눈에 띄는 버튼으로 승격해 실보유 기준 대결의 핵심 조치를 배치.
        <button type="button" className="pd-resync" onClick={onResyncCash} disabled={busy}>
          {busy ? "조회 중…" : "🔄 기준 예수금 다시 조회"}
        </button>
      )}
      {err && <div className="pd-err">{err}</div>}

      {chartData.length > 1 && (
        <ResponsiveContainer width="100%" height={140}>
          <LineChart data={chartData} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
            <XAxis dataKey="label" stroke="var(--color-ink-3)" fontSize={10} tickLine={false} />
            <YAxis hide domain={["dataMin", "dataMax"]} />
            <Line type="monotone" dataKey="나" stroke="var(--color-success)" strokeWidth={2} dot={{ r: 2 }} />
            <Line type="monotone" dataKey="AI" stroke="var(--purple, #8b5cf6)" strokeWidth={2} dot={{ r: 2 }} />
          </LineChart>
        </ResponsiveContainer>
      )}
      {chartData.length <= 1 && <div className="pd-chart-empty">매일 접속할 때마다 그날 평가액이 한 점씩 쌓입니다 — 아직 한 점뿐이라 그래프는 내일부터 보여요.</div>}

      {(buyCands.length > 0 || sellCands.length > 0) && (
        <div className="pd-todo">
          <div className="pd-todo-h">오늘의 판단</div>
          {buyCands.map((c) => (
            <div className="pd-item" key={`b-${c.code}`}>
              <span className="pd-item-tag buy">매수 추천</span>
              <span className="pd-item-name">{c.name}</span>
              <span className="pd-item-amt">{wonFmt(BUY_AMOUNT_WON)} 규모</span>
              <div className="pd-item-btns">
                <button type="button" className="pd-b accept" onClick={() => decide(c, "buy", true)}>수용</button>
                <button type="button" className="pd-b reject" onClick={() => decide(c, "buy", false)}>거부</button>
              </div>
            </div>
          ))}
          {sellCands.map((c) => (
            <div className="pd-item" key={`s-${c.code}`}>
              <span className="pd-item-tag sell">{c.reason === "stop_loss" ? "손절 추천" : "익절 추천"}</span>
              <span className="pd-item-name">{c.name}</span>
              <span className="pd-item-amt">{c.pnlPct > 0 ? "+" : ""}{c.pnlPct.toFixed(1)}% · 전량 매도</span>
              <div className="pd-item-btns">
                <button type="button" className="pd-b accept" onClick={() => decide(c, "sell", true)}>수용</button>
                <button type="button" className="pd-b reject" onClick={() => decide(c, "sell", false)}>거부(보유)</button>
              </div>
            </div>
          ))}
        </div>
      )}
      {buyCands.length === 0 && sellCands.length === 0 && (
        <div className="pd-todo-empty">오늘은 새로운 추천이 없습니다 — 스캔·보유종목 상황에 따라 매일 달라집니다.</div>
      )}

      <button type="button" className="pd-history-toggle" onClick={() => setShowHistory((v) => !v)}>
        {showHistory ? "판단 기록 접기" : `판단 기록 보기 (${duel.decisions.length}건)`}
      </button>
      {showHistory && (
        <div className="pd-history">
          {recentDecisions.length === 0 && <div className="pd-todo-empty">아직 판단 기록이 없습니다.</div>}
          {recentDecisions.map((d) => {
            const a = analysisById[d.id];
            const relNews = newsFor(d.name);
            return (
              <div className="pd-hist-row" key={d.id}>
                <div className="pd-hist-top">
                  <span className="pd-hist-date">{d.date}</span>
                  <span className="pd-hist-name">{d.name}</span>
                  <span className={`pd-hist-tag ${d.accepted ? "on" : "off"}`}>{d.action === "buy" ? "매수" : "매도"} {d.accepted ? "수용" : "거부"}</span>
                </div>
                {a && (
                  <div className="pd-hist-windows">
                    {["short", "mid", "long"].map((k) => {
                      const w = a.windows[k];
                      return (
                        <span className="pd-hist-w" key={k}>
                          {w.label} {w.ready ? <b className={w.pct > 0 ? "pos" : w.pct < 0 ? "neg" : ""}>{w.pct > 0 ? "+" : ""}{w.pct.toFixed(1)}%</b> : <i>집계 전</i>}
                        </span>
                      );
                    })}
                  </div>
                )}
                {relNews && (
                  <button type="button" className="pd-hist-news" onClick={() => { window.location.href = `/pwa/today?news=${relNews.id}`; }}>
                    📰 {relNews.headline}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="pd-foot">
        <span>매수 추천은 100만원 규모, 매도 추천은 AI 보유분 평단 대비 {"-5%"}(손절)/{"+10%"}(익절) 기준입니다. 투자자문이 아닙니다.</span>
        <div className="pd-foot-btns">
          <button type="button" className="pd-reset" onClick={onReset}>초기화</button>
        </div>
      </div>

      <style jsx>{`
        .pd-card { background: var(--color-card); border: 1px solid var(--color-line); border-radius: 14px; padding: 16px; box-shadow: var(--shadow-card); }
        .pd-title { font-size: 1rem; font-weight: 800; color: var(--color-ink); margin-bottom: 4px; }
        .pd-sub { font-size: 0.7rem; font-weight: 600; color: var(--color-ink-3); margin-left: 6px; }
        .pd-intro { font-size: 0.84rem; color: var(--color-ink-2); line-height: 1.6; margin: 10px 0 0; word-break: keep-all; }
        .pd-intro.sub { font-size: 0.76rem; color: var(--color-ink-3); }
        .pd-start { width: 100%; margin-top: 14px; padding: 13px; border-radius: 10px; border: none; background: var(--color-primary); color: #fff; font-size: 0.9rem; font-weight: 800; cursor: pointer; font-family: var(--font-sans); }
        .pd-err { margin-top: 8px; font-size: 0.78rem; color: var(--color-danger); }
        .pd-warn { margin-top: 10px; padding: 10px 12px; border-radius: 10px; background: var(--color-warning-soft, #FEF3C7); color: var(--color-warning-ink, #B45309); font-size: 0.76rem; line-height: 1.6; display: flex; flex-direction: column; gap: 6px; word-break: keep-all; }
        .pd-warn-btn { align-self: flex-start; padding: 6px 12px; border-radius: 7px; border: none; background: var(--color-warning-ink, #B45309); color: #fff; font-size: 0.72rem; font-weight: 700; cursor: pointer; font-family: var(--font-sans); }
        .pd-resync { width: 100%; margin-top: 4px; padding: 11px; border-radius: 10px; border: 1.5px solid var(--color-primary); background: var(--color-primary-soft); color: var(--color-primary); font-size: 0.82rem; font-weight: 800; cursor: pointer; font-family: var(--font-sans); }
        .pd-resync:disabled { opacity: 0.6; cursor: default; }
        .pd-vs { display: flex; flex-direction: column; gap: 8px; margin: 12px 0; }
        .pd-vs-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
        .pd-vs-side { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: flex-start; gap: 2px; }
        .pd-vs-side.r { align-items: flex-end; text-align: right; }
        .pd-vs-lbl { font-size: 0.72rem; font-weight: 700; color: var(--color-ink-3); }
        .pd-vs-live { font-weight: 600; color: var(--color-success); }
        .pd-vs-val { font-size: 1.05rem; font-weight: 800; color: var(--color-ink); font-family: ui-monospace, monospace; word-break: break-word; }
        .pd-vs-break { font-size: 0.62rem; color: var(--color-ink-3); font-family: ui-monospace, monospace; white-space: normal; word-break: break-word; max-width: 100%; }
        .pd-vs-diff { font-size: 0.86rem; font-weight: 800; text-align: center; word-break: break-word; }
        .pd-vs-diff.pos { color: var(--color-success); } .pd-vs-diff.neg { color: var(--color-danger); }
        .pd-chart-empty { font-size: 0.76rem; color: var(--color-ink-3); text-align: center; padding: 20px 8px; }
        .pd-todo { margin-top: 14px; display: flex; flex-direction: column; gap: 8px; }
        .pd-todo-h { font-size: 0.76rem; font-weight: 800; color: var(--color-ink-2); }
        .pd-todo-empty { margin-top: 12px; font-size: 0.78rem; color: var(--color-ink-3); text-align: center; padding: 10px; }
        .pd-item { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; padding: 9px 10px; border-radius: 10px; background: var(--color-card-soft); }
        .pd-item-tag { font-size: 0.66rem; font-weight: 800; padding: 2px 8px; border-radius: 999px; color: #fff; }
        .pd-item-tag.buy { background: var(--color-primary); }
        .pd-item-tag.sell { background: var(--color-danger); }
        .pd-item-name { font-size: 0.82rem; font-weight: 700; color: var(--color-ink); }
        .pd-item-amt { font-size: 0.72rem; color: var(--color-ink-3); }
        .pd-item-btns { flex-basis: 100%; display: flex; gap: 6px; margin-top: 4px; }
        .pd-b { flex: 1; padding: 7px; border-radius: 7px; border: 1px solid var(--color-line); background: var(--color-card); color: var(--color-ink-2); font-size: 0.76rem; font-weight: 700; cursor: pointer; font-family: var(--font-sans); }
        .pd-b.accept { background: var(--color-primary); border-color: var(--color-primary); color: #fff; }
        .pd-history-toggle { width: 100%; margin-top: 12px; padding: 9px; border-radius: 9px; border: 1px solid var(--color-line); background: var(--color-card-soft); color: var(--color-ink-2); font-size: 0.76rem; font-weight: 700; cursor: pointer; font-family: var(--font-sans); }
        .pd-history { margin-top: 10px; display: flex; flex-direction: column; gap: 8px; }
        .pd-hist-row { padding: 8px 0; border-bottom: 1px solid var(--color-line); display: flex; flex-direction: column; gap: 5px; }
        .pd-hist-top { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
        .pd-hist-date { font-size: 0.66rem; color: var(--color-ink-3); font-family: ui-monospace, monospace; }
        .pd-hist-name { font-size: 0.78rem; font-weight: 700; color: var(--color-ink); }
        .pd-hist-tag { font-size: 0.62rem; font-weight: 700; padding: 1px 6px; border-radius: 999px; }
        .pd-hist-tag.on { background: var(--color-primary-soft); color: var(--color-primary); }
        .pd-hist-tag.off { background: var(--color-card-soft); color: var(--color-ink-3); }
        .pd-hist-windows { display: flex; gap: 10px; flex-wrap: wrap; }
        .pd-hist-w { font-size: 0.68rem; color: var(--color-ink-3); display: flex; align-items: center; gap: 3px; }
        .pd-hist-w b { font-family: ui-monospace, monospace; }
        .pd-hist-w b.pos { color: var(--color-success); } .pd-hist-w b.neg { color: var(--color-danger); }
        .pd-hist-w i { font-style: normal; color: var(--color-ink-3); }
        .pd-hist-news { align-self: flex-start; max-width: 100%; text-align: left; font-size: 0.7rem; color: var(--color-ink-2); background: var(--color-card-soft); border: none; border-radius: 7px; padding: 5px 8px; cursor: pointer; font-family: var(--font-sans); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .pd-foot { margin-top: 14px; padding-top: 10px; border-top: 1px solid var(--color-line); display: flex; flex-direction: column; gap: 8px; }
        .pd-foot span { font-size: 0.68rem; color: var(--color-ink-3); line-height: 1.6; word-break: keep-all; }
        .pd-foot-btns { display: flex; gap: 14px; }
        .pd-reset { align-self: flex-start; font-size: 0.7rem; color: var(--color-ink-3); background: none; border: none; cursor: pointer; text-decoration: underline; padding: 0; font-family: var(--font-sans); }
      `}</style>
    </section>
  );
}
