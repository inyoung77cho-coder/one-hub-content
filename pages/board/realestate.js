import Head from 'next/head';
import Link from 'next/link';
import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import PageHero from '../../components/PageHero';
import { SITE } from '../../lib/site';

const DEAL_COLOR = {
  '매매': { bg: '#EAF1FF', fg: '#2F6BFF' },
  '전세': { bg: '#E7FAF2', fg: '#0E9E6A' },
  '월세': { bg: '#FFF6E5', fg: '#B45309' },
  '분양': { bg: '#EEE9FF', fg: '#6A4CFF' },
};

export default function RealEstateBoard({ listings }) {
  const canonical = `${SITE}/board/realestate`;
  const description = '협력업체가 등록하는 신규 부동산 매물·시세 정보 보드. ONE-HUB 홈에서 새 소식을 먼저 확인하세요.';
  return (
    <>
      <Head>
        <title>부동산 신규 정보 보드 | ONE-HUB</title>
        <meta name="description" content={description} />
        <link rel="canonical" href={canonical} />
        <meta property="og:type" content="website" />
        <meta property="og:title" content="부동산 신규 정보 보드 | ONE-HUB" />
        <meta property="og:description" content={description} />
        <meta property="og:url" content={canonical} />
        <meta property="og:image" content={`${SITE}/api/og-home`} />
        <meta name="twitter:card" content="summary_large_image" />
      </Head>

      <div style={{ minHeight: '100vh', background: '#F4F9FF', fontFamily: 'Pretendard, sans-serif' }}>
        <PageHero
          eyebrow="The Board · 부동산"
          title="🏢 부동산 신규 정보"
          subtitle="ONE-HUB 협력업체가 등록한 신규 매물·시세 소식입니다. 새 정보가 올라오면 이곳에 먼저 게시됩니다."
        />
        <main className="oh-main" style={{ maxWidth: 900 }}>
          <div className="rb-top">
            <span className="rb-count">총 {listings.length}건</span>
            <Link className="rb-add" href="/partners/realestate">협력업체 매물 등록 →</Link>
          </div>

          {listings.length === 0 ? (
            <div className="oh-card" style={{ textAlign: 'center', color: '#64748B', padding: '48px 24px' }}>
              아직 등록된 정보가 없습니다. 협력업체 등록을 통해 첫 매물을 올려주세요.
            </div>
          ) : (
            <div className="rb-grid">
              {listings.map((l) => {
                const dc = DEAL_COLOR[l.deal] || { bg: '#F1F5F9', fg: '#64748B' };
                return (
                  <div className="rb-card" key={l.slug}>
                    <div className="rb-badges">
                      <span className="rb-ptype">{l.ptype}</span>
                      {l.deal && <span className="rb-deal" style={{ background: dc.bg, color: dc.fg }}>{l.deal}</span>}
                      {l.sample && <span className="rb-sample">예시</span>}
                    </div>
                    <div className="rb-title">{l.title}</div>
                    <div className="rb-region">📍 {l.region}</div>
                    <div className="rb-price">{l.price}</div>
                    <div className="rb-meta">
                      {l.area && <span>전용 {l.area}㎡</span>}
                      {l.partner && <span>· {l.partner}</span>}
                    </div>
                    {l.summary && <p className="rb-summary">{l.summary}</p>}
                    <div className="rb-date">{l.date}</div>
                  </div>
                );
              })}
            </div>
          )}

          <p className="rb-legal">
            ※ 게시 정보는 협력업체가 제공한 자료이며 ONE-HUB는 정확성을 보증하지 않습니다. 거래 전 현장·서류 확인은 이용자 책임입니다.
            {listings.some((l) => l.sample) && ' 「예시」 표기 항목은 보드 형식 안내용 샘플입니다.'}
          </p>
        </main>
      </div>

      <style jsx>{`
        .rb-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 18px; }
        .rb-count { font-size: 14px; font-weight: 700; color: #475569; }
        .rb-add { font-size: 13px; font-weight: 700; color: #2F6BFF; }
        .rb-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; }
        .rb-card { background: #fff; border: 1px solid #E8EEF7; border-radius: 20px; padding: 22px 22px; box-shadow: 0 8px 28px rgba(31,63,120,.07); }
        .rb-badges { display: flex; gap: 6px; margin-bottom: 12px; flex-wrap: wrap; }
        .rb-ptype { font-size: 11px; font-weight: 800; padding: 4px 9px; border-radius: 7px; background: #F1F5F9; color: #475569; }
        .rb-deal { font-size: 11px; font-weight: 800; padding: 4px 9px; border-radius: 7px; }
        .rb-sample { font-size: 10px; font-weight: 800; padding: 4px 8px; border-radius: 7px; background: #FEF3C7; color: #B45309; }
        .rb-title { font-size: 16.5px; font-weight: 800; color: #12213B; letter-spacing: -.3px; margin-bottom: 6px; }
        .rb-region { font-size: 13px; color: #64748B; margin-bottom: 12px; }
        .rb-price { font-size: 20px; font-weight: 800; color: #2F6BFF; letter-spacing: -.4px; margin-bottom: 6px; }
        .rb-meta { font-size: 12.5px; color: #94A3B8; display: flex; gap: 4px; margin-bottom: 12px; }
        .rb-summary { font-size: 13.5px; color: #475569; line-height: 1.6; margin-bottom: 14px; }
        .rb-date { font-size: 12px; color: #94A3B8; font-family: 'Space Mono', monospace; }
        .rb-legal { font-size: 12px; color: #94A3B8; line-height: 1.7; margin-top: 26px; }
        @media (max-width: 640px) { .rb-grid { grid-template-columns: 1fr; } }
      `}</style>
    </>
  );
}

export async function getStaticProps() {
  const dir = path.join(process.cwd(), 'content', 'listings');
  let listings = [];
  try {
    listings = fs.readdirSync(dir)
      .filter((f) => f.endsWith('.md'))
      .map((f) => {
        const { data } = matter(fs.readFileSync(path.join(dir, f), 'utf8'));
        return {
          slug: f.replace(/\.md$/, ''),
          title: data.title || '', region: data.region || '', ptype: data.ptype || '기타',
          deal: data.deal || '', price: data.price || '가격 문의', area: data.area || '',
          partner: data.partner || '', date: data.date || '', summary: data.summary || '',
          sample: !!data.sample, published: data.published !== false,
        };
      })
      .filter((l) => l.published)
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  } catch (e) {
    listings = [];
  }
  return { props: { listings } };
}
