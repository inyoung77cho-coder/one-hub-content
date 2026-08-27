// components/RePositionCard.js — [내단지 포지션 v2] 2026-08-27
//   기존엔 "대장 대비 91% 수준" 텍스트 두 줄뿐이었다 — 막대그래프+실선(계단)으로 재설계.
//   ① 동네 비교: 대장이 맨 위, 아래로 대장과의 가격 동조(lag_map, 개월) 순 — 실제 위경도가
//      DB에 없어 "직선거리"는 못 쓰고, 이미 검증된 lag_map(0~4개월)을 근접도 대용으로 쓴다.
//      행마다 회귀 기반 적정가(brief.all_ranking[].pred)를 표시하고, 전체를 하나의 연속된
//      실선(계단형, 점선 없음)으로 이어 그린다.
//   ② 평형별 적정가: complex-areas(실거래 평형별 대표가)에 평형↔가격 선형회귀를 얹어 계단선.
//      동네 비교에서 단지를 클릭하면 ②가 그 단지로 바뀐다(원 요청: gap 큰 단지 클릭→평형별 갭).
//   ③ 시점별 갭 + 예상가: /api/trend/{apt} 월별 실거래로 대장·내 단지 라인을 그리고,
//      최근 구간 선형 추세를 연장해 향후 갭을 추정(실선, 예측 구간은 옅게 — 점선 미사용).
import { useEffect, useMemo, useRef, useState } from "react";

const uk = (n) => (n == null ? "-" : `${Number(n).toFixed(2)}`);
const signed = (n) => (n == null ? "-" : `${n >= 0 ? "+" : ""}${Number(n).toFixed(1)}`);

// 최소자승 선형회귀: xs/ys 같은 길이 배열 → {slope, intercept} | null(표본 부족)
function linreg(xs, ys) {
  const n = xs.length;
  if (n < 2) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; }
  if (den === 0) return null;
  const slope = num / den;
  return { slope, intercept: my - slope * mx };
}

