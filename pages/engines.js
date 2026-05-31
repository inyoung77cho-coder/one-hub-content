import Head from "next/head";
import Link from "next/link";
import { useEffect, useState } from "react";

export default function EnginesPage() {
  const [engineData, setEngineData] = useState(null);

  useEffect(() => {
    fetch("/api/engine-status").then(r => r.json()).then(setEngineData).catch(() => {});
  }, []);

  const isOn = engineData?.engine?.is_active;
  const statusColor = (s) => s === "RUNNING" ? "#00d084" : s === "STOPPED" ? "#ff4757" : "#ffd700";
  const statusBg = (s) => s === "RUNNING" ? "#003d26" : s === "STOPPED" ? "#3d0010" : "#3d3200";

  const engines = [
    { id: "auto_trade", name: "Auto Trade Engine", desc: "KIS API 연동 자동매매 — ML 시그널 + 기술적 지표 기반 매수/매도 실행", status: isOn ? "RUNNING" : "STOPPED", version: engineData?.version || "v8.0", live: true, icon: "⚡", link: "/engine" },
    { id: "macro", name: "Macro Engine", desc: "글로벌 매크로 지표(Fear&Greed, VIX, 금리) 수집 및 시장 국면 판단", status: "BUILDING", version: "v0.1", live: false, icon: "🌐", link: null },
    { id: "news", name: "News Engine", desc: "RSS 피드 + AI 분류로 테마별 뉴스 수집 및 포트폴리오 영향도 분석", status: "BUILDING", version: "v0.1", live: false, icon: "📰", link: null },
    { id: "report", name: "Report Engine", desc: "매일 15:30 KST — Claude AI Insight 생성 → GitHub push → Vercel 자동 배포", status: "RUNNING", version: "v1.0", live: true, icon: "📊", link: "/daily" },
  ];

  return (
    <>
      <Head><title>Engines — ONE-HUB</title></Head>
      <div style={{ minHeight: "100vh", background: "#0a0c10", color: "#e8edf5", fontFamily: "'Noto Sans KR', sans-serif", padding: "0 0 80px" }}>
        <main style={{ maxWidth: "900px", margin: "0 auto", padding: "40px 24px" }}>
          <h1 style={{ fontFamily: "monospace", fontSize: "13px", letterSpacing: "0.2em", color: "#4a5568", textTransform: "uppercase", marginBottom: "8px" }}>AI Engine Hub</h1>
          <p style={{ fontSize: "13px", color: "#8a9ab5", marginBottom: "36px" }}>ONE-HUB를 구성하는 AI 엔진 현황</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
            {engines.map(eng => (
              <div key={eng.id} style={{ background: "#0f1218", border: "1px solid #1e2530", borderRadius: "12px", padding: "24px", opacity: eng.live ? 1 : 0.6 }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "14px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <span style={{ fontSize: "24px" }}>{eng.icon}</span>
                    <div>
                      <div style={{ fontFamily: "monospace", fontSize: "12px", fontWeight: 700, color: "#e8edf5", marginBottom: "2px" }}>{eng.name}</div>
                      <div style={{ fontFamily: "monospace", fontSize: "10px", color: "#4a5568" }}>{eng.version}</div>
                    </div>
                  </div>
                  <span style={{ fontFamily: "monospace", fontSize: "10px", fontWeight: 700, padding: "3px 8px", borderRadius: "4px", background: statusBg(eng.status), color: statusColor(eng.status) }}>{eng.status}</span>
                </div>
                <p style={{ fontSize: "12px", color: "#8a9ab5", lineHeight: 1.6, margin: "0 0 16px" }}>{eng.desc}</p>
                {eng.link
                  ? <Link href={eng.link} style={{ fontFamily: "monospace", fontSize: "11px", color: "#00d084", textDecoration: "none" }}>자세히 보기 →</Link>
                  : <span style={{ fontFamily: "monospace", fontSize: "11px", color: "#4a5568" }}>개발 중</span>}
              </div>
            ))}
          </div>
          {engineData && (
            <div style={{ marginTop: "32px", background: "#0f1218", border: "1px solid #1e2530", borderRadius: "12px", padding: "24px" }}>
              <div style={{ fontFamily: "monospace", fontSize: "11px", letterSpacing: "0.15em", color: "#4a5568", textTransform: "uppercase", marginBottom: "16px" }}>Auto Trade — 실시간 상세</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px" }}>
                {[["프로세스 수", `${engineData.engine?.process_count ?? 0}개`], ["PID", engineData.engine?.pids?.join(", ") || "-"], ["보유 종목", `${engineData.holdings?.length ?? 0}종목`]].map(([label, value]) => (
                  <div key={label} style={{ background: "#151a22", border: "1px solid #1e2530", borderRadius: "8px", padding: "12px" }}>
                    <div style={{ fontFamily: "monospace", fontSize: "9px", color: "#4a5568", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "6px" }}>{label}</div>
                    <div style={{ fontFamily: "monospace", fontSize: "14px", fontWeight: 700, color: "#e8edf5" }}>{value}</div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: "12px", textAlign: "right" }}>
                <Link href="/engine" style={{ fontFamily: "monospace", fontSize: "11px", color: "#00d084", textDecoration: "none" }}>Engine Hub 전체 보기 →</Link>
              </div>
            </div>
          )}
        </main>
      </div>
    </>
  );
}
