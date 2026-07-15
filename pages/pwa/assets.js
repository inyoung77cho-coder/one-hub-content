// [A1/A2/A3/A4] 종합자산 = 읽기 전용 인덱스(지도). 상세·편집은 자식 페이지로 위임(편집 UI 없음).
//   3층 구조: 1층 판단1문장+총자산+액션3 / 2층 자산지도(도넛+링크) / 3층 상세 아코디언(기본 닫힘).
//   데이터: lib/assetsTotal(단일 소스) + /api/pwa-dashboard. 자체 합산 금지 — 원장 값만 사용.
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/router";
import { getTrader, useTrader } from "../../lib/trader";
import { fetchAssetsTotal } from "../../lib/assetsTotal";
import TraderSwitcher from "../../components/shared/TraderSwitcher";
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

  const load = useCallback(() => {
    const tr = getTrader();
    setStatus((s) => (assets ? "stale" : "loading"));
    Promise.all([
      fetchAssetsTotal(tr).catch(() => ({ ok: false })),
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
          <TraderSwitcher />
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
        .as { max-width: 480px; margin: 0 auto; padding: 0 14px calc(env(safe-area-inset-bottom, 0px) + 88px); font-family: var(--font-sans); color: var(--color-ink); min-height: 100vh; background: var(--color-bg); }
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
        .as-row { display: grid; grid-template-columns: 12px 1fr auto auto 14px; align-items: center; gap: 7px; padding: 7px 2px; background: none; border: none; border-bottom: 1px solid var(--color-line); cursor: pointer; font-family: var(--font-sans); text-align: left; }
        .as-row:last-child { border-bottom: none; }
        .as-dotc { width: 9px; height: 9px; border-radius: 50%; }
        .as-rl { font-size: 0.78rem; font-weight: 700; color: var(--color-ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .as-rv { font-size: 0.78rem; font-weight: 800; color: var(--color-ink); font-variant-numeric: tabular-nums; }
        .as-rv em { font-style: normal; font-weight: 600; color: var(--color-ink-3); font-size: 0.72rem; }
        .as-rp { font-size: 0.68rem; color: var(--color-ink-3); font-variant-numeric: tabular-nums; }
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
        .as-note { font-size: 0.7rem; color: var(--color-ink-3); text-align: center; margin-top: 6px; line-height: 1.5; word-break: keep-all; }
      `}</style>
      <style jsx global>{`body { background: var(--color-bg); margin: 0; }`}</style>
    </div>
  );
}
