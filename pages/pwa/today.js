// [G5] '오늘' 액션 페이지 — 하단탭 IA의 기본 진입점(자산 분류가 아닌 '할 일' 기준, S1 해소).
//   구성: ① 승인 대기(N건) ② 오늘의 통합 AI 판단 1문장 ③ 오늘의 액션 3개 ④ 오늘 매매 요약.
//   기존 데이터(/api/pwa-dashboard·/api/pwa-pending) 재사용. 색은 디자인 토큰만.
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/router";
import { getTrader, useTrader } from "../../lib/trader";
import TraderBadge from "../../components/shared/TraderBadge";
import BottomNav from "../../components/BottomNav";
import DataState from "../../components/DataState";
import LastUpdated from "../../components/LastUpdated";

const regimeKo = (r) => ({ BULL: "상승", BEAR: "하락", SIDE: "횡보", SIDEWAYS: "횡보", NEUTRAL: "중립" }[String(r || "").toUpperCase()] || r || "—");

export default function TodayPage() {
  const router = useRouter();
  const [trader] = useTrader();
  const [dash, setDash] = useState(null);
  const [pending, setPending] = useState(null);
  const [status, setStatus] = useState("loading");
  const [at, setAt] = useState(null);

  const load = useCallback(() => {
    const tr = getTrader();
    setStatus((s) => (dash ? "stale" : "loading"));
    Promise.all([
      fetch(`/api/pwa-dashboard?trader=${tr}`).then((r) => r.json()).catch(() => ({ ok: false })),
      fetch(`/api/pwa-pending?trader=${tr}`).then((r) => r.json()).catch(() => ({ ok: false })),
    ]).then(([d, p]) => {
      setDash(d);
      setPending(p);
      setAt(new Date());
      setStatus(d && d.ok === false ? (d ? "error" : "error") : "ok");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dash]);

  useEffect(() => {
    load();
    const onTrader = () => load();
    window.addEventListener("onehub-trader-change", onTrader);
    return () => window.removeEventListener("onehub-trader-change", onTrader);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ok = dash && dash.ok !== false;
  const regime = dash?.market?.regime;
  const heat = dash?.market?.heat_score;
  const buys = (dash?.recommend_stocks ?? []).filter((s) => (s.score ?? 0) >= 70);
  const blocked = dash?.today_blocked ?? [];
  const pendItems = pending?.ok ? (pending.items ?? []) : [];
  const actions = buys.slice(0, 3);

  const verdict = ok
    ? `시장은 ${regimeKo(regime)} 국면 · 온도 ${heat ?? "—"}. ${buys.length > 0 ? `매수 후보 ${buys.length}건` : "뚜렷한 매수 후보 없음"}${blocked.length > 0 ? ` · 기준 미달 ${blocked.length}건 차단` : ""}.`
    : "";

  const goAnalyze = (s) => router.push(`/pwa?tab=analyze&code=${encodeURIComponent(s.code || "")}&name=${encodeURIComponent(s.name || s.stock || "")}`);

  return (
    <div className="td">
      <header className="td-hd">
        <button className="td-logo" onClick={() => router.push("/pwa/today")} aria-label="오늘">ONE<span className="td-dot">·</span>HUB</button>
        <div className="td-ic">
          <TraderBadge />
          <button className="td-search" onClick={() => router.push("/pwa?tab=analyze")} aria-label="AI 종목 검색">🔍</button>
        </div>
      </header>

      <div className="td-title">🎯 오늘 <span className="td-sub">할 일 중심</span>{at && <span className="td-fresh"><LastUpdated timestamp={at} onRefresh={load} /></span>}</div>

      <DataState status={status} hasData={!!dash} onRetry={load} skeletonLines={4} skeletonBlock>
        {/* ① 승인 대기 — 없으면 섹션 숨김 */}
        {pendItems.length > 0 && (
          <section className="card td-approve">
            <div className="td-h">⏳ 승인 대기 <b>{pendItems.length}건</b></div>
            <div className="td-plist">
              {pendItems.slice(0, 4).map((p, i) => (
                <div className="td-prow" key={p.code || i}>
                  <span className="td-pn">{p.name || p.stock || p.code}</span>
                  {p.reason && <span className="td-pr">{p.reason}</span>}
                </div>
              ))}
            </div>
            <button className="td-cta" onClick={() => router.push("/pwa?tab=dashboard")}>승인 화면으로 →</button>
          </section>
        )}

        {/* ② 오늘의 통합 AI 판단 1문장 */}
        <section className="card td-verdict">
          <div className="td-h">🧭 오늘의 통합 판단</div>
          <p className="td-vtext">{verdict || "데이터를 불러오지 못했습니다."}</p>
        </section>

        {/* ③ 오늘의 액션 3개 */}
        <section className="card">
          <div className="td-h">✅ 오늘의 액션 {actions.length > 0 && <b>{actions.length}</b>}</div>
          {actions.length > 0 ? (
            <div className="td-alist">
              {actions.map((s, i) => (
                <button className="td-arow" key={s.code || i} onClick={() => goAnalyze(s)}>
                  <span className="td-an">{s.name || s.stock}</span>
                  <span className="td-ameta">관심도 {Math.round(s.score ?? 0)} · 분석 →</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="td-empty">오늘은 기준을 넘은 매수 후보가 없습니다. 관망 구간입니다.</div>
          )}
          {blocked.length > 0 && (
            <div className="td-blocked">🛡️ 기준 미달 {blocked.length}건은 자동 차단됐습니다.</div>
          )}
        </section>

        {/* ④ 오늘 매매 결과 요약 */}
        <section className="card td-summary" onClick={() => router.push("/pwa?tab=report")}>
          <div className="td-sumrow">
            <span>📊 오늘 매매 · 나 vs AI 성적</span>
            <span className="td-arrow">기록 보기 →</span>
          </div>
        </section>
      </DataState>

      <BottomNav active="today" />

      <style jsx>{`
        .td { max-width: 480px; margin: 0 auto; padding: 0 14px calc(env(safe-area-inset-bottom, 0px) + 84px); font-family: var(--font-sans); color: var(--color-ink); min-height: 100vh; background: var(--color-bg); }
        .td-hd { display: flex; align-items: center; justify-content: space-between; padding: calc(env(safe-area-inset-top, 0px) + 12px) 2px 10px; }
        .td-logo { font-weight: 800; font-size: 20px; letter-spacing: -.5px; color: var(--color-ink); background: none; border: none; padding: 0; cursor: pointer; font-family: var(--font-sans); }
        .td-dot { color: var(--color-success); }
        .td-ic { display: flex; align-items: center; gap: 8px; }
        .td-search { width: 34px; height: 34px; border-radius: 50%; background: var(--color-card); border: none; display: grid; place-items: center; font-size: 15px; cursor: pointer; box-shadow: var(--shadow-card); }
        .td-title { display: flex; align-items: center; gap: 8px; font-size: 20px; font-weight: 800; letter-spacing: -.4px; margin: 6px 2px 14px; flex-wrap: wrap; }
        .td-sub { font-size: 12px; font-weight: 600; color: var(--color-ink-3); }
        .td-fresh { margin-left: auto; }
        .card { background: var(--color-card); border: 1px solid var(--color-line); border-radius: var(--radius-card, 14px); padding: 16px; margin-bottom: 12px; box-shadow: var(--shadow-card); }
        .td-h { font-size: 0.86rem; font-weight: 800; color: var(--color-ink); margin-bottom: 10px; display: flex; align-items: center; gap: 6px; }
        .td-h b { color: var(--color-primary); }
        .td-approve { border-left: 4px solid var(--color-warning, #f59e0b); }
        .td-plist { display: flex; flex-direction: column; gap: 8px; }
        .td-prow { display: flex; flex-direction: column; gap: 2px; padding: 8px 0; border-bottom: 1px solid var(--color-line); }
        .td-prow:last-child { border-bottom: none; }
        .td-pn { font-size: 0.86rem; font-weight: 700; color: var(--color-ink); }
        .td-pr { font-size: 0.72rem; color: var(--color-ink-3); word-break: keep-all; line-height: 1.4; }
        .td-cta { width: 100%; margin-top: 10px; min-height: 44px; border: none; border-radius: 11px; background: var(--color-primary); color: #fff; font-size: 0.86rem; font-weight: 800; cursor: pointer; font-family: var(--font-sans); }
        .td-vtext { font-size: 0.9rem; line-height: 1.55; color: var(--color-ink); word-break: keep-all; margin: 0; }
        .td-alist { display: flex; flex-direction: column; gap: 8px; }
        .td-arow { display: flex; align-items: center; justify-content: space-between; gap: 10px; min-height: 52px; padding: 10px 12px; border: 1px solid var(--color-line); border-radius: 11px; background: var(--color-card); cursor: pointer; font-family: var(--font-sans); text-align: left; }
        .td-an { font-size: 0.9rem; font-weight: 700; color: var(--color-ink); }
        .td-ameta { font-size: 0.74rem; font-weight: 600; color: var(--color-primary); white-space: nowrap; }
        .td-empty { font-size: 0.8rem; color: var(--color-ink-2); line-height: 1.5; word-break: keep-all; }
        .td-blocked { margin-top: 10px; font-size: 0.74rem; color: var(--color-ink-3); }
        .td-summary { cursor: pointer; }
        .td-sumrow { display: flex; align-items: center; justify-content: space-between; font-size: 0.84rem; font-weight: 700; color: var(--color-ink); }
        .td-arrow { color: var(--color-primary); font-weight: 800; font-size: 0.78rem; }
      `}</style>
      <style jsx global>{`body { background: var(--color-bg); margin: 0; }`}</style>
    </div>
  );
}
