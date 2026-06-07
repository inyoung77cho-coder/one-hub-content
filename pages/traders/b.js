import Head from 'next/head';
import Link from 'next/link';
import { useState, useEffect } from 'react';

export default function TraderB() {
  const [traderData, setTraderData] = useState(null);
  const [traderA, setTraderA] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ENGINE_API = process.env.NEXT_PUBLIC_ENGINE_API_URL || 'http://54.180.54.132:5001';

    // Trader A 데이터
    fetch(`${ENGINE_API}/api/engine-status`)
      .then(r => r.json())
      .then(d => setTraderA(d))
      .catch(() => {});

    // Trader B 데이터
    fetch(`${ENGINE_API}/api/engine-status?trader=B`)
      .then(r => r.json())
      .then(d => { setTraderData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  return (
    <>
      <Head>
        <title>Trader B — ONE-HUB</title>
        <meta name="description" content="ONE-HUB Trader B 운영 현황" />
        <link href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Syne:wght@400;600;700&display=swap" rel="stylesheet" />
      </Head>

      <div className="page-wrapper">
        <main className="main">

          {/* 헤더 */}
          <div style={{ marginBottom: '2rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '0.5rem' }}>
              <h1 style={{ fontFamily: 'Syne, sans-serif', fontSize: '1.75rem', fontWeight: 700 }}>
                Trader B
              </h1>
              <span style={{
                fontSize: '11px', fontWeight: 600, padding: '3px 10px',
                borderRadius: '20px', background: '#E1F5EE', color: '#0F6E56',
                border: '1px solid #5DCAA5'
              }}>베타 참여자</span>
            </div>
            <p style={{ fontSize: '0.875rem', color: 'var(--color-muted)', lineHeight: 1.7 }}>
              ONE-HUB AI 엔진을 함께 사용하는 베타 트레이더입니다.
              동일한 AI 판단 로직으로 각자의 계좌에서 매매가 실행됩니다.
            </p>
          </div>

          {/* A vs B 비교 카드 */}
          <section style={{ marginBottom: '2rem' }}>
            <h2 style={{ fontFamily: 'Syne, sans-serif', fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>
              Trader A vs Trader B — 오늘 현황
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>

              {/* Trader A */}
              <div style={{
                background: '#E6F1FB', border: '1px solid #85B7EB',
                borderRadius: '12px', padding: '1.25rem'
              }}>
                <div style={{ fontSize: '11px', fontWeight: 600, color: '#185FA5', marginBottom: '8px', fontFamily: 'Space Mono, monospace' }}>
                  TRADER A — 운영자
                </div>
                {traderA ? (
                  <>
                    <div style={{ fontSize: '0.875rem', color: '#0C447C', marginBottom: '4px' }}>
                      엔진: {traderA.engine?.status === 'running' ? '🟢 실행 중' : '🔴 중지'}
                    </div>
                    <div style={{ fontSize: '0.875rem', color: '#0C447C', marginBottom: '4px' }}>
                      버전: {traderA.version || 'v8.0'}
                    </div>
                    <div style={{ fontSize: '0.875rem', color: '#0C447C' }}>
                      보유 종목: {traderA.holdings?.length || 0}개
                    </div>
                  </>
                ) : (
                  <div style={{ fontSize: '0.875rem', color: '#185FA5' }}>로딩 중...</div>
                )}
              </div>

              {/* Trader B */}
              <div style={{
                background: '#E1F5EE', border: '1px solid #5DCAA5',
                borderRadius: '12px', padding: '1.25rem'
              }}>
                <div style={{ fontSize: '11px', fontWeight: 600, color: '#0F6E56', marginBottom: '8px', fontFamily: 'Space Mono, monospace' }}>
                  TRADER B — 베타 참여자
                </div>
                {loading ? (
                  <div style={{ fontSize: '0.875rem', color: '#0F6E56' }}>로딩 중...</div>
                ) : traderData ? (
                  <>
                    <div style={{ fontSize: '0.875rem', color: '#085041', marginBottom: '4px' }}>
                      엔진: {traderData.engine?.status === 'running' ? '🟢 실행 중' : '⏸️ 대기 중'}
                    </div>
                    <div style={{ fontSize: '0.875rem', color: '#085041', marginBottom: '4px' }}>
                      버전: {traderData.version || 'v8.0'}
                    </div>
                    <div style={{ fontSize: '0.875rem', color: '#085041' }}>
                      보유 종목: {traderData.holdings?.length || 0}개
                    </div>
                  </>
                ) : (
                  <div style={{ fontSize: '0.875rem', color: '#0F6E56' }}>
                    ⏸️ API 키 등록 후 활성화됩니다.
                  </div>
                )}
              </div>

            </div>
          </section>

          {/* 안내 섹션 */}
          <section style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: '12px', padding: '1.5rem',
            marginBottom: '2rem'
          }}>
            <h2 style={{ fontFamily: 'Syne, sans-serif', fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>
              📋 Trader B 참여 방법
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {[
                { step: '01', title: '한국투자증권 계좌 개설', desc: '아직 계좌가 없다면 KIS 앱에서 개설합니다.' },
                { step: '02', title: 'KIS API 신청', desc: 'KIS 앱 → 마이페이지 → KIS Developers → API 신청. App Key + App Secret 발급.' },
                { step: '03', title: 'API 키 등록', desc: '아래 버튼을 눌러 API 키를 입력합니다. AES-256으로 암호화되어 운영자도 볼 수 없습니다.' },
                { step: '04', title: '자동매매 시작', desc: 'AI가 매일 9시 5분 자동으로 매매를 실행합니다. 텔레그램으로 실시간 알림을 받습니다.' },
              ].map(item => (
                <div key={item.step} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                  <span style={{
                    fontFamily: 'Space Mono, monospace', fontSize: '11px', fontWeight: 700,
                    color: '#9A9690', minWidth: '24px', marginTop: '2px'
                  }}>{item.step}</span>
                  <div>
                    <div style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '2px' }}>{item.title}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--color-muted)', lineHeight: 1.6 }}>{item.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* API 키 등록 버튼 */}
          <div style={{ textAlign: 'center' }}>
            <Link href="/settings/api-key">
              <button style={{
                padding: '14px 32px', borderRadius: '8px',
                background: '#1A1A1A', color: '#F8F7F2',
                border: 'none', fontSize: '1rem', fontWeight: 600,
                cursor: 'pointer', fontFamily: 'Syne, sans-serif'
              }}>
                🔐 API 키 등록하기
              </button>
            </Link>
            <p style={{ marginTop: '0.75rem', fontSize: '0.75rem', color: 'var(--color-muted)' }}>
              등록 후 다음 영업일부터 자동매매가 시작됩니다.
            </p>
          </div>

        </main>
      </div>
    </>
  );
}