import Head from 'next/head';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import CTABar from '../components/CTABar';

export default function RecommendTrend() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/pwa-recommend-trend?trader=A')
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const days = data?.days ?? {};
  const sortedDates = Object.keys(days).sort((a, b) => b.localeCompare(a));

  // 종목별 3일 출현 빈도 집계
  const stockMap = {};
  sortedDates.forEach((date, di) => {
    (days[date] || []).forEach(item => {
      if (!stockMap[item.stock]) stockMap[item.stock] = { stock: item.stock, scores: {}, reasons: {} };
      stockMap[item.stock].scores[date] = item.score;
      stockMap[item.stock].reasons[date] = item.reason;
    });
  });
  const stocks = Object.values(stockMap).sort((a, b) => {
    const aMax = Math.max(...Object.values(a.scores));
    const bMax = Math.max(...Object.values(b.scores));
    return bMax - aMax;
  });

  const dateLabel = d => {
    const [, m, day] = d.split('-');
    return `${parseInt(m)}/${parseInt(day)}`;
  };

  const scoreColor = score => {
    if (score == null) return '#e2e8f0';
    if (score >= 80) return '#dc2626';
    if (score >= 70) return '#f59e0b';
    if (score >= 60) return '#2563eb';
    return '#94a3b8';
  };

  return (
    <>
      <Head>
        <title>추천 트렌드 — ONE-HUB</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css" rel="stylesheet" />
      </Head>
      <div style={{ minHeight: '100vh', background: '#f8fafc', fontFamily: 'Pretendard, sans-serif', paddingBottom: 80 }}>
        <main style={{ maxWidth: 720, margin: '0 auto', padding: '24px 16px' }}>
          <Link href="/" style={{ color: '#64748b', fontSize: 13, textDecoration: 'none' }}>← ONE-HUB</Link>

          <div style={{ marginTop: 20, marginBottom: 24 }}>
            <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: '#0f172a', margin: '0 0 4px' }}>📊 추천 트렌드</h1>
            <p style={{ fontSize: '0.9rem', color: '#64748b', margin: 0 }}>AI가 최근 3일 연속 추천한 종목 분석</p>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '60px 0', color: '#94a3b8' }}>데이터 조회 중...</div>
          ) : !stocks.length ? (
            <div style={{ textAlign: 'center', padding: '60px 0', color: '#94a3b8' }}>추천 데이터가 없습니다.</div>
          ) : (
            <>
              {/* 날짜 헤더 */}
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, overflow: 'hidden', marginBottom: 20, boxShadow: '0 2px 16px rgba(0,0,0,0.07)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr repeat(3, 70px)', background: '#f8fafc', padding: '10px 16px', borderBottom: '1px solid #e2e8f0' }}>
                  <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>종목</span>
                  {sortedDates.map(d => (
                    <span key={d} style={{ fontSize: 12, color: '#64748b', fontWeight: 600, textAlign: 'center' }}>{dateLabel(d)}</span>
                  ))}
                </div>
                {stocks.map(s => (
                  <div key={s.stock} style={{ display: 'grid', gridTemplateColumns: '1fr repeat(3, 70px)', padding: '12px 16px', borderBottom: '1px solid #f1f5f9', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{s.stock}</div>
                      <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                        {sortedDates.length > 0 && s.reasons[sortedDates[0]]
                          ? s.reasons[sortedDates[0]].slice(0, 30) + (s.reasons[sortedDates[0]].length > 30 ? '…' : '')
                          : ''}
                      </div>
                    </div>
                    {sortedDates.map(d => (
                      <div key={d} style={{ textAlign: 'center' }}>
                        {s.scores[d] != null ? (
                          <span style={{
                            display: 'inline-block',
                            background: scoreColor(s.scores[d]),
                            color: '#fff',
                            borderRadius: 8,
                            padding: '3px 8px',
                            fontSize: 12,
                            fontFamily: 'monospace',
                            fontWeight: 700,
                          }}>{s.scores[d]}</span>
                        ) : (
                          <span style={{ color: '#e2e8f0', fontSize: 14 }}>—</span>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
              </div>

              {/* 연속 추천 종목 하이라이트 */}
              {(() => {
                const consecutive = stocks.filter(s => sortedDates.every(d => s.scores[d] != null));
                if (!consecutive.length) return null;
                return (
                  <div style={{ background: '#fef3c7', border: '1px solid #fbbf24', borderRadius: 16, padding: '16px 20px', marginBottom: 20 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: '#92400e', marginBottom: 10 }}>🔥 3일 연속 AI 추천</div>
                    {consecutive.map(s => (
                      <div key={s.stock} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #fde68a' }}>
                        <span style={{ fontSize: 13, color: '#78350f', fontWeight: 600 }}>{s.stock}</span>
                        <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#92400e' }}>
                          {sortedDates.map(d => s.scores[d]).join(' → ')}
                        </span>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </>
          )}
          <CTABar />
        </main>
      </div>
    </>
  );
}
