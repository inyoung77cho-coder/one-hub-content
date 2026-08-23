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
  DEFAULT_CASH,
} from "../lib/portfolioDuel";

const won = (n) => (n == null ? "-" : Math.round(n).toLocaleString());
const eok = (n) => (n == null ? "-" : `${(n / 1e8).toFixed(2)}억`);
const BUY_AMOUNT_WON = 1000000; // [단순화] 매수 추천 크기 = 100만원어치(최소 1주) 고정 — 사이즈 커스터마이즈는 범위 밖

export default function PortfolioDuelCard() {
  const [started, setStarted] = useState(false);
  const [duel, setDuel] = useState(null); // getPortfolios() 결과
  const [snapshots, setSnapshots] = useState([]);
  const [quotes, setQuotes] = useState({}); // code -> won 단가
  const [dash, setDash] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [showHistory, setShowHistory] = useState(false);

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

  // 시작된 대결의 모든 보유 종목(AI+나 합집합) 실시간 시세 조회 → 스냅샷 1일 1회 기록.
  useEffect(() => {
    if (!started || !duel) return;
    let alive = true;
    const codes = new Set([...duel.ai.positions, ...duel.me.positions].map((p) => p.code));
    if (!codes.size) return;
    const holdings = [...codes].map((c) => ({ id: c, code: c, market: "kr" }));
    fetchStockQuotes(holdings).then(({ quotes: qs }) => {
      if (!alive) return;
      const m = {};
      Object.entries(qs).forEach(([code, q]) => { if (q?.krw != null) m[code] = q.krw; });
      setQuotes(m);
      recordSnapshot(trader, m);
      setSnapshots(getSnapshots(trader));
    });
    return () => { alive = false; };
  }, [started, duel, trader]);

  const onStart = async () => {
    setBusy(true); setErr("");
    try {
      let positions = [];
      try {
        let p = dash?.balance?.positions;
        if (typeof p === "string") p = JSON.parse(p);
        if (Array.isArray(p)) positions = p;
      } catch (e) {}
      const res = startDuel({ trader, kisPositions: positions });
      if (!res.ok) { setErr(res.error || "시작 실패"); setBusy(false); return; }
      reload();
      try { window.dispatchEvent(new Event("onehub-assets-change")); } catch (e) {}
    } finally {
      setBusy(false);
    }
  };

  const onReset = () => {
    if (!window.confirm("포트폴리오 대결을 초기화할까요?\n지금까지의 기준·결정 기록이 모두 사라지고 처음부터 다시 시작됩니다.")) return;
    resetDuel(trader);
    reload();
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
            : <>KIS 실보유가 확인되지 않아 <b>{eok(DEFAULT_CASH)}원 가상현금</b>으로 "나"와 "AI" 두 포트폴리오를 시작합니다.</>}
        </p>
        <p className="pd-intro sub">매일 나오는 매수·매도 추천을 AI는 항상 수용하고, 나는 내가 고른 대로만 반영합니다. 그 차이가 곧 대결 결과입니다.</p>
        <button type="button" className="pd-start" onClick={onStart} disabled={busy}>{busy ? "시작하는 중…" : "대결 시작하기"}</button>
        {err && <div className="pd-err">{err}</div>}
      </section>
    );
  }

  // ── 화면: 진행 중 ──────────────────────────────────────────────────
  const myVal = portfolioValue(duel.me, quotes);
  const aiVal = portfolioValue(duel.ai, quotes);
  const diff = myVal - aiVal;
  const diffPct = aiVal > 0 ? (diff / aiVal) * 100 : 0;
  const chartData = snapshots.map((s) => ({ label: s.date.slice(5), 나: s.myValue, AI: s.aiValue }));

  // 오늘의 매수 후보(dash.recommend_stocks 중 매수 신호(score>=70)이고 오늘 아직 결정 안 한 것)
  const buyCands = (dash?.recommend_stocks || [])
    .filter((c) => c.code && (c.score ?? 0) >= 70 && !hasDecisionToday(trader, c.code, "buy"))
    .slice(0, 3);
  // 오늘의 매도 후보(AI 보유 중 손절/익절 구간)
  const sellCands = detectSellCandidates(trader, quotes).filter((c) => !hasDecisionToday(trader, c.code, "sell"));

  const recentDecisions = [...duel.decisions].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 8);

  return (
    <section className="pd-card">
      <div className="pd-title">🥊 포트폴리오 대결 <span className="pd-sub">{duel.base.startDate}부터 · {duel.base.seedType === "kis" ? "실보유 기준" : "가상현금 기준"}</span></div>

      <div className="pd-vs">
        <div className="pd-vs-side">
          <span className="pd-vs-lbl">나</span>
          <span className="pd-vs-val">{eok(myVal)}원</span>
        </div>
        <div className={`pd-vs-diff ${diff > 0 ? "pos" : diff < 0 ? "neg" : ""}`}>
          {diff > 0 ? "+" : ""}{eok(diff)} ({diffPct > 0 ? "+" : ""}{diffPct.toFixed(2)}%)
        </div>
        <div className="pd-vs-side">
          <span className="pd-vs-lbl">AI</span>
          <span className="pd-vs-val">{eok(aiVal)}원</span>
        </div>
      </div>

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
              <span className="pd-item-amt">{eok(BUY_AMOUNT_WON)}원 규모</span>
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
            const now = quotes[d.code];
            const chgPct = now != null && d.price > 0 ? (now / d.price - 1) * 100 * (d.action === "sell" ? -1 : 1) : null;
            return (
              <div className="pd-hist-row" key={d.id}>
                <span className="pd-hist-date">{d.date}</span>
                <span className="pd-hist-name">{d.name}</span>
                <span className={`pd-hist-tag ${d.accepted ? "on" : "off"}`}>{d.action === "buy" ? "매수" : "매도"} {d.accepted ? "수용" : "거부"}</span>
                {chgPct != null && <span className={`pd-hist-chg ${chgPct > 0 ? "pos" : chgPct < 0 ? "neg" : ""}`}>그 결정 이후 {chgPct > 0 ? "+" : ""}{chgPct.toFixed(1)}%</span>}
              </div>
            );
          })}
        </div>
      )}

      <div className="pd-foot">
        <span>매수 추천은 100만원 규모, 매도 추천은 AI 보유분 평단 대비 {"-5%"}(손절)/{"+10%"}(익절) 기준입니다. 투자자문이 아닙니다.</span>
        <button type="button" className="pd-reset" onClick={onReset}>초기화</button>
      </div>

      <style jsx>{`
        .pd-card { background: var(--color-card); border: 1px solid var(--color-line); border-radius: 14px; padding: 16px; box-shadow: var(--shadow-card); }
        .pd-title { font-size: 1rem; font-weight: 800; color: var(--color-ink); margin-bottom: 4px; }
        .pd-sub { font-size: 0.7rem; font-weight: 600; color: var(--color-ink-3); margin-left: 6px; }
        .pd-intro { font-size: 0.84rem; color: var(--color-ink-2); line-height: 1.6; margin: 10px 0 0; word-break: keep-all; }
        .pd-intro.sub { font-size: 0.76rem; color: var(--color-ink-3); }
        .pd-start { width: 100%; margin-top: 14px; padding: 13px; border-radius: 10px; border: none; background: var(--color-primary); color: #fff; font-size: 0.9rem; font-weight: 800; cursor: pointer; font-family: var(--font-sans); }
        .pd-err { margin-top: 8px; font-size: 0.78rem; color: var(--color-danger); }
        .pd-vs { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin: 12px 0; }
        .pd-vs-side { display: flex; flex-direction: column; align-items: center; gap: 2px; }
        .pd-vs-lbl { font-size: 0.72rem; font-weight: 700; color: var(--color-ink-3); }
        .pd-vs-val { font-size: 1.15rem; font-weight: 800; color: var(--color-ink); font-family: ui-monospace, monospace; }
        .pd-vs-diff { font-size: 0.9rem; font-weight: 800; }
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
        .pd-history { margin-top: 10px; display: flex; flex-direction: column; gap: 6px; }
        .pd-hist-row { display: flex; align-items: center; gap: 8px; padding: 6px 0; border-bottom: 1px solid var(--color-line); flex-wrap: wrap; }
        .pd-hist-date { font-size: 0.66rem; color: var(--color-ink-3); font-family: ui-monospace, monospace; }
        .pd-hist-name { font-size: 0.78rem; font-weight: 700; color: var(--color-ink); }
        .pd-hist-tag { font-size: 0.62rem; font-weight: 700; padding: 1px 6px; border-radius: 999px; }
        .pd-hist-tag.on { background: var(--color-primary-soft); color: var(--color-primary); }
        .pd-hist-tag.off { background: var(--color-card-soft); color: var(--color-ink-3); }
        .pd-hist-chg { font-size: 0.72rem; font-weight: 700; margin-left: auto; }
        .pd-hist-chg.pos { color: var(--color-success); } .pd-hist-chg.neg { color: var(--color-danger); }
        .pd-foot { margin-top: 14px; padding-top: 10px; border-top: 1px solid var(--color-line); display: flex; flex-direction: column; gap: 8px; }
        .pd-foot span { font-size: 0.68rem; color: var(--color-ink-3); line-height: 1.6; word-break: keep-all; }
        .pd-reset { align-self: flex-start; font-size: 0.7rem; color: var(--color-ink-3); background: none; border: none; cursor: pointer; text-decoration: underline; padding: 0; font-family: var(--font-sans); }
      `}</style>
    </section>
  );
}
