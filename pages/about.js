import Head from "next/head";
import Link from "next/link";

export default function AboutPage() {
  const timeline = [
    { date: "2026-05", label: "ONE-HUB v8.0", desc: "AWS 마이그레이션 완료, Engine Hub 공개, systemd 단독 관리" },
    { date: "2026-05", label: "콘텐츠 플랫폼 전환", desc: "단순 매매봇 → Daily/Weekly 리포트 자동 발행 파이프라인 구축" },
    { date: "2026-05", label: "자동매매 시작", desc: "KIS API 연동, ML 시그널 + 기술적 지표 기반 실전 운용 시작" },
    { date: "2026-04", label: "ONE-HUB 프로젝트 시작", desc: "AI 자동매매 + 콘텐츠 플랫폼 아이디어 구체화" },
  ];

  const values = [
    { icon: "🔍", title: "투명성", desc: "수익뿐 아니라 실패와 손절 이유를 그대로 공개합니다. 방향성(▲▼➖)만 공유하되, 판단 근거는 모두 오픈합니다." },
    { icon: "🤖", title: "AI와 사람의 협업", desc: "AI가 데이터를 읽고, 사람이 맥락을 판단합니다. 어느 한쪽의 독단이 아닌 두 판단의 결합 과정 자체를 콘텐츠로 만듭니다." },
    { icon: "📚", title: "학습 중심", desc: "단기 수익보다 장기적 사고방식을 키우는 것이 목표입니다. 매일의 실패가 다음 판단을 더 정교하게 만듭니다." },
    { icon: "🛡️", title: "리스크 우선", desc: "수익 극대화보다 손실 최소화가 먼저입니다. 엔진은 항상 '왜 매매하지 않는가'를 먼저 묻습니다." },
  ];

  return (
    <>
      <Head><title>About — ONE-HUB</title></Head>
      <div style={{ minHeight: "100vh", background: "#0a0c10", color: "#e8edf5", fontFamily: "'Noto Sans KR', sans-serif", padding: "0 0 80px" }}>
        <header style={{ borderBottom: "1px solid #1e2530", padding: "20px 32px", display: "flex", alignItems: "center", background: "#0f1218", position: "sticky", top: 0, zIndex: 100 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
            <Link href="/" style={{ fontFamily: "monospace", fontSize: "13px", fontWeight: 700, letterSpacing: "0.15em", color: "#8a9ab5", textDecoration: "none" }}>
              ONE-<span style={{ color: "#00d084" }}>HUB</span>
            </Link>
            <nav style={{ display: "flex", gap: "20px" }}>
              {[["DAILY","/daily"],["WEEKLY","/weekly"],["ENGINES","/engines"],["STRATEGIES","/strategies"],["COMMUNITY","/community"],["ABOUT","/about"]].map(([label, href]) => (
                <Link key={href} href={href} style={{ fontFamily: "monospace", fontSize: "11px", color: href === "/about" ? "#00d084" : "#4a5568", textDecoration: "none", letterSpacing: "0.1em" }}>{label}</Link>
              ))}
            </nav>
          </div>
        </header>

        <main style={{ maxWidth: "780px", margin: "0 auto", padding: "40px 24px" }}>

          {/* 히어로 */}
          <div style={{ marginBottom: "48px" }}>
            <div style={{ fontFamily: "monospace", fontSize: "11px", color: "#4a5568", letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: "16px" }}>About ONE-H
