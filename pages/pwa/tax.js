// [내 세금] 공시가격 기반 재산세·종합부동산세 추정 계산기.
//   숫자는 lib/propertyTax.js(data/property_tax_rules.json 단일 소스)에서만 나온다 — 하드코딩 없음.
//   재산세액공제·세부담상한 등 일부 항목은 반영하지 않은 추정치임을 화면에 항상 고지한다.
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/router";
import AppHeader from "../../components/AppHeader";
import BottomNav from "../../components/BottomNav";
import { calcPropertyTax, calcComprehensiveTax, won, PROPERTY_TAX_META } from "../../lib/propertyTax";

// [2026-08-05] 자동화 관점 개선 — 매번 처음부터 다시 입력하지 않도록 마지막 입력을 저장,
//   다음 방문 시 자동으로 채우고 즉시 계산까지 해 둔다(버튼 한 번 덜 눌러도 됨).
const SAVE_KEY = "onehub_tax_last_input";

function parseEok(s) {
  const n = Number(String(s).replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100000000) : 0;
}
function eokLabel(won) {
  return won > 0 ? `${(won / 100000000).toFixed(2)}억원` : "";
}

export default function TaxPage() {
  const router = useRouter();
  const [assessed, setAssessed] = useState(""); // 공시가격(억)
  const [multiAssessed, setMultiAssessed] = useState(""); // 다주택 합계(억, 선택)
  const [isOneHouse, setIsOneHouse] = useState(true);
  const [houseCount, setHouseCount] = useState(1);
  const [age, setAge] = useState("");
  const [holdingYears, setHoldingYears] = useState("");
  const [result, setResult] = useState(null);

  const computeResult = useCallback((v) => {
    const assessedValue = parseEok(v.assessed);
    if (assessedValue <= 0) return null;
    const pt = calcPropertyTax(assessedValue, v.isOneHouse);
    const totalAssessedValue = v.multiAssessed ? parseEok(v.multiAssessed) : assessedValue;
    const ct = calcComprehensiveTax({
      totalAssessedValue,
      isOneHouse: v.isOneHouse,
      houseCount: Number(v.houseCount) || 1,
      age: v.age ? Number(v.age) : null,
      holdingYears: v.holdingYears ? Number(v.holdingYears) : null,
    });
    return { pt, ct };
  }, []);

  const calc = () => {
    const vals = { assessed, multiAssessed, isOneHouse, houseCount, age, holdingYears };
    const r = computeResult(vals);
    if (!r) return;
    setResult(r);
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(vals)); } catch {}
  };

  // [자동화] 저장된 마지막 입력을 불러와 채우고 바로 계산까지 — 재방문 시 클릭 한 번으로 결과 확인.
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(SAVE_KEY) || "null");
      if (!saved || !saved.assessed) return;
      setAssessed(saved.assessed || "");
      setMultiAssessed(saved.multiAssessed || "");
      setIsOneHouse(saved.isOneHouse !== false);
      setHouseCount(saved.houseCount || 1);
      setAge(saved.age || "");
      setHoldingYears(saved.holdingYears || "");
      const r = computeResult(saved);
      if (r) setResult(r);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="tx">
      <AppHeader />
      <div className="tx-title">💰 내 세금 <span className="tx-sub">재산세·종부세 추정</span></div>

      <section className="hero">
        <div className="hero-eyebrow">
          <span className="hero-lbl">🏠 공시가격 기반 계산</span>
        </div>
        <div className="hero-big">얼마 나올지, 미리 가늠해보세요</div>
        <div className="hero-sub">공시가격만 입력하면 재산세·종합부동산세(종부세) 대상 여부와 예상 세액을 한 번에 확인합니다.</div>
      </section>

      <section className="card">
        <div className="tile-h">📋 정보 입력</div>

        <label className="field">
          <span className="field-l">공시가격</span>
          <div className="field-row">
            <input inputMode="decimal" placeholder="예: 9.5" value={assessed} onChange={(e) => setAssessed(e.target.value)} />
            <span className="field-unit">억원</span>
          </div>
        </label>

        <label className="toggle-row">
          <span>1세대1주택자</span>
          <button type="button" className={`toggle ${isOneHouse ? "on" : ""}`} onClick={() => setIsOneHouse((v) => !v)}>
            <span className="toggle-dot" />
          </button>
        </label>

        <label className="field">
          <span className="field-l">보유 주택 수 <em>(종부세 세율 구간용)</em></span>
          <div className="seg3">
            {[1, 2, 3].map((n) => (
              <button key={n} type="button" className={Number(houseCount) === n ? "on" : ""} onClick={() => setHouseCount(n)}>
                {n === 3 ? "3채 이상" : `${n}채`}
              </button>
            ))}
          </div>
        </label>

        {Number(houseCount) > 1 && (
          <label className="field">
            <span className="field-l">보유 주택 공시가격 <em>합계</em> <em>(다주택 — 비워두면 위 값 사용)</em></span>
            <div className="field-row">
              <input inputMode="decimal" placeholder="예: 18" value={multiAssessed} onChange={(e) => setMultiAssessed(e.target.value)} />
              <span className="field-unit">억원</span>
            </div>
          </label>
        )}

        {isOneHouse && (
          <>
            <label className="field">
              <span className="field-l">나이 <em>(고령자 세액공제, 선택)</em></span>
              <div className="field-row">
                <input inputMode="numeric" placeholder="예: 62" value={age} onChange={(e) => setAge(e.target.value)} />
                <span className="field-unit">세</span>
              </div>
            </label>
            <label className="field">
              <span className="field-l">보유 기간 <em>(장기보유 세액공제, 선택)</em></span>
              <div className="field-row">
                <input inputMode="numeric" placeholder="예: 8" value={holdingYears} onChange={(e) => setHoldingYears(e.target.value)} />
                <span className="field-unit">년</span>
              </div>
            </label>
          </>
        )}

        <button className="calc-btn" onClick={calc} disabled={!assessed}>계산하기</button>
      </section>

      {result && (
        <>
          <section className="card">
            <div className="tile-h">🧾 재산세 <span className="tile-badge">추정</span></div>
            <div className="result-big">{won(result.pt.total)}</div>
            <div className="result-sub">공시가격 {eokLabel(parseEok(assessed))} · 과세표준 {won(result.pt.taxBase)} (공정시장가액비율 {Math.round(result.pt.ratio * 100)}%)</div>
            <div className="breakdown">
              <div className="brow"><span>재산세 본세</span><b>{won(result.pt.propertyTax)}</b></div>
              <div className="brow"><span>도시지역분</span><b>{won(result.pt.urbanAreaTax)}</b></div>
              <div className="brow"><span>지방교육세</span><b>{won(result.pt.localEduTax)}</b></div>
            </div>
          </section>

          <section className="card">
            <div className="tile-h">🏛️ 종합부동산세 <span className="tile-badge">추정</span></div>
            {!result.ct.isSubject ? (
              <div className="result-quiet">
                <div className="result-big small">대상 아님</div>
                <div className="result-sub">기본공제({isOneHouse ? "1세대1주택 12억" : "9억"})를 넘지 않아 종부세 대상이 아닙니다.</div>
              </div>
            ) : (
              <>
                <div className="result-big">{won(result.ct.finalTax)}</div>
                <div className="result-sub">
                  과세표준 {won(result.ct.taxBase)} · 산출세액 {won(result.ct.grossTax)}
                  {result.ct.creditRate > 0 ? ` · 세액공제 ${Math.round(result.ct.creditRate * 100)}% 적용` : ""}
                </div>
              </>
            )}
          </section>

          <div className="disclaimer">
            🟡 {PROPERTY_TAX_META.disclaimer} 재산세액공제·세부담상한은 이 계산에 반영되지 않았습니다.
          </div>
        </>
      )}

      <BottomNav active="assets" />

      <style jsx>{`
        .tx { max-width: 480px; margin: 0 auto; padding: 0 14px calc(env(safe-area-inset-bottom, 0px) + 140px); font-family: var(--font-sans); color: var(--color-ink); min-height: 100vh; background: var(--color-bg); }
        .tx-title { display: flex; align-items: center; gap: 8px; font-size: 20px; font-weight: 800; letter-spacing: -.4px; margin: 6px 2px 14px; }
        .tx-sub { font-size: 12px; font-weight: 600; color: var(--color-ink-3); }
        .hero { background: linear-gradient(135deg, var(--hero-grad-1), var(--hero-grad-2)); color: var(--hero-ink); border-radius: var(--radius-hero, 22px); padding: 20px 18px; box-shadow: var(--shadow-float); margin-bottom: 12px; }
        .hero-eyebrow { margin-bottom: 12px; }
        .hero-lbl { font-size: 12px; font-weight: 700; color: var(--hero-ink-sub); }
        .hero-big { font-size: 22px; font-weight: 800; letter-spacing: -.4px; margin-bottom: 6px; }
        .hero-sub { font-size: 13px; color: var(--hero-ink-soft); line-height: 1.55; word-break: keep-all; }
        .card { background: var(--color-card); border: 1px solid var(--color-line); border-radius: var(--radius-card, 14px); padding: 16px; margin-bottom: 12px; box-shadow: var(--shadow-card); }
        .tile-h { font-size: 0.92rem; font-weight: 800; color: var(--color-ink); margin-bottom: 14px; display: flex; align-items: center; gap: 8px; }
        .tile-badge { font-size: 0.62rem; font-weight: 800; padding: 2px 8px; border-radius: 999px; background: var(--color-warning-soft); color: var(--color-warning-ink, var(--color-warning)); }
        .field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px; }
        .field-l { font-size: 0.78rem; font-weight: 700; color: var(--color-ink-2); }
        .field-l em { font-style: normal; font-weight: 500; color: var(--color-ink-3); }
        .field-row { display: flex; align-items: center; gap: 8px; background: var(--color-card-soft, var(--color-bg)); border: 1px solid var(--color-line); border-radius: 11px; padding: 0 12px; }
        .field-row input { flex: 1; border: none; background: none; padding: 12px 0; font-size: 1rem; font-weight: 700; color: var(--color-ink); font-family: ui-monospace, monospace; outline: none; }
        .field-unit { font-size: 0.82rem; font-weight: 700; color: var(--color-ink-3); }
        .toggle-row { display: flex; align-items: center; justify-content: space-between; padding: 4px 0 14px; font-size: 0.86rem; font-weight: 700; color: var(--color-ink); }
        .toggle { width: 44px; height: 26px; border-radius: 999px; border: none; background: var(--color-line); position: relative; cursor: pointer; padding: 0; }
        .toggle.on { background: var(--color-primary); }
        .toggle-dot { position: absolute; top: 3px; left: 3px; width: 20px; height: 20px; border-radius: 50%; background: #fff; transition: transform .15s; }
        .toggle.on .toggle-dot { transform: translateX(18px); }
        .seg3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
        .seg3 button { padding: 9px 0; border-radius: 9px; border: 1px solid var(--color-line); background: var(--color-card-soft, var(--color-bg)); color: var(--color-ink-2); font-size: 0.78rem; font-weight: 700; cursor: pointer; font-family: var(--font-sans); }
        .seg3 button.on { background: var(--color-primary); border-color: var(--color-primary); color: #fff; }
        .calc-btn { width: 100%; min-height: 48px; border: none; border-radius: 12px; background: var(--color-primary); color: #fff; font-size: 0.92rem; font-weight: 800; cursor: pointer; font-family: var(--font-sans); }
        .calc-btn:disabled { opacity: .45; cursor: default; }
        .result-big { font-size: 1.7rem; font-weight: 800; font-family: ui-monospace, monospace; color: var(--color-ink); letter-spacing: -.3px; }
        .result-big.small { font-size: 1.1rem; color: var(--color-ink-2); }
        .result-sub { font-size: 0.76rem; color: var(--color-ink-3); margin-top: 6px; line-height: 1.5; word-break: keep-all; }
        .result-quiet { padding: 4px 0; }
        .breakdown { margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--color-line); display: flex; flex-direction: column; gap: 8px; }
        .brow { display: flex; align-items: center; justify-content: space-between; font-size: 0.8rem; }
        .brow span { color: var(--color-ink-2); }
        .brow b { font-family: ui-monospace, monospace; color: var(--color-ink); }
        .disclaimer { font-size: 0.7rem; color: var(--color-ink-3); line-height: 1.6; padding: 12px 14px; background: var(--color-warning-soft); border-radius: 11px; margin-bottom: 12px; word-break: keep-all; }
      `}</style>
      <style jsx global>{`body { background: var(--color-bg); margin: 0; }`}</style>
    </div>
  );
}
