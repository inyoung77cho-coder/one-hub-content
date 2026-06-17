import Head from "next/head";
import { useState, useEffect } from "react";

const channels = [
  { icon: "✈️", name: "텔레그램 알림 봇", handle: "@onehub_jiy_bot", desc: "매매 신호, 일일 리포트, 서버 상태 알림을 실시간으로 수신", status: "LIVE", action: "채널 참여", link: "https://t.me/onehub_jiy_bot" },
  { icon: "📧", name: "뉴스레터", handle: "Weekly Digest", desc: "매주 핵심 투자 결정 블로그 요약 + AI 인사이트 받아보기", status: "LIVE", action: "구독하기", link: null, newsletter: true },
  { icon: "💬", name: "카카오톡 알림", handle: "KakaoTalk", desc: "중요 매매 신호 및 리스크 경고를 카카오톡으로 수신", status: "BUILDING", action: "준비 중", link: null },
];

const principles = [
  { icon: "📝", title: "실패 기록 공개", desc: "잘못된 판단과 결정 과정을 솔직하게 공유합니다." },
  { icon: "🎯", title: "실패를 공개 기록", desc: "잘못된 판단을 공개합니다. 완벽함보다 솔직함을 추구합니다." },
  { icon: "🤝", title: "AI + 인간의 협업", desc: "AI 결정 다음의 인간적 최종 결정 과정을 콘텐츠화합니다." },
  { icon: "📈", title: "지속적 개선 기록 공개", desc: "어떤 실패보다 더 빠르게 배우고 성장하는 것이 목표입니다." },
];

function NewsletterForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("idle");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email) return;
    setStatus("loading");
    try {
      const res = await fetch(
        "https://api.beehiiv.com/v2/publications/pub_28ffafd3-bba3-4810-86f8-a742eea7a8e0/subscriptions",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, reactivate_existing: false, send_welcome_email: true }),
        }
      );
      if (res.ok) { setStatus("success"); setEmail(""); }
      else setStatus("error");
    } catch { setStatus("error"); }
  };

  return (
    <form onSubmit={handleSubmit} style={{ marginTop: "12px" }}>
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        <input
          type="email" value={email} onChange={e => setEmail(e.target.value)}
          placeholder="이메일 입력"
          disabled={status === "loading" || status === "success"}
          style={{ flex: 1, minWidth: "140px", background: "#F0EDE8", border: "1px solid #D0CCC4", borderRadius: "6px", padding: "8px 12px", fontFamily: "monospace", fontSize: "11px", color: "#1A1A1A", outline: "none" }}
        />
        <button type="submit" disabled={status === "loading" || status === "success"}
          style={{ background: status === "success" ? "#E8F8EF" : "#00AA55", color: status === "success" ? "#00AA55" : "#F8F7F2", border: "none", borderRadius: "6px", padding: "8px 16px", fontFamily: "monospace", fontSize: "11px", fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>
          {status === "loading" ? "..." : status === "success" ? "✓ 구독완료" : "구독"}
        </button>
      </div>
      {status === "error" && <p style={{ fontFamily: "monospace", fontSize: "10px", color: "#DD3333", marginTop: "6px" }}>오류가 발생했습니다. 다시 시도해주세요.</p>}
    </form>
  );
}

export default function CommunityPage() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  return (
    <>
      <Head>
        <title>Community | ONE-HUB</title>
        <meta name="description" content="ONE-HUB 커뮤니티. 텔레그램 알림 봇과 뉴스레터로 AI 자동매매 개발 현황을 실시간으로 팔로우하세요." />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta property="og:title" content="Community | ONE-HUB" />
        <meta property="og:description" content="ONE-HUB 커뮤니티. 텔레그램 알림 봇과 뉴스레터로 AI 자동매매 개발 현황을 실시간으로 팔로우하세요." />
        <meta property="og:url" content="https://one-hub-content.vercel.app/community" />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="ONE-HUB" />
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content="Community | ONE-HUB" />
        <meta name="twitter:description" content="ONE-HUB 커뮤니티. 텔레그램 알림 봇과 뉴스레터로 AI 자동매매 개발 현황을 실시간으로 팔로우하세요." />
      </Head>
      <div style={{ minHeight: "100vh", background: "#F8F7F2", color: "#1A1A1A", fontFamily: "'Noto Sans KR', sans-serif", padding: "0 0 80px" }}>
        <main style={{ maxWidth: "860px", margin: "0 auto", padding: isMobile ? "24px 16px" : "40px 24px" }}>
          <h1 style={{ fontFamily: "monospace", fontSize: "13px", letterSpacing: "0.2em", color: "#9A9690", textTransform: "uppercase", marginBottom: "8px" }}>Community</h1>
          <p style={{ fontSize: "13px", color: "#6A6660", marginBottom: "36px" }}>AI 자동매매 여정을 함께하는 채널</p>

          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: "14px", marginBottom: "40px" }}>
            {channels.map(ch => (
              <div key={ch.name} style={{ background: "#FFFFFF", border: "1px solid #E0DDD4", borderRadius: "12px", padding: "22px 20px", opacity: ch.status === "BUILDING" ? 0.6 : 1, display: "flex", flexDirection: "column", gap: "12px" }}>
                <div style={{ fontSize: "28px" }}>{ch.icon}</div>
                <div>
                  <div style={{ fontFamily: "monospace", fontSize: "12px", fontWeight: 700, color: "#1A1A1A", marginBottom: "3px" }}>{ch.name}</div>
                  <div style={{ fontFamily: "monospace", fontSize: "10px", color: "#9A9690" }}>{ch.handle}</div>
                </div>
                <p style={{ fontSize: "12px", color: "#6A6660", lineHeight: 1.6, margin: 0, flex: 1 }}>{ch.desc}</p>
                <div>
                  <span style={{ display: "inline-block", fontFamily: "monospace", fontSize: "10px", fontWeight: 700, padding: "3px 8px", borderRadius: "4px", background: ch.status === "LIVE" ? "#E8F8EF" : "#FFF8E6", color: ch.status === "LIVE" ? "#00AA55" : "#CC8800", marginBottom: "10px" }}>
                    {ch.status}
                  </span>
                  {ch.newsletter ? <NewsletterForm /> : ch.link ? (
                    <a href={ch.link} target="_blank" rel="noopener noreferrer" style={{ display: "block", fontFamily: "monospace", fontSize: "11px", color: "#00AA55", textDecoration: "none" }}>{ch.action} →</a>
                  ) : (
                    <span style={{ fontFamily: "monospace", fontSize: "11px", color: "#9A9690" }}>{ch.action}</span>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div style={{ background: "#FFFFFF", border: "1px solid #E0DDD4", borderRadius: "12px", padding: "28px 24px" }}>
            <div style={{ fontFamily: "monospace", fontSize: "10px", color: "#9A9690", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "20px" }}>커뮤니티 원칙</div>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "16px" }}>
              {principles.map(p => (
                <div key={p.title} style={{ display: "flex", gap: "14px", alignItems: "flex-start" }}>
                  <span style={{ fontSize: "20px", flexShrink: 0 }}>{p.icon}</span>
                  <div>
                    <div style={{ fontFamily: "monospace", fontSize: "12px", fontWeight: 700, color: "#1A1A1A", marginBottom: "4px" }}>{p.title}</div>
                    <div style={{ fontSize: "12px", color: "#6A6660", lineHeight: 1.5 }}>{p.desc}</div>
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