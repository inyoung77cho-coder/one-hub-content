// [ETF 재구성] 내 ETF 분석 — ① 보유 종목별 성과·비중  ② 섹터별 쏠림 분석.
//   (구 '투자지역/섹터 토글'에서 투자지역 → 보유 종목 성과 목록으로 교체.)
//   items: [{ticker,name,valueKrw,pnlPct}] · overlap: 백엔드 섹터 중복노출(overlap.sectors).
import { useState } from "react";

const COLORS = [
  "var(--color-primary)", "var(--color-success)", "var(--color-warning)", "var(--color-danger)",
  "color-mix(in srgb, var(--color-primary) 55%, var(--color-success))",
  "color-mix(in srgb, var(--color-warning) 62%, var(--color-danger))",
  "color-mix(in srgb, var(--color-primary) 45%, var(--color-ink-3))", "var(--color-ink-3)",
];

const won = (n) => {
  if (n == null) return "-";
  const a = Math.abs(n);
  if (a >= 1e8) return `${(n / 1e8).toFixed(2)}억`;
  if (a >= 1e4) return `${Math.round(n / 1e4).toLocaleString()}만`;
  return Math.round(n).toLocaleString();
};

export default function EtfAllocationPie({ items = [], overlap = null, perfMap = {} }) {
  const [mode, setMode] = useState("holding");

  // ── 보유 종목: 평가액 내림차순 + 비중 ──
  const total = (items || []).reduce((a, x) => a + (Number(x.valueKrw) || 0), 0);
  const rows = (items || [])
    .filter((x) => Number(x.valueKrw) > 0)
    .map((x) => ({ ...x, pct: total > 0 ? (Number(x.valueKrw) / total) * 100 : 0 }))
    .sort((a, b) => b.valueKrw - a.valueKrw);
  const topHold = rows[0];

  // ── 섹터 도넛(overlap.sectors) + 쏠림 ──
  const secs0 = overlap?.sectors || [];
  const wsum = secs0.reduce((a, s) => a + (Number(s.weight) || 0), 0) || 1;
  const sslices = secs0
    .map((s) => ({ name: s.sector || s.name || "기타", pct: ((Number(s.weight) || 0) / wsum) * 100 }))
    .filter((s) => s.pct > 0)
    .sort((a, b) => b.pct - a.pct);
  const topSec = sslices[0];

  // 도넛 기하(섹터)
  const R = 45, CX = 60, CY = 60, SW = 22, C = 2 * Math.PI * R;
  let acc = 0;
  const arcs = sslices.map((s, i) => {
    const frac = s.pct / 100;
    const a = { color: COLORS[i % COLORS.length], dash: `${(frac * C).toFixed(2)} ${(C - frac * C).toFixed(2)}`, offset: (-acc * C).toFixed(2) };
    acc += frac; return a;
  });

  return (
    <div className="etf-an">
      <div className="an-head">
        <span className="an-lbl">📊 내 ETF 분석</span>
        <div className="an-toggle" role="tablist" aria-label="분석 기준">
          <button role="tab" aria-selected={mode === "holding"} className={mode === "holding" ? "on" : ""} onClick={() => setMode("holding")}>보유 종목</button>
          <button role="tab" aria-selected={mode === "sector"} className={mode === "sector" ? "on" : ""} onClick={() => setMode("sector")}>섹터 쏠림</button>
        </div>
      </div>

      {mode === "holding" ? (
        rows.length === 0 ? (
          <div className="an-empty">보유 ETF를 입력하면 종목별 성과·비중이 표시됩니다.</div>
        ) : (
          <>
            <div className="an-list">
              {rows.map((r, i) => {
                const pf = perfMap[String(r.ticker).toUpperCase()] || {};
                return (
                  <div className="an-row" key={r.ticker || i}>
                    <div className="an-r1">
                      <span className="an-nm" title={r.name}>{r.name}</span>
                      {r.pnlPct != null && <span className={`an-pnl ${r.pnlPct >= 0 ? "up" : "dn"}`}>{r.pnlPct >= 0 ? "+" : ""}{r.pnlPct.toFixed(1)}%</span>}
                    </div>
                    <div className="an-money">
                      {r.costKrw != null && <><span className="an-mk">매수</span> {won(r.costKrw)}원 <span className="an-arrow">→</span> </>}
                      <span className="an-mk">평가</span> {won(r.valueKrw)}원
                      {r.pnlKrw != null && <span className={`an-diff ${r.pnlKrw >= 0 ? "up" : "dn"}`}> · 손익 {r.pnlKrw >= 0 ? "+" : ""}{won(r.pnlKrw)}원</span>}
                    </div>
                    <div className="an-r2">
                      <span className="an-bar"><i style={{ width: `${Math.min(100, r.pct)}%` }} /></span>
                      <span className="an-pct">비중 {r.pct.toFixed(1)}%</span>
                    </div>
                    {(pf.w1 != null || pf.m1 != null) && (
                      <div className="an-periods">
                        {pf.w1 != null && <span className="an-pd">1주 <b className={pf.w1 >= 0 ? "up" : "dn"}>{pf.w1 >= 0 ? "+" : ""}{pf.w1}%</b></span>}
                        {pf.m1 != null && <span className="an-pd">1개월 <b className={pf.m1 >= 0 ? "up" : "dn"}>{pf.m1 >= 0 ? "+" : ""}{pf.m1}%</b></span>}
                        <span className="an-pd-src">시세 기준</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="an-foot">
              합계 매수 <b>{won(rows.reduce((s, r) => s + (r.costKrw || 0), 0))}원</b> → 평가 <b>{won(total)}원</b> · {rows.length}종목
              {topHold && topHold.pct >= 40 && <span className="an-warn"> · ⚠ {topHold.name} {topHold.pct.toFixed(0)}% 단일종목 쏠림</span>}
            </div>
            <div className="an-note">수익률(우상단)은 <b>매수가 대비 총 손익</b>, 1주·1개월은 <b>시세(NAV) 등락</b>입니다. 상승 빨강·하락 파랑. 확정 아님.</div>
          </>
        )
      ) : (
        sslices.length === 0 ? (
          <div className="an-empty">섹터 중복노출 데이터가 아직 없습니다(보유 ETF의 구성종목 정보 필요).</div>
        ) : (
          <>
            <div className="an-secbody">
              <svg className="an-svg" viewBox="0 0 120 120" role="img" aria-label="섹터 분배 도넛">
                <g transform="rotate(-90 60 60)">
                  <circle cx={CX} cy={CY} r={R} fill="none" stroke="var(--color-line)" strokeWidth={SW} opacity="0.35" />
                  {arcs.map((a, i) => (
                    <circle key={i} cx={CX} cy={CY} r={R} fill="none" stroke={a.color} strokeWidth={SW} strokeDasharray={a.dash} strokeDashoffset={a.offset} />
                  ))}
                </g>
                <text x="60" y="56" className="an-c1" textAnchor="middle">{sslices.length}</text>
                <text x="60" y="70" className="an-c2" textAnchor="middle">섹터</text>
              </svg>
              <div className="an-leg">
                {sslices.map((s, i) => (
                  <div className="an-lg" key={s.name}>
                    <span className="an-sw" style={{ background: COLORS[i % COLORS.length] }} />
                    <span className="an-lgnm" title={s.name}>{s.name}</span>
                    <span className="an-lgpc">{s.pct.toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            </div>
            <div className={`an-foot ${topSec && topSec.pct >= 40 ? "hot" : ""}`}>
              {topSec ? (topSec.pct >= 40
                ? <>⚠ <b>{topSec.name}</b> 섹터에 <b>{topSec.pct.toFixed(0)}%</b> 집중 — 다른 섹터로 분산을 검토하세요.</>
                : <>최대 섹터 <b>{topSec.name} {topSec.pct.toFixed(0)}%</b> · 비교적 고르게 분산돼 있습니다.</>) : null}
            </div>
          </>
        )
      )}

      <style jsx>{`
        .etf-an { background: var(--color-card); border: 1px solid var(--color-line); border-radius: var(--radius-card, 14px); padding: 16px; margin-bottom: 12px; box-shadow: var(--shadow-card); }
        .an-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 12px; }
        .an-lbl { font-size: 0.9rem; font-weight: 700; color: var(--color-ink); }
        .an-toggle { display: inline-flex; gap: 4px; background: var(--color-card-soft); border-radius: 10px; padding: 3px; }
        .an-toggle button { border: none; background: none; padding: 6px 12px; border-radius: 8px; font-family: var(--font-sans); font-size: 0.74rem; font-weight: 700; color: var(--color-ink-2); cursor: pointer; }
        .an-toggle button.on { background: var(--color-primary); color: #fff; }
        .an-empty { font-size: 0.78rem; color: var(--color-ink-2); background: var(--color-card-soft); border-radius: 11px; padding: 16px 14px; text-align: center; line-height: 1.55; }
        .an-list { display: flex; flex-direction: column; gap: 11px; }
        .an-row { display: flex; flex-direction: column; gap: 5px; padding-bottom: 11px; border-bottom: 1px solid var(--color-line); }
        .an-row:last-child { border-bottom: none; padding-bottom: 0; }
        .an-r1 { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
        .an-nm { font-size: 0.85rem; font-weight: 800; color: var(--color-ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .an-pnl { flex-shrink: 0; font-size: 0.84rem; font-weight: 800; font-family: ui-monospace, monospace; }
        .an-pnl.up { color: var(--color-danger); } .an-pnl.dn { color: var(--color-primary); }
        .an-money { font-size: 0.74rem; color: var(--color-ink-2); font-family: ui-monospace, monospace; word-break: keep-all; }
        .an-mk { font-family: var(--font-sans); font-size: 0.62rem; font-weight: 800; color: var(--color-ink-3); }
        .an-arrow { color: var(--color-ink-3); }
        .an-diff.up { color: var(--color-danger); font-weight: 700; } .an-diff.dn { color: var(--color-primary); font-weight: 700; }
        .an-r2 { display: flex; align-items: center; gap: 8px; }
        .an-bar { flex: 1; height: 7px; background: var(--color-card-soft); border-radius: 999px; overflow: hidden; }
        .an-bar i { display: block; height: 100%; background: var(--color-primary); border-radius: 999px; }
        .an-pct { flex-shrink: 0; font-size: 0.7rem; font-weight: 800; color: var(--color-ink-2); font-family: ui-monospace, monospace; min-width: 62px; text-align: right; }
        .an-periods { display: flex; align-items: center; gap: 12px; }
        .an-pd { font-size: 0.68rem; color: var(--color-ink-3); font-weight: 700; }
        .an-pd b { font-family: ui-monospace, monospace; font-weight: 800; margin-left: 2px; }
        .an-pd b.up { color: var(--color-danger); } .an-pd b.dn { color: var(--color-primary); }
        .an-pd-src { font-size: 0.58rem; color: var(--color-ink-3); margin-left: auto; }
        .an-note { margin-top: 12px; font-size: 0.64rem; color: var(--color-ink-3); line-height: 1.5; word-break: keep-all; }
        .an-note b { color: var(--color-ink-2); font-weight: 700; }
        .an-foot { margin-top: 12px; font-size: 0.72rem; color: var(--color-ink-3); line-height: 1.5; word-break: keep-all; }
        .an-foot b { color: var(--color-ink); font-weight: 800; }
        .an-warn { color: var(--color-danger); font-weight: 700; }
        .an-foot.hot { color: var(--color-danger); }
        .an-foot.hot b { color: var(--color-danger); }
        .an-secbody { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
        .an-svg { width: 120px; height: 120px; flex-shrink: 0; }
        .an-c1 { fill: var(--color-ink); font-size: 20px; font-weight: 800; font-family: var(--font-sans); }
        .an-c2 { fill: var(--color-ink-3); font-size: 9px; font-weight: 700; font-family: var(--font-sans); }
        .an-leg { flex: 1 1 170px; display: flex; flex-direction: column; gap: 6px; min-width: 0; }
        .an-lg { display: flex; align-items: center; gap: 8px; font-size: 0.76rem; }
        .an-sw { width: 11px; height: 11px; border-radius: 3px; flex-shrink: 0; }
        .an-lgnm { flex: 1 1 0; color: var(--color-ink); font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .an-lgpc { font-weight: 800; color: var(--color-ink); font-family: ui-monospace, monospace; }
      `}</style>
    </div>
  );
}
