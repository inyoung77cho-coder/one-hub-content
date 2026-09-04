// ONE-HUB v10 — 부동산 자산 대시보드 (PWA, onehub-realestate 5002 연동)
// ETF 대시보드와 동일 패턴. ONE Score 랭킹/시장 브리핑/저평가/거시. 확정 데이터는 진한색.
import { useEffect, useState } from "react";
import BottomNav from "../../components/BottomNav";
import AppHeader from "../../components/AppHeader";
import AssetMapTitle from "../../components/AssetMapTitle";
import { dedupBy } from "../../lib/useDedup";
import { ReForm } from "../../components/shared/AssetForms";
import Term from "../../components/Term";
import RePositionCard, { RegionLeadersCard, RegionForecastCard, MoveDifficultyCard } from "../../components/RePositionCard";
import { ensureDailySnapshot } from "../../lib/dailySnapshot"; // [S22-3] 총자산 곡선 적립 backstop
import useSwipeTabs from "../../components/shared/useSwipeTabs"; // [S25-5] 분석↔시나리오 스와이프
import SegTabs from "../../components/shared/SegTabs"; // [S26-5] 공용 세그먼트 탭
import ReNewHigh from "../../components/ReNewHigh"; // [S28-10] 신고가(없으면 안 뜸)
import { estimateSellCost, MOVE_COST_DISCLAIMER } from "../../lib/moveCost"; // [S22-9] 갈아타기 거래비용
import ReIncomeSummaryCard from "../../components/ReIncomeSummaryCard";

const uk = (n) => (n == null ? "-" : `${Number(n).toFixed(2)}억`);
const pct = (n) => (n == null ? "-" : `${n > 0 ? "+" : ""}${Number(n).toFixed(1)}%`);
// [v10 UI §1] 시맨틱: 저평가=초록(under), 고평가=빨강(over), 적정=회색(fair)
//   매수검토=파랑(buy·주요액션), 관망=회색(watch·중립)
const vtag = (v) => (v?.includes("저평가") ? "under" : v?.includes("고평가") ? "over" : "fair");
const jtag = (d) => (d?.includes("매수") ? "buy" : "watch");

