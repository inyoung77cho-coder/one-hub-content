import Head from "next/head";

const channels = [
  { icon: "✈️", name: "텔레그램 알림 봇", handle: "@onehub_jiy_bot", desc: "매매 신호, 일일 리포트, 엔진 상태 알림을 실시간으로 수신", status: "LIVE", action: "채널 참여", link: "https://t.me/onehub_jiy_bot" },
  { icon: "📧", name: "뉴스레터", handle: "Weekly Digest", desc: "매주 금요일 — 주간 운영 성과 + AI 인사이트 요약 이메일 발송", status: "BUILDING", action: "준비 중", link: null },
  { icon: "💬", name: "카카오 알림", handle: "KakaoTalk", desc: "중요 매매 신호 및 리스크 경고를 카카오톡으로 수신", status: "BUILDING", action: "준비 중", link: null },
];

const principles = [
  { icon: "📉", title: "실패 공개 필수", desc: "손절 이유와 판단 오류를 솔직하게 공유합니다." },
  { icon: "🚫", title: "수익률 숫자 공개 금지", desc: "방향성(▲▼➖)만 공개. 과도한 기대 조성 방지." },
  { icon: "🤝", title: "AI + 사람의 협업", desc: "AI 판단 근거와 사람의 최종 결정 과정을 콘텐츠화." },
  { icon: "📖", title: "학습 중심 커뮤니티", desc: "단기 수익보다 장기적 투자 사고방식을 공유." },
];

export default function CommunityPage() {
  return (
    <>
      <Head><title>Community — ONE-HUB</title></Head>
      <div style={{ minHeight: "100vh", background: "#0a0c10", color: "#e8edf5", fontFamily: "'Noto Sans KR', sans-serif", padding: "0 0 80px" }}>
        <main style={{ maxWidth: "860px", margin: "0 auto", padding: "40px 24px" }}>
          <h1 style={{ fontFamily: "monospace", fontSize: "13px", letterSpacing: "0.2em", color: "#4a5568", textTransform: "uppercase", marginBottom: "8px" }}>Community</h1>
          <p style={{ fontSize: "13px", color: "#8a9ab5", marginBottom: "36px" }}>AI 자동매매 여정을 함께하는 채널</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "14px", marginBottom: "40px" }}>
            {channels.map(ch => (
              <div key={ch.name} style={{ background: "#0f1218", border: "1px solid #1e2530", borderRadius: "12px", padding: "22px 20px", opacity: ch.status === "LIVE" ? 1 : 0.6, display: "flex", flexDirection: "column", gap: "12px" }}>
                <div style={{ fontSize: "28px" }}>{ch.icon}</div>
                <div>
                  <div style={{ fontFamily: "monospace", fontSize: "12px", fontWeight: 700, color: "#e8edf5", marginBottom: "3px" }}>{ch.name}</div>
                  <div style={{ fontFamily: "monospace", fontSize: "10px", color: "#4a5568" }}>{ch.handle}</div>
                </div>
                <p style={{ fontSize: "12px", color: "#8a9ab5", lineHeight: 1.6, margin: 0, flex: 1 }}>{ch.desc}</p>
                <div>
                  <span style={{ display: "inline-block", fontFamily: "monospace", fontSize: "10px", fontWeight: 700, padding: "3px 8px", borderRadius: "4px", background: ch.status === "LIVE" ? "#003d26" : "#3d3200", color: ch.status === "LIVE" ? "#00d084" : "#ffd700", marginBottom: "10px" }}>{ch.status}</span>
                  {ch.link
                    ? <a href={ch.link} target="_blank" rel="noopener noreferrer" style={{ display: "block", fontFamily: "monospace", fontSize: "11px", color: "#00d084", textDecoration: "none" }}>{ch.action} →</a>
                    : <span style={{ fontFamily: "monospace", fontSize: "11px", color: "#4a5568" }}>{ch.action}</span>}
                </div>
              </div>
            ))}
          </div>
          <div style={{ background: "#0f1218", border: "1px solid #1e2530", borderRadius: "12px", padding: "28px 24px" }}>
            <div style={{ fontFamily: "monospace", fontSize: "10px", color: "#4a5568", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "20px" }}>커뮤니티 원칙</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
              {principles.map(p => (
                <div key={p.title} style={{ display: "flex", gap: "14px", alignItems: "flex-start" }}>
                  <span style={{ fontSize: "20px", flexShrink: 0 }}>{p.icon}</span>
                  <div>
                    <div style={{ fontFamily: "monospace", fontSize: "12px", fontWeight: 700, color: "#e8edf5", marginBottom: "4px" }}>{p.title}</div>
                    <div style={{ fontSize: "12px", color: "#8a9ab5", lineHeight: 1.5 }}>{p.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </main>
      </div>
    </>
  );
}
