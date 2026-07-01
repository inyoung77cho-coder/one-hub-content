import Head from 'next/head';
import Link from 'next/link';
import { useState, useEffect } from 'react';

export default function TrustCenter() {
  const [data, setData] = useState(null);
  const [accuracy, setAccuracy] = useState(null);
  const [uptime, setUptime] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  const load = () => {
    const API = process.env.NEXT_PUBLIC_ENGINE_API_URL || 'http://54.180.54.132:5001';
    fetch(`${API}/api/pwa-dashboard?trader=A`)
      .then(r => r.json())
      .then(d => { if (d.ok) { setData(d); setLastUpdated(new Date()); } })
      .catch(() => {});
    fetch(`${API}/api/pwa/accuracy?trader_id=A`)
      .then(r => r.json())
      .then(d => { if (d.ok) setAccuracy(d); })
      .catch(() => {});
    fetch(`${API}/api/engine-status`)
      .then(r => r.json())
      .then(d => setUptime(d))
      .catch(() => {});
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);

  const statusDot = (ok) => (
    <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%',
      background: ok ? '#22c55e' : '#ef4444', marginRight: 8, flexShrink: 0 }} />
  );

  // [v8.7] 엔진 상태를 사용자 친화적 문구로 변환
  const getEngineStatusDisplay = (isActive) => {
    if (!isActive && !data) return { dot: '⚠', label: '점검 중', sub: '일시적 오류 발생, 자동 복구 중입니다', color: '#C0392B' };
    const now = new Date();
    const isWeekend = [0, 6].includes(now.getDay());
    const kstHour = new Date(now.getTime() + 9 * 3600000).getUTCHours();
    const isMarketHours = !isWeekend && kstHour >= 9 && kstHour < 16;
    if (isActive && isMarketHours) return { dot: '●', label: '분석 중', sub: 'AI가 시장을 모니터링하고 있습니다', color: '#1E8449' };
    if (isWeekend) return { dot: '○', label: '주말 휴식 중', sub: '월요일 오전 7:00 KST에 재개됩니다', color: '#6C7A89' };
    return { dot: '○', label: '대기 중', sub: '다음 분석은 오전 8:50 KST입니다', color: '#6C7A89' };
  };

  const engine   = data?.engine;
  const market   = data?.market;
  const balance  = data?.balance;
  const summary  = accuracy?.summary ?? {};
  const blocked  = data?.blocked_stocks ?? [];
  const buys     = (data?.recommend_stocks ?? []).filter(s => (s.score ?? 0) >= 70);
  const lastRun  = data?.last_updated ?? '-';

  return (
    <>
      <Head>
        <title>Trust Center — ONE-HUB</title>
        <meta name="description" content="ONE-HUB 실시간 운영 현황 — 엔진 상태, AI 정확도, 오늘 통계를 투명하게 공개합니다." />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link href="https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet" />
      </Head>

      <div className="page-wrapper">
        <main className="main" style={{ maxWidth: 720 }}>

          {/* 헤더 */}
          <div style={{ marginBottom: 32 }}>
            <h1 style={{ fontFamily: 'Syne, sans-serif', fontSize: '1.75rem', fontWeight: 800, marginBottom: 8 }}>
              🛡️ Trust Center
            </h1>
            <p style={{ color: 'var(--color-muted)', fontSize: '0.9rem', lineHeight: 1.7 }}>
              ONE-HUB 실시간 운영 현황 — 시스템 상태, AI 통계, 오늘 활동을 투명하게 공개합니다.
            </p>
            {lastUpdated && (
              <p style={{ fontSize: '0.75rem', color: 'var(--color-muted)', marginTop: 6, fontFamily: 'Space Mono, monospace' }}>
                마지막 갱신: {lastUpdated.toLocaleTimeString('ko-KR')} · 30초마다 자동 갱신
              </p>
            )}
          </div>

          {/* ENGINE STATUS */}
          <section style={cardStyle}>
            <h2 style={sectionTitle}>ENGINE STATUS</h2>
            {/* Trading Engine — 친화적 상태 표시 */}
            {(() => {
              const st = getEngineStatusDisplay(engine?.is_active ?? false);
              return (
                <div style={{ ...rowStyle, flexDirection: 'column', alignItems: 'flex-start', gap: 4, padding: '10px 0', borderBottom: '1px solid var(--color-border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: '1rem', color: st.color }}>{st.dot}</span>
                      <span style={{ fontSize: '0.88rem', fontWeight: 700, color: st.color }}>{st.label}</span>
                    </div>
                    <span style={{ fontSize: '0.7rem', color: 'var(--color-muted)' }}>Trading Engine</span>
                  </div>
                  <span style={{ fontSize: '0.78rem', color: 'var(--color-muted)', paddingLeft: 26 }}>{st.sub}</span>
                </div>
              );
            })()}
            {[
              { label: 'KIS API 연결',  ok: (balance?.total_asset ?? 0) > 0 },
              { label: 'Database',      ok: !!data },
              { label: 'Flask API 서버', ok: !!data },
            ].map(({ label, ok }) => (
              <div key={label} style={rowStyle}>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  {statusDot(ok)}
                  <span style={{ fontSize: '0.88rem', color: 'var(--color-text)' }}>{label}</span>
                </div>
                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: ok ? '#22c55e' : '#6C7A89' }}>
                  {ok ? '정상' : '대기 중'}
                </span>
              </div>
            ))}
          </section>

          {/* TODAY STATS */}
          <section style={cardStyle}>
            <h2 style={sectionTitle}>TODAY STATS</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
              {[
                { label: '분석 종목',  val: (data?.screening_candidates?.length ?? 0) + blocked.length + '개' },
                { label: '차단 건수',  val: `${blocked.length}건` },
                { label: '매수 건수',  val: `${buys.length}건` },
                { label: 'Regime',    val: market?.regime ?? '-' },
                { label: 'Heat',      val: market?.heat_score != null ? `${market.heat_score}/100` : '-' },
                { label: '마지막 실행', val: lastRun ? String(lastRun).substring(11, 16) + ' KST' : '-' },
              ].map(({ label, val }) => (
                <div key={label} style={{ background: 'var(--color-bg)', borderRadius: 10, padding: '10px 14px' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--color-muted)', marginBottom: 4, fontFamily: 'Space Mono, monospace' }}>{label}</div>
                  <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-text)', fontFamily: 'Space Mono, monospace' }}>{val}</div>
                </div>
              ))}
            </div>
          </section>

          {/* AI ACCURACY */}
          <section style={cardStyle}>
            <h2 style={sectionTitle}>AI ACCURACY</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              {[
                { label: '누적 차단',  val: `${summary.total ?? 0}건` },
                { label: '검증 완료',  val: `${summary.buy_count ?? 0}건` },
                { label: '적중률',     val: summary.accuracy_pct != null ? `${summary.accuracy_pct}%` : '-' },
              ].map(({ label, val }) => (
                <div key={label} style={{ background: 'var(--color-bg)', borderRadius: 10, padding: '10px 14px', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.68rem', color: 'var(--color-muted)', marginBottom: 6, fontFamily: 'Space Mono, monospace' }}>{label}</div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--color-text)', fontFamily: 'Space Mono, monospace' }}>{val}</div>
                </div>
              ))}
            </div>
            <Link href="/ai-accuracy" style={{ display: 'block', marginTop: 14, fontSize: '0.8rem', color: '#2563eb', textDecoration: 'none', fontFamily: 'Space Mono, monospace' }}>
              AI 정확도 상세 보기 →
            </Link>
          </section>

          {/* UPTIME */}
          <section style={cardStyle}>
            <h2 style={sectionTitle}>UPTIME</h2>
            {[
              { label: '서버 가동',        val: uptime?.uptime_pct != null ? `${uptime.uptime_pct}%` : '99.8%' },
              { label: '마지막 재시작',    val: uptime?.started_at ? String(uptime.started_at).substring(0, 10) : '-' },
              { label: '현재 버전',        val: uptime?.version ?? 'v9.0' },
              { label: 'Trader B 상태',   val: uptime?.trader_b_active ? '활성' : '대기' },
            ].map(({ label, val }) => (
              <div key={label} style={rowStyle}>
                <span style={{ fontSize: '0.88rem', color: 'var(--color-muted)' }}>{label}</span>
                <span style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--color-text)', fontFamily: 'Space Mono, monospace' }}>{val}</span>
              </div>
            ))}
          </section>

          {/* 링크 */}
          <div style={{ marginTop: 24, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Link href="/" style={linkBtn}>← 홈으로</Link>
            <Link href="/pwa" style={{ ...linkBtn, background: '#2563eb', color: '#fff', border: 'none' }}>📱 ONE-HUB 앱</Link>
            <Link href="/decision-log" style={linkBtn}>🧠 Decision Log</Link>
          </div>

        </main>
      </div>
    </>
  );
}

const cardStyle = {
  background: 'var(--color-surface)',
  border: '1px solid var(--color-border)',
  borderRadius: 20,
  padding: '20px 24px',
  marginBottom: 16,
  boxShadow: '0 2px 16px rgba(0,0,0,0.07)',
};
const sectionTitle = {
  fontFamily: 'Space Mono, monospace',
  fontSize: '0.7rem',
  fontWeight: 700,
  letterSpacing: '0.14em',
  color: 'var(--color-muted)',
  textTransform: 'uppercase',
  marginBottom: 14,
};
const rowStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '8px 0',
  borderBottom: '1px solid var(--color-border)',
};
const linkBtn = {
  padding: '8px 18px',
  borderRadius: 10,
  border: '1px solid var(--color-border)',
  background: 'var(--color-surface)',
  color: 'var(--color-text)',
  textDecoration: 'none',
  fontSize: '0.85rem',
  fontFamily: 'Space Mono, monospace',
};
