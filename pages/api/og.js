// pages/api/og.js
// 운영일지(/daily/[date])용 동적 OG 이미지 — 공유 시 그날의 장세·시장온도·인사이트 카드.
// Pages Router + Edge Runtime. 데이터는 페이지가 쿼리스트링으로 넘겨준다(Edge엔 fs 없음).
// 예: /api/og?date=2026-07-08&regime=BEAR&heat=18&grade=COLD&insight=...&trades=1
import { ImageResponse } from 'next/og';

export const config = { runtime: 'edge' };

const REGIME_KO = { BULL: '상승장', BEAR: '하락장', SIDEWAYS: '횡보장' };
const REGIME_EMOJI = { BULL: '📈', BEAR: '📉', SIDEWAYS: '➖' };
const REGIME_ACCENT = { BULL: '#7FE9C0', BEAR: '#FF9BA8', SIDEWAYS: '#9DB6E6' };

// Pretendard Bold(OTF) 자체 fetch. satori는 woff2 미지원 → otf 사용.
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

export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get('date') || '';
  const regime = (searchParams.get('regime') || 'SIDEWAYS').toUpperCase();
  const heat = searchParams.get('heat') || '—';
  const grade = searchParams.get('grade') || '';
  const trades = searchParams.get('trades') || '0';
  const insightRaw = searchParams.get('insight') || '';

  const font = await loadFont();
  const hasKo = !!font; // 한글 폰트 로드 성공 여부

  const regimeKo = REGIME_KO[regime] || '횡보장';
  const emoji = REGIME_EMOJI[regime] || '➖';
  const accent = REGIME_ACCENT[regime] || '#9DB6E6';

  // 폰트 로드 실패 시 한글이 tofu로 깨지므로 영문 폴백으로 대체(카드 자체는 항상 200).
  const headline = hasKo ? `${emoji} ${regimeKo} · 오늘의 AI 자산운영 판단`
                         : `${emoji} ONE-HUB · AI Asset Operation`;
  const insight = hasKo
    ? (insightRaw || '주식·ETF·부동산을 AI가 함께 운영합니다.').slice(0, 90)
    : 'Stocks · ETF · Real estate, operated together by AI.';
  const metricLine = hasKo
    ? `시장온도 ${heat}${grade ? ' · ' + grade : ''} · 매매 ${trades}건`
    : `Heat ${heat}${grade ? ' · ' + grade : ''} · Trades ${trades}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
          justifyContent: 'space-between', padding: '64px 72px', color: '#fff',
          backgroundImage: 'linear-gradient(150deg,#12213B,#20375F)',
          fontFamily: hasKo ? 'Pretendard' : 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 34, fontWeight: 700, letterSpacing: -1, display: 'flex' }}>
            ONE<span style={{ color: '#16C784' }}>·</span>HUB
          </div>
          <div style={{ fontSize: 22, color: '#9DB6E6' }}>{date}</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 30, color: accent, fontWeight: 700, marginBottom: 12, display: 'flex' }}>
            {headline}
          </div>
          <div style={{ fontSize: 46, fontWeight: 700, lineHeight: 1.3, maxWidth: 980, display: 'flex' }}>
            {insight}
          </div>
        </div>

        <div style={{ fontSize: 24, color: '#C7D4EC', display: 'flex' }}>{metricLine}</div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: hasKo ? [{ name: 'Pretendard', data: font, weight: 700, style: 'normal' }] : [],
    }
  );
}
