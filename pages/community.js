import Head from "next/head";
import { useState } from "react";

const channels = [
  { icon: "✈️", name: "텔레그램 알림 봇", handle: "@onehub_jiy_bot", desc: "매매 신호, 일일 리포트, 엔진 상태 알림을 실시간으로 수신", status: "LIVE", action: "채널 참여", link: "https://t.me/onehub_jiy_bot" },
  { icon: "📧", name: "뉴스레터", handle: "Weekly Digest", desc: "매주 금요일 — 주간 운영 성과 + AI 인사이트 요약 이메일 발송", status: "LIVE", action: "구독하기", link: null, newsletter: true },
  { icon: "💬", name: "카카오 알림", handle: "KakaoTalk", desc: "중요 매매 신호 및 리스크 경고를 카카오톡으로 수신", status: "BUILDING", action: "준비 중", link: null },
];

const principles = [
  { icon: "📉", title: "실패 공개 필수", desc: "손절 이유와 판단 오류를 솔직하게 공유합니다." },
  { icon: "🚫", title: "수익률 숫자 공개 금지", desc: "방향성(▲▼➖)만 공개. 과도한 기대 조성 방지." },
  { icon: "🤝", title: "AI + 사람의 협업", desc: "AI 판단 근거와 사람의 최종 결정 과정을 콘텐츠화." },
  { icon: "📖", title: "학습 중심 커뮤니티", desc: "단기 수익보다 장기적 투자 사고방식을 공유." },
];

function NewsletterForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("idle"); // idle | loading | success | error

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email) return;
    setStatus("loading");
    try {
      const res = await fetch(
        `https://api.beehiiv.com/v2/publications/pub_28ffafd3-bba3-4810-86f8-a742eea7a8e0/subscriptions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, reactivate_existing: false, send_welcome_email: true }),
        }
      );
      if (res.ok) {
        setStatus("success");
        setEmail("");
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ marginTop: "12px" }}>
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="이메일 입력"
          disabled={status === "loading" || status === "success"}
          style={{
            flex: 1, minWidth: "160px",
            background: "#F0EDE8", border: "1px solid #D0CCC4",
            borderRadius: "6px", padding: "8px 12px",
            fontFamily: "monospace", fontSize: "11px", color: "#1A1A1A",
            outline: "none",
          }}
        />
        <button
          type="submit"
          disabled={status === "loading" || status === "success"}
          style={{
            background: status === "success" ? "#E8F8EF" : "#00AA55",
            color: status === "success" ? "#00AA55" : "#F8F7F2",
            border: "none", borderRadius: "6px",
            padding: "8px 16px", fontFamily: "monospace",
            fontSize: "11px", fontWeight: 700, cursor: "pointer",
            flexShrink: 0,
          }}
        >
          {status === "loading" ? "..." : status === "success" ? "✅ 구독완료" : "구독"}
        </button>
      </div>
      {status === "error" && (
        <p style={{ fontFamily: "monospace", fontSize: "10px", color: "#DD3333", marginTop: "6px" }}>
          오류가 발생했습니다. 다시 시도해 주세요.
        </p>
      )}
    </form>
  );
}

export default function CommunityPage() {
  return (
    <>
      <Head>

        <title>Community — ONE-HUB</title>

        <meta name="description" content="ONE-HUB 커뮤니티. 텔레그램 알림 봇과 뉴스레터로 AI 자동매매 운영 현황을 실시간으로 받아보세요." />

        <meta name="viewport" content="width=device-width, initial-scale=1" />

        <meta property="og:title" content="Community — ONE-HUB" />

        <meta property="og:description" content="ONE-HUB 커뮤니티. 텔레그램 알림 봇과 뉴스레터로 AI 자동매매 운영 현황을 실시간으로 받아보세요." />

        <meta property="og:url" content="https://one-hub-content.vercel.app/community" />

        <meta property="og:type" content="website" />

        <meta property="og:site_name" content="ONE-HUB" />

        <meta name="twitter:card" content="summary" />

        <meta name="twitter:title" content="Community — ONE-HUB" />

        <meta name="twitter:description" content="ONE-HUB 커뮤니티. 텔레그램 알림 봇과 뉴스레터로 AI 자동매매 운영 현황을 실시간으로 받아보세요." />

      </Head>
      <div style={{ minHeight: "100vh", background: "#F8F7F2", color: "#1A1A1A", fontFamily: "'Noto Sans KR', sans-serif", padding: "0 0 80px" }}>
        <main style={{ maxWidth: "860px", margin: "0 auto", padding: "40px 24px" }}>
          <h1 style={{ fontFamily: "monospace", fontSize: "13px", letterSpacing: "0.2em", color: "#9A9690", textTransform: "uppercase", marginBottom: "8px" }}>Community</h1>
          <p style={{ fontSize: "13px", color: "#6A6660", marginBottom: "36px" }}>AI 자동매매 여정을 함께하는 채널</p>

          {/* 채널 카드 */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "14px", marginBottom: "40px" }}>
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
                  {ch.newsletter ? (
                    <NewsletterForm />
                  ) : ch.link ? (
                    <a href={ch.link} target="_blank" rel="noopener noreferrer" style={{ display: "block", fontFamily: "monospace", fontSize: "11px", color: "#00AA55", textDecoration: "none" }}>
                      {ch.action} →
                    </a>
                  ) : (
                    <span style={{ fontFamily: "monospace", fontSize: "11px", color: "#9A9690" }}>{ch.action}</span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* 커뮤니티 원칙 */}
          <div style={{ background: "#FFFFFF", border: "1px solid #E0DDD4", borderRadius: "12px", padding: "28px 24px" }}>
            <div style={{ fontFamily: "monospace", fontSize: "10px", color: "#9A9690", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "20px" }}>커뮤니티 원칙</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
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
