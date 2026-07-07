// 온보딩 — 30초 개인 설정 (3스텝). POST /api/realestate/v2/profile/setup + localStorage
import { useState } from "react";
import { useRouter } from "next/router";

const MISSION_OPTS = [
  { key: "A", icon: "🏠", label: "같은 단지 평형 이동" },
  { key: "B", icon: "🏙️", label: "같은 동 상급지 이동" },
  { key: "C", icon: "🧭", label: "다른 지역 탐색" },
  { key: "D", icon: "📊", label: "투자 — 저평가 단지" },
  { key: "E", icon: "💼", label: "자산 통합 최적화" },
];
const DONGS = ["서현동", "이매동", "정자동", "야탑동", "수내동", "구미동", "판교동", "분당동"];
const AREAS = [59, 84, 109, 129];
const tog = (arr, v) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

export default function Onboarding() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [f, setF] = useState({ current_complex: "", current_dong: "서현동", mission_types: [], budget_uk: 10, target_area_m2: 84, interest_dongs: [] });
  const up = (k, v) => setF((s) => ({ ...s, [k]: v }));

  const complete = async () => {
    setSaving(true);
    const payload = { ...f, trader_id: "A", primary_mission: f.mission_types[0] || "A" };
    try {
      await fetch("/api/realestate/v2/profile/setup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      localStorage.setItem("onehub_profile", JSON.stringify(payload));
      localStorage.setItem("onehub_onboarded", "true");
    } catch (e) { /* offline: localStorage만 */ }
    setSaving(false);
    router.push("/realestate?onboarded=1");
  };

  return (
    <div className="ob">
      <div className="prog">
        {[1, 2, 3].map((s) => <div key={s} className="bar" style={{ background: s <= step ? "#2563eb" : "#e5e7eb" }} />)}
        <span className="pct">{step}/3</span>
      </div>

      {step === 1 && (
        <div className="pad">
          <h2>현재 거주 또는 보유 단지</h2><p className="sub">없으면 건너뛰어도 됩니다.</p>
          <input className="ipt" placeholder="단지명 입력 (예: 시범삼성)" value={f.current_complex} onChange={(e) => up("current_complex", e.target.value)} />
          <p className="lbl">동 선택</p>
          <div className="chips">{DONGS.map((d) => <button key={d} className={`chip ${f.current_dong === d ? "on" : ""}`} onClick={() => up("current_dong", d)}>{d}</button>)}</div>
          <button className="ghost" onClick={() => { up("current_complex", ""); up("current_dong", "서현동"); setStep(2); }}>단지 없음 (건너뛰기)</button>
          <button className="prim" onClick={() => setStep(2)}>다음 →</button>
        </div>
      )}

      {step === 2 && (
        <div className="pad">
          <h2>어떤 이동을 고민 중이신가요?</h2><p className="sub">복수 선택 가능</p>
          <div className="opts">
            {MISSION_OPTS.map((o) => {
              const on = f.mission_types.includes(o.key);
              return <button key={o.key} className={`opt ${on ? "on" : ""}`} onClick={() => up("mission_types", tog(f.mission_types, o.key))}>
                <span className="opt-ic">{o.icon}</span><span>{o.label}</span>{on && <span className="ck">✓</span>}</button>;
            })}
          </div>
          <div className="nav2"><button className="ghost2" onClick={() => setStep(1)}>← 이전</button><button className="prim" onClick={() => setStep(3)}>다음 →</button></div>
        </div>
      )}

      {step === 3 && (
        <div className="pad">
          <h2>목표 설정</h2>
          <p className="lbl">목표 예산</p>
          <div className="slider"><input type="range" min={3} max={30} value={f.budget_uk} onChange={(e) => up("budget_uk", +e.target.value)} /><b>{f.budget_uk}억</b></div>
          <p className="lbl">희망 평형</p>
          <div className="chips">{AREAS.map((a) => <button key={a} className={`chip ${f.target_area_m2 === a ? "on" : ""}`} onClick={() => up("target_area_m2", a)}>{a}㎡</button>)}</div>
          <p className="lbl">관심 지역 (최대 3곳)</p>
          <div className="chips">{DONGS.map((d) => {
            const on = f.interest_dongs.includes(d); const dis = !on && f.interest_dongs.length >= 3;
            return <button key={d} disabled={dis} className={`chip ${on ? "on" : ""}`} style={{ opacity: dis ? 0.4 : 1 }} onClick={() => up("interest_dongs", tog(f.interest_dongs, d).slice(0, 3))}>{on ? "✓ " : ""}{d}</button>;
          })}</div>
          <div className="nav2"><button className="ghost2" onClick={() => setStep(2)}>← 이전</button><button className="prim" disabled={saving} onClick={complete}>{saving ? "저장 중..." : "시작하기 ✓"}</button></div>
        </div>
      )}

      <style jsx>{`
        .ob { max-width: 480px; margin: 0 auto; min-height: 100vh; background: #f7f9fc; font-family: -apple-system, sans-serif; color: #111827; }
        .prog { display: flex; align-items: center; gap: 6px; padding: 16px; }
        .bar { flex: 1; height: 4px; border-radius: 4px; } .pct { font-size: 0.72rem; color: #9ca3af; margin-left: 6px; }
        .pad { padding: 0 16px; }
        h2 { font-size: 1.15rem; font-weight: 800; margin: 8px 0 2px; } .sub { font-size: 0.85rem; color: #6b7280; margin: 0 0 20px; }
        .lbl { font-size: 0.8rem; font-weight: 600; color: #6b7280; margin: 18px 0 8px; }
        .ipt { width: 100%; padding: 12px 14px; border: 1px solid #e5e7eb; border-radius: 12px; font-size: 0.9rem; box-sizing: border-box; }
        .chips { display: flex; flex-wrap: wrap; gap: 8px; }
        .chip { padding: 7px 13px; border-radius: 18px; border: 1px solid #e5e7eb; background: #fff; font-size: 0.82rem; font-weight: 500; }
        .chip.on { background: #2563eb; color: #fff; border-color: #2563eb; }
        .opts { display: flex; flex-direction: column; gap: 10px; margin-bottom: 8px; }
        .opt { display: flex; align-items: center; gap: 12px; padding: 15px; border: 1px solid #e5e7eb; border-radius: 12px; background: #fff; font-size: 0.88rem; text-align: left; }
        .opt.on { border: 2px solid #2563eb; background: #eff6ff; color: #2563eb; }
        .opt-ic { font-size: 1.3rem; } .ck { margin-left: auto; color: #2563eb; }
        .slider { display: flex; align-items: center; gap: 12px; } .slider input { flex: 1; } .slider b { color: #2563eb; width: 50px; text-align: right; }
        .prim { width: 100%; padding: 13px; border: none; border-radius: 12px; background: #2563eb; color: #fff; font-weight: 700; margin-top: 24px; }
        .ghost { width: 100%; padding: 10px; border: none; background: none; color: #9ca3af; font-size: 0.85rem; margin-top: 12px; }
        .nav2 { display: flex; gap: 10px; margin-top: 24px; margin-bottom: 30px; }
        .ghost2 { flex: 1; padding: 13px; border: 1px solid #e5e7eb; border-radius: 12px; background: #fff; color: #6b7280; font-weight: 600; }
        .nav2 .prim { flex: 1; margin-top: 0; }
      `}</style>
      <style jsx global>{`body { background: #f7f9fc; margin: 0; }`}</style>
    </div>
  );
}
