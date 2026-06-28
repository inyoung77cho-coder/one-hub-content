import Link from 'next/link';

export default function CTABar() {
  return (
    <div style={{
      background: '#f0f6ff',
      border: '1px solid #dbeafe',
      borderRadius: 16,
      padding: '24px 20px',
      margin: '40px 0 24px',
      textAlign: 'center',
    }}>
      <p style={{ fontSize: '0.95rem', fontWeight: 700, color: '#1e40af', marginBottom: 16 }}>
        ONE-HUB를 앱으로 사용하세요
      </p>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: 10,
        maxWidth: 400,
        margin: '0 auto',
      }}>
        {[
          { href: '/pwa',     label: '📱 PWA 설치' },
          { href: '/pwa',     label: '✈️ 텔레그램' },
          { href: '/pwa?tab=recommend', label: '⭐ 추천 보기' },
          { href: '/weekly',  label: '📋 Weekly' },
        ].map(({ href, label }) => (
          <Link key={label} href={href} style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: 44,
            borderRadius: 10,
            background: '#fff',
            border: '1px solid #bfdbfe',
            color: '#1e40af',
            textDecoration: 'none',
            fontSize: '0.88rem',
            fontWeight: 600,
          }}>
            {label}
          </Link>
        ))}
      </div>
    </div>
  );
}
