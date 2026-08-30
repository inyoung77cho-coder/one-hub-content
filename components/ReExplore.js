// components/ReExplore.js — [오늘의 부동산 이관] 투자 스크리너 + ONE Score 랭킹 + 거시 환경
//   realestate.js에서 통째로 이관한 발견성 콘텐츠. RePositionCard처럼 필요 데이터를 자체
//   fetch(/api/pwa/re/* 화이트리스트)하고 myProp만 prop으로 받는 자립형 컴포넌트.
//   "내 단지 등록" CTA는 onRegister prop으로 위임(today.js → /pwa/realestate 이동).
import { useEffect, useState } from "react";
import { dedupBy } from "../lib/useDedup";
import Term from "./Term";

const uk = (n) => (n == null ? "-" : `${Number(n).toFixed(2)}억`);
const pct = (n) => (n == null ? "-" : `${n > 0 ? "+" : ""}${Number(n).toFixed(1)}%`);
const vtag = (v) => (v?.includes("저평가") ? "under" : v?.includes("고평가") ? "over" : "fair");
const jtag = (d) => (d?.includes("매수") ? "buy" : "watch");

export default function ReExplore({ myProp = null, onRegister }) {
  const [brief, setBrief] = useState(null);
  const [rank, setRank] = useState(null);
  const [macro, setMacro] = useState(null);
  const [feed, setFeed] = useState(null);
  const [dbAreas, setDbAreas] = useState({}); // 단지→평형(전용면적) 백엔드 로딩(complex-areas)
  const [dongMap, setDongMap] = useState({}); // 단지→법정동 백엔드 로딩(complex-dongs)
  const [budget, setBudget] = useState("");
  const [jeonseRate, setJeonseRate] = useState("60");
  const [moveScope, setMoveScope] = useState("region");
  const [gapTarget, setGapTarget] = useState(""); // 같은 단지 목표 평형(전용㎡)
  const [gapData, setGapData] = useState(null);
  const [gapLoading, setGapLoading] = useState(false);
  const [gapBData, setGapBData] = useState(null); // 같은 동 단지 갈아타기 갭
  const [gapCTarget, setGapCTarget] = useState(""); // 목표 지역(법정동)
  const [gapCData, setGapCData] = useState(null); // 지역 변경 갭
  const [gapCAlert, setGapCAlert] = useState(false); // 관심 갭 알림 설정(클라)
  const [userAvm, setUserAvm] = useState(null); // 내 평형 '팔 값'(스크리너는 팔 값만 필요)

  // ── 헬퍼 ──
  const areaMap = (() => {
    const m = {};
    (feed?.feed || []).forEach((f) => {
      const nm = f.단지명, a = Math.round(Number(f.전용면적));
      if (!nm || !(a > 0)) return;
      (m[nm] = m[nm] || new Map()).set(a, { m2: a, priceUk: Number(f.거래금액_억) || null, floor: f.층 });
    });
    const out = {};
    Object.keys(m).forEach((nm) => { out[nm] = [...m[nm].values()].sort((x, y) => x.m2 - y.m2); });
    return out;
  })();
  const areaOptsFor = (name) => (Array.isArray(dbAreas[name]) && dbAreas[name].length ? dbAreas[name] : (areaMap[name] || []));
  const m2ToPyeong = (m2) => Math.round(Number(m2) / 3.3058 / 0.74);
  const myPyeongPrice = () => {
    const area = myProp?.name ? (areaOptsFor(myProp.name) || []).find((a) => String(a.m2) === String(myProp?.pyeong)) : null;
    const tradeN = area && area.n != null ? area.n : null;
    const perUk = area ? (area.priceUk ?? area.maxUk ?? null) : null;
    const sparse = tradeN == null || tradeN < 3;
    if (userAvm != null) return { uk: userAvm, source: "user", tradeN, locked: false };
    if (!sparse && perUk != null) return { uk: perUk, source: "pyeong", tradeN, locked: false };
    return { uk: null, source: null, tradeN, locked: true };
  };
  const ALL_DONGS = [
    "정자동", "야탑동", "구미동", "서현동", "이매동", "수내동", "금곡동", "분당동", "삼평동", "판교동", "백현동", "운중동", "대장동",
    "동천동", "상현동", "성복동", "신봉동", "죽전동", "풍덕천동", "망포동", "매탄동", "신동", "영통동", "원천동", "이의동", "하동",
    "역삼동", "개포동", "청담동", "삼성동", "대치동", "신사동", "논현동", "압구정동", "세곡동", "자곡동", "율현동", "일원동", "수서동", "도곡동",
    "서초동", "잠원동", "반포동", "방배동", "양재동", "우면동", "내곡동", "신원동",
  ];
  const dongOf = (name) => {
    if (dongMap[name]) return dongMap[name];
    const row = (rank?.ranking || []).find((r) => r.단지명 === name);
    return row?.법정동 || row?.법정동명 || brief?.region || null;
  };
  const myDong = myProp?.name ? dongOf(myProp.name) : (brief?.region || null);

  // ── 설정 세터(localStorage 키 불변) ──
  const changeBudget = (v) => { setBudget(v); try { localStorage.setItem("onehub_re_budget", v); } catch (e) {} };
  const changeJeonse = (v) => { setJeonseRate(v); try { localStorage.setItem("onehub_re_jeonse", v); } catch (e) {} };
  const changeScope = (s) => { setMoveScope(s); try { localStorage.setItem("onehub_re_scope", s); } catch (e) {} };
  const pickGapC = (v) => { setGapCTarget(v); try { localStorage.setItem("onehub_re_gapc_dong", v); } catch (e) {} };
  const toggleGapCAlert = () => { setGapCAlert((a) => { const n = !a; try { localStorage.setItem("onehub_re_gapc_alert", n ? "1" : "0"); } catch (e) {} return n; }); };

  // ── fetch: briefing/ranking/macro/feed + complexDongs + 로컬 설정 ──
  useEffect(() => {
    const g = (fn) => fetch(`/api/pwa/re/${fn}`).then((r) => r.json());
    Promise.all([g("briefing"), g("ranking"), g("macro"), g("feed")])
      .then(([b, r, m, f]) => { setBrief(b); setRank(r); setMacro(m); setFeed(f); })
      .catch(() => {});
    g("complexDongs").then((d) => {
      const map = d?.map || (Array.isArray(d?.items) ? Object.fromEntries(d.items.map((x) => [x.단지명, x.법정동])) : null);
      if (map && typeof map === "object") setDongMap(map);
    }).catch(() => {});
    try {
      const bg = localStorage.getItem("onehub_re_budget"); if (bg != null) setBudget(bg);
      const jr = localStorage.getItem("onehub_re_jeonse"); if (jr != null) setJeonseRate(jr);
      const sc = localStorage.getItem("onehub_re_scope"); if (sc) setMoveScope(sc);
      const ua = localStorage.getItem("onehub_re_my_avm"); if (ua != null && ua !== "" && Number(ua) > 0) setUserAvm(Number(ua));
    } catch (e) {}
  }, []);
  useEffect(() => { try { setGapCTarget(localStorage.getItem("onehub_re_gapc_dong") || ""); setGapCAlert(localStorage.getItem("onehub_re_gapc_alert") === "1"); } catch (e) {} }, []);

  // ── 선택/보유 단지 평형(complex-areas) 로딩 ──
  useEffect(() => {
    const names = [myProp?.name].filter(Boolean);
    names.forEach((nm) => {
      if (!nm || dbAreas[nm] !== undefined) return;
      setDbAreas((m) => ({ ...m, [nm]: null }));
      fetch(`/api/pwa/re/complexAreas?complex=${encodeURIComponent(nm)}`)
        .then((r) => r.json())
        .then((d) => {
          const areas = Array.isArray(d?.areas) ? d.areas.map((a) => ({
            m2: Math.round(Number(a.m2 ?? a.전용면적)),
            priceUk: a.rep_price_uk != null ? Number(a.rep_price_uk) : (a.rep_price_manwon != null ? Number(a.rep_price_manwon) / 10000 : null),
            maxUk: a.max_price_uk != null ? Number(a.max_price_uk) : (a.max_price_manwon != null ? Number(a.max_price_manwon) / 10000 : null),
            n: a.n ?? null,
          })).filter((a) => a.m2 > 0) : null;
          setDbAreas((m) => ({ ...m, [nm]: areas && areas.length ? areas : null }));
          if (d?.법정동) setDongMap((m) => (m[nm] ? m : { ...m, [nm]: d.법정동 }));
        })
        .catch(() => setDbAreas((m) => ({ ...m, [nm]: null })));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myProp?.name]);
  // 같은 단지 평형 갈아타기 갭(gap-tracker)
  useEffect(() => {
    const nm = myProp?.name, fa = Number(myProp?.pyeong), ta = Number(gapTarget);
    if (!(nm && fa > 0 && ta > 0) || fa === ta) { setGapData(null); return; }
    let alive = true; setGapLoading(true);
    fetch(`/api/pwa/re/gapTracker?complex=${encodeURIComponent(nm)}&from_area=${fa}&to_area=${ta}`)
      .then((r) => r.json())
      .then((d) => { if (alive) { setGapData(d && !d.error ? d : null); setGapLoading(false); } })
      .catch(() => { if (alive) { setGapData(null); setGapLoading(false); } });
    return () => { alive = false; };
  }, [myProp?.name, myProp?.pyeong, gapTarget]);
  // 같은 동 단지 갈아타기(upgrade-gap)
  useEffect(() => {
    const nm = myProp?.name, ar = Number(myProp?.pyeong);
    if (moveScope !== "dong" || !(nm && ar > 0)) { setGapBData(null); return; }
    const dg = myProp?.name ? dongOf(myProp.name) : null;
    let alive = true;
    fetch(`/api/pwa/re/upgradeGap?from_complex=${encodeURIComponent(nm)}${dg ? `&dong=${encodeURIComponent(dg)}` : ""}&area=${ar}`)
      .then((r) => r.json())
      .then((d) => { if (alive) setGapBData(d && !d.error ? d : null); })
      .catch(() => { if (alive) setGapBData(null); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moveScope, myProp?.name, myProp?.pyeong]);
  // 지역 변경(region-gap)
  useEffect(() => {
    const fd = myProp?.name ? dongOf(myProp.name) : null;
    const ar = Number(myProp?.pyeong) || 84;
    if (moveScope !== "region" || !fd || !gapCTarget || fd === gapCTarget) { setGapCData(null); return; }
    let alive = true;
    fetch(`/api/pwa/re/regionGap?from_dong=${encodeURIComponent(fd)}&to_dong=${encodeURIComponent(gapCTarget)}&area=${ar}`)
      .then((r) => r.json())
      .then((d) => { if (alive) setGapCData(d && d.ok ? d : null); })
      .catch(() => { if (alive) setGapCData(null); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moveScope, myProp?.name, myProp?.pyeong, gapCTarget]);

  const mac = macro?.latest;

  return (
    <>
      {/* [S5+] 갈아타기·투자 스크리너 — 이동 범위(같은 단지/같은 동/지역 변경)별 최적화 */}
      {rank?.ranking?.length > 0 && (() => {
        const opts = dedupBy(rank.ranking, (c) => c.단지ID || c.단지명);
        const myRow = myProp?.name ? opts.find((o) => o.단지명 === myProp.name) : null;
        const myAvm = myRow ? Number(myRow.avm_total_uk || 0) : null;
        const needMy = (moveScope === "complex" || moveScope === "dong") && !myProp?.name;
        const SCOPES = [
          ["complex", "같은 단지", "평형 갈아타기"],
          ["dong", "같은 동", myDong ? `${myDong} 내 이동` : "동 내 이동"],
          ["region", "지역 변경", "타 지역·투자"],
        ];
        const gapCell = (v) => (v == null ? "-" : v > 0 ? `+${uk(v)}` : v < 0 ? `−${uk(-v)}` : "동일");
        return (
          <section className="card scr-card">
            <div className="label">🔎 갈아타기·투자 스크리너 <span className="sub">이동 범위별</span></div>
            <div className="scope-chips">
              {SCOPES.map(([k, l, d]) => (
                <button key={k} className={`scope-chip ${moveScope === k ? "on" : ""}`} onClick={() => changeScope(k)}>
                  <b>{l}</b><span>{d}</span>
                </button>
              ))}
            </div>

            {needMy ? (
              <div className="gap-empty">이 범위는 <b>내 단지</b> 기준으로 계산됩니다. 먼저 내 단지를 등록하세요.
                <button className="scr-reg" onClick={onRegister}>내 단지 등록 →</button>
              </div>
            ) : moveScope === "complex" ? (() => {
              const areas = [...areaOptsFor(myProp?.name)].sort((a, b) => a.m2 - b.m2);
              const pOf = (a) => a?.maxUk ?? a?.priceUk ?? null;
              const myArea = areas.find((a) => String(a.m2) === String(myProp?.pyeong));
              const myPrice = pOf(myArea) ?? myAvm ?? null;
              if (!areas.length) return <div className="gap-empty"><b>{myProp?.name}</b>의 평형별 실거래가 아직 부족합니다(최근 거래 축적 시 표시). ‘같은 동·지역 변경’을 이용해 보세요.</div>;
              let runMax = -Infinity;
              return (
                <>
                  <div className="scr-head"><span>평형(전용)</span><span>실거래 최고 · 대표</span><span>갈아타기 자금</span></div>
                  {areas.map((a) => {
                    const price = pOf(a);
                    const diff = myPrice != null && price != null ? price - myPrice : null;
                    const mine = String(a.m2) === String(myProp?.pyeong);
                    const anomaly = price != null && runMax !== -Infinity && price < runMax;
                    if (price != null && price > runMax) runMax = price;
                    const thin = a.n != null && a.n < 3;
                    const goGap = () => {
                      if (mine) return;
                      setGapTarget(String(a.m2));
                      try { document.querySelector(".gap5")?.scrollIntoView({ behavior: "smooth", block: "center" }); } catch (e) {}
                    };
                    return (
                      <div className={`scr-row ${!mine ? "clickable" : ""}`} key={a.m2} onClick={goGap} role={!mine ? "button" : undefined} tabIndex={!mine ? 0 : undefined}>
                        <span className="scr-name">전용 {a.m2}㎡ <span className="scr-py">약 {m2ToPyeong(a.m2)}평</span>{mine && <span className="scr-mine">내 평형</span>}{anomaly && <span className="scr-anom" title={`평형이 큰데 실거래 최고가가 더 낮습니다. ${a.n != null ? `이 평형 거래 ${a.n}건으로 표본이 적어` : "표본이 적어"} 생기는 이상치일 수 있습니다.`}>⚠ {a.n != null ? `거래 ${a.n}건` : "표본 적음"}</span>}</span>
                        <span className="scr-avm">{a.maxUk != null ? uk(a.maxUk) : (a.priceUk != null ? uk(a.priceUk) : "-")}{a.maxUk != null && a.priceUk != null && a.priceUk !== a.maxUk ? <span className="scr-rep"> · 대표 {uk(a.priceUk)}</span> : null}{a.n != null && !anomaly ? <span className="scr-n">{thin ? " · " : " · "}거래 {a.n}건</span> : null}</span>
                        <span className={`scr-gap ${diff != null && diff <= 0 ? "ok" : ""}`}>{mine ? "—" : <>{gapCell(diff)}<span className="scr-go">갭 분석 →</span></>}</span>
                      </div>
                    );
                  })}
                  <div className="gap5">
                    <div className="gap5-h">📊 갈아타기 갭 분석 <span>내 평형 → 목표 평형(3년 시계열)</span></div>
                    <select className="gap5-sel" value={gapTarget} onChange={(e) => setGapTarget(e.target.value)}>
                      <option value="">목표 평형 선택…</option>
                      {areas.filter((a) => String(a.m2) !== String(myProp?.pyeong)).map((a) => (
                        <option key={a.m2} value={a.m2}>전용 {a.m2}㎡ (약 {m2ToPyeong(a.m2)}평)</option>
                      ))}
                    </select>
                    {gapLoading && <div className="gap5-load">갭 시계열 분석 중…</div>}
                    {gapData && (() => {
                      const v = gapData.verdict;
                      const vc = v === "추천" ? "ok" : v === "보류" ? "no" : v === "관망" ? "mid" : "na";
                      const ic = v === "추천" ? "🟢" : v === "보류" ? "🔴" : v === "관망" ? "🟡" : "⚪";
                      return (
                        <div className="gap5-body">
                          <div className={`gap5-verdict ${vc}`}>{ic} {v}</div>
                          <div className="gap5-reason">{gapData.verdict_reason}</div>
                          <div className="gap5-rows">
                            <div className="g5r"><span>현재 갭</span><b>{gapData.current_gap_uk}억</b></div>
                            {gapData.band && <div className="g5r"><span>적정 밴드(평균±1σ)</span><b>{gapData.band.low_uk}~{gapData.band.high_uk}억</b></div>}
                            <div className="g5r"><span>표본</span><b>{gapData.deal_n}건 · {gapData.history?.length}개월</b></div>
                          </div>
                          {gapData.history?.length > 1 && (() => {
                            const gs = gapData.history.map((h) => h.gap_uk);
                            const lo = Math.min(...gs, gapData.band?.low_uk ?? Infinity), hi = Math.max(...gs, gapData.band?.high_uk ?? -Infinity);
                            const rng = hi - lo || 1, W = 260, H = 44;
                            const pts = gapData.history.map((h, i) => `${(i / (gapData.history.length - 1)) * W},${H - ((h.gap_uk - lo) / rng) * H}`).join(" ");
                            const bandTop = gapData.band ? H - ((gapData.band.high_uk - lo) / rng) * H : null;
                            const bandBot = gapData.band ? H - ((gapData.band.low_uk - lo) / rng) * H : null;
                            return (
                              <svg className="gap5-spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
                                {bandTop != null && <rect x="0" y={bandTop} width={W} height={Math.max(1, bandBot - bandTop)} fill="var(--color-primary)" opacity="0.12" />}
                                <polyline points={pts} fill="none" stroke="var(--color-primary)" strokeWidth="1.5" />
                              </svg>
                            );
                          })()}
                          <div className="gap5-foot">⚠ {gapData.tax_note} · {gapData.disclaimer}</div>
                        </div>
                      );
                    })()}
                  </div>
                  <div className="note"><b>{myProp?.name}</b> 평형별 <b>실거래 최고가</b> 기준(대표=최근 중앙값 병기). 갈아타기 자금 = 목표 평형 − 내 평형. ⚠ 큰 평형인데 최고가가 더 낮다면 대개 <b>그 평형의 거래 건수가 적어서</b>입니다(옆의 ‘거래 N건’ 확인) — 이상 신호가 아니라 표본 부족입니다. 층·향·수리에 따라 실제가는 다릅니다(확정 아님).</div>
                </>
              );
            })() : moveScope === "dong" ? (() => {
              const cands = opts.filter((o) => o.단지명 !== myProp?.name && dongOf(o.단지명) === myDong)
                .map((o) => ({ ...o, need: myAvm != null ? Number(o.avm_total_uk || 0) - myAvm : null }))
                .sort((a, b) => (b.one_score ?? 0) - (a.one_score ?? 0)).slice(0, 8);
              if (!cands.length) return <div className="gap-empty">{myDong ? <><b>{myDong}</b> 내 다른 단지 데이터가 부족합니다.</> : "동 정보를 불러오지 못했습니다."} ‘지역 변경’을 이용해 보세요.</div>;
              return (
                <>
                  <div className="scr-head"><span>단지</span><span>매매(추정)</span><span>갈아타기 자금</span></div>
                  {cands.map((o, i) => (
                    <div className="scr-row" key={`${o.단지ID || o.단지명}-${i}`}>
                      <span className="scr-name">{o.단지명} <span className={`vtag ${vtag(o.valuation)}`}>{o.valuation}</span></span>
                      <span className="scr-avm">{uk(o.avm_total_uk)}</span>
                      <span className={`scr-gap ${o.need != null && o.need <= 0 ? "ok" : ""}`}>{gapCell(o.need)}</span>
                    </div>
                  ))}
                  {gapBData?.candidates?.length > 0 && (
                    <div className="gap5">
                      <div className="gap5-h">📊 같은 동 갈아타기 갭 분석 <span>갭 저점 순 Top {gapBData.candidates.length}</span></div>
                      {gapBData.candidates.map((c) => {
                        const v = c.verdict;
                        const vc = v === "추천" ? "ok" : v === "보류" ? "no" : v === "관망" ? "mid" : "na";
                        const ic = v === "추천" ? "🟢" : v === "보류" ? "🔴" : v === "관망" ? "🟡" : "⚪";
                        return (
                          <div className="gapb-cand" key={c.complex}>
                            <div className="gapb-top"><b className="gapb-nm">{c.complex}</b><span className={`gap5-verdict ${vc} gapb-v`}>{ic} {v}</span></div>
                            <div className="gap5-reason">{c.verdict_reason}</div>
                            {c.band && (
                              <div className="gap5-rows">
                                <div className="g5r"><span>현재 격차</span><b>{c.current_gap_uk}억</b></div>
                                <div className="g5r"><span>적정 밴드(평균±1σ)</span><b>{c.band.low_uk}~{c.band.high_uk}억</b></div>
                                <div className="g5r"><span>표본</span><b>{c.deal_n}건</b></div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                      <div className="gap5-foot">⚠ {gapBData.tax_note} · {gapBData.disclaimer}</div>
                    </div>
                  )}
                  <div className="note">{myDong ? <><b>{myDong}</b> 내 이동 기준. </> : null}갈아타기 자금 = 목표 매매(<Term term="AI 추정 시세">AI 추정 시세</Term>) − 내 단지 매매. 회귀 근사 · <Term term="시차">시차 없음(동시 반영)</Term> · 확정 아님.</div>
                </>
              );
            })() : (() => {
              const jr = Math.max(0, Math.min(100, Number(jeonseRate) || 0)) / 100;
              const bg = Number(budget) || 0;
              const scored = opts.map((o) => ({ ...o, gapInvest: Number(o.avm_total_uk || 0) * (1 - jr) })).filter((o) => o.gapInvest > 0);
              const matched = (bg > 0 ? scored.filter((o) => o.gapInvest <= bg) : scored).sort((a, b) => (b.one_score ?? 0) - (a.one_score ?? 0)).slice(0, 6);
              return (
                <>
                  <div className="scr-inputs">
                    <label className="scr-in"><span>예산(억)</span><input type="number" inputMode="decimal" placeholder="예: 3" value={budget} onChange={(e) => changeBudget(e.target.value)} /></label>
                    <label className="scr-in"><span>전세가율(%)</span><input type="number" inputMode="numeric" placeholder="60" value={jeonseRate} onChange={(e) => changeJeonse(e.target.value)} /></label>
                  </div>
                  {matched.length > 0 ? (
                    <>
                      <div className="scr-head"><span>단지</span><span>매매(추정)</span><span>갭투자금</span></div>
                      {matched.map((o, i) => (
                        <div className="scr-row" key={`${o.단지ID || o.단지명}-${i}`}>
                          <span className="scr-name">{o.단지명} <span className={`vtag ${vtag(o.valuation)}`}>{o.valuation}</span></span>
                          <span className="scr-avm">{uk(o.avm_total_uk)}</span>
                          <span className={`scr-gap ${bg > 0 && o.gapInvest <= bg ? "ok" : ""}`}>{uk(o.gapInvest)}</span>
                        </div>
                      ))}
                      <div className="note">갭투자금 = 매매(<Term term="AI 추정 시세">AI 추정 시세</Term>) × (1 − 전세가율{Math.round(jr * 100)}%). 전세가율은 <b>사용자 가정치</b>(상대가치·추정·확정 아님).</div>
                    </>
                  ) : (
                    <div className="gap-empty">예산 범위에 맞는 단지가 없습니다. 예산·전세가율을 조정해 보세요.</div>
                  )}
                  {!myProp?.name ? (
                    <div className="gap-empty" style={{ marginTop: 12 }}>목표 지역 갭 추적은 <b>내 단지</b> 등록 후 이용할 수 있습니다. <button className="scr-reg" onClick={onRegister}>내 단지 등록 →</button></div>
                  ) : (() => {
                    const myDongC = dongOf(myProp.name);
                    const fromMap = Object.values(dongMap || {}).filter(Boolean);
                    const dongs = [...new Set([...fromMap, ...ALL_DONGS])].filter((d) => d && d !== myDongC).sort();
                    return (
                      <div className="gap5">
                        <div className="gap5-h">🎯 목표 지역 갭 추적 <span>{myDongC || "내 동"} → 목표 동 · 전용 {myProp?.pyeong || 84}㎡</span></div>
                        <select className="gap5-sel" value={gapCTarget} onChange={(e) => pickGapC(e.target.value)}>
                          <option value="">목표 지역(동) 선택…</option>
                          {dongs.map((d) => <option key={d} value={d}>{d}</option>)}
                        </select>
                        {gapCData && (() => {
                          const v = gapCData.verdict;
                          const vc = v === "추천" ? "ok" : v === "보류" ? "no" : v === "관망" ? "mid" : "na";
                          const ic = v === "추천" ? "🟢" : v === "보류" ? "🔴" : v === "관망" ? "🟡" : "⚪";
                          return (
                            <div className="gap5-body">
                              <div className={`gap5-verdict ${vc}`}>{ic} {v}</div>
                              <div className="gap5-reason">{gapCData.verdict_reason}</div>
                              <div className="gap5-rows">
                                <div className="g5r"><span>추가 자금(동일 평형)</span><b>{gapCData.current_gap_uk}억</b></div>
                                {gapCData.band && <div className="g5r"><span>적정 밴드(평균±1σ)</span><b>{gapCData.band.low_uk}~{gapCData.band.high_uk}억</b></div>}
                                <div className="g5r"><span>표본</span><b>{gapCData.deal_n}건 · {gapCData.history?.length}개월</b></div>
                              </div>
                              {(() => {
                                const sp = myPyeongPrice();
                                const buyUk = Number(myProp?.buyUk || 0) || null;
                                const gap = gapCData.current_gap_uk;
                                const won = (u) => u == null ? "-" : `${u >= 0 ? "" : "-"}${Math.abs(u).toFixed(2)}억`;
                                if (sp.locked || sp.uk == null) {
                                  return <div className="mv-locked">🔒 내 평형(전용 {myProp?.pyeong}㎡) 실거래가 부족해 <b>팔 값</b>을 확정할 수 없어 갈아타기 금액을 계산하지 않습니다. 내 단지 카드에서 <b>내 시세 직접 입력</b> 후 이용하세요.</div>;
                                }
                                const sellUk = sp.uk;
                                const buyTargetUk = gap != null ? Math.round((sellUk + gap) * 100) / 100 : null;
                                const lossUk = buyUk != null ? Math.round((sellUk - buyUk) * 100) / 100 : null;
                                const acqTax = buyTargetUk == null ? null : (() => {
                                  const p = buyTargetUk; let r;
                                  if (p <= 6) r = 0.01; else if (p <= 9) r = Math.min(0.03, Math.max(0.01, (p * 2 / 3 - 3) / 100)); else r = 0.03;
                                  return Math.round(p * r * 100) / 100;
                                })();
                                const isLoss = lossUk != null && lossUk < 0;
                                const cgt = lossUk == null ? null : isLoss ? { v: 0, txt: "손실이라 양도세 없음(이월결손 가능)" } : { v: null, txt: "양도차익 발생 — 보유기간·주택수에 따라 달라 세무사 상담 필요" };
                                const netUk = (buyTargetUk != null && acqTax != null) ? Math.round((sellUk - buyTargetUk - acqTax - (cgt?.v || 0)) * 100) / 100 : null;
                                return (
                                  <div className="movecalc">
                                    <div className="mv-h">🎯 갈아타기 정밀 계산 <span className="mv-src">팔 값: {sp.source === "user" ? "직접 입력" : `전용 ${myProp?.pyeong}㎡ 실거래 ${sp.tradeN}건`}</span></div>
                                    <div className="mv-row"><span>내 단지 팔 값</span><b>{won(sellUk)}</b></div>
                                    <div className="mv-row"><span>목표 지역 살 값 <em>동 평균·동일 평형</em></span><b>{won(buyTargetUk)}</b></div>
                                    <div className="mv-row hl"><span>갭(추가 자금)</span><b>{gap != null ? (gap >= 0 ? `+${won(gap)}` : won(gap)) : "-"}</b></div>
                                    {buyUk != null && (
                                      <div className={`mv-row ${isLoss ? "neg" : "pos"}`}><span>내 매수가({won(buyUk)}) 대비 {isLoss ? "손실 확정액" : "평가 이익"}</span><b>{lossUk >= 0 ? "+" : ""}{won(lossUk)}</b></div>
                                    )}
                                    <div className="mv-row"><span>취득세 <em>주택 개략</em></span><b>{acqTax != null ? won(acqTax) : "-"}</b></div>
                                    <div className="mv-row"><span>양도세</span><b>{cgt == null ? "-" : cgt.v === 0 ? "0원" : "상담 필요"}</b></div>
                                    {cgt && <div className="mv-note-s">※ {cgt.txt}</div>}
                                    <div className={`mv-net ${netUk == null ? "" : netUk >= 0 ? "pos" : "neg"}`}>
                                      <span>순 이동액{cgt && cgt.v == null ? " (양도세 미반영)" : ""}</span>
                                      <b>{netUk == null ? "-" : netUk >= 0 ? `+${won(netUk)} 손에 남음` : `${won(netUk)} 더 필요`}</b>
                                    </div>
                                    <div className="mv-disc">계산기입니다 · <b>세무 자문이 아닙니다</b>. 취득세=주택 표준세율 개략(지방교육세·농특세 별도), 중개보수 미반영. 최종은 세무사·중개사 확인.</div>
                                  </div>
                                );
                              })()}
                              {(() => {
                                const myRow2 = rank?.ranking ? dedupBy(rank.ranking, (c) => c.단지ID || c.단지명).find((o) => o.단지명 === myProp?.name) : null;
                                const myVal = myRow2?.valuation || null; const myScore = myRow2?.one_score;
                                const v = gapCData.verdict;
                                const moveTxt = v === "추천" ? "지금 진입 유리(밴드 하단)" : v === "보류" ? "지금은 비쌈(밴드 상단)" : v === "관망" ? "통상 범위" : "표본 부족 — 판단 보류";
                                return (
                                  <div className="holdmove">
                                    <div className="hm-h">🤔 그래도 옮기나 — 유지 vs 이동</div>
                                    <div className="hm-cols">
                                      <div className="hm-col"><span className="hm-k">내 단지 유지</span><span className="hm-v">{myVal || "상대가치 정보 없음"}{myScore != null ? ` · ONE ${myScore}` : ""}</span></div>
                                      <div className="hm-col"><span className="hm-k">목표 지역 이동</span><span className="hm-v">{moveTxt}</span></div>
                                    </div>
                                    <div className="hm-disc">※ 미래 가격 예측이 아니라 <b>현재 상대가치</b> 비교입니다(동시 반영·lag 0). 최종 판단은 본인이 하세요.</div>
                                  </div>
                                );
                              })()}
                              <button className={`gapc-alert ${gapCAlert ? "on" : ""}`} onClick={toggleGapCAlert}>{gapCAlert ? "🔔 갭 알림 설정됨 — 밴드 하단 이탈 시 알림" : "🔕 갭 알림 설정하기"}</button>
                              <div className="gap5-foot">⚠ {gapCData.tax_note} · {gapCData.disclaimer} · 알림은 앱 재방문 시 갱신(서버 푸시는 🔜 향후 업데이트).</div>
                            </div>
                          );
                        })()}
                      </div>
                    );
                  })()}
                </>
              );
            })()}
          </section>
        );
      })()}

      {/* 2) ONE Score 랭킹 */}
      {rank?.ranking?.length > 0 && (
        <section className="card">
          <div className="label">🏆 <Term term="ONE Score">ONE Score</Term> 랭킹 <span className="sub">단지별 종합점수</span></div>
          {(() => {
            const seen = new Set();
            const ranking = [...rank.ranking]
              .sort((a, b) => (b.one_score ?? 0) - (a.one_score ?? 0))
              .filter((c) => { if (seen.has(c.단지명)) return false; seen.add(c.단지명); return true; });
            const underMap = new Map((brief?.under || []).map((u) => [u.단지명, u]));
            const feedMap = new Map();
            (feed?.feed || []).forEach((f) => { if (!feedMap.has(f.단지명)) feedMap.set(f.단지명, f); });
            return ranking.map((c, i) => {
              const fd = feedMap.get(c.단지명);
              const ud = underMap.get(c.단지명);
              const bits = [];
              if (fd?.거래일 && fd?.변동률 != null) bits.push(`${String(fd.거래일).slice(5)} ${fd.변동률 > 0 ? "+" : ""}${fd.변동률}%`);
              if (ud?.gap != null) bits.push(`회귀 대비 +${Number(ud.gap).toFixed(1)}%`);
              return (
              <div className="rrow" key={`${c.단지명}-${i}`}>
                <span className="rk">{i + 1}</span>
                <span className="rmid">
                  <span className="rname">{c.단지명} <span className={`vtag ${vtag(c.valuation)}`}>{c.valuation}</span></span>
                  <span className="rsub">{uk(c.avm_total_uk)}{bits.length > 0 && <span className="rreason"> · {bits.join(" · ")}</span>}</span>
                </span>
                <span className="rright">
                  <span className="rscore">{c.one_score}</span>
                  <span className={`jtag ${jtag(c.decision)}`}>{c.decision}</span>
                </span>
              </div>
              );
            });
          })()}
          <div className="note">⟳ {rank.ranking[0]?.updated} 기준 · <Term term="AI 추정 시세">AI 추정 시세</Term>는 실거래·흐름으로 자동 추정한 <b>참고값</b>(확정 아님)입니다. <Term term="ONE Score">단지 종합점수</Term>는 구성요소를 펼쳐 볼 수 있어요.</div>
        </section>
      )}

      {/* 4) 거시 환경 */}
      {mac && (
        <section className="card">
          <div className="label">🌐 거시 환경 <span className="sub">기준 {mac.연월}</span></div>
          <div className="chips">
            <span className="chip">KOSPI <b>{Math.round(mac.kospi).toLocaleString()}</b></span>
            <span className="chip">기준금리 <b>{mac.base_rate}%</b></span>
            <span className="chip"><Term term="정책 점수">정책</Term> <b>{mac.policy_stance}</b></span>
          </div>
          {(() => {
            const baseRate = Number(mac.base_rate);
            const stance = String(mac.policy_stance ?? "");
            let rateBias = 0, rateTxt = `기준금리 ${mac.base_rate}% · 중립 구간`;
            if (baseRate >= 3.25) { rateBias = -1; rateTxt = `기준금리 ${mac.base_rate}% — 이자 부담이 커 매수여력을 누르는 하방 압력`; }
            else if (baseRate > 0 && baseRate <= 2.5) { rateBias = 1; rateTxt = `기준금리 ${mac.base_rate}% — 이자 부담이 낮아 매수여력에 우호적(상방 여지)`; }
            else if (baseRate > 0) { rateTxt = `기준금리 ${mac.base_rate}% — 중립 구간(뚜렷한 방향성 약함)`; }
            let polBias = 0, polTxt = `정책 '${stance || "정보 없음"}' — 방향성 약함(중립)`;
            if (/완화|부양|지원|공급확대|규제완화/.test(stance)) { polBias = 1; polTxt = `정책 '${stance}' — 완화·부양 기조로 수요에 우호적`; }
            else if (/긴축|규제|억제|강화|대출제한/.test(stance)) { polBias = -1; polTxt = `정책 '${stance}' — 긴축·규제 기조로 수요를 누르는 방향`; }
            const net = rateBias + polBias;
            const dir = net >= 1 ? { t: "상방 우세", ic: "🟢", c: "up" } : net <= -1 ? { t: "하방 우세", ic: "🔴", c: "dn" } : { t: "중립·혼조", ic: "🟡", c: "mid" };
            const nowK = new Date(Date.now() + 9 * 3600 * 1000);
            const ymParts = String(mac.연월 || "").split(/[-.\/]/).map((x) => Number(x));
            const elapsed = (ymParts.length >= 2 && ymParts[0] > 1900 && ymParts[1] >= 1)
              ? (nowK.getUTCFullYear() * 12 + nowK.getUTCMonth()) - (ymParts[0] * 12 + (ymParts[1] - 1)) : null;
            const freshTxt = elapsed == null ? `기준 ${mac.연월}` : elapsed <= 0 ? `이번 달(${mac.연월}) 기준` : `${mac.연월} 기준 · ${elapsed}개월 전 데이터`;
            const series = macro?.series || [];
            let frozenMonths = 0;
            for (let i = series.length - 1; i >= 0 && series[i]?.kospi === mac.kospi; i--) frozenMonths++;
            const looksFrozen = frozenMonths >= 3;
            return (
              <div className="macro-read">
                <div className="mr-top">
                  <span className="mr-lbl">🧭 규칙 기반 방향성</span>
                  <span className={`mr-dir ${dir.c}`}>{dir.ic} 부동산 {dir.t}</span>
                </div>
                <div className="mr-row"><span className="mr-k">금리</span><span className="mr-v">{rateTxt}</span></div>
                <div className="mr-row"><span className="mr-k">정책</span><span className="mr-v">{polTxt}</span></div>
                <div className={`mr-fresh ${elapsed != null && elapsed >= 2 ? "stale" : ""}`}>📅 {freshTxt}{elapsed != null && elapsed >= 2 ? " — 월 단위로 갱신되며 실시간 시세와 차이가 있을 수 있습니다." : ""}</div>
                {looksFrozen && (
                  <div className="mr-fresh stale">⚠️ KOSPI 값이 최근 {frozenMonths}개월째 동일합니다 — 실시간 자동수집이 아직 연결되지 않아 근사치가 반복 적재되고 있습니다(실제 시세와 다를 수 있음).</div>
                )}
                <div className="mr-disc">※ 금리·정책을 <b>규칙으로 해석한 방향성</b>일 뿐 <b>가격 예측이 아닙니다</b>. 실제 가격은 단지·수급에 따라 다릅니다.</div>
              </div>
            );
          })()}
          <div className="note">{mac.kospi_src || "연말 종가 기준입니다(월별 정밀치는 아니에요)."}</div>
        </section>
      )}

      <style jsx>{`
        .card { background: var(--color-card); border: 1px solid var(--color-line); border-radius: var(--radius-card, 14px); padding: 16px; margin-bottom: 12px; box-shadow: var(--shadow-card); }
        .label { font-size: 0.9rem; font-weight: 700; color: var(--color-ink); margin-bottom: 12px; }
        .sub { font-weight: 600; color: var(--color-ink-3); font-size: 0.68rem; margin-left: 6px; }
        .note { font-size: 11px; color: var(--color-ink-3); line-height: 1.55; margin-top: 13px; padding-top: 12px; border-top: 1px solid var(--color-line); }
        .note b { color: var(--color-ink-2); font-weight: 700; }
        .gap-empty { margin-top: 12px; font-size: 0.76rem; color: var(--color-ink-2); line-height: 1.6; word-break: keep-all; }
        .gap-empty b { color: var(--color-ink); font-weight: 700; }
        /* 이동 범위 칩 */
        .scope-chips { display: flex; gap: 6px; margin-bottom: 14px; }
        .scope-chip { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 2px; border: 1px solid var(--color-line); background: var(--color-card); border-radius: 12px; padding: 9px 4px; cursor: pointer; font-family: var(--font-sans); }
        .scope-chip b { font-size: 0.8rem; font-weight: 800; color: var(--color-ink-2); }
        .scope-chip span { font-size: 0.6rem; font-weight: 600; color: var(--color-ink-3); white-space: nowrap; }
        .scope-chip.on { background: var(--color-primary); border-color: var(--color-primary); }
        .scope-chip.on b, .scope-chip.on span { color: #fff; }
        .scr-py { font-size: 0.66rem; font-weight: 600; color: var(--color-ink-3); }
        .scr-mine { font-size: 0.58rem; font-weight: 800; background: var(--color-primary-soft); color: var(--color-primary); padding: 1px 6px; border-radius: 5px; }
        .scr-anom { font-size: 0.6rem; font-weight: 800; color: var(--color-warning-ink, var(--color-warning)); background: var(--color-warning-soft); padding: 1px 6px; border-radius: 6px; margin-left: 5px; white-space: nowrap; }
        .scr-rep { font-size: 0.66rem; font-weight: 500; color: var(--color-ink-3); }
        .scr-n { font-size: 0.64rem; font-weight: 600; color: var(--color-ink-3); }
        .scr-reg { display: block; margin-top: 10px; border: none; background: var(--color-primary); color: #fff; border-radius: 10px; padding: 9px 14px; font-size: 0.78rem; font-weight: 800; font-family: var(--font-sans); cursor: pointer; }
        .scr-inputs { display: flex; gap: 8px; margin-bottom: 12px; }
        .scr-in { flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; gap: 4px; font-size: 0.68rem; color: var(--color-ink-3); font-weight: 700; }
        .scr-in input { width: 100%; min-width: 0; box-sizing: border-box; border: 1px solid var(--color-line); background: var(--color-bg); border-radius: 9px; padding: 9px 10px; font-size: 0.84rem; font-family: var(--font-sans); color: var(--color-ink); }
        .scr-in input:focus { outline: none; border-color: var(--color-primary); }
        .scr-head { display: grid; grid-template-columns: 1fr auto auto; gap: 10px; font-size: 0.64rem; color: var(--color-ink-3); font-weight: 700; padding-bottom: 6px; border-bottom: 1px solid var(--color-line); }
        .scr-head span:nth-child(2), .scr-head span:nth-child(3) { text-align: right; min-width: 56px; }
        .scr-row { display: grid; grid-template-columns: 1fr auto auto; gap: 10px; align-items: center; padding: 10px 0; border-bottom: 1px solid var(--color-line); }
        .scr-name { font-size: 0.82rem; font-weight: 700; color: var(--color-ink); display: flex; align-items: center; gap: 6px; min-width: 0; }
        .scr-avm { font-size: 0.8rem; font-weight: 700; color: var(--color-ink-2); font-family: ui-monospace, monospace; text-align: right; min-width: 56px; }
        .scr-gap { font-size: 0.86rem; font-weight: 800; color: var(--color-ink); font-family: ui-monospace, monospace; text-align: right; min-width: 56px; display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
        .scr-gap.ok { color: var(--color-success); }
        .scr-row.clickable { cursor: pointer; border-radius: 8px; margin: 0 -6px; padding: 10px 6px; transition: background .15s; }
        .scr-row.clickable:hover, .scr-row.clickable:active { background: var(--color-primary-soft, #EAF1FF); }
        .scr-go { font-size: 0.62rem; font-weight: 700; color: var(--color-primary, #2F6BFF); font-family: var(--font-body); }
        /* 랭킹 */
        .rrow { display: grid; grid-template-columns: 22px 1fr auto; align-items: center; gap: 10px; padding: 12px 0; border-top: 1px solid var(--color-line); }
        .rrow:first-of-type { border-top: none; }
        .rk { font-size: 13px; font-weight: 800; color: var(--color-ink-3); text-align: center; }
        .rmid { min-width: 0; }
        .rname { font-size: 14px; font-weight: 700; letter-spacing: -.2px; display: flex; align-items: center; gap: 6px; }
        .vtag { font-size: 10px; font-weight: 800; padding: 2px 7px; border-radius: 6px; flex-shrink: 0; }
        .vtag.fair { background: var(--color-card-soft); color: var(--color-ink-2); }
        .vtag.under { background: var(--color-success-soft); color: var(--color-success-ink); }
        .vtag.over { background: var(--color-danger-soft); color: var(--color-danger); }
        .rsub { font-size: 11.5px; color: var(--color-ink-3); font-weight: 500; margin-top: 3px; }
        .rreason { color: var(--color-ink-2); font-weight: 600; }
        .rright { text-align: right; display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }
        .rscore { font-size: 16px; font-weight: 800; color: var(--color-primary); line-height: 1; }
        .jtag { font-size: 10.5px; font-weight: 800; padding: 3px 9px; border-radius: 7px; }
        .jtag.buy { background: var(--color-primary-soft); color: var(--color-primary); }
        .jtag.watch { background: var(--color-card-soft); color: var(--color-ink-3); }
        /* 거시 chips */
        .chips { display: flex; flex-wrap: wrap; gap: 8px; }
        .chip { font-size: 12px; font-weight: 700; color: var(--color-ink-2); background: var(--color-card-soft); border-radius: 11px; padding: 9px 13px; }
        .chip b { color: var(--color-primary); margin-left: 3px; }
        /* 갭 분석 카드 */
        .gap5 { margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--color-line); }
        .gap5-h { font-size: 13px; font-weight: 800; color: var(--color-ink); }
        .gap5-h span { font-weight: 500; font-size: 11px; color: var(--color-ink-3); margin-left: 6px; }
        .gap5-sel { width: 100%; margin-top: 8px; padding: 9px 11px; border: 1px solid var(--color-line); border-radius: 10px; background: var(--color-bg); color: var(--color-ink); font-size: 13px; font-family: var(--font-sans); }
        .gap5-load { font-size: 12px; color: var(--color-ink-3); margin-top: 8px; }
        .gap5-body { margin-top: 10px; }
        .gap5-verdict { display: inline-block; font-size: 15px; font-weight: 800; padding: 4px 12px; border-radius: 10px; }
        .gap5-verdict.ok { color: var(--color-success); background: var(--color-success-soft); }
        .gap5-verdict.no { color: var(--color-danger); background: var(--color-danger-soft); }
        .gap5-verdict.mid { color: var(--color-warning-ink, var(--color-warning)); background: var(--color-warning-soft); }
        .gap5-verdict.na { color: var(--color-ink-2); background: var(--color-card-soft); }
        .gap5-reason { font-size: 12.5px; color: var(--color-ink-2); line-height: 1.5; margin-top: 7px; word-break: keep-all; }
        .gap5-rows { display: flex; flex-wrap: wrap; gap: 6px 18px; margin-top: 9px; }
        .g5r { font-size: 12px; color: var(--color-ink-3); } .g5r b { color: var(--color-ink); font-weight: 800; margin-left: 5px; }
        .gap5-spark { width: 100%; height: 44px; margin-top: 10px; display: block; }
        .gap5-foot { font-size: 10.5px; color: var(--color-ink-3); margin-top: 9px; line-height: 1.5; word-break: keep-all; }
        /* 갈아타기 정밀 계산 */
        .movecalc { margin-top: 12px; background: var(--color-card); border: 1px solid var(--color-primary); border-radius: 12px; padding: 13px 14px; }
        .mv-h { font-size: 0.86rem; font-weight: 800; color: var(--color-ink); margin-bottom: 9px; display: flex; flex-wrap: wrap; gap: 6px; align-items: baseline; }
        .mv-src { font-size: 0.62rem; font-weight: 600; color: var(--color-ink-3); }
        .mv-row { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; padding: 5px 0; font-size: 0.78rem; color: var(--color-ink-2); border-bottom: 1px solid var(--color-line); }
        .mv-row b { font-weight: 800; color: var(--color-ink); font-family: ui-monospace, monospace; white-space: nowrap; }
        .mv-row em { font-style: normal; font-size: 0.6rem; color: var(--color-ink-3); margin-left: 4px; }
        .mv-row.hl b { color: var(--color-primary); }
        .mv-row.neg b { color: var(--color-danger); } .mv-row.pos b { color: var(--color-success); }
        .mv-note-s { font-size: 0.66rem; color: var(--color-ink-3); padding: 5px 0 0; line-height: 1.5; word-break: keep-all; }
        .mv-net { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-top: 10px; padding: 11px 12px; border-radius: 10px; background: var(--color-card-soft); }
        .mv-net span { font-size: 0.76rem; font-weight: 700; color: var(--color-ink-2); }
        .mv-net b { font-size: 1rem; font-weight: 900; font-family: ui-monospace, monospace; }
        .mv-net.pos b { color: var(--color-success); } .mv-net.neg b { color: var(--color-danger); }
        .mv-disc { font-size: 0.64rem; color: var(--color-ink-3); margin-top: 9px; line-height: 1.55; word-break: keep-all; }
        .mv-locked { margin-top: 12px; background: var(--color-warning-soft); border: 1px solid var(--color-warning-ink, var(--color-warning)); border-radius: 12px; padding: 12px 14px; font-size: 0.76rem; color: var(--color-ink-2); line-height: 1.55; word-break: keep-all; }
        /* 유지 vs 이동 */
        .holdmove { margin-top: 12px; background: var(--color-card-soft); border: 1px solid var(--color-line); border-radius: 12px; padding: 12px 14px; }
        .hm-h { font-size: 0.82rem; font-weight: 800; color: var(--color-ink); margin-bottom: 9px; }
        .hm-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        .hm-col { background: var(--color-card); border: 1px solid var(--color-line); border-radius: 9px; padding: 9px 10px; display: flex; flex-direction: column; gap: 4px; }
        .hm-k { font-size: 0.64rem; font-weight: 700; color: var(--color-ink-3); }
        .hm-v { font-size: 0.76rem; font-weight: 700; color: var(--color-ink); word-break: keep-all; }
        .hm-disc { font-size: 0.64rem; color: var(--color-ink-3); margin-top: 9px; line-height: 1.55; word-break: keep-all; }
        /* 같은 동 후보 갭 카드 */
        .gapb-cand { padding: 10px 0; border-top: 1px solid var(--color-line); }
        .gapb-cand:first-of-type { border-top: none; }
        .gapb-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
        .gapb-nm { font-size: 13.5px; font-weight: 800; color: var(--color-ink); }
        .gap5-verdict.gapb-v { font-size: 12px; padding: 2px 9px; }
        .gapc-alert { width: 100%; margin-top: 10px; border: 1px solid var(--color-line); background: var(--color-card); color: var(--color-ink-2); border-radius: 10px; padding: 9px 0; font-size: 12.5px; font-weight: 700; cursor: pointer; font-family: var(--font-sans); }
        .gapc-alert.on { background: var(--color-primary-soft); border-color: var(--color-primary); color: var(--color-primary); }
        /* 거시 해석 */
        .macro-read { margin-top: 11px; background: var(--color-card-soft); border: 1px solid var(--color-line); border-radius: 10px; padding: 11px 13px; }
        .macro-read .mr-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 7px; }
        .macro-read .mr-lbl { font-size: 12px; font-weight: 800; color: var(--color-ink); }
        .macro-read .mr-dir { font-size: 12px; font-weight: 800; padding: 2px 9px; border-radius: 999px; white-space: nowrap; }
        .macro-read .mr-dir.up { color: var(--color-undervalued, var(--color-success)); background: var(--color-undervalued-soft, var(--color-success-soft)); }
        .macro-read .mr-dir.dn { color: var(--color-overvalued, var(--color-danger)); background: var(--color-overvalued-soft, var(--color-danger-soft)); }
        .macro-read .mr-dir.mid { color: var(--color-warning-ink, var(--color-warning)); background: var(--color-warning-soft); }
        .macro-read .mr-row { display: flex; gap: 8px; padding: 3px 0; font-size: 12px; line-height: 1.5; word-break: keep-all; }
        .macro-read .mr-k { flex-shrink: 0; width: 34px; font-weight: 800; color: var(--color-ink-2); }
        .macro-read .mr-v { color: var(--color-ink-2); }
        .macro-read .mr-fresh { margin-top: 7px; font-size: 11px; font-weight: 600; color: var(--color-ink-3); line-height: 1.5; word-break: keep-all; }
        .macro-read .mr-fresh.stale { color: var(--color-warning-ink, var(--color-warning)); }
        .macro-read .mr-disc { margin-top: 6px; font-size: 10.5px; color: var(--color-ink-3); line-height: 1.5; word-break: keep-all; }
      `}</style>
    </>
  );
}
