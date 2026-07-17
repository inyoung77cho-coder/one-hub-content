// [A1/A2/A3/A4] 종합자산 = 읽기 전용 인덱스(지도). 상세·편집은 자식 페이지로 위임(편집 UI 없음).
//   3층 구조: 1층 판단1문장+총자산+액션3 / 2층 자산지도(도넛+링크) / 3층 상세 아코디언(기본 닫힘).
//   데이터: lib/assetsTotal(단일 소스) + /api/pwa-dashboard. 자체 합산 금지 — 원장 값만 사용.
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/router";
import { getTrader, useTrader } from "../../lib/trader";
import { getLedger } from "../../lib/ledger";
import TraderBadge from "../../components/shared/TraderBadge";
import BottomNav from "../../components/BottomNav";
import DataState from "../../components/DataState";
import LastUpdated from "../../components/LastUpdated";
import QuickAddSheet from "../../components/shared/QuickAddSheet";

const regimeKo = (r) => ({ BULL: "상승", BEAR: "하락", SIDE: "횡보", SIDEWAYS: "횡보", NEUTRAL: "중립" }[String(r || "").toUpperCase()] || null);
const uk = (v) => (v == null ? "-" : `${Number(v).toFixed(2)}억`);

// 자산군 메타(라벨·색·링크)
const CLASSES = [
  ["stock", "📈 주식", "var(--color-primary)", "/pwa?tab=portfolio"],
  ["etf", "💹 ETF", "var(--color-etf, var(--color-primary))", "/pwa/etf"],
  ["realestate", "🏠 부동산", "var(--color-success)", "/pwa/realestate"],
  ["cash", "💵 현금", "var(--color-warning)", null],
];

