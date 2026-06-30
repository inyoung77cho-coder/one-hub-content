import Head from 'next/head';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import CTABar from '../components/CTABar';
import LastUpdated from '../components/LastUpdated';

const MONITORED_ETFS = [
  { name: 'KODEX미국달러', code: '261240' },
  { name: 'KODEX인버스',   code: '114800' },
  { name: 'KODEX반도체',   code: '091160' },
  { name: 'TIGER나스닥',   code: '133690' },
];

const SECTORS = [
  { name: '반도체',  score: null },
  { name: '방산',    score: null },
  { name: '헤지ETF', score: null },
  { name: '바이오',  score: null },
  { name: '금융',    score: null },
  { name: '소비재',  score: null },
];

function heatColor(val, max) {
  const ratio = val / max;
  if (ratio >= 0.8) return '#1d4ed8';
  if (ratio >= 0.6) return '#2563eb';
  if (ratio >= 0.4) return '#60a5fa';
  return '#bfdbfe';
}

export default function MarketCenter() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);

  useEffect(() => {
    fetch(`/api/pwa-dashboard?trader=A`)
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(d => { setData(d); setLastUpdated(new Date()); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const market = data?.market ?? {};
  const candidates = data?.screening_candidates ?? [];
  const blocked = data?.blocked_stocks ?? [];

  // 필드 정규화 (Flask API는 heat_score, fear_greed 키 사용)
  const heat   = market.heat_score ?? market.heat ?? null;
  const fear   = market.fear_greed ?? market.fear ?? null;
  const vix    = market.vix ?? null;
  const regime = market.regime ?? 'SIDEWAYS';
  const heatLabel = heat == null ? '-' : heat >= 65 ? 'HOT 구간' : heat >= 50 ? 'WARM 구간' : heat >= 35 ? '냉각 구간' : '극냉 구간';
  const fearLabel = fear == null ? '-' : fear >= 60 ? '탐욕' : fear >= 40 ? '중립' : fear >= 25 ? '공포' : '극도 공포';

  const regimeBases = [
    { label: `VIX ${vix ?? '-'} (기준 20 ${vix != null && vix > 20 ? '초과' : '이하'})`, met: vix != null && vix > 20 },
    { label: `Fear ${fear ?? '-'} (${fearLabel})`, met: fear != null && fear < 25 },
    { label: `Heat ${heat ?? '-'} (${heatLabel})`, met: heat != null && heat < 35 },
    { label: `Regime: ${regime}`, met: regime === 'BEAR' },
  ];

  const sectorScores = (() => {
    const map = {};
    candidates.forEach(s => {
      const sector = s.sector ?? '기타';
      if (!map[sector]) map[sector] = [];
      map[sector].push(s.score ?? s.final_score ?? 0);
    });
    return SECTORS.map(s => ({
      name: s.name,
      score: map[s.name] ? Math.round(map[s.name].reduce((a, b) => a + b, 0) / map[s.name].length) : s.score,
    })).sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  })();

  const etfStatus = MONITORED_ETFS.map(e => {
    const match = [...candidates, ...blocked].find(s => s.code === e.code || s.name?.includes(e.name.substring(0, 6)));
    return {
      ...e,
      chg: match?.chg ?? null,
      action: match ? (candidates.find(s => s.code === e.code) ? 'BUY' : 'BLOCK') : null,
    };
  });

  const KPIs = [
    { icon: '🌡️', label: 'Heat',   val: heat != null ? `${heat}/100` : '-', sub: heatLabel },
    { icon: '😱', label: 'Fear',   val: fear != null ? `${fear}/100` : '-', sub: fearLabel },
    { icon: '📊', label: 'VIX',    val: vix ?? '-',   sub: vix != null ? (vix > 20 ? '변동성 높음' : '변동성 낮음') : '' },
    { icon: '📅', label: 'Regime', val: regime,        sub: market.regime_days != null ? `${market.regime_days}일째` : '' },
    { icon: '💰', label: '평가액',  val: market.final_value != null ? `${(market.final_value/10000).toFixed(0)}만` : '-', sub: '' },
    { icon: '📈', label: '오늘손익', val: market.daily_pnl != null ? `${market.daily_pnl >= 0 ? '+' : ''}${Math.round(market.daily_pnl).toLocaleString()}` : '-', sub: '' },
  ];

  return (
    <>
      <Head>
        <title>Market Center — ONE-HUB</title>
        <meta name="description" content="ONE-HUB 시장 종합 대시보드. VIX·Fear·Heat 등 핵심 투자 지표를 한 화면에서 확인하세요." />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta property="og:title" content="Market Center — ONE-HUB" />
        <meta property="og:description" content="ONE-HUB 시장 종합 대시보드. VIX·Fear·Heat 등 핵심 투자 지표를 한 화면에서 확인하세요." />
        <meta property="og:image" content="/icons/icon-512.png" />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="ONE-HUB" />
        <link href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css" rel="stylesheet" />
      </Head>

      <div style={{ minHeight: '100vh', background: '#f8fafc', fontFamily: 'Pretendard, sans-serif', paddingBottom: 80 }}>
        <main style={{ maxWidth: 720, margin: '0 auto', padding: '24px 16px' }}>
          <Link href="/" style={{ color: '#64748b', fontSize: 13, textDecoration: 'none' }}>← ONE-HUB</Link>

          <div style={{ marginTop: 20, marginBottom: 24 }}>
            <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: '#0f172a', margin: '0 0 4px' }}>🌐 Market Center</h1>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <p style={{ fontSize: '0.9rem', color: '#64748b', margin: 0 }}>오늘 시장 핵심 지표 종합</p>
              <LastUpdated timestamp={lastUpdated} />
            </div>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '60px 0', color: '#94a3b8' }}>시장 데이터 조회 중...</div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 20 }}>
                {KPIs.map(({ icon, label, val, sub }) => (
                  <div key={label} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: '14px 12px', textAlign: 'center', boxShadow: '0 2px 16px rgba(0,0,0,0.07)' }}>
                    <div style={{ fontSize: 20, marginBottom: 4 }}>{icon}</div>
                    <div style={{ fontFamily: 'monospace', fontSize: 16, fontWeight: 800, color: '#0f172a' }}>{val}</div>
                    <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>{label}</div>
                    {sub && <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>{sub}</div>}
                  </div>
                ))}
              </div>

              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: '20px', marginBottom: 20, boxShadow: '0 2px 16px rgba(0,0,0,0.07)' }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a', marginBottom: 14 }}>🤖 ONE-HUB AI 종합 판단</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, padding: '12px 16px', background: '#fef2f2', borderRadius: 10 }}>
                  <div>
                    <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 3 }}>현재 Regime</div>
                    <div style={{ fontFamily: 'monospace', fontSize: 18, fontWeight: 800, color: regime === 'BULL' ? '#22c55e' : regime === 'BEAR' ? '#dc2626' : '#f59e0b' }}>{regime}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 3 }}>지속일</div>
                    <div style={{ fontFamily: 'monospace', fontSize: 18, fontWeight: 800, color: '#2563eb' }}>{market.regime_days ?? '-'}일</div>
                  </div>
                </div>
                <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600, marginBottom: 8 }}>판단 근거</div>
                {regimeBases.map((b, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0' }}>
                    <span style={{ fontSize: 12, color: b.met ? '#dc2626' : '#22c55e' }}>{b.met ? '①②③④'[i] : '✓'}</span>
                    <span style={{ fontSize: 13, color: '#475569' }}>{b.label}</span>
                  </div>
                ))}
              </div>

              {sectorScores.some(s => s.score != null) && (
                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: '20px', marginBottom: 20, boxShadow: '0 2px 16px rgba(0,0,0,0.07)' }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a', marginBottom: 14 }}>🗺️ 섹터별 AI 관심도</div>
                  {sectorScores.filter(s => s.score != null).map(s => (
                    <div key={s.name} style={{ marginBottom: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, fontSize: 13 }}>
                        <span style={{ color: '#1e293b', fontWeight: 500 }}>{s.name}</span>
                        <span style={{ fontFamily: 'monospace', color: '#2563eb', fontWeight: 700 }}>
                          {s.score}점 {s.score >= 70 ? '🔥' : ''}
                        </span>
                      </div>
                      <div style={{ height: 8, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${s.score}%`, background: heatColor(s.score, 100), borderRadius: 4, transition: 'width 0.6s' }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: '20px', marginBottom: 24, boxShadow: '0 2px 16px rgba(0,0,0,0.07)' }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a', marginBottom: 14 }}>📈 ONE-HUB 모니터링 ETF</div>
                {etfStatus.map(e => (
                  <div key={e.code} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f1f5f9' }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{e.name}</div>
                      <div style={{ fontFamily: 'monospace', fontSize: 11, color: '#94a3b8' }}>{e.code}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      {e.chg != null && (
                        <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: String(e.chg).startsWith('-') ? '#ef4444' : '#22c55e' }}>
                          {e.chg}
                        </span>
                      )}
                      <span style={{ fontSize: 11, fontWeight: 700,
                        color: e.action === 'BUY' ? '#22c55e' : e.action === 'BLOCK' ? '#ef4444' : '#94a3b8' }}>
                        {e.action === 'BUY' ? '✅ 추천' : e.action === 'BLOCK' ? '🔴 차단' : '⚠️ 관망'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
          <CTABar />
        </main>
      </div>
    </>
  );
}
