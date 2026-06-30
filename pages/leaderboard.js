import Head from 'next/head';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import CTABar from '../components/CTABar';

const PERIODS = ['이번달', '3개월', '전체'];

const STRATEGIES = {
  '이번달': [
    { rank: 1, name: 'ML 신호',     winRate: 72, returns: '+8.3%', count: 18 },
    { rank: 2, name: '매크로 필터', winRate: 68, returns: '+5.1%', count: 12 },
    { rank: 3, name: 'Final Score', winRate: 65, returns: '+4.2%', count: 15 },
    { rank: 4, name: '리스크 관리', winRate: 61, returns: '+3.8%', count: 20 },
  ],
  '3개월': [
    { rank: 1, name: 'ML 신호',     winRate: 70, returns: '+18.1%', count: 45 },
    { rank: 2, name: 'Final Score', winRate: 66, returns: '+12.4%', count: 38 },
    { rank: 3, name: '매크로 필터', winRate: 64, returns: '+11.2%', count: 32 },
    { rank: 4, name: '리스크 관리', winRate: 60, returns: '+9.8%',  count: 55 },
  ],
  '전체': [
    { rank: 1, name: 'ML 신호',     winRate: 67, returns: '+21.3%', count: 45 },
    { rank: 2, name: 'Final Score', winRate: 63, returns: '+15.6%', count: 38 },
    { rank: 3, name: '매크로 필터', winRate: 61, returns: '+13.4%', count: 30 },
    { rank: 4, name: '리스크 관리', winRate: 58, returns: '+11.2%', count: 52 },
  ],
};

const MONTHLY = [
  { month: '4월', bar: 73, returns: '+4.0%', count: 22, href: '/daily' },
  { month: '5월', bar: 80, returns: '+5.1%', count: 15, href: '/daily' },
  { month: '6월', bar: 62, returns: '+3.2%', count: 8,  href: '/daily' },
];

const SECTORS = [
  { name: '방산ETF',  winRate: 80 },
  { name: '헤지ETF',  winRate: 75 },
  { name: '반도체',   winRate: 65 },
  { name: '바이오',   winRate: 55 },
];

const RECORDS = [
  { label: '최고 단일 수익',  val: 'KODEX달러 +8.1%' },
  { label: '최장 연승',       val: '5연승 (5월)' },
  { label: '최고 정확도',     val: 'W23주 78%' },
  { label: '최다 차단',       val: '6/28 하루 6건' },
];

const rankEmoji = (r) => r === 1 ? '🥇' : r === 2 ? '🥈' : r === 3 ? '🥉' : String(r);
const sectorColor = (r) => r >= 80 ? '#22c55e' : r >= 70 ? '#2563eb' : '#94a3b8';

