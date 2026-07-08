// [v10 UI] 온보딩 위저드 — 성향 → 주식 → ETF → 부동산 → 완료 (시안: onehub-onboarding.html)
//   §5② 배선: 성향 결과 → 목표 자산배분(%)을 localStorage(onehub_target_alloc)에 저장하여
//   AI자산운영 탭의 "목표 %" 단일 소스로 사용한다. 완료 시 홈으로 이동.
//   색상은 디자인 토큰(var(--…))만 사용. 다크모드는 <html data-theme>.
import { useState } from "react";
import { useRouter } from "next/router";

// 성향(goal) → 목표 배분(%) 매핑 — AI자산 목표% 소스
const ALLOC_MAP = {
  safe:    { 주식: 10, ETF: 20, 부동산: 60, 현금: 10 },
  balance: { 주식: 20, ETF: 30, 부동산: 45, 현금: 5 },
  growth:  { 주식: 40, ETF: 35, 부동산: 20, 현금: 5 },
};
const ALLOC_COLOR = { 주식: "var(--color-primary)", ETF: "var(--color-success)", 부동산: "var(--color-warning)", 현금: "var(--color-ink-3)" };
const TOTAL_SECTIONS = 4; // 성향 + 3자산

export default function Onboarding() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [personality, setPersonality] = useState({}); // goal / risk / horizon
  const [stockForm, setStockForm] = useState({ name: "", qty: "", price: "" });
  const [stockList, setStockList] = useState([]); // [{name, uk}]
  const [etfForm, setEtfForm] = useState({ name: "", qty: "", price: "" });
  const [etfList, setEtfList] = useState([]); // [{name, uk, listing}]
  const [etfListing, setEtfListing] = useState("US"); // US | KR
  const [rePick, setRePick] = useState(null); // {name, amt}
  const USD_FX = 1350; // ETF($) 환산 환율(근사)

  const alloc = personality.goal ? ALLOC_MAP[personality.goal] : null;
  const num = (v) => { const n = Number(String(v).replace(/[,\s]/g, "")); return isFinite(n) ? n : 0; };
  const uk1 = (n) => Math.round(n / 1e8 * 100) / 100; // 원 → 억(소수2)
  const stockUk = stockList.reduce((s, x) => s + x.uk, 0);
  const etfUk = etfList.reduce((s, x) => s + x.uk, 0);
  const reUk = rePick ? Number(String(rePick.amt).replace(/[^0-9.]/g, "")) || 0 : 0;

  // 정확도 게이지 — 완료 섹션 수 기반
  const done = step >= 5 ? 4 : Math.max(0, Math.min(4, step - 1));
  const gauge = Math.round((done / TOTAL_SECTIONS) * 100);

  const pick = (q, val) => setPersonality((p) => ({ ...p, [q]: val }));

  const addStock = () => {
    const uk = uk1(num(stockForm.qty) * num(stockForm.price));
    if (uk <= 0 && !stockForm.name) return;
    setStockList((l) => [...l, { name: stockForm.name || "종목", uk }]);
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
      }));
    } catch (e) {}
  };

  const finish = () => { persist(); router.push("/pwa"); };
  const go = (n) => { if (n >= 5) persist(); setStep(n); if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" }); };

  const Opt = ({ q, val, title, sub }) => (
    <button className={`opt ${personality[q] === val ? "sel" : ""}`} onClick={() => pick(q, val)}>
      <span>{title}{sub && <span className="osub">{sub}</span>}</span>
      <span className="check">✓</span>
    </button>
  );

  return (
    <div className="wrap">
      <div className="phone">
        {/* progress header */}
        <div className="phead">
          <div className="phead-top">
            <div className="brand">ONE<span className="bdot">·</span>HUB</div>
            <button className="skip" onClick={finish}>나중에 하기</button>
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
              <div className="q">
                <div className="q-t">1. 투자 목표에 가까운 건?</div>
                <div className="opts">
                  <Opt q="goal" val="safe" title="안정적 수익" sub="잃지 않는 게 우선" />
                  <Opt q="goal" val="balance" title="균형" sub="수익과 안정 사이" />
                  <Opt q="goal" val="growth" title="적극적 성장" sub="변동성 감수, 수익 우선" />
                </div>
              </div>
              <div className="q">
                <div className="q-t">2. 보유 자산이 −10% 되면?</div>
                <div className="opts">
                  <Opt q="risk" val="sell" title="바로 정리한다" />
                  <Opt q="risk" val="hold" title="지켜본다" />
                  <Opt q="risk" val="buy" title="기회로 보고 더 산다" />
                </div>
              </div>
              <div className="q">
                <div className="q-t">3. 이 돈은 언제 쓰나요?</div>
                <div className="opts">
                  <Opt q="horizon" val="short" title="1년 안에" />
                  <Opt q="horizon" val="mid" title="3~5년" />
                  <Opt q="horizon" val="long" title="당분간 쓸 일 없음" />
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
                  <div className="field"><label>평균 매수가</label><input placeholder="156,600" inputMode="numeric" value={stockForm.price} onChange={(e) => setStockForm((f) => ({ ...f, price: e.target.value }))} /></div>
                </div>
                <button className="add-btn" onClick={addStock}>+ 종목 추가</button>
                {stockList.length > 0 && (
                  <div className="added">
                    <div className="added-t">추가된 종목 · 합계 {stockUk}억</div>
                    {stockList.map((s, i) => (
                      <div className="arow2" key={i}><div><div className="an">{s.name}</div></div><div className="av">{s.uk}억</div></div>
                    ))}
                  </div>
                )}
              </div>
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
              <p className="lead">단지만 선택하면 실거래 기반으로 시세가 자동 산정됩니다. 금액을 직접 입력할 필요 없어요.</p>
              <div className="field"><label>단지 검색 (분당구)</label><input placeholder="예: 시범, 효자촌" defaultValue="시범" /></div>
              <div className="search-res">
                {[["시범우성", "서현동 · 84㎡ 기준", "20.29억"], ["시범삼성", "서현동 · 84㎡ 기준", "21.54억"], ["시범한양", "서현동 · 84㎡ 기준", "20.33억"]].map(([n, d, a]) => (
                  <div key={n} className={`sr ${rePick?.name === n ? "sel" : ""}`} onClick={() => setRePick({ name: n, amt: a })}>
                    <div><div className="sn">{n}</div><div className="sd">{d}</div></div><div className="sv">≈ {a}</div>
                  </div>
                ))}
              </div>
              {rePick && (
                <div className="auto-val">
                  <div className="avt">✅ 실거래 기반 자동 산정 · {rePick.name}</div>
                  <div className="avv">{rePick.amt}</div>
                  <div className="avn">최근 실거래가 기준 · 직접 수정 가능</div>
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
        .brand { font-weight: 800; font-size: 15px; letter-spacing: -.3px; }
        .bdot { color: var(--color-success); }
        .skip { font-size: 12px; color: var(--hero-ink-faint); background: none; border: none; font-family: inherit; cursor: pointer; }
        .acc-lbl { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 8px; }
        .acc-lbl .t { font-size: 12.5px; color: var(--hero-ink-sub); font-weight: 600; }
        .acc-lbl .p { font-size: 15px; font-weight: 800; color: var(--hero-accent); }
        .acc-track { height: 8px; background: var(--hero-fill-line); border-radius: 6px; overflow: hidden; }
        .acc-fill { height: 100%; background: linear-gradient(90deg, var(--color-success), var(--hero-accent)); border-radius: 6px; transition: width .5s cubic-bezier(.4,0,.2,1); }
        .dots { display: flex; gap: 6px; margin-top: 14px; }
        .dot-step { flex: 1; height: 4px; border-radius: 3px; background: var(--hero-fill-line); transition: .3s; }
        .dot-step.done { background: var(--color-success); }
        .dot-step.cur { background: var(--hero-ink); }

        .body { padding: 20px 18px; }
        .step { animation: fade .35s ease; }
        @keyframes fade { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
        .eyebrow { font-size: 12px; font-weight: 700; color: var(--color-primary); letter-spacing: .3px; margin-bottom: 9px; }
        h1 { font-size: 23px; font-weight: 800; letter-spacing: -.6px; line-height: 1.3; margin-bottom: 10px; }
        h1 em { font-style: normal; color: var(--color-primary); }
        .lead { font-size: 13.5px; color: var(--color-ink-2); line-height: 1.6; margin-bottom: 20px; }

        .card { background: var(--color-card); border-radius: 18px; padding: 16px; box-shadow: var(--shadow-card); margin-bottom: 12px; }
        .why { display: flex; flex-direction: column; gap: 10px; margin-bottom: 22px; }
        .why-item { display: flex; align-items: center; gap: 13px; background: var(--color-card); border-radius: 16px; padding: 14px 15px; box-shadow: var(--shadow-card); }
        .why-ic { width: 40px; height: 40px; border-radius: 12px; display: grid; place-items: center; font-size: 19px; flex-shrink: 0; }
        .wk { font-size: 14px; font-weight: 700; }
        .wd { font-size: 12px; color: var(--color-ink-3); margin-top: 2px; }

        .q { margin-bottom: 22px; }
        .q-t { font-size: 15px; font-weight: 700; margin-bottom: 12px; }
        .opts { display: flex; flex-direction: column; gap: 8px; }
        .opt { display: flex; align-items: center; justify-content: space-between; background: var(--color-card); border: 1.5px solid var(--color-line); border-radius: 14px; padding: 14px 15px; font-size: 14px; font-weight: 600; cursor: pointer; transition: .15s; font-family: inherit; text-align: left; width: 100%; color: var(--color-ink); }
        .osub { display: block; font-size: 12px; color: var(--color-ink-3); font-weight: 500; margin-top: 2px; }
        .opt.sel { border-color: var(--color-primary); background: var(--color-primary-soft); color: var(--color-primary); }
        .opt.sel .osub { color: var(--color-primary); }
        .opt .check { width: 20px; height: 20px; border-radius: 50%; border: 2px solid var(--color-line); flex-shrink: 0; display: grid; place-items: center; font-size: 11px; color: transparent; }
        .opt.sel .check { background: var(--color-primary); border-color: var(--color-primary); color: #fff; }

        .preview { background: var(--hero-grad-1); border-radius: 16px; padding: 16px; color: var(--hero-ink); margin-bottom: 8px; animation: fade .4s ease; }
        .pt { font-size: 12px; color: var(--hero-ink-sub); font-weight: 600; margin-bottom: 12px; }
        .alloc-bar { display: flex; height: 26px; border-radius: 8px; overflow: hidden; margin-bottom: 10px; }
        .alloc-seg { display: flex; align-items: center; justify-content: center; font-size: 10.5px; font-weight: 700; color: #fff; }
        .alloc-legend { display: flex; flex-wrap: wrap; gap: 10px; }
        .lg { display: flex; align-items: center; gap: 5px; font-size: 11.5px; color: var(--hero-ink-soft); }
        .lg i { width: 9px; height: 9px; border-radius: 3px; }

        .field { margin-bottom: 11px; }
        .field label, .flabel { display: block; font-size: 12px; font-weight: 600; color: var(--color-ink-2); margin-bottom: 6px; }
        .field input { width: 100%; font-family: inherit; font-size: 14px; border: 1.5px solid var(--color-line); border-radius: 11px; padding: 12px 13px; color: var(--color-ink); background: var(--color-card); }
        .field input:focus { outline: none; border-color: var(--color-primary); }
        .frow { display: flex; gap: 9px; }
        .frow .field { flex: 1; }
        .add-btn { width: 100%; font-family: inherit; font-size: 14px; font-weight: 700; color: #fff; background: var(--color-primary); border: none; padding: 13px; border-radius: 12px; cursor: pointer; margin-top: 3px; }
        .added { margin-top: 14px; }
        .added-t { font-size: 12px; font-weight: 700; color: var(--color-ink-2); margin-bottom: 9px; }
        .arow2 { display: flex; align-items: center; justify-content: space-between; background: var(--color-success-soft); border-radius: 12px; padding: 11px 13px; margin-bottom: 7px; }
        .an { font-size: 13.5px; font-weight: 700; }
        .aq { font-size: 11.5px; color: var(--color-ink-2); margin-top: 2px; }
        .av { font-size: 13px; font-weight: 700; color: var(--color-success-ink); }
        .chips2 { display: flex; gap: 8px; margin-bottom: 6px; }
        .lc { flex: 1; font-family: inherit; font-size: 12.5px; font-weight: 700; color: var(--color-ink-2); background: var(--color-card); border: 1.5px solid var(--color-line); border-radius: 11px; padding: 11px; cursor: pointer; text-align: center; }
        .lc.on { border-color: var(--color-primary); background: var(--color-primary-soft); color: var(--color-primary); }
        .tax-note { font-size: 11.5px; color: var(--color-ink-3); line-height: 1.5; margin-top: 8px; background: var(--color-card-soft); border-radius: 10px; padding: 10px 12px; }
        .tax-note b { color: var(--color-ink-2); }

        .search-res { margin-top: 6px; }
        .sr { display: flex; align-items: center; justify-content: space-between; padding: 13px; border: 1.5px solid var(--color-line); border-radius: 13px; margin-bottom: 8px; cursor: pointer; background: var(--color-card); }
        .sr.sel { border-color: var(--color-primary); background: var(--color-primary-soft); }
        .sn { font-size: 14px; font-weight: 700; }
        .sd { font-size: 11.5px; color: var(--color-ink-3); margin-top: 2px; }
        .sv { font-size: 13px; font-weight: 700; color: var(--color-ink-2); }
        .auto-val { background: var(--hero-grad-1); color: var(--hero-ink); border-radius: 14px; padding: 15px; margin-top: 6px; animation: fade .4s ease; }
        .avt { font-size: 11.5px; color: var(--hero-ink-sub); margin-bottom: 5px; }
        .avv { font-size: 22px; font-weight: 800; }
        .avn { font-size: 11px; color: var(--hero-ink-faint); margin-top: 5px; }

        .foot { display: flex; gap: 10px; margin-top: 20px; }
        .foot button { font-family: inherit; font-weight: 700; font-size: 15px; border-radius: 14px; padding: 15px; cursor: pointer; border: none; }
        .btn-prev { background: var(--color-card-soft); color: var(--color-ink-2); flex: 0 0 88px; }
        .btn-next { background: var(--color-primary); color: #fff; flex: 1; }

        .final-hero { text-align: center; padding: 6px 0 18px; }
        .emoji { font-size: 44px; margin-bottom: 10px; }
        .score-card { background: linear-gradient(135deg, var(--hero-grad-1), var(--hero-grad-2)); color: var(--hero-ink); border-radius: 20px; padding: 22px; text-align: center; margin-bottom: 14px; }
        .sct { font-size: 13px; color: var(--hero-ink-sub); font-weight: 600; margin-bottom: 6px; }
        .score-was { font-size: 13px; color: var(--hero-ink-faint); text-decoration: line-through; margin-bottom: 2px; }
        .score-now { font-size: 44px; font-weight: 800; color: var(--hero-accent); line-height: 1; }
        .score-now span { font-size: 20px; }
        .cmp-title { font-size: 14px; font-weight: 700; margin-bottom: 14px; }
        .cmp-row { display: flex; align-items: center; gap: 10px; margin-bottom: 11px; }
        .ck { width: 48px; font-size: 12.5px; font-weight: 700; color: var(--color-ink-2); }
        .cmp-track { flex: 1; height: 22px; background: var(--color-card-soft); border-radius: 7px; position: relative; overflow: hidden; }
        .cmp-tgt { position: absolute; top: 0; height: 100%; width: 3px; background: var(--color-ink); }
        .cmp-val { width: 92px; text-align: right; font-size: 11.5px; font-weight: 600; color: var(--color-ink-2); }
        .cmp-note { font-size: 11.5px; color: var(--color-ink-3); margin-top: 12px; line-height: 1.5; }
      `}</style>
      <style jsx global>{`body { background: var(--color-bg-deep); margin: 0; }`}</style>
    </div>
  );
}
