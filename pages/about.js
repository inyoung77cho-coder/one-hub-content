import Head from "next/head";
import Link from "next/link";
import PageHero from "../components/PageHero";
import { APP_VERSION, LAST_UPDATED } from '../lib/version';

const values = [
  { icon: "🔍", title: "투명성", desc: "수익뿐 아니라 실패와 손절 이유를 그대로 공개합니다. 방향성(▲▼➖)만 공유하되, 판단 근거는 모두 오픈합니다." },
  { icon: "🤖", title: "AI와 사람의 협업", desc: "AI가 데이터를 읽고, 사람이 맥락을 판단합니다. 두 판단의 결합 과정 자체를 콘텐츠로 만듭니다." },
  { icon: "📚", title: "학습 중심", desc: "단기 수익보다 장기적 사고방식을 키우는 것이 목표입니다. 매일의 실패가 다음 판단을 더 정교하게 만듭니다." },
  { icon: "🛡️", title: "리스크 우선", desc: "수익 극대화보다 손실 최소화가 먼저입니다. 엔진은 항상 '왜 매매하지 않는가'를 먼저 묻습니다." },
];

const timeline = [
  { date: "2026-06", label: `ONE-HUB ${APP_VERSION} PWA 출시`, desc: "PWA 전면 리뉴얼 (Splash/Onboarding/Hero), AI 판단 근거 시각화, AI Accuracy Dashboard, Decision Log 추가, Trader A/B 분리 운영, STOCK_POOL 131종목 확대" },
  { date: "2026-05-31", label: "ONE-HUB v8.0", desc: "AWS 마이그레이션 완료, Engine Hub 공개, 전체 홈페이지 구축, systemd 단독 관리" },
  { date: "2026-05-23", label: "콘텐츠 플랫폼 전환", desc: "단순 매매봇 → Daily/Weekly 리포트 자동 발행 파이프라인 구축, Vercel 배포" },
  { date: "2026-05-21", label: "AWS 마이그레이션 시작", desc: "Lightsail 서버 구축, KIS API 연동, systemd 서비스 등록" },
  { date: "2026-05-09", label: "자동매매 시작", desc: "KIS API 연동, ML 시그널 + 기술적 지표 기반 실전 운용 시작" },
  { date: "2026-04-01", label: "ONE-HUB 프로젝트 시작", desc: "AI 자동매매 + 콘텐츠 플랫폼 아이디어 구체화, 첫 코드 작성" },
];

