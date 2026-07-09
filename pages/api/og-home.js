// pages/api/og-home.js
// 홈페이지(브랜드) OG 커버 — 정적 PNG 대신 이 Edge 라우트를 og:image로 연결.
// 자산 관리 불필요 + 항상 온브랜드. (일별 카드는 /api/og 참고)
import { ImageResponse } from 'next/og';

export const config = { runtime: 'edge' };

async function loadFont() {
  try {
    const url =
      'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/packages/pretendard/dist/public/static/Pretendard-Bold.otf';
    const res = await fetch(url, { cache: 'force-cache' });
    if (!res.ok) return null;
    return await res.arrayBuffer();
  } catch {
    return null;
  }
}

export default async function handler() {
  const font = await loadFont();
  const hasKo = !!font;

  const tagline = hasKo ? '주식 · ETF · 부동산을 AI가 함께 운영합니다.'
                        : 'Stocks · ETF · Real estate, operated together by AI.';
  const sub = hasKo ? 'AI가 후보를 선별하고 · 사람이 결정하고 · 매일 기록합니다'
                    : 'AI screens · humans decide · logged every day';
  const chips = hasKo ? ['📈 주식', '📊 ETF', '🏢 부동산'] : ['Stocks', 'ETF', 'Real estate'];

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
          justifyContent: 'space-between', padding: '68px 72px', color: '#fff',
          backgroundImage: 'linear-gradient(150deg,#12213B,#20375F)',
          fontFamily: hasKo ? 'Pretendard' : 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 38, fontWeight: 700, letterSpacing: -1, display: 'flex' }}>
            ONE<span style={{ color: '#16C784' }}>·</span>HUB
          </div>
          <div style={{ fontSize: 22, color: '#9DB6E6' }}>AI 자산운영 플랫폼</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 26, color: '#7FE9C0', fontWeight: 700, marginBottom: 18, display: 'flex' }}>
            {sub}
          </div>
          <div style={{ fontSize: 60, fontWeight: 700, lineHeight: 1.25, maxWidth: 1010, display: 'flex' }}>
            {tagline}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 16 }}>
          {chips.map((c) => (
            <div
              key={c}
              style={{
                display: 'flex', fontSize: 26, color: '#C7D4EC', fontWeight: 700,
                padding: '12px 22px', borderRadius: 14,
                background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)',
              }}
            >
              {c}
            </div>
          ))}
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: hasKo ? [{ name: 'Pretendard', data: font, weight: 700, style: 'normal' }] : [],
    }
  );
}
