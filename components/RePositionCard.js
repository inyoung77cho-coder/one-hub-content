// components/RePositionCard.js — [내단지 포지션 v2] 2026-08-27, v3 같은 날 업데이트
//   기존엔 "대장 대비 91% 수준" 텍스트 두 줄뿐이었다 — 막대그래프+실선으로 재설계.
//   ① 동네 비교: 대장이 맨 위, 아래로 대장과의 가격 동조(lag_map, 개월) 순 — 실제 위경도가
//      DB에 없어 "직선거리"는 못 쓰고, 이미 검증된 lag_map(0~4개월)을 근접도 대용으로 쓴다.
//      행마다 회귀 기반 적정가(brief.all_ranking[].pred)를 표시 — 세로 점선(각 행의 목표가
//      위치를 가로지르는 수직 틱) + 행 사이는 사선(실선)으로 연결(=평형별 계단식을 세로로
//      세운 형태, 사용자 지시).
//   ② 평형별 적정가: complex-areas(실거래 평형별 대표가)에 평형↔가격 선형회귀를 얹어 계단선.
//      동네 비교에서 단지를 클릭하면 ②가 그 단지로 바뀐다(원 요청: gap 큰 단지 클릭→평형별 갭).
//   ③ 대장 대비 장기(20년) 비율 추세 + 적정가: /api/trend/{apt}?months=240 월별 실거래로
//      내 단지/대장 가격 비율을 연도별로 집계, 그 장기 추세(회귀)가 가리키는 "적정 비율" ×
//      현재 대장가 = 적정가. 단기 변동이 아니라 20년 구조적 관계를 본다(사용자 지시).
//   ④ 대장 아파트끼리 비교: 주변 도시·강남 등 다른 동네의 "대장 아파트"들을 모아, 그중 최고가를
//      기준(대장 중의 대장)으로 삼아 ①과 같은 방식(세로 점선 틱 + 사선 연결)으로 비교(사용자 지시).
import { useEffect, useMemo, useRef, useState } from "react";

const uk = (n) => (n == null ? "-" : `${Number(n).toFixed(1)}`);      // 억, 소수점 1자리 통일
const signed = (n) => (n == null ? "-" : `${n >= 0 ? "+" : ""}${Number(n).toFixed(1)}`);

// [동일단지 별칭] 실거래는 나뉘어 있으나 같은 아파트로 취급 — 대장(시범삼성)과 시범한신은 하나로.
const COMPLEX_ALIAS = { "시범삼성": "시범삼성·한신", "시범한신": "시범삼성·한신" };
const canon = (n) => COMPLEX_ALIAS[n] || n;

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

// 두 월별 시계열(series:[{month,price}])의 공통월로 연도별 평균 "비율"을 만들고,
// 그 장기추세(회귀)가 가리키는 "적정 비율" × 기준 현재가 = 적정가를 계산한다.
// [카드②③ 공용] 내 단지 vs 대장, 지역 대장 vs 최상위 대장 양쪽에서 재사용.
function ratioFairPrice(subjectSeries, refSeries) {
  if (!subjectSeries?.length || !refSeries?.length) return null;
  const subMap = Object.fromEntries(subjectSeries.map((s) => [s.month, s.price]));
  const refMap = Object.fromEntries(refSeries.map((s) => [s.month, s.price]));
  const months = [...new Set([...subjectSeries.map((s) => s.month), ...refSeries.map((s) => s.month)])]
    .filter((m) => subMap[m] != null && refMap[m] > 0).sort();
  if (months.length < 24) return null; // 장기 분석 최소 표본(2년 이상)

  const byYear = {};
  months.forEach((m) => {
    const yr = m.slice(0, 4);
    (byYear[yr] = byYear[yr] || []).push(subMap[m] / refMap[m]);
  });
  const years = Object.keys(byYear).sort();
  const yearlyRatio = years.map((y) => byYear[y].reduce((a, b) => a + b, 0) / byYear[y].length);
  const yIdx = years.map((_, i) => i);
  const fit = linreg(yIdx, yearlyRatio);
  const trendRatio = fit ? yIdx.map((i) => fit.slope * i + fit.intercept) : yearlyRatio.slice();
  // [정확도 수정] 20년 전체를 그대로 선형회귀하면 2006~2012년처럼 지금과 완전히 다른
  //   시장 국면까지 같은 비중으로 반영돼, 최근 실제 관측치와 크게 어긋난 "적정비율"이
  //   나오는 문제가 있었다(실측: 최근 5개년 평균 64% vs 20년 회귀값 71.7%, 사용자 지적).
  //   → "적정비율"은 최근 구간(최대 5개년, 표본 부족하면 있는 만큼) 평균으로 계산하고,
  //   20년 전체 회귀선(trendRatio)은 장기 흐름 참고용으로 차트에만 남겨둔다.
  const recentN = Math.min(5, yearlyRatio.length);
  const recentRatios = yearlyRatio.slice(-recentN);
  const fairRatio = recentRatios.reduce((a, b) => a + b, 0) / recentRatios.length;
  // [정확도 수정] "현재가"는 두 단지의 공통 거래월이 아니라, 각자의 가장 최근 실거래월을
  //   써야 한다 — 공통월 기준이면 한쪽 거래가 뜸할 때 실제보다 오래된 가격이 "현재가"로
  //   표시되는 문제가 있었다(사용자 지적: 비교 금액이 실제와 크게 다름).
  const refMonths = refSeries.map((s) => s.month).sort();
  const subMonths = subjectSeries.map((s) => s.month).sort();
  const refNow = refMap[refMonths[refMonths.length - 1]];
  const subjectNow = subMap[subMonths[subMonths.length - 1]];
  const fairPrice = refNow * fairRatio;
  return { years, yearlyRatio, trendRatio, fairRatio, recentN, refNow, subjectNow, fairPrice, gap: subjectNow - fairPrice };
}

