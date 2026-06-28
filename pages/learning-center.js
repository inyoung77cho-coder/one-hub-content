import Head from 'next/head';
import Link from 'next/link';
import { useState } from 'react';
import CTABar from '../components/CTABar';

const CATEGORIES = [
  { icon: '🤖', title: 'AI 기초',    desc: 'ML·신호·점수',     count: 3, tag: 'ai-basics',  live: true },
  { icon: '📊', title: '지표 해설',  desc: 'VIX·DXY·Fear',    count: 5, tag: 'indicators',  live: true },
  { icon: '🛡️', title: '리스크',    desc: '손절·포지션',       count: 2, tag: 'risk',        live: true },
  { icon: '📈', title: 'ETF 전략',  desc: '헤지·방어·공격',    count: 4, tag: 'etf',         live: true },
  { icon: '🔍', title: '실전 사례', desc: 'AI 판단 분석',      count: 0, tag: 'cases',       live: false },
  { icon: '🧪', title: '백테스트',  desc: '전략 검증',          count: 0, tag: 'backtest',    live: false },
];

const STEPS = [
  { step: 'STEP 1', title: 'AI 기초 이해',       sub: 'ML 신호란 무엇인가',      tag: 'ai-basics',  href: '/blog?tag=ai-basics' },
  { step: 'STEP 2', title: '시장 지표 이해',      sub: 'VIX, Fear&Greed 해설',   tag: 'indicators', href: '/blog?tag=indicators' },
  { step: 'STEP 3', title: 'ONE-HUB 엔진 이해', sub: '4가지 전략과 가중치',     tag: 'ai-basics',  href: '/blog?tag=engine' },
  { step: 'STEP 4', title: '실전 적용',           sub: 'ETF 헤지 전략',           tag: 'etf',        href: '/blog?tag=etf' },
];

const TERMS = [
  { term: 'Heat Score',   def: '시장 과열도 0~100. 높을수록 과열. 80+ 매수 경계.',   tag: 'indicators' },
  { term: 'Regime',       def: '시장 국면 판단. BULL / BEAR / SIDEWAYS 3가지.',        tag: 'ai-basics' },
  { term: 'ML Signal',    def: '머신러닝(XGBoost) 모델이 출력하는 매수 확률 0~100%.',  tag: 'ai-basics' },
  { term: 'Final Score',  def: '4가지 전략(매크로/ML/기술/리스크) 가중합 종합 점수.',  tag: 'ai-basics' },
  { term: 'Block',        def: 'AI가 리스크 감지 후 매수를 차단하는 결정.',            tag: 'risk' },
  { term: 'ATR',          def: '평균 변동성 지표(Average True Range). 손절폭 계산에 활용.',  tag: 'risk' },
  { term: 'VIX',          def: '변동성 지수. 20 이상이면 시장 불안. 30+ 극도 공포.',   tag: 'indicators' },
  { term: 'DXY',          def: '달러 인덱스. 상승 시 신흥국·위험자산 하방 압력.',      tag: 'indicators' },
  { term: 'Fear&Greed',   def: '공포&탐욕 지수 0~100. 낮을수록 공포 구간.',           tag: 'indicators' },
  { term: 'Screening',    def: '전체 종목 중 기술적 조건 통과 종목 필터링 과정.',      tag: 'ai-basics' },
];