export default function RealEstateDashboard() {
  const [brief, setBrief] = useState(null);
  const [rank, setRank] = useState(null);
  const [weekly, setWeekly] = useState(null); // [2026-08-22] 주간 전파·예측 리포트(단지별 예측 조회용)
  const [feed, setFeed] = useState(null); // [v11 #16] 최근 실거래 피드(평형 옵션 폴백)
  const [err, setErr] = useState(null);
  // [재구성] 분석 | 시나리오 2메뉴 — assets.js stockTab 패턴. localStorage 유지.
  const [reTab, setReTabState] = useState(() => {
    if (typeof window === "undefined") return "analysis";
    try { return localStorage.getItem("onehub_re_tab") === "scenario" ? "scenario" : "analysis"; } catch { return "analysis"; }
  });
  const setReTab = (v) => { setReTabState(v); try { localStorage.setItem("onehub_re_tab", v); } catch {} };
  const RE_TABS = ["analysis", "scenario"];
  const reSwipe = useSwipeTabs({ index: reTab === "scenario" ? 1 : 0, count: 2, onChange: (i) => setReTab(RE_TABS[i]) }); // [S25-5] 분석↔시나리오
  const [myC, setMyC] = useState("");   // [S5] 내 단지
  const [tgtC, setTgtC] = useState(""); // [S5] 갈아탈 목표 단지
  const [myProp, setMyProp] = useState(null); // [S5] 내 단지 상세(위저드 등록: 평형·동층·매수가·시점)
  const [wizOpen, setWizOpen] = useState(false); // [S5] 등록 위저드 열림
  const [wiz, setWiz] = useState({ name: "", pyeong: "", dongfloor: "", buyUk: "", buyMonth: "" });
  const [dbAreas, setDbAreas] = useState({}); // [S5+] 단지→평형(전용면적) 백엔드 로딩(complex-areas)
  const [dongMap, setDongMap] = useState({}); // [S5+] 단지→법정동 백엔드 로딩(complex-dongs)
  // [#1 다수 부동산] 대표 단지 외 추가 보유 부동산 목록. 각 {id,name,valueUk(평가금액),memo}
  const [reProps, setReProps] = useState([]);
  const [addProp, setAddProp] = useState(false); // 추가 폼 열림
  const [pName, setPName] = useState(""); const [pVal, setPVal] = useState(""); const [pMemo, setPMemo] = useState("");
  const [pDeposit, setPDeposit] = useState(""); const [pMonthly, setPMonthly] = useState(""); // [피드백] 전세/월세 보증금(억)·월수익(만원)
  const [pBuy, setPBuy] = useState(""); // [수익] 매수가(억, 선택) — 전체 평가손익 계산용
  const saveReProps = (list) => { setReProps(list); try { localStorage.setItem("onehub_re_properties", JSON.stringify(list)); window.dispatchEvent(new Event("onehub-assets-change")); } catch (e) {} };
  const addReProp = () => {
    const name = String(pName || "").trim(); const v = Number(pVal);
    if (!name || !(v > 0)) return;
    // [피드백] 보증금·월수익으로 순수투자금(평가−보증금)·월수익을 구분해 기록. 총자산(평가금액)은 그대로.
    const deposit = Math.max(0, Number(pDeposit) || 0);
    const monthly = Math.max(0, Number(pMonthly) || 0);
    const buyUk = Number(pBuy) > 0 ? Number(pBuy) : null; // [수익] 매수가(선택) — 있으면 평가손익 집계
    saveReProps([...reProps, { id: Date.now(), name, valueUk: v, buyUk, deposit, monthly, memo: String(pMemo || "").trim() }]);
    setPName(""); setPVal(""); setPMemo(""); setPDeposit(""); setPMonthly(""); setPBuy(""); setAddProp(false);
  };
  const delReProp = (id) => saveReProps(reProps.filter((p) => p.id !== id));
  // [item1] 부동산 검색 — 상단 🔍를 종목검색이 아니라 단지/관심지역 검색으로.
  const [reSearchOpen, setReSearchOpen] = useState(false);
  const [reSearchQ, setReSearchQ] = useState("");
  const [reSearchRes, setReSearchRes] = useState([]);
  // [S22-3] 부동산만 보고 나가도 그날 총자산 곡선에 1건 남긴다(backstop).
  useEffect(() => { ensureDailySnapshot(); }, []);

  // [S22-9] 분기 리듬 명시 — 부동산은 매일 볼 화면이 아니다. 다음 데이터 갱신(분기)을 정직하게 적는다.
  //   SSR 불일치 방지 위해 마운트 후 계산.
  const [nextQ, setNextQ] = useState(null);
  useEffect(() => {
    try {
      const now = new Date();
      const m = now.getMonth();
      const qs = [0, 3, 6, 9];
      let ny = now.getFullYear();
      let nm = qs.find((qm) => qm > m);
      if (nm === undefined) { nm = 0; ny += 1; }
      setNextQ(`${ny}년 ${nm + 1}월 1일`);
    } catch (e) {}
  }, []);
  useEffect(() => {
    if (!reSearchOpen) return;
    const q = reSearchQ.trim();
    if (q.length < 1) { setReSearchRes([]); return; }
    let alive = true;
    const t = setTimeout(() => {
      fetch(`/api/input/re-search?q=${encodeURIComponent(q)}`).then((r) => r.json())
        .then((d) => { if (alive) setReSearchRes(Array.isArray(d?.results) ? d.results : (Array.isArray(d?.items) ? d.items : [])); })
        .catch(() => { if (alive) setReSearchRes([]); });
    }, 250);
    return () => { alive = false; clearTimeout(t); };
  }, [reSearchQ, reSearchOpen]);
  const pickReSearch = (name) => { setReSearchOpen(false); setReSearchQ(""); try { setMyC(name); } catch (e) {} setWiz({ name, pyeong: "", dongfloor: "", buyUk: "", buyMonth: "" }); setWizOpen(true); };

  useEffect(() => {
    const g = (fn) => fetch(`/api/pwa/re/${fn}`).then((r) => r.json());
    Promise.all([g("briefing"), g("ranking"), g("feed"), g("weekly")])
      .then(([b, r, f, w]) => {
        if (b.error) setErr(b.error);
        setBrief(b); setRank(r); setFeed(f);
        if (w && w.ok) setWeekly(w); // pending/error 응답이면 조용히 무시(섹션 자체를 안 그림)
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
      const ua = localStorage.getItem("onehub_re_my_avm"); if (ua != null && ua !== "" && Number(ua) > 0) setUserAvm(Number(ua));
      const rp = localStorage.getItem("onehub_re_properties"); if (rp) { const arr = JSON.parse(rp); if (Array.isArray(arr)) setReProps(arr); }
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
  const pickMy = (v) => { setMyC(v); try { localStorage.setItem("onehub_re_my", v); } catch (e) {} };
  const pickTgt = (v) => { setTgtC(v); try { localStorage.setItem("onehub_re_target", v); } catch (e) {} };
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
    setMyProp(null); setMyC(""); setTgtC(""); setUserAvm(null); setShowComplexAvm(false);
    setDelConfirm(false); setWizOpen(false);
  };
  const saveWiz = () => {
    const name = String(wiz.name || "").trim();
    if (!name) return;
    const obj = { name, pyeong: wiz.pyeong, dongfloor: wiz.dongfloor, buyUk: wiz.buyUk, buyMonth: wiz.buyMonth };
    setMyProp(obj); setMyC(name);
    try { localStorage.setItem("onehub_re_my_property", JSON.stringify(obj)); localStorage.setItem("onehub_re_my", name); } catch (e) {}
    setWizOpen(false);
  };

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
  // [PI-2/AI-2] 내 단지·평형의 '팔 값'(신뢰 시세) 단일 계산 — 사용자입력 > 평형별 실거래(3건+) > 없음(잠금).
  //   갈아타기 갭·손실확정은 이 팔 값 위에서만 계산한다(못 믿는 시세면 갭도 잠금).
  const myPyeongPrice = () => {
    const area = myProp?.name ? (areaOptsFor(myProp.name) || []).find((a) => String(a.m2) === String(myProp?.pyeong)) : null;
    const tradeN = area && area.n != null ? area.n : null;
    const perUk = area ? (area.priceUk ?? area.maxUk ?? null) : null;
    const sparse = tradeN == null || tradeN < 3;
    if (userAvm != null) return { uk: userAvm, source: "user", tradeN, locked: false };
    if (!sparse && perUk != null) return { uk: perUk, source: "pyeong", tradeN, locked: false };
    return { uk: null, source: null, tradeN, locked: true };
  };
  // [#4 평가금액] 부동산 자산가치 = 대표(평형별 평가시세, 없으면 매수가) + 추가 보유 평가금액 합 → 총자산 원장(onboard)에 반영.
  //   주식·ETF와 동일하게 '평가금액' 기준으로 통일. 대표 평형 시세가 잠금이면(희소평형) 매수가로 보수적 대체.
  const repEvalUk = (() => { const p = myPyeongPrice(); return p.uk != null ? p.uk : (Number(myProp?.buyUk) || 0); })();
  const reTotalEvalUk = Math.round((repEvalUk + reProps.reduce((s, p) => s + (Number(p.valueUk) || 0), 0)) * 100) / 100;
  // [2026-08-22] 보유/관심 부동산 예측 — weekly_report.py의 전파(대장-후행) 예측을 단지명으로 조회.
  //   ★대장(시범삼성) 인근 13개 단지에서만 검증된 모델이라, 해당 안 되면 조용히 null(추측성 예측 금지).
  const findForecast = (name) => (weekly?.ai_all || []).find((a) => a.단지명 === name) || null;
  useEffect(() => {
    try {
      const onb = JSON.parse(localStorage.getItem("onehub_onboard_assets") || "{}") || {};
      if (reTotalEvalUk > 0 && onb.realestate_uk !== reTotalEvalUk) {
        onb.realestate_uk = reTotalEvalUk;
        localStorage.setItem("onehub_onboard_assets", JSON.stringify(onb));
        window.dispatchEvent(new Event("onehub-assets-change"));
      }
    } catch (e) {}
  }, [reTotalEvalUk]);
  // 법정동: 백엔드(complex-dongs) 우선 → 랭킹 필드 → 브리핑 지역
  const dongOf = (name) => {
    if (dongMap[name]) return dongMap[name];
    const row = (rank?.ranking || []).find((r) => r.단지명 === name);
    return row?.법정동 || row?.법정동명 || brief?.region || null;
  };
  const myDong = myProp?.name ? dongOf(myProp.name) : (brief?.region || null);

  return (
    <div className="re pwa-shell" onTouchStart={reSwipe.onTouchStart} onTouchMove={reSwipe.onTouchMove} onTouchEnd={reSwipe.onTouchEnd}>
      {/* [사용자 지시] 상위 메뉴는 고정하고 그 아래 내용만 스크롤 */}
      <div className="sticky-hdr">
        <AppHeader onSearch={() => setReSearchOpen(true)} />
        {/* [사용자 지시] "종합자산 자산지도"에서 direct 연결되므로 상위 메뉴바를 그대로 이어 붙인다 */}
        <AssetMapTitle current="부동산" />
        {/* [재구성] 분석 | 시나리오 세그먼트 컨트롤 — 주식 보유/추천 패턴 */}
        <SegTabs items={[{ key: "analysis", label: "분석" }, { key: "scenario", label: "시나리오" }]}
          index={reTab === "scenario" ? 1 : 0} onChange={(i) => setReTab(RE_TABS[i])} ariaLabel="부동산 분석/시나리오" />
      </div>

      {/* [S28-10] 신고가 — 부동산 화면 최상단(내 단지 우선). 신고가 없는 날엔 렌더 안 함. */}
      <ReNewHigh />

      {/* [item1] 부동산 찾기 — 단지 검색 + 대장 아파트 + 관심지역(동) */}
      {reSearchOpen && (
        <div className="resr-scrim" onClick={() => setReSearchOpen(false)}>
          <div className="resr" onClick={(e) => e.stopPropagation()}>
            <div className="resr-h">🔍 부동산 찾기<button className="resr-x" onClick={() => setReSearchOpen(false)} aria-label="닫기">✕</button></div>
            <input className="resr-in" autoFocus placeholder="단지명 검색 (예: 시범, 파크뷰)" value={reSearchQ} onChange={(e) => setReSearchQ(e.target.value)} />
            {reSearchQ.trim() ? (
              <div className="resr-list">
                {reSearchRes.length ? reSearchRes.slice(0, 12).map((nm, i) => (
                  <button className="resr-row" key={i} onClick={() => pickReSearch(nm)}>🏠 {nm}<span className="resr-go">내 단지로 →</span></button>
                )) : <div className="resr-empty">검색 결과 없음 · 다른 이름으로 시도해 보세요.</div>}
              </div>
            ) : (
              <>
                <div className="resr-sec">🏆 대장 아파트 <span>ONE Score 상위</span></div>
                <div className="resr-chips">
                  {(rank?.ranking ? dedupBy(rank.ranking, (c) => c.단지ID || c.단지명).sort((a, b) => (b.one_score ?? 0) - (a.one_score ?? 0)).slice(0, 6) : []).map((c, i) => (
                    <button className="resr-chip" key={i} onClick={() => pickReSearch(c.단지명)}>{c.단지명}{c.one_score != null && <em>{c.one_score}</em>}</button>
                  ))}
                </div>
                <div className="resr-note">DB에 축적된 실거래 단지를 찾습니다. <b>단지</b>를 누르면 내 단지로 등록됩니다.</div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ══ 분석 탭 (읽기 전용) — 한 줄 결론 + 포지션 / 대장 비교 / 추세 / 갈아타기 난이도 ══ */}
      {reTab === "analysis" && (<>
        {/* [§3-7 피드백15] #1 결론 한 줄 — 국면 + 저평가 1위(위계 확립) */}
        {brief && !brief.error && (() => {
          const topU = brief.under?.[0];
          return (
            <div className="re-verdict">
              <div className="rv-h"><span className="rv-lbl">📌 이 지역 한 줄 결론</span><span className={`rv-phase ${jtag(brief.phase)}`}>{String(brief.phase || "").replace(/\s*국면\s*$/, "")} 국면</span></div>
              <div className="rv-sub">
                대장 <b>{brief.leader}</b> {uk(brief.leader_price)}
                <Term term="국민평형">전용 84㎡·국민평형 기준</Term> · 분기 <b>{pct(brief.chg_q)}</b>
                {topU && <> · 저평가 1위 <b className="rv-under">{topU.단지명} +{Number(topU.gap).toFixed(1)}%</b></>}
              </div>
            </div>
          );
        })()}

        {/* [S22-9] 분기 리듬 명시 — 부동산은 매일 보는 화면이 아니다. 정직한 주기 표시가 신뢰를 만든다. */}
        {nextQ && (
          <div style={{ fontSize: "0.72rem", color: "var(--color-ink-3)", margin: "0 2px 10px", lineHeight: 1.5 }}>📅 부동산은 분기·연 단위로 움직입니다 — 다음 데이터 갱신 <b>{nextQ}</b>. 매일 볼 화면이 아니에요.</div>
        )}

        {/* [§3.7·§3.8] 내 단지 포지션 — 막대+실선(계단)으로 대장 대비 위치·평형별 적정가 */}
        {myProp?.name && brief && !brief.error && (
          <RePositionCard brief={brief} myProp={myProp} dongOf={dongOf} userAvm={userAvm} />
        )}

        {/* [S22-9] 갈아타기 참고 — 내 집을 지금 팔 때 드는 거래비용(중개비·양도세 간이 추정). 유료 후보의 씨앗. */}
        {myProp?.name && repEvalUk > 0 && (() => {
          const sc = estimateSellCost({ sellPriceUk: repEvalUk, buyPriceUk: Number(myProp?.buyUk) || 0 });
          return (
            <section className="card">
              <div style={{ fontSize: "0.86rem", fontWeight: 800, marginBottom: 8 }}>🔁 갈아타기 참고 <span style={{ fontWeight: 600, fontSize: "0.72rem", color: "var(--color-ink-3)" }}>내 집을 지금 팔면</span></div>
              <div style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: "0.8rem", color: "var(--color-ink-2)" }}>
                <div style={{ display: "flex" }}><span>예상 매도가</span><b style={{ marginLeft: "auto", color: "var(--color-ink)" }}>{uk(repEvalUk)}</b></div>
                <div style={{ display: "flex" }}><span>중개보수(추정)</span><b style={{ marginLeft: "auto" }}>−{uk(sc.broker)}</b></div>
                <div style={{ display: "flex" }}><span>양도세(추정)</span><b style={{ marginLeft: "auto" }}>{sc.capGain > 0 ? `−${uk(sc.capGain)}` : "비과세(1주택·2년)"}</b></div>
                <div style={{ display: "flex", borderTop: "1px solid var(--color-line)", paddingTop: 5, marginTop: 2 }}><span style={{ fontWeight: 700 }}>손에 쥐는 금액(추정)</span><b style={{ marginLeft: "auto", color: "var(--color-primary)" }}>{uk(Math.round((repEvalUk - sc.total) * 100) / 100)}</b></div>
              </div>
              <div style={{ marginTop: 8, fontSize: "0.66rem", color: "var(--color-ink-3)", lineHeight: 1.4 }}>상급지로 갈아타려면 여기에 목표 단지 취득세·중개비와 시세 차액이 더 듭니다. ⚖️ {MOVE_COST_DISCLAIMER}</div>
            </section>
          );
        })()}

        {/* [Card2] 동네별 대장 비교 — 주간 사전선정(region_leaders) 가벼운 읽기 */}
        {myProp?.name && (
          <RegionLeadersCard myRegion={myDong || brief?.region || "서현동"} />
        )}

        {/* [Card3] 동네별 대장 가격 추세 · 년도별 예측(시나리오 밴드) */}
        {myProp?.name && (
          <RegionForecastCard myRegion={myDong || brief?.region || "서현동"} />
        )}

        {/* [신규] 갈아타기 난이도 — 구 "동네별 격차 변화" 재명명·재해석(점선 없음) */}
        {myProp?.name && (
          <MoveDifficultyCard myRegion={myDong || brief?.region || "서현동"} />
        )}
      </>)}

      {/* ══ 시나리오 탭 (입력·계산) — 자산 입력(등록/목록) + 수익 요약 ══ */}
      {reTab === "scenario" && (<>
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

      {/* [#1 다수 부동산] 대표 단지 외 추가 보유 부동산 목록 — 합계는 평가금액 기준(#4) */}
      {myProp && (
        <section className="card reprop-card">
          <div className="rp-h">
            <div className="rp-title">🏘 내 부동산 <span className="rp-sub">대표 외 추가 보유</span></div>
            <button className="rp-add-btn" onClick={() => setAddProp((v) => !v)}>{addProp ? "취소" : "＋ 추가"}</button>
          </div>
          <div className="rp-row rep">
            <span className="rp-name">⭐ {myProp.name} <span className="rp-tag">대표</span></span>
            <span className="rp-val">{uk(repEvalUk)}<em>{myPyeongPrice().uk != null ? "평가" : "매수가"}</em></span>
          </div>
          {(() => {
            const fc = findForecast(myProp.name);
            return fc && (
              <div className="rp-forecast">🔮 전파 예측 {fc.현재가}억 → {fc.예측가}억 ({fc.괴리율 > 0 ? "+" : ""}{fc.괴리율}%, {fc.괴리율 > 5 ? "저평가" : fc.괴리율 < -5 ? "고평가" : "적정"}) · 대장 시범삼성 기준 · 투자자문 아님</div>
            );
          })()}
          {reProps.map((p) => {
            const dep = Number(p.deposit) || 0, mon = Number(p.monthly) || 0;
            const netUk = Math.round(((Number(p.valueUk) || 0) - dep) * 100) / 100;
            const buy = Number(p.buyUk) > 0 ? Number(p.buyUk) : null; // [수익] 매수가 있으면 평가손익 표시
            const pnl = buy != null ? Math.round(((Number(p.valueUk) || 0) - buy) * 100) / 100 : null;
            const pnlPct = pnl != null && buy ? (pnl / buy) * 100 : null;
            const fc = findForecast(p.name);
            return (
              <div key={p.id}>
              <div className="rp-row">
                <span className="rp-name">🏠 {p.name}{p.memo ? <span className="rp-memo"> · {p.memo}</span> : null}
                  {(dep > 0 || mon > 0) && (
                    <span className="rp-invest">순수투자금 {uk(netUk)}{dep > 0 ? ` (보증금 ${uk(dep)} 차감)` : ""}{mon > 0 ? ` · 월 ${mon.toLocaleString()}만원` : ""}</span>
                  )}
                  {pnl != null && (
                    <span className={`rp-pnl ${pnl >= 0 ? "pos" : "neg"}`}>평가손익 {pnl >= 0 ? "+" : ""}{uk(pnl)}{pnlPct != null ? ` · ${pct(pnlPct)}` : ""} <em>매수 {uk(buy)}</em></span>
                  )}
                </span>
                <span className="rp-val">{uk(p.valueUk)}<em>평가</em></span>
                <button className="rp-del" onClick={() => delReProp(p.id)} aria-label="삭제">✕</button>
              </div>
              {fc && (
                <div className="rp-forecast">🔮 전파 예측 {fc.현재가}억 → {fc.예측가}억 ({fc.괴리율 > 0 ? "+" : ""}{fc.괴리율}%, {fc.괴리율 > 5 ? "저평가" : fc.괴리율 < -5 ? "고평가" : "적정"}) · 대장 시범삼성 기준 · 투자자문 아님</div>
              )}
              </div>
            );
          })}
          {addProp && (
            <div className="rp-form">
              <input className="rp-in" placeholder="단지/부동산명" value={pName} onChange={(e) => setPName(e.target.value)} />
              <input className="rp-in num" type="number" inputMode="decimal" placeholder="평가금액(억)" value={pVal} onChange={(e) => setPVal(e.target.value)} />
              <input className="rp-in num" type="number" inputMode="decimal" placeholder="매수가(억, 선택·손익계산)" value={pBuy} onChange={(e) => setPBuy(e.target.value)} />
              <input className="rp-in num" type="number" inputMode="decimal" placeholder="전세/월세 보증금(억, 선택)" value={pDeposit} onChange={(e) => setPDeposit(e.target.value)} />
              <input className="rp-in num" type="number" inputMode="decimal" placeholder="월수익(만원, 선택)" value={pMonthly} onChange={(e) => setPMonthly(e.target.value)} />
              <input className="rp-in" placeholder="메모(선택)" value={pMemo} onChange={(e) => setPMemo(e.target.value)} />
              <button className="rp-save" onClick={addReProp}>추가</button>
            </div>
          )}
          <div className="rp-total"><span>부동산 합계 <em>평가금액</em></span><b>{uk(reTotalEvalUk)}</b></div>
          {(() => {
            const dep = reProps.reduce((s, p) => s + (Number(p.deposit) || 0), 0);
            const mon = reProps.reduce((s, p) => s + (Number(p.monthly) || 0), 0);
            if (dep <= 0 && mon <= 0) return null;
            return (
              <div className="rp-invest-total">
                <span>추가 보유 순수투자금 <em>보증금 차감</em></span>
                <b>{uk(Math.round((reProps.reduce((s, p) => s + (Number(p.valueUk) || 0), 0) - dep) * 100) / 100)}{mon > 0 ? ` · 월 ${mon.toLocaleString()}만원` : ""}</b>
              </div>
            );
          })()}
          <div className="rp-note">[사용자 지시] 종합자산의 <b>총자산</b>에는 보증금을 뺀 <b>순수투자금(평가−보증금)</b>이 반영됩니다 — 전세는 세입자에게 갚아야 할 금액이라 내 자산이 아니기 때문입니다. 여기 목록의 <b>평가</b>는 부동산 자체의 시세를 보여드리는 값입니다. <b>월수익</b>은 별도 참고 기록입니다.</div>
        </section>
      )}

      {/* [신규] 수익 요약 — 보유 부동산 전체 평가손익(대표 + 매수가 입력된 추가 부동산) + 임대수익 합계 */}
      {myProp && (() => {
        const _sp = myPyeongPrice();
        const _curUk = _sp.uk;
        const _buyUk = Number(myProp?.buyUk) || null;
        const _repPnlUk = (_curUk != null && _buyUk) ? Math.round((_curUk - _buyUk) * 100) / 100 : null;
        const _repPnlPct = (_repPnlUk != null && _buyUk) ? (_repPnlUk / _buyUk) * 100 : null;
        const _dep = reProps.reduce((s, p) => s + (Number(p.deposit) || 0), 0);
        const _mon = reProps.reduce((s, p) => s + (Number(p.monthly) || 0), 0);
        const _valSum = reProps.reduce((s, p) => s + (Number(p.valueUk) || 0), 0);
        const _netUk = Math.round((_valSum - _dep) * 100) / 100;
        // [수익] 전체 평가손익 = 대표(매수가 있고 시세 신뢰 시) + 매수가 입력된 추가 부동산.
        //   손익률 분모는 '집계에 포함된 매수가 합'(손익을 낸 자산의 매수가만).
        let _pnlSum = 0, _buyBasis = 0, _pnlCount = 0;
        if (_repPnlUk != null && _buyUk) { _pnlSum += _repPnlUk; _buyBasis += _buyUk; _pnlCount++; }
        reProps.forEach((p) => {
          const b = Number(p.buyUk) > 0 ? Number(p.buyUk) : null;
          if (b != null) { _pnlSum += (Number(p.valueUk) || 0) - b; _buyBasis += b; _pnlCount++; }
        });
        const _totalPnlUk = _pnlCount > 0 ? Math.round(_pnlSum * 100) / 100 : null;
        const _totalPnlPct = _totalPnlUk != null && _buyBasis > 0 ? (_totalPnlUk / _buyBasis) * 100 : null;
        // 대표만 손익이 있으면 '대표 단지 기준'으로, 추가 부동산도 있으면 '전체'로 라벨 구분.
        const _pnlScope = _pnlCount > 1 ? "all" : (_pnlCount === 1 ? "rep" : "none");
        return (
          <ReIncomeSummaryCard
            totalEvalUk={reTotalEvalUk}
            totalPnlUk={_totalPnlUk}
            totalPnlPct={_totalPnlPct}
            pnlScope={_pnlScope}
            totalDepositUk={_dep}
            totalMonthly={_mon}
            totalNetUk={_netUk}
          />
        );
      })()}
      </>)}

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

      <div className="foot">📍 현재 <b>분당구·수지구·광교(수원 영통)·서울 강남4구(강남·서초·송파·강동) 주요 동 단지</b> 실거래 기준입니다(전국·전 지역이 아닙니다). 지역·단지마다 모델 <Term term="설명력">설명력(R²)</Term>이 다르며 낮은 곳은 정직하게 표시합니다. 실거래 기반 확정 지표 + 회귀 예측(근사) · 예측치는 참고용이며 투자판단은 본인 책임.</div>

      <BottomNav active="assets" />

      <style jsx>{`
        .re { max-width: 480px; margin: 0 auto; padding: 0 14px var(--nav-clearance-fab); font-family: var(--font-sans); color: var(--color-ink); }
        /* [사용자 지시] 상위 메뉴 고정 */
        .sticky-hdr { position: sticky; top: 0; z-index: 140; background: var(--color-bg); margin: 0 -14px; padding: 0 14px; }
        /* [재구성] 분석 | 시나리오 세그먼트 — assets.js .as-stocktabs 패턴 */
        /* [S26-5] re-tabs → 공용 SegTabs 로 이관(정본). 죽은 규칙 제거. */
        .partner-cta { display: flex; align-items: center; justify-content: space-between; gap: 10px; text-decoration: none; background: var(--color-card); border: 1px solid var(--color-line); border-radius: var(--radius-card, 14px); padding: 14px 16px; margin: 4px 0 14px; box-shadow: var(--shadow-card); }
        .partner-cta .pc-l { display: flex; align-items: center; gap: 10px; }
        .partner-cta .pc-ic { font-size: var(--fs-6); }
        .partner-cta b { display: block; color: var(--color-ink); font-size: var(--fs-4); }
        .partner-cta .pc-sub { display: block; color: var(--color-muted); font-size: var(--fs-2); margin-top: 2px; }
        .partner-cta .pc-arrow { color: var(--color-primary); font-weight: 700; }
        .err { background: var(--color-danger-soft); color: var(--color-danger); padding: 10px 12px; border-radius: var(--radius-sm); font-size: var(--fs-3); margin-bottom: 12px; }
        .card { background: var(--color-card); border: 1px solid var(--color-line); border-radius: var(--radius-card); padding: 16px; margin-bottom: 12px; box-shadow: var(--shadow-card); }
        /* HERO — 시장 브리핑 */
        /* [§3.7·§3.8] 내 단지 포지션 카드 — 최상단 */
        .mypos { border-left: 4px solid var(--color-primary); }
        .mypos-h { font-size: var(--fs-4); font-weight: 800; color: var(--color-ink); margin-bottom: 8px; }
        .mypos-main { font-size: var(--fs-5); font-weight: 700; color: var(--color-ink); word-break: keep-all; }
        .mypos-main b { font-weight: 800; }
        .mypos-vs { font-size: var(--fs-3); font-weight: 600; color: var(--color-ink-2); margin-top: 6px; word-break: keep-all; line-height: 1.5; }
        .mypos-r { color: var(--color-primary); font-weight: 800; }
        .mypos-trend { font-size: var(--fs-2); font-weight: 600; color: var(--color-ink-3); margin-top: 6px; font-variant-numeric: tabular-nums; }
        .mypos-cta { margin-top: 11px; min-height: 42px; width: 100%; border: 1px solid var(--color-line); background: var(--color-card); color: var(--color-primary); border-radius: var(--radius-sm); font-size: var(--fs-3); font-weight: 800; cursor: pointer; font-family: var(--font-sans); }
        /* [사용자 지시] 다른 페이지(ETF 등)와 동일하게 라이트 카드로 통일 */
        .hero { background: var(--color-card); color: var(--color-ink); border: 1px solid var(--color-line); border-radius: var(--radius-card, 14px); padding: 16px; box-shadow: var(--shadow-card); margin-bottom: 12px; }
        .hero .eyebrow { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 14px; }
        .hero .lbl { font-size: var(--fs-2); font-weight: 700; color: var(--color-ink-2); }
        .live { background: var(--color-success); color: #04351f; font-size: var(--fs-1); font-weight: 800; padding: 3px 7px; border-radius: var(--radius-sm); letter-spacing: .5px; }
        .hero .big { font-size: var(--fs-8); font-weight: 800; letter-spacing: -.6px; line-height: 1; }
        .brief-lead { font-size: var(--fs-2); color: var(--color-ink-2); margin-top: 11px; }
        .brief-lead b { color: var(--color-ink); font-weight: 700; }
        .brief-stats { display: flex; gap: 9px; margin-top: 16px; }
        .bstat { flex: 1; background: var(--color-card-soft, var(--color-bg)); border: 1px solid var(--color-line); border-radius: var(--radius-md); padding: 11px 13px; }
        .bstat span { display: block; font-size: var(--fs-1); color: var(--color-ink-3); font-weight: 600; margin-bottom: 4px; }
        .bstat b { font-size: var(--fs-5); font-weight: 800; color: var(--color-primary); }
        /* [§3-7] #1 결론 strip */
        .re-verdict { background: var(--color-card); border: 1px solid var(--color-line); border-left: 4px solid var(--color-primary); border-radius: var(--radius-card); box-shadow: var(--shadow-card); padding: 14px 16px; margin-bottom: 12px; }
        .rv-h { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
        .rv-lbl { font-size: var(--fs-2); font-weight: 700; color: var(--color-ink-2); }
        .rv-phase { font-size: var(--fs-3); font-weight: 800; padding: 3px 10px; border-radius: var(--radius-sm); }
        .rv-phase.watch { background: var(--color-card-soft); color: var(--color-ink-2); }
        .rv-phase.buy { background: var(--color-primary-soft); color: var(--color-primary); }
        .rv-sub { font-size: var(--fs-3); color: var(--color-ink-2); margin-top: 8px; line-height: 1.5; word-break: keep-all; }
        .rv-sub b { color: var(--color-ink); font-weight: 700; }
        .rv-under { color: var(--color-success) !important; }
        /* slim CTA */
        .cta-slim { display: flex; align-items: center; gap: 10px; background: var(--color-primary-soft); border-radius: var(--radius-md); padding: 13px 15px; margin-bottom: 14px; font-size: var(--fs-2); color: var(--color-ink-2); font-weight: 600; cursor: pointer; line-height: 1.5; }
        .cta-txt { flex: 1; word-break: keep-all; }
        .cta-slim b { color: var(--color-primary); font-weight: 700; }
        /* [R-1] 등록 전 블러 프리뷰 */
        .preview5 { border: 1px solid var(--color-line); border-radius: var(--radius-md); overflow: hidden; margin-bottom: 14px; }
        .pv-sample { padding: 15px; background: var(--color-card); }
        .pv-title { font-size: var(--fs-4); font-weight: 800; color: var(--color-ink); margin-bottom: 10px; }
        .pv-row { display: flex; align-items: center; justify-content: space-between; padding: 8px 0; border-top: 1px solid var(--color-line); }
        .pv-row:first-of-type { border-top: none; }
        .pv-lbl { font-size: var(--fs-3); color: var(--color-ink-2); font-weight: 600; }
        .pv-blur { font-size: var(--fs-3); font-weight: 800; color: var(--color-ink); filter: blur(5px); user-select: none; }
        .pv-over { padding: 14px 15px; background: var(--color-primary-soft); border-top: 1px solid var(--color-primary); }
        .pv-h { font-size: var(--fs-3); font-weight: 800; color: var(--color-ink); margin-bottom: 8px; }
        .pv-list { margin: 0 0 12px; padding-left: 18px; }
        .pv-list li { font-size: var(--fs-2); color: var(--color-ink-2); line-height: 1.75; word-break: keep-all; }
        .pv-cta { width: 100%; border: none; background: var(--color-primary); color: var(--color-on-primary); font-size: var(--fs-3); font-weight: 800; padding: 12px 0; border-radius: var(--radius-sm); cursor: pointer; font-family: var(--font-sans); }
        .cta-slim .arr { color: var(--color-primary); font-weight: 800; flex-shrink: 0; }
        /* [S5] 갈아타기 갭 트래커 */
        .gap-selects { display: flex; align-items: flex-end; gap: 8px; }
        .gap-sel { flex: 1; display: flex; flex-direction: column; gap: 4px; font-size: var(--fs-1); color: var(--color-ink-3); font-weight: 700; }
        .gap-sel select { border: 1px solid var(--color-line); background: var(--color-bg); border-radius: var(--radius-sm); padding: 9px 8px; font-size: var(--fs-3); font-family: var(--font-sans); color: var(--color-ink); }
        .gap-sel select:focus { outline: none; border-color: var(--color-primary); }
        .gap-arrow { font-size: var(--fs-5); font-weight: 800; color: var(--color-ink-3); padding-bottom: 9px; }
        .gap-result { margin-top: 14px; }
        .gap-amt { font-size: var(--fs-4); font-weight: 700; color: var(--color-ink-2); display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
        .gap-amt b { font-size: var(--fs-6); font-weight: 800; font-family: var(--font-display, var(--font-sans)); }
        .gap-amt b.pos { color: var(--color-primary); } .gap-amt b.neg { color: var(--color-success); }
        .gap-dir { font-size: var(--fs-1); font-weight: 600; color: var(--color-ink-3); }
        .gap-rows { display: flex; flex-direction: column; gap: 6px; margin-top: 11px; }
        .gap-row { display: flex; align-items: center; justify-content: space-between; background: var(--color-card-soft); border-radius: var(--radius-sm); padding: 8px 12px; font-size: var(--fs-3); color: var(--color-ink); }
        .gap-row b { font-family: ui-monospace, monospace; font-weight: 800; }
        .gap-note { font-size: var(--fs-1); color: var(--color-ink-3); margin-top: 11px; line-height: 1.55; word-break: keep-all; }
        .gap-note b { color: var(--color-ink-2); font-weight: 700; }
        .gap-empty { margin-top: 12px; font-size: var(--fs-2); color: var(--color-ink-2); line-height: 1.6; word-break: keep-all; }
        .gap-empty b { color: var(--color-ink); font-weight: 700; }
        /* [S5] 갭 밴드(상대가치·추정) */
        .gap-band { margin-top: 14px; }
        .gb-h { display: flex; align-items: center; gap: 8px; margin-bottom: 7px; }
        .gb-lbl { font-size: var(--fs-2); font-weight: 800; color: var(--color-ink-2); }
        .gb-tag { font-size: var(--fs-1); font-weight: 800; padding: 2px 7px; border-radius: var(--radius-sm); background: var(--color-warning-soft); color: var(--color-warning-ink); }
        .gb-track { position: relative; height: 10px; background: var(--color-card-soft); border-radius: 999px; overflow: hidden; }
        .gb-fill { position: absolute; top: 0; bottom: 0; background: var(--color-primary-soft); }
        .gb-mid { position: absolute; top: -2px; bottom: -2px; width: 2px; background: var(--color-primary); transform: translateX(-1px); }
        .gb-scale { display: flex; justify-content: space-between; font-size: var(--fs-1); color: var(--color-ink-3); font-weight: 600; margin-top: 5px; }
        .gb-scale span:nth-child(2) { color: var(--color-primary); font-weight: 800; }
        /* [S5] 내 단지 요약 카드 */
        .myprop-card .mp-h { display: flex; align-items: center; justify-content: space-between; }
        .mp-title { font-size: var(--fs-4); font-weight: 700; color: var(--color-ink-2); }
        .mp-title b { color: var(--color-ink); font-weight: 800; margin-left: 4px; }
        .mp-edit { border: 1px solid var(--color-line); background: var(--color-card); color: var(--color-ink-2); border-radius: var(--radius-sm); padding: 5px 12px; font-size: var(--fs-2); font-weight: 700; font-family: var(--font-sans); cursor: pointer; }
        .mp-actions { display: flex; gap: 6px; flex-shrink: 0; }
        .mp-del { border: 1px solid var(--color-danger); background: var(--color-card); color: var(--color-danger); border-radius: var(--radius-sm); padding: 5px 12px; font-size: var(--fs-2); font-weight: 700; font-family: var(--font-sans); cursor: pointer; white-space: nowrap; }
        .mp-del.confirm { background: var(--color-danger); color: var(--color-on-primary); }
        .scr-anom { font-size: var(--fs-1); font-weight: 800; color: var(--color-warning-ink, var(--color-warning)); background: var(--color-warning-soft); padding: 1px 6px; border-radius: var(--radius-sm); margin-left: 5px; white-space: nowrap; }
        .scr-rep { font-size: var(--fs-1); font-weight: 500; color: var(--color-ink-3); }
        .scr-n { font-size: var(--fs-1); font-weight: 600; color: var(--color-ink-3); }
        .mp-meta { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 9px; }
        .mp-meta span { font-size: var(--fs-1); font-weight: 700; background: var(--color-card-soft); color: var(--color-ink-2); border-radius: var(--radius-sm); padding: 4px 9px; }
        .mp-pnl { display: flex; gap: 10px; margin-top: 12px; }
        .mp-now, .mp-diff { flex: 1; background: var(--color-card-soft); border-radius: var(--radius-sm); padding: 11px 13px; }
        .mp-now span, .mp-diff span { display: block; font-size: var(--fs-1); color: var(--color-ink-3); font-weight: 600; margin-bottom: 4px; }
        .mp-now b, .mp-diff b { font-size: var(--fs-5); font-weight: 800; }
        .mp-diff em { font-style: normal; font-size: var(--fs-1); font-weight: 800; background: var(--color-warning-soft); color: var(--color-warning-ink); padding: 1px 5px; border-radius: var(--radius-sm); margin-left: 5px; vertical-align: middle; }
        .mp-diff.pos b { color: var(--color-success); } .mp-diff.neg b { color: var(--color-danger); }
        .mp-diff.hold b { font-size: var(--fs-2); font-weight: 700; color: var(--color-ink-2); line-height: 1.4; word-break: keep-all; }
        .mp-nomatch { font-size: var(--fs-2); color: var(--color-ink-2); background: var(--color-card-soft); border-radius: var(--radius-sm); padding: 10px 12px; margin-top: 11px; line-height: 1.5; word-break: keep-all; }
        .mp-now em { font-style: normal; font-size: var(--fs-1); font-weight: 700; color: var(--color-ink-3); margin-left: 5px; }
        /* [AI-2/3] 시세 출처 액션 + 직접입력 */
        .mp-src-actions { display: flex; align-items: center; gap: 9px; margin-top: 9px; flex-wrap: wrap; }
        .mp-src-btn { border: 1px solid var(--color-line); background: var(--color-card); color: var(--color-ink-2); border-radius: var(--radius-sm); padding: 6px 12px; font-size: var(--fs-2); font-weight: 700; cursor: pointer; font-family: var(--font-sans); }
        .mp-src-warn { font-size: var(--fs-1); color: var(--color-warning-ink, var(--color-warning)); }
        /* [AI-3] 신뢰도 카드(확인이 필요합니다) */
        .mp-trust { margin-top: 11px; background: var(--color-warning-soft); border: 1px solid var(--color-warning-ink, var(--color-warning)); border-radius: var(--radius-md); padding: 13px 14px; }
        .mp-trust-h { font-size: var(--fs-4); font-weight: 800; color: var(--color-warning-ink, var(--color-warning)); margin-bottom: 6px; }
        .mp-trust-b { font-size: var(--fs-2); color: var(--color-ink-2); line-height: 1.55; word-break: keep-all; }
        .mp-trust-btns { display: flex; gap: 8px; margin-top: 11px; flex-wrap: wrap; }
        .mp-trust-primary { border: none; background: var(--color-primary); color: var(--color-on-primary); border-radius: var(--radius-sm); padding: 8px 15px; font-size: var(--fs-2); font-weight: 800; cursor: pointer; font-family: var(--font-sans); }
        .mp-trust-second { border: 1px solid var(--color-line); background: var(--color-card); color: var(--color-ink-2); border-radius: var(--radius-sm); padding: 8px 15px; font-size: var(--fs-2); font-weight: 700; cursor: pointer; font-family: var(--font-sans); }
        /* [AI-3] 내 시세 직접입력 인라인 */
        .mp-avm-edit { display: flex; align-items: center; gap: 7px; margin-top: 10px; flex-wrap: wrap; background: var(--color-card-soft); border-radius: var(--radius-sm); padding: 9px 11px; }
        .mp-avm-lbl { font-size: var(--fs-1); font-weight: 700; color: var(--color-ink-2); }
        .mp-avm-in { flex: 1; min-width: 90px; border: 1px solid var(--color-line); border-radius: var(--radius-sm); padding: 7px 10px; font-size: var(--fs-4); font-family: var(--font-sans); background: var(--color-card); color: var(--color-ink); }
        .mp-avm-save { border: none; background: var(--color-primary); color: var(--color-on-primary); border-radius: var(--radius-sm); padding: 7px 13px; font-size: var(--fs-2); font-weight: 800; cursor: pointer; font-family: var(--font-sans); }
        .mp-avm-cancel { border: 1px solid var(--color-line); background: var(--color-card); color: var(--color-ink-2); border-radius: var(--radius-sm); padding: 7px 11px; font-size: var(--fs-2); font-weight: 700; cursor: pointer; font-family: var(--font-sans); }
        .mp-note { font-size: var(--fs-1); color: var(--color-ink-3); margin-top: 10px; line-height: 1.5; word-break: keep-all; }
        /* [#1 다수 부동산] 추가 보유 목록 */
        .rp-h { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
        .rp-title { font-size: var(--fs-4); font-weight: 800; color: var(--color-ink); }
        .rp-sub { font-size: var(--fs-1); font-weight: 600; color: var(--color-ink-3); margin-left: 4px; }
        .rp-add-btn { border: 1px solid var(--color-primary); background: var(--color-card); color: var(--color-primary); border-radius: var(--radius-sm); padding: 5px 11px; font-size: var(--fs-2); font-weight: 700; cursor: pointer; font-family: var(--font-sans); }
        .rp-row { display: flex; align-items: center; gap: 8px; padding: 9px 0; border-bottom: 1px solid var(--color-line); }
        .rp-row.rep { background: var(--color-card-soft); border-radius: var(--radius-sm); padding: 9px 11px; border-bottom: none; margin-bottom: 4px; }
        .rp-name { flex: 1; min-width: 0; font-size: var(--fs-3); font-weight: 700; color: var(--color-ink); word-break: keep-all; }
        .rp-tag { font-size: var(--fs-1); font-weight: 800; color: var(--color-primary); background: var(--color-primary-soft); padding: 1px 6px; border-radius: var(--radius-sm); margin-left: 4px; }
        .rp-memo { font-size: var(--fs-1); font-weight: 500; color: var(--color-ink-3); }
        .rp-val { font-size: var(--fs-4); font-weight: 800; color: var(--color-ink); font-family: ui-monospace, monospace; white-space: nowrap; }
        .rp-val em { font-style: normal; font-size: var(--fs-1); font-weight: 700; color: var(--color-ink-3); background: var(--color-card-soft); padding: 1px 5px; border-radius: var(--radius-sm); margin-left: 5px; }
        .rp-del { border: none; background: none; color: var(--color-ink-3); font-size: var(--fs-3); cursor: pointer; padding: 2px 4px; }
        .rp-form { display: flex; flex-wrap: wrap; gap: 6px; margin: 10px 0; }
        .rp-in { flex: 1 1 100%; border: 1px solid var(--color-line); border-radius: var(--radius-sm); padding: 8px 10px; font-size: var(--fs-3); font-family: var(--font-sans); background: var(--color-card); color: var(--color-ink); }
        .rp-in.num { flex: 1 1 40%; }
        .rp-save { flex: 1 1 100%; border: none; background: var(--color-primary); color: var(--color-on-primary); border-radius: var(--radius-sm); padding: 9px 0; font-size: var(--fs-3); font-weight: 800; cursor: pointer; font-family: var(--font-sans); }
        .rp-total { display: flex; align-items: center; justify-content: space-between; margin-top: 11px; padding-top: 11px; border-top: 1px solid var(--color-line); }
        .rp-total span { font-size: var(--fs-2); font-weight: 700; color: var(--color-ink-2); }
        .rp-total em { font-style: normal; font-size: var(--fs-1); font-weight: 800; color: var(--color-success); background: var(--color-success-soft); padding: 1px 6px; border-radius: var(--radius-sm); margin-left: 5px; }
        .rp-total b { font-size: var(--fs-5); font-weight: 900; color: var(--color-ink); font-family: ui-monospace, monospace; }
        .rp-note { font-size: var(--fs-1); color: var(--color-ink-3); margin-top: 9px; line-height: 1.55; word-break: keep-all; }
        /* [피드백] 순수투자금·월수익 표기 */
        .rp-invest { display: block; font-size: var(--fs-1); font-weight: 700; color: var(--color-primary); margin-top: 3px; word-break: keep-all; }
        .rp-pnl { display: block; font-size: var(--fs-1); font-weight: 800; margin-top: 3px; word-break: keep-all; }
        .rp-pnl.pos { color: var(--color-success); } .rp-pnl.neg { color: var(--color-danger); }
        .rp-pnl em { font-style: normal; font-weight: 700; color: var(--color-ink-3); }
        .rp-forecast { font-size: var(--fs-1); font-weight: 600; color: var(--color-ink-3); padding: 2px 0 6px; word-break: keep-all; }
        .rp-invest-total { display: flex; align-items: center; justify-content: space-between; margin-top: 7px; }
        .rp-invest-total span { font-size: var(--fs-2); font-weight: 700; color: var(--color-ink-2); }
        .rp-invest-total em { font-style: normal; font-size: var(--fs-1); font-weight: 800; color: var(--color-primary); background: var(--color-primary-soft); padding: 1px 6px; border-radius: var(--radius-sm); margin-left: 5px; }
        .rp-invest-total b { font-size: var(--fs-4); font-weight: 800; color: var(--color-primary); font-family: ui-monospace, monospace; }
        .mp-note b { color: var(--color-ink-2); font-weight: 700; }
        /* [S5] 투자아파트 스크리너 */
        /* [S5+] 이동 범위 칩 */
        .scope-chips { display: flex; gap: 6px; margin-bottom: 14px; }
        .scope-chip { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 2px; border: 1px solid var(--color-line); background: var(--color-card); border-radius: var(--radius-md); padding: 9px 4px; cursor: pointer; font-family: var(--font-sans); }
        .scope-chip b { font-size: var(--fs-3); font-weight: 800; color: var(--color-ink-2); }
        .scope-chip span { font-size: var(--fs-1); font-weight: 600; color: var(--color-ink-3); white-space: nowrap; }
        .scope-chip.on { background: var(--color-primary); border-color: var(--color-primary); }
        .scope-chip.on b, .scope-chip.on span { color: var(--color-on-primary); }
        .scr-py { font-size: var(--fs-1); font-weight: 600; color: var(--color-ink-3); }
        .scr-mine { font-size: var(--fs-1); font-weight: 800; background: var(--color-primary-soft); color: var(--color-primary); padding: 1px 6px; border-radius: var(--radius-sm); }
        .scr-reg { display: block; margin-top: 10px; border: none; background: var(--color-primary); color: var(--color-on-primary); border-radius: var(--radius-sm); padding: 9px 14px; font-size: var(--fs-2); font-weight: 800; font-family: var(--font-sans); cursor: pointer; }
        .scr-inputs { display: flex; gap: 8px; margin-bottom: 12px; }
        /* [모바일 정렬] flex:1 + min-width:0 로 숫자 input이 좁은 화면에서 균등 축소되게(오버플로우 방지) */
        .scr-in { flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; gap: 4px; font-size: var(--fs-1); color: var(--color-ink-3); font-weight: 700; }
        .scr-in input { width: 100%; min-width: 0; box-sizing: border-box; border: 1px solid var(--color-line); background: var(--color-bg); border-radius: var(--radius-sm); padding: 9px 10px; font-size: var(--fs-3); font-family: var(--font-sans); color: var(--color-ink); }
        .scr-in input:focus { outline: none; border-color: var(--color-primary); }
        .scr-head { display: grid; grid-template-columns: 1fr auto auto; gap: 10px; font-size: var(--fs-1); color: var(--color-ink-3); font-weight: 700; padding-bottom: 6px; border-bottom: 1px solid var(--color-line); }
        .scr-head span:nth-child(2), .scr-head span:nth-child(3) { text-align: right; min-width: 56px; }
        .scr-row { display: grid; grid-template-columns: 1fr auto auto; gap: 10px; align-items: center; padding: 10px 0; border-bottom: 1px solid var(--color-line); }
        .scr-name { font-size: var(--fs-3); font-weight: 700; color: var(--color-ink); display: flex; align-items: center; gap: 6px; min-width: 0; }
        .scr-avm { font-size: var(--fs-3); font-weight: 700; color: var(--color-ink-2); font-family: ui-monospace, monospace; text-align: right; min-width: 56px; }
        .scr-gap { font-size: var(--fs-4); font-weight: 800; color: var(--color-ink); font-family: ui-monospace, monospace; text-align: right; min-width: 56px; display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
        .scr-gap.ok { color: var(--color-success); }
        .scr-row.clickable { cursor: pointer; border-radius: var(--radius-sm); margin: 0 -6px; padding: 10px 6px; transition: background .15s; }
        .scr-row.clickable:hover, .scr-row.clickable:active { background: var(--color-primary-soft, #EAF1FF); }
        .scr-go { font-size: var(--fs-1); font-weight: 700; color: var(--color-primary, #2F6BFF); font-family: var(--font-body); }
        /* [S5] 등록 위저드 바텀시트 */
        /* [item1] 부동산 찾기 모달 */
        .resr-scrim { position: fixed; inset: 0; background: rgba(0,0,0,0.45); z-index: 210; display: flex; align-items: flex-start; justify-content: center; padding-top: calc(env(safe-area-inset-top, 0px) + 40px); }
        .resr { width: 100%; max-width: 460px; margin: 0 12px; background: var(--color-card); border-radius: var(--radius-card); padding: 16px; box-shadow: var(--shadow-float); max-height: 80vh; overflow-y: auto; }
        .resr-h { display: flex; align-items: center; justify-content: space-between; font-size: var(--fs-5); font-weight: 800; color: var(--color-ink); margin-bottom: 12px; }
        .resr-x { border: none; background: none; font-size: var(--fs-5); color: var(--color-ink-3); cursor: pointer; }
        .resr-in { width: 100%; border: 1px solid var(--color-line); border-radius: var(--radius-sm); padding: 11px 13px; font-size: var(--fs-4); font-family: var(--font-sans); background: var(--color-card); color: var(--color-ink); }
        .resr-list { margin-top: 10px; display: flex; flex-direction: column; }
        .resr-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 11px 4px; border-bottom: 1px solid var(--color-line); background: none; border-left: none; border-right: none; border-top: none; font-size: var(--fs-3); font-weight: 700; color: var(--color-ink); cursor: pointer; font-family: var(--font-sans); text-align: left; }
        .resr-go { font-size: var(--fs-1); font-weight: 700; color: var(--color-primary); flex-shrink: 0; }
        .resr-empty { padding: 16px 4px; font-size: var(--fs-3); color: var(--color-ink-3); text-align: center; }
        .resr-sec { margin: 14px 0 8px; font-size: var(--fs-2); font-weight: 800; color: var(--color-ink-2); }
        .resr-sec span { font-size: var(--fs-1); font-weight: 600; color: var(--color-ink-3); margin-left: 5px; }
        .resr-chips { display: flex; flex-wrap: wrap; gap: 7px; }
        .resr-chip { display: inline-flex; align-items: center; gap: 4px; border: 1px solid var(--color-line); background: var(--color-card-soft); color: var(--color-ink); border-radius: 999px; padding: 7px 13px; font-size: var(--fs-2); font-weight: 700; cursor: pointer; font-family: var(--font-sans); }
        .resr-chip em { font-style: normal; font-size: var(--fs-1); font-weight: 800; color: var(--color-primary); }
        .resr-chip.dong { background: var(--color-card); }
        .resr-note { margin-top: 14px; font-size: var(--fs-1); color: var(--color-ink-3); line-height: 1.5; word-break: keep-all; }
        .wiz-scrim { position: fixed; inset: 0; background: rgba(0,0,0,0.45); z-index: 200; display: flex; align-items: flex-end; justify-content: center; }
        .wiz { width: 100%; max-width: 480px; background: var(--color-card); border-radius: var(--radius-card) 20px 0 0; padding: 20px 18px calc(env(safe-area-inset-bottom, 0px) + 20px); box-shadow: var(--shadow-float); }
        .wiz-h { display: flex; align-items: center; justify-content: space-between; font-size: var(--fs-5); font-weight: 800; color: var(--color-ink); margin-bottom: 16px; }
        .wiz-x { border: none; background: var(--color-card-soft); color: var(--color-ink-2); width: 30px; height: 30px; border-radius: 50%; font-size: var(--fs-4); cursor: pointer; }
        .wiz-f { display: flex; flex-direction: column; gap: 5px; font-size: var(--fs-1); color: var(--color-ink-3); font-weight: 700; margin-bottom: 11px; flex: 1 1 0; min-width: 0; }
        .wiz-f em { font-style: normal; font-size: var(--fs-1); font-weight: 700; color: var(--color-primary); margin-left: 5px; }
        .wiz-f input, .wiz-f select { width: 100%; min-width: 0; box-sizing: border-box; border: 1px solid var(--color-line); background: var(--color-bg); border-radius: var(--radius-sm); padding: 11px 12px; font-size: var(--fs-4); font-family: var(--font-sans); color: var(--color-ink); }
        .wiz-f select:focus { outline: none; border-color: var(--color-primary); }
        .wiz-f input:focus { outline: none; border-color: var(--color-primary); }
        .wiz-row { display: flex; gap: 10px; }
        .wiz-save { width: 100%; margin-top: 6px; border: none; border-radius: var(--radius-md); padding: 13px 0; font-size: var(--fs-4); font-weight: 800; color: var(--color-on-primary); background: var(--color-primary); cursor: pointer; font-family: var(--font-sans); }
        .wiz-save:disabled { opacity: 0.5; cursor: not-allowed; }
        .wiz-note { font-size: var(--fs-1); color: var(--color-ink-3); margin-top: 11px; line-height: 1.5; word-break: keep-all; text-align: center; }
        .wiz-note b { color: var(--color-ink-2); font-weight: 700; }
        .label { font-size: var(--fs-4); font-weight: 700; color: var(--color-ink); margin-bottom: 12px; }
        .sub { font-weight: 600; color: var(--color-ink-3); font-size: var(--fs-1); margin-left: 6px; }
        /* ONE Score 랭킹 */
        .rrow { display: grid; grid-template-columns: 22px 1fr auto; align-items: center; gap: 10px; padding: 12px 0; border-top: 1px solid var(--color-line); }
        .rrow:first-of-type { border-top: none; }
        .rk { font-size: var(--fs-3); font-weight: 800; color: var(--color-ink-3); text-align: center; }
        .rmid { min-width: 0; }
        .rname { font-size: var(--fs-4); font-weight: 700; letter-spacing: -.2px; display: flex; align-items: center; gap: 6px; }
        .vtag { font-size: var(--fs-1); font-weight: 800; padding: 2px 7px; border-radius: var(--radius-sm); flex-shrink: 0; }
        .vtag.fair { background: var(--color-card-soft); color: var(--color-ink-2); }
        .vtag.under { background: var(--color-success-soft); color: var(--color-success-ink); }
        .vtag.over { background: var(--color-danger-soft); color: var(--color-danger); }
        .rsub { font-size: var(--fs-2); color: var(--color-ink-3); font-weight: 500; margin-top: 3px; }
        .rreason { color: var(--color-ink-2); font-weight: 600; }
        .rright { text-align: right; display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }
        .rscore { font-size: var(--fs-5); font-weight: 800; color: var(--color-primary); line-height: 1; }
        .jtag { font-size: var(--fs-1); font-weight: 800; padding: 3px 9px; border-radius: var(--radius-sm); }
        .jtag.buy { background: var(--color-primary-soft); color: var(--color-primary); }
        .jtag.watch { background: var(--color-card-soft); color: var(--color-ink-3); }
        /* 최근 실거래 피드 (#16) */
        .frow { display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 10px; padding: 11px 0; border-top: 1px solid var(--color-line); }
        .frow:first-of-type { border-top: none; }
        .fmid { min-width: 0; }
        .fname { font-size: var(--fs-3); font-weight: 700; letter-spacing: -.2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .fsub { font-size: var(--fs-1); color: var(--color-ink-3); font-weight: 500; margin-top: 3px; }
        .fright { text-align: right; flex-shrink: 0; }
        .fprice { font-size: var(--fs-4); font-weight: 800; color: var(--color-ink); line-height: 1.1; }
        .fchg { font-size: var(--fs-1); font-weight: 800; margin-top: 2px; }
        .fchg.up { color: var(--color-danger); }
        .fchg.dn { color: var(--color-primary); }
        .fchg.fl { color: var(--color-ink-3); }
        /* 저평가 후보 */
        .urow { display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 10px; padding: 13px 0; border-top: 1px solid var(--color-line); }
        .urow:first-of-type { border-top: none; }
        .uname { font-size: var(--fs-4); font-weight: 700; }
        .usub { font-size: var(--fs-2); color: var(--color-ink-3); font-weight: 500; margin-top: 4px; }
        .usub b { color: var(--color-ink-2); font-weight: 600; }
        .ugap { font-size: var(--fs-5); font-weight: 800; color: var(--color-success); text-align: right; }
        /* 거시 chips */
        .chips { display: flex; flex-wrap: wrap; gap: 8px; }
        .chip { font-size: var(--fs-2); font-weight: 700; color: var(--color-ink-2); background: var(--color-card-soft); border-radius: var(--radius-sm); padding: 9px 13px; }
        .chip b { color: var(--color-primary); margin-left: 3px; }
        .note { font-size: var(--fs-1); color: var(--color-ink-3); line-height: 1.55; margin-top: 13px; padding-top: 12px; border-top: 1px solid var(--color-line); }
        /* [R-5] 갭 분석 카드 */
        .gap5 { margin-top: 14px; padding-top: 12px; border-top: 1px dashed var(--color-line); }
        .gap5-h { font-size: var(--fs-3); font-weight: 800; color: var(--color-ink); }
        .gap5-h span { font-weight: 500; font-size: var(--fs-1); color: var(--color-ink-3); margin-left: 6px; }
        .gap5-sel { width: 100%; margin-top: 8px; padding: 9px 11px; border: 1px solid var(--color-line); border-radius: var(--radius-sm); background: var(--color-bg); color: var(--color-ink); font-size: var(--fs-3); font-family: var(--font-sans); }
        .gap5-load { font-size: var(--fs-2); color: var(--color-ink-3); margin-top: 8px; }
        .gap5-body { margin-top: 10px; }
        .gap5-verdict { display: inline-block; font-size: var(--fs-5); font-weight: 800; padding: 4px 12px; border-radius: var(--radius-sm); }
        .gap5-verdict.ok { color: var(--color-success); background: var(--color-success-soft); }
        .gap5-verdict.no { color: var(--color-danger); background: var(--color-danger-soft); }
        .gap5-verdict.mid { color: var(--color-warning-ink, var(--color-warning)); background: var(--color-warning-soft); }
        .gap5-verdict.na { color: var(--color-ink-2); background: var(--color-card-soft); }
        .gap5-reason { font-size: var(--fs-2); color: var(--color-ink-2); line-height: 1.5; margin-top: 7px; word-break: keep-all; }
        .gap5-rows { display: flex; flex-wrap: wrap; gap: 6px 18px; margin-top: 9px; }
        .g5r { font-size: var(--fs-2); color: var(--color-ink-3); } .g5r b { color: var(--color-ink); font-weight: 800; margin-left: 5px; }
        .gap5-spark { width: 100%; height: 44px; margin-top: 10px; display: block; }
        .gap5-foot { font-size: var(--fs-1); color: var(--color-ink-3); margin-top: 9px; line-height: 1.5; word-break: keep-all; }
        /* [PI-2~4] 갈아타기 정밀 계산 */
        .movecalc { margin-top: 12px; background: var(--color-card); border: 1px solid var(--color-primary); border-radius: var(--radius-md); padding: 13px 14px; }
        .mv-h { font-size: var(--fs-4); font-weight: 800; color: var(--color-ink); margin-bottom: 9px; display: flex; flex-wrap: wrap; gap: 6px; align-items: baseline; }
        .mv-src { font-size: var(--fs-1); font-weight: 600; color: var(--color-ink-3); }
        .mv-row { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; padding: 5px 0; font-size: var(--fs-2); color: var(--color-ink-2); border-bottom: 1px dashed var(--color-line); }
        .mv-row b { font-weight: 800; color: var(--color-ink); font-family: ui-monospace, monospace; white-space: nowrap; }
        .mv-row em { font-style: normal; font-size: var(--fs-1); color: var(--color-ink-3); margin-left: 4px; }
        .mv-row.hl b { color: var(--color-primary); }
        .mv-row.neg b { color: var(--color-danger); } .mv-row.pos b { color: var(--color-success); }
        .mv-note-s { font-size: var(--fs-1); color: var(--color-ink-3); padding: 5px 0 0; line-height: 1.5; word-break: keep-all; }
        .mv-net { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-top: 10px; padding: 11px 12px; border-radius: var(--radius-sm); background: var(--color-card-soft); }
        .mv-net span { font-size: var(--fs-2); font-weight: 700; color: var(--color-ink-2); }
        .mv-net b { font-size: var(--fs-5); font-weight: 900; font-family: ui-monospace, monospace; }
        .mv-net.pos b { color: var(--color-success); } .mv-net.neg b { color: var(--color-danger); }
        .mv-disc { font-size: var(--fs-1); color: var(--color-ink-3); margin-top: 9px; line-height: 1.55; word-break: keep-all; }
        .mv-locked { margin-top: 12px; background: var(--color-warning-soft); border: 1px solid var(--color-warning-ink, var(--color-warning)); border-radius: var(--radius-md); padding: 12px 14px; font-size: var(--fs-2); color: var(--color-ink-2); line-height: 1.55; word-break: keep-all; }
        /* [PI-5] 유지 vs 이동 */
        .holdmove { margin-top: 12px; background: var(--color-card-soft); border: 1px solid var(--color-line); border-radius: var(--radius-md); padding: 12px 14px; }
        .hm-h { font-size: var(--fs-3); font-weight: 800; color: var(--color-ink); margin-bottom: 9px; }
        .hm-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        .hm-col { background: var(--color-card); border: 1px solid var(--color-line); border-radius: var(--radius-sm); padding: 9px 10px; display: flex; flex-direction: column; gap: 4px; }
        .hm-k { font-size: var(--fs-1); font-weight: 700; color: var(--color-ink-3); }
        .hm-v { font-size: var(--fs-2); font-weight: 700; color: var(--color-ink); word-break: keep-all; }
        .hm-disc { font-size: var(--fs-1); color: var(--color-ink-3); margin-top: 9px; line-height: 1.55; word-break: keep-all; }
        /* [R-5 시나리오B] 같은 동 후보 갭 카드 */
        .gapb-cand { padding: 10px 0; border-top: 1px solid var(--color-line); }
        .gapb-cand:first-of-type { border-top: none; }
        .gapb-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
        .gapb-nm { font-size: var(--fs-3); font-weight: 800; color: var(--color-ink); }
        .gap5-verdict.gapb-v { font-size: var(--fs-2); padding: 2px 9px; }
        .gapc-alert { width: 100%; margin-top: 10px; border: 1px solid var(--color-line); background: var(--color-card); color: var(--color-ink-2); border-radius: var(--radius-sm); padding: 9px 0; font-size: var(--fs-2); font-weight: 700; cursor: pointer; font-family: var(--font-sans); }
        .gapc-alert.on { background: var(--color-primary-soft); border-color: var(--color-primary); color: var(--color-primary); }
        /* [R-6] 개인화 브리핑 */
        .pbrief { background: var(--color-card); border: 1px solid var(--color-primary); border-radius: var(--radius-md); padding: 13px 15px; margin-bottom: 14px; }
        .pbrief-set { display: flex; align-items: center; justify-content: space-between; gap: 10px; font-size: var(--fs-2); color: var(--color-ink-2); flex-wrap: wrap; }
        .pb-step { display: flex; gap: 9px; padding: 5px 0; font-size: var(--fs-2); line-height: 1.5; word-break: keep-all; }
        .pb-k { flex-shrink: 0; font-weight: 800; color: var(--color-primary); font-size: var(--fs-2); padding-top: 1px; }
        .pb-v { color: var(--color-ink-2); } .pb-v .up { color: var(--color-success); } .pb-v .dn { color: var(--color-danger); }
        .pb-cta { border: none; background: var(--color-primary); color: var(--color-on-primary); font-size: var(--fs-2); font-weight: 800; padding: 6px 12px; border-radius: var(--radius-sm); cursor: pointer; font-family: var(--font-sans); margin-left: 4px; }
        /* [R-7] 미구현 로드맵 배지 */
        /* [거시 해석] 규칙 기반 방향성 카드 */
        .macro-read { margin-top: 11px; background: var(--color-card-soft); border: 1px solid var(--color-line); border-radius: var(--radius-sm); padding: 11px 13px; }
        .macro-read .mr-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 7px; }
        .macro-read .mr-lbl { font-size: var(--fs-2); font-weight: 800; color: var(--color-ink); }
        .macro-read .mr-dir { font-size: var(--fs-2); font-weight: 800; padding: 2px 9px; border-radius: 999px; white-space: nowrap; }
        .macro-read .mr-dir.up { color: var(--color-undervalued, var(--color-success)); background: var(--color-undervalued-soft, var(--color-success-soft)); }
        .macro-read .mr-dir.dn { color: var(--color-overvalued, var(--color-danger)); background: var(--color-overvalued-soft, var(--color-danger-soft)); }
        .macro-read .mr-dir.mid { color: var(--color-warning-ink, var(--color-warning)); background: var(--color-warning-soft); }
        .macro-read .mr-row { display: flex; gap: 8px; padding: 3px 0; font-size: var(--fs-2); line-height: 1.5; word-break: keep-all; }
        .macro-read .mr-k { flex-shrink: 0; width: 34px; font-weight: 800; color: var(--color-ink-2); }
        .macro-read .mr-v { color: var(--color-ink-2); }
        .macro-read .mr-fresh { margin-top: 7px; font-size: var(--fs-1); font-weight: 600; color: var(--color-ink-3); line-height: 1.5; word-break: keep-all; }
        .macro-read .mr-fresh.stale { color: var(--color-warning-ink, var(--color-warning)); }
        .macro-read .mr-disc { margin-top: 6px; font-size: var(--fs-1); color: var(--color-ink-3); line-height: 1.5; word-break: keep-all; }
        .foot { font-size: var(--fs-1); color: var(--color-ink-3); text-align: center; margin-top: 16px; line-height: 1.5; }
      `}</style>
      <style jsx global>{`body { background: var(--color-bg); margin: 0; }`}</style>
    </div>
  );
}