export default function Leaderboard() {
  const [period, setPeriod] = useState('이번달');
  const [liveData, setLiveData] = useState(null);

  useEffect(() => {
    const daysMap = { '이번달': 30, '3개월': 90, '전체': 365 };
    const days = daysMap[period] || 30;
    fetch(`/api/pwa-leaderboard?trader=A&days=${days}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.ok) setLiveData(d); })
      .catch(() => {});
  }, [period]);

  // 실데이터가 있으면 교체
  const strategies = liveData?.strategies?.length
    ? liveData.strategies.map((s, i) => ({
        rank: i + 1, name: s.name,
        winRate: s.win_rate, returns: `${s.avg_pct >= 0 ? '+' : ''}${s.avg_pct}%`,
        count: s.count,
      }))
    : (STRATEGIES[period] || []);
  const sectors = liveData?.sectors?.length
    ? liveData.sectors.map(s => ({ name: s.name, winRate: s.win_rate }))
    : SECTORS;
  return (
    <>
      <Head>
        <title>Leaderboard — ONE-HUB</title>
        <meta name="description" content="ONE-HUB AI 전략 성과 랭킹. ML 신호, 매크로 필터, Final Score 전략별 승률과 수익률을 비교합니다." />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta property="og:title" content="Leaderboard — ONE-HUB" />
        <meta property="og:description" content="ONE-HUB AI 전략 성과 랭킹. ML 신호, 매크로 필터, Final Score 전략별 승률과 수익률을 비교합니다." />
        <meta property="og:image" content="/icons/icon-512.png" />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="ONE-HUB" />
        <link href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css" rel="stylesheet" />
      </Head>

      <div style={{ minHeight: '100vh', background: '#f8fafc', fontFamily: 'Pretendard, sans-serif', paddingBottom: 80 }}>
        <main style={{ maxWidth: 720, margin: '0 auto', padding: '24px 16px' }}>
          <Link href="/" style={{ color: '#64748b', fontSize: 13, textDecoration: 'none' }}>← ONE-HUB</Link>

          <div style={{ marginTop: 20, marginBottom: 24 }}>
            <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: '#0f172a', margin: '0 0 6px' }}>🏆 Leaderboard</h1>
            <p style={{ fontSize: '0.9rem', color: '#64748b', margin: '0 0 16px' }}>ONE-HUB AI 전략 성과 랭킹</p>
            <div style={{ display: 'flex', gap: 6 }}>
              {PERIODS.map(p => (
                <button key={p} onClick={() => setPeriod(p)}
                  style={{ padding: '7px 16px', borderRadius: 8, border: '1px solid #e2e8f0',
                    background: period === p ? '#2563eb' : '#fff',
                    color: period === p ? '#fff' : '#64748b',
                    cursor: 'pointer', fontSize: 13, fontWeight: period === p ? 700 : 400 }}>
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, overflow: 'hidden', marginBottom: 20, boxShadow: '0 2px 16px rgba(0,0,0,0.07)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '48px 1fr 60px 70px 60px', padding: '10px 16px',
              borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
              {['순위', '전략', '승률', '수익률', '건수'].map(h => (
                <div key={h} style={{ fontFamily: 'monospace', fontSize: 10, color: '#94a3b8', fontWeight: 400 }}>{h}</div>
              ))}
            </div>
            {strategies.map((s) => (
              <div key={s.rank} style={{ display: 'grid', gridTemplateColumns: '48px 1fr 60px 70px 60px',
                padding: '14px 16px', borderBottom: '1px solid #f1f5f9',
                background: s.rank === 1 ? '#fffbeb' : '#fff', alignItems: 'center' }}>
                <div style={{ fontSize: s.rank <= 3 ? 18 : 13, fontFamily: 'monospace', fontWeight: 700, color: '#64748b' }}>
                  {rankEmoji(s.rank)}
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{s.name}</div>
                <div style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 700, color: '#2563eb' }}>{s.winRate}%</div>
                <div style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 700, color: s.returns.startsWith('+') ? '#22c55e' : '#ef4444' }}>{s.returns}</div>
                <div style={{ fontFamily: 'monospace', fontSize: 12, color: '#94a3b8' }}>{s.count}건</div>
              </div>
            ))}
          </div>

          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: '20px', marginBottom: 20, boxShadow: '0 2px 16px rgba(0,0,0,0.07)' }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a', marginBottom: 14 }}>📈 월별 성과 추이</div>
            {MONTHLY.map((m, i) => (
              <Link key={i} href={m.href} style={{ textDecoration: 'none', display: 'block', marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, fontSize: 13 }}>
                  <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#1e293b' }}>{m.month}</span>
                  <span style={{ display: 'flex', gap: 10 }}>
                    <span style={{ fontFamily: 'monospace', color: '#22c55e', fontWeight: 700 }}>{m.returns}</span>
                    <span style={{ fontFamily: 'monospace', color: '#94a3b8' }}>{m.count}건</span>
                  </span>
                </div>
                <div style={{ height: 10, background: '#f1f5f9', borderRadius: 5, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${m.bar}%`, background: '#2563eb', borderRadius: 5 }} />
                </div>
              </Link>
            ))}
          </div>

          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: '20px', marginBottom: 20, boxShadow: '0 2px 16px rgba(0,0,0,0.07)' }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a', marginBottom: 14 }}>🗺️ 섹터별 AI 승률</div>
            {sectors.map(s => (
              <div key={s.name} style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, fontSize: 13 }}>
                  <span style={{ color: '#1e293b', fontWeight: 500 }}>{s.name}</span>
                  <span style={{ fontFamily: 'monospace', fontWeight: 700, color: sectorColor(s.winRate) }}>{s.winRate}%</span>
                </div>
                <div style={{ height: 8, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${s.winRate}%`, background: sectorColor(s.winRate), borderRadius: 4 }} />
                </div>
              </div>
            ))}
          </div>

          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: '20px', marginBottom: 24, boxShadow: '0 2px 16px rgba(0,0,0,0.07)' }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a', marginBottom: 14 }}>⭐ 명예의 전당</div>
            {RECORDS.map((r, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: i < RECORDS.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                <span style={{ fontSize: 13, color: '#64748b' }}>{r.label}</span>
                <span style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{r.val}</span>
              </div>
            ))}
          </div>

          <CTABar />
        </main>
      </div>
    </>
  );
}
