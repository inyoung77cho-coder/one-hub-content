// components/PageHero.js
// 홈(/) 양식의 상단 네이비 헤더 밴드 — 모든 콘텐츠 페이지 공통 헤더.
// eyebrow(그린 소문자라벨) + 큰 제목(Pretendard) + 보조설명 + optional children(칩/CTA 등)
import Link from 'next/link';

export default function PageHero({ eyebrow, title, subtitle, breadcrumb, children }) {
  return (
    <section className="oh-hero">
      <div className="oh-hero-in">
        {breadcrumb && (
          <div className="oh-hero-crumb">
            {breadcrumb.map((b, i) => (
              <span key={i}>
                {b.href ? <Link href={b.href} className="oh-hero-crumblink">{b.label}</Link> : <span>{b.label}</span>}
                {i < breadcrumb.length - 1 && <span className="oh-hero-crumbsep">/</span>}
              </span>
            ))}
          </div>
        )}
        {eyebrow && <p className="oh-hero-eyebrow">{eyebrow}</p>}
        {title && <h1 className="oh-hero-title">{title}</h1>}
        {subtitle && <p className="oh-hero-sub">{subtitle}</p>}
        {children && <div className="oh-hero-extra">{children}</div>}
      </div>
      <style jsx>{`
        .oh-hero {
          background: linear-gradient(150deg, #12213B, #20375F);
          color: #fff;
          padding: 52px 0 60px;
        }
        .oh-hero-in { max-width: 1080px; margin: 0 auto; padding: 0 22px; }
        .oh-hero-crumb { display: flex; align-items: center; gap: 8px; font-size: 13px; color: #9DB6E6; margin-bottom: 16px; flex-wrap: wrap; }
        .oh-hero-crumb :global(.oh-hero-crumblink) { color: #9DB6E6; text-decoration: none; }
        .oh-hero-crumb :global(.oh-hero-crumblink):hover { color: #fff; }
        .oh-hero-crumbsep { color: #4A5F80; margin: 0 4px; }
        .oh-hero-eyebrow {
          font-size: 12.5px; font-weight: 800; letter-spacing: .5px;
          color: #7FE9C0; margin-bottom: 12px; text-transform: uppercase;
          font-family: 'Pretendard', sans-serif;
        }
        .oh-hero-title {
          font-size: 36px; font-weight: 800; letter-spacing: -1px; line-height: 1.2;
          font-family: 'Pretendard', sans-serif; color: #fff;
        }
        .oh-hero-sub {
          font-size: 15.5px; color: #C7D4EC; margin-top: 14px; line-height: 1.65; max-width: 680px;
          font-family: 'Pretendard', sans-serif;
        }
        .oh-hero-extra { margin-top: 22px; }
        @media (max-width: 640px) { .oh-hero-title { font-size: 27px; } .oh-hero { padding: 40px 0 46px; } }
      `}</style>
    </section>
  );
}
