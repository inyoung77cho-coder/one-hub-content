// ONE-HUB v10 — 부동산 자산 대시보드 (PWA, onehub-realestate 5002 연동)
// ETF 대시보드와 동일 패턴. ONE Score 랭킹/시장 브리핑/저평가/거시. 확정 데이터는 진한색.
import { useEffect, useState } from "react";
import BottomNav from "../../components/BottomNav";
import { dedupBy } from "../../lib/useDedup";
import { ReForm } from "../../components/shared/AssetForms";
import Term from "../../components/Term";

const uk = (n) => (n == null ? "-" : `${Number(n).toFixed(2)}억`);
const pct = (n) => (n == null ? "-" : `${n > 0 ? "+" : ""}${Number(n).toFixed(1)}%`);
// [v10 UI §1] 시맨틱: 저평가=초록(under), 고평가=빨강(over), 적정=회색(fair)
//   매수검토=파랑(buy·주요액션), 관망=회색(watch·중립)
const vtag = (v) => (v?.includes("저평가") ? "under" : v?.includes("고평가") ? "over" : "fair");
const jtag = (d) => (d?.includes("매수") ? "buy" : "watch");

export default function RealEstateDashboard() {
  const [brief, setBrief] = useState(null);
  const [rank, setRank] = useState(null);
  const [macro, setMacro] = useState(null);
  const [feed, setFeed] = useState(null); // [v11 #16] 최근 실거래 피드
  const [err, setErr] = useState(null);
  const [myC, setMyC] = useState("");   // [S5] 내 단지
  const [tgtC, setTgtC] = useState(""); // [S5] 갈아탈 목표 단지
  const [myProp, setMyProp] = useState(null); // [S5] 내 단지 상세(위저드 등록: 평형·동층·매수가·시점)
  const [wizOpen, setWizOpen] = useState(false); // [S5] 등록 위저드 열림
  const [wiz, setWiz] = useState({ name: "", pyeong: "", dongfloor: "", buyUk: "", buyMonth: "" });
  const [budget, setBudget] = useState("");     // [S5] 스크리너 예산(억)
  const [jeonseRate, setJeonseRate] = useState("60"); // [S5] 전세가율(%) 가정
  const [moveScope, setMoveScope] = useState("region"); // [S5+] 이동 범위: complex/dong/region
  const [dbAreas, setDbAreas] = useState({}); // [S5+] 단지→평형(전용면적) 백엔드 로딩(complex-areas)
  const [dongMap, setDongMap] = useState({}); // [S5+] 단지→법정동 백엔드 로딩(complex-dongs)
  const [gapTarget, setGapTarget] = useState(""); // [R-5] 갈아탈 목표 평형(전용㎡)
  const [gapData, setGapData] = useState(null); // [R-5] 갭 분석 결과(gap-tracker)
  const [gapLoading, setGapLoading] = useState(false);
  const [gapBData, setGapBData] = useState(null); // [R-5 시나리오B] 같은 동 단지 갈아타기 갭
  const [gapCTarget, setGapCTarget] = useState(""); // [R-5 시나리오C] 목표 지역(법정동)
  const [gapCData, setGapCData] = useState(null); // [R-5 시나리오C] 지역 변경 갭
  const [gapCAlert, setGapCAlert] = useState(false); // [R-5 시나리오C] 관심 갭 알림 설정(클라)

  useEffect(() => {
    const g = (fn) => fetch(`/api/pwa/re/${fn}`).then((r) => r.json());
    Promise.all([g("briefing"), g("ranking"), g("macro"), g("feed")])
      .then(([b, r, m, f]) => {
        if (b.error) setErr(b.error);
        setBrief(b); setRank(r); setMacro(m); setFeed(f);
      })
      .catch((e) => setErr(e.message));
    // [S5+] 단지→법정동 매핑(같은 동 필터). 미배포 시 조용히 폴백.
    g("complexDongs").then((d) => {
      const map = d?.map || (Array.isArray(d?.items) ? Object.fromEntries(d.items.map((x) => [x.단지명, x.법정동])) : null);
      if (map && typeof map === "object") setDongMap(map);
    }).catch(() => {});
    try {
      setMyC(localStorage.getItem("onehub_re_my") || "");
      setTgtC(localStorage.getItem("onehub_re_target") || "");
      const mp = localStorage.getItem("onehub_re_my_property");
      if (mp) { const o = JSON.parse(mp); setMyProp(o); if (o?.name && !localStorage.getItem("onehub_re_my")) setMyC(o.name); }
      const bg = localStorage.getItem("onehub_re_budget"); if (bg != null) setBudget(bg);
      const jr = localStorage.getItem("onehub_re_jeonse"); if (jr != null) setJeonseRate(jr);
      const sc = localStorage.getItem("onehub_re_scope"); if (sc) setMoveScope(sc);
      const ua = localStorage.getItem("onehub_re_my_avm"); if (ua != null && ua !== "" && Number(ua) > 0) setUserAvm(Number(ua));
    } catch (e) {}
  }, []);
  // [S3] 빠른입력(FAB) 저장 시 내 단지 즉시 재로드
  useEffect(() => {
    const reload = () => {
      try {
        const mp = localStorage.getItem("onehub_re_my_property");
        if (mp) { const o = JSON.parse(mp); setMyProp(o); if (o?.name) setMyC(o.name); }
      } catch (e) {}
    };
    window.addEventListener("onehub-assets-change", reload);
    return () => window.removeEventListener("onehub-assets-change", reload);
  }, []);
  // [S5+] 선택/보유 단지의 실거래 평형(전용면적)을 백엔드에서 로딩(complex-areas). 미배포 시 feed 폴백.
  useEffect(() => {
    const names = [wizOpen ? wiz.name : null, myProp?.name].filter(Boolean);
    names.forEach((nm) => {
      if (!nm || dbAreas[nm] !== undefined) return;
      setDbAreas((m) => ({ ...m, [nm]: null })); // in-flight 마킹(중복 요청 방지)
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
  }, [wizOpen, wiz.name, myProp?.name]);
  // [R-5] 같은 단지 평형 갈아타기 갭 분석 — 내 평형 → 목표 평형 gap-tracker 호출
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
  // [R-5 시나리오B] 같은 동 단지 갈아타기 — 후보 단지별 갭·판정(upgrade-gap)
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
  // [R-5 시나리오C] 지역 변경 — 내 동 vs 목표 동 평균단가 갭·판정(region-gap)
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
  useEffect(() => { try { setGapCTarget(localStorage.getItem("onehub_re_gapc_dong") || ""); setGapCAlert(localStorage.getItem("onehub_re_gapc_alert") === "1"); } catch (e) {} }, []);
  const pickGapC = (v) => { setGapCTarget(v); try { localStorage.setItem("onehub_re_gapc_dong", v); } catch (e) {} };
  const toggleGapCAlert = () => { setGapCAlert((a) => { const n = !a; try { localStorage.setItem("onehub_re_gapc_alert", n ? "1" : "0"); } catch (e) {} return n; }); };
  const pickMy = (v) => { setMyC(v); try { localStorage.setItem("onehub_re_my", v); } catch (e) {} };
  const pickTgt = (v) => { setTgtC(v); try { localStorage.setItem("onehub_re_target", v); } catch (e) {} };
  const changeBudget = (v) => { setBudget(v); try { localStorage.setItem("onehub_re_budget", v); } catch (e) {} };
  const changeJeonse = (v) => { setJeonseRate(v); try { localStorage.setItem("onehub_re_jeonse", v); } catch (e) {} };
  const openWiz = () => { setWiz(myProp ? { name: myProp.name || "", pyeong: myProp.pyeong || "", dongfloor: myProp.dongfloor || "", buyUk: myProp.buyUk || "", buyMonth: myProp.buyMonth || "" } : { name: myC || "", pyeong: "", dongfloor: "", buyUk: "", buyMonth: "" }); setWizOpen(true); };
  const [delConfirm, setDelConfirm] = useState(false); // [#8] 내 단지 삭제 2단계 확인
  // [AI-2/AI-3] 내 평형 시세 직접 입력(억) + '단지 평균으로 보기' opt-in
  const [userAvm, setUserAvm] = useState(null);
  const [avmEditing, setAvmEditing] = useState(false);
  const [avmDraft, setAvmDraft] = useState("");
  const [showComplexAvm, setShowComplexAvm] = useState(false);
  const saveUserAvm = () => {
    const v = Number(avmDraft);
    if (v > 0) { setUserAvm(v); try { localStorage.setItem("onehub_re_my_avm", String(v)); window.dispatchEvent(new Event("onehub-assets-change")); } catch (e) {} }
    setAvmEditing(false);
  };
  const clearUserAvm = () => { setUserAvm(null); setShowComplexAvm(false); try { localStorage.removeItem("onehub_re_my_avm"); } catch (e) {} };
  const deleteMyProp = () => {
    if (!delConfirm) { setDelConfirm(true); return; } // 명시적 취소 버튼으로만 해제(타임아웃 제거)
    // [#8 보완] 내 단지 관련 로컬 키를 모두 정리하고, 기기 동기화에도 삭제가 전파되도록 이벤트 발화.
    try {
      ["onehub_re_my_property", "onehub_re_my", "onehub_re_target", "onehub_re_gapc_dong", "onehub_re_gapc_alert", "onehub_re_my_avm"]
        .forEach((k) => localStorage.removeItem(k));
      window.dispatchEvent(new Event("onehub-assets-change")); // syncManager가 삭제분을 서버에 push
    } catch (e) {}
    setMyProp(null); setMyC(""); setTgtC(""); setGapCTarget(""); setGapCAlert(false); setUserAvm(null); setShowComplexAvm(false);
    setDelConfirm(false); setWizOpen(false); setGapData(null); setGapBData(null); setGapCData(null);
  };
  const saveWiz = () => {
    const name = String(wiz.name || "").trim();
    if (!name) return;
    const obj = { name, pyeong: wiz.pyeong, dongfloor: wiz.dongfloor, buyUk: wiz.buyUk, buyMonth: wiz.buyMonth };
    setMyProp(obj); setMyC(name);
    try { localStorage.setItem("onehub_re_my_property", JSON.stringify(obj)); localStorage.setItem("onehub_re_my", name); } catch (e) {}
    setWizOpen(false);
  };

  const mac = macro?.latest;

  // [S5+] DB(raw_transactions 기반 feed)에서 단지별 전용면적(㎡)·평형 옵션 로딩
  const areaMap = (() => {
    const m = {};
    (feed?.feed || []).forEach((f) => {
      const nm = f.단지명, a = Math.round(Number(f.전용면적));
      if (!nm || !(a > 0)) return;
      (m[nm] = m[nm] || new Map()).set(a, { m2: a, priceUk: Number(f.거래금액_억) || null, floor: f.층 });
    });
    // 값 배열로 변환(면적 오름차순)
    const out = {};
    Object.keys(m).forEach((nm) => { out[nm] = [...m[nm].values()].sort((x, y) => x.m2 - y.m2); });
    return out;
  })();
  // 평형 옵션: 백엔드(complex-areas) 우선 → 없으면 feed 유도치
  const areaOptsFor = (name) => (Array.isArray(dbAreas[name]) && dbAreas[name].length ? dbAreas[name] : (areaMap[name] || []));
  // 전용㎡ → 대략 평(공급 관례 근사): 전용㎡ ÷ 3.3058 후 전용률 0.74 역산 ≈ ㎡/2.45
  const m2ToPyeong = (m2) => Math.round(Number(m2) / 3.3058 / 0.74);
  // 법정동: 백엔드(complex-dongs) 우선 → 랭킹 필드 → 브리핑 지역
  const dongOf = (name) => {
    if (dongMap[name]) return dongMap[name];
    const row = (rank?.ranking || []).find((r) => r.단지명 === name);
    return row?.법정동 || row?.법정동명 || brief?.region || null;
  };
  const myDong = myProp?.name ? dongOf(myProp.name) : (brief?.region || null);
  const changeScope = (s) => { setMoveScope(s); try { localStorage.setItem("onehub_re_scope", s); } catch (e) {} };

  return (
    <div className="re pwa-shell">

      {/* 1) HERO — 시장 브리핑 (다크 네이비 히어로) */}
      <section className="hero">
        <div className="eyebrow">
          <span className="lbl">🏢 시장 브리핑{brief?.region ? ` · ${brief.region}` : ""}</span>
        </div>
        {brief && !brief.error ? (
          <>
            <div className="big">{brief.phase}</div>
            <div className="brief-lead">대장 단지 <b>{brief.leader}</b> · {uk(brief.leader_price)}</div>
            <div className="brief-stats">
              <div className="bstat"><span>분기</span><b>{pct(brief.chg_q)}</b></div>
              <div className="bstat"><span>연간</span><b>{pct(brief.chg_yr)}</b></div>
            </div>
          </>
        ) : (
          <div className="brief-lead">{err ? "데이터 로드 오류" : "불러오는 중…"}</div>
        )}
      </section>

      {/* [§3-7 피드백15] #1 결론 한 줄 — 국면 + 저평가 1위(위계 확립) */}
      {brief && !brief.error && (() => {
        const topU = brief.under?.[0];
        return (
          <div className="re-verdict">
            <div className="rv-h"><span className="rv-lbl">📌 이 지역 한 줄 결론</span><span className={`rv-phase ${jtag(brief.phase)}`}>{String(brief.phase || "").replace(/\s*국면\s*$/, "")} 국면</span></div>
            <div className="rv-sub">
              대장 <b>{brief.leader}</b> {uk(brief.leader_price)} · 분기 <b>{pct(brief.chg_q)}</b>
              {topU && <> · 저평가 1위 <b className="rv-under">{topU.단지명} +{Number(topU.gap).toFixed(1)}%</b></>}
            </div>
          </div>
        );
      })()}

      {/* [R-6] 개인화 브리핑 — 내 선택 → 그래서 결과 → 검토 방향(CTA). 일반 시황보다 위. */}
      {brief && !brief.error && (myProp?.name ? (() => {
        const cur = rank?.ranking ? dedupBy(rank.ranking, (c) => c.단지ID || c.단지명).find((o) => o.단지명 === myProp.name) : null;
        const fd = (feed?.feed || []).find((f) => f.단지명 === myProp.name);
        const chg = fd?.변동률;
        return (
          <div className="pbrief">
            <div className="pb-step"><span className="pb-k">① 내 선택</span><span className="pb-v">보유 <b>{myProp.name}</b>{myProp.pyeong ? ` 전용 ${myProp.pyeong}㎡` : ""}{tgtC ? <> · 목표 <b>{tgtC}</b></> : <> · 목표 지역 <em>미설정</em></>}</span></div>
            <div className="pb-step"><span className="pb-k">② 그래서</span><span className="pb-v">{chg != null ? <>내 단지 최근 실거래가 직전 대비 <b className={chg >= 0 ? "up" : "dn"}>{chg >= 0 ? "+" : ""}{chg}%</b>. 이 지역은 <b>{String(brief.phase || "").replace(/\s*국면\s*$/, "")}</b> 국면입니다.</> : <>이 지역은 <b>{String(brief.phase || "").replace(/\s*국면\s*$/, "")}</b> 국면 · 분기 {pct(brief.chg_q)}. 내 단지 실거래는 축적 중입니다.</>}</span></div>
            <div className="pb-step"><span className="pb-k">③ 검토 방향</span><span className="pb-v">평형·단지 갈아타기 갭이 적정 밴드의 어디인지 확인할 시점입니다. <button className="pb-cta" onClick={() => { changeScope("complex"); try { document.querySelector(".scr-card")?.scrollIntoView({ behavior: "smooth" }); } catch (e) {} }}>갭 분석 열기 →</button></span></div>
          </div>
        );
      })() : (
        <div className="pbrief pbrief-set">
          <span>🎯 <b>목표 지역·단지</b>를 정하면 매주 <b>갭 변화</b>를 개인 브리핑으로 알려드립니다.</span>
          <button className="pb-cta" onClick={openWiz}>내 단지·목표 설정 →</button>
        </div>
      ))}

      {/* [S5] 내 단지 — 미등록: 위저드 CTA / 등록됨: 상세 요약(매수가 vs 현재 추정시세) */}
      {!myProp ? (
        // [R-1] 등록 전 블러 프리뷰 — 라벨은 선명, 값만 가림 + 가치 제안 카드(3개·30초 CTA)
        <div className="preview5">
          <div className="pv-sample" aria-hidden="true">
            <div className="pv-title">🏠 내 단지 <span className="pv-blur">▓▓▓▓</span></div>
            <div className="pv-row"><span className="pv-lbl">내 단지 ONE Score</span><span className="pv-blur">88 · 고평가</span></div>
            <div className="pv-row"><span className="pv-lbl">같은 동 갈아타기 갭</span><span className="pv-blur">+3.2억 · 추천</span></div>
            <div className="pv-row"><span className="pv-lbl">목표 지역 가격 갭</span><span className="pv-blur">+5.8억 · 3년 최저</span></div>
          </div>
          <div className="pv-over">
            <div className="pv-h">등록하면 이런 게 보입니다</div>
            <ul className="pv-list">
              <li>내 단지의 ONE Score와 고평가/저평가 판정</li>
              <li>같은 동 내 갈아타기 가격 갭 분석</li>
              <li>목표 지역과의 실시간 가격 갭 추적</li>
            </ul>
            <button className="pv-cta" onClick={openWiz}>내 단지 등록하기 · 30초 →</button>
          </div>
        </div>
      ) : (() => {
        const cur = rank?.ranking ? dedupBy(rank.ranking, (c) => c.단지ID || c.단지명).find((o) => o.단지명 === myProp.name) : null;
        const 단지Avm = cur ? Number(cur.avm_total_uk || 0) || null : null; // 단지 대표 AVM(작은 평형에 끌림) — 손익 기준으로는 부적합
        // [AI-1~3] ★버그수정: 손익 기준을 '단지 AVM'이 아니라 '내 평형 실거래 대표가'로.
        //   시범삼성 192㎡: 단지AVM 16.49억 vs 매수 26.5억 = -37.8%(허위) → 평형 실거래 28.8억 = +8.7%(사실).
        const myArea = (areaOptsFor(myProp.name) || []).find((a) => String(a.m2) === String(myProp?.pyeong));
        const tradeN = myArea && myArea.n != null ? myArea.n : null;
        const perPyeongUk = myArea ? (myArea.priceUk ?? myArea.maxUk ?? null) : null; // 평형별 실거래 대표가
        const SPARSE = 3; // 내 평형 실거래 3건 미만 = 신뢰 시세 산출 불가
        const sparse = tradeN == null || tradeN < SPARSE;
        // 현재 시세 우선순위: ① 사용자 직접입력 ② 평형별 실거래(충분) ③ (opt-in)단지 평균 ④ 없음→잠금
        const priceSource = userAvm != null ? "user" : (!sparse && perPyeongUk != null ? "pyeong" : (showComplexAvm && 단지Avm != null ? "complex" : null));
        const curUk = priceSource === "user" ? userAvm : priceSource === "pyeong" ? perPyeongUk : priceSource === "complex" ? 단지Avm : null;
        const buyUk = Number(myProp.buyUk || 0) || null;
        const pnl = curUk != null && buyUk != null ? curUk - buyUk : null;
        const pnlPct = pnl != null && buyUk ? (pnl / buyUk) * 100 : null;
        const srcLabel = priceSource === "user" ? "직접 입력" : priceSource === "pyeong" ? `전용 ${myProp.pyeong}㎡ 실거래 ${tradeN}건 기준` : priceSource === "complex" ? "⚠ 단지 평균(내 평형 아님)" : null;
        const locked = curUk == null; // 신뢰 시세 없음 → AI-3 신뢰도 카드
        return (
          <section className="card myprop-card">
            <div className="mp-h">
              <div className="mp-title">🏠 내 단지 <b>{myProp.name}</b></div>
              <div className="mp-actions">
                {delConfirm ? (
                  <>
                    <button className="mp-del confirm" onClick={deleteMyProp}>정말 삭제</button>
                    <button className="mp-edit" onClick={() => setDelConfirm(false)}>취소</button>
                  </>
                ) : (
                  <>
                    <button className="mp-edit" onClick={openWiz}>수정</button>
                    <button className="mp-del" onClick={deleteMyProp}>삭제</button>
                  </>
                )}
              </div>
            </div>
            <div className="mp-meta">
              {myProp.pyeong && <span>전용 {myProp.pyeong}㎡{(() => { const p = m2ToPyeong(Number(myProp.pyeong)); return p ? ` (${p}평)` : ""; })()}</span>}
              {myProp.dongfloor && <span>{myProp.dongfloor}</span>}
              {myProp.buyMonth && <span>{myProp.buyMonth} 매수</span>}
              {buyUk != null && <span>매수 {uk(buyUk)}</span>}
            </div>
            {!locked ? (
              <>
                <div className="mp-pnl">
                  <div className="mp-now"><span>현재 시세<em>{srcLabel}</em></span><b>{uk(curUk)}</b></div>
                  {buyUk != null ? (
                    <div className={`mp-diff ${pnl >= 0 ? "pos" : "neg"}`}>
                      <span>평가손익<em>추정</em></span><b>{pnl >= 0 ? "+" : ""}{uk(pnl)}{pnlPct != null ? ` · ${pct(pnlPct)}` : ""}</b>
                    </div>
                  ) : (
                    <div className="mp-diff hold"><span>평가손익</span><b>매수가 입력 시 표시</b></div>
                  )}
                </div>
                <div className="mp-src-actions">
                  {priceSource === "user"
                    ? <button className="mp-src-btn" onClick={clearUserAvm}>실거래 시세로 되돌리기</button>
                    : <button className="mp-src-btn" onClick={() => { setAvmDraft(curUk != null ? String(curUk) : ""); setAvmEditing(true); }}>내 시세 직접 입력</button>}
                  {priceSource === "complex" && <span className="mp-src-warn">단지 평균이라 내 평형과 다를 수 있어요</span>}
                </div>
              </>
            ) : (
              // [AI-3] 신뢰도 카드 — 내 평형 실거래가 부족할 때만. SK하이닉스 확인 카드와 동일 톤.
              <div className="mp-trust">
                <div className="mp-trust-h">🔍 확인이 필요합니다</div>
                <div className="mp-trust-b"><b>{myProp.name} 전용 {myProp.pyeong}㎡</b>는 최근 실거래가 <b>{tradeN != null ? `${tradeN}건` : "부족"}</b>이라 신뢰할 수 있는 시세를 낼 수 없습니다. {buyUk != null ? <>매수가({uk(buyUk)})와 비교한 손익도 표시하지 않았습니다.</> : null}</div>
                <div className="mp-trust-btns">
                  <button className="mp-trust-primary" onClick={() => { setAvmDraft(perPyeongUk != null ? String(perPyeongUk) : 단지Avm != null ? String(단지Avm) : ""); setAvmEditing(true); }}>내 시세 직접 입력</button>
                  {단지Avm != null && <button className="mp-trust-second" onClick={() => setShowComplexAvm(true)}>단지 평균으로 보기</button>}
                </div>
              </div>
            )}
            {avmEditing && (
              <div className="mp-avm-edit">
                <span className="mp-avm-lbl">내 평형 시세(억)</span>
                <input className="mp-avm-in" type="number" inputMode="decimal" placeholder={perPyeongUk != null ? String(perPyeongUk) : "예: 28.8"} value={avmDraft} onChange={(e) => setAvmDraft(e.target.value)} autoFocus />
                <button className="mp-avm-save" onClick={saveUserAvm}>적용</button>
                <button className="mp-avm-cancel" onClick={() => setAvmEditing(false)}>취소</button>
              </div>
            )}
            <div className="mp-note">{locked
              ? <>단지 <Term term="AI 추정 시세">AI 추정 시세</Term>는 거래 많은 소형 평형에 끌려 대형 평형을 낮게 볼 수 있어, 실거래가 부족한 평형은 손익을 <b>추정하지 않습니다</b>(확정 아님).</>
              : priceSource === "pyeong"
              ? <>평가손익은 <b>내 평형({myProp.pyeong}㎡) 실거래 {tradeN}건</b> 대표가 기준 <b>추정</b>입니다. 단지 대표 AI 추정({단지Avm != null ? uk(단지Avm) : "-"})은 평형이 섞여 손익 기준으로 쓰지 않습니다. 층·향·수리 미반영(확정 아님).</>
              : <>매수가·시점은 로컬에만 저장됩니다. 평가손익은 위 <b>{srcLabel}</b> 기준 <b>추정</b>(확정 아님)입니다.</>}</div>
          </section>
        );
      })()}

      {/* [정리] 기존 '갈아타기 갭' 카드는 아래 스크리너의 '같은 동/같은 단지'와 중복되어 제거.
          갈아타기 소요자금은 스크리너에서 이동 범위별로 계산한다. */}

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
                <button className="scr-reg" onClick={openWiz}>내 단지 등록 →</button>
              </div>
            ) : moveScope === "complex" ? (() => {
              // [#7] 실거래 최고가 기준(대표 중앙값은 표본 적으면 역전될 수 있어, 최고가를 1차 가격으로)
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
                    // [#7 보완] 평수↑인데 최고가↓ = 대부분 '거래 건수가 적어' 생기는 이상치.
                    //   거래 건수(n)를 함께 노출해 "왜 큰 평형이 더 싼가"를 스스로 납득하게 한다.
                    const anomaly = price != null && runMax !== -Infinity && price < runMax;
                    if (price != null && price > runMax) runMax = price;
                    const thin = a.n != null && a.n < 3; // 표본 부족 기준(거래 3건 미만)
                    return (
                      <div className="scr-row" key={a.m2}>
                        <span className="scr-name">전용 {a.m2}㎡ <span className="scr-py">약 {m2ToPyeong(a.m2)}평</span>{mine && <span className="scr-mine">내 평형</span>}{anomaly && <span className="scr-anom" title={`평형이 큰데 실거래 최고가가 더 낮습니다. ${a.n != null ? `이 평형 거래 ${a.n}건으로 표본이 적어` : "표본이 적어"} 생기는 이상치일 수 있습니다.`}>⚠ {a.n != null ? `거래 ${a.n}건` : "표본 적음"}</span>}</span>
                        <span className="scr-avm">{a.maxUk != null ? uk(a.maxUk) : (a.priceUk != null ? uk(a.priceUk) : "-")}{a.maxUk != null && a.priceUk != null && a.priceUk !== a.maxUk ? <span className="scr-rep"> · 대표 {uk(a.priceUk)}</span> : null}{a.n != null && !anomaly ? <span className="scr-n">{thin ? " · " : " · "}거래 {a.n}건</span> : null}</span>
                        <span className={`scr-gap ${diff != null && diff <= 0 ? "ok" : ""}`}>{mine ? "—" : gapCell(diff)}</span>
                      </div>
                    );
                  })}
                  {/* [R-5] 갭 분석 — 목표 평형 선택 → 적정 밴드(평균±σ)·추천/관망/보류·표본부족 보류 */}
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
                  {/* [R-5 시나리오B] 같은 동 단지 갈아타기 갭 분석 — 갭 저점 Top3 자동 추천 + 판정 */}
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
                  {/* [R-5 시나리오C] 목표 지역 갭 추적 — 동 평균단가 기준 동일 평형 갭·판정·알림 */}
                  {!myProp?.name ? (
                    <div className="gap-empty" style={{ marginTop: 12 }}>목표 지역 갭 추적은 <b>내 단지</b> 등록 후 이용할 수 있습니다. <button className="scr-reg" onClick={openWiz}>내 단지 등록 →</button></div>
                  ) : (() => {
                    const myDongC = dongOf(myProp.name);
                    const dongs = [...new Set(Object.values(dongMap || {}).filter(Boolean))].filter((d) => d !== myDongC).sort();
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

      {/* [§3-2 원칙1] 포트폴리오 합계는 홈·AI자산 2곳에만. 부동산 페이지는 부동산 슬라이스만 표시(피드백14) */}

      {/* 2) ONE Score 랭킹 */}
      {rank?.ranking?.length > 0 && (
        <section className="card">
          <div className="label">🏆 <Term term="ONE Score">ONE Score</Term> 랭킹 <span className="sub">단지별 종합점수</span></div>
          {/* [§3-7] 순위 중복 버그 수정 — one_score 내림차순 정렬 + 단지명 중복 제거 후 순번 부여 */}
          {(() => {
            const seen = new Set();
            const ranking = [...rank.ranking]
              .sort((a, b) => (b.one_score ?? 0) - (a.one_score ?? 0))
              .filter((c) => { if (seen.has(c.단지명)) return false; seen.add(c.단지명); return true; });
            // [S7.5] 한 줄 근거용 룩업 — 저평가 gap(회귀 대비) + 최근 실거래 변동
            const underMap = new Map((brief?.under || []).map((u) => [u.단지명, u]));
            const feedMap = new Map();
            (feed?.feed || []).forEach((f) => { if (!feedMap.has(f.단지명)) feedMap.set(f.단지명, f); });
            return ranking.map((c, i) => {
              // 카드 간 연결감: 최근 실거래 변동 · 회귀 대비 상승여력을 한 줄로
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

      {/* 2.5) 최근 실거래 피드 (#16) — raw_transactions 기반, 동일 단지·평형 직전 대비 변동률 */}
      {feed?.feed?.length > 0 && (
        <section className="card">
          <div className="label">📈 최근 실거래 <span className="sub">동일 단지·평형 직전 거래 대비</span></div>
          {feed.feed.slice(0, 8).map((f, i) => (
            <div className="frow" key={`${f.단지명}-${f.거래일}-${i}`}>
              <div className="fmid">
                <div className="fname">{f.단지명}</div>
                <div className="fsub">{f.전용면적}㎡ · {f.층 ? `${f.층}층` : "-"} · {f.건축연도 ? `${f.건축연도}년` : "-"} · {f.거래일?.slice(5)}</div>
              </div>
              <div className="fright">
                <div className="fprice">{f.거래금액_억}억</div>
                {f.변동률 != null && (
                  <div className={`fchg ${f.변동률 > 0 ? "up" : f.변동률 < 0 ? "dn" : "fl"}`}>
                    {f.변동률 > 0 ? "▲" : f.변동률 < 0 ? "▼" : "−"}{Math.abs(f.변동률)}%
                  </div>
                )}
              </div>
            </div>
          ))}
          <div className="note">{feed.note}{feed.updated ? ` · 업데이트 ${feed.updated}` : ""}</div>
        </section>
      )}

      {/* 3) 저평가 후보 */}
      {brief?.under?.length > 0 && (
        <section className="card">
          <div className="label">💎 저평가 후보 <span className="sub">현재가 vs 회귀예측</span></div>
          {brief.under.slice(0, 6).map((u) => (
            <div className="urow" key={u.단지명}>
              <div>
                <div className="uname">{u.단지명}</div>
                <div className="usub">{uk(u.cur)} → 예측 <b>{uk(u.pred)}</b> · <Term term="설명력">설명력</Term> {Math.round(Number(u.r2) * 100)}%</div>
              </div>
              <div className="ugap">+{Number(u.gap).toFixed(1)}%</div>
            </div>
          ))}
          <div className="note">gap = 예측 대비 상승여력 · <b>회귀 근사 · <Term term="시차">시차 없음(동시 반영)</Term> 상대가치</b> · 확정 아님. <Term term="설명력">설명력</Term>=시장 흐름으로 설명되는 정도.</div>
        </section>
      )}

      {/* 4) 거시 — [R-7] 정책 설명 + 미구현(예측·실시간) 로드맵 배지 + 기준시점 명시 */}
      {mac && (
        <section className="card">
          <div className="label">🌐 거시 환경 <span className="sub">기준 {mac.연월}</span></div>
          <div className="chips">
            <span className="chip">KOSPI <b>{Math.round(mac.kospi).toLocaleString()}</b></span>
            <span className="chip">기준금리 <b>{mac.base_rate}%</b></span>
            <span className="chip"><Term term="정책 점수">정책</Term> <b>{mac.policy_stance}</b></span>
          </div>
          {/* [거시 해석] 금리·정책을 부동산 방향성으로 규칙 기반 해석(예측 아님) + 데이터 최신성 명시 */}
          {(() => {
            const baseRate = Number(mac.base_rate);
            const stance = String(mac.policy_stance ?? "");
            // 금리 방향(+상방/−하방) — 대출이자 부담 관점
            let rateBias = 0, rateTxt = `기준금리 ${mac.base_rate}% · 중립 구간`;
            if (baseRate >= 3.25) { rateBias = -1; rateTxt = `기준금리 ${mac.base_rate}% — 이자 부담이 커 매수여력을 누르는 하방 압력`; }
            else if (baseRate > 0 && baseRate <= 2.5) { rateBias = 1; rateTxt = `기준금리 ${mac.base_rate}% — 이자 부담이 낮아 매수여력에 우호적(상방 여지)`; }
            else if (baseRate > 0) { rateTxt = `기준금리 ${mac.base_rate}% — 중립 구간(뚜렷한 방향성 약함)`; }
            // 정책 방향
            let polBias = 0, polTxt = `정책 '${stance || "정보 없음"}' — 방향성 약함(중립)`;
            if (/완화|부양|지원|공급확대|규제완화/.test(stance)) { polBias = 1; polTxt = `정책 '${stance}' — 완화·부양 기조로 수요에 우호적`; }
            else if (/긴축|규제|억제|강화|대출제한/.test(stance)) { polBias = -1; polTxt = `정책 '${stance}' — 긴축·규제 기조로 수요를 누르는 방향`; }
            const net = rateBias + polBias;
            const dir = net >= 1 ? { t: "상방 우세", ic: "🟢", c: "up" } : net <= -1 ? { t: "하방 우세", ic: "🔴", c: "dn" } : { t: "중립·혼조", ic: "🟡", c: "mid" };
            // 데이터 최신성(기준 연월 → 오늘 경과 개월)
            const nowK = new Date(Date.now() + 9 * 3600 * 1000);
            const ymParts = String(mac.연월 || "").split(/[-.\/]/).map((x) => Number(x));
            const elapsed = (ymParts.length >= 2 && ymParts[0] > 1900 && ymParts[1] >= 1)
              ? (nowK.getUTCFullYear() * 12 + nowK.getUTCMonth()) - (ymParts[0] * 12 + (ymParts[1] - 1)) : null;
            const freshTxt = elapsed == null ? `기준 ${mac.연월}` : elapsed <= 0 ? `이번 달(${mac.연월}) 기준 · 최신` : `${mac.연월} 기준 · ${elapsed}개월 전 데이터`;
            return (
              <div className="macro-read">
                <div className="mr-top">
                  <span className="mr-lbl">🧭 규칙 기반 방향성</span>
                  <span className={`mr-dir ${dir.c}`}>{dir.ic} 부동산 {dir.t}</span>
                </div>
                <div className="mr-row"><span className="mr-k">금리</span><span className="mr-v">{rateTxt}</span></div>
                <div className="mr-row"><span className="mr-k">정책</span><span className="mr-v">{polTxt}</span></div>
                <div className={`mr-fresh ${elapsed != null && elapsed >= 2 ? "stale" : ""}`}>📅 {freshTxt}{elapsed != null && elapsed >= 2 ? " — 월 단위로 갱신되며 실시간 시세와 차이가 있을 수 있습니다." : ""}</div>
                <div className="mr-disc">※ 금리·정책을 <b>규칙으로 해석한 방향성</b>일 뿐 <b>가격 예측이 아닙니다</b>. 실제 가격은 단지·수급에 따라 다릅니다.</div>
              </div>
            );
          })()}
          <div className="note">{mac.kospi_src || "연말 종가 기준입니다(월별 정밀치는 아니에요)."}</div>
        </section>
      )}

      {/* [S5] 내 단지 등록 위저드 — 자동완성·평형·동층·매수가·시점 */}
      {wizOpen && (
        <div className="wiz-scrim" onClick={() => setWizOpen(false)}>
          <div className="wiz" onClick={(e) => e.stopPropagation()}>
            <div className="wiz-h">🏠 내 단지 {myProp ? "수정" : "등록"}<button className="wiz-x" onClick={() => setWizOpen(false)} aria-label="닫기">✕</button></div>
            {/* [폼 일원화] 빠른입력과 동일한 공용 ReForm. 페이지에서는 실거래 DB 옵션(단지·평형)을 넘겨 드롭다운 제공 */}
            <ReForm
              initial={myProp}
              nameOptions={(() => { const base = rank?.ranking ? dedupBy(rank.ranking, (c) => c.단지ID || c.단지명).map((o) => o.단지명) : []; const cur = myProp?.name || wiz?.name; return cur && !base.includes(cur) ? [cur, ...base] : base; })()}
              getAreaOptions={(nm) => areaOptsFor(nm).map((a) => ({ value: a.m2, label: `전용 ${a.m2}㎡ (약 ${m2ToPyeong(a.m2)}평)${a.priceUk ? ` · ${a.priceUk}억` : ""}` }))}
              saveLabel="저장"
              onSaved={(key, obj) => { setMyProp(obj); setMyC(obj.name); setWizOpen(false); }}
            />
            <div className="wiz-note">입력값은 이 기기에만 저장됩니다(localStorage). 평가손익·갭은 현재 <Term term="AI 추정 시세">AI 추정 시세</Term> 기준 <b>추정</b>입니다.</div>
          </div>
        </div>
      )}

      <a href="/partners/realestate" className="partner-cta">
        <span className="pc-l"><span className="pc-ic">🤝</span><span><b>협력업체 매물 등록</b><span className="pc-sub">중개·시행사이신가요? 매물 정보를 등록하세요</span></span></span>
        <span className="pc-arrow">→</span>
      </a>

      <div className="foot">📍 현재 <b>분당구 주요 동 단지</b> 실거래 기준입니다(전국·전 지역이 아닙니다). 실거래 기반 확정 지표 + 회귀 예측(근사) · 예측치는 참고용이며 투자판단은 본인 책임.</div>

      <BottomNav active="assets" />

      <style jsx>{`
        .re { max-width: 480px; margin: 0 auto; padding: 0 14px calc(env(safe-area-inset-bottom, 0px) + 84px); font-family: var(--font-sans); color: var(--color-ink); }
        .partner-cta { display: flex; align-items: center; justify-content: space-between; gap: 10px; text-decoration: none; background: var(--color-card); border: 1px solid var(--color-line); border-radius: var(--radius-card, 14px); padding: 14px 16px; margin: 4px 0 14px; box-shadow: var(--shadow-card); }
        .partner-cta .pc-l { display: flex; align-items: center; gap: 10px; }
        .partner-cta .pc-ic { font-size: 20px; }
        .partner-cta b { display: block; color: var(--color-ink); font-size: 0.92rem; }
        .partner-cta .pc-sub { display: block; color: var(--color-muted); font-size: 0.76rem; margin-top: 2px; }
        .partner-cta .pc-arrow { color: var(--color-primary); font-weight: 700; }
        .err { background: var(--color-danger-soft); color: var(--color-danger); padding: 10px 12px; border-radius: 10px; font-size: 0.82rem; margin-bottom: 12px; }
        .card { background: var(--color-card); border: 1px solid var(--color-line); border-radius: var(--radius-card); padding: 18px; margin-bottom: 14px; box-shadow: var(--shadow-card); }
        /* HERO — 시장 브리핑 */
        .hero { background: linear-gradient(135deg, var(--hero-grad-1), var(--hero-grad-2)); color: var(--hero-ink); border-radius: var(--radius-hero); padding: 20px 18px; box-shadow: var(--shadow-float); margin-bottom: 14px; }
        .hero .eyebrow { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 14px; }
        .hero .lbl { font-size: 12px; font-weight: 700; color: var(--hero-ink-sub); }
        .live { background: var(--color-success); color: #04351f; font-size: 9px; font-weight: 800; padding: 3px 7px; border-radius: 5px; letter-spacing: .5px; }
        .hero .big { font-size: 28px; font-weight: 800; letter-spacing: -.6px; line-height: 1; }
        .brief-lead { font-size: 12.5px; color: var(--hero-ink-soft); margin-top: 11px; }
        .brief-lead b { color: var(--hero-ink); font-weight: 700; }
        .brief-stats { display: flex; gap: 9px; margin-top: 16px; }
        .bstat { flex: 1; background: var(--hero-fill); border: 1px solid var(--hero-fill-line); border-radius: 13px; padding: 11px 13px; }
        .bstat span { display: block; font-size: 11px; color: var(--hero-ink-sub); font-weight: 600; margin-bottom: 4px; }
        .bstat b { font-size: 15px; font-weight: 800; color: var(--hero-accent); }
        /* [§3-7] #1 결론 strip */
        .re-verdict { background: var(--color-card); border: 1px solid var(--color-line); border-left: 4px solid var(--color-primary); border-radius: var(--radius-card); box-shadow: var(--shadow-card); padding: 14px 16px; margin-bottom: 12px; }
        .rv-h { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
        .rv-lbl { font-size: 0.74rem; font-weight: 700; color: var(--color-ink-2); }
        .rv-phase { font-size: 0.8rem; font-weight: 800; padding: 3px 10px; border-radius: 8px; }
        .rv-phase.watch { background: var(--color-card-soft); color: var(--color-ink-2); }
        .rv-phase.buy { background: var(--color-primary-soft); color: var(--color-primary); }
        .rv-sub { font-size: 0.82rem; color: var(--color-ink-2); margin-top: 8px; line-height: 1.5; word-break: keep-all; }
        .rv-sub b { color: var(--color-ink); font-weight: 700; }
        .rv-under { color: var(--color-success) !important; }
        /* slim CTA */
        .cta-slim { display: flex; align-items: center; gap: 10px; background: var(--color-primary-soft); border-radius: 14px; padding: 13px 15px; margin-bottom: 14px; font-size: 12.5px; color: var(--color-ink-2); font-weight: 600; cursor: pointer; line-height: 1.5; }
        .cta-txt { flex: 1; word-break: keep-all; }
        .cta-slim b { color: var(--color-primary); font-weight: 700; }
        /* [R-1] 등록 전 블러 프리뷰 */
        .preview5 { border: 1px solid var(--color-line); border-radius: 16px; overflow: hidden; margin-bottom: 14px; }
        .pv-sample { padding: 15px; background: var(--color-card); }
        .pv-title { font-size: 14px; font-weight: 800; color: var(--color-ink); margin-bottom: 10px; }
        .pv-row { display: flex; align-items: center; justify-content: space-between; padding: 8px 0; border-top: 1px solid var(--color-line); }
        .pv-row:first-of-type { border-top: none; }
        .pv-lbl { font-size: 13px; color: var(--color-ink-2); font-weight: 600; }
        .pv-blur { font-size: 13px; font-weight: 800; color: var(--color-ink); filter: blur(5px); user-select: none; }
        .pv-over { padding: 14px 15px; background: var(--color-primary-soft); border-top: 1px solid var(--color-primary); }
        .pv-h { font-size: 13.5px; font-weight: 800; color: var(--color-ink); margin-bottom: 8px; }
        .pv-list { margin: 0 0 12px; padding-left: 18px; }
        .pv-list li { font-size: 12.5px; color: var(--color-ink-2); line-height: 1.75; word-break: keep-all; }
        .pv-cta { width: 100%; border: none; background: var(--color-primary); color: #fff; font-size: 13.5px; font-weight: 800; padding: 12px 0; border-radius: 11px; cursor: pointer; font-family: var(--font-sans); }
        .cta-slim .arr { color: var(--color-primary); font-weight: 800; flex-shrink: 0; }
        /* [S5] 갈아타기 갭 트래커 */
        .gap-selects { display: flex; align-items: flex-end; gap: 8px; }
        .gap-sel { flex: 1; display: flex; flex-direction: column; gap: 4px; font-size: 0.68rem; color: var(--color-ink-3); font-weight: 700; }
        .gap-sel select { border: 1px solid var(--color-line); background: var(--color-bg); border-radius: 9px; padding: 9px 8px; font-size: 0.82rem; font-family: var(--font-sans); color: var(--color-ink); }
        .gap-sel select:focus { outline: none; border-color: var(--color-primary); }
        .gap-arrow { font-size: 1rem; font-weight: 800; color: var(--color-ink-3); padding-bottom: 9px; }
        .gap-result { margin-top: 14px; }
        .gap-amt { font-size: 0.9rem; font-weight: 700; color: var(--color-ink-2); display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
        .gap-amt b { font-size: 1.3rem; font-weight: 800; font-family: var(--font-display, var(--font-sans)); }
        .gap-amt b.pos { color: var(--color-primary); } .gap-amt b.neg { color: var(--color-success); }
        .gap-dir { font-size: 0.7rem; font-weight: 600; color: var(--color-ink-3); }
        .gap-rows { display: flex; flex-direction: column; gap: 6px; margin-top: 11px; }
        .gap-row { display: flex; align-items: center; justify-content: space-between; background: var(--color-card-soft); border-radius: 9px; padding: 8px 12px; font-size: 0.8rem; color: var(--color-ink); }
        .gap-row b { font-family: ui-monospace, monospace; font-weight: 800; }
        .gap-note { font-size: 0.66rem; color: var(--color-ink-3); margin-top: 11px; line-height: 1.55; word-break: keep-all; }
        .gap-note b { color: var(--color-ink-2); font-weight: 700; }
        .gap-empty { margin-top: 12px; font-size: 0.76rem; color: var(--color-ink-2); line-height: 1.6; word-break: keep-all; }
        .gap-empty b { color: var(--color-ink); font-weight: 700; }
        /* [S5] 갭 밴드(상대가치·추정) */
        .gap-band { margin-top: 14px; }
        .gb-h { display: flex; align-items: center; gap: 8px; margin-bottom: 7px; }
        .gb-lbl { font-size: 0.72rem; font-weight: 800; color: var(--color-ink-2); }
        .gb-tag { font-size: 0.6rem; font-weight: 800; padding: 2px 7px; border-radius: 5px; background: var(--color-warning-soft); color: var(--color-warning-ink); }
        .gb-track { position: relative; height: 10px; background: var(--color-card-soft); border-radius: 999px; overflow: hidden; }
        .gb-fill { position: absolute; top: 0; bottom: 0; background: var(--color-primary-soft); }
        .gb-mid { position: absolute; top: -2px; bottom: -2px; width: 2px; background: var(--color-primary); transform: translateX(-1px); }
        .gb-scale { display: flex; justify-content: space-between; font-size: 0.64rem; color: var(--color-ink-3); font-weight: 600; margin-top: 5px; }
        .gb-scale span:nth-child(2) { color: var(--color-primary); font-weight: 800; }
        /* [S5] 내 단지 요약 카드 */
        .myprop-card .mp-h { display: flex; align-items: center; justify-content: space-between; }
        .mp-title { font-size: 0.86rem; font-weight: 700; color: var(--color-ink-2); }
        .mp-title b { color: var(--color-ink); font-weight: 800; margin-left: 4px; }
        .mp-edit { border: 1px solid var(--color-line); background: var(--color-card); color: var(--color-ink-2); border-radius: 8px; padding: 5px 12px; font-size: 0.72rem; font-weight: 700; font-family: var(--font-sans); cursor: pointer; }
        .mp-actions { display: flex; gap: 6px; flex-shrink: 0; }
        .mp-del { border: 1px solid var(--color-danger); background: var(--color-card); color: var(--color-danger); border-radius: 8px; padding: 5px 12px; font-size: 0.72rem; font-weight: 700; font-family: var(--font-sans); cursor: pointer; white-space: nowrap; }
        .mp-del.confirm { background: var(--color-danger); color: #fff; }
        .scr-anom { font-size: 0.6rem; font-weight: 800; color: var(--color-warning-ink, var(--color-warning)); background: var(--color-warning-soft); padding: 1px 6px; border-radius: 6px; margin-left: 5px; white-space: nowrap; }
        .scr-rep { font-size: 0.66rem; font-weight: 500; color: var(--color-ink-3); }
        .scr-n { font-size: 0.64rem; font-weight: 600; color: var(--color-ink-3); }
        .mp-meta { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 9px; }
        .mp-meta span { font-size: 0.68rem; font-weight: 700; background: var(--color-card-soft); color: var(--color-ink-2); border-radius: 7px; padding: 4px 9px; }
        .mp-pnl { display: flex; gap: 10px; margin-top: 12px; }
        .mp-now, .mp-diff { flex: 1; background: var(--color-card-soft); border-radius: 11px; padding: 11px 13px; }
        .mp-now span, .mp-diff span { display: block; font-size: 0.66rem; color: var(--color-ink-3); font-weight: 600; margin-bottom: 4px; }
        .mp-now b, .mp-diff b { font-size: 1.05rem; font-weight: 800; }
        .mp-diff em { font-style: normal; font-size: 0.56rem; font-weight: 800; background: var(--color-warning-soft); color: var(--color-warning-ink); padding: 1px 5px; border-radius: 4px; margin-left: 5px; vertical-align: middle; }
        .mp-diff.pos b { color: var(--color-success); } .mp-diff.neg b { color: var(--color-danger); }
        .mp-diff.hold b { font-size: 0.74rem; font-weight: 700; color: var(--color-ink-2); line-height: 1.4; word-break: keep-all; }
        .mp-nomatch { font-size: 0.72rem; color: var(--color-ink-2); background: var(--color-card-soft); border-radius: 10px; padding: 10px 12px; margin-top: 11px; line-height: 1.5; word-break: keep-all; }
        .mp-now em { font-style: normal; font-size: 0.56rem; font-weight: 700; color: var(--color-ink-3); margin-left: 5px; }
        /* [AI-2/3] 시세 출처 액션 + 직접입력 */
        .mp-src-actions { display: flex; align-items: center; gap: 9px; margin-top: 9px; flex-wrap: wrap; }
        .mp-src-btn { border: 1px solid var(--color-line); background: var(--color-card); color: var(--color-ink-2); border-radius: 8px; padding: 6px 12px; font-size: 0.72rem; font-weight: 700; cursor: pointer; font-family: var(--font-sans); }
        .mp-src-warn { font-size: 0.64rem; color: var(--color-warning-ink, var(--color-warning)); }
        /* [AI-3] 신뢰도 카드(확인이 필요합니다) */
        .mp-trust { margin-top: 11px; background: var(--color-warning-soft); border: 1px solid var(--color-warning-ink, var(--color-warning)); border-radius: 12px; padding: 13px 14px; }
        .mp-trust-h { font-size: 0.86rem; font-weight: 800; color: var(--color-warning-ink, var(--color-warning)); margin-bottom: 6px; }
        .mp-trust-b { font-size: 0.76rem; color: var(--color-ink-2); line-height: 1.55; word-break: keep-all; }
        .mp-trust-btns { display: flex; gap: 8px; margin-top: 11px; flex-wrap: wrap; }
        .mp-trust-primary { border: none; background: var(--color-primary); color: #fff; border-radius: 9px; padding: 8px 15px; font-size: 0.78rem; font-weight: 800; cursor: pointer; font-family: var(--font-sans); }
        .mp-trust-second { border: 1px solid var(--color-line); background: var(--color-card); color: var(--color-ink-2); border-radius: 9px; padding: 8px 15px; font-size: 0.78rem; font-weight: 700; cursor: pointer; font-family: var(--font-sans); }
        /* [AI-3] 내 시세 직접입력 인라인 */
        .mp-avm-edit { display: flex; align-items: center; gap: 7px; margin-top: 10px; flex-wrap: wrap; background: var(--color-card-soft); border-radius: 10px; padding: 9px 11px; }
        .mp-avm-lbl { font-size: 0.7rem; font-weight: 700; color: var(--color-ink-2); }
        .mp-avm-in { flex: 1; min-width: 90px; border: 1px solid var(--color-line); border-radius: 8px; padding: 7px 10px; font-size: 0.86rem; font-family: var(--font-sans); background: var(--color-card); color: var(--color-ink); }
        .mp-avm-save { border: none; background: var(--color-primary); color: #fff; border-radius: 8px; padding: 7px 13px; font-size: 0.76rem; font-weight: 800; cursor: pointer; font-family: var(--font-sans); }
        .mp-avm-cancel { border: 1px solid var(--color-line); background: var(--color-card); color: var(--color-ink-2); border-radius: 8px; padding: 7px 11px; font-size: 0.76rem; font-weight: 700; cursor: pointer; font-family: var(--font-sans); }
        .mp-note { font-size: 0.64rem; color: var(--color-ink-3); margin-top: 10px; line-height: 1.5; word-break: keep-all; }
        .mp-note b { color: var(--color-ink-2); font-weight: 700; }
        /* [S5] 투자아파트 스크리너 */
        /* [S5+] 이동 범위 칩 */
        .scope-chips { display: flex; gap: 6px; margin-bottom: 14px; }
        .scope-chip { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 2px; border: 1px solid var(--color-line); background: var(--color-card); border-radius: 12px; padding: 9px 4px; cursor: pointer; font-family: var(--font-sans); }
        .scope-chip b { font-size: 0.8rem; font-weight: 800; color: var(--color-ink-2); }
        .scope-chip span { font-size: 0.6rem; font-weight: 600; color: var(--color-ink-3); white-space: nowrap; }
        .scope-chip.on { background: var(--color-primary); border-color: var(--color-primary); }
        .scope-chip.on b, .scope-chip.on span { color: #fff; }
        .scr-py { font-size: 0.66rem; font-weight: 600; color: var(--color-ink-3); }
        .scr-mine { font-size: 0.58rem; font-weight: 800; background: var(--color-primary-soft); color: var(--color-primary); padding: 1px 6px; border-radius: 5px; }
        .scr-reg { display: block; margin-top: 10px; border: none; background: var(--color-primary); color: #fff; border-radius: 10px; padding: 9px 14px; font-size: 0.78rem; font-weight: 800; font-family: var(--font-sans); cursor: pointer; }
        .scr-inputs { display: flex; gap: 8px; margin-bottom: 12px; }
        /* [모바일 정렬] flex:1 + min-width:0 로 숫자 input이 좁은 화면에서 균등 축소되게(오버플로우 방지) */
        .scr-in { flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; gap: 4px; font-size: 0.68rem; color: var(--color-ink-3); font-weight: 700; }
        .scr-in input { width: 100%; min-width: 0; box-sizing: border-box; border: 1px solid var(--color-line); background: var(--color-bg); border-radius: 9px; padding: 9px 10px; font-size: 0.84rem; font-family: var(--font-sans); color: var(--color-ink); }
        .scr-in input:focus { outline: none; border-color: var(--color-primary); }
        .scr-head { display: grid; grid-template-columns: 1fr auto auto; gap: 10px; font-size: 0.64rem; color: var(--color-ink-3); font-weight: 700; padding-bottom: 6px; border-bottom: 1px solid var(--color-line); }
        .scr-head span:nth-child(2), .scr-head span:nth-child(3) { text-align: right; min-width: 56px; }
        .scr-row { display: grid; grid-template-columns: 1fr auto auto; gap: 10px; align-items: center; padding: 10px 0; border-bottom: 1px solid var(--color-line); }
        .scr-name { font-size: 0.82rem; font-weight: 700; color: var(--color-ink); display: flex; align-items: center; gap: 6px; min-width: 0; }
        .scr-avm { font-size: 0.8rem; font-weight: 700; color: var(--color-ink-2); font-family: ui-monospace, monospace; text-align: right; min-width: 56px; }
        .scr-gap { font-size: 0.86rem; font-weight: 800; color: var(--color-ink); font-family: ui-monospace, monospace; text-align: right; min-width: 56px; }
        .scr-gap.ok { color: var(--color-success); }
        /* [S5] 등록 위저드 바텀시트 */
        .wiz-scrim { position: fixed; inset: 0; background: rgba(0,0,0,0.45); z-index: 200; display: flex; align-items: flex-end; justify-content: center; }
        .wiz { width: 100%; max-width: 480px; background: var(--color-card); border-radius: 20px 20px 0 0; padding: 20px 18px calc(env(safe-area-inset-bottom, 0px) + 20px); box-shadow: var(--shadow-float); }
        .wiz-h { display: flex; align-items: center; justify-content: space-between; font-size: 1rem; font-weight: 800; color: var(--color-ink); margin-bottom: 16px; }
        .wiz-x { border: none; background: var(--color-card-soft); color: var(--color-ink-2); width: 30px; height: 30px; border-radius: 50%; font-size: 0.9rem; cursor: pointer; }
        .wiz-f { display: flex; flex-direction: column; gap: 5px; font-size: 0.7rem; color: var(--color-ink-3); font-weight: 700; margin-bottom: 11px; flex: 1 1 0; min-width: 0; }
        .wiz-f em { font-style: normal; font-size: 0.6rem; font-weight: 700; color: var(--color-primary); margin-left: 5px; }
        .wiz-f input, .wiz-f select { width: 100%; min-width: 0; box-sizing: border-box; border: 1px solid var(--color-line); background: var(--color-bg); border-radius: 10px; padding: 11px 12px; font-size: 0.9rem; font-family: var(--font-sans); color: var(--color-ink); }
        .wiz-f select:focus { outline: none; border-color: var(--color-primary); }
        .wiz-f input:focus { outline: none; border-color: var(--color-primary); }
        .wiz-row { display: flex; gap: 10px; }
        .wiz-save { width: 100%; margin-top: 6px; border: none; border-radius: 12px; padding: 13px 0; font-size: 0.92rem; font-weight: 800; color: #fff; background: var(--color-primary); cursor: pointer; font-family: var(--font-sans); }
        .wiz-save:disabled { opacity: 0.5; cursor: not-allowed; }
        .wiz-note { font-size: 0.66rem; color: var(--color-ink-3); margin-top: 11px; line-height: 1.5; word-break: keep-all; text-align: center; }
        .wiz-note b { color: var(--color-ink-2); font-weight: 700; }
        .label { font-size: 0.9rem; font-weight: 700; color: var(--color-ink); margin-bottom: 12px; }
        .sub { font-weight: 600; color: var(--color-ink-3); font-size: 0.68rem; margin-left: 6px; }
        /* ONE Score 랭킹 */
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
        /* 최근 실거래 피드 (#16) */
        .frow { display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 10px; padding: 11px 0; border-top: 1px solid var(--color-line); }
        .frow:first-of-type { border-top: none; }
        .fmid { min-width: 0; }
        .fname { font-size: 13.5px; font-weight: 700; letter-spacing: -.2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .fsub { font-size: 11px; color: var(--color-ink-3); font-weight: 500; margin-top: 3px; }
        .fright { text-align: right; flex-shrink: 0; }
        .fprice { font-size: 14px; font-weight: 800; color: var(--color-ink); line-height: 1.1; }
        .fchg { font-size: 11px; font-weight: 800; margin-top: 2px; }
        .fchg.up { color: var(--color-danger); }
        .fchg.dn { color: var(--color-primary); }
        .fchg.fl { color: var(--color-ink-3); }
        /* 저평가 후보 */
        .urow { display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 10px; padding: 13px 0; border-top: 1px solid var(--color-line); }
        .urow:first-of-type { border-top: none; }
        .uname { font-size: 14px; font-weight: 700; }
        .usub { font-size: 11.5px; color: var(--color-ink-3); font-weight: 500; margin-top: 4px; }
        .usub b { color: var(--color-ink-2); font-weight: 600; }
        .ugap { font-size: 17px; font-weight: 800; color: var(--color-success); text-align: right; }
        /* 거시 chips */
        .chips { display: flex; flex-wrap: wrap; gap: 8px; }
        .chip { font-size: 12px; font-weight: 700; color: var(--color-ink-2); background: var(--color-card-soft); border-radius: 11px; padding: 9px 13px; }
        .chip b { color: var(--color-primary); margin-left: 3px; }
        .note { font-size: 11px; color: var(--color-ink-3); line-height: 1.55; margin-top: 13px; padding-top: 12px; border-top: 1px solid var(--color-line); }
        /* [R-5] 갭 분석 카드 */
        .gap5 { margin-top: 14px; padding-top: 12px; border-top: 1px dashed var(--color-line); }
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
        /* [R-5 시나리오B] 같은 동 후보 갭 카드 */
        .gapb-cand { padding: 10px 0; border-top: 1px solid var(--color-line); }
        .gapb-cand:first-of-type { border-top: none; }
        .gapb-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
        .gapb-nm { font-size: 13.5px; font-weight: 800; color: var(--color-ink); }
        .gap5-verdict.gapb-v { font-size: 12px; padding: 2px 9px; }
        .gapc-alert { width: 100%; margin-top: 10px; border: 1px solid var(--color-line); background: var(--color-card); color: var(--color-ink-2); border-radius: 10px; padding: 9px 0; font-size: 12.5px; font-weight: 700; cursor: pointer; font-family: var(--font-sans); }
        .gapc-alert.on { background: var(--color-primary-soft); border-color: var(--color-primary); color: var(--color-primary); }
        /* [R-6] 개인화 브리핑 */
        .pbrief { background: var(--color-card); border: 1px solid var(--color-primary); border-radius: 14px; padding: 13px 15px; margin-bottom: 14px; }
        .pbrief-set { display: flex; align-items: center; justify-content: space-between; gap: 10px; font-size: 12.5px; color: var(--color-ink-2); flex-wrap: wrap; }
        .pb-step { display: flex; gap: 9px; padding: 5px 0; font-size: 12.5px; line-height: 1.5; word-break: keep-all; }
        .pb-k { flex-shrink: 0; font-weight: 800; color: var(--color-primary); font-size: 11.5px; padding-top: 1px; }
        .pb-v { color: var(--color-ink-2); } .pb-v .up { color: var(--color-success); } .pb-v .dn { color: var(--color-danger); }
        .pb-cta { border: none; background: var(--color-primary); color: #fff; font-size: 12px; font-weight: 800; padding: 6px 12px; border-radius: 9px; cursor: pointer; font-family: var(--font-sans); margin-left: 4px; }
        /* [R-7] 미구현 로드맵 배지 */
        /* [거시 해석] 규칙 기반 방향성 카드 */
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
        .foot { font-size: 0.68rem; color: var(--color-ink-3); text-align: center; margin-top: 16px; line-height: 1.5; }
      `}</style>
      <style jsx global>{`body { background: var(--color-bg); margin: 0; }`}</style>
    </div>
  );
}
