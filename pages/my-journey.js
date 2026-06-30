import Head from 'next/head';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import CTABar from '../components/CTABar';
import { APP_VERSION } from '../lib/version';

const MONTHLY = [
  {
    month: '2026-06',
    label: '2026년 6월 (현재)',
    trades: 8,
    blocks: 47,
    pnl: '+3.2%',
    highlight: 'KODEX달러 +8.1% 성공',
    note: 'BEAR 국면 방어 ETF 중심 운영. VIX 급등 구간에서 헤지 전략 효과 확인.',
  },
  {
    month: '2026-05',
    label: '2026년 5월',
    trades: 15,
    blocks: 89,
    pnl: '+5.1%',
    highlight: '방산ETF +12% 성공',
    note: 'ML 정확도 68% 달성. 매크로 필터 추가 후 불필요한 진입 대폭 감소.',
  },
  {
    month: '2026-04',
    label: '2026년 4월 (시작)',
    trades: 22,
    blocks: 94,
    pnl: '+4.0%',
    highlight: '시스템 구축 완료',
    note: 'ONE-HUB v1.0 가동 시작. XGBoost + 22개 피처 모델 배포. 초기 과적합 이슈 발견 후 수정.',
  },
];

const LESSONS = [
  {
    icon: '🧠',
    title: 'ML 신호만으로는 부족',
    desc: '초기에는 ML 점수 70% 이상이면 무조건 매수했으나 BEAR 국면에서 연속 손실. Macro 필터(VIX/Fear) 추가 후 개선.',
  },
  {
    icon: '🛡️',
    title: 'BEAR 국면 방어 ETF 효과',
    desc: '시장 하락 구간에서 KODEX달러·KODEX인버스 헤지 전략 도입. 방어적 포트폴리오로 전환 후 드로다운 최소화.',
  },
  {
    icon: '📡',
    title: '후행 지표의 한계',
    desc: '이동평균·RSI 등 후행 지표가 신호 지연 문제를 일으킴. VIX선물·나스닥선물 등 선행 지표 반영으로 개선.',
  },
  {
    icon: '⚙️',
    title: '모델 버전 관리의 중요성',
    desc: 'scikit-learn 버전 불일치로 서버에서 모델 로드 실패. 환경 고정(Python 3.10 + sklearn 1.7.2) 후 안정화.',
  },
];

const ROADMAP = [
  { label: 'AI Copilot (자연어 질의)', status: 'planned' },
  { label: 'Leaderboard 멀티 전략 비교', status: 'planned' },
  { label: 'My Journey 공개 & 공유', status: 'planned' },
  { label: '실시간 체결 알림 (텔레그램)', status: 'in-progress' },
  { label: 'Market Center 고도화', status: 'in-progress' },
];

