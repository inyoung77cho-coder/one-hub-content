// [v10 UI] 온보딩 위저드 — 성향 → 주식 → ETF → 부동산 → 완료 (시안: onehub-onboarding.html)
//   §5② 배선: 성향 결과 → 목표 자산배분(%)을 localStorage(onehub_target_alloc)에 저장하여
//   AI자산운영 탭의 "목표 %" 단일 소스로 사용한다. 완료 시 홈으로 이동.
//   색상은 디자인 토큰(var(--…))만 사용. 다크모드는 <html data-theme>.
import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { setTargetClass, CLASS_PRESETS } from "../../lib/targetClass"; // [S22-4] 자산군 목표 배분 프리셋
import { recordDecisionWithPrice } from "../../lib/recordDecision"; // [S30-6] 온보딩 마지막 첫 판단(공용 함수)
import { getTrader } from "../../lib/trader";
import { markFunnel } from "../../lib/funnel"; // [S30-8] 가입 깔때기 이정표
import { setLifeStage, getLifeStage, STAGE_LABEL } from "../../lib/withdrawPlan"; // [S31-4] 생애 단계
import PartnerCard from "../../components/PartnerCard"; // [S31-6] 증권 계좌 개설 제휴(계약 전 렌더 안 됨)

// 성향(goal) → 목표 배분(%) 매핑 — AI자산 목표% 소스
const ALLOC_MAP = {
  safe:    { 주식: 10, ETF: 20, 부동산: 60, 현금: 10 },
  balance: { 주식: 20, ETF: 30, 부동산: 45, 현금: 5 },
  growth:  { 주식: 40, ETF: 35, 부동산: 20, 현금: 5 },
};
const ALLOC_COLOR = { 주식: "var(--color-primary)", ETF: "var(--color-success)", 부동산: "var(--color-warning)", 현금: "var(--color-ink-3)" };
const TOTAL_SECTIONS = 4; // 성향 + 3자산

// 성향 질문 — 왼쪽 정렬 질문 + 각 답변 버튼(오른쪽 체크)
const QUESTIONS = [
  { q: "goal", title: "1. 투자 목표에 가까운 건?", opts: [
    { val: "safe", t: "안정적 수익", sub: "잃지 않는 게 우선" },
    { val: "balance", t: "균형", sub: "수익과 안정 사이" },
    { val: "growth", t: "적극적 성장", sub: "변동성 감수, 수익 우선" },
  ] },
  { q: "risk", title: "2. 보유 자산이 −10% 되면?", opts: [
    { val: "sell", t: "바로 정리한다" }, { val: "hold", t: "지켜본다" }, { val: "buy", t: "기회로 보고 더 산다" },
  ] },
  { q: "horizon", title: "3. 이 돈은 언제 쓰나요?", opts: [
    { val: "short", t: "1년 안에" }, { val: "mid", t: "3~5년" }, { val: "long", t: "당분간 쓸 일 없음" },
  ] },
];