// ── ① 동네 비교: 행마다 자기 target(회귀 적정가) + 연속 계단 실선 오버레이 ──
function NeighborList({ rows, onSelect, selected }) {
  const wrapRef = useRef(null);
  const rowRefs = useRef([]);
  const [overlayPath, setOverlayPath] = useState("");
  const [box, setBox] = useState({ w: 0, h: 0 });

  const max = useMemo(() => {
    if (!rows.length) return 1;
    return Math.max(...rows.map((r) => Math.max(r.value, r.target != null ? r.target : r.value))) * 1.14;
  }, [rows]);

  useEffect(() => {
    const measure = () => {
      const wrap = wrapRef.current;
      if (!wrap || !rows.length) return;
      const wrapRect = wrap.getBoundingClientRect();
      const pts = rows.map((r, i) => {
        const trackEl = rowRefs.current[i];
        if (!trackEl) return null;
        const tr = trackEl.getBoundingClientRect();
        const tpct = r.isLeader ? (r.value / max) * 100 : (r.target / max) * 100;
        return {
          x: (tr.left - wrapRect.left) + tr.width * (tpct / 100),
          y: (tr.top - wrapRect.top) + tr.height / 2,
        };
      }).filter(Boolean);
      if (!pts.length) return;
      const tickW = 9;
      let d = `M ${pts[0].x - tickW},${pts[0].y} L ${pts[0].x + tickW},${pts[0].y}`;
      for (let i = 1; i < pts.length; i++) {
        d += ` L ${pts[i].x - tickW},${pts[i].y} L ${pts[i].x + tickW},${pts[i].y}`;
      }
      setOverlayPath(d);
      setBox({ w: wrapRect.width, h: wrapRect.height });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [rows, max]);

  return (
    <div className="rp-wrap" ref={wrapRef}>
      {rows.map((r, i) => {
        const diff = r.isLeader ? 0 : r.value - r.target;
        const pct = (r.value / max) * 100;
        const clickable = !r.isLeader && !!onSelect;
        return (
          <div
            className={`rp-row${r.isLeader ? " leader" : ""}${clickable ? " clickable" : ""}${selected === r.name ? " selected" : ""}`}
            key={r.name}
            onClick={clickable ? () => onSelect(r.name) : undefined}
          >
            <div className="rp-name">
              <span>{r.name}{r.isMe ? " (내 단지)" : ""}</span>
              {r.distLabel && <span className="rp-dist">{r.distLabel}</span>}
            </div>
            <div className="rp-track" ref={(el) => { rowRefs.current[i] = el; }}>
              <div className={`rp-fill${r.isMe ? " me" : ""}${r.isLeader ? " leader" : ""}`} style={{ width: `${pct}%` }}>
                <span className="rp-val">{uk(r.value)}억</span>
              </div>
              {r.isLeader ? (
                <div className="rp-badge">기준</div>
              ) : (
                <div className={`rp-gap ${diff < 0 ? "under" : "over"}`}>{signed(diff)}억</div>
              )}
            </div>
          </div>
        );
      })}
      {overlayPath && (
        <svg className="rp-overlay" width={box.w} height={box.h}>
          <path d={overlayPath} fill="none" stroke="var(--color-warning)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
      <style jsx>{`
        .rp-wrap { position: relative; }
        .rp-row { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; position: relative; }
        .rp-name { width: 92px; flex-shrink: 0; font-size: 0.7rem; font-weight: 700; color: var(--color-ink-2); text-align: right; line-height: 1.3; display: flex; flex-direction: column; align-items: flex-end; gap: 1px; }
        .rp-row.leader .rp-name { color: var(--color-warning-ink, var(--color-warning)); font-weight: 800; }
        .rp-dist { font-size: 0.6rem; font-weight: 600; color: var(--color-ink-3); }
        .rp-track { flex: 1; height: 24px; background: var(--color-card-soft); border-radius: 6px; position: relative; }
        .rp-fill { height: 100%; border-radius: 6px; background: var(--color-line); display: flex; align-items: center; transition: width .4s cubic-bezier(.2,.8,.2,1); }
        .rp-fill.me { background: var(--color-primary); }
        .rp-fill.leader { background: var(--color-warning); }
        .rp-val { font-size: 0.66rem; font-weight: 800; color: var(--color-ink); font-variant-numeric: tabular-nums; margin-left: 8px; white-space: nowrap; }
        .rp-fill.me .rp-val, .rp-fill.leader .rp-val { color: #fff; }
        .rp-badge { position: absolute; right: 6px; top: 50%; transform: translateY(-50%); font-size: 0.6rem; font-weight: 800; color: var(--color-warning-ink, var(--color-warning)); background: var(--color-card); border: 1px solid var(--color-warning); border-radius: 999px; padding: 1px 7px; }
        .rp-gap { position: absolute; right: 6px; top: 50%; transform: translateY(-50%); font-size: 0.64rem; font-weight: 800; font-variant-numeric: tabular-nums; }
        .rp-gap.under { color: var(--color-success); }
        .rp-gap.over { color: var(--color-danger); }
        .rp-row.clickable { cursor: pointer; }
        .rp-row.clickable .rp-track { transition: box-shadow .15s; }
        .rp-row.clickable:hover .rp-track { box-shadow: 0 0 0 2px var(--color-primary-soft); }
        .rp-row.selected .rp-track { box-shadow: 0 0 0 2px var(--color-primary); }
        .rp-overlay { position: absolute; left: 0; top: 0; pointer-events: none; overflow: visible; }
      `}</style>
    </div>
  );
}

// ── ② 평형별 적정가: 막대(현재가) + 계단식 실선(회귀 적정가) ──
function AreaStepChart({ areas, myPyeongM2 }) {
  const w = 320, h = 140, padL = 26, padR = 6, padT = 14, padB = 22;
  const innerW = w - padL - padR, innerH = h - padT - padB;
  if (!areas || areas.length < 2) {
    return <div style={{ fontSize: "0.72rem", color: "var(--color-ink-3)", textAlign: "center", padding: "16px 8px" }}>이 단지의 평형별 실거래 데이터가 아직 충분하지 않습니다.</div>;
  }
  const xs = areas.map((a) => a.m2), ys = areas.map((a) => a.priceUk);
  const fit = linreg(xs, ys);
  const trend = fit ? xs.map((x) => fit.slope * x + fit.intercept) : ys.slice();
  const lo = Math.min(...ys, ...trend) * 0.92, hi = Math.max(...ys, ...trend) * 1.08;
  const n = areas.length;
  const bw = (innerW / n) * 0.52;
  const x = (i) => padL + (innerW / n) * (i + 0.5);
  const y = (v) => padT + innerH - ((v - lo) / (hi - lo)) * innerH;

  let stepD = "";
  areas.forEach((a, i) => {
    const xs2 = x(i) - bw / 2, xe = x(i) + bw / 2, yt = y(trend[i]);
    stepD += (i === 0 ? "M " : " L ") + `${xs2},${yt} L ${xe},${yt}`;
  });

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="ac-svg">
      <line x1={padL} x2={w - padR} y1={padT + innerH} y2={padT + innerH} stroke="var(--color-line)" strokeWidth="1" />
      {areas.map((a, i) => {
        const isMine = myPyeongM2 != null && Math.abs(a.m2 - Number(myPyeongM2)) < 5;
        const by = y(a.priceUk), bh = padT + innerH - by;
        const diff = a.priceUk - trend[i];
        return (
          <g key={a.m2}>
            <rect x={x(i) - bw / 2} y={by} width={bw} height={Math.max(2, bh)} rx="4"
              fill={isMine ? "var(--color-primary)" : "var(--color-line)"} />
            <text x={x(i)} y={h - 6} textAnchor="middle" fontSize="9" fontWeight="700" fill="var(--color-ink-3)">{a.m2}㎡</text>
            <text x={x(i)} y={Math.min(by, y(trend[i])) - 6} textAnchor="middle" fontSize="9" fontWeight="800"
              fill={diff < 0 ? "var(--color-success)" : "var(--color-danger)"}>{signed(diff)}억</text>
          </g>
        );
      })}
      <path d={stepD} fill="none" stroke="var(--color-warning)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <style jsx>{`.ac-svg { width: 100%; display: block; overflow: visible; }`}</style>
    </svg>
  );
}

// ── ③ 시점별 갭 + 예상가: 실측(실선) + 예측(옅은 실선) ──
function ProjectionChart({ leaderName, meName, leaderSeries, meSeries }) {
  const emptyStyle = { fontSize: "0.72rem", color: "var(--color-ink-3)", textAlign: "center", padding: "16px 8px" };
  if (!leaderSeries?.length || !meSeries?.length) {
    return <div style={emptyStyle}>시점별 실거래 데이터가 아직 충분하지 않습니다.</div>;
  }
  // 공통 월만 정렬 정합 후 최근 구간 사용
  const leaderMap = Object.fromEntries(leaderSeries.map((s) => [s.month, s.price]));
  const meMap = Object.fromEntries(meSeries.map((s) => [s.month, s.price]));
  const months = [...new Set([...leaderSeries.map((s) => s.month), ...meSeries.map((s) => s.month)])]
    .filter((m) => leaderMap[m] != null && meMap[m] != null).sort().slice(-8);
  if (months.length < 3) return <div style={emptyStyle}>대장·내 단지 공통 실거래 구간이 부족합니다.</div>;

  const leaderVals = months.map((m) => leaderMap[m]);
  const meVals = months.map((m) => meMap[m]);
  const idx = months.map((_, i) => i);
  const fitL = linreg(idx, leaderVals), fitM = linreg(idx, meVals);
  const FUT = 2;
  const futIdx = [months.length, months.length + 1];
  const leaderFut = fitL ? futIdx.map((i) => fitL.slope * i + fitL.intercept) : [];
  const meFut = fitM ? futIdx.map((i) => fitM.slope * i + fitM.intercept) : [];
  const xLabels = [...months.map((m) => m.slice(2).replace("-", "/")), ...futIdx.map((_, i) => `+${i + 1}M`)];
  const leaderAll = [...leaderVals, ...leaderFut], meAll = [...meVals, ...meFut];
  const nowIndex = months.length - 1;

  const w = 320, h = 158, padL = 8, padR = 8, padT = 18, padB = 20;
  const innerW = w - padL - padR, innerH = h - padT - padB;
  const n = xLabels.length;
  const allVals = [...leaderAll, ...meAll];
  const lo = Math.min(...allVals) * 0.95, hi = Math.max(...allVals) * 1.05;
  const x = (i) => padL + (innerW / (n - 1)) * i;
  const y = (v) => padT + innerH - ((v - lo) / (hi - lo)) * innerH;
  const nowX = x(nowIndex);

  const line = (vals, from, to) => vals.slice(from, to + 1).map((v, i) => `${x(from + i)},${y(v)}`).join(" ");

  const gapNow = leaderAll[nowIndex] - meAll[nowIndex];
  const gapFuture = leaderAll[leaderAll.length - 1] - meAll[meAll.length - 1];
  const narrowing = gapFuture < gapNow;

  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} className="pj-svg">
        <line x1={padL} x2={w - padR} y1={padT + innerH} y2={padT + innerH} stroke="var(--color-line)" strokeWidth="1" />
        <line x1={nowX} x2={nowX} y1={padT - 6} y2={padT + innerH} stroke="var(--color-ink-3)" strokeWidth="1" opacity="0.5" />
        <text x={nowX} y={padT - 9} textAnchor="middle" fontSize="9" fontWeight="800" fill="var(--color-ink-3)">현재</text>
        {xLabels.map((lb, i) => (i % 2 === 0 || i === n - 1) && (
          <text key={i} x={x(i)} y={h - 5} textAnchor="middle" fontSize="8" fontWeight="600" fill="var(--color-ink-3)">{lb}</text>
        ))}
        <polyline points={line(leaderAll, 0, nowIndex)} fill="none" stroke="var(--color-warning)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        <polyline points={line(leaderAll, nowIndex, n - 1)} fill="none" stroke="var(--color-warning)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" opacity="0.4" />
        <polyline points={line(meAll, 0, nowIndex)} fill="none" stroke="var(--color-primary)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        <polyline points={line(meAll, nowIndex, n - 1)} fill="none" stroke="var(--color-primary)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" opacity="0.4" />
        <text x={x(n - 1)} y={y(leaderAll[leaderAll.length - 1]) - 8} textAnchor="end" fontSize="9" fontWeight="800" fill="var(--color-warning)">{leaderName} {uk(leaderAll[leaderAll.length - 1])}억</text>
        <text x={x(n - 1)} y={y(meAll[meAll.length - 1]) + 14} textAnchor="end" fontSize="9" fontWeight="800" fill="var(--color-primary)">{meName} {uk(meAll[meAll.length - 1])}억</text>
      </svg>
      <div className="pj-callouts">
        <div className="pj-c"><span className="k">현재 갭</span><span className="v">{uk(gapNow)}억</span></div>
        <div className="pj-c"><span className="k">2개월 후 예상 갭</span><span className="v">{uk(gapFuture)}억</span></div>
      </div>
      <div className="pj-note">
        최근 실거래 추세를 연장하면 격차가 {narrowing
          ? <><b className="lo">{uk(gapNow - gapFuture)}억 좁혀질</b> 전망입니다.</>
          : <><b className="hi">{uk(gapFuture - gapNow)}억 더 벌어질</b> 전망입니다.</>} (선형 추세 연장 · 참고용)
      </div>
      <style jsx>{`
        .pj-svg { width: 100%; display: block; overflow: visible; }
        .pj-callouts { display: flex; gap: 8px; margin-top: 8px; }
        .pj-c { flex: 1; background: var(--color-card-soft); border-radius: 10px; padding: 8px 10px; }
        .pj-c .k { display: block; font-size: 0.62rem; color: var(--color-ink-3); margin-bottom: 2px; }
        .pj-c .v { font-size: 0.86rem; font-weight: 800; font-variant-numeric: tabular-nums; color: var(--color-ink); }
        .pj-note { margin-top: 8px; font-size: 0.72rem; color: var(--color-ink-2); line-height: 1.5; word-break: keep-all; }
        .pj-note b.lo { color: var(--color-success); } .pj-note b.hi { color: var(--color-danger); }
      `}</style>
    </div>
  );
}

export default function RePositionCard({ brief, myProp, dongOf }) {
  const [dbAreas, setDbAreas] = useState({});
  const [selected, setSelected] = useState(null);
  const [trendCache, setTrendCache] = useState({});

  useEffect(() => { if (myProp?.name) setSelected(myProp.name); }, [myProp?.name]);

  const leader = brief?.leader;
  const myDong = myProp?.name ? dongOf(myProp.name) : null;

  const neighborRows = useMemo(() => {
    if (!brief?.all_ranking || !leader) return [];
    let pool = brief.all_ranking;
    if (myDong) {
      const sameDong = pool.filter((r) => dongOf(r.단지명) === myDong);
      if (sameDong.length >= 2) pool = sameDong; // 같은 동 표본 부족하면 지역 전체로 폴백
    }
    const rows = pool
      .filter((r) => r.pred != null && r.cur != null)
      .sort((a, b) => (a.lag ?? 99) - (b.lag ?? 99))
      .slice(0, 5)
      .map((r) => ({
        name: r.단지명, value: r.cur, target: r.pred,
        isMe: r.단지명 === myProp?.name,
        distLabel: r.lag === 0 ? "동조(0개월)" : r.lag != null ? `${r.lag}개월 지연` : null,
      }));
    return [{ name: leader, value: brief.leader_price, isLeader: true, distLabel: "대장 기준" }, ...rows];
  }, [brief, myDong, myProp?.name, dongOf, leader]);

  useEffect(() => {
    if (!selected || dbAreas[selected] !== undefined) return;
    setDbAreas((m) => ({ ...m, [selected]: null }));
    fetch(`/api/pwa/re/complexAreas?complex=${encodeURIComponent(selected)}`)
      .then((r) => r.json())
      .then((d) => {
        const areas = Array.isArray(d?.areas) ? d.areas
          .map((a) => ({ m2: Math.round(Number(a.m2 ?? a.전용면적)), priceUk: a.rep_price_uk != null ? Number(a.rep_price_uk) : null }))
          .filter((a) => a.m2 > 0 && a.priceUk != null)
          .sort((a, b) => a.m2 - b.m2) : null;
        setDbAreas((m) => ({ ...m, [selected]: areas && areas.length ? areas : null }));
      })
      .catch(() => setDbAreas((m) => ({ ...m, [selected]: null })));
  }, [selected]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    [leader, myProp?.name].filter(Boolean).forEach((apt) => {
      if (trendCache[apt] !== undefined) return;
      setTrendCache((m) => ({ ...m, [apt]: null }));
      const qs = new URLSearchParams({ apt, months: "18" });
      if (brief?.region) qs.set("region", brief.region);
      fetch(`/api/pwa/re/trend?${qs}`)
        .then((r) => r.json())
        .then((d) => setTrendCache((m) => ({ ...m, [apt]: Array.isArray(d?.series) ? d.series : null })))
        .catch(() => setTrendCache((m) => ({ ...m, [apt]: null })));
    });
  }, [leader, myProp?.name, brief?.region]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!brief || brief.error || !leader) return null;
  if (!neighborRows.length) return null;

  return (
    <section className="card rp-card">
      <span className="rp-card-label">내단지 포지션</span>
      <h2 className="rp-card-title">🏠 동네 비교 <span className="rp-badge-note">참고용</span></h2>
      <p className="rp-card-sub">대장이 맨 위, 아래로 대장과 가격이 함께 움직이는 정도(동조 개월수)순 — 위경도 데이터가 없어 직선거리 대신 씁니다. 막대=현재가, 실선=회귀 기반 적정가.</p>
      <NeighborList rows={neighborRows} onSelect={setSelected} selected={selected} />

      <h3 className="rp-sub-title">📐 {selected || myProp?.name || ""} 평형별 적정가</h3>
      <AreaStepChart areas={selected ? dbAreas[selected] : null} myPyeongM2={selected === myProp?.name ? myProp?.pyeong : null} />

      {myProp?.name && leader && (
        <>
          <h3 className="rp-sub-title">📈 대장 대비 갭 추이 &amp; 예상가</h3>
          <ProjectionChart
            leaderName={leader} meName={myProp.name}
            leaderSeries={trendCache[leader]} meSeries={trendCache[myProp.name]}
          />
        </>
      )}

      <style jsx>{`
        .rp-card { background: var(--color-card); border-radius: var(--radius-card, 16px); padding: 16px 15px 15px; box-shadow: var(--shadow-card); margin-bottom: 12px; }
        .rp-card-label { display: block; font-size: 0.68rem; font-weight: 800; color: var(--color-ink-3); letter-spacing: .3px; text-transform: uppercase; margin-bottom: 2px; }
        .rp-card-title { font-size: 0.98rem; font-weight: 800; color: var(--color-ink); margin: 0 0 4px; }
        .rp-badge-note { font-size: 0.62rem; font-weight: 700; color: var(--color-ink-3); background: var(--color-card-soft); border: 1px solid var(--color-line); border-radius: 999px; padding: 1px 7px; margin-left: 5px; vertical-align: middle; }
        .rp-card-sub { font-size: 0.72rem; color: var(--color-ink-3); line-height: 1.5; margin: 0 0 12px; word-break: keep-all; }
        .rp-sub-title { font-size: 0.82rem; font-weight: 800; color: var(--color-ink); margin: 16px 0 8px; }
      `}</style>
    </section>
  );
}
