// [N3] '오늘' — 할 일 중심 액션 페이지. 5블록.
//   설계 원칙: 관망일에도 최소 3블록(②④⑤)은 항상 렌더된다.
//   매수 후보가 없다는 말만 하고 끝내면 재방문 이유가 사라진다. 대신 'AI가 무엇을 왜 걸렀나'를 말한다.
//   — 이건 이 앱의 브랜드(사후검증·투명한 실패 공개)와 정확히 일치하고, 다른 앱엔 없는 콘텐츠다.
//   데이터는 전부 기존 소스: 원장(lib/ledger) · /api/pwa-dashboard · /api/pwa-pending ·
//   /api/pwa/re/feed · lib/verdictLedger(판단 기록). 새로 만든 저장소 없음.
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/router";
import { getTrader, useTrader } from "../../lib/trader";
import { getLedger as getAssetLedger } from "../../lib/ledger";
import { getLedger as getDecisionLedger } from "../../lib/verdictLedger";
import { samplePolicy } from "../../lib/sampleSize";
import { pickInsight } from "../../lib/crossInsight";
import TraderBadge from "../../components/shared/TraderBadge";
import BottomNav from "../../components/BottomNav";
import DataState from "../../components/DataState";
import LastUpdated from "../../components/LastUpdated";

