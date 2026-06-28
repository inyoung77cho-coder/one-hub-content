import Head from "next/head";
import { useState, useEffect } from "react";

const channels = [
  { icon: "✈️", name: "텔레그램 알림 봇", handle: "@onehub_jiy_bot", desc: "매매 신호, 일일 리포트, 서버 상태 알림을 실시간으로 수신", status: "LIVE", action: "채널 참여", link: "https://t.me/onehub_jiy_bot" },
  { icon: "📧", name: "뉴스레터", handle: "Weekly Digest", desc: "매주 금요일 — 주간 운영 성과 + AI 인사이트", status: "LIVE", action: "구독하기", link: null, newsletter: true },
  { icon: "💬", name: "카카오톡 알림", handle: "KakaoTalk", desc: "중요 매매 신호 및 리스크 경고를 카카오톡으로 수신", status: "Coming Soon", action: "준비 중", link: null },
  { icon: "▶️", name: "YouTube", handle: "@onehub_invest", desc: "AI 자동매매 운영 영상 및 시장 분석", status: "Coming Soon", action: "준비 중", link: null },
  { icon: "🐙", name: "GitHub", handle: "inyoung77cho-coder", desc: "ONE-HUB 공개 레포 및 개발 현황", status: "LIVE", action: "레포 보기", link: "https://github.com/inyoung77cho-coder" },
  { icon: "📄", name: "Blog", handle: "ONE-HUB Blog", desc: "AI 판단 근거, 운영 회고, 시장 분석 아티클", status: "LIVE", action: "블로그 보기", link: "/blog" },
];

const principles = [
  { icon: "📝", title: "실패 기록 공개", desc: "잘못된 판단과 결정 과정을 솔직하게 공유합니다." },
  { icon: "🤝", title: "AI + 인간의 협업", desc: "AI 결정 다음의 인간적 최종 결정 과정을 콘텐츠화합니다." },
  { icon: "📈", title: "지속적 개선", desc: "어떤 실패보다 더 빠르게 배우고 성장하는 것이 목표입니다." },
  { icon: "🔍", title: "투명한 운영", desc: "매매 신호부터 결과까지 모든 과정을 기록하고 공개합니다." },
];