export default function Onboarding() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [classPreset, setClassPreset] = useState(null); // [S22-4] 자산군 목표 배분 선택(온보딩)
  const [personality, setPersonality] = useState({}); // goal / risk / horizon
  const [stockForm, setStockForm] = useState({ name: "", qty: "", price: "" });
  const [stockList, setStockList] = useState([]); // [{name, uk}]
  const [etfForm, setEtfForm] = useState({ name: "", qty: "", price: "" });
  const [etfList, setEtfList] = useState([]); // [{name, uk, listing}]
  const [etfListing, setEtfListing] = useState("US"); // US | KR
  const [reList, setReList] = useState([]); // [{name, area, uk}]
  const [reQuery, setReQuery] = useState("시범");
  const [customRE, setCustomRE] = useState({ name: "", area: "", price: "" });
  const [customOpen, setCustomOpen] = useState(false);
  const [cashInput, setCashInput] = useState(""); // 보유 현금(억)
  const [fromEstimate, setFromEstimate] = useState(null); // [S31-3] 공개 도구 유입(방금 본 단지)
  const [lifeStage, setLifeStageState] = useState("accumulate"); // [S31-4] 생애 단계
  const pickStage = (v) => { setLifeStageState(v); try { setLifeStage(v); } catch (e) {} };
  const USD_FX = 1350; // ETF($) 환산 환율(근사)

  // [S31-3] 공개 도구(estimate)에서 넘어왔으면 그 단지를 이어서 채워준다("방금 본 그 단지").
  useEffect(() => {
    try {
      const f = JSON.parse(localStorage.getItem("onehub_from") || "null");
      if (f && f.from === "estimate" && f.apt) {
        setFromEstimate(f);
        setCustomRE((c) => (c.name ? c : { ...c, name: f.apt }));
        setCustomOpen(true);
      }
    } catch (e) {}
  }, []);

  const alloc = personality.goal ? ALLOC_MAP[personality.goal] : null;
  const num = (v) => { const n = Number(String(v).replace(/[,\s]/g, "")); return isFinite(n) ? n : 0; };
  const uk1 = (n) => Math.round(n / 1e8 * 100) / 100; // 원 → 억(소수2)
  const stockUk = Math.round(stockList.reduce((s, x) => s + x.uk, 0) * 100) / 100;
  const etfUk = Math.round(etfList.reduce((s, x) => s + x.uk, 0) * 100) / 100;
  const reUk = Math.round(reList.reduce((s, x) => s + x.uk, 0) * 100) / 100;
  const cashUk = Math.round(num(cashInput) * 100) / 100; // 입력 보유 현금(억)

  // 분당구 단지 DB — 면적(㎡)별 실거래 근사 시세(억). 목록에 없는 지역은 직접 입력.
  const RE_DB = [
    { name: "시범우성", dong: "서현동", areas: { 59: 14.20, 84: 20.29, 114: 27.50 } },
    { name: "시범삼성", dong: "서현동", areas: { 59: 15.10, 84: 21.54, 114: 29.00 } },
    { name: "시범한양", dong: "서현동", areas: { 59: 14.30, 84: 20.33, 114: 27.80 } },
    { name: "시범현대", dong: "서현동", areas: { 59: 14.25, 84: 20.30, 114: 27.60 } },
    { name: "효자촌(대창)", dong: "정자동", areas: { 59: 11.00, 84: 15.84, 114: 21.00 } },
    { name: "효자촌(현대)", dong: "정자동", areas: { 59: 12.30, 84: 17.83, 114: 23.50 } },
  ];
  const reMatches = RE_DB.filter((d) => !reQuery || d.name.includes(reQuery.trim()));
  const addRE = (name, area, uk) => setReList((l) => [...l, { name, area, uk }]);
  const addCustomRE = () => {
    const uk = Math.round(num(customRE.price) * 100) / 100;
    if (uk <= 0 || !customRE.name) return;
    addRE(customRE.name, customRE.area ? `${customRE.area}㎡` : "직접입력", uk);
    setCustomRE({ name: "", area: "", price: "" });
  };
  const removeRE = (i) => setReList((l) => l.filter((_, k) => k !== i));

  // 정확도 게이지 — 완료 섹션 수 기반
  const done = step >= 5 ? 4 : Math.max(0, Math.min(4, step - 1));
  const gauge = Math.round((done / TOTAL_SECTIONS) * 100);

  const pick = (q, val) => setPersonality((p) => ({ ...p, [q]: val }));

  const [stockBusy, setStockBusy] = useState(false);
  // [S30-6] 완료 화면 첫 판단 — 가장 비중 큰(코드 있는) 종목 하나. 건너뛸 수 있음.
  const [verdictState, setVerdictState] = useState(null); // null=미기록 | "skip" | {label}
  const [verdictBusy, setVerdictBusy] = useState(false);
  const firstStock = [...stockList].filter((s) => s.code).sort((a, b) => (b.uk || 0) - (a.uk || 0))[0] || null;
  const recordFirstVerdict = async (choice) => {
    if (!firstStock || verdictBusy) return;
    setVerdictBusy(true);
    const decision = choice === "hold" ? "take" : "pass";
    try {
      await recordDecisionWithPrice({ code: firstStock.code, name: firstStock.name, decision, trader: getTrader(), source: "onboarding", priceHint: firstStock.price || null });
      setVerdictState({ label: choice });
    } catch (e) { setVerdictState({ label: choice, err: true }); }
    setVerdictBusy(false);
  };
  const addStock = async () => {
    let price = num(stockForm.price);
    let nm = stockForm.name;
    let code = "";
    // [현재가 자동] 평균 매수가를 비우면 마스터에서 종목을 해석해 현재가로 추정 → 종목+수량만 입력.
    //   [S30-6] 종목코드도 함께 잡는다 — 완료 화면의 '첫 판단' 기록에 쓴다(코드가 있어야 채점 체인이 붙는다).
    if (nm.trim()) {
      setStockBusy(true);
      try {
        const d = await fetch(`/api/input/master-search?q=${encodeURIComponent(nm.trim())}`).then((r) => r.json());
        const first = (d?.results || [])[0];
        if (first) { code = String(first.code || first.symbol || first.ticker || first.종목코드 || "").trim(); nm = first.name || nm; if (!(price > 0) && Number(first.close_price) > 0) price = Number(first.close_price); }
      } catch (e) {}
      setStockBusy(false);
    }
    const uk = uk1(num(stockForm.qty) * price);
    if (uk <= 0 && !stockForm.name) return;
    setStockList((l) => [...l, { name: nm || "종목", uk, code, price: price || null }]);
    setStockForm({ name: "", qty: "", price: "" });
  };
  const addEtf = () => {
    const won = num(etfForm.qty) * num(etfForm.price) * (etfListing === "US" ? USD_FX : 1);
    const uk = uk1(won);
    if (uk <= 0 && !etfForm.name) return;
    setEtfList((l) => [...l, { name: etfForm.name || "ETF", uk, listing: etfListing }]);
    setEtfForm({ name: "", qty: "", price: "" });
  };

  const persist = () => {
    try {
      // §5② 성향→목표배분을 AI자산 목표% 소스로 저장
      if (alloc) localStorage.setItem("onehub_target_alloc", JSON.stringify(alloc));
      localStorage.setItem("onehub_profile_goal", personality.goal || "");
      localStorage.setItem("onehub_onboarded", "1");
      // 온보딩 입력 자산 → 총자산 반영 소스로 저장(백엔드 값 없을 때 폴백)
      localStorage.setItem("onehub_onboard_assets", JSON.stringify({
        stock_uk: stockUk || null,
        etf_uk: etfUk || null,
        realestate_uk: reUk || null,
        cash_uk: cashUk || null,
      }));
    } catch (e) {}
  };

  const finish = () => {
    persist();
    // [S30-8] 이정표 — 온보딩 완료 + (종목/ETF 를 넣었다면) 보유 입력. signup 은 첫 로드에서(_app).
    try {
      const tr = getTrader();
      markFunnel("signup", tr); // 온보딩까지 왔으면 가입은 이미 일어남(미기록 대비 보강)
      markFunnel("onboard_done", tr);
      if (stockList.length > 0 || etfList.length > 0) markFunnel("first_holding", tr);
      // [S31-3] 공개 도구 유입 전환 — 1회만(플래그 소비). 서버 카운터 +1 + per-user 관문.
      if (fromEstimate) {
        markFunnel("public_tool_view", tr);
        markFunnel("public_tool_signup", tr);
        fetch("/api/pwa/public-signup", { method: "POST" }).catch(() => {});
        try { localStorage.removeItem("onehub_from"); } catch (e) {}
      }
    } catch (e) {}
    router.push("/pwa");
  };
  const go = (n) => { if (n >= 5) persist(); setStep(n); if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" }); };

  return (
    <div className="wrap">
      <div className="phone">
        {/* progress header */}
        <div className="phead">
          <div className="phead-top">
            <button className="brand brand-btn" onClick={() => router.push("/pwa/assets")} aria-label="종합자산">ONE<span className="bdot">·</span>HUB</button>
            <div className="phead-r">
              <button className="ob-search" onClick={() => router.push("/pwa?tab=analyze")} aria-label="AI 종목 검색" title="AI 종목 검색">🔍</button>
              <button className="skip" onClick={finish}>나중에 하기</button>
            </div>
          </div>
          <div className="acc-lbl"><span className="t">AI 판단 정확도</span><span className="p">{step >= 5 ? 100 : gauge}%</span></div>
          <div className="acc-track"><div className="acc-fill" style={{ width: `${step >= 5 ? 100 : gauge}%` }} /></div>
          <div className="dots">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className={`dot-step ${i < done || step >= 5 ? "done" : i === done && step < 5 ? "cur" : ""}`} />
            ))}
          </div>
        </div>

        <div className="body">
          {/* STEP 0 — WELCOME */}
          {step === 0 && (
            <div className="step">
              {fromEstimate && (
                <div className="from-note">📍 방금 보신 <b>{fromEstimate.apt}</b>을(를) 이어서 넣어드릴게요 · 부동산 단계에 미리 채워뒀어요</div>
              )}
              <h1>3가지만 넣으면<br /><em>내 자산으로 판단</em>합니다</h1>
              <p className="lead">지금 보이는 건 샘플이에요. 내 주식·ETF·부동산과 투자 성향을 넣으면, AI가 당신에게 맞는 자산 배분과 리밸런싱을 계산해 드립니다. 각 30초면 충분해요.</p>
              <div className="why">
                <div className="why-item"><div className="why-ic" style={{ background: "var(--color-primary-soft)" }}>🧭</div><div><div className="wk">투자 성향</div><div className="wd">목표 배분의 기준이 됩니다</div></div></div>
                <div className="why-item"><div className="why-ic" style={{ background: "var(--color-primary-soft)" }}>📈</div><div><div className="wk">주식 · ETF</div><div className="wd">직접 입력 또는 증권사 CSV</div></div></div>
                <div className="why-item"><div className="why-ic" style={{ background: "var(--color-success-soft)" }}>🏠</div><div><div className="wk">부동산</div><div className="wd">단지만 고르면 시세는 자동</div></div></div>
              </div>
              <div className="foot"><button className="btn-next" onClick={() => go(1)}>시작하기 →</button></div>
            </div>
          )}

          {/* STEP 1 — PERSONALITY */}
          {step === 1 && (
            <div className="step">
              <div className="eyebrow">STEP 1 / 4 · 투자 성향</div>
              <h1>어떤 투자자<br />이신가요?</h1>
              <p className="lead">3가지만 골라주세요. 답에 따라 목표 자산 배분이 정해집니다.</p>
              {QUESTIONS.map((Q) => (
                <div className="q" key={Q.q}>
                  <div className="q-t">{Q.title}</div>
                  <div className="opts">
                    {Q.opts.map((o) => (
                      <button key={o.val} className={`opt ${personality[Q.q] === o.val ? "sel" : ""}`} onClick={() => pick(Q.q, o.val)}>
                        <span className="opt-label">{o.t}{o.sub && <span className="osub">{o.sub}</span>}</span>
                        <span className="check">✓</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              {/* [S31-4] 생애 단계 — 은퇴/인출 층을 위한 질문. 기본 축적(회귀 없음). */}
              <div className="q">
                <div className="q-t">4. 언제쯤 이 돈을 쓰기 시작하실 계획인가요?</div>
                <div className="opts">
                  {[
                    { v: "accumulate", t: "아직 한참 남았어요 · 불리는 중", sub: "축적기" },
                    { v: "transition", t: "5년 안에 은퇴/인출 예정", sub: "전환기" },
                    { v: "withdraw", t: "이미 이 돈으로 생활합니다", sub: "인출기" },
                  ].map((o) => (
                    <button key={o.v} className={`opt ${lifeStage === o.v ? "sel" : ""}`} onClick={() => pickStage(o.v)}>
                      <span className="opt-label">{o.t}<span className="osub">{o.sub}</span></span>
                      <span className="check">✓</span>
                    </button>
                  ))}
                </div>
              </div>
              {alloc && (
                <div className="preview">
                  <div className="pt">✨ 당신의 목표 자산 배분</div>
                  <div className="alloc-bar">
                    {Object.keys(alloc).map((k) => (
                      <div key={k} className="alloc-seg" style={{ width: `${alloc[k]}%`, background: ALLOC_COLOR[k] }}>{alloc[k] >= 12 ? `${alloc[k]}%` : ""}</div>
                    ))}
                  </div>
                  <div className="alloc-legend">
                    {Object.keys(alloc).map((k) => (
                      <div key={k} className="lg"><i style={{ background: ALLOC_COLOR[k] }} />{k} {alloc[k]}%</div>
                    ))}
                  </div>
                </div>
              )}
              {/* [S22-4] 자산군 목표 배분(선택·건너뛰기 허용) — 주식·ETF·부동산·현금 사이 목표. 종합자산 이탈 판정 기준. */}
              <div className="preview" style={{ marginTop: 10 }}>
                <div className="pt">🎯 자산군 목표 배분 <span style={{ fontWeight: 400, fontSize: "0.72rem", color: "var(--color-ink-3)" }}>선택 · 나중에 바꿀 수 있어요</span></div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                  {Object.keys(CLASS_PRESETS).map((p) => (
                    <button key={p} type="button" onClick={() => { setTargetClass(CLASS_PRESETS[p], p); setClassPreset(p); }} style={{ border: `1px solid ${classPreset === p ? "var(--color-primary)" : "var(--color-line)"}`, background: classPreset === p ? "var(--color-primary-soft)" : "var(--color-card)", color: classPreset === p ? "var(--color-primary)" : "var(--color-ink-2)", borderRadius: 8, padding: "8px 14px", fontSize: "0.8rem", fontWeight: 700, cursor: "pointer" }}>{p}</button>
                  ))}
                </div>
                {classPreset && <div style={{ marginTop: 6, fontSize: "0.72rem", color: "var(--color-ink-3)" }}>주식 {CLASS_PRESETS[classPreset].stock}% · ETF {CLASS_PRESETS[classPreset].etf}% · 부동산 {CLASS_PRESETS[classPreset].realestate}% · 현금 {CLASS_PRESETS[classPreset].cash}%</div>}
              </div>
              <div className="foot"><button className="btn-prev" onClick={() => go(0)}>이전</button><button className="btn-next" onClick={() => go(2)}>다음 →</button></div>
            </div>
          )}

          {/* STEP 2 — STOCKS */}
          {step === 2 && (
            <div className="step">
              <div className="eyebrow">STEP 2 / 4 · 주식</div>
              <h1>보유 주식을<br />넣어주세요</h1>
              <p className="lead">직접 입력하거나, 증권사 앱에서 받은 거래내역 CSV를 올리면 자동으로 채워집니다.</p>
              <div className="card">
                <div className="field"><label>종목명 또는 코드</label><input placeholder="예: 한국항공우주 / 047810" value={stockForm.name} onChange={(e) => setStockForm((f) => ({ ...f, name: e.target.value }))} /></div>
                <div className="frow">
                  <div className="field"><label>수량</label><input placeholder="6" inputMode="numeric" value={stockForm.qty} onChange={(e) => setStockForm((f) => ({ ...f, qty: e.target.value }))} /></div>
                  <div className="field"><label>평균 매수가 · 선택</label><input placeholder="비우면 현재가 자동" inputMode="numeric" value={stockForm.price} onChange={(e) => setStockForm((f) => ({ ...f, price: e.target.value }))} /></div>
                </div>
                <button className="add-btn" onClick={addStock} disabled={stockBusy}>{stockBusy ? "현재가 불러오는 중…" : "+ 종목 추가"}</button>
                {stockList.length > 0 && (
                  <div className="added">
                    <div className="added-t">추가된 종목 · 합계 {stockUk}억</div>
                    {stockList.map((s, i) => (
                      <div className="arow2" key={i}><div><div className="an">{s.name}</div></div><div className="av">{s.uk}억</div></div>
                    ))}
                  </div>
                )}
              </div>
              {/* 보유 현금 — 주식계좌 예수금과 합산되어 총자산에 반영 */}
              <div className="card">
                <div className="field" style={{ marginBottom: 0 }}>
                  <label>보유 현금 (억) · 선택</label>
                  <input placeholder="예: 0.5 (=5천만원)" inputMode="decimal" value={cashInput} onChange={(e) => setCashInput(e.target.value)} />
                </div>
                <div className="tax-note" style={{ marginTop: 10 }}>💡 입력한 현금은 <b>주식계좌 예수금</b>과 <b>합산</b>되어 총자산 '현금'에 반영됩니다.</div>
              </div>
              {/* [S31-6] 증권 계좌 개설 제휴 — 계약 전에는 렌더 안 됨(active:false) */}
              <PartnerCard place="onboarding" />
              <div className="foot"><button className="btn-prev" onClick={() => go(1)}>이전</button><button className="btn-next" onClick={() => go(3)}>다음 →</button></div>
            </div>
          )}

          {/* STEP 3 — ETF */}
          {step === 3 && (
            <div className="step">
              <div className="eyebrow">STEP 3 / 4 · ETF</div>
              <h1>보유 ETF를<br />넣어주세요</h1>
              <p className="lead">주식과 동일하게 입력하고, 상장 국가만 골라주세요. 세금 계산에 반영됩니다.</p>
              <div className="card">
                <div className="field"><label>ETF명 또는 티커</label><input placeholder="예: SMH / QQQM" value={etfForm.name} onChange={(e) => setEtfForm((f) => ({ ...f, name: e.target.value }))} /></div>
                <div className="frow">
                  <div className="field"><label>수량</label><input placeholder="120" inputMode="numeric" value={etfForm.qty} onChange={(e) => setEtfForm((f) => ({ ...f, qty: e.target.value }))} /></div>
                  <div className="field"><label>평균 매수가({etfListing === "US" ? "$" : "원"})</label><input placeholder="245.30" inputMode="decimal" value={etfForm.price} onChange={(e) => setEtfForm((f) => ({ ...f, price: e.target.value }))} /></div>
                </div>
                <label className="flabel">상장 국가</label>
                <div className="chips2">
                  <button className={`lc ${etfListing === "US" ? "on" : ""}`} onClick={() => setEtfListing("US")}>🇺🇸 미국 상장</button>
                  <button className={`lc ${etfListing === "KR" ? "on" : ""}`} onClick={() => setEtfListing("KR")}>🇰🇷 국내 상장</button>
                </div>
                <div className="tax-note">💡 <b>미국 상장</b>은 양도소득세 22%, <b>국내 상장</b> 해외 ETF는 배당소득세 15.4%로 계산됩니다.{etfListing === "US" && <> 달러는 {USD_FX.toLocaleString()}원 환산.</>}</div>
                <button className="add-btn" style={{ marginTop: 12 }} onClick={addEtf}>+ ETF 추가</button>
                {etfList.length > 0 && (
                  <div className="added">
                    <div className="added-t">추가된 ETF · 합계 {etfUk}억</div>
                    {etfList.map((s, i) => (
                      <div className="arow2" key={i}><div><div className="an">{s.name} {s.listing === "US" ? "🇺🇸" : "🇰🇷"}</div><div className="aq">{s.listing === "US" ? "미국 상장" : "국내 상장"}</div></div><div className="av">{s.uk}억</div></div>
                    ))}
                  </div>
                )}
              </div>
              <div className="foot"><button className="btn-prev" onClick={() => go(2)}>이전</button><button className="btn-next" onClick={() => go(4)}>다음 →</button></div>
            </div>
          )}

          {/* STEP 4 — REAL ESTATE */}
          {step === 4 && (
            <div className="step">
              <div className="eyebrow">STEP 4 / 4 · 부동산</div>
              <h1>내 부동산을<br />골라주세요</h1>
              <p className="lead">단지와 면적을 고르면 실거래 기반으로 시세가 자동 산정됩니다. 여러 채도 추가할 수 있어요.</p>
              <div className="field"><label>단지 검색 (분당구)</label><input placeholder="예: 시범, 효자촌" value={reQuery} onChange={(e) => setReQuery(e.target.value)} /></div>
              <div className="search-res">
                {reMatches.map((d) => (
                  <div key={d.name} className="sr2">
                    <div className="sr2-head"><span className="sn">{d.name}</span><span className="sd">{d.dong}</span></div>
                    <div className="area-chips">
                      {Object.entries(d.areas).map(([area, uk]) => (
                        <button key={area} className="area-chip" onClick={() => addRE(d.name, `${area}㎡`, uk)}>
                          <span className="ac-area">{area}㎡</span><span className="ac-uk">{uk}억</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                {reMatches.length === 0 && <div className="sr2-none">목록에 없는 지역이에요. 아래에서 직접 입력하세요.</div>}
              </div>

              {/* 목록에 없는 지역 — 직접 입력(가격·면적) */}
              <button className="custom-toggle" onClick={() => setCustomOpen((o) => !o)}>{customOpen ? "▾ " : "▸ "}목록에 없는 지역 직접 입력</button>
              {customOpen && (
                <div className="card">
                  <div className="field"><label>단지 / 지역명</label><input placeholder="예: 래미안 강남" value={customRE.name} onChange={(e) => setCustomRE((f) => ({ ...f, name: e.target.value }))} /></div>
                  <div className="frow">
                    <div className="field"><label>전용면적(㎡)</label><input placeholder="84" inputMode="numeric" value={customRE.area} onChange={(e) => setCustomRE((f) => ({ ...f, area: e.target.value }))} /></div>
                    <div className="field"><label>시세(억)</label><input placeholder="20.5" inputMode="decimal" value={customRE.price} onChange={(e) => setCustomRE((f) => ({ ...f, price: e.target.value }))} /></div>
                  </div>
                  <button className="add-btn" onClick={addCustomRE}>+ 부동산 추가</button>
                </div>
              )}

              {reList.length > 0 && (
                <div className="added">
                  <div className="added-t">추가된 부동산 · 합계 {reUk}억</div>
                  {reList.map((r, i) => (
                    <div className="arow2" key={i}>
                      <div><div className="an">{r.name}</div><div className="aq">{r.area}</div></div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}><div className="av">{r.uk}억</div><button className="re-del" onClick={() => removeRE(i)} aria-label="삭제">✕</button></div>
                    </div>
                  ))}
                </div>
              )}

              <div className="foot"><button className="btn-prev" onClick={() => go(3)}>이전</button><button className="btn-next" onClick={() => go(5)}>완료하기 →</button></div>
            </div>
          )}

          {/* STEP 5 — DONE */}
          {step === 5 && (
            <div className="step">
              <div className="final-hero">
                <div className="emoji">🎉</div>
                <h1 style={{ textAlign: "center" }}>완성됐어요!</h1>
                <p className="lead" style={{ textAlign: "center" }}>이제 AI가 <b style={{ color: "var(--color-ink)" }}>당신 자산으로</b> 배분과 리밸런싱을 판단합니다.</p>
              </div>
              <div className="score-card">
                <div className="sct">통합 배분 점수</div>
                <div className="score-was">이전: 측정 준비 중</div>
                <div className="score-now">68<span>점</span></div>
              </div>
              {alloc && (
                <div className="card">
                  <div className="cmp-title">🎯 목표 vs 현재 배분</div>
                  {Object.keys(alloc).map((k) => (
                    <div className="cmp-row" key={k}>
                      <span className="ck">{k}</span>
                      <div className="cmp-track"><div className="cmp-tgt" style={{ left: `${alloc[k]}%` }} /></div>
                      <span className="cmp-val">0% → <b>{alloc[k]}%</b></span>
                    </div>
                  ))}
                  <div className="cmp-note">세로선 = 성향 기반 목표 비중. AI 자산운영 탭에서 리밸런싱 플랜이 자동 생성됩니다.</div>
                </div>
              )}
              {/* [S30-6] 마지막 첫 판단 — 심판석·주간 리포트가 첫 판단이 있어야 채워진다. 보유 종목 없으면 안 나옴. */}
              {firstStock && (
                <div className="card fv">
                  {verdictState == null ? (
                    <>
                      <div className="fv-t">마지막으로 하나만 —</div>
                      <div className="fv-q">방금 넣은 <b>{firstStock.name}</b>, 지금 어떻게 보시나요?</div>
                      <div className="fv-btns">
                        <button className="fv-b hold" disabled={verdictBusy} onClick={() => recordFirstVerdict("hold")}>계속 보유</button>
                        <button className="fv-b sell" disabled={verdictBusy} onClick={() => recordFirstVerdict("sell")}>줄일까 고민</button>
                        <button className="fv-b pass" disabled={verdictBusy} onClick={() => recordFirstVerdict("pass")}>관망</button>
                      </div>
                      <button className="fv-skip" onClick={() => setVerdictState("skip")}>건너뛰기</button>
                    </>
                  ) : verdictState === "skip" ? (
                    <div className="fv-done quiet">첫 판단은 나중에 오늘 화면에서 남겨도 됩니다.</div>
                  ) : (
                    <div className="fv-done">
                      ✓ 첫 판단이 기록됐습니다
                      <span className="fv-sub">3거래일 뒤 결과가 채점돼 성적표에 쌓입니다 · 월요일마다 요약을 보내드려요</span>
                    </div>
                  )}
                </div>
              )}

              {/* [PP-6] 첫 사용 가이드 — 베타 테스터가 바로 해볼 3가지(실제 기능으로 안내) */}
              <div className="card guide3">
                <div className="g3-t">🚀 이제 이 3가지부터 해보세요</div>
                <ol className="g3-list">
                  <li><span className="g3-ic">🔍</span><div className="g3-b"><b>AI에게 종목 물어보기</b><span className="g3-d">관심 종목이 지금 사도 될지 AI에게 물어보세요 (우측 상단 🔍)</span></div></li>
                  <li><span className="g3-ic">🎮</span><div className="g3-b"><b>나 vs AI 가상대결</b><span className="g3-d">같은 종목을 나와 AI가 각자 굴려 누가 이기나 봐요 (가상머니)</span></div></li>
                  <li><span className="g3-ic">💬</span><div className="g3-b"><b>불편하면 바로 알려주기</b><span className="g3-d">화면 왼쪽 아래 💬 버튼으로 한마디 남겨주시면 큰 도움이 돼요</span></div></li>
                </ol>
              </div>
              <div className="foot"><button className="btn-next" onClick={finish}>홈에서 내 자산 보기 →</button></div>
            </div>
          )}
        </div>
      </div>

      <style jsx>{`
        .wrap { max-width: 480px; margin: 0 auto; padding: env(safe-area-inset-top, 0px) 12px calc(env(safe-area-inset-bottom, 0px) + 40px); font-family: var(--font-sans); color: var(--color-ink); }
        .phone { background: var(--color-bg); border-radius: 30px; box-shadow: var(--shadow-float); overflow: hidden; margin-top: 12px; }
        .phead { background: var(--hero-grad-1); padding: 18px 18px 20px; color: var(--hero-ink); }
        .phead-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
        .brand { font-weight: 800; font-size: var(--fs-5); letter-spacing: -.3px; }
        .brand-btn { background: none; border: none; padding: 0; cursor: pointer; color: inherit; font-family: inherit; }
        .phead-r { display: flex; align-items: center; gap: 8px; }
        .ob-search { width: 30px; height: 30px; border-radius: 50%; background: rgba(255,255,255,.12); border: none; display: grid; place-items: center; font-size: var(--fs-3); cursor: pointer; }
        .bdot { color: var(--color-success); }
        .skip { font-size: var(--fs-2); color: var(--hero-ink-faint); background: none; border: none; font-family: inherit; cursor: pointer; }
        .acc-lbl { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 8px; }
        .acc-lbl .t { font-size: var(--fs-2); color: var(--hero-ink-sub); font-weight: 600; }
        .acc-lbl .p { font-size: var(--fs-5); font-weight: 800; color: var(--hero-accent); }
        .acc-track { height: 8px; background: var(--hero-fill-line); border-radius: var(--radius-sm); overflow: hidden; }
        .acc-fill { height: 100%; background: linear-gradient(90deg, var(--color-success), var(--hero-accent)); border-radius: var(--radius-sm); transition: width .5s cubic-bezier(.4,0,.2,1); }
        .dots { display: flex; gap: 6px; margin-top: 14px; }
        .dot-step { flex: 1; height: 4px; border-radius: var(--radius-sm); background: var(--hero-fill-line); transition: .3s; }
        .dot-step.done { background: var(--color-success); }
        .dot-step.cur { background: var(--hero-ink); }

        .body { padding: 20px 18px; }
        .step { animation: fade .35s ease; }
        @keyframes fade { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
        .eyebrow { font-size: var(--fs-2); font-weight: 700; color: var(--color-primary); letter-spacing: .3px; margin-bottom: 9px; }
        h1 { font-size: var(--fs-7); font-weight: 800; letter-spacing: -.6px; line-height: 1.3; margin-bottom: 10px; }
        h1 em { font-style: normal; color: var(--color-primary); }
        .lead { font-size: var(--fs-3); color: var(--color-ink-2); line-height: 1.6; margin-bottom: 20px; }

        .card { background: var(--color-card); border-radius: var(--radius-card); padding: 16px; box-shadow: var(--shadow-card); margin-bottom: 12px; }
        .why { display: flex; flex-direction: column; gap: 10px; margin-bottom: 22px; }
        .why-item { display: flex; align-items: center; gap: 13px; background: var(--color-card); border-radius: var(--radius-md); padding: 14px 15px; box-shadow: var(--shadow-card); }
        .why-ic { width: 40px; height: 40px; border-radius: var(--radius-md); display: grid; place-items: center; font-size: var(--fs-6); flex-shrink: 0; }
        .wk { font-size: var(--fs-4); font-weight: 700; }
        .wd { font-size: var(--fs-2); color: var(--color-ink-3); margin-top: 2px; }

        .q { margin-bottom: 22px; }
        .q-t { font-size: var(--fs-5); font-weight: 700; margin-bottom: 12px; }
        .opts { display: flex; flex-direction: column; gap: 8px; }
        .opt { display: flex; align-items: center; justify-content: space-between; gap: 12px; background: var(--color-card); border: 1.5px solid var(--color-line); border-radius: var(--radius-md); padding: 14px 15px; font-size: var(--fs-4); font-weight: 600; cursor: pointer; transition: .15s; font-family: inherit; text-align: left; width: 100%; color: var(--color-ink); }
        .opt-label { flex: 1 1 auto; min-width: 0; text-align: left; }
        .osub { display: block; font-size: var(--fs-2); color: var(--color-ink-3); font-weight: 500; margin-top: 2px; }
        .opt .check { flex-shrink: 0; }
        .opt.sel { border-color: var(--color-primary); background: var(--color-primary-soft); color: var(--color-primary); }
        .opt.sel .osub { color: var(--color-primary); }
        .opt .check { width: 20px; height: 20px; border-radius: 50%; border: 2px solid var(--color-line); flex-shrink: 0; display: grid; place-items: center; font-size: var(--fs-1); color: transparent; }
        .opt.sel .check { background: var(--color-primary); border-color: var(--color-primary); color: var(--color-on-primary); }

        .preview { background: var(--hero-grad-1); border-radius: var(--radius-md); padding: 16px; color: var(--hero-ink); margin-bottom: 8px; animation: fade .4s ease; }
        .pt { font-size: var(--fs-2); color: var(--hero-ink-sub); font-weight: 600; margin-bottom: 12px; }
        .alloc-bar { display: flex; height: 26px; border-radius: var(--radius-sm); overflow: hidden; margin-bottom: 10px; }
        .alloc-seg { display: flex; align-items: center; justify-content: center; font-size: var(--fs-1); font-weight: 700; color: var(--color-on-primary); }
        .alloc-legend { display: flex; flex-wrap: wrap; gap: 10px; }
        .lg { display: flex; align-items: center; gap: 5px; font-size: var(--fs-2); color: var(--hero-ink-soft); }
        .lg i { width: 9px; height: 9px; border-radius: var(--radius-sm); }

        .field { margin-bottom: 11px; }
        .field label, .flabel { display: block; font-size: var(--fs-2); font-weight: 600; color: var(--color-ink-2); margin-bottom: 6px; }
        .field input { width: 100%; font-family: inherit; font-size: var(--fs-4); border: 1.5px solid var(--color-line); border-radius: var(--radius-sm); padding: 12px 13px; color: var(--color-ink); background: var(--color-card); }
        .field input:focus { outline: none; border-color: var(--color-primary); }
        .frow { display: flex; gap: 9px; }
        .frow .field { flex: 1; }
        .add-btn { width: 100%; font-family: inherit; font-size: var(--fs-4); font-weight: 700; color: var(--color-on-primary); background: var(--color-primary); border: none; padding: 13px; border-radius: var(--radius-md); cursor: pointer; margin-top: 3px; }
        .added { margin-top: 14px; }
        .added-t { font-size: var(--fs-2); font-weight: 700; color: var(--color-ink-2); margin-bottom: 9px; }
        .arow2 { display: flex; align-items: center; justify-content: space-between; background: var(--color-success-soft); border-radius: var(--radius-md); padding: 11px 13px; margin-bottom: 7px; }
        .an { font-size: var(--fs-3); font-weight: 700; }
        .aq { font-size: var(--fs-2); color: var(--color-ink-2); margin-top: 2px; }
        .av { font-size: var(--fs-3); font-weight: 700; color: var(--color-success-ink); }
        .chips2 { display: flex; gap: 8px; margin-bottom: 6px; }
        .lc { flex: 1; font-family: inherit; font-size: var(--fs-2); font-weight: 700; color: var(--color-ink-2); background: var(--color-card); border: 1.5px solid var(--color-line); border-radius: var(--radius-sm); padding: 11px; cursor: pointer; text-align: center; }
        .lc.on { border-color: var(--color-primary); background: var(--color-primary-soft); color: var(--color-primary); }
        .tax-note { font-size: var(--fs-2); color: var(--color-ink-3); line-height: 1.5; margin-top: 8px; background: var(--color-card-soft); border-radius: var(--radius-sm); padding: 10px 12px; }
        .tax-note b { color: var(--color-ink-2); }

        .search-res { margin-top: 6px; }
        .sr { display: flex; align-items: center; justify-content: space-between; padding: 13px; border: 1.5px solid var(--color-line); border-radius: var(--radius-md); margin-bottom: 8px; cursor: pointer; background: var(--color-card); }
        .sr.sel { border-color: var(--color-primary); background: var(--color-primary-soft); }
        .sn { font-size: var(--fs-4); font-weight: 700; }
        .sd { font-size: var(--fs-2); color: var(--color-ink-3); margin-top: 2px; }
        .sv { font-size: var(--fs-3); font-weight: 700; color: var(--color-ink-2); }
        /* 단지 카드 + 면적 칩(여러 면적 선택) */
        .sr2 { border: 1.5px solid var(--color-line); border-radius: var(--radius-md); padding: 12px 13px; margin-bottom: 8px; background: var(--color-card); }
        .sr2-head { display: flex; align-items: baseline; gap: 8px; margin-bottom: 9px; }
        .sr2-head .sd { margin-top: 0; }
        .sr2-none { font-size: var(--fs-2); color: var(--color-ink-3); padding: 8px 2px; }
        .area-chips { display: flex; gap: 7px; flex-wrap: wrap; }
        .area-chip { flex: 1; min-width: 88px; display: flex; flex-direction: column; align-items: center; gap: 2px; background: var(--color-card-soft); border: 1.5px solid var(--color-line); border-radius: var(--radius-sm); padding: 9px 8px; cursor: pointer; font-family: inherit; }
        .area-chip:active { border-color: var(--color-primary); background: var(--color-primary-soft); }
        .ac-area { font-size: var(--fs-2); font-weight: 700; color: var(--color-ink); }
        .ac-uk { font-size: var(--fs-2); font-weight: 800; color: var(--color-primary); }
        .custom-toggle { width: 100%; text-align: left; background: none; border: none; font-family: inherit; font-size: var(--fs-2); font-weight: 700; color: var(--color-primary); padding: 8px 2px 10px; cursor: pointer; }
        .re-del { background: none; border: none; color: var(--color-ink-3); font-size: var(--fs-3); cursor: pointer; padding: 2px 4px; }
        .auto-val { background: var(--hero-grad-1); color: var(--hero-ink); border-radius: var(--radius-md); padding: 15px; margin-top: 6px; animation: fade .4s ease; }
        .avt { font-size: var(--fs-2); color: var(--hero-ink-sub); margin-bottom: 5px; }
        .avv { font-size: var(--fs-7); font-weight: 800; }
        .avn { font-size: var(--fs-1); color: var(--hero-ink-faint); margin-top: 5px; }

        .foot { display: flex; gap: 10px; margin-top: 20px; }
        .foot button { font-family: inherit; font-weight: 700; font-size: var(--fs-5); border-radius: var(--radius-md); padding: 15px; cursor: pointer; border: none; }
        .btn-prev { background: var(--color-card-soft); color: var(--color-ink-2); flex: 0 0 88px; }
        .btn-next { background: var(--color-primary); color: var(--color-on-primary); flex: 1; }

        .final-hero { text-align: center; padding: 6px 0 18px; }
        .emoji { font-size: 44px; margin-bottom: 10px; }
        .score-card { background: linear-gradient(135deg, var(--hero-grad-1), var(--hero-grad-2)); color: var(--hero-ink); border-radius: var(--radius-card); padding: 22px; text-align: center; margin-bottom: 14px; }
        .sct { font-size: var(--fs-3); color: var(--hero-ink-sub); font-weight: 600; margin-bottom: 6px; }
        .score-was { font-size: var(--fs-3); color: var(--hero-ink-faint); text-decoration: line-through; margin-bottom: 2px; }
        .score-now { font-size: 44px; font-weight: 800; color: var(--hero-accent); line-height: 1; }
        .score-now span { font-size: var(--fs-6); }
        .cmp-title { font-size: var(--fs-4); font-weight: 700; margin-bottom: 14px; }
        .cmp-row { display: flex; align-items: center; gap: 10px; margin-bottom: 11px; }
        .ck { width: 48px; font-size: var(--fs-2); font-weight: 700; color: var(--color-ink-2); }
        .cmp-track { flex: 1; height: 22px; background: var(--color-card-soft); border-radius: var(--radius-sm); position: relative; overflow: hidden; }
        .cmp-tgt { position: absolute; top: 0; height: 100%; width: 3px; background: var(--color-ink); }
        .cmp-val { width: 92px; text-align: right; font-size: var(--fs-2); font-weight: 600; color: var(--color-ink-2); }
        .cmp-note { font-size: var(--fs-2); color: var(--color-ink-3); margin-top: 12px; line-height: 1.5; }
        .from-note { background: var(--color-primary-soft); color: var(--color-ink-2); border-radius: var(--radius-md, 12px); padding: 11px 13px; font-size: var(--fs-2, 13px); line-height: 1.5; margin-bottom: 14px; word-break: keep-all; }
        .from-note b { color: var(--color-primary); }
        .fv { border: 1px solid var(--color-primary); }
        .fv-t { font-size: var(--fs-2); font-weight: 700; color: var(--color-ink-3); }
        .fv-q { font-size: var(--fs-4); font-weight: 700; color: var(--color-ink); margin: 4px 0 12px; word-break: keep-all; }
        .fv-btns { display: flex; gap: 8px; }
        .fv-b { flex: 1; border: 1px solid var(--color-line); background: var(--color-card); color: var(--color-ink); font-size: var(--fs-2); font-weight: 700; padding: 11px 6px; border-radius: var(--radius-md); cursor: pointer; font-family: var(--font-sans); }
        .fv-b.hold { border-color: var(--color-primary); color: var(--color-primary); }
        .fv-b:disabled { opacity: .6; }
        .fv-skip { margin-top: 10px; width: 100%; background: none; border: none; color: var(--color-ink-3); font-size: var(--fs-2); cursor: pointer; font-family: var(--font-sans); text-decoration: underline; }
        .fv-done { font-size: var(--fs-3); font-weight: 700; color: var(--color-success); display: flex; flex-direction: column; gap: 4px; }
        .fv-done.quiet { color: var(--color-ink-3); font-weight: 600; }
        .fv-sub { font-size: var(--fs-1); font-weight: 500; color: var(--color-ink-3); line-height: 1.5; word-break: keep-all; }
        .g3-t { font-size: var(--fs-4); font-weight: 700; margin-bottom: 13px; }
        .g3-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 13px; }
        .g3-list li { display: flex; align-items: flex-start; gap: 11px; }
        .g3-ic { width: 30px; height: 30px; border-radius: var(--radius-sm); background: var(--color-primary-soft); display: grid; place-items: center; font-size: var(--fs-5); flex-shrink: 0; }
        .g3-b { display: flex; flex-direction: column; }
        .g3-b b { font-size: var(--fs-3); font-weight: 700; }
        .g3-d { font-size: var(--fs-2); color: var(--color-ink-3); margin-top: 2px; line-height: 1.5; }
      `}</style>
      <style jsx global>{`body { background: var(--color-bg-deep); margin: 0; }`}</style>
    </div>
  );
}