export default function AboutPage() {
  return (
    <>
      <Head>

        <title>About — ONE-HUB</title>

        <meta name="description" content="ONE-HUB 소개. AI가 분석하고 사람이 판단하는 한국 주식 자동매매 시스템의 철학과 운영 원칙." />

        <meta name="viewport" content="width=device-width, initial-scale=1" />

        <meta property="og:title" content="About — ONE-HUB" />

        <meta property="og:description" content="ONE-HUB 소개. AI가 분석하고 사람이 판단하는 한국 주식 자동매매 시스템의 철학과 운영 원칙." />

        <meta property="og:url" content="https://one-hub-content.vercel.app/about" />

        <meta property="og:type" content="website" />

        <meta property="og:site_name" content="ONE-HUB" />

        <meta name="twitter:card" content="summary" />

        <meta name="twitter:title" content="About — ONE-HUB" />

        <meta name="twitter:description" content="ONE-HUB 소개. AI가 분석하고 사람이 판단하는 한국 주식 자동매매 시스템의 철학과 운영 원칙." />

      </Head>
      <div style={{ minHeight: "100vh", background: "#F4F9FF" }}>
        <PageHero
          eyebrow="About ONE-HUB"
          title={<>AI가 시장을 읽고,<br /><span style={{ color: "#7FE9C0" }}>사람이 판단하는</span> 자동매매</>}
          subtitle="ONE-HUB는 단순한 자동매매 봇이 아닙니다. AI의 데이터 분석과 사람의 맥락 판단이 결합되는 과정을 기록하고, 그 여정을 투명하게 공유하는 플랫폼입니다."
        />
        <main className="oh-main">
          <section className="oh-section">
            <div className="oh-sechead"><span className="oh-eyebrow">운영 철학</span></div>
            <div className="oh-grid-2">
              {values.map(v => (
                <div key={v.title} className="oh-card">
                  <div style={{ fontSize: "26px", marginBottom: "12px" }}>{v.icon}</div>
                  <div style={{ fontSize: "16px", fontWeight: 800, color: "#1E293B", marginBottom: "8px" }}>{v.title}</div>
                  <p style={{ fontSize: "13.5px", color: "#64748B", lineHeight: 1.6, margin: 0 }}>{v.desc}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="oh-section">
            <div className="oh-sechead"><span className="oh-eyebrow">콘텐츠 원칙</span></div>
            <div className="oh-card">
              {[["🚫","수익률(%) 숫자 공개 금지","방향성(▲▼➖)만 공개합니다. 과도한 기대를 조성하지 않습니다."],["📢","실패 공개 필수","손절 이유와 판단 오류를 있는 그대로 기록합니다."],["🔗","AI + 사람 결합 과정 콘텐츠화","AI 판단 근거와 사람의 최종 결정 과정을 매일 공유합니다."]].map(([icon, title, desc], i, arr) => (
                <div key={title} style={{ display: "flex", gap: "16px", alignItems: "flex-start", padding: "14px 0", borderBottom: i < arr.length - 1 ? "1px solid #E8EEF7" : "none" }}>
                  <span style={{ fontSize: "20px", flexShrink: 0 }}>{icon}</span>
                  <div>
                    <div style={{ fontSize: "14px", fontWeight: 800, color: "#1E293B", marginBottom: "4px" }}>{title}</div>
                    <div style={{ fontSize: "13px", color: "#64748B", lineHeight: 1.6 }}>{desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="oh-section">
            <div className="oh-sechead"><span className="oh-eyebrow">프로젝트 히스토리</span></div>
            <div className="oh-card">
              <div style={{ position: "relative", paddingLeft: "24px", borderLeft: "2px solid #E8EEF7" }}>
                {timeline.map((t, i) => (
                  <div key={i} style={{ position: "relative", paddingBottom: i < timeline.length - 1 ? "22px" : "0" }}>
                    <div style={{ position: "absolute", left: "-31px", top: "4px", width: "10px", height: "10px", borderRadius: "50%", background: i === 0 ? "#16C784" : "#CBD5E1", border: "2px solid #E8EEF7" }} />
                    <div style={{ fontFamily: "'Space Mono', monospace", fontSize: "11px", color: "#94A3B8", marginBottom: "4px" }}>{t.date}</div>
                    <div style={{ fontSize: "14px", fontWeight: 800, color: "#1E293B", marginBottom: "4px" }}>{t.label}</div>
                    <div style={{ fontSize: "13px", color: "#64748B", lineHeight: 1.6 }}>{t.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <div className="oh-card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "16px" }}>
            <div>
              <div className="oh-eyebrow" style={{ marginBottom: "8px" }}>현재 운용 상태</div>
              <div style={{ fontSize: "17px", fontWeight: 800, color: "#16C784" }}>LIVE · auto_trade {APP_VERSION}</div>
              <div style={{ fontSize: "12.5px", color: "#64748B", marginTop: "4px" }}>AWS Lightsail · 매일 15:30 KST 자동 리포트</div>
            </div>
            <Link href="/engines" style={{ fontSize: "13px", fontWeight: 700, color: "#2F6BFF", textDecoration: "none", padding: "11px 18px", border: "1px solid #E8EEF7", borderRadius: "12px", background: "#fff" }}>
              엔진 상태 보기 →
            </Link>
          </div>
        </main>
      </div>
    </>
  );
}
