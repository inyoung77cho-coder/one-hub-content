// [ETF 재구성 Phase1] 테마별 분배 도넛 — 투자지역 / 섹터 토글.
//   region: positions(티커+원화평가액)를 classifyEtf → regionLabel 로 집계(금액 가중).
//   sector: 백엔드 overlap.sectors(name/weight) 를 그대로 사용.
//   외부 차트 라이브러리 없이 인라인 SVG 도넛. 앱 팔레트 토큰 + 고정 색 사이클. 다크모드 안전.
import { useState } from "react";
import { regionLabel } from "../lib/etfClassify";

// 도넛 슬라이스 색 — 앱 팔레트 토큰 우선, 부족분은 color-mix 변형으로 채운다.
const COLORS = [
  "var(--color-primary)",
  "var(--color-success)",
  "var(--color-warning)",
  "var(--color-danger)",
  "color-mix(in srgb, var(--color-primary) 55%, var(--color-success))",
  "color-mix(in srgb, var(--color-warning) 62%, var(--color-danger))",
  "color-mix(in srgb, var(--color-primary) 45%, var(--color-ink-3))",
  "var(--color-ink-3)",
];

const won = (n) => {
  if (n == null) return "-";
  const a = Math.abs(n);
  if (a >= 1e8) return `${(n / 1e8).toFixed(2)}억`;
  if (a >= 1e4) return `${Math.round(n / 1e4).toLocaleString()}만`;
  return Math.round(n).toLocaleString();
};