// ── 재사용 리스트: 대장(기준)이 맨 위, 행마다 자기 target(회귀 적정가) — 세로 점선 틱 +
//    행 사이 사선(실선) 연결. Card① 동네비교와 Card④ 지역 대장 비교가 공유. ──
function TargetList({ rows, onSelect, selected }) {
  const wrapRef = useRef(null);
  const rowRefs = useRef([]);
  const [tickPath, setTickPath] = useState("");
  const [connPath, setConnPath] = useState("");
  const [wavePath, setWavePath] = useState("");
  const [box, setBox] = useState({ w: 0, h: 0 });

  // [차이 강조] baseline을 0이 아니라 최저값 아래로 내려, 단지 간 가격차를 크게 보이게(사용자 요청).
  const { lo, hi } = useMemo(() => {
    const vals = [];
    rows.forEach((r) => { if (r.value != null) vals.push(r.value); if (r.target != null) vals.push(r.target); });
    if (!vals.length) return { lo: 0, hi: 1 };
    const mn = Math.min(...vals), mx = Math.max(...vals);
    const span = mx - mn;
    if (span < mx * 0.03) return { lo: Math.max(0, mx * 0.7), hi: mx * 1.06 };
    return { lo: Math.max(0, mn - span * 0.25), hi: mx + span * 0.1 }; // 완화된 확대(과장↓)
  }, [rows]);
  const scale = (v) => (v == null ? 0 : Math.max(6, Math.min(100, ((v - lo) / (hi - lo)) * 100)));
  const truncated = lo > 0.01; // baseline이 0이 아니면(확대) 물결 표시

  useEffect(() => {
    const measure = () => {
      const wrap = wrapRef.current;
      if (!wrap || !rows.length) return;
      const wrapRect = wrap.getBoundingClientRect();
      const pts = rows.map((r, i) => {
        const trackEl = rowRefs.current[i];
        if (!trackEl) return null;
        const tr = trackEl.getBoundingClientRect();
        // [갭 강조·완화] 적정가 틱을 막대 끝에서 실제차의 1.6배만 밀어 살짝 벌린다(과장 완화).
        let tpct;
        if (r.isLeader) tpct = scale(r.value);
        else {
          const be = scale(r.value), tp = scale(r.target);
          tpct = Math.max(4, Math.min(98, be + (tp - be) * 1.6));
        }
        const left = tr.left - wrapRect.left;
        const xLoc = left + tr.width * (tpct / 100);
        return {
          x: xLoc, left, fillW: tr.width * (scale(r.value) / 100),
          yTop: tr.top - wrapRect.top,
          yBot: (tr.top - wrapRect.top) + tr.height,
          yMid: (tr.top - wrapRect.top) + tr.height / 2,
        };
      }).filter(Boolean);
      if (!pts.length) return;
      // [물결] 확대(baseline≠0)일 때 각 막대 '중앙'에 축 끊김 물결 — 정직하게 '0부터 아님' 표시(가격 글자와 겹치지 않게 중앙).
      let waveD = "";
      if (truncated) {
        pts.forEach((p) => {
          let xw = p.left + Math.max(p.fillW * 0.5, 48);
          xw = Math.min(xw, p.left + Math.max(16, p.fillW - 8));
          const y0 = p.yTop + 3, y1 = p.yBot - 3, seg = (y1 - y0) / 3;
          let d = `M ${xw},${y0}`;
          for (let s = 0; s < 3; s++) {
            const a = y0 + seg * s, b = a + seg, dir = s % 2 === 0 ? 3.2 : -3.2;
            d += ` Q ${xw + dir},${(a + b) / 2} ${xw},${b}`;
          }
          waveD += d + " ";
        });
      }
      setWavePath(waveD);
      // 세로 점선: 각 행의 목표가 위치를 위아래로 가로지르는 수직 틱(별도 path — 점선 처리)
      const tickD = pts.map((p) => `M ${p.x},${p.yTop} L ${p.x},${p.yBot}`).join(" ");
      // 사선: 세로 점선 틱의 끝(아래쪽 끝)과 다음 틱의 끝(위쪽 끝)을 실선으로 연결
      //   — 중간지점끼리가 아니라 점선이 "끝나는" 지점에서 바로 이어지도록.
      let connD = "";
      for (let i = 1; i < pts.length; i++) {
        connD += `M ${pts[i - 1].x},${pts[i - 1].yBot} L ${pts[i].x},${pts[i].yTop} `;
      }
      setTickPath(tickD);
      setConnPath(connD);
      setBox({ w: wrapRect.width, h: wrapRect.height });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [rows, lo, hi]);

  return (
    <div className="rp-wrap" ref={wrapRef}>
      {rows.map((r, i) => {
        const diff = r.isLeader || r.target == null ? null : Math.round((r.value - r.target) * 10) / 10;
        const diffPct = !r.isLeader && r.target ? Math.round((r.value / r.target - 1) * 1000) / 10 : null;
        const pct = scale(r.value);
        const clickable = !r.isLeader && !!onSelect;
        return (
          <div
            className={`rp-row${r.isLeader ? " leader" : ""}${clickable ? " clickable" : ""}${selected === r.name ? " selected" : ""}`}
            key={r.name}
            onClick={clickable ? () => onSelect(r.name) : undefined}
          >
            <div className={`rp-name${r.isMe && !r.isLeader ? " mine" : ""}`}>
              <span>{r.name}</span>
              {r.distLabel && <span className="rp-dist">{r.distLabel}</span>}
            </div>
            <div className="rp-track" ref={(el) => { rowRefs.current[i] = el; }}>
              <div className={`rp-fill${r.isMe ? " me" : ""}${r.isLeader ? " leader" : ""}`} style={{ width: `${pct}%` }}>
                <span className="rp-val">{uk(r.value)}억</span>
              </div>
              {r.isLeader ? (
                <div className="rp-badge">기준</div>
              ) : diff != null ? (
                <div className={`rp-gap ${diff < 0 ? "under" : "over"}`}>{signed(diff)}억<em>{diffPct >= 0 ? "+" : ""}{diffPct}%</em></div>
              ) : null}
            </div>
          </div>
        );
      })}
      {(tickPath || connPath || wavePath) && (
        <svg className="rp-overlay" width={box.w} height={box.h}>
          <path d={connPath} fill="none" stroke="var(--color-warning)" strokeWidth="2.2" strokeDasharray="4,3.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d={tickPath} fill="none" stroke="var(--color-warning)" strokeWidth="2.4" strokeDasharray="4,3.5" strokeLinecap="round" />
          {wavePath && <path d={wavePath} fill="none" stroke="var(--color-card)" strokeWidth="5" strokeLinecap="round" />}
          {wavePath && <path d={wavePath} fill="none" stroke="var(--color-ink-3)" strokeWidth="1.4" strokeLinecap="round" />}
        </svg>
      )}
      <style jsx>{`
        .rp-wrap { position: relative; }
        .rp-row { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; position: relative; }
        .rp-name { width: 92px; flex-shrink: 0; font-size: 0.7rem; font-weight: 700; color: var(--color-ink-2); text-align: right; line-height: 1.3; display: flex; flex-direction: column; align-items: flex-end; gap: 1px; }
        .rp-row.leader .rp-name { color: var(--color-warning-ink, var(--color-warning)); font-weight: 800; }
        .rp-name.mine { color: var(--color-primary); font-weight: 800; }
        .rp-dist { font-size: 0.6rem; font-weight: 600; color: var(--color-ink-3); }
        .rp-track { flex: 1; height: 24px; background: var(--color-card-soft); border-radius: 6px; position: relative; }
        .rp-fill { height: 100%; border-radius: 6px; background: color-mix(in srgb, var(--color-ink-3) 45%, var(--color-line)); display: flex; align-items: center; transition: width .4s cubic-bezier(.2,.8,.2,1); }
        .rp-fill.me { background: var(--color-primary); }
        .rp-fill.leader { background: var(--color-warning); }
        .rp-val { font-size: 0.66rem; font-weight: 800; color: var(--color-ink); font-variant-numeric: tabular-nums; margin-left: 8px; white-space: nowrap; }
        .rp-fill.me .rp-val, .rp-fill.leader .rp-val { color: #fff; }
        .rp-badge { position: absolute; right: 6px; top: 50%; transform: translateY(-50%); font-size: 0.6rem; font-weight: 800; color: var(--color-warning-ink, var(--color-warning)); background: var(--color-card); border: 1px solid var(--color-warning); border-radius: 999px; padding: 1px 7px; }
        .rp-gap { position: absolute; right: 6px; top: 50%; transform: translateY(-50%); font-size: 0.66rem; font-weight: 800; font-variant-numeric: tabular-nums; text-align: right; line-height: 1.15; }
        .rp-gap em { font-style: normal; font-weight: 700; font-size: 0.56rem; display: block; opacity: .82; }
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
              className={`ac-bar${isMine ? " mine" : ""}`} />
            <text x={x(i)} y={h - 6} textAnchor="middle" fontSize="9" fontWeight="700" fill="var(--color-ink-3)">{a.m2}㎡</text>
            <text x={x(i)} y={Math.min(by, y(trend[i])) - 6} textAnchor="middle" fontSize="9" fontWeight="800"
              fill={diff < 0 ? "var(--color-success)" : "var(--color-danger)"}>{signed(diff)}억</text>
          </g>
        );
      })}
      <path d={stepD} fill="none" stroke="var(--color-warning)" strokeWidth="2.6" strokeDasharray="5,3.5" strokeLinecap="round" strokeLinejoin="round" />
      <style jsx>{`
        .ac-svg { width: 100%; display: block; overflow: visible; }
        .ac-bar { fill: color-mix(in srgb, var(--color-ink-3) 45%, var(--color-line)); }
        .ac-bar.mine { fill: var(--color-primary); }
      `}</style>
    </svg>
  );
}

// ── ③ 대장 대비 장기(20년) 비율 추세 + 적정가 ──
function RatioTrendChart({ leaderName, subjectName, leaderSeries, subjectSeries }) {
  const emptyStyle = { fontSize: "0.72rem", color: "var(--color-ink-3)", textAlign: "center", padding: "16px 8px" };
  if (!leaderSeries?.length || !subjectSeries?.length) {
    return <div style={emptyStyle}>장기(20년) 실거래 데이터가 아직 로딩 중이거나 부족합니다.</div>;
  }
  const r = ratioFairPrice(subjectSeries, leaderSeries);
  if (!r) return <div style={emptyStyle}>{leaderName}·{subjectName} 공통 실거래 구간이 장기분석(2년 이상)에는 부족합니다.</div>;
  const { years, yearlyRatio, trendRatio, fairRatio, recentN, refNow, subjectNow, fairPrice, gap } = r;

  const w = 320, h = 150, padL = 8, padR = 8, padT = 14, padB = 20;
  const innerW = w - padL - padR, innerH = h - padT - padB;
  const n = years.length;
  const lo = Math.min(...yearlyRatio, ...trendRatio) * 0.92, hi = Math.max(...yearlyRatio, ...trendRatio) * 1.08;
  const x = (i) => padL + (n > 1 ? (innerW / (n - 1)) * i : innerW / 2);
  const y = (v) => padT + innerH - ((v - lo) / (hi - lo || 1)) * innerH;
  const linePts = (vals) => vals.map((v, i) => `${x(i)},${y(v)}`).join(" ");

  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} className="rt-svg">
        <line x1={padL} x2={w - padR} y1={padT + innerH} y2={padT + innerH} stroke="var(--color-line)" strokeWidth="1" />
        {years.map((yLbl, i) => (i % 3 === 0 || i === n - 1) && (
          <text key={yLbl} x={x(i)} y={h - 5} textAnchor="middle" fontSize="8" fontWeight="600" fill="var(--color-ink-3)">{yLbl.slice(2)}</text>
        ))}
        <polyline points={linePts(yearlyRatio)} fill="none" stroke="var(--color-primary)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        <polyline points={linePts(trendRatio)} fill="none" stroke="var(--color-warning)" strokeWidth="2.2" strokeDasharray="5,3.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div className="rt-legend">
        <span className="li"><i style={{ background: "var(--color-primary)" }} />실제 비율({subjectName}/{leaderName})</span>
        <span className="li"><i style={{ background: "var(--color-warning)" }} />20년 추세선(참고용)</span>
      </div>
      <div className="pj-callouts">
        <div className="pj-c"><span className="k">{leaderName} 현재가</span><span className="v">{uk(refNow)}억</span></div>
        <div className="pj-c"><span className="k">최근 {recentN}개년 평균 적정가</span><span className="v">{uk(fairPrice)}억</span></div>
      </div>
      <div className="pj-note">
        {years[0]}~{years[years.length - 1]}년 {years.length}개년 비율(파란선)을 보여드리되, "적정 비율"은 최근 {recentN}개년 평균 <b>{(fairRatio * 100).toFixed(1)}%</b>로 계산했습니다
        (20년 전체를 그대로 선형회귀하면 2006~2012년 같은 다른 시장 국면까지 같은 비중으로 섞여 최근 실제와 크게 어긋나는 값이 나와, 최근 구간 평균으로 보정했습니다).
        {" "}{subjectName} 실제가 {uk(subjectNow)}억은 적정가 대비 <b className={gap < 0 ? "lo" : "hi"}>{signed(gap)}억</b>({gap < 0 ? "저평가" : "고평가"}) 구간입니다.
      </div>
      <style jsx>{`
        .rt-svg { width: 100%; display: block; overflow: visible; }
        .rt-legend { display: flex; gap: 12px; margin-top: 6px; flex-wrap: wrap; }
        .rt-legend .li { display: inline-flex; align-items: center; gap: 5px; font-size: 0.62rem; font-weight: 700; color: var(--color-ink-2); }
        .rt-legend .li i { width: 8px; height: 8px; border-radius: 2px; display: inline-block; }
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

// [④ 지역 대장 비교] 2026-08-27 임시 비활성화 — region_config.json에 큐레이션된 다른 동네
//   대장 6곳을 페이지 로드마다 동시 조회하도록 짰더니, 백엔드 /api/briefing·/api/trend가
//   매 호출마다 raw_transactions(46만 행) 전체를 pandas로 새로 읽는 무거운 구조라 서버
//   메모리가 급격히 치솟는 사고가 났다(onehub-realestate RSS 1.5GB·스왑 1.7GB, 서버 응답불능).
//   재발 방지를 위해 프론트에서 완전히 뺐다 — 되살리려면 백엔드에 _load_pivot() 캐싱
//   (region별 TTL 캐시)을 먼저 넣어야 한다.
// const REGION_WATCHLIST = ["정자동", "판교동", "대치동", "반포동", "압구정동", "도곡동"];

// ── 🎯 히어로: 내 단지 84㎡ 현재가 vs 적정가 갭(크게, 자꾸 보게) + 대장 대비 + 내 실제 평형 ──
function GapHero({ myName, cur84, fair84, leader84, leaderName, amLeader, area, userAvm }) {
  if (cur84 == null) return null;
  // [갭 강조] 스케일을 현재가·적정가 주변으로 좁혀(baseline 0 아님) 차이를 크게 보이게.
  const vals = [cur84, fair84].filter((v) => v != null);
  const mn = Math.min(...vals), mx = Math.max(...vals);
  const span = mx - mn || mx * 0.1;
  const lo = Math.max(0, mn - span * 1.1), hi = mx + span * 1.1;
  const pct = (v) => `${Math.max(3, Math.min(97, ((v - lo) / (hi - lo)) * 100))}%`;
  const gap = fair84 != null ? Math.round((cur84 - fair84) * 10) / 10 : null; // +고평가 / −저평가
  const gapPct = fair84 ? Math.round((cur84 / fair84 - 1) * 1000) / 10 : null;
  const over = gap != null && gap > 0;
  const vsLeader = leader84 != null ? Math.round((cur84 - leader84) * 10) / 10 : null;
  return (
    <div className="gh">
      <div className="gh-top">
        <div className="gh-cur">
          <span className="gh-cur-v">{uk(cur84)}<em>억</em></span>
          <span className="gh-cur-k">{myName} · 국민평형 84㎡ 현재가</span>
        </div>
        {gap != null && (
          <div className={`gh-verdict ${over ? "over" : "under"}`}>
            <b>{over ? "▲ 고평가" : "▼ 저평가"}</b>
            <span>적정가 {signed(gap)}억 ({gapPct >= 0 ? "+" : ""}{gapPct}%)</span>
          </div>
        )}
      </div>
      <div className="gh-bar">
        <div className={`gh-fill ${over ? "over" : "under"}`} style={{ width: pct(cur84) }} />
        {fair84 != null && <div className="gh-fair" style={{ left: pct(fair84) }}><i /><span>적정 {uk(fair84)}</span></div>}
      </div>
      <div className="gh-lines">
        {amLeader ? (
          <span className="gh-line">🏆 <b>이 동네(서현동) 대장 단지</b>입니다 (시범삼성·한신 = 동일 단지)</span>
        ) : vsLeader != null && (
          <span className="gh-line">🏆 대장 <b>{leaderName}</b> 84㎡ {uk(leader84)}억 대비 <b className={vsLeader > 0 ? "hi" : "lo"}>{signed(vsLeader)}억</b></span>
        )}
        {area && (
          <span className="gh-line gh-mine">📍 내 실제 평형 {area.pyeong ? `${area.pyeong}평` : `${area.m2}㎡`} 실거래 {uk(area.priceUk)}~{uk(area.maxUk)}억{area.n != null ? ` (${area.n}건${area.n < 3 ? "·표본 얇음" : ""})` : ""}{userAvm ? ` · 내 시세 ${uk(userAvm)}억` : ""}</span>
        )}
      </div>
      <style jsx>{`
        .gh { background: linear-gradient(135deg, var(--color-primary-soft), var(--color-card-soft)); border: 1px solid var(--color-line); border-radius: 14px; padding: 14px 15px 13px; margin-bottom: 14px; }
        .gh-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
        .gh-cur { display: flex; flex-direction: column; gap: 2px; }
        .gh-cur-v { font-size: 1.7rem; font-weight: 900; color: var(--color-ink); line-height: 1; font-variant-numeric: tabular-nums; }
        .gh-cur-v em { font-size: 0.9rem; font-weight: 800; font-style: normal; margin-left: 2px; }
        .gh-cur-k { font-size: 0.68rem; font-weight: 700; color: var(--color-ink-3); }
        .gh-verdict { text-align: right; display: flex; flex-direction: column; gap: 1px; }
        .gh-verdict b { font-size: 0.9rem; font-weight: 900; }
        .gh-verdict span { font-size: 0.66rem; font-weight: 700; font-variant-numeric: tabular-nums; }
        .gh-verdict.over b, .gh-verdict.over span { color: var(--color-danger); }
        .gh-verdict.under b, .gh-verdict.under span { color: var(--color-success); }
        .gh-bar { position: relative; height: 22px; background: var(--color-card); border: 1px solid var(--color-line); border-radius: 7px; margin: 12px 0 8px; overflow: visible; }
        .gh-fill { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 7px 0 0 7px; opacity: .5; }
        .gh-fill.over { background: var(--color-danger); }
        .gh-fill.under { background: var(--color-success); }
        .gh-fair { position: absolute; top: -4px; bottom: -4px; transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; }
        .gh-fair i { width: 2.5px; flex: 1; background: var(--color-ink-2); border-radius: 2px; }
        .gh-fair span { position: absolute; top: -14px; font-size: 0.6rem; font-weight: 800; color: var(--color-ink-2); white-space: nowrap; }
        .gh-lines { display: flex; flex-direction: column; gap: 3px; margin-top: 10px; }
        .gh-line { font-size: 0.72rem; color: var(--color-ink-2); font-weight: 600; word-break: keep-all; }
        .gh-line b { font-weight: 800; color: var(--color-ink); }
        .gh-line b.hi { color: var(--color-danger); } .gh-line b.lo { color: var(--color-success); }
        .gh-mine { color: var(--color-ink-3); }
      `}</style>
    </div>
  );
}

export default function RePositionCard({ brief, myProp, dongOf, userAvm = null }) {
  const [dbAreas, setDbAreas] = useState({});
  const [selected, setSelected] = useState(null);

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
    const leaderCanon = canon(leader);
    // [동일단지 병합] 대장(시범삼성)과 별칭 단지(시범한신)는 같은 아파트 → 84㎡가를 평균내 한 행으로.
    const aliased = pool.filter((r) => canon(r.단지명) === leaderCanon);
    const lvals = [brief.leader_84 != null ? brief.leader_84 : brief.leader_price,
                   ...aliased.map((r) => (r.cur84 != null ? r.cur84 : r.cur))].filter((v) => v != null);
    const leaderVal = lvals.length ? Math.round((lvals.reduce((a, b) => a + b, 0) / lvals.length) * 100) / 100 : null;
    const iOwnLeader = myProp?.name ? canon(myProp.name) === leaderCanon : false;

    // ★84㎡ 실거래가 있는 단지만(국민평형 비교). 미래타운처럼 84㎡ 없으면 제외 — 오염된 blended 적정가 방지.
    const rows = pool
      .filter((r) => canon(r.단지명) !== leaderCanon && r.cur84 != null)
      .sort((a, b) => b.cur84 - a.cur84) // 84㎡ 가격 높은 순(가격 위계)
      .slice(0, 6)
      .map((r) => {
        const v = r.cur84;
        // [적정가] 84㎡ 전용 회귀(pred84)만. 없으면 적정=현재(오염된 blended 폴백 안 씀).
        const tgt = r.pred84 != null ? r.pred84 : v;
        return {
          name: r.단지명, value: v, target: tgt,
          isMe: myProp?.name ? canon(r.단지명) === canon(myProp.name) : false,
          distLabel: leaderVal != null ? `대장 ${signed(v - leaderVal)}억` : null,
        };
      });
    return [{
      name: leaderCanon, value: leaderVal, isLeader: true, isMe: iOwnLeader,
      distLabel: "대장",
    }, ...rows];
  }, [brief, myDong, myProp?.name, dongOf, leader]);

  // [히어로] 내 단지 84㎡ 갭 요약 데이터
  const myRankRow = useMemo(
    () => (brief?.all_ranking || []).find((r) => r.단지명 === myProp?.name) || null,
    [brief, myProp?.name]
  );

  // ② 평형별 적정가 — 클릭된(또는 기본 내 단지) 단지의 complex-areas 로딩
  useEffect(() => {
    if (!selected || dbAreas[selected] !== undefined) return;
    setDbAreas((m) => ({ ...m, [selected]: null }));
    fetch(`/api/pwa/re/complexAreas?complex=${encodeURIComponent(selected)}`)
      .then((r) => r.json())
      .then((d) => {
        const areas = Array.isArray(d?.areas) ? d.areas
          .map((a) => ({
            m2: Math.round(Number(a.m2 ?? a.전용면적)),
            pyeong: a.평 != null ? Number(a.평) : null,
            priceUk: a.rep_price_uk != null ? Number(a.rep_price_uk) : (a.rep_price_manwon != null ? Number(a.rep_price_manwon) / 10000 : null),
            maxUk: a.max_price_uk != null ? Number(a.max_price_uk) : (a.max_price_manwon != null ? Number(a.max_price_manwon) / 10000 : null),
            n: a.n != null ? Number(a.n) : null,
          }))
          .filter((a) => a.m2 > 0 && a.priceUk != null)
          .sort((a, b) => a.m2 - b.m2) : null;
        setDbAreas((m) => ({ ...m, [selected]: areas && areas.length ? areas : null }));
      })
      .catch(() => setDbAreas((m) => ({ ...m, [selected]: null })));
  }, [selected]); // eslint-disable-line react-hooks/exhaustive-deps

  // [20년 장기 비율 차트]는 삭제됨 — pred84(국민평형 84㎡ 회귀 적정가)가 대장 대비 적정가를
  //   더 정확·가볍게 대체하므로 중복. /api/trend 호출도 함께 제거.
  // [지역 대장 비교]는 별도 카드(RegionLeadersCard, 주간 사전선정)로 이관됨.

  // [히어로] 내 실제 평형을 complex-areas에서 매칭(전용㎡ 또는 평 중 가까운 쪽) — 표기/실거래 범위용.
  const myArea = useMemo(() => {
    const list = myProp?.name ? dbAreas[myProp.name] : null;
    if (!Array.isArray(list) || !list.length) return null;
    const p = Number(myProp?.pyeong);
    if (!p) return null;
    let best = null, bd = Infinity;
    for (const a of list) {
      const d = Math.min(Math.abs(a.m2 - p), a.pyeong != null ? Math.abs(a.pyeong - p) : Infinity);
      if (d < bd) { bd = d; best = a; }
    }
    return best;
  }, [dbAreas, myProp?.name, myProp?.pyeong]);

  if (!brief || brief.error || !leader) return null;
  if (!neighborRows.length) return null;

  // 히어로 입력 — 내 단지 84㎡ 현재가 / 적정가(84㎡ 전용 회귀 pred84) / 대장 84㎡
  const heroCur84 = myRankRow ? (myRankRow.cur84 != null ? myRankRow.cur84 : myRankRow.cur) : null;
  const heroFair84 = myRankRow
    ? (myRankRow.pred84 != null ? myRankRow.pred84
       : (myRankRow.cur ? Math.round(heroCur84 * (myRankRow.pred / myRankRow.cur) * 100) / 100 : null))
    : null;
  const heroLeader84 = brief.leader_84 != null ? brief.leader_84 : brief.leader_price;
  const amLeader = myProp?.name ? canon(myProp.name) === canon(leader) : false;

  return (
    <section className="card rp-card">
      <span className="rp-card-label">내단지 포지션</span>
      <h2 className="rp-card-title">🏠 내 단지 가격 위치 <span className="rp-badge-note">참고용</span></h2>

      {myProp?.name && heroCur84 != null && (
        <GapHero
          myName={amLeader ? canon(leader) : myProp.name} cur84={heroCur84} fair84={heroFair84}
          leader84={heroLeader84} leaderName={leader} amLeader={amLeader} area={myArea} userAvm={userAvm}
        />
      )}

      <h3 className="rp-sub-title">🏘 동네 비교 <span className="rp-mini">84㎡ 기준</span></h3>
      <TargetList rows={neighborRows} onSelect={setSelected} selected={selected} />
      <p className="rp-note">막대=현재가 · 점선=적정가 · 물결〰=확대(0부터 아님) · 단지 눌러 평형별 보기</p>

      <h3 className="rp-sub-title">📐 {selected || myProp?.name || ""} 평형별 적정가</h3>
      <AreaStepChart areas={selected ? dbAreas[selected] : null} myPyeongM2={selected === myProp?.name ? myProp?.pyeong : null} />

      <style jsx>{`
        .rp-card { background: var(--color-card); border-radius: var(--radius-card, 16px); padding: 16px 15px 15px; box-shadow: var(--shadow-card); margin-bottom: 12px; }
        .rp-card-label { display: block; font-size: 0.68rem; font-weight: 800; color: var(--color-ink-3); letter-spacing: .3px; text-transform: uppercase; margin-bottom: 2px; }
        .rp-card-title { font-size: 0.98rem; font-weight: 800; color: var(--color-ink); margin: 0 0 4px; }
        .rp-badge-note { font-size: 0.62rem; font-weight: 700; color: var(--color-ink-3); background: var(--color-card-soft); border: 1px solid var(--color-line); border-radius: 999px; padding: 1px 7px; margin-left: 5px; vertical-align: middle; }
        .rp-card-sub { font-size: 0.72rem; color: var(--color-ink-3); line-height: 1.5; margin: 0 0 12px; word-break: keep-all; }
        .rp-note { font-size: 0.62rem; color: var(--color-ink-3); margin: 6px 0 0; text-align: center; word-break: keep-all; }
        .rp-sub-title { font-size: 0.82rem; font-weight: 800; color: var(--color-ink); margin: 16px 0 8px; }
        .rp-mini { font-size: 0.62rem; font-weight: 700; color: var(--color-primary); background: var(--color-primary-soft); border-radius: 999px; padding: 1px 7px; margin-left: 5px; vertical-align: middle; }
        .rp-more { margin-top: 14px; border-top: 1px solid var(--color-line); padding-top: 8px; }
        .rp-more > summary { font-size: 0.8rem; font-weight: 800; color: var(--color-ink-2); cursor: pointer; list-style: revert; }
        .rp-more > summary span { font-size: 0.66rem; font-weight: 600; color: var(--color-ink-3); }
        .rp-more[open] > summary { margin-bottom: 8px; }
      `}</style>
    </section>
  );
}

// ══════════════════════════════════════════════════════════════════
//  Card 2 — 동네별 대장 비교 (주간 사전선정 region_leaders 읽기 · 가벼움)
//    서현동 대장 vs 상위(강남 대치·반포)·하위(분당) 동네 대장을 84㎡ 기준 막대로.
//    ④가 페이지마다 46만행을 재조회해 서버가 폭주했던 문제를, 주간 배치 사전계산으로 해결.
// ══════════════════════════════════════════════════════════════════
export function RegionLeadersCard({ myRegion = "서현동" }) {
  const [items, setItems] = useState(null);
  const [updated, setUpdated] = useState(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/pwa/re/regionLeaders`)
      .then((r) => r.json())
      .then((d) => { if (!alive) return; setItems(Array.isArray(d?.items) ? d.items : []); setUpdated(d?.updated || null); })
      .catch(() => { if (alive) setItems([]); });
    return () => { alive = false; };
  }, []);

  if (items == null) return null;              // 로딩 중
  if (!items.length) return null;              // 배치 미실행/데이터 없음 → 조용히 숨김

  // [카드1과 동일 형식] TargetList 재사용 — 막대=현재 84㎡, 세로 점선=적정가(동네 평균 가격 추세 기준).
  //   적정가 = 대장 현재가 × (동네 평균 84㎡ 추세 적정 ÷ 현재 평균) — 최고가 아닌 동네 평균 흐름이 기준.
  const rows = items
    .slice()
    .sort((a, b) => (b.price84_uk || 0) - (a.price84_uk || 0))
    .map((x) => {
      const ratio = x.fair_ratio != null ? x.fair_ratio : 1;
      const tgt = Math.round(x.price84_uk * ratio * 100) / 100;
      return {
        name: `${x.dong} · ${x.leader}`,
        value: x.price84_uk,
        target: tgt,
        isMe: x.dong === myRegion,
        distLabel: x.tier,
      };
    });

  return (
    <section className="card rl-card">
      <span className="rl-label">동네 대장 비교</span>
      <h2 className="rl-title">🏙 동네별 대장 아파트 <span className="rl-mini">국민평형 84㎡ · 주간 갱신</span></h2>
      <TargetList rows={rows} />
      <p className="rl-note">막대=현재가 · 점선=적정가(동네 평균 추세) · 갭 −저평가/+고평가{updated ? ` · ${updated}` : ""}</p>
      <style jsx>{`
        .rl-card { background: var(--color-card); border-radius: var(--radius-card, 16px); padding: 16px 15px 15px; box-shadow: var(--shadow-card); margin-bottom: 12px; }
        .rl-label { display: block; font-size: 0.68rem; font-weight: 800; color: var(--color-ink-3); letter-spacing: .3px; text-transform: uppercase; margin-bottom: 2px; }
        .rl-title { font-size: 0.98rem; font-weight: 800; color: var(--color-ink); margin: 0 0 4px; }
        .rl-mini { font-size: 0.62rem; font-weight: 700; color: var(--color-primary); background: var(--color-primary-soft); border-radius: 999px; padding: 1px 7px; margin-left: 5px; vertical-align: middle; }
        .rl-sub { font-size: 0.72rem; color: var(--color-ink-3); line-height: 1.5; margin: 0 0 12px; word-break: keep-all; }
        .rl-sub b { color: var(--color-primary); }
        .rl-note { font-size: 0.62rem; color: var(--color-ink-3); margin: 6px 0 0; text-align: center; word-break: keep-all; }
      `}</style>
    </section>
  );
}

// ══════════════════════════════════════════════════════════════════
//  Card 3 — 동네별 대장 가격 추세 · 년도별 예측(시나리오 밴드)
//    주간 배치가 넣은 84㎡ 연도별 이력 + CAGR로, 프론트가 향후 3년 밴드를 그린다.
//    부동산 예측은 불확실 → 점 하나가 아니라 '보수~낙관' 밴드 + '예측 아님' 명시(정직).
// ══════════════════════════════════════════════════════════════════
function buildForecast(item, horizon = 3) {
  const hist = (Array.isArray(item.hist) ? item.hist : []).filter((h) => h && h.uk > 0);
  const base = hist.length ? hist[hist.length - 1].uk : item.price84_uk;
  const baseYear = hist.length ? hist[hist.length - 1].year : new Date().getFullYear();
  const c5 = item.cagr5 != null ? item.cagr5 : (item.cagr10 != null ? item.cagr10 : 0.03);
  const cMid = c5;
  const cLo = Math.max(-0.02, c5 * 0.4);              // 보수(상승률 절반 이하)
  const cHi = Math.max(c5 * 1.5, item.cagr10 != null ? item.cagr10 : c5); // 낙관
  const fc = [];
  for (let k = 1; k <= horizon; k++) {
    fc.push({ year: baseYear + k, lo: base * (1 + cLo) ** k, mid: base * (1 + cMid) ** k, hi: base * (1 + cHi) ** k });
  }
  return { hist, base, baseYear, cMid, cLo, cHi, fc };
}

function ForecastChart({ item }) {
  const f = buildForecast(item, 5);
  if (!f.hist.length) return <div style={{ fontSize: "0.72rem", color: "var(--color-ink-3)", padding: "10px" }}>이력 데이터가 아직 부족합니다.</div>;
  const hist = f.hist.slice(-5);
  const bars = [
    ...hist.map((hh) => ({ year: hh.year, kind: "hist", v: hh.uk })),
    ...f.fc.map((p) => ({ year: p.year, kind: "fc", lo: p.lo, mid: p.mid, hi: p.hi })),
  ];
  const w = 340, h = 178, padL = 8, padR = 8, padT = 20, padB = 18;
  const iw = w - padL - padR, ih = h - padT - padB;
  const n = bars.length;
  const bw = (iw / n) * 0.58;
  const X = (i) => padL + (iw / n) * (i + 0.5);
  const top = Math.max(...hist.map((hh) => hh.uk), ...f.fc.map((p) => p.hi)) * 1.1 || 1;
  const Y = (v) => padT + ih - (v / top) * ih;
  const baseY = padT + ih;
  const d1 = (v) => Number(v).toFixed(1);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="fc-svg">
      <line x1={padL} x2={w - padR} y1={baseY} y2={baseY} stroke="var(--color-line)" strokeWidth="1" />
      {bars.map((b, i) => {
        const cx = X(i), x0 = cx - bw / 2;
        if (b.kind === "hist") {
          const y = Y(b.v);
          return (
            <g key={i}>
              <rect className="fc-bar-hist" x={x0} y={y} width={bw} height={Math.max(1, baseY - y)} rx="3" />
              <text x={cx} y={y - 3} textAnchor="middle" fontSize="7" fontWeight="700" fill="var(--color-ink-2)">{d1(b.v)}</text>
              <text x={cx} y={h - 5} textAnchor="middle" fontSize="7" fontWeight="600" fill="var(--color-ink-3)">'{String(b.year).slice(2)}</text>
            </g>
          );
        }
        const yLo = Y(b.lo), yHi = Y(b.hi), yMid = Y(b.mid);
        return (
          <g key={i}>
            <rect className="fc-bar-base" x={x0} y={yLo} width={bw} height={Math.max(1, baseY - yLo)} rx="3" />
            <rect className="fc-bar-range" x={x0} y={yHi} width={bw} height={Math.max(1, yLo - yHi)} rx="2" />
            <line x1={x0} x2={x0 + bw} y1={yMid} y2={yMid} className="fc-mid" />
            {/* 낙관(hi) 위 · 보수(lo) 경계 — 년도별 금액(1자리) */}
            <text x={cx} y={yHi - 3} textAnchor="middle" fontSize="7" fontWeight="800" fill="var(--color-primary)">{d1(b.hi)}</text>
            <text x={cx} y={yLo - 2.5} textAnchor="middle" fontSize="6.5" fontWeight="700" fill="var(--color-ink-3)">{d1(b.lo)}</text>
            <text x={cx} y={h - 5} textAnchor="middle" fontSize="7" fontWeight="700" fill="var(--color-primary)">'{String(b.year).slice(2)}</text>
          </g>
        );
      })}
      <style jsx>{`
        .fc-svg { width: 100%; display: block; overflow: visible; }
        .fc-bar-hist { fill: color-mix(in srgb, var(--color-ink-3) 45%, var(--color-line)); }
        .fc-bar-base { fill: var(--color-primary); opacity: .78; }
        .fc-bar-range { fill: var(--color-primary); opacity: .26; }
        .fc-mid { stroke: var(--color-primary); stroke-width: 1.6; stroke-dasharray: 3,2; }
      `}</style>
    </svg>
  );
}

// [Card3 #3] 동네별 '격차 변화' 미니 그래프 — 각 동네의 서현 대비 격차(현재 → 5년후)를
//   가로 점-선으로. 좁아지면 초록, 벌어지면 빨강. 텍스트 대신 한눈에.
function GapDeltaChart({ items, mineDong, H }) {
  const mine = items.find((x) => x.dong === mineDong) || items.find((x) => x.tier === "기준");
  if (!mine) return null;
  const mineF = buildForecast(mine, H);
  const rows = items.filter((x) => x.dong !== mineDong).map((x) => {
    const f = buildForecast(x, H);
    return { dong: x.dong, now: (x.price84_uk - mine.price84_uk), fut: (f.fc[H - 1].mid - mineF.fc[H - 1].mid) };
  });
  if (!rows.length) return null;
  const maxAbs = Math.max(1, ...rows.flatMap((r) => [Math.abs(r.now), Math.abs(r.fut)]));
  const w = 340, rowH = 26, padL = 66, padR = 30, h = rows.length * rowH + 10;
  const midX = padL + (w - padL - padR) / 2;
  const scale = (v) => midX + (v / maxAbs) * ((w - padL - padR) / 2) * 0.92;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="gd-svg">
      <line x1={midX} x2={midX} y1={4} y2={h - 4} stroke="var(--color-line)" strokeWidth="1" strokeDasharray="2,2" />
      <text x={midX} y={h - 1} textAnchor="middle" fontSize="6.5" fill="var(--color-ink-3)">동일</text>
      {rows.map((r, i) => {
        const y = 8 + i * rowH + rowH / 2;
        const xN = scale(r.now), xF = scale(r.fut);
        const narrow = Math.abs(r.fut) < Math.abs(r.now);
        const col = narrow ? "var(--color-success)" : "var(--color-danger)";
        return (
          <g key={r.dong}>
            <text x={padL - 6} y={y + 3} textAnchor="end" fontSize="8" fontWeight="700" fill="var(--color-ink-2)">{r.dong}</text>
            <line x1={xN} x2={xF} y1={y} y2={y} stroke={col} strokeWidth="2" strokeLinecap="round" />
            <circle cx={xN} cy={y} r="3" fill="var(--color-ink-3)" />
            <circle cx={xF} cy={y} r="3.5" fill={col} />
            <text x={xF + (r.fut >= 0 ? 6 : -6)} y={y + 3} textAnchor={r.fut >= 0 ? "start" : "end"} fontSize="7" fontWeight="800" fill={col}>{signed(r.fut)}</text>
          </g>
        );
      })}
      <style jsx>{`.gd-svg { width: 100%; display: block; overflow: visible; }`}</style>
    </svg>
  );
}

export function RegionForecastCard({ myRegion = "서현동" }) {
  const [items, setItems] = useState(null);
  useEffect(() => {
    let alive = true;
    fetch(`/api/pwa/re/regionLeaders`).then((r) => r.json())
      .then((d) => { if (alive) setItems(Array.isArray(d?.items) ? d.items : []); })
      .catch(() => { if (alive) setItems([]); });
    return () => { alive = false; };
  }, []);
  if (items == null) return null;
  const withHist = items.filter((x) => Array.isArray(x.hist) && x.hist.length);
  if (!withHist.length) return null;
  const mine = items.find((x) => x.dong === myRegion) || items.find((x) => x.tier === "기준") || items[0];
  const H = 5; // 5년 시나리오
  const mineF = buildForecast(mine, H);
  const p5m = mineF.fc[H - 1];
  const pct = (v) => (v == null ? "-" : `${(v * 100).toFixed(1)}%`);

  return (
    <section className="card fc-card">
      <span className="fc-label">가격 추세 · 예측</span>
      <h2 className="fc-title">🔮 {mine.dong} 대장 {mine.leader} <span className="fc-mini">시나리오 · 예측 아님</span></h2>
      <ForecastChart item={mine} />
      <div className="fc-legend">
        <span className="li"><i className="hist" />실거래</span>
        <span className="li"><i className="base" />보수</span>
        <span className="li"><i className="range" />낙관</span>
        <span className="li"><i className="mid" />추세</span>
      </div>
      <div className="fc-callouts">
        <div className="fc-c"><span className="k">현재</span><span className="v">{uk(mineF.base)}</span></div>
        <div className="fc-c"><span className="k">5년(추세)</span><span className="v">{uk(p5m.mid)}</span></div>
        <div className="fc-c"><span className="k">보수~낙관</span><span className="v">{uk(p5m.lo)}~{uk(p5m.hi)}</span></div>
      </div>
      <p className="fc-note">단위 억 · CAGR {pct(mine.cagr5)} 기반 · 예측 아님(참고)</p>

      <h3 className="fc-h3">동네별 격차 변화 <span className="fc-mini">5년 후</span></h3>
      <GapDeltaChart items={items} mineDong={myRegion} H={H} />
      <p className="fc-note">회색=현재 격차 · 색점=5년 후(억) · <b className="nar">초록 좁아짐</b>/<b className="wid">빨강 벌어짐</b></p>

      <style jsx>{`
        .fc-card { background: var(--color-card); border-radius: var(--radius-card, 16px); padding: 16px 15px 15px; box-shadow: var(--shadow-card); margin-bottom: 12px; }
        .fc-label { display: block; font-size: 0.68rem; font-weight: 800; color: var(--color-ink-3); letter-spacing: .3px; text-transform: uppercase; margin-bottom: 2px; }
        .fc-title { font-size: 0.98rem; font-weight: 800; color: var(--color-ink); margin: 0 0 4px; }
        .fc-mini { font-size: 0.62rem; font-weight: 700; color: var(--color-ink-3); background: var(--color-card-soft); border: 1px solid var(--color-line); border-radius: 999px; padding: 1px 7px; margin-left: 5px; vertical-align: middle; }
        .fc-sub { font-size: 0.72rem; color: var(--color-ink-3); line-height: 1.5; margin: 0 0 10px; word-break: keep-all; }
        .fc-sub b { color: var(--color-primary); }
        .fc-legend { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 6px; }
        .fc-legend .li { display: inline-flex; align-items: center; gap: 4px; font-size: 0.62rem; font-weight: 700; color: var(--color-ink-2); }
        .fc-legend .li i { width: 10px; height: 10px; border-radius: 2px; display: inline-block; }
        .fc-legend .li i.hist { background: color-mix(in srgb, var(--color-ink-3) 45%, var(--color-line)); }
        .fc-legend .li i.base { background: var(--color-primary); opacity: .78; }
        .fc-legend .li i.range { background: var(--color-primary); opacity: .26; }
        .fc-legend .li i.mid { background: var(--color-primary); height: 2px; }
        .fc-callouts { display: flex; gap: 8px; margin-top: 8px; }
        .fc-c { flex: 1; background: var(--color-card-soft); border-radius: 10px; padding: 8px 10px; text-align: center; }
        .fc-c .k { display: block; font-size: 0.6rem; color: var(--color-ink-3); margin-bottom: 2px; }
        .fc-c .v { font-size: 0.82rem; font-weight: 800; color: var(--color-ink); font-variant-numeric: tabular-nums; }
        .fc-h3 { font-size: 0.82rem; font-weight: 800; color: var(--color-ink); margin: 16px 0 8px; }
        .fc-note { font-size: 0.62rem; color: var(--color-ink-3); margin: 6px 0 0; text-align: center; word-break: keep-all; }
        .fc-note b.nar { color: var(--color-success); } .fc-note b.wid { color: var(--color-danger); }
        .fc-rows { display: flex; flex-direction: column; gap: 6px; }
        .fc-row { display: flex; align-items: center; gap: 8px; font-size: 0.72rem; padding: 6px 8px; border-radius: 8px; background: var(--color-card-soft); }
        .fc-row.mine { background: var(--color-primary-soft); }
        .fc-dong { flex: 1; color: var(--color-ink-2); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .fc-dong b { color: var(--color-ink); font-weight: 800; }
        .fc-now { font-weight: 800; color: var(--color-ink); font-variant-numeric: tabular-nums; white-space: nowrap; }
        .fc-gap { font-size: 0.64rem; font-weight: 700; white-space: nowrap; }
        .fc-gap.nar { color: var(--color-success); }
        .fc-gap.wid { color: var(--color-danger); }
        .fc-gap.base { color: var(--color-primary); }
      `}</style>
    </section>
  );
}

// ══════════════════════════════════════════════════════════════════
//  Card 4 — 갈아타기 시나리오: 투자금 + 예상 이익률(세금 제외)
//    새 백엔드 없이 위 카드 데이터 재활용 — ①평형이동(내 단지) ②같은 동네 이사(all_ranking 84㎡)
//    ③동네 변경(region_leaders 예측). '이익률'=저평가 갭(갭 축소 시 기대) 또는 3년 초과상승률(시나리오).
// ══════════════════════════════════════════════════════════════════
const MOVE_TABS = [
  { id: "pyeong", label: "평형 이동" },
  { id: "dong", label: "같은 동네" },
  { id: "region", label: "동네 변경" },
];

export function MoveScenarioCard({ brief, myProp, dongOf, userAvm = null }) {
  const [tab, setTab] = useState("pyeong");
  const [areas, setAreas] = useState(null);
  const [regions, setRegions] = useState(null);

  useEffect(() => {
    if (!myProp?.name) return;
    let alive = true;
    fetch(`/api/pwa/re/complexAreas?complex=${encodeURIComponent(myProp.name)}`).then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        const a = Array.isArray(d?.areas) ? d.areas.map((x) => ({
          m2: Math.round(Number(x.m2 ?? x.전용면적)), pyeong: x.평 != null ? Number(x.평) : null,
          priceUk: x.rep_price_uk != null ? Number(x.rep_price_uk) : null,
          maxUk: x.max_price_uk != null ? Number(x.max_price_uk) : null,
        })).filter((x) => x.m2 > 0 && x.priceUk != null).sort((p, q) => p.m2 - q.m2) : null;
        setAreas(a);
      }).catch(() => { if (alive) setAreas(null); });
    return () => { alive = false; };
  }, [myProp?.name]);

  useEffect(() => {
    let alive = true;
    fetch(`/api/pwa/re/regionLeaders`).then((r) => r.json())
      .then((d) => { if (alive) setRegions(Array.isArray(d?.items) ? d.items : []); })
      .catch(() => { if (alive) setRegions([]); });
    return () => { alive = false; };
  }, []);

  if (!myProp?.name || !brief) return null;

  // 내 평형(전용㎡·평 가까운 쪽) 매칭
  const myArea = (() => {
    if (!Array.isArray(areas) || !areas.length) return null;
    const p = Number(myProp?.pyeong); if (!p) return null;
    let best = null, bd = Infinity;
    for (const a of areas) {
      const d = Math.min(Math.abs(a.m2 - p), a.pyeong != null ? Math.abs(a.pyeong - p) : Infinity);
      if (d < bd) { bd = d; best = a; }
    }
    return best;
  })();
  // 내 매도값(팔 값) — 사용자입력 > 내 평형 최고가(고층 가정) > 내 평형 대표 > 84㎡
  const myRank = (brief.all_ranking || []).find((r) => r.단지명 === myProp.name);
  const my84 = myRank ? (myRank.cur84 ?? myRank.cur) : null;
  const sellBase = userAvm != null ? userAvm
    : (myArea ? (myArea.maxUk || myArea.priceUk) : my84);

  // 시나리오 행 만들기
  const rows = (() => {
    if (sellBase == null) return [];
    if (tab === "pyeong") {
      if (!Array.isArray(areas) || areas.length < 2) return [];
      const fit = linreg(areas.map((a) => a.m2), areas.map((a) => a.priceUk));
      return areas.filter((a) => a !== myArea).map((a) => {
        const fair = fit ? fit.slope * a.m2 + fit.intercept : a.priceUk;
        const upside = fair > 0 ? (fair / a.priceUk - 1) * 100 : 0; // 저평가 갭%
        return { key: `${a.m2}`, name: `${a.pyeong ? a.pyeong + "평" : a.m2 + "㎡"}`, price: a.priceUk,
          invest: Math.round((a.priceUk - sellBase) * 10) / 10, ret: Math.round(upside * 10) / 10 };
      }).sort((x, y) => y.ret - x.ret);
    }
    if (tab === "dong") {
      const pool = (brief.all_ranking || []).filter((r) => (r.cur84 != null || r.cur != null) && canon(r.단지명) !== canon(myProp.name));
      return pool.map((r) => {
        const price = r.cur84 != null ? r.cur84 : r.cur;
        const upside = r.pred84 && price ? (r.pred84 / price - 1) * 100 : 0;
        return { key: r.단지명, name: r.단지명, price,
          invest: Math.round((price - sellBase) * 10) / 10, ret: Math.round(upside * 10) / 10 };
      }).sort((x, y) => y.ret - x.ret).slice(0, 6);
    }
    // region
    if (!Array.isArray(regions) || !regions.length) return [];
    const myDong = dongOf ? dongOf(myProp.name) : brief.region;
    const mineR = regions.find((x) => x.dong === myDong);
    const myCagr = mineR?.cagr5 != null ? mineR.cagr5 : 0.03;
    return regions.filter((x) => x.dong !== myDong).map((x) => {
      const price = x.price84_uk;
      const excess = ((x.cagr5 != null ? x.cagr5 : myCagr) - myCagr) * 100; // 3년 초과 연상승률
      return { key: x.dong, name: `${x.dong} ${x.leader}`, price,
        invest: Math.round((price - sellBase) * 10) / 10, ret: Math.round(excess * 3 * 10) / 10 }; // 3년 누적 초과
    }).sort((x, y) => y.ret - x.ret);
  })();

  const retNote = tab === "region"
    ? "이익률 = 3년 누적 초과 상승률(그 동네 CAGR − 내 동네, 시나리오)"
    : "이익률 = 적정가 대비 저평가 갭(갭 축소 시 기대)";

  return (
    <section className="card mv-card">
      <span className="mv-label">갈아타기 시나리오</span>
      <h2 className="mv-title">🔀 이사·갈아타기 수익 <span className="mv-mini">세금 미반영 · 시나리오</span></h2>
      <div className="mv-tabs">
        {MOVE_TABS.map((t) => (
          <button key={t.id} className={`mv-tab${tab === t.id ? " on" : ""}`} onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </div>
      <div className="mv-base">기준 매도값 <b>{sellBase != null ? `${uk(sellBase)}억` : "미확정"}</b>{userAvm != null ? " (내 시세 입력)" : myArea ? " (내 평형 실거래 최고)" : ""} · {retNote}</div>

      {sellBase == null ? (
        <div className="mv-empty">내 단지 시세가 없어 계산할 수 없습니다 — 위에서 내 단지·평형을 등록해 주세요.</div>
      ) : !rows.length ? (
        <div className="mv-empty">이 시나리오에 쓸 데이터가 아직 부족합니다.</div>
      ) : (
        <div className="mv-rows">
          {rows.map((r) => (
            <div className="mv-row" key={r.key}>
              <span className="mv-nm">{r.name}<em>{uk(r.price)}억</em></span>
              <span className={`mv-inv ${r.invest > 0 ? "up" : "down"}`}>{r.invest > 0 ? "추가 " : "회수 "}{uk(Math.abs(r.invest))}억</span>
              <span className={`mv-ret ${r.ret >= 0 ? "pos" : "neg"}`}>{r.ret >= 0 ? "+" : ""}{r.ret}%</span>
            </div>
          ))}
        </div>
      )}
      <p className="mv-foot">※ 세금(취득·양도)·거래비용·대출은 미반영한 단순 시나리오입니다. 실제 갈아타기는 세금·자금계획을 별도로 확인하세요.</p>

      <style jsx>{`
        .mv-card { background: var(--color-card); border-radius: var(--radius-card, 16px); padding: 16px 15px 15px; box-shadow: var(--shadow-card); margin-bottom: 12px; }
        .mv-label { display: block; font-size: 0.68rem; font-weight: 800; color: var(--color-ink-3); letter-spacing: .3px; text-transform: uppercase; margin-bottom: 2px; }
        .mv-title { font-size: 0.98rem; font-weight: 800; color: var(--color-ink); margin: 0 0 8px; }
        .mv-mini { font-size: 0.62rem; font-weight: 700; color: var(--color-ink-3); background: var(--color-card-soft); border: 1px solid var(--color-line); border-radius: 999px; padding: 1px 7px; margin-left: 5px; vertical-align: middle; }
        .mv-tabs { display: flex; gap: 5px; background: var(--color-card-soft); padding: 4px; border-radius: 10px; margin-bottom: 8px; }
        .mv-tab { flex: 1; border: none; background: none; padding: 7px 0; border-radius: 7px; font-size: 0.76rem; font-weight: 700; color: var(--color-ink-2); cursor: pointer; font-family: inherit; }
        .mv-tab.on { background: var(--color-primary); color: #fff; }
        .mv-base { font-size: 0.68rem; color: var(--color-ink-3); margin-bottom: 8px; word-break: keep-all; }
        .mv-base b { color: var(--color-ink); font-weight: 800; }
        .mv-rows { display: flex; flex-direction: column; gap: 6px; }
        .mv-row { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: 9px; background: var(--color-card-soft); }
        .mv-nm { flex: 1; font-size: 0.76rem; font-weight: 700; color: var(--color-ink); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .mv-nm em { font-style: normal; font-weight: 600; color: var(--color-ink-3); font-size: 0.68rem; margin-left: 6px; }
        .mv-inv { font-size: 0.72rem; font-weight: 700; font-variant-numeric: tabular-nums; white-space: nowrap; }
        .mv-inv.up { color: var(--color-danger); } .mv-inv.down { color: var(--color-success); }
        .mv-ret { font-size: 0.82rem; font-weight: 800; font-variant-numeric: tabular-nums; white-space: nowrap; min-width: 46px; text-align: right; }
        .mv-ret.pos { color: var(--color-success); } .mv-ret.neg { color: var(--color-danger); }
        .mv-empty { font-size: 0.74rem; color: var(--color-ink-3); text-align: center; padding: 16px 8px; }
        .mv-foot { font-size: 0.64rem; color: var(--color-ink-3); line-height: 1.5; margin: 10px 0 0; word-break: keep-all; }
      `}</style>
    </section>
  );
}
