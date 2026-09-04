// [S25-8/9] ETF 추세·테마·비중 조정 — ★예측을 팔지 않는다. 관찰과 산수만.
//   "오를 것이다"가 아니라 "최근 흐름이 이어지면 배분이 목표에서 이만큼 벌어진다"(항상 맞는 산수).
//   추세=stooq 일별 이력(보유만·캐시), 테마=보유 종목만(미분류 정직), 조정=%p+금액(자산군까지만·종목 지시 금지).
import { useState, useEffect } from "react";
import Sparkline from "./shared/Sparkline";
import { classifyEtf } from "../lib/etfClassify";
import { themeOf } from "../lib/etfTheme";

const DISCLAIMER = "규칙 기반 참고 정보 · 투자자문이나 특정 종목 권유가 아닙니다.";
const pctTxt = (v) => (v == null ? "–" : `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`);
const uk = (v) => (v == null ? "-" : `${Number(v).toFixed(2)}억`);

function change4w(closes) {
  if (!closes || closes.length < 2) return null;
  const last = closes[closes.length - 1].close;
  const idx = Math.max(0, closes.length - 1 - 20); // 약 4주(거래일 20)
  const base = closes[idx].close;
  return base ? Math.round((last / base - 1) * 1000) / 10 : null;
}

export default function EtfTrendTheme({ holdings = [], targetAlloc = null }) {
  const [hist, setHist] = useState({});
  const tkKey = holdings.map((h) => h.ticker).filter(Boolean).join(",");
  useEffect(() => {
    let alive = true;
    const tickers = [...new Set(holdings.map((h) => h.ticker).filter(Boolean))];
    tickers.forEach((tk) => {
      const bare = String(tk).replace(/^A(?=\d)/, "");
      const mkt = /^\d+$/.test(bare) ? "kr" : "us";
      setHist((m) => (m[tk] ? m : { ...m, [tk]: { loading: true } }));
      fetch(`/api/etf/history?ticker=${encodeURIComponent(tk)}&market=${mkt}`).then((r) => r.json())
        .then((d) => { if (alive) setHist((m) => ({ ...m, [tk]: d })); })
        .catch(() => { if (alive) setHist((m) => ({ ...m, [tk]: { ok: false } })); });
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tkKey]);

  const items = holdings.filter((h) => h && h.ticker);

  // 테마별 4주 변화(보유 가중). 분류 2개 미만 테마는 미표시(미분류는 항상 표시).
  const themeAgg = (() => {
    const m = {};
    items.forEach((h) => {
      const t = themeOf(h.ticker) || "미분류";
      const d = hist[h.ticker];
      const ch = d && d.ok ? change4w(d.closes) : null;
      if (ch == null) return;
      const w = Number(h.valueKrw) || 1;
      (m[t] = m[t] || { sum: 0, w: 0, count: 0 });
      m[t].sum += ch * w; m[t].w += w; m[t].count++;
    });
    return Object.entries(m).map(([t, x]) => ({ theme: t, ch: x.w ? Math.round(x.sum / x.w * 10) / 10 : null, count: x.count }))
      .filter((x) => x.count >= 2 || x.theme === "미분류").sort((a, b) => (b.ch ?? -99) - (a.ch ?? -99));
  })();

  // 비중 조정 — 국내/해외 축(onehub_target_alloc). 현재 vs 목표 %p + 금액. 이탈 원인(가격 vs 매매) 구분.
  const rebal = (() => {
    if (!targetAlloc || (targetAlloc.해외 == null && targetAlloc.국내 == null)) return { noTarget: true };
    const tot = items.reduce((s, h) => s + (Number(h.valueKrw) || 0), 0);
    if (!(tot > 0)) return null;
    let osNow = 0, os4w = 0, tot4w = 0;
    items.forEach((h) => {
      const c = classifyEtf(h.ticker);
      const isOs = c && c.r !== "국내";
      const val = Number(h.valueKrw) || 0;
      if (isOs) osNow += val;
      const d = hist[h.ticker];
      let val4w = val;
      if (d && d.ok && d.closes && d.closes.length >= 2) {
        const last = d.closes[d.closes.length - 1].close;
        const base = d.closes[Math.max(0, d.closes.length - 1 - 20)].close;
        if (last && base) val4w = val * (base / last); // 4주 전 평가액(수량 동일 가정)
      }
      tot4w += val4w; if (isOs) os4w += val4w;
    });
    const osNowPct = Math.round(osNow / tot * 1000) / 10;
    const os4wPct = tot4w > 0 ? Math.round(os4w / tot4w * 1000) / 10 : osNowPct;
    const osTgt = Number(targetAlloc.해외) || 0;
    const osGap = Math.round((osNowPct - osTgt) * 10) / 10;
    const amtUk = Math.round(Math.abs(osGap) / 100 * tot * 100) / 100;
    const driftFromPrice = Math.round((osNowPct - os4wPct) * 10) / 10; // + = 4주간 해외 비중이 (가격으로) 늘어남
    return { osNowPct, dmNowPct: Math.round((100 - osNowPct) * 10) / 10, osTgt, dmTgt: Number(targetAlloc.국내) || (100 - osTgt), osGap, amtUk, driftFromPrice };
  })();

  if (!items.length) return null;
  return (
    <section className="ett">
      <div className="ett-h">📈 추세 · 테마 <span className="ett-sub">관찰 · 예측 아님</span></div>

      {/* 보유 ETF 추세 — 30일 곡선 + 4주 변화(없으면 '수집 중', 가짜 선 없음) */}
      <div className="ett-list">
        {items.map((h) => {
          const d = hist[h.ticker];
          const closes = d && d.ok ? d.closes : null;
          const ser = closes ? closes.map((c) => c.close).slice(-30) : [];
          const ch = closes ? change4w(closes) : null;
          return (
            <div className="ett-row" key={h.ticker}>
              <span className="ett-tk">{h.ticker}<i className="ett-tm">{themeOf(h.ticker) || "미분류"}</i></span>
              {ser.length >= 2 ? <Sparkline data={ser} className="ett-spark" /> : <span className="ett-collect">이력 수집 중</span>}
              <span className={`ett-ch ${ch == null ? "" : ch >= 0 ? "up" : "dn"}`}>{ch == null ? "–" : `${pctTxt(ch)} · 4주`}</span>
            </div>
          );
        })}
      </div>

      {/* 테마별 4주 변화 */}
      {themeAgg.length > 0 && (
        <div className="ett-theme">
          <div className="ett-theme-h">테마별 4주 변화</div>
          {themeAgg.map((t) => (
            <div className="ett-theme-row" key={t.theme}>
              <span>{t.theme}{t.theme === "미분류" ? " · 분류 없음" : ""}</span>
              <b className={t.ch == null ? "" : t.ch >= 0 ? "up" : "dn"}>{t.ch == null ? "수집 중" : pctTxt(t.ch)}</b>
            </div>
          ))}
        </div>
      )}

      {/* 비중 조정 제안 — %p + 금액, 종목 지시 금지, 이탈 원인 구분, 면책 */}
      {rebal && rebal.noTarget ? (
        <div className="ett-rebal ett-notarget">목표 배분을 정하면 지금 배분과의 차이를 %p·금액으로 알려드립니다.</div>
      ) : rebal ? (
        <div className="ett-rebal">
          <div className="ett-rebal-h">비중 조정 참고</div>
          <div className="ett-rebal-row"><span>지금</span><b>해외 {rebal.osNowPct}% · 국내 {rebal.dmNowPct}%</b></div>
          <div className="ett-rebal-row"><span>목표</span><b>해외 {rebal.osTgt}% · 국내 {rebal.dmTgt}%</b></div>
          <div className="ett-rebal-row big"><span>조정</span><b className={Math.abs(rebal.osGap) < 3 ? "" : "warn"}>{rebal.osGap === 0 ? "목표에 맞음" : `해외 ${rebal.osGap > 0 ? "−" : "+"}${Math.abs(rebal.osGap)}%p (약 ${uk(rebal.amtUk)}) → 국내로`}</b></div>
          {Math.abs(rebal.driftFromPrice) >= 1 && (
            <p className="ett-rebal-why">해외 비중이 4주간 {rebal.driftFromPrice > 0 ? "+" : ""}{rebal.driftFromPrice}%p {rebal.driftFromPrice > 0 ? "늘었습니다" : "줄었습니다"} — 새로 사서가 아니라 <b>가격이 움직여서</b>입니다.</p>
          )}
          <p className="ett-disc">{DISCLAIMER}</p>
        </div>
      ) : null}
      <style jsx>{`
        .ett { background: var(--color-card); border: 1px solid var(--color-line); border-radius: 14px; padding: 14px; margin-bottom: 12px; }
        .ett-h { font-size: 0.86rem; font-weight: 800; color: var(--color-ink); margin-bottom: 10px; }
        .ett-sub { font-size: 0.66rem; font-weight: 600; color: var(--color-ink-3); margin-left: 6px; }
        .ett-list { display: flex; flex-direction: column; gap: 8px; }
        .ett-row { display: flex; align-items: center; gap: 10px; }
        .ett-tk { flex: 1; min-width: 0; font-size: 0.82rem; font-weight: 700; color: var(--color-ink); }
        .ett-tm { display: block; font-style: normal; font-size: 0.64rem; font-weight: 500; color: var(--color-ink-3); }
        .ett-collect { font-size: 0.72rem; color: var(--color-ink-3); }
        .ett-ch { font-size: 0.78rem; font-weight: 700; font-variant-numeric: tabular-nums; flex: none; }
        .ett-ch.up, .up { color: var(--color-success, #16a34a); }
        .ett-ch.dn, .dn { color: var(--color-danger, #dc2626); }
        .ett-theme { margin-top: 12px; padding-top: 10px; border-top: 1px solid var(--color-line); }
        .ett-theme-h { font-size: 0.74rem; font-weight: 700; color: var(--color-ink-2); margin-bottom: 6px; }
        .ett-theme-row { display: flex; justify-content: space-between; font-size: 0.8rem; color: var(--color-ink-2); padding: 3px 0; }
        .ett-rebal { margin-top: 12px; padding-top: 10px; border-top: 1px solid var(--color-line); }
        .ett-rebal-h { font-size: 0.74rem; font-weight: 700; color: var(--color-ink-2); margin-bottom: 6px; }
        .ett-rebal-row { display: flex; justify-content: space-between; font-size: 0.8rem; color: var(--color-ink-2); padding: 3px 0; }
        .ett-rebal-row.big b { color: var(--color-ink); }
        .ett-rebal-row .warn { color: var(--color-warn, #d97706); }
        .ett-rebal-why { font-size: 0.74rem; color: var(--color-ink-2); margin: 8px 0 0; line-height: 1.5; word-break: keep-all; }
        .ett-notarget { font-size: 0.8rem; color: var(--color-ink-2); margin-top: 12px; padding-top: 10px; border-top: 1px solid var(--color-line); }
        .ett-disc { font-size: 0.64rem; color: var(--color-ink-3); margin: 8px 0 0; }
      `}</style>
    </section>
  );
}