export default function AssetsMapPage() {
  const router = useRouter();
  const [trader] = useTrader();
  const [assets, setAssets] = useState(null);
  const [dash, setDash] = useState(null);
  const [status, setStatus] = useState("loading");
  const [at, setAt] = useState(null);
  const [qaOpen, setQaOpen] = useState(false);
  const [open3, setOpen3] = useState({}); // 3층 아코디언 열림 상태(기본 전부 닫힘)
  const [simOpen, setSimOpen] = useState(false); // [N9] 처방 시뮬 — 같은 카드 안에서 결과를 보여준다

  const load = useCallback(() => {
    const tr = getTrader();
    setStatus((s) => (assets ? "stale" : "loading"));
    Promise.all([
      getLedger(tr).catch(() => ({ ok: false })),
      fetch(`/api/pwa-dashboard?trader=${tr}`).then((r) => r.json()).catch(() => ({ ok: false })),
    ]).then(([a, d]) => {
      setAssets(a); setDash(d); setAt(new Date());
      setStatus(a && a.ok ? "ok" : "error");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assets]);

  useEffect(() => {
    load();
    const onChange = () => load();
    window.addEventListener("onehub-trader-change", onChange);
    window.addEventListener("onehub-assets-change", onChange);
    return () => {
      window.removeEventListener("onehub-trader-change", onChange);
      window.removeEventListener("onehub-assets-change", onChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const bd = assets?.breakdown || {};
  const rows = CLASSES.map(([k, label, color, href]) => ({
    k, label, color, href,
    val: bd[`${k}_uk`] != null ? Number(bd[`${k}_uk`]) : null,
  }));
  const total = assets?.total_uk != null ? Number(assets.total_uk) : rows.reduce((s, r) => s + (r.val || 0), 0);
  const pctOf = (v) => (total > 0 && v != null ? (v / total) * 100 : 0);

  // 1층 판단 1문장 — 쏠림 or 국면
  const dominant = [...rows].filter((r) => r.val != null).sort((a, b) => (b.val || 0) - (a.val || 0))[0];
  const domPct = dominant ? pctOf(dominant.val) : 0;
  const regime = regimeKo(dash?.market?.regime);
  const buys = (dash?.recommend_stocks ?? []).filter((s) => (s.score ?? 0) >= 70);
  const blocked = dash?.today_blocked ?? [];
  const headline = domPct >= 60 && dominant
    ? `자산의 ${Math.round(domPct)}%가 ${dominant.label.replace(/^[^\s]+\s/, "")}입니다 — 쏠림을 줄일 때인지 살펴보세요.`
    : regime
    ? `시장은 ${regime} 국면입니다. ${buys.length > 0 ? `주식 매수 후보 ${buys.length}건.` : "뚜렷한 매수 후보는 없습니다."}`
    : "자산을 입력하면 오늘의 판단을 요약해 드립니다.";

  // 1층 액션 카드(최대 3)
  const actions = [
    { label: "📈 주식", sub: buys.length > 0 ? `매수 후보 ${buys.length}건 검토` : `선별 관망 · ${blocked.length}건 차단`, href: "/pwa?tab=portfolio" },
    { label: "💹 ETF", sub: `보유 비중 ${pctOf(bd.etf_uk).toFixed(1)}% · 계좌·세제 점검`, href: "/pwa/etf" },
    { label: "🏠 부동산", sub: pctOf(bd.realestate_uk) >= 60 ? `${Math.round(pctOf(bd.realestate_uk))}% 쏠림 · 신규 매입 신중` : "ONE Score·저평가 확인", href: "/pwa/realestate" },
  ].slice(0, 3);

  // 도넛(stroke-dasharray) — 4개 자산군
  const donut = (() => {
    const R = 42, C = 2 * Math.PI * R;
    let acc = 0;
    return rows.filter((r) => (r.val || 0) > 0).map((r) => {
      const frac = total > 0 ? (r.val || 0) / total : 0;
      const seg = { color: r.color, dash: frac * C, offset: -acc * C, k: r.k };
      acc += frac;
      return seg;
    });
  })();

  // [N9] 처방 = 숫자 + 수단 + 제약. 세 가지가 다 있어야 실행 가능한 말이 된다.
  //   숫자: 쏠림 기준선(60%)까지 옮겨야 하는 금액을 원장 값에서 계산(재합산 아님 — breakdown 값만 사용).
  //   수단: 자산군별로 실제로 쓸 수 있는 통로.
  //   제약: 그 수단이 당장 안 되는 이유를 먼저 밝힌다(부동산 분할매도 불가·현금 부족).
  const TARGET_PCT = 60;
  const rx = (() => {
    if (!(domPct >= 55) || !dominant || !(total > 0)) return null;
    const name = dominant.label.replace(/^[^\s]+\s/, "");
    const moveUk = Math.max(0, Number(dominant.val) - total * (TARGET_PCT / 100));
    const cashUk = bd.cash_uk != null ? Number(bd.cash_uk) : null;
    const cashPct = bd.cash_uk != null ? pctOf(bd.cash_uk) : null;
    const means =
      dominant.k === "realestate" ? "연금계좌 ETF(세액공제 한도 안에서)"
      : dominant.k === "stock" ? "지수 ETF로 나눠 담기"
      : dominant.k === "etf" ? "종목·계좌 분산(연금/ISA)"
      : "투자 자산군으로 이동";
    const limits = [];
    if (dominant.k === "realestate") limits.push("부동산은 나눠 팔 수 없어 오늘 당장 옮기는 건 현실적이지 않습니다 — 실제 수단은 ‘앞으로 새로 넣는 돈을 부동산 아닌 곳에’ 쪽입니다");
    if (cashPct != null && cashPct < 3) limits.push(`현금이 ${cashPct < 1 ? "1% 미만" : `${Math.round(cashPct)}%`}뿐이라 한 번에 옮길 여력이 적습니다`);
    if (cashUk == null) limits.push("현금이 입력되지 않아 실제 여력은 이 계산보다 클 수 있습니다");
    return { name, moveUk, means, limits, targetPct: TARGET_PCT };
  })();

  // [N9] 시뮬 = 처방대로 옮겼을 때의 비중(before → after). 결정적 산수이며 예측이 아니다.
  const simRows = (() => {
    if (!rx || !(rx.moveUk > 0)) return null;
    return rows.filter((r) => r.val != null).map((r) => {
      const after = r.k === dominant.k ? Number(r.val) - rx.moveUk
        : r.k === "etf" ? Number(r.val) + rx.moveUk
        : Number(r.val);
      return { k: r.k, label: r.label, color: r.color, before: pctOf(r.val), after: total > 0 ? (after / total) * 100 : 0 };
    });
  })();

  const tgl3 = (id) => setOpen3((o) => ({ ...o, [id]: !o[id] }));
  const acc3 = [
    { id: "market", title: "시장 맥락", summary: `${regime || "-"} 국면 · 온도 ${dash?.market?.heat_score ?? "-"} · 심리 ${dash?.market?.fear_greed ?? "-"}`, href: "/pwa?tab=report" },
    { id: "briefing", title: "오늘의 브리핑·판단 근거", summary: buys.length > 0 || blocked.length > 0 ? `매수 ${buys.length} · 차단 ${blocked.length}` : "요약 보기", href: "/pwa?tab=report" },
  ];

  return (
    <div className="as">
      <header className="as-hd">
        <button className="as-logo" onClick={() => router.push("/pwa/assets")} aria-label="종합자산">ONE<span className="as-dot">·</span>HUB</button>
        <div className="as-ic">
          <TraderBadge />
          <button className="as-search" onClick={() => router.push("/pwa?tab=analyze")} aria-label="AI 종목 검색">🔍</button>
        </div>
      </header>

      <div className="as-title">💼 종합자산 <span className="as-sub">자산 지도</span>{at && <span className="as-fresh"><LastUpdated timestamp={at} onRefresh={load} /></span>}</div>

      <DataState status={status} hasData={!!assets} onRetry={load} skeletonLines={5} skeletonBlock>
        {/* ── 1층 ── */}
        <section className="card as-hero">
          <p className="as-headline">{headline}</p>
          <div className="as-total"><span>총자산</span><b>{uk(total)}</b></div>
        </section>

        <div className="as-actions">
          {actions.map((a) => (
            <button className="as-act" key={a.label} onClick={() => router.push(a.href)}>
              <span className="as-act-l"><b>{a.label}</b><span>{a.sub}</span></span>
              <span className="as-arrow">→</span>
            </button>
          ))}
        </div>

        {/* ── 2층: 자산 지도 ── */}
        <section className="card">
          <div className="as-h">자산 지도</div>
          <div className="as-map">
            <svg className="as-donut" viewBox="0 0 100 100" role="img" aria-label="자산 구성 도넛">
              <circle cx="50" cy="50" r="42" fill="none" stroke="var(--color-line)" strokeWidth="12" />
              {donut.map((s) => (
                <circle key={s.k} cx="50" cy="50" r="42" fill="none" stroke={s.color} strokeWidth="12"
                  strokeDasharray={`${s.dash} ${2 * Math.PI * 42 - s.dash}`} strokeDashoffset={s.offset}
                  transform="rotate(-90 50 50)" />
              ))}
              <text x="50" y="47" textAnchor="middle" className="as-donut-t">총</text>
              <text x="50" y="60" textAnchor="middle" className="as-donut-v">{uk(total)}</text>
            </svg>
            <div className="as-legend">
              {rows.map((r) => (
                <button className="as-row" key={r.k} onClick={() => (r.href ? router.push(r.href) : setQaOpen(true))}>
                  <span className="as-dotc" style={{ background: r.color }} />
                  <span className="as-rl">{r.label}</span>
                  <span className="as-rv">{r.val != null ? uk(r.val) : <em>미입력</em>}</span>
                  <span className="as-rp">{r.val != null ? `${pctOf(r.val).toFixed(1)}%` : ""}</span>
                  <span className="as-arrow sm">→</span>
                </button>
              ))}
            </div>
          </div>
          <button className="as-add" onClick={() => setQaOpen(true)}>＋ 자산 추가·수정</button>
        </section>

        {/* [A4] 쏠림 진단 — 충격 숫자(쏠림)에 원인+다음 수를 같은 카드에. 중립색(빨강 금지). */}
        {domPct >= 55 && dominant && (
          <section className="card as-a4">
            <div className="as-h">시장 대비 · 왜 이런가</div>
            <div className="as-a4-num">자산의 <b>{Math.round(domPct)}%</b>가 {dominant.label.replace(/^[^\s]+\s/, "")}입니다</div>
            <p className="as-a4-why">한 자산군에 크게 쏠려 있으면 시장이 오르내릴 때 내 자산은 상대적으로 <b>덜 따라갑니다</b> — 손실이 아니라 ‘덜 오름’일 수 있어요.</p>
            {/* [N9] 처방: 숫자 + 수단 + 제약 */}
            {rx && (
              <div className="as-rx">
                <p className="as-rx-do">
                  {rx.moveUk > 0
                    ? <>{rx.name} 비중을 {rx.targetPct}%까지 낮추려면 <b>{uk(rx.moveUk)}</b>을 다른 자산군으로 옮겨야 합니다. 수단은 <b>{rx.means}</b>입니다.</>
                    : <>{rx.name} 비중은 이미 {rx.targetPct}% 근처입니다 — 지금 옮길 금액은 없습니다.</>}
                  <span className="as-est">가정·추정</span>
                </p>
                {rx.limits.length > 0 && (
                  <p className="as-rx-lim">다만, {rx.limits.join(". 그리고 ")}.</p>
                )}
                {simRows && (
                  <button className="as-rx-sim" onClick={() => setSimOpen((v) => !v)} aria-expanded={simOpen}>
                    {simOpen ? "시뮬 접기" : "이 안으로 시뮬 →"}
                  </button>
                )}
                {simOpen && simRows && (
                  <div className="as-sim">
                    <div className="as-sim-h">{uk(rx.moveUk)}을 ETF로 옮기면 (산수일 뿐, 수익 예측 아님)</div>
                    {simRows.map((s) => (
                      <div className="as-sim-row" key={s.k}>
                        <span className="as-dotc" style={{ background: s.color }} />
                        <span className="as-sim-l">{s.label}</span>
                        <span className="as-sim-v">{s.before.toFixed(1)}%</span>
                        <span className="as-sim-ar">→</span>
                        <span className="as-sim-v b">{s.after.toFixed(1)}%</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div className="as-a4-cta">
              <button onClick={() => router.push("/pwa/etf")}>ETF 리밸런싱 →</button>
              <button onClick={() => router.push("/pwa/realestate")}>부동산 살펴보기 →</button>
            </div>
          </section>
        )}

        {/* ── 3층: 상세(기본 닫힘) ── */}
        <section className="card as-acc">
          {acc3.map((a) => (
            <div className="as-accitem" key={a.id}>
              <button className="as-acch" onClick={() => tgl3(a.id)} aria-expanded={!!open3[a.id]}>
                <span className="as-acct">{a.title}</span>
                <span className="as-accsum">{a.summary}</span>
                <span className="as-caret">{open3[a.id] ? "▾" : "▸"}</span>
              </button>
              {open3[a.id] && (
                <div className="as-accbody">
                  <button className="as-acclink" onClick={() => router.push(a.href)}>자세히 보기 →</button>
                </div>
              )}
            </div>
          ))}
        </section>

        <div className="as-note">종합자산은 읽기 전용 지도예요. 상세 확인·수정은 각 자산 페이지에서 이어집니다.</div>
      </DataState>

      {qaOpen && <QuickAddSheet initialAsset="stock" onClose={() => setQaOpen(false)} onSaved={() => { setQaOpen(false); load(); }} />}
      <BottomNav active="assets" />

      <style jsx>{`
        /* [N5-3] 하단 여백 = 하단탭(56) + FAB 상단(68+52) 여유. 88px이면 FAB가 마지막 문구를 가렸다. */
        .as { max-width: 480px; margin: 0 auto; padding: 0 14px calc(env(safe-area-inset-bottom, 0px) + 140px); font-family: var(--font-sans); color: var(--color-ink); min-height: 100vh; background: var(--color-bg); }
        .as-hd { display: flex; align-items: center; justify-content: space-between; padding: calc(env(safe-area-inset-top, 0px) + 12px) 2px 10px; }
        .as-logo { font-weight: 800; font-size: 20px; letter-spacing: -.5px; color: var(--color-ink); background: none; border: none; padding: 0; cursor: pointer; font-family: var(--font-sans); }
        .as-dot { color: var(--color-success); }
        .as-ic { display: flex; align-items: center; gap: 8px; }
        .as-search { width: 34px; height: 34px; border-radius: 50%; background: var(--color-card); border: none; display: grid; place-items: center; font-size: 15px; cursor: pointer; box-shadow: var(--shadow-card); }
        .as-title { display: flex; align-items: center; gap: 8px; font-size: 20px; font-weight: 800; letter-spacing: -.4px; margin: 6px 2px 14px; flex-wrap: wrap; }
        .as-sub { font-size: 12px; font-weight: 600; color: var(--color-ink-3); }
        .as-fresh { margin-left: auto; }
        .card { background: var(--color-card); border: 1px solid var(--color-line); border-radius: var(--radius-card, 14px); padding: 16px; margin-bottom: 12px; box-shadow: var(--shadow-card); }
        .as-hero .as-headline { font-size: 0.94rem; line-height: 1.55; font-weight: 700; color: var(--color-ink); margin: 0 0 12px; word-break: keep-all; }
        .as-total { display: flex; align-items: baseline; justify-content: space-between; }
        .as-total span { font-size: 0.78rem; font-weight: 600; color: var(--color-ink-3); }
        .as-total b { font-size: 1.5rem; font-weight: 800; color: var(--color-ink); }
        .as-actions { display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px; }
        .as-act { display: flex; align-items: center; justify-content: space-between; gap: 10px; min-height: 56px; padding: 12px 14px; background: var(--color-card); border: 1px solid var(--color-line); border-radius: 12px; box-shadow: var(--shadow-card); cursor: pointer; font-family: var(--font-sans); text-align: left; }
        .as-act-l { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
        .as-act-l b { font-size: 0.9rem; font-weight: 800; color: var(--color-ink); }
        .as-act-l span { font-size: 0.76rem; color: var(--color-ink-2); word-break: keep-all; }
        .as-arrow { color: var(--color-primary); font-weight: 800; flex-shrink: 0; }
        .as-arrow.sm { font-size: 0.8rem; }
        .as-h { font-size: 0.86rem; font-weight: 800; color: var(--color-ink); margin-bottom: 12px; }
        .as-map { display: flex; align-items: center; gap: 14px; }
        .as-donut { width: 116px; height: 116px; flex-shrink: 0; }
        .as-donut-t { font-size: 8px; fill: var(--color-ink-3); font-weight: 700; }
        .as-donut-v { font-size: 11px; fill: var(--color-ink); font-weight: 800; }
        .as-legend { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
        /* [N5-2] 범례 잘림 — 그리드 아이템 기본 min-width:auto 라 이름 칸이 안 줄어 잘렸다(M1과 동일 원인).
           min-width:0 을 줘야 ellipsis 가 실제로 동작한다. 숫자는 tabular-nums 로 자릿수 정렬. */
        .as-row { display: grid; grid-template-columns: 12px minmax(0, 1fr) auto auto 14px; align-items: center; gap: 7px; padding: 7px 2px; background: none; border: none; border-bottom: 1px solid var(--color-line); cursor: pointer; font-family: var(--font-sans); text-align: left; }
        .as-row:last-child { border-bottom: none; }
        .as-dotc { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; }
        .as-rl { min-width: 0; font-size: 0.78rem; font-weight: 700; color: var(--color-ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .as-rv { font-size: 0.78rem; font-weight: 800; color: var(--color-ink); font-variant-numeric: tabular-nums; text-align: right; white-space: nowrap; }
        .as-rv em { font-style: normal; font-weight: 600; color: var(--color-ink-3); font-size: 0.72rem; }
        .as-rp { font-size: 0.68rem; color: var(--color-ink-3); font-variant-numeric: tabular-nums; text-align: right; white-space: nowrap; min-width: 38px; }
        .as-add { width: 100%; margin-top: 14px; min-height: 44px; border: 1px dashed var(--color-line); background: var(--color-card-soft, var(--color-bg)); color: var(--color-ink-2); border-radius: 11px; font-size: 0.84rem; font-weight: 700; cursor: pointer; font-family: var(--font-sans); }
        .as-acc { padding: 4px 16px; }
        .as-accitem { border-bottom: 1px solid var(--color-line); }
        .as-accitem:last-child { border-bottom: none; }
        .as-acch { width: 100%; display: flex; align-items: center; gap: 8px; min-height: 52px; padding: 10px 0; background: none; border: none; cursor: pointer; font-family: var(--font-sans); text-align: left; }
        .as-acct { font-size: 0.84rem; font-weight: 700; color: var(--color-ink); flex-shrink: 0; }
        .as-accsum { flex: 1; min-width: 0; font-size: 0.72rem; color: var(--color-ink-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-align: right; }
        .as-caret { color: var(--color-ink-3); font-size: 0.8rem; width: 14px; text-align: center; }
        .as-accbody { padding: 0 0 12px; }
        .as-acclink { border: none; background: none; color: var(--color-primary); font-size: 0.8rem; font-weight: 700; cursor: pointer; font-family: var(--font-sans); padding: 4px 0; }
        /* [A4] 쏠림 진단 — 중립 톤(빨강 없음) */
        .as-a4 { border-left: 4px solid var(--color-ink-3); }
        .as-a4-num { font-size: 1rem; font-weight: 800; color: var(--color-ink); margin-bottom: 8px; }
        .as-a4-num b { color: var(--color-ink); }
        .as-a4-why, .as-a4-next { font-size: 0.82rem; line-height: 1.55; color: var(--color-ink-2); margin: 0 0 8px; word-break: keep-all; }
        .as-a4-why b { color: var(--color-ink); font-weight: 700; }
        .as-est { font-size: 0.68rem; font-weight: 700; color: var(--color-ink-3); background: var(--color-card-soft); border-radius: 5px; padding: 1px 6px; }
        /* [N9] 처방(숫자·수단·제약) + 인라인 시뮬 */
        .as-rx { border-top: 1px dashed var(--color-line); margin-top: 10px; padding-top: 10px; }
        .as-rx-do { font-size: 0.82rem; line-height: 1.55; color: var(--color-ink); margin: 0 0 6px; word-break: keep-all; }
        .as-rx-do b { font-weight: 800; }
        .as-rx-do .as-est { margin-left: 6px; }
        .as-rx-lim { font-size: 0.76rem; line-height: 1.5; color: var(--color-ink-3); margin: 0 0 8px; word-break: keep-all; }
        .as-rx-sim { border: none; background: none; padding: 4px 0; color: var(--color-primary); font-size: 0.8rem; font-weight: 700; font-family: var(--font-sans); cursor: pointer; }
        .as-sim { margin-top: 6px; background: var(--color-card-soft); border-radius: 10px; padding: 10px 12px; }
        .as-sim-h { font-size: 0.72rem; font-weight: 700; color: var(--color-ink-3); margin-bottom: 8px; word-break: keep-all; }
        .as-sim-row { display: grid; grid-template-columns: 10px minmax(0, 1fr) auto 14px auto; align-items: center; gap: 8px; min-height: 26px; }
        .as-sim-l { min-width: 0; font-size: 0.78rem; color: var(--color-ink-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .as-sim-v { font-size: 0.78rem; color: var(--color-ink-3); font-variant-numeric: tabular-nums; text-align: right; white-space: nowrap; }
        .as-sim-v.b { color: var(--color-ink); font-weight: 800; }
        .as-sim-ar { font-size: 0.72rem; color: var(--color-ink-3); text-align: center; }
        .as-a4-cta { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 4px; }
        .as-a4-cta button { flex: 1 1 0; min-width: 0; min-height: 40px; border: 1px solid var(--color-line); background: var(--color-card); color: var(--color-primary); border-radius: 10px; font-size: 0.78rem; font-weight: 700; cursor: pointer; font-family: var(--font-sans); }
        .as-note { font-size: 0.7rem; color: var(--color-ink-3); text-align: center; margin-top: 6px; line-height: 1.5; word-break: keep-all; }
      `}</style>
      <style jsx global>{`body { background: var(--color-bg); margin: 0; }`}</style>
    </div>
  );
}
