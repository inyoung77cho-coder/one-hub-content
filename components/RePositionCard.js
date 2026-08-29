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

const uk = (n) => (n == null ? "-" : `${Number(n).toFixed(2)}`);
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
  const [box, setBox] = useState({ w: 0, h: 0 });

  // [차이 강조] baseline을 0이 아니라 최저값 아래로 내려, 단지 간 가격차를 크게 보이게(사용자 요청).
  const { lo, hi } = useMemo(() => {
    const vals = [];
    rows.forEach((r) => { if (r.value != null) vals.push(r.value); if (r.target != null) vals.push(r.target); });
    if (!vals.length) return { lo: 0, hi: 1 };
    const mn = Math.min(...vals), mx = Math.max(...vals);
    const span = mx - mn;
    if (span < mx * 0.03) return { lo: Math.max(0, mx * 0.6), hi: mx * 1.08 };
    return { lo: Math.max(0, mn - span * 0.55), hi: mx + span * 0.12 };
  }, [rows]);
  const scale = (v) => (v == null ? 0 : Math.max(3, Math.min(100, ((v - lo) / (hi - lo)) * 100)));

  useEffect(() => {
    const measure = () => {
      const wrap = wrapRef.current;
      if (!wrap || !rows.length) return;
      const wrapRect = wrap.getBoundingClientRect();
      const pts = rows.map((r, i) => {
        const trackEl = rowRefs.current[i];
        if (!trackEl) return null;
        const tr = trackEl.getBoundingClientRect();
        // [갭 과장] 적정가 틱을 막대 끝(현재가)에서 실제 차이의 3.2배로 밀어 시각적으로 크게 벌린다.
        //   (억·% 실제값은 배지에 그대로 표기 — 여긴 '차이를 눈에 띄게'만.)
        let tpct;
        if (r.isLeader) tpct = scale(r.value);
        else {
          const be = scale(r.value), tp = scale(r.target);
          tpct = Math.max(3, Math.min(99, be + (tp - be) * 3.2));
        }
        const xLoc = (tr.left - wrapRect.left) + tr.width * (tpct / 100);
        return {
          x: xLoc,
          yTop: tr.top - wrapRect.top,
          yBot: (tr.top - wrapRect.top) + tr.height,
          yMid: (tr.top - wrapRect.top) + tr.height / 2,
        };
      }).filter(Boolean);
      if (!pts.length) return;
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
      {(tickPath || connPath) && (
        <svg className="rp-overlay" width={box.w} height={box.h}>
          <path d={connPath} fill="none" stroke="var(--color-warning)" strokeWidth="2.2" strokeDasharray="4,3.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d={tickPath} fill="none" stroke="var(--color-warning)" strokeWidth="2.4" strokeDasharray="4,3.5" strokeLinecap="round" />
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
              fill={isMine ? "var(--color-primary)" : "var(--color-line)"} />
            <text x={x(i)} y={h - 6} textAnchor="middle" fontSize="9" fontWeight="700" fill="var(--color-ink-3)">{a.m2}㎡</text>
            <text x={x(i)} y={Math.min(by, y(trend[i])) - 6} textAnchor="middle" fontSize="9" fontWeight="800"
              fill={diff < 0 ? "var(--color-success)" : "var(--color-danger)"}>{signed(diff)}억</text>
          </g>
        );
      })}
      <path d={stepD} fill="none" stroke="var(--color-warning)" strokeWidth="2.6" strokeDasharray="5,3.5" strokeLinecap="round" strokeLinejoin="round" />
      <style jsx>{`.ac-svg { width: 100%; display: block; overflow: visible; }`}</style>
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

    const val = (r) => (r.cur84 != null ? r.cur84 : r.cur);
    const rows = pool
      .filter((r) => canon(r.단지명) !== leaderCanon && val(r) != null)
      .sort((a, b) => val(b) - val(a)) // 국민평형 84㎡ 가격 높은 순(가격 위계)
      .slice(0, 6)
      .map((r) => {
        const v = val(r);
        // [적정가] 84㎡ 전용 회귀(pred84) 우선. 없으면 blended 괴리로 폴백, 최종은 현재가.
        const tgt = r.pred84 != null ? r.pred84
          : (r.cur ? Math.round(v * (r.pred / r.cur) * 100) / 100 : v);
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

      <h3 className="rp-sub-title">🏘 동네 비교 <span className="rp-mini">국민평형 84㎡ 기준</span></h3>
      <p className="rp-card-sub">대장이 맨 위, 아래로 <b>국민평형 84㎡ 실거래가 높은 순</b>. 막대=현재가, 세로 점선=84㎡ 회귀 적정가, 오른쪽=적정가 대비 갭(억·%). 단지를 누르면 아래 평형별로 바뀝니다.</p>
      <TargetList rows={neighborRows} onSelect={setSelected} selected={selected} />

      <h3 className="rp-sub-title">📐 {selected || myProp?.name || ""} 평형별 적정가</h3>
      <AreaStepChart areas={selected ? dbAreas[selected] : null} myPyeongM2={selected === myProp?.name ? myProp?.pyeong : null} />

      <style jsx>{`
        .rp-card { background: var(--color-card); border-radius: var(--radius-card, 16px); padding: 16px 15px 15px; box-shadow: var(--shadow-card); margin-bottom: 12px; }
        .rp-card-label { display: block; font-size: 0.68rem; font-weight: 800; color: var(--color-ink-3); letter-spacing: .3px; text-transform: uppercase; margin-bottom: 2px; }
        .rp-card-title { font-size: 0.98rem; font-weight: 800; color: var(--color-ink); margin: 0 0 4px; }
        .rp-badge-note { font-size: 0.62rem; font-weight: 700; color: var(--color-ink-3); background: var(--color-card-soft); border: 1px solid var(--color-line); border-radius: 999px; padding: 1px 7px; margin-left: 5px; vertical-align: middle; }
        .rp-card-sub { font-size: 0.72rem; color: var(--color-ink-3); line-height: 1.5; margin: 0 0 12px; word-break: keep-all; }
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

  const top = Math.max(...items.map((x) => x.price84_uk || 0)) * 1.1 || 1;
  const tierColor = (t) => (t === "상위" ? "var(--color-danger)" : t === "하위" ? "var(--color-ink-3)" : "var(--color-primary)");

  return (
    <section className="card rl-card">
      <span className="rl-label">동네 대장 비교</span>
      <h2 className="rl-title">🏙 동네별 대장 아파트 <span className="rl-mini">국민평형 84㎡ · 주간 갱신</span></h2>
      <p className="rl-sub">내 동네(서현동) 대장이 상위(강남)·하위 동네 대장과 어디쯤 있는지. 매주 실거래로 대장을 다시 뽑아 사전 계산합니다{updated ? ` (기준 ${updated})` : ""}.</p>

      <div className="rl-list">
        {items.map((x) => {
          const isMine = x.dong === myRegion;
          const pct = Math.max(4, Math.min(100, (x.price84_uk / top) * 100));
          const vsMine = (() => {
            const mine = items.find((y) => y.dong === myRegion);
            return mine && !isMine ? Math.round((x.price84_uk - mine.price84_uk) * 10) / 10 : null;
          })();
          return (
            <div className={`rl-row${isMine ? " mine" : ""}`} key={x.dong}>
              <div className="rl-head">
                <span className="rl-tier" style={{ color: tierColor(x.tier), borderColor: tierColor(x.tier) }}>{x.tier}</span>
                <span className="rl-dong">{x.dong}{isMine ? " · 내 동네" : ""}</span>
                <span className="rl-apt">{x.leader}</span>
              </div>
              <div className="rl-track">
                <div className={`rl-fill${isMine ? " mine" : ""}`} style={{ width: `${pct}%` }}>
                  <span className="rl-val">{uk(x.price84_uk)}억</span>
                </div>
                {vsMine != null && <span className={`rl-vs ${vsMine > 0 ? "hi" : "lo"}`}>{signed(vsMine)}억</span>}
              </div>
            </div>
          );
        })}
      </div>

      <style jsx>{`
        .rl-card { background: var(--color-card); border-radius: var(--radius-card, 16px); padding: 16px 15px 15px; box-shadow: var(--shadow-card); margin-bottom: 12px; }
        .rl-label { display: block; font-size: 0.68rem; font-weight: 800; color: var(--color-ink-3); letter-spacing: .3px; text-transform: uppercase; margin-bottom: 2px; }
        .rl-title { font-size: 0.98rem; font-weight: 800; color: var(--color-ink); margin: 0 0 4px; }
        .rl-mini { font-size: 0.62rem; font-weight: 700; color: var(--color-primary); background: var(--color-primary-soft); border-radius: 999px; padding: 1px 7px; margin-left: 5px; vertical-align: middle; }
        .rl-sub { font-size: 0.72rem; color: var(--color-ink-3); line-height: 1.5; margin: 0 0 12px; word-break: keep-all; }
        .rl-list { display: flex; flex-direction: column; gap: 12px; }
        .rl-row.mine { background: var(--color-primary-soft); border-radius: 10px; padding: 6px 8px; margin: -2px -4px; }
        .rl-head { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; }
        .rl-tier { font-size: 0.6rem; font-weight: 800; border: 1px solid; border-radius: 999px; padding: 0 6px; }
        .rl-dong { font-size: 0.78rem; font-weight: 800; color: var(--color-ink); }
        .rl-apt { font-size: 0.68rem; font-weight: 600; color: var(--color-ink-3); margin-left: auto; }
        .rl-track { position: relative; height: 24px; background: var(--color-card-soft); border-radius: 6px; }
        .rl-fill { height: 100%; border-radius: 6px; background: var(--color-line); display: flex; align-items: center; transition: width .4s cubic-bezier(.2,.8,.2,1); }
        .rl-fill.mine { background: var(--color-primary); }
        .rl-val { font-size: 0.68rem; font-weight: 800; color: var(--color-ink); margin-left: 8px; white-space: nowrap; font-variant-numeric: tabular-nums; }
        .rl-fill.mine .rl-val { color: #fff; }
        .rl-vs { position: absolute; right: 6px; top: 50%; transform: translateY(-50%); font-size: 0.64rem; font-weight: 800; font-variant-numeric: tabular-nums; }
        .rl-vs.hi { color: var(--color-danger); } .rl-vs.lo { color: var(--color-success); }
      `}</style>
    </section>
  );
}