const DAY = 86400000;
const MATURE_DAYS = 3; // 판단 → 채점까지(나 vs AI)
const regimeKo = (r) => ({ BULL: "상승", BEAR: "하락", SIDE: "횡보", SIDEWAYS: "횡보", NEUTRAL: "중립" }[String(r || "").toUpperCase()] || null);
const pctTxt = (v) => `${Number(v) >= 0 ? "+" : ""}${Number(v).toFixed(2)}%`;
const mmdd = (ms) => { const d = new Date(ms); return `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

// 백엔드가 positions를 문자열로 주는 경우가 있어 방어적으로 파싱
function parsePositions(dash) {
  let p = dash?.balance?.positions;
  if (typeof p === "string") { try { p = JSON.parse(p); } catch { p = null; } }
  return Array.isArray(p) ? p : [];
}

export default function TodayPage() {
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

  const load = useCallback(() => {
    const tr = getTrader();
    setStatus((s) => (dash ? "stale" : "loading"));
    try { const mp = JSON.parse(localStorage.getItem("onehub_re_my_property") || "null"); setMyComplex(mp?.name || ""); } catch (e) {}
    try { setDecisions(getDecisionLedger(tr) || []); } catch (e) { setDecisions([]); }
    Promise.all([
      fetch(`/api/pwa-dashboard?trader=${tr}`).then((r) => r.json()).catch(() => null),
      fetch(`/api/pwa-pending?trader=${tr}`).then((r) => r.json()).catch(() => null),
      fetch(`/api/pwa/re/feed`).then((r) => r.json()).catch(() => null),
      getAssetLedger(tr).catch(() => null),
    ]).then(([d, p, f, L]) => {
      setDash(d); setPend(p); setFeed(f); setLedger(L); setAt(new Date());
      setStatus(d || L ? "ok" : "error");
    });
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

  const positions = parsePositions(dash);
  const regime = regimeKo(dash?.market?.regime);
  const heat = dash?.market?.heat_score;
  const cands = dash?.recommend_stocks ?? [];
  const blocked = dash?.today_blocked ?? [];
  const pendItems = pend?.ok ? (pend.items ?? []) : [];

  // ── ① 결정 대기: 승인 대기 + 손절선 임박. 없으면 블록 자체를 렌더하지 않는다.
  // [S18 C-6] 손실률은 상태이지 이벤트가 아니다 — 평가손익률만으로 결정대기를 띄우지 않는다.
  //   손절선이 있는 종목만, 그 선을 기준으로 발동한다(이탈 또는 2% 이내 근접).
  const nearStop = positions.filter((p) => {
    const sl = Number(p.stop_loss) || 0, cur = Number(p.current_price) || 0;
    return sl > 0 && cur > 0 && cur <= sl * 1.02;
  });
  const decideCount = pendItems.length + nearStop.length;

  // ── ② 통합 판단: '안 산 것'을 콘텐츠로. 관망일에도 항상 할 말이 있다.
  const scanned = cands.length + blocked.length;
  // [S18 B-1] 앱은 자기 상태를 시장 판단으로 말하지 않는다.
  //   기존 문구는 차단 건수에 "시장에 매수할 대상이 없다"는 단정을 덧붙였다.
  //   우리가 아는 건 '우리 기준을 넘은 게 없다'뿐이다. 같은 시각 추천 탭에는 관심 종목이
  //   떠 있고(오늘 Top3 = 방산 3종), 두 화면이 다른 말을 하면 사용자는 둘 다 못 믿는다.
  //   그래서 아는 사실만 말하고 판단은 사용자에게 남긴다.
  const blockLine = blocked.length > 0
    ? `AI가 ${scanned > 0 ? `후보 ${scanned}종목 중 ` : ""}${blocked.length}종목을 매수 기준 미달로 걸렀습니다.`
    : cands.length > 0
    ? `AI가 매수 후보 ${cands.length}종목을 추렸습니다.`
    : "오늘은 AI가 살펴본 종목 중 매수 기준을 넘은 게 없습니다.";

  // ── ③ 내 자산 오늘: 변화 있을 때만. 부동산 신고가는 '내 단지 아님' 라벨 필수(오해 방지).
  const movers = positions
    .filter((p) => Number.isFinite(Number(p.pnl_rate)) && Math.abs(Number(p.pnl_rate)) >= 3)
    .sort((a, b) => Math.abs(Number(b.pnl_rate)) - Math.abs(Number(a.pnl_rate)))
    .slice(0, 2);
  const hi = (feed?.feed ?? []).find((f) => Number(f.변동률) > 0) || null;
  const hasChange = movers.length > 0 || !!hi;

  // ── ④ 채점 임박: 판단 후 3일. 가장 빠른 결과일.
  const tr2 = trader || "A";
  const mine = decisions.filter((d) => (d.trader || "A") === tr2);
  const pendingJudge = mine.filter((d) => Date.now() - d.ts < MATURE_DAYS * DAY);
  const soonest = pendingJudge.length ? Math.min(...pendingJudge.map((d) => d.ts)) + MATURE_DAYS * DAY : null;

  // ── ⑤ AI 학습: 정식 통계까지 남은 표본.
  const pol = samplePolicy(mine.length);

  // ── [N9] 자산군 교차 판단 — 하루 1개만. 규칙 기반·결정적(같은 데이터 = 같은 문장).
  const insight = pickInsight(ledger, { regime: dash?.market?.regime, heat: dash?.market?.heat_score, blockedCount: blocked.length });

  return (
    <div className="td">
      <header className="td-hd">
        <button className="td-logo" onClick={() => router.push("/pwa/today")} aria-label="오늘">ONE<span className="td-dot">·</span>HUB</button>
        <div className="td-ic">
          <TraderBadge />
          <button className="td-search" onClick={() => router.push("/pwa?tab=analyze")} aria-label="AI 종목 검색">🔍</button>
        </div>
      </header>

      <div className="td-title">오늘 <span className="td-sub">할 일 중심</span>{at && <span className="td-fresh"><LastUpdated timestamp={at} onRefresh={load} /></span>}</div>

      <DataState status={status} hasData={!!dash || !!ledger} onRetry={load} skeletonLines={4} skeletonBlock>
        {/* ① 결정 대기 — 있을 때만 · 최상단 · 주의색 */}
        {decideCount > 0 && (
          <section className="card td-decide">
            <div className="td-h">결정 대기 <b>{decideCount}건</b></div>
            {nearStop.slice(0, 3).map((p, i) => {
              // [S18 C-6] '부근'은 완곡어다. 현재가가 손절선 아래면 이미 이탈한 것이고,
              //   보유 화면은 이미 '이탈'이라 정확히 말한다. 두 화면이 다른 말을 하면 안 된다.
              const sl = Number(p.stop_loss) || 0;
              const cur = Number(p.current_price) || 0;
              const breached = sl > 0 && cur > 0 && cur < sl;
              const distPct = sl > 0 && cur > 0 ? ((cur / sl - 1) * 100) : null;
              return (
                <div className="td-drow" key={p.code || i}>
                  <span className="td-dn">{p.name}<em className="td-dpct">{pctTxt(p.pnl_rate)}</em></span>
                  <span className="td-dsub">
                    {breached
                      ? `손절선 ${sl.toLocaleString()}원 이탈 — 매도 검토 필요`
                      : `손절선까지 ${Math.abs(distPct).toFixed(1)}% — 오늘 판단이 필요합니다`}
                  </span>
                  {/* [S18 C-6] AI 판단을 반드시 병기한다. 사유만 있고 AI 판단이 없으면
                      사용자는 '앱이 겁주는 건지 AI가 팔라는 건지' 알 수 없다. */}
                  {p.ai_verdict && <span className="td-dai">AI 판단: {p.ai_verdict}</span>}
                </div>
              );
            })}
            {pendItems.slice(0, 3).map((p, i) => (
              <div className="td-drow" key={p.code || `p${i}`}>
                <span className="td-dn">{p.name || p.stock || p.code}</span>
                <span className="td-dsub">{p.reason || "AI 매수 제안 — 승인/거절이 필요합니다"}</span>
              </div>
            ))}
            <button className="td-cta" onClick={() => router.push("/pwa?tab=portfolio")}>지금 판단 →</button>
          </section>
        )}

        {/* ② 오늘의 통합 판단 — 항상. '안 산 것'이 콘텐츠 */}
        <section className="card">
          <div className="td-h">오늘의 통합 판단</div>
          <p className="td-vtext">
            {regime ? <>시장은 <b>{regime} 국면</b>{heat != null ? <> · 온도 {heat}</> : null}. </> : null}
            {blockLine}
          </p>
          {blocked.length > 0 && (
            <button className="td-link" onClick={() => router.push("/pwa?tab=report&sec=verify")}>무엇을 왜 걸렀나 →</button>
          )}
          {/* [N9] 자산을 묶어 본 판단 — 하루 1개. 주식·ETF·부동산을 따로 보면 안 보이는 것. */}
          {insight && (
            <div className="td-x">
              <div className="td-x-h">자산을 묶어 보면</div>
              <p className="td-x-t">{insight.text}</p>
              <button className="td-link" onClick={() => router.push(insight.cta.href)}>{insight.cta.label}</button>
              <div className="td-x-d">{insight.disclaimer}</div>
            </div>
          )}
        </section>

        {/* ③ 내 자산 오늘 — 변화 있을 때만 */}
        <section className="card">
          <div className="td-h">내 자산 오늘</div>
          {hasChange ? (
            <div className="td-mlist">
              {movers.map((p, i) => (
                <div className="td-mrow" key={p.code || i}>
                  <span className="td-mn">{p.name}</span>
                  <span className={`td-mv ${Number(p.pnl_rate) >= 0 ? "up" : "dn"}`}>{pctTxt(p.pnl_rate)}</span>
                </div>
              ))}
              {hi && (
                <div className="td-mrow">
                  <span className="td-mn">{hi.단지명} <em className="td-note">신고가 {hi.거래금액_억}억</em></span>
                  <span className="td-mv up">+{hi.변동률}%{hi.단지명 !== myComplex && <em className="td-not-mine">내 단지 아님</em>}</span>
                </div>
              )}
            </div>
          ) : (
            <p className="td-vtext td-quiet">오늘은 큰 변화가 없습니다.{ledger?.total_uk != null ? <> 총자산 <b>{Number(ledger.total_uk).toFixed(2)}억</b>.</> : null}
              {/* [N1] 총자산을 말하는 곳이면 어디서든 불완전 사실을 함께 말한다 — 한 화면만 정직하면 의미가 없다 */}
              {(ledger?.warnings || []).some((w) => w.code === "BACKEND_UNAVAILABLE") && <> ⚠ 증권사 연동 자산이 빠져 실제보다 적습니다.</>}
            </p>
          )}
        </section>

        {/* ④ 채점 임박 — 항상 */}
        <section className="card td-judge" onClick={() => router.push("/pwa?tab=report&sec=vs")}>
          <div className="td-h">나 vs AI</div>
          {pendingJudge.length > 0 ? (
            <p className="td-vtext"><b>{pendingJudge.length}건</b> 채점 중 · 가장 빠른 결과 <b>{soonest ? mmdd(soonest) : "-"}</b> <span className="td-arrow">기록 →</span></p>
          ) : (
            <p className="td-vtext td-quiet">아직 승부가 없어요 — 추천에서 판단을 남기면 3일 뒤 자동 채점됩니다. <span className="td-arrow">첫 승부 시작 →</span></p>
          )}
        </section>

        {/* ⑤ AI 학습 — 항상 */}
        <section className="card">
          <div className="td-h">AI 학습</div>
          <div className="td-prog"><span className="td-prog-fill" style={{ width: `${pol.progressPct}%` }} /></div>
          <p className="td-vtext td-quiet">
            {pol.count}/{pol.target}
            {pol.remaining > 0 ? <> · {pol.remaining}건 남으면 정식 통계를 공개합니다</> : <> · 정식 통계 구간입니다</>}
          </p>
        </section>
      </DataState>

      <BottomNav active="today" />

      <style jsx>{`
        /* [N5-3] 하단 여백 = 하단탭(56) + FAB 상단(68+52) 여유 확보 */
        .td { max-width: 480px; margin: 0 auto; padding: 0 14px calc(env(safe-area-inset-bottom, 0px) + 140px); font-family: var(--font-sans); color: var(--color-ink); min-height: 100vh; background: var(--color-bg); }
        .td-hd { display: flex; align-items: center; justify-content: space-between; padding: calc(env(safe-area-inset-top, 0px) + 12px) 2px 10px; }
        .td-logo { font-weight: 800; font-size: 20px; letter-spacing: -.5px; color: var(--color-ink); background: none; border: none; padding: 0; cursor: pointer; font-family: var(--font-sans); }
        .td-dot { color: var(--color-success); }
        .td-ic { display: flex; align-items: center; gap: 8px; }
        .td-search { width: 34px; height: 34px; border-radius: 50%; background: var(--color-card); border: none; display: grid; place-items: center; font-size: 15px; cursor: pointer; box-shadow: var(--shadow-card); }
        .td-title { display: flex; align-items: center; gap: 8px; font-size: 20px; font-weight: 800; letter-spacing: -.4px; margin: 6px 2px 14px; flex-wrap: wrap; }
        .td-sub { font-size: 12px; font-weight: 600; color: var(--color-ink-3); }
        .td-fresh { margin-left: auto; }
        .card { background: var(--color-card); border: 1px solid var(--color-line); border-radius: var(--radius-card, 14px); padding: 16px; margin-bottom: 12px; box-shadow: var(--shadow-card); }
        .td-h { font-size: 0.86rem; font-weight: 800; color: var(--color-ink); margin-bottom: 10px; }
        .td-h b { color: var(--color-primary); }
        /* ① 결정 대기 — 주의색 강조 */
        .td-decide { border-left: 4px solid var(--color-danger); }
        .td-decide .td-h b { color: var(--color-danger); }
        .td-drow { display: flex; flex-direction: column; gap: 2px; padding: 8px 0; border-bottom: 1px solid var(--color-line); }
        .td-drow:last-of-type { border-bottom: none; }
        .td-dn { font-size: 0.88rem; font-weight: 800; color: var(--color-ink); display: flex; align-items: baseline; gap: 6px; }
        .td-dpct { font-style: normal; font-size: 0.8rem; font-weight: 800; color: var(--color-danger); }
        .td-dsub { font-size: 0.74rem; color: var(--color-ink-2); word-break: keep-all; line-height: 1.45; }
        /* [S18 C-6] AI 판단 병기 — 사유와 나란히, 위계는 한 단계 아래 */
        .td-dai { font-size: 0.7rem; font-weight: 700; color: var(--color-ink-3); word-break: keep-all; }
        .td-cta { width: 100%; margin-top: 10px; min-height: 44px; border: none; border-radius: 11px; background: var(--color-danger); color: #fff; font-size: 0.86rem; font-weight: 800; cursor: pointer; font-family: var(--font-sans); }
        .td-vtext { font-size: 0.88rem; line-height: 1.55; color: var(--color-ink); word-break: keep-all; margin: 0; }
        .td-quiet { color: var(--color-ink-2); font-size: 0.82rem; }
        .td-link { margin-top: 10px; min-height: 44px; padding: 0 2px; border: none; background: none; color: var(--color-primary); font-size: 0.82rem; font-weight: 800; cursor: pointer; font-family: var(--font-sans); }
        /* [N9] 교차 판단 — ② 아래 점선으로 구분. 하루 1개. */
        .td-x { margin-top: 12px; padding-top: 12px; border-top: 1px dashed var(--color-line); }
        .td-x-h { font-size: 0.72rem; font-weight: 800; color: var(--color-primary); margin-bottom: 6px; }
        .td-x-t { font-size: 0.84rem; line-height: 1.55; color: var(--color-ink); word-break: keep-all; margin: 0; }
        .td-x-d { font-size: 0.66rem; color: var(--color-ink-3); margin-top: 6px; line-height: 1.5; }
        .td-mlist { display: flex; flex-direction: column; gap: 2px; }
        .td-mrow { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 8px 0; border-bottom: 1px solid var(--color-line); }
        .td-mrow:last-child { border-bottom: none; }
        .td-mn { font-size: 0.84rem; font-weight: 700; color: var(--color-ink); min-width: 0; }
        .td-note { font-style: normal; font-size: 0.72rem; font-weight: 600; color: var(--color-ink-3); margin-left: 4px; }
        .td-mv { font-size: 0.84rem; font-weight: 800; white-space: nowrap; }
        .td-mv.up { color: var(--color-success); } .td-mv.dn { color: var(--color-danger); }
        .td-not-mine { display: block; font-style: normal; font-size: 0.62rem; font-weight: 700; color: var(--color-ink-3); text-align: right; }
        .td-judge { cursor: pointer; }
        .td-arrow { color: var(--color-primary); font-weight: 800; white-space: nowrap; }
        .td-prog { height: 8px; border-radius: 999px; background: var(--color-card-soft, var(--color-line)); overflow: hidden; margin-bottom: 8px; }
        .td-prog-fill { display: block; height: 100%; background: var(--color-primary); }
      `}</style>
      <style jsx global>{`body { background: var(--color-bg); margin: 0; }`}</style>
    </div>
  );
}