const STATS = [
  { label: "누적 분석", val: "4,200+", unit: "종목·일" },
  { label: "누적 차단", val: "230+",   unit: "건" },
  { label: "누적 매수", val: "45",     unit: "건" },
  { label: "운영 기간", val: "60일+",  unit: "" },
  { label: "엔진 가동률", val: "99.8", unit: "%" },
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
        <input type="email" value={email} onChange={e => setEmail(e.target.value)}
          placeholder="이메일 입력" disabled={status === "loading" || status === "success"}
          style={{ flex: 1, minWidth: "140px", background: "#F0EDE8", border: "1px solid #D0CCC4", borderRadius: "6px", padding: "8px 12px", fontFamily: "monospace", fontSize: "11px", color: "#1A1A1A", outline: "none" }} />
        <button type="submit" disabled={status === "loading" || status === "success"}
          style={{ background: status === "success" ? "#E8F8EF" : "#00AA55", color: status === "success" ? "#00AA55" : "#F8F7F2", border: "none", borderRadius: "6px", padding: "8px 16px", fontFamily: "monospace", fontSize: "11px", fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>
          {status === "loading" ? "..." : status === "success" ? "✓ 완료" : "구독"}
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
        <meta name="description" content="ONE-HUB 커뮤니티. 텔레그램·뉴스레터·GitHub으로 AI 자동매매 현황을 팔로우하세요." />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta property="og:title" content="Community | ONE-HUB" />
        <meta property="og:description" content="ONE-HUB 커뮤니티. 텔레그램·뉴스레터·GitHub으로 AI 자동매매 현황을 팔로우하세요." />
        <meta property="og:url" content="https://one-hub-content.vercel.app/community" />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="ONE-HUB" />
        <meta name="twitter:card" content="summary" />
      </Head>
      <div style={{ minHeight: "100vh", background: "#F8F7F2", color: "#1A1A1A", fontFamily: "'Noto Sans KR', sans-serif", padding: "0 0 80px" }}>
        <main style={{ maxWidth: "860px", margin: "0 auto", padding: isMobile ? "24px 16px" : "40px 24px" }}>

          <h1 style={{ fontFamily: "monospace", fontSize: "13px", letterSpacing: "0.2em", color: "#9A9690", textTransform: "uppercase", marginBottom: "8px" }}>Community</h1>
          <p style={{ fontSize: "13px", color: "#6A6660", marginBottom: "36px" }}>AI 자동매매 여정을 함께하는 투자 생태계</p>

          {/* ① 채널 카드 6개 */}
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)", gap: "14px", marginBottom: "40px" }}>
            {channels.map(ch => (
              <div key={ch.name} style={{ background: "#FFFFFF", border: "1px solid #E0DDD4", borderRadius: "12px", padding: "22px 20px", opacity: ch.status === "Coming Soon" ? 0.6 : 1, display: "flex", flexDirection: "column", gap: "12px" }}>
                <div style={{ fontSize: "28px" }}>{ch.icon}</div>
                <div>
                  <div style={{ fontFamily: "monospace", fontSize: "12px", fontWeight: 700, color: "#1A1A1A", marginBottom: "3px" }}>{ch.name}</div>
                  <div style={{ fontFamily: "monospace", fontSize: "10px", color: "#9A9690" }}>{ch.handle}</div>
                </div>
                <p style={{ fontSize: "12px", color: "#6A6660", lineHeight: 1.6, margin: 0, flex: 1 }}>{ch.desc}</p>
                <div>
                  <span style={{ display: "inline-block", fontFamily: "monospace", fontSize: "10px", fontWeight: 700, padding: "3px 8px", borderRadius: "4px",
                    background: ch.status === "LIVE" ? "#E8F8EF" : "#f1f5f9",
                    color:      ch.status === "LIVE" ? "#00AA55" : "#64748b",
                    marginBottom: "10px" }}>
                    {ch.status}
                  </span>
                  {ch.newsletter ? <NewsletterForm /> : ch.link ? (
                    <a href={ch.link} target={ch.link.startsWith("http") ? "_blank" : undefined} rel={ch.link.startsWith("http") ? "noopener noreferrer" : undefined}
                      style={{ display: "block", fontFamily: "monospace", fontSize: "11px", color: "#00AA55", textDecoration: "none" }}>{ch.action} →</a>
                  ) : (
                    <span style={{ fontFamily: "monospace", fontSize: "11px", color: "#9A9690" }}>{ch.action}</span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* ② ONE-HUB 운영 현황 통계 카드 */}
          <div style={{ background: "#FFFFFF", border: "1px solid #E0DDD4", borderRadius: "12px", padding: "24px 20px", marginBottom: "24px" }}>
            <div style={{ fontFamily: "monospace", fontSize: "10px", color: "#9A9690", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "18px" }}>
              📊 ONE-HUB 운영 현황
            </div>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(5, 1fr)", gap: 12 }}>
              {STATS.map(({ label, val, unit }) => (
                <div key={label} style={{ textAlign: "center", padding: "12px 8px", background: "#F8F7F2", borderRadius: 10 }}>
                  <div style={{ fontFamily: "monospace", fontSize: "1.1rem", fontWeight: 800, color: "#1A1A1A" }}>{val}<span style={{ fontSize: "0.7rem", color: "#9A9690", marginLeft: 2 }}>{unit}</span></div>
                  <div style={{ fontSize: "10px", color: "#6A6660", marginTop: 4 }}>{label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* ③ 커뮤니티 원칙 — 카드형 */}
          <div style={{ background: "#FFFFFF", border: "1px solid #E0DDD4", borderRadius: "12px", padding: "28px 24px", marginBottom: "32px" }}>
            <div style={{ fontFamily: "monospace", fontSize: "10px", color: "#9A9690", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "20px" }}>커뮤니티 원칙</div>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "12px" }}>
              {principles.map(p => (
                <div key={p.title} style={{ background: "#f8fafc", borderRadius: 12, padding: 16, display: "flex", gap: 14, alignItems: "flex-start" }}>
                  <span style={{ fontSize: "20px", flexShrink: 0 }}>{p.icon}</span>
                  <div>
                    <div style={{ fontFamily: "monospace", fontSize: "12px", fontWeight: 700, color: "#1A1A1A", marginBottom: "4px" }}>{p.title}</div>
                    <div style={{ fontSize: "12px", color: "#6A6660", lineHeight: 1.5 }}>{p.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ④ CTA 섹션 */}
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <a href="https://t.me/onehub_jiy_bot" target="_blank" rel="noopener noreferrer"
              style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 44, padding: "0 28px", borderRadius: 10, background: "#2563eb", color: "#fff", textDecoration: "none", fontWeight: 700, fontSize: "0.9rem" }}>
              ✈️ 텔레그램 참여
            </a>
            <a href="/pwa"
              style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 44, padding: "0 28px", borderRadius: 10, background: "#f0f6ff", border: "1px solid #bfdbfe", color: "#2563eb", textDecoration: "none", fontWeight: 700, fontSize: "0.9rem" }}>
              📱 PWA 설치
            </a>
          </div>

        </main>
      </div>
    </>
  );
}
