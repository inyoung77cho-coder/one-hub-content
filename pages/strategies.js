import Head from "next/head";

const strategies = [
  { id: "ml_signal", name: "ML 시그널", icon: "🤖", status: "ACTIVE", weight: 40, desc: "머신러닝 모델이 종목별 매수/매도 확률을 스코어링. 과거 패턴 학습 기반.", rules: ["확률 > 0.65 → 매수 후보", "확률 < 0.35 → 매도 후보", "0.35~0.65 → 관망"] },
  { id: "final_score", name: "Final Score", icon: "📊", status: "ACTIVE", weight: 35, desc: "RSI, MACD, 볼린저밴드 통합 기술적 점수. 0~100 스케일.", rules: ["Score ≥ 70 → 강매수", "Score 50~69 → 약매수", "Score < 50 → 차단"] },
  { id: "risk_mgmt", name: "리스크 관리", icon: "🛡️", status: "ACTIVE", weight: 25, desc: "손절/익절 자동 실행 및 종목별 비중 제한으로 최대 손실 통제.", rules: ["손절 기준: -5%", "1종목 최대 비중: 30%", "장 외 시간 API 완전 차단"] },
  { id: "macro_filter", name: "매크로 필터", icon: "🌐", status: "BUILDING", weight: 0, desc: "VIX, Fear&Greed, 금리 데이터로 시장 국면 판단 후 전체 매매 강도 조절.", rules: ["VIX > 30 → 전체 차단", "Fear < 20 → 비중 50% 축소", "금리 급등 → 성장주 차단"] },
];

export default function StrategiesPage() {
  const statusColor = (s) => s === "ACTIVE" ? "#00d084" : "#ffd700";
  const statusBg = (s) => s === "ACTIVE" ? "#003d26" : "#3d3200";

  return (
    <>
      <Head>

        <title>Strategies — ONE-HUB</title>

        <meta name="description" content="ONE-HUB 전략 라이브러리. ML 시그널, Final Score 등 AI 매매 전략의 규칙과 가중치를 공개합니다." />

        <meta name="viewport" content="width=device-width, initial-scale=1" />

        <meta property="og:title" content="Strategies — ONE-HUB" />

        <meta property="og:description" content="ONE-HUB 전략 라이브러리. ML 시그널, Final Score 등 AI 매매 전략의 규칙과 가중치를 공개합니다." />

        <meta property="og:url" content="https://one-hub-content.vercel.app/strategies" />

        <meta property="og:type" content="website" />

        <meta property="og:site_name" content="ONE-HUB" />

        <meta name="twitter:card" content="summary" />

        <meta name="twitter:title" content="Strategies — ONE-HUB" />

        <meta name="twitter:description" content="ONE-HUB 전략 라이브러리. ML 시그널, Final Score 등 AI 매매 전략의 규칙과 가중치를 공개합니다." />

      </Head>
      <div style={{ minHeight: "100vh", background: "#0a0c10", color: "#e8edf5", fontFamily: "'Noto Sans KR', sans-serif", padding: "0 0 80px" }}>
        <main style={{ maxWidth: "900px", margin: "0 auto", padding: "40px 24px" }}>
          <h1 style={{ fontFamily: "monospace", fontSize: "13px", letterSpacing: "0.2em", color: "#4a5568", textTransform: "uppercase", marginBottom: "8px" }}>Strategy Library</h1>
          <p style={{ fontSize: "13px", color: "#8a9ab5", marginBottom: "36px" }}>ONE-HUB 자동매매 전략 구성 및 가중치</p>
          <div style={{ background: "#0f1218", border: "1px solid #1e2530", borderRadius: "12px", padding: "20px 24px", marginBottom: "24px" }}>
            <div style={{ fontFamily: "monospace", fontSize: "10px", color: "#4a5568", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "14px" }}>전략 가중치 분포</div>
            <div style={{ display: "flex", height: "8px", borderRadius: "4px", overflow: "hidden", gap: "2px" }}>
              {strategies.filter(s => s.weight > 0).map(s => (
                <div key={s.id} style={{ width: `${s.weight}%`, background: s.id === "ml_signal" ? "#00d084" : s.id === "final_score" ? "#4fa3e0" : "#ffd700", borderRadius: "2px" }} />
              ))}
            </div>
            <div style={{ display: "flex", gap: "20px", marginTop: "10px" }}>
              {strategies.filter(s => s.weight > 0).map(s => (
                <span key={s.id} style={{ fontFamily: "monospace", fontSize: "10px", color: "#8a9ab5" }}>{s.icon} {s.weight}%</span>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            {strategies.map(s => (
              <div key={s.id} style={{ background: "#0f1218", border: "1px solid #1e2530", borderRadius: "12px", padding: "22px 24px", opacity: s.status === "ACTIVE" ? 1 : 0.6 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <span style={{ fontSize: "22px" }}>{s.icon}</span>
                    <div>
                      <div style={{ fontFamily: "monospace", fontSize: "13px", fontWeight: 700, color: "#e8edf5" }}>{s.name}</div>
                      <div style={{ fontFamily: "monospace", fontSize: "10px", color: "#4a5568", marginTop: "2px" }}>WEIGHT {s.weight}%</div>
                    </div>
                  </div>
                  <span style={{ fontFamily: "monospace", fontSize: "10px", fontWeight: 700, padding: "3px 8px", borderRadius: "4px", background: statusBg(s.status), color: statusColor(s.status) }}>{s.status}</span>
                </div>
                <p style={{ fontSize: "12px", color: "#8a9ab5", lineHeight: 1.6, margin: "0 0 14px" }}>{s.desc}</p>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  {s.rules.map((rule, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ fontFamily: "monospace", fontSize: "10px", color: "#4a5568" }}>›</span>
                      <span style={{ fontFamily: "monospace", fontSize: "11px", color: "#8a9ab5" }}>{rule}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </main>
      </div>
    </>
  );
}
