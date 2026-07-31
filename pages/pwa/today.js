// [N3] '오늘' — 할 일 중심 액션 페이지. 5블록.
//   설계 원칙: 관망일에도 최소 3블록(②④⑤)은 항상 렌더된다.
//   매수 후보가 없다는 말만 하고 끝내면 재방문 이유가 사라진다. 대신 'AI가 무엇을 왜 걸렀나'를 말한다.
//   — 이건 이 앱의 브랜드(사후검증·투명한 실패 공개)와 정확히 일치하고, 다른 앱엔 없는 콘텐츠다.
//   데이터는 전부 기존 소스: 원장(lib/ledger) · /api/pwa-dashboard · /api/pwa-pending ·
//   /api/pwa/re/feed · lib/verdictLedger(판단 기록). 새로 만든 저장소 없음.
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/router";
import { getTrader, useTrader } from "../../lib/trader";
import { dedupBy } from "../../lib/useDedup";
import { getLedger as getAssetLedger } from "../../lib/ledger";
import ReportTeaser from "../../components/ReportTeaser";
import TodayNews from "../../components/TodayNews";
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
  const [notis, setNotis] = useState([]); // [알림카드 #5] 텔레그램/리포트 알림 피드
  const [opNotes, setOpNotes] = useState([]); // [알림카드 #6] 운영자 신고가(spot_price)
  const [notiOpen, setNotiOpen] = useState(null); // 펼친 알림 인덱스
  const [notiAll, setNotiAll] = useState(false); // [알림필터] 전체(루틴 포함) 보기 토글

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
    // [알림카드 #5·#6] 텔레그램 알림 + 운영자 신고가
    fetch(`/api/notifications?trader=${tr}`).then((r) => r.json())
      // [알림중복 수정] 집계 피드(텔레그램+리포트+큐싱크)가 같은 이벤트를 중복으로 줄 수 있어
      //   프로젝트 필수 규칙대로 렌더 전에 dedupBy 로 흡수한다(id 없으면 제목|본문|시각 조합).
      .then((n) => { if (n?.ok && Array.isArray(n.items)) setNotis(dedupBy(n.items, (x) => x.id ?? `${x.title || ""}|${x.body || ""}|${x.sent_at || x.created_at || ""}`)); }).catch(() => {});
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

  // [삭제] '내 자산 오늘'(movers/hi/hasChange) 제거 — 아래 렌더 주석 참고.

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
        <button className="td-logo" onClick={() => router.push("/pwa/assets")} aria-label="종합자산">ONE<span className="td-dot">·</span>HUB</button>
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

        {/* [알림카드 #5·#6] 오늘 알림 상세 — 텔레그램 본문 + 운영자 신고가. 푸시 클릭 시 여기서 상세 확인. */}
        {(notis.length > 0 || opNotes.length > 0) && (
          <section className="card td-noti">
            <div className="tn-hh">🔔 오늘 중요 알림</div>
            <div className="tn-list">
              {opNotes.slice(0, 3).map((s, i) => (
                <div className="tn-item op" key={`op${i}`}>
                  <span className="tn-ic">🏢</span>
                  <div className="tn-b">
                    <div className="tn-t">운영자 신고가 · {s.complex_name}{s.area_m2 ? ` ${Math.round(s.area_m2)}㎡` : ""}<span className="tn-src">운영자</span></div>
                    <div className="tn-d">{s.price_manwon ? `${(s.price_manwon / 10000).toFixed(2)}억` : ""} · {s.kind || "신고"}{s.status === "tentative" ? " · 미확정(참고)" : ""}</div>
                  </div>
                  {s.created_at && <span className="tn-ts">{String(s.created_at).slice(5, 16)}</span>}
                </div>
              ))}
              {(() => {
                // [알림필터] 당일 중요 알림만 — 루틴(오늘 해야 하는 것/리포트/브리핑) 제외, 매매·신호·손절·승인·서킷·오류·신고가 우선.
                const kd = new Date(Date.now() + 9 * 3600 * 1000);
                const today = `${kd.getUTCFullYear()}-${String(kd.getUTCMonth() + 1).padStart(2, "0")}-${String(kd.getUTCDate()).padStart(2, "0")}`;
                const RT = /오늘 해야 하는 것|전략 성과|최근 30일|Report|리포트|브리핑|Morning|Evening|Started|Status/i;
                const IMP = /매수|매도|체결|손절|익절|승인|신호|차단|자율|서킷|circuit|오류|error|급등|급락|주문|신고가|OPEN|CLOSED/i;
                const impNotis = notis.filter((n) => {
                  const ts = String(n.sent_at || n.created_at || "");
                  const txt = `${n.title || ""} ${n.noti_type || ""} ${n.body || ""}`;
                  const isCrit = /critical|important/i.test(n.noti_type || "");
                  const isRoutine = RT.test(n.title || "");
                  // [알림중복 수정] 운영자 신고가는 위 opNotes 카드(🏢)에 이미 표시되므로
                  //   이 목록(🧑‍💼)에서는 제외해 이중 노출을 막는다.
                  const isOp = /operator|운영자|manual/i.test(n.source || "");
                  return ts.startsWith(today) && (isCrit || IMP.test(txt)) && !isRoutine && !isOp;
                });
                const shown = notiAll ? notis.slice(0, 12) : impNotis.slice(0, 5);
                if (shown.length === 0) {
                  return <div className="tn-empty">오늘은 중요 매매 알림이 없습니다 · 관망{notis.length > 0 ? <button className="tn-toggle inline" onClick={() => setNotiAll(true)}>전체 알림 {notis.length}건 보기 →</button> : null}</div>;
                }
                return (<>
                  {shown.map((n) => {
                    const title = n.title || n.message || "알림";
                    const body = n.body || n.detail || "";
                    const t = n.noti_type || n.type || "";
                    const src = n.source || "";
                    const isOp = /operator|운영자|manual/i.test(src);
                    const ic = isOp ? "🧑‍💼" : /buy|매수|신호/i.test(t + title) ? "📈" : /sell|매도|손절|익절/i.test(t + title) ? "📉" : /critical|important|error|오류|circuit|서킷|자율/i.test(t + title) ? "⚠️" : /report|리포트/i.test(t + title) ? "📄" : "🔔";
                    const ts = n.sent_at || n.created_at || n.timestamp || null;
                    const when = ts ? String(ts).replace("T", " ").slice(5, 16) : null;
                    const key = n.id != null ? n.id : title + when;
                    const open = notiOpen === key;
                    const hasDetail = body && body.trim() && body.trim() !== title.trim();
                    return (
                      <div className={`tn-item ${n.is_read ? "" : "unread"}`} key={key} onClick={() => hasDetail && setNotiOpen(open ? null : key)} style={{ cursor: hasDetail ? "pointer" : "default" }}>
                        <span className="tn-ic">{ic}</span>
                        <div className="tn-b">
                          <div className="tn-t">{title}{isOp && <span className="tn-src">운영자</span>}{hasDetail && <span className="tn-more">{open ? "▲" : "▾"}</span>}</div>
                          {hasDetail && open && <div className="tn-d">{body}</div>}
                        </div>
                        {when && <span className="tn-ts">{when}</span>}
                      </div>
                    );
                  })}
                  {(notiAll ? notis.length > 12 : notis.length > impNotis.length) && (
                    <button className="tn-toggle" onClick={() => setNotiAll((v) => !v)}>{notiAll ? "중요 알림만 보기" : `전체 알림 ${notis.length}건 보기 →`}</button>
                  )}
                </>);
              })()}
            </div>
            <p className="tn-foot">💡 매매·신호·손절·승인·서킷·오류·신고가 등 <b>당일 중요 알림</b>만 표시합니다 · 항목을 누르면 상세가 펼쳐집니다.</p>
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

        {/* [삭제] '내 자산 오늘' 섹션 제거 — ① 남의 부동산 신고가(내 단지 아님)를 섞고 ② '오늘'이라면서
            총손익(당일변동 아님)을 보여줘 자산 화면과 어긋남 ③ 손절임박은 위 '결정 대기', 전체 포트는
            '자산' 화면과 중복. 중요한 변동은 결정 대기·알림 카드로 대체. */}

        {/* 🏠 부동산 소식 — CA 엔진이 운영자 큐레이션한 지역 동향/제보(board). 실거래 feed 는 현재 비어
            표시 안 하고, 승인 게시된 CA 정보만. 데이터 없으면 카드 자체가 안 뜬다(빈 자리 방지). */}
        <ReportTeaser />

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
          {/* [S18 C-2] 이 진행도는 '내 판단 기록'(나 vs AI 채점 대상)이지 검증 표본이 아니다.
              정식 통계 여부는 sample.verified(block_accuracy 검증 완료) 기준으로만 판정한다.
              이 수가 30을 넘겼다고 "정식 통계 구간"이라 선언하면 다른 축의 숫자로 통계를
              선언하는 셈이 된다 — 실제로 자기검증 탭은 같은 시각 "학습 중"이라고 말한다. */}
          <div className="td-h">AI 학습 <span className="td-sub">나 vs AI 채점 기준</span></div>
          <div className="td-prog"><span className="td-prog-fill" style={{ width: `${pol.progressPct}%` }} /></div>
          <p className="td-vtext td-quiet">
            누적 판단 기록 {pol.count}건
            {pol.remaining > 0 ? <> · {pol.remaining}건 남으면 채점 통계를 공개합니다</> : <> · 채점 기준 {pol.target}건을 넘겼습니다</>}
          </p>
        </section>
      </DataState>

      {/* 오늘의 뉴스 — 뉴스 엔진 게시분(운영자 큐레이션). 데이터 없으면 조용히 숨김. */}
      <TodayNews />

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
        /* [알림카드 #5·#6] 오늘 알림 상세 */
        .td-noti .tn-hh { font-size: 0.86rem; font-weight: 800; color: var(--color-ink); margin-bottom: 10px; }
        .tn-list { display: flex; flex-direction: column; }
        .tn-item { display: flex; gap: 9px; align-items: flex-start; padding: 10px 2px; border-bottom: 1px solid var(--color-line); }
        .tn-item:last-child { border-bottom: none; }
        .tn-item.op { background: var(--color-warning-soft); border-radius: 8px; padding: 10px; border-bottom: none; margin-bottom: 4px; }
        .tn-ic { flex-shrink: 0; font-size: 15px; line-height: 1.4; }
        .tn-b { flex: 1; min-width: 0; }
        .tn-t { font-size: 0.8rem; font-weight: 700; color: var(--color-ink); line-height: 1.45; word-break: keep-all; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
        .tn-item.unread .tn-t::before { content: ""; display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: var(--color-danger); }
        .tn-src { font-size: 0.58rem; font-weight: 800; color: var(--color-primary); background: var(--color-primary-soft); padding: 1px 6px; border-radius: 5px; }
        .tn-more { font-size: 0.6rem; color: var(--color-ink-3); }
        .tn-d { font-size: 0.74rem; color: var(--color-ink-2); line-height: 1.55; margin-top: 5px; white-space: pre-wrap; word-break: keep-all; background: var(--inset-bg, var(--color-card-soft)); border-radius: 8px; padding: 8px 10px; }
        .tn-ts { flex-shrink: 0; font-size: 10px; color: var(--color-ink-3); padding-top: 2px; font-family: ui-monospace, monospace; }
        .tn-foot { font-size: 0.64rem; color: var(--color-ink-3); margin-top: 10px; line-height: 1.5; word-break: keep-all; }
        .tn-empty { font-size: 0.78rem; color: var(--color-ink-2); padding: 10px 2px; line-height: 1.5; word-break: keep-all; }
        .tn-toggle { width: 100%; margin-top: 8px; border: 1px solid var(--color-line); background: var(--color-card); color: var(--color-ink-2); border-radius: 9px; padding: 8px 0; font-size: 0.74rem; font-weight: 700; cursor: pointer; font-family: var(--font-sans); }
        .tn-toggle.inline { width: auto; display: inline-block; margin-left: 8px; padding: 4px 10px; font-size: 0.7rem; }
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