export default function EtfAllocationPie({ positions = [], overlap = null }) {
  const [mode, setMode] = useState("region");

  // ── 집계 ─────────────────────────────────────────────
  let slices = [];
  if (mode === "region") {
    const byRegion = {};
    (positions || []).forEach((p) => {
      const v = Number(p?.valueKrw) || 0;
      if (!(v > 0)) return;
      const label = regionLabel(p.ticker) || "미상";
      byRegion[label] = (byRegion[label] || 0) + v;
    });
    const total = Object.values(byRegion).reduce((a, v) => a + v, 0);
    slices = Object.entries(byRegion)
      .sort((a, b) => b[1] - a[1])
      .map(([name, val]) => ({ name, val, pct: total > 0 ? (val / total) * 100 : 0 }));
  } else {
    const secs = overlap?.sectors || [];
    // 섹터 weight 합이 1을 안 넘을 수 있어(중복 노출 실효비중) 표시 비중은 합 기준으로 정규화.
    const wsum = secs.reduce((a, s) => a + (Number(s.weight) || 0), 0) || 1;
    slices = secs
      .map((s) => ({ name: s.sector || s.name || "기타", val: null, pct: ((Number(s.weight) || 0) / wsum) * 100, weight: Number(s.weight) || 0 }))
      .filter((s) => s.pct > 0)
      .sort((a, b) => b.pct - a.pct);
  }

  const hasData = slices.length > 0 && slices.some((s) => s.pct > 0);

  // ── 도넛 기하 ─────────────────────────────────────────
  const R = 45, CX = 60, CY = 60, SW = 22;
  const C = 2 * Math.PI * R;
  let acc = 0;
  const arcs = slices.map((s, i) => {
    const frac = s.pct / 100;
    const arc = {
      color: COLORS[i % COLORS.length],
      dash: `${(frac * C).toFixed(2)} ${(C - frac * C).toFixed(2)}`,
      offset: (-acc * C).toFixed(2),
    };
    acc += frac;
    return arc;
  });

  return (
    <div className="etf-pie">
      <div className="pie-head">
        <span className="pie-lbl">🎯 테마별 분배</span>
        <div className="pie-toggle" role="tablist" aria-label="분배 기준">
          <button role="tab" aria-selected={mode === "region"} className={mode === "region" ? "on" : ""} onClick={() => setMode("region")}>투자지역</button>
          <button role="tab" aria-selected={mode === "sector"} className={mode === "sector" ? "on" : ""} onClick={() => setMode("sector")}>섹터</button>
        </div>
      </div>

      {!hasData ? (
        <div className="pie-empty">데이터 없음{mode === "sector" ? " — 섹터 중복 노출 데이터가 아직 없습니다." : " — 보유 ETF를 입력하면 투자지역 비중이 표시됩니다."}</div>
      ) : (
        <div className="pie-body">
          <svg className="pie-svg" viewBox="0 0 120 120" role="img" aria-label={mode === "region" ? "투자지역 분배 도넛" : "섹터 분배 도넛"}>
            <g transform="rotate(-90 60 60)">
              <circle cx={CX} cy={CY} r={R} fill="none" stroke="var(--color-line)" strokeWidth={SW} opacity="0.35" />
              {arcs.map((a, i) => (
                <circle key={i} cx={CX} cy={CY} r={R} fill="none" stroke={a.color}
                  strokeWidth={SW} strokeDasharray={a.dash} strokeDashoffset={a.offset} />
              ))}
            </g>
            <text x="60" y="56" className="pie-c1" textAnchor="middle">{slices.length}</text>
            <text x="60" y="70" className="pie-c2" textAnchor="middle">{mode === "region" ? "지역" : "섹터"}</text>
          </svg>
          <div className="pie-legend">
            {slices.map((s, i) => (
              <div className="pie-lg" key={s.name}>
                <span className="pie-sw" style={{ background: COLORS[i % COLORS.length] }} />
                <span className="pie-nm" title={s.name}>{s.name}</span>
                <span className="pie-pc">{s.pct.toFixed(1)}%</span>
                {s.val != null && <span className="pie-amt">{won(s.val)}원</span>}
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="pie-note">
        {mode === "region"
          ? "투자대상 지역(상장시장이 아닌 실제 노출) 기준 · 보유 금액 가중."
          : "여러 ETF가 같은 섹터에 겹치는 실효 노출 비중(중복 반영)."}
      </div>

      <style jsx>{`
        .etf-pie { background: var(--color-card); border: 1px solid var(--color-line); border-radius: var(--radius-card, 14px); padding: 16px; margin-bottom: 12px; box-shadow: var(--shadow-card); }
        .pie-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 12px; }
        .pie-lbl { font-size: 0.9rem; font-weight: 700; color: var(--color-ink); }
        .pie-toggle { display: inline-flex; gap: 4px; background: var(--color-card-soft); border-radius: 10px; padding: 3px; }
        .pie-toggle button { border: none; background: none; padding: 6px 12px; border-radius: 8px; font-family: var(--font-sans); font-size: 0.74rem; font-weight: 700; color: var(--color-ink-2); cursor: pointer; }
        .pie-toggle button.on { background: var(--color-primary); color: #fff; }
        .pie-body { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
        .pie-svg { width: 120px; height: 120px; flex-shrink: 0; }
        .pie-c1 { fill: var(--color-ink); font-size: 20px; font-weight: 800; font-family: var(--font-sans); }
        .pie-c2 { fill: var(--color-ink-3); font-size: 9px; font-weight: 700; font-family: var(--font-sans); }
        .pie-legend { flex: 1 1 180px; display: flex; flex-direction: column; gap: 6px; min-width: 0; }
        .pie-lg { display: flex; align-items: center; gap: 8px; font-size: 0.76rem; }
        .pie-sw { width: 11px; height: 11px; border-radius: 3px; flex-shrink: 0; }
        .pie-nm { flex: 1 1 0; color: var(--color-ink); font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .pie-pc { font-weight: 800; color: var(--color-ink); font-family: ui-monospace, monospace; }
        .pie-amt { font-size: 0.68rem; color: var(--color-ink-3); font-family: ui-monospace, monospace; white-space: nowrap; }
        .pie-empty { font-size: 0.78rem; color: var(--color-ink-2); background: var(--color-card-soft); border-radius: 11px; padding: 16px 14px; text-align: center; line-height: 1.55; word-break: keep-all; }
        .pie-note { font-size: 0.66rem; color: var(--color-ink-3); margin-top: 12px; line-height: 1.5; word-break: keep-all; }
      `}</style>
    </div>
  );
}