export default function MyJourney() {
  const [expandedMonth, setExpandedMonth] = useState(null);
  const [liveMonths, setLiveMonths] = useState(null);

  useEffect(() => {
    fetch('/api/pwa-my-journey?trader=A')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.ok && d.months?.length) setLiveMonths(d.months); })
      .catch(() => {});
  }, []);

  // 실데이터가 있으면 교체, 없으면 정적 데이터 유지
  const MONTHLY_DISPLAY = liveMonths ? liveMonths.map(m => ({
    month: m.month,
    label: m.month.replace('-', '년 ') + '월',
    trades: m.trades,
    blocks: m.blocks,
    pnl: `${m.avg_pct >= 0 ? '+' : ''}${m.avg_pct}%`,
    highlight: `매수 ${m.trades}건 / 차단 ${m.blocks}건 / 승률 ${m.win_rate}%`,
    note: `총 손익 ${m.pnl >= 0 ? '+' : ''}${m.pnl.toLocaleString()}원`,
  })) : MONTHLY;

  const startDate = new Date('2026-04-01');
  const today = new Date();
  const days = Math.floor((today - startDate) / (1000 * 60 * 60 * 24));

  return (
    <>
      <Head>
        <title>My Journey — ONE-HUB</title>
        <meta name="description" content="ONE-HUB와 함께한 AI 자동매매 투자 여정. 월별 성과, 배운 점, 앞으로의 계획을 기록합니다." />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta property="og:title" content="My Journey — ONE-HUB" />
        <meta property="og:description" content="ONE-HUB와 함께한 AI 자동매매 투자 여정. 월별 성과, 배운 점, 앞으로의 계획을 기록합니다." />
        <meta property="og:image" content="/icons/icon-512.png" />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="ONE-HUB" />
        <link href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css" rel="stylesheet" />
      </Head>

      <div style={{ minHeight: '100vh', background: '#f8fafc', fontFamily: 'Pretendard, sans-serif', paddingBottom: 80 }}>
        <main style={{ maxWidth: 720, margin: '0 auto', padding: '24px 16px' }}>
          <Link href="/" style={{ color: '#64748b', fontSize: 13, textDecoration: 'none' }}>← ONE-HUB</Link>

          <div style={{ marginTop: 20, marginBottom: 28 }}>
            <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: '#0f172a', margin: '0 0 6px' }}>🗺️ My Journey</h1>
            <p style={{ fontSize: '0.9rem', color: '#64748b', margin: '0 0 16px' }}>ONE-HUB와 함께한 AI 투자 여정</p>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              {[
                { label: '운영 시작', val: '2026-04-01' },
                { label: '현재까지', val: `${days}일` },
                { label: '누적 분석', val: '4,200+종목·일' },
              ].map(({ label, val }) => (
                <div key={label} style={{ fontFamily: 'monospace', fontSize: 12, color: '#475569' }}>
                  <span style={{ color: '#94a3b8' }}>{label}: </span><strong>{val}</strong>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 28 }}>
            {[
              { label: '누적 매수', val: '45건', sub: '총 진입 횟수' },
              { label: '누적 손익', val: '+12.3%', sub: '3개월 누적', color: '#22c55e' },
              { label: 'AI 승률', val: '67%', sub: '차단 정확도', color: '#2563eb' },
            ].map(({ label, val, sub, color }) => (
              <div key={label} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: '18px 14px', textAlign: 'center', boxShadow: '0 2px 16px rgba(0,0,0,0.07)' }}>
                <div style={{ fontFamily: 'monospace', fontSize: 20, fontWeight: 800, color: color ?? '#0f172a' }}>{val}</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginTop: 4 }}>{label}</div>
                <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>{sub}</div>
              </div>
            ))}
          </div>

          <h2 style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginBottom: 14, fontFamily: 'monospace', letterSpacing: '0.05em', textTransform: 'uppercase' }}>월별 성과 타임라인</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 32 }}>
            {MONTHLY_DISPLAY.map((m) => (
              <div key={m.month} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, overflow: 'hidden', boxShadow: '0 2px 16px rgba(0,0,0,0.07)' }}>
                <button
                  onClick={() => setExpandedMonth(expandedMonth === m.month ? null : m.month)}
                  style={{ width: '100%', background: 'transparent', border: 'none', padding: '16px 20px', cursor: 'pointer', textAlign: 'left' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontFamily: 'monospace', fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>{m.label}</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>⭐ {m.highlight}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontFamily: 'monospace', fontSize: 18, fontWeight: 800, color: '#22c55e' }}>{m.pnl}</div>
                      <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>매수 {m.trades}건 / 차단 {m.blocks}건</div>
                    </div>
                  </div>
                </button>
                {expandedMonth === m.month && (
                  <div style={{ padding: '0 20px 16px', borderTop: '1px solid #f1f5f9' }}>
                    <p style={{ fontSize: 13, color: '#475569', lineHeight: 1.7, margin: '12px 0 8px' }}>{m.note}</p>
                    <Link href={`/daily`} style={{ fontSize: 12, color: '#2563eb', textDecoration: 'none', fontWeight: 600 }}>
                      {m.month} Daily 기록 보기 →
                    </Link>
                  </div>
                )}
              </div>
            ))}
          </div>

          <h2 style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginBottom: 14, fontFamily: 'monospace', letterSpacing: '0.05em', textTransform: 'uppercase' }}>운영하면서 배운 것들</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 32 }}>
            {LESSONS.map((l) => (
              <div key={l.title} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: '18px 20px', display: 'flex', gap: 14, alignItems: 'flex-start', boxShadow: '0 2px 16px rgba(0,0,0,0.07)' }}>
                <span style={{ fontSize: 24, flexShrink: 0 }}>{l.icon}</span>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginBottom: 6 }}>✅ {l.title}</div>
                  <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.65 }}>{l.desc}</div>
                </div>
              </div>
            ))}
          </div>

          <h2 style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginBottom: 14, fontFamily: 'monospace', letterSpacing: '0.05em', textTransform: 'uppercase' }}>앞으로의 계획</h2>
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: '20px', marginBottom: 24, boxShadow: '0 2px 16px rgba(0,0,0,0.07)' }}>
            <div style={{ fontFamily: 'monospace', fontSize: 10, color: '#94a3b8', marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              {APP_VERSION} 이후 로드맵
            </div>
            {ROADMAP.map((r) => (
              <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid #f1f5f9' }}>
                <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6,
                  background: r.status === 'in-progress' ? '#eff6ff' : '#f8fafc',
                  color: r.status === 'in-progress' ? '#2563eb' : '#94a3b8' }}>
                  {r.status === 'in-progress' ? '🔄 진행 중' : '📋 예정'}
                </span>
                <span style={{ fontSize: 13, color: '#1e293b' }}>{r.label}</span>
              </div>
            ))}
          </div>

          <CTABar />
        </main>
      </div>
    </>
  );
}
