// [S46 R1/R2] 새 첫 화면 — 큰 숫자 하나(운용자산) + 세 줄(주식·ETF·부동산) + 접힌 세 줄(연금·현금·실거주).
//   /pwa/assets(종전 화면)는 그대로 공존한다. 전환은 설정 '첫 화면'(lib/homeScreen.js)으로만.
//   ★ 이 페이지는 자산을 더하지 않는다(N1). 숫자는 전부 lib/ledger.js 의 breakdown 에서 읽는다.
//     예외 하나: 투자용 부동산 순액(invRealtyUk) — 원장이 아직 이 필드를 내보내지 않아 assets.js:146 과
//     '같은 식'을 여기서도 계산한다(두 곳에서 따로 계산되는 상태 — 원장 승격은 다음 작업 후보).
//   ★ 퍼센트·도넛·목표배분·오늘의 한 수·AI 조언·보유 목록은 넣지 않는다(각 상세 화면에 그대로 있음).
//   ★ 숫자가 불완전하면(excluded_from_totals 경고) 큰 숫자 바로 아래에서 원장 message 그대로 말한다.
import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { getTrader, useTrader } from "../../lib/trader";
import { getLedger } from "../../lib/ledger";
import { recordSnapshot, getDelta } from "../../lib/assetHistory";
import AppHeader from "../../components/AppHeader";
import BottomNav from "../../components/BottomNav";
import LastUpdated from "../../components/LastUpdated";
import { logInterest } from "../../lib/interestLog"; // [S48-2] 자산군 줄 탭(tap 1) — 화면 변화 없음

const uk = (v) => (v == null || !Number.isFinite(Number(v)) ? "—" : `${Number(v).toFixed(2)}억`);
const num = (v) => (v == null || !Number.isFinite(Number(v)) ? null : Number(v));
const dvUk = (v) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(2)}억`;
const dCls = (v) => (v > 0.004 ? "up" : v < -0.004 ? "down" : "flat");

// 경고 우선순위 — '가장 큰 영향 하나'를 고르는 순서(숫자 전체가 흔들리는 것 → 일부 종목 하나).
//   목록에 없는 코드는 맨 뒤. 문구는 새로 쓰지 않고 원장 message 를 그대로 쓴다.
const WARN_ORDER = [
  "BACKEND_UNAVAILABLE", "SYNC_PENDING", "PENSION_UNAVAILABLE", "ETF_PRICE_MISSING",
  "SUSPECT_PRICE", "AVG_PRICE_OUT_OF_RANGE", "FX_UNAVAILABLE", "DUPLICATE_WITH_KIS",
];
const warnRank = (c) => { const i = WARN_ORDER.indexOf(c); return i < 0 ? WARN_ORDER.length : i; };

// [S46 사용자 지시] 시세를 못 받은 ETF — 현재가를 직접 확인할 외부 시세 페이지.
//   국내 종목코드(숫자 6자리, 2024년부터 쓰는 영문 섞인 신규 코드 예: 0080G0 포함) → 네이버 증권, 그 외 → Yahoo Finance.
const KR_CODE = /^[0-9][0-9A-Z]{5}$/;
function quoteLink(tk) {
  const t = String(tk || "").trim().toUpperCase();
  return KR_CODE.test(t)
    ? { href: `https://finance.naver.com/item/main.naver?code=${encodeURIComponent(t)}`, site: "네이버 증권" }
    : { href: `https://finance.yahoo.com/quote/${encodeURIComponent(t)}`, site: "Yahoo Finance" };
}

// [S46 R1] assets.js:146 과 같은 식 — 투자용 부동산 순액(평가 − 보증금, 음수 0).
function readInvRealtyUk() {
  try {
    const rp = JSON.parse(localStorage.getItem("onehub_re_properties") || "null");
    const arr = Array.isArray(rp) ? rp : [];
    return arr.reduce((s, p) => s + Math.max(0, (Number(p.valueUk) || 0) - (Number(p.deposit) || 0)), 0);
  } catch { return 0; }
}

