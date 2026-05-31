import Head from "next/head";
import Link from "next/link";

const values = [
  { icon: "🔍", title: "투명성", desc: "수익뿐 아니라 실패와 손절 이유를 그대로 공개합니다. 방향성(▲▼➖)만 공유하되, 판단 근거는 모두 오픈합니다." },
  { icon: "🤖", title: "AI와 사람의 협업", desc: "AI가 데이터를 읽고, 사람이 맥락을 판단합니다. 두 판단의 결합 과정 자체를 콘텐츠로 만듭니다." },
  { icon: "📚", title: "학습 중심", desc: "단기 수익보다 장기적 사고방식을 키우는 것이 목표입니다. 매일의 실패가 다음 판단을 더 정교하게 만듭니다." },
  { icon: "🛡️", title: "리스크 우선", desc: "수익 극대화보다 손실 최소화가 먼저입니다. 엔진은 항상 '왜 매매하지 않는가'를 먼저 묻습니다." },
];

const timeline = [
  { date: "2026-05", label: "ONE-HUB v8.0", desc: "AWS 마이그레이션 완료, Engine Hub 공개, systemd 단독 관리" },
  { date: "2026-05", label: "콘텐츠 플랫폼 전환", desc: "단순 매매봇 → Daily/Weekly 리포트 자동 발행 파이프라인 구축" },
  { date: "2026-05", label: "자동매매 시작", desc: "KIS API 연동, ML 시그널 + 기술적 지표 기반 실전 운용 시작" },
  { date: "2026-04", label: "ONE-HUB 프로젝트 시작", desc: "AI 자동매매 + 콘텐츠 플랫폼 아이디어 구체화" },
];

export default function AboutPage() {
  return (
    <>
      <Head><title>About — ONE-HUB</title></Head>
      <div style={{ minHeight: "100vh", background: "#0a0c10", color: "#e8edf5", fontFamily: "'Noto Sans KR', sans-serif", padding: "0 0 80px" }}>
        <main style={{ maxWidth: "780px", margin: "0 auto", padding: "40px 24px" }}>
          <div style={{ marginBottom: "48px" }}>
            <div style={{ fontFamily: "monospace", fontSize: "11px", color: "#4a5568", letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: "16px" }}>About ONE-HUB</div>
            <h1 style={{ fontSize: "28px", fontWeight: 700, lineHeight: 1.4, color: "#e8edf5", marginBottom: "16px" }}>
              AI가 시장을 읽고,<br /><span style={{ color: "#00d084" }}>사람이 판단하는</span> 자동매매
            </h1>
            <p style={{ fontSize: "14px", color: "#8a9ab5", lineHeight: 1.8, maxWidth: "580px" }}>
              ONE-HUB는 단순한 자동매매 봇이 아닙니다. AI의 데이터 분석과 사람의 맥락 판단이 결합되는 과정을 기록하고, 그 여정을 투명하게 공유하는 플랫폼입니다.
            </p>
          </div>
          <div style={{ marginBottom: "48px" }}>
            <div style={{ fontFamily: "monospace", fontSize: "10px", color: "#4a5568", letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: "24px" }}>운영 철학</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
              {values.map(v => (
                <div key={v.title} style={{ background: "#0f1218", border: "1px solid #1e2530", borderRadius: "12px", padding: "22px 20px" }}>
                  <div style={{ fontSize: "24px", marginBottom: "12px" }}>{v.icon}</div>
                  <div style={{ fontFamily: "monospace", fontSize: "12px", fontWeight: 700, color: "#e8edf5", marginBottom: "8px" }}>{v.title}</div>
                  <p style={{ fontSize: "12px", color: "#8a9ab5", lineHeight: 1.6, margin: 0 }}>{v.desc}</p>
                </div>
              ))}
            </div>
          </div>
          <div style={{ background: "#0f1218", border: "1px solid #2a3344", borderRadius: "12px", padding: "24px", marginBottom: "48px" }}>
            <div style={{ fontFamily: "monospace", fontSize: "10px", color: "#4a5568", letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: "16px" }}>콘텐츠 원칙</div>
            {[["🚫","수익률(%) 숫자 공개 금지","방향성(▲▼➖)만 공개합니다. 과도한 기대를 조성하지 않습니다."],["📢","실패 공개 필수","손절 이유와 판단 오류를 있는 그대로 기록합니다."],["🔗","AI + 사람 결합 과정 콘텐츠화","AI 판단 근거와 사람의 최종 결정 과정을 매일 공유합니다."]].map(([icon, title, desc]) => (
              <div key={title} style={{ display: "flex", gap: "16px", alignItems: "flex-start", padding: "12px 0", borderBottom: "1px solid #1e2530" }}>
                <span style={{ fontSize: "18px", flexShrink: 0 }}>{icon}</span>
                <div>
                  <div style={{ fontFamily: "monospace", fontSize: "12px", fontWeight: 700, color: "#e8edf5", marginBottom: "3px" }}>{title}</div>
                  <div style={{ fontSize: "12px", color: "#8a9ab5" }}>{desc}</div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ marginBottom: "48px" }}>
            <div style={{ fontFamily: "monospace", fontSize: "10px", color: "#4a5568", letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: "24px" }}>프로젝트 히스토리</div>
            <div style={{ position: "relative", paddingLeft: "24px", borderLeft: "1px solid #1e2530" }}>
              {timeline.map((t, i) => (
                <div key={i} style={{ position: "relative", paddingBottom: "24px" }}>
                  <div style={{ position: "absolute", left: "-29px", top: "4px", width: "10px", height: "10px", borderRadius: "50%", background: i === 0 ? "#00d084" : "#2a3344", border: "2px solid #0a0c10" }} />
                  <div style={{ fontFamily: "monospace", fontSize: "10px", color: "#4a5568", marginBottom: "4px" }}>{t.date}</div>
                  <div style={{ fontFamily: "monospace", fontSize: "12px", fontWeight: 700, color: "#e8edf5", marginBottom: "4px" }}>{t.label}</div>
                  <div style={{ fontSize: "12px", color: "#8a9ab5", lineHeight: 1.5 }}>{t.desc}</div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ background: "#0f1218", border: "1px solid #1e2530", borderRadius: "12px", padding: "24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontFamily: "monospace", fontSize: "10px", color: "#4a5568", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "8px" }}>현재 운용 상태</div>
              <div style={{ fontFamily: "monospace", fontSize: "16px", fontWeight: 700, color: "#00d084" }}>LIVE · auto_trade v8.0</div>
              <div style={{ fontFamily: "monospace", fontSize: "11px", color: "#8a9ab5", marginTop: "4px" }}>AWS Lightsail · 매일 15:30 KST 자동 리포트</div>
            </div>
            <Link href="/engine" style={{ fontFamily: "monospace", fontSize: "11px", color: "#00d084", textDecoration: "none", padding: "10px 16px", border: "1px solid #003d26", borderRadius: "8px" }}>
              엔진 상태 보기 →
            </Link>
          </div>
        </main>
      </div>
    </>
  );
}
