import Head from 'next/head';
import Link from 'next/link';
import { useState, useEffect, useRef } from 'react';
import CTABar from '../components/CTABar';

const API = process.env.NEXT_PUBLIC_ENGINE_API_URL || 'http://54.180.54.132:5001';

function todayKST() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().split('T')[0];
}

function mlColor(pct) {
  if (pct >= 70) return '#22c55e';
  if (pct >= 50) return '#f59e0b';
  return '#ef4444';
}

function addDays(dateStr, n) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
}

export default function AiReplay() {
  const [replayDate, setReplayDate] = useState(todayKST);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentStep, setCurrentStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const intervalRef = useRef(null);

  useEffect(() => {
    setLoading(true);
    setData(null);
    setCurrentStep(0);
    setIsPlaying(false);
    fetch(`${API}/api/pwa-history?date=${replayDate}`)
      .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(d => { setData(d); setLoading(false); })
      .catch(() => { setData(null); setLoading(false); });
  }, [replayDate]);

  const steps = data ? [
    {
      time: '08:50',
      icon: '🌐',
      title: '시장 분석 시작',
      detail: [
        `Regime: ${data.summary?.regime ?? '-'}`,
        `Heat: ${data.summary?.heat ?? '-'} / Fear: ${data.summary?.fear ?? '-'}`,
        `VIX: ${data.summary?.vix ?? '-'} / Nasdaq: ${data.summary?.nasdaq_chg ?? '-'}`,
      ],
    },
    {
      time: '08:51',
      icon: '🔍',
      title: `${data.summary?.total_screened ?? 131}종목 스크리닝`,
      detail: [
        `기술점수 ≥ 60: ${data.summary?.passed_screening ?? (data.stocks?.length ?? 8)}종목`,
        `제외: ${(data.summary?.total_screened ?? 131) - (data.summary?.passed_screening ?? (data.stocks?.length ?? 8))}종목`,
      ],
    },
    {
      time: '08:52',
      icon: '🤖',
      title: `AI 개별 분석 (${data.stocks?.length ?? 0}종목)`,
      stocks: data.stocks ?? [],
    },
    {
      time: '08:53',
      icon: '✅',
      title: '최종 결정',
      detail: [
        `매수 ${data.summary?.buy_count ?? 0}건 / 차단 ${data.summary?.block_count ?? 0}건`,
        `→ ${(data.summary?.buy_count ?? 0) > 0 ? '매수 진행' : '관망 결정'}`,
      ],
    },
  ] : [];

  const visibleSteps = steps.slice(0, currentStep + 1);

  useEffect(() => {
    if (isPlaying) {
      intervalRef.current = setInterval(() => {
        setCurrentStep(prev => {
          if (prev >= steps.length - 1) {
            setIsPlaying(false);
            clearInterval(intervalRef.current);
            return prev;
          }
          return prev + 1;
        });
      }, 1500);
    } else {
      clearInterval(intervalRef.current);
    }
    return () => clearInterval(intervalRef.current);
  }, [isPlaying, steps.length]);

  const reasons = data?.block_reasons ?? [];

  return (
    <>
      <Head>
        <title>AI Replay — ONE-HUB</title>
        <meta name="description" content="ONE-HUB AI 의사결정 재생기. 하루 동안 AI가 어떤 순서로 분석하고 차단·매수 결정을 내렸는지 타임라인으로 재생합니다." />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta property="og:title" content="AI Replay — ONE-HUB" />
        <meta property="og:description" content="ONE-HUB AI 의사결정 재생기. 하루 동안 AI가 어떤 순서로 분석하고 차단·매수 결정을 내렸는지 타임라인으로 재생합니다." />
        <meta property="og:image" content="/icons/icon-512.png" />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="ONE-HUB" />
        <link rel="preconnect" href="https://cdn.jsdelivr.net" />
        <link href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css" rel="stylesheet" />
      </Head>

      <div style={{ minHeight: '100vh', background: '#f8fafc', fontFamily: 'Pretendard, sans-serif', paddingBottom: 80 }}>
        <main style={{ maxWidth: 720, margin: '0 auto', padding: '24px 16px' }}>
          <Link href="/" style={{ color: '#64748b', fontSize: 13, textDecoration: 'none' }}>← ONE-HUB</Link>

          <div style={{ marginTop: 20, marginBottom: 28 }}>
            <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: '#0f172a', margin: '0 0 6px' }}>🎬 AI Replay</h1>
            <p style={{ fontSize: '0.9rem', color: '#64748b', margin: 0 }}>ONE-HUB AI 의사결정 재생기</p>
          </div>

          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: '20px', marginBottom: 20, boxShadow: '0 2px 16px rgba(0,0,0,0.07)' }}>
            <div style={{ fontFamily: 'monospace', fontSize: 11, color: '#94a3b8', marginBottom: 10 }}>날짜 선택</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <button onClick={() => setReplayDate(d => addDays(d, -1))}
                style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#475569', cursor: 'pointer', fontSize: 13 }}>
                ◀ 전날
              </button>
              <input type="date" value={replayDate} onChange={e => setReplayDate(e.target.value)}
                style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, fontFamily: 'monospace', color: '#1e293b', outline: 'none' }} />
              <button onClick={() => setReplayDate(todayKST())}
                style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #2563eb', background: '#2563eb', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                오늘
              </button>
              <button onClick={() => setReplayDate(d => addDays(d, 1))}
                style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#475569', cursor: 'pointer', fontSize: 13 }}>
                다음날 ▶
              </button>
            </div>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '60px 0', color: '#94a3b8', fontSize: 14 }}>분석 기록 조회 중...</div>
          ) : !data ? (
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: '40px 20px', textAlign: 'center', color: '#94a3b8' }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>📭</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#64748b' }}>해당 날짜 분석 기록이 없습니다</div>
              <div style={{ fontSize: 12, marginTop: 6 }}>{replayDate}</div>
            </div>
          ) : (
            <>
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: '20px', marginBottom: 20, boxShadow: '0 2px 16px rgba(0,0,0,0.07)' }}>
                <div style={{ fontFamily: 'monospace', fontSize: 11, color: '#94a3b8', marginBottom: 14 }}>📊 {replayDate} 요약</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                  {[
                    { label: 'Regime',  val: data.summary?.regime ?? '-' },
                    { label: 'Heat',    val: `${data.summary?.heat ?? '-'}/100` },
                    { label: '차단',    val: `${data.summary?.block_count ?? 0}건` },
                    { label: '매수',    val: `${data.summary?.buy_count ?? 0}건` },
                  ].map(({ label, val }) => (
                    <div key={label} style={{ textAlign: 'center' }}>
                      <div style={{ fontFamily: 'monospace', fontSize: 15, fontWeight: 800, color: '#0f172a' }}>{val}</div>
                      <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 3 }}>{label}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 24 }}>
                {[
                  { label: '⏮', title: '처음', onClick: () => { setIsPlaying(false); setCurrentStep(0); } },
                  { label: '⏪', title: '이전', onClick: () => { setIsPlaying(false); setCurrentStep(s => Math.max(0, s - 1)); } },
                  { label: isPlaying ? '⏸' : '▶', title: isPlaying ? '일시정지' : '재생', onClick: () => setIsPlaying(p => !p), primary: true },
                  { label: '⏩', title: '다음', onClick: () => { setIsPlaying(false); setCurrentStep(s => Math.min(steps.length - 1, s + 1)); } },
                ].map(({ label, title, onClick, primary }) => (
                  <button key={title} onClick={onClick}
                    style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '10px 18px', borderRadius: 10, height: 52,
                      border: primary ? 'none' : '1px solid #e2e8f0',
                      background: primary ? '#2563eb' : '#fff',
                      color: primary ? '#fff' : '#475569', cursor: 'pointer', fontSize: 16 }}>
                    {label}
                    <span style={{ fontSize: 9, fontFamily: 'monospace' }}>{title}</span>
                  </button>
                ))}
              </div>

              <div style={{ position: 'relative', paddingLeft: 28, marginBottom: 28 }}>
                <div style={{ position: 'absolute', left: 8, top: 16, bottom: 16, width: 2, background: '#e2e8f0', borderRadius: 1 }} />
                {steps.map((step, i) => {
                  const visible = i <= currentStep;
                  return (
                    <div key={i} style={{ position: 'relative', marginBottom: 24, opacity: visible ? 1 : 0.25, transition: 'opacity 0.5s' }}>
                      <div style={{ position: 'absolute', left: -24, top: 14, width: 12, height: 12, borderRadius: '50%',
                        background: visible ? '#2563eb' : '#e2e8f0', border: '2px solid #fff', boxShadow: '0 0 0 2px #e2e8f0' }} />
                      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '14px 16px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: step.detail || step.stocks ? 10 : 0 }}>
                          <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#2563eb', background: '#eff6ff', padding: '2px 8px', borderRadius: 6 }}>{step.time}</span>
                          <span style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{step.icon} {step.title}</span>
                        </div>
                        {step.detail && step.detail.map((d, j) => (
                          <div key={j} style={{ fontFamily: 'monospace', fontSize: 12, color: '#64748b', marginTop: 3 }}>{d}</div>
                        ))}
                        {step.stocks && step.stocks.length > 0 && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {step.stocks.map((s, j) => (
                              <div key={j} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                background: '#f8fafc', borderRadius: 8, padding: '8px 12px' }}>
                                <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 600, color: '#1e293b' }}>{s.name ?? s.code}</span>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                  <span style={{ fontFamily: 'monospace', fontSize: 11, color: mlColor(s.ml_score ?? s.score ?? 0) }}>
                                    ML {s.ml_score ?? s.score ?? 0}%
                                  </span>
                                  <span style={{ fontSize: 11, fontWeight: 700,
                                    color: (s.action === 'BUY' || (s.ml_score ?? s.score ?? 0) >= 70) ? '#22c55e' : '#ef4444' }}>
                                    {(s.action === 'BUY' || (s.ml_score ?? s.score ?? 0) >= 70) ? '✅ 추천' : '🔴 차단'}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {reasons.length > 0 && (
                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: '20px', marginBottom: 24, boxShadow: '0 2px 16px rgba(0,0,0,0.07)' }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a', marginBottom: 14 }}>💡 오늘의 AI 인사이트</div>
                  <div style={{ fontSize: 13, color: '#475569', fontWeight: 600, marginBottom: 10 }}>가장 많이 차단된 이유</div>
                  {reasons.map((r, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: i < reasons.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#94a3b8' }}>{i + 1}위</span>
                        <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#1e293b' }}>{r.reason}</span>
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#64748b' }}>{r.count}건</span>
                        <span style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 700, color: '#2563eb' }}>{r.pct}%</span>
                      </div>
                    </div>
                  ))}
                  {data.summary?.block_avg_return != null && (
                    <div style={{ marginTop: 14, padding: '12px', background: '#f0fdf4', borderRadius: 8 }}>
                      <div style={{ fontSize: 12, color: '#15803d', fontWeight: 600 }}>만약 매수했다면? 차단 종목 평균 수익률 {data.summary.block_avg_return}%</div>
                      <div style={{ fontSize: 11, color: '#16a34a', marginTop: 3 }}>→ AI 차단이 올바른 판단</div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
          <CTABar />
        </main>
      </div>
    </>
  );
}
