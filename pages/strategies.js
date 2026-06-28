import Head from "next/head";
import { useState } from "react";
import { APP_VERSION, LAST_UPDATED } from '../lib/version';

const strategies = [
  {
    id: "ml_signal", name: "ML 예측기", icon: "🤖", status: "ACTIVE", weight: 35,
    desc: "머신러닝 모델이 종목별 매수/매도 확률을 예측합니다. 과거 패턴 학습 기반.",
    stats: [{ label: "가중치", value: "35%" }, { label: "유형", value: "ML" }, { label: "상태", value: "ACTIVE" }],
    rules: ["확률 > 0.65 → 매수 신호", "확률 < 0.35 → 매도 신호", "0.35~0.65 → 관망"],
  },
  {
    id: "final_score", name: "Final Score", icon: "📊", status: "ACTIVE", weight: 30,
    desc: "RSI, MACD, 볼린저밴드 기반 종합 점수. 0~100 스케일.",
    stats: [{ label: "가중치", value: "30%" }, { label: "유형", value: "기술지표" }, { label: "상태", value: "ACTIVE" }],
    rules: ["Score ≥ 70 → 매수 후보", "Score 50~69 → 중립 후보", "Score < 50 → 차단"],
  },
  {
    id: "risk_mgmt", name: "리스크 관리", icon: "🛡️", status: "ACTIVE", weight: 20,
    desc: "손절/익절 자동 실행 및 종목별 최대 비중 제한으로 전체 손실을 방지합니다.",
    stats: [{ label: "가중치", value: "20%" }, { label: "유형", value: "리스크" }, { label: "상태", value: "ACTIVE" }],
    rules: ["손절 기준: -5%", "1종목 최대 비중: 30%", "장외 시간 API 전면 차단"],
  },
  {
    id: "macro_filter", name: "거시경제 필터", icon: "🌐", status: "ACTIVE", weight: 15,
    desc: "VIX, Fear&Greed, 나스닥 지수로 시장 환경을 판단합니다. BEAR 환경에서는 전체 매수를 차단합니다.",
    stats: [{ label: "가중치", value: "15%" }, { label: "유형", value: "매크로" }, { label: "상태", value: "ACTIVE" }],
    rules: ["BEAR MARKET → 전체 매수 전면 차단", "VIX 급등 → 매수 점수 기준 자동 상향", "거시경제 점수 낮으면 해당 종목 BLOCKED 처리"],
  },
];

const colorMap = { ml_signal: "#2563eb", final_score: "#16a34a", risk_mgmt: "#d97706", macro_filter: "#7c3aed" };

export default function StrategiesPage() {
  const [open, setOpen] = useState({});
  const toggle = (id) => setOpen(prev => ({ ...prev, [id]: !prev[id] }));

  return (
    <>
      <Head>
        <title>Strategies | ONE-HUB</title>
        <meta name="description" content="ONE-HUB 전략 라이브러리. ML 예측기, Final Score 등 AI 매매 전략의 구성과 가중치를 공개합니다." />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css" rel="stylesheet" />
      </Head>
      <div style={{ minHeight: "100vh", background: "#f8fafc", color: "#1e293b", fontFamily: "Pretendard, sans-serif", padding: "0 0 80px" }}>
        <main style={{ maxWidth: "720px", margin: "0 auto", padding: "40px 20px" }}>
          <h1 style={{ fontSize: "22px", fontWeight: 800, marginBottom: 6 }}>전략 라이브러리</h1>
          <p style={{ fontSize: "13px", color: "#64748b", marginBottom: 28 }}>ONE-HUB 자동매매 전략 구성 및 가중치</p>

          {/* 가중치 바 */}
          <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 20, padding: "20px 24px", marginBottom: 24, boxShadow: '0 2px 16px rgba(0,0,0,0.07)' }}>
            <div style={{ fontSize: "11px", color: "#94a3b8", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>전략 가중치 분포</div>
            <div style={{ display: "flex", height: 8, borderRadius: 4, overflow: "hidden", gap: 2 }}>
              {strategies.map(s => (
                <div key={s.id} style={{ width: `${s.weight}%`, background: colorMap[s.id], borderRadius: 2 }} />
              ))}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "12px 20px", marginTop: 10 }}>
              {strategies.map(s => (
                <span key={s.id} style={{ fontSize: "11px", color: "#64748b", display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: colorMap[s.id], display: "inline-block" }} />
                  {s.icon} {s.name} {s.weight}%
                </span>
              ))}
            </div>
          </div>

          {/* 전략 카드 — Accordion */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {strategies.map(s => {
              const isOpen = !!open[s.id];
              return (
                <div key={s.id} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 20, overflow: "hidden", boxShadow: '0 2px 16px rgba(0,0,0,0.07)' }}>
                  {/* 헤더 클릭 → 펼침 */}
                  <button
                    onClick={() => toggle(s.id)}
                    style={{
                      width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "18px 20px", background: "none", border: "none", cursor: "pointer",
                      fontFamily: "Pretendard, sans-serif", textAlign: "left",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <span style={{ fontSize: 22 }}>{s.icon}</span>
                      <div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: "#1e293b" }}>{s.name}</div>
                        <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2, fontFamily: "monospace" }}>WEIGHT {s.weight}%</div>
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      {/* 수치 뱃지 */}
                      <span style={{ fontSize: 12, fontWeight: 700, padding: "3px 10px", borderRadius: 8, background: `${colorMap[s.id]}15`, color: colorMap[s.id] }}>{s.weight}%</span>
                      <span style={{ fontSize: 11, color: "#64748b" }}>ACTIVE · {LAST_UPDATED}</span>
                      <span style={{ color: "#94a3b8", fontSize: 14, transform: isOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>▼</span>
                    </div>
                  </button>

                  {/* 펼쳐질 상세 */}
                  {isOpen && (
                    <div style={{ padding: "0 20px 20px", borderTop: "1px solid #f1f5f9" }}>
                      <p style={{ fontSize: 13, color: "#64748b", lineHeight: 1.65, margin: "14px 0 16px" }}>{s.desc}</p>
                      {/* 수치 그리드 */}
                      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                        {s.stats.map(st => (
                          <div key={st.label} style={{ flex: 1, background: "#f8fafc", borderRadius: 10, padding: "10px 12px", textAlign: "center" }}>
                            <div style={{ fontSize: 10, color: "#94a3b8", marginBottom: 4 }}>{st.label}</div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: "#1e293b" }}>{st.value}</div>
                          </div>
                        ))}
                      </div>
                      {/* 규칙 목록 */}
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {s.rules.map((rule, i) => (
                          <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                            <span style={{ fontSize: 11, color: colorMap[s.id], fontWeight: 700, marginTop: 1, flexShrink: 0 }}>→</span>
                            <span style={{ fontSize: 13, color: "#475569", lineHeight: 1.5 }}>{rule}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </main>
      </div>
    </>
  );
}