export default function LearningCenter() {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredTerms = TERMS.filter(t =>
    !searchQuery || t.term.toLowerCase().includes(searchQuery.toLowerCase()) || t.def.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <>
      <Head>
        <title>Learning Center — ONE-HUB</title>
        <meta name="description" content="ONE-HUB AI 투자 교육 허브. ML 신호, 시장 지표, ETF 전략, 리스크 관리까지 AI 자동매매를 이해하는 모든 콘텐츠." />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta property="og:title" content="Learning Center — ONE-HUB" />
        <meta property="og:description" content="ONE-HUB AI 투자 교육 허브. ML 신호, 시장 지표, ETF 전략, 리스크 관리까지 AI 자동매매를 이해하는 모든 콘텐츠." />
        <meta property="og:image" content="/icons/icon-512.png" />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="ONE-HUB" />
        <link href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css" rel="stylesheet" />
      </Head>

      <div style={{ minHeight: '100vh', background: '#f8fafc', fontFamily: 'Pretendard, sans-serif', paddingBottom: 80 }}>
        <main style={{ maxWidth: 720, margin: '0 auto', padding: '24px 16px' }}>
          <Link href="/" style={{ color: '#64748b', fontSize: 13, textDecoration: 'none' }}>← ONE-HUB</Link>

          <div style={{ marginTop: 20, marginBottom: 28 }}>
            <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: '#0f172a', margin: '0 0 6px' }}>📚 Learning Center</h1>
            <p style={{ fontSize: '0.9rem', color: '#64748b', margin: 0 }}>AI 자동매매를 이해하는 가장 빠른 길</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 28 }}>
            {CATEGORIES.map(c => (
              <Link key={c.tag} href={c.live ? `/blog?tag=${c.tag}` : '#'} style={{ textDecoration: 'none' }}>
                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: '18px 14px',
                  opacity: c.live ? 1 : 0.6, cursor: c.live ? 'pointer' : 'default',
                  boxShadow: '0 2px 16px rgba(0,0,0,0.07)', transition: 'box-shadow 0.15s' }}>
                  <div style={{ fontSize: 24, marginBottom: 8 }}>{c.icon}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 3 }}>{c.title}</div>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 8 }}>{c.desc}</div>
                  <div style={{ fontFamily: 'monospace', fontSize: 10, color: c.live ? '#2563eb' : '#94a3b8', fontWeight: 700 }}>
                    {c.live ? `${c.count}개 글` : 'Coming Soon'}
                  </div>
                </div>
              </Link>
            ))}
          </div>

          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: '20px', marginBottom: 20, boxShadow: '0 2px 16px rgba(0,0,0,0.07)' }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a', marginBottom: 16 }}>🗺️ 추천 학습 순서</div>
            {STEPS.map((s, i) => (
              <Link key={i} href={s.href} style={{ textDecoration: 'none', display: 'block' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 0', borderBottom: i < STEPS.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                  <div style={{ flexShrink: 0, width: 36, height: 36, borderRadius: '50%', background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontFamily: 'monospace', fontSize: 10, fontWeight: 800, color: '#2563eb' }}>{i + 1}</span>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{s.title}</div>
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>→ {s.sub}</div>
                  </div>
                  <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#94a3b8' }}>{s.step}</span>
                </div>
              </Link>
            ))}
          </div>

          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: '20px', marginBottom: 24, boxShadow: '0 2px 16px rgba(0,0,0,0.07)' }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a', marginBottom: 12 }}>📖 ONE-HUB 용어 사전</div>
            <input
              type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              placeholder="용어 검색..."
              style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #e2e8f0',
                fontSize: 13, fontFamily: 'Pretendard, sans-serif', marginBottom: 14, boxSizing: 'border-box', outline: 'none', color: '#1e293b' }}
            />
            {filteredTerms.map((t, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 12, padding: '10px 0', borderBottom: i < filteredTerms.length - 1 ? '1px solid #f1f5f9' : 'none', alignItems: 'start' }}>
                <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: '#2563eb', paddingTop: 1 }}>{t.term}</span>
                <span style={{ fontSize: 13, color: '#475569', lineHeight: 1.5 }}>{t.def}</span>
              </div>
            ))}
            {filteredTerms.length === 0 && (
              <div style={{ textAlign: 'center', padding: '20px 0', color: '#94a3b8', fontSize: 13 }}>검색 결과가 없습니다.</div>
            )}
          </div>

          <CTABar />
        </main>
      </div>
    </>
  );
}