export default function HomeSimplePage() {
  const [trader] = useTrader();
  const [L, setL] = useState(null);           // 원장
  const [status, setStatus] = useState("loading");
  const [delta, setDelta] = useState(null);
  const [invRealtyUk, setInvRealtyUk] = useState(0);
  const [at, setAt] = useState(null);
  const hasData = useRef(false);

  const load = useCallback(() => {
    const tr = getTrader();
    setInvRealtyUk(readInvRealtyUk());
    getLedger(tr, { awaitSync: !hasData.current })
      .catch(() => ({ ok: false }))
      .then((a) => {
        setL(a); setAt(new Date());
        setStatus(a && a.ok ? "ok" : "error");
        if (a && a.ok) {
          hasData.current = true;
          recordSnapshot(tr, a);   // 다른 화면과 같은 전일대비 경로(같은 날은 병합)
          setDelta(getDelta(tr));
        }
      });
  }, []);

  useEffect(() => {
    load();
    const onChange = () => load();
    window.addEventListener("onehub-trader-change", onChange);
    window.addEventListener("onehub-assets-change", onChange);
    const id = setInterval(() => {
      if (document.visibilityState === "hidden") return;
      load();
    }, 60000);
    const onVisible = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("onehub-trader-change", onChange);
      window.removeEventListener("onehub-assets-change", onChange);
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load, trader]);

  const bd = (L && L.breakdown) || {};
  const opUk = num(bd.operating_uk);
  const residenceUk = num(bd.residence_uk);
  const hasResidence = residenceUk != null && residenceUk > 0.005;

  // 전일 대비 — 기존 delta.operating 경로 재사용. 정의가 바뀐 첫날 등 운용 델타가 없으면 총자산 델타로
  //   폴백하고 그 사실을 라벨에 밝힌다(assets.js·today.js 와 같은 규칙).
  const dv = delta ? (delta.operating ?? delta.total ?? null) : null;
  const basis = delta && delta.operating == null && dv != null ? " · 총자산 기준" : "";

  const warns = ((L && L.warnings) || [])
    .filter((w) => w && w.excluded_from_totals === true)
    .sort((a, b) => warnRank(a.code) - warnRank(b.code));
  // ETF 시세 누락 종목(원장이 실어 준 티커). 경고가 맨 위가 아니어도 안내는 보여준다.
  const etfMissing = [...new Set(warns.filter((w) => w.code === "ETF_PRICE_MISSING").flatMap((w) => (Array.isArray(w.tickers) ? w.tickers : [])))];

  // R2 — 탭 시 이동은 assets.js summaryCards 의 href 를 그대로 쓴다(새 상세 화면 없음).
  const mainRows = [
    { key: "stock", icon: "📈", label: "주식", val: num(bd.stock_uk), href: "/pwa?tab=portfolio" },
    { key: "etf", icon: "💹", label: "ETF", val: num(bd.etf_uk), href: "/pwa/etf" },
    { key: "realestate", icon: "🏠", label: "부동산", val: bd.realestate_uk != null ? invRealtyUk : null, href: "/pwa/realestate" },
  ];
  const subRows = [
    { key: "pension", icon: "🏦", label: "연금", val: num(bd.pension_uk), href: "/pwa/pension" },
    { key: "cash", icon: "💵", label: "현금", val: num(bd.cash_uk), href: null },
    ...(hasResidence ? [{ key: "residence", icon: "🔑", label: "실거주", val: residenceUk, href: null, note: "배분 계산 제외" }] : []),
  ];

  const RowInner = ({ r, chevron }) => (
    <>
      <span className="hm-ic" aria-hidden="true">{r.icon}</span>
      <span className="hm-lbl">{r.label}</span>
      {r.note && <span className="hm-note">{r.note}</span>}
      <span className="hm-val u-1line">{uk(r.val)}</span>
      {chevron && <span className="hm-chev" aria-hidden="true">›</span>}
    </>
  );

  return (
    <div className="hm">
      <div className="sticky-hdr"><AppHeader /></div>

      <section className="hm-hero" aria-live="polite">
        <div className="hm-k">운용자산</div>
        <div className="hm-big" aria-busy={status === "loading"}>
          {status === "loading" && opUk == null ? <span className="hm-wait">불러오는 중</span> : uk(opUk)}
        </div>
        {warns.length > 0 && (
          <p className="hm-warn" role="status">⚠ {warns[0].message}{warns.length > 1 ? ` 외 ${warns.length - 1}건` : ""}</p>
        )}
        {etfMissing.length > 0 && (
          <details className="hm-guide">
            <summary>시세를 못 받은 ETF {etfMissing.length}종목 확인하기</summary>
            <p className="hm-guide-p">앱의 시세 조회에서 아래 종목의 현재가를 받지 못해 ETF 금액에서 빠졌습니다. 현재가는 링크에서 직접 확인할 수 있고, 종목코드(티커)를 잘못 입력했다면 ETF 화면에서 고칠 수 있습니다.</p>
            <ul className="hm-guide-l">
              {etfMissing.map((tk) => {
                const q = quoteLink(tk);
                return (
                  <li key={tk}>
                    <b>{tk}</b>
                    <a href={q.href} target="_blank" rel="noopener noreferrer">{q.site}에서 현재가 보기 ↗</a>
                  </li>
                );
              })}
            </ul>
            <Link href="/pwa/etf" className="hm-guide-fix">ETF 화면에서 보유 종목 확인·수정 ›</Link>
          </details>
        )}
        {status === "error" && (
          <p className="hm-warn" role="status">⚠ 자산 원장을 불러오지 못했습니다. <button type="button" className="hm-retry" onClick={load}>다시 시도</button></p>
        )}
        {dv != null && (
          <div className="hm-delta">
            <span className={`hm-dchip ${dCls(dv)}`}>{dv >= 0 ? "▲" : "▼"} {dvUk(Math.abs(dv) < 0.005 ? 0 : dv)}</span>
            <span className="hm-dlbl">{delta.days > 1 ? `${delta.days}일 전 대비` : "어제 대비"}{basis}</span>
          </div>
        )}
        {hasResidence && <div className="hm-ex">실거주 {uk(residenceUk)} 제외</div>}
        {at && <div className="hm-fresh"><LastUpdated timestamp={at} onRefresh={load} absolute /></div>}
      </section>

      <nav className="hm-card" aria-label="자산군">
        {mainRows.map((r) => (
          <Link key={r.key} href={r.href} className="hm-row tap" onClick={() => logInterest("tap", "class", r.key)}>
            <RowInner r={r} chevron />
          </Link>
        ))}
      </nav>

      <div className="hm-card sub">
        {subRows.map((r) => (r.href ? (
          <Link key={r.key} href={r.href} className="hm-row tap sm" onClick={() => logInterest("tap", "class", r.key)}>
            <RowInner r={r} chevron />
          </Link>
        ) : (
          <div key={r.key} className="hm-row sm"><RowInner r={r} /></div>
        )))}
      </div>

      <Link href="/pwa/assets" className="hm-all">전체 자산 화면 보기 ›</Link>

      <BottomNav active="assets" />

      <style jsx>{`
        .hm { max-width: 480px; margin: 0 auto; padding: 0 16px var(--nav-clearance-fab); font-family: var(--font-sans); color: var(--color-ink); min-height: 100vh; background: var(--color-bg); }
        .sticky-hdr { position: sticky; top: 0; z-index: 140; background: var(--color-bg); margin: 0 -16px; padding: 0 16px; }
        .hm-hero { text-align: center; padding: 28px 0 22px; }
        .hm-k { font-size: var(--fs-3); font-weight: 700; color: var(--color-ink-2); }
        .hm-big { font-size: clamp(44px, 17vw, 66px); font-weight: 900; letter-spacing: -3.5px; line-height: 1.08; font-variant-numeric: tabular-nums; color: var(--color-ink); white-space: nowrap; margin: 4px 0 6px; }
        .hm-wait { font-size: var(--fs-6); font-weight: 700; letter-spacing: 0; color: var(--color-ink-3); }
        .hm-warn { margin: 2px auto 8px; max-width: 360px; font-size: var(--fs-2); line-height: 1.5; font-weight: 700; color: var(--color-warning-ink); background: var(--color-warning-soft); border-radius: var(--radius-pill); padding: 6px 12px; overflow-wrap: anywhere; }
        .hm-guide { margin: 0 auto 10px; max-width: 360px; text-align: left; font-size: var(--fs-2); color: var(--color-ink-2); background: var(--color-card); border: 1px solid var(--color-line); border-radius: var(--radius-sm); padding: 8px 12px; }
        .hm-guide summary { cursor: pointer; font-weight: 800; color: var(--color-primary); list-style-position: inside; }
        .hm-guide-p { margin: 8px 0 6px; line-height: 1.55; }
        .hm-guide-l { list-style: none; margin: 0 0 8px; padding: 0; }
        .hm-guide-l li { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 6px 0; border-top: 1px solid var(--color-line); }
        .hm-guide-l b { color: var(--color-ink); font-variant-numeric: tabular-nums; }
        .hm-guide-l a { color: var(--color-primary); font-weight: 700; text-decoration: none; white-space: nowrap; }
        .hm :global(.hm-guide-fix) { display: inline-block; font-weight: 800; color: var(--color-primary); text-decoration: none; padding: 2px 0; }
        .hm-retry { border: none; background: none; color: var(--color-primary); font: inherit; font-weight: 800; cursor: pointer; padding: 0; }
        .hm-delta { display: flex; justify-content: center; align-items: baseline; gap: 6px; flex-wrap: wrap; }
        .hm-dchip { font-size: var(--fs-4); font-weight: 800; font-variant-numeric: tabular-nums; }
        .hm-dchip.up { color: var(--color-success-ink); }
        .hm-dchip.down { color: var(--color-danger); }
        .hm-dchip.flat { color: var(--color-ink-2); }
        .hm-dlbl { font-size: var(--fs-2); color: var(--color-ink-3); }
        .hm-ex { margin-top: 4px; font-size: var(--fs-2); color: var(--color-ink-3); }
        .hm-fresh { margin-top: 6px; display: flex; justify-content: center; font-size: var(--fs-1); color: var(--color-ink-3); }
        .hm-card { background: var(--color-card); border: 1px solid var(--color-line); border-radius: var(--radius-card); box-shadow: var(--shadow-card); margin-bottom: 12px; overflow: hidden; }
        .hm-card.sub { background: var(--color-card-soft); box-shadow: none; }
        .hm-card :global(.hm-row) { display: flex; align-items: center; gap: 10px; min-height: 56px; padding: 0 18px; color: var(--color-ink); text-decoration: none; }
        .hm-card :global(.hm-row + .hm-row) { border-top: 1px solid var(--color-line); }
        .hm-card :global(.hm-row.sm) { min-height: 46px; }
        .hm-card :global(.hm-row.tap:focus-visible) { outline: 2px solid var(--color-primary); outline-offset: -2px; }
        .hm-card :global(.hm-row.tap:active) { background: var(--color-card-soft); }
        .hm-card :global(.hm-ic) { font-size: var(--fs-5); width: 22px; text-align: center; flex-shrink: 0; }
        .hm-card :global(.hm-lbl) { font-size: var(--fs-5); font-weight: 800; flex-shrink: 0; }
        .hm-card :global(.hm-row.sm .hm-lbl) { font-size: var(--fs-4); font-weight: 700; color: var(--color-ink-2); }
        .hm-card :global(.hm-note) { font-size: var(--fs-1); color: var(--color-ink-3); white-space: nowrap; }
        .hm-card :global(.hm-val) { margin-left: auto; min-width: 0; font-size: var(--fs-5); font-weight: 800; font-variant-numeric: tabular-nums; text-align: right; }
        .hm-card :global(.hm-row.sm .hm-val) { font-size: var(--fs-4); font-weight: 700; color: var(--color-ink-2); }
        .hm-card :global(.hm-chev) { color: var(--color-ink-3); font-size: var(--fs-6); line-height: 1; flex-shrink: 0; }
        .hm :global(.hm-all) { display: block; text-align: center; margin: 4px 0 8px; padding: 12px; font-size: var(--fs-3); font-weight: 700; color: var(--color-primary); text-decoration: none; }
      `}</style>
      <style jsx global>{`body { background: var(--color-bg); margin: 0; }`}</style>
    </div>
  );
}
