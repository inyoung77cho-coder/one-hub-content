import Head from 'next/head';
import Link from 'next/link';
import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { marked } from 'marked';
import PageHero from '../../components/PageHero';
import { SITE, ORG_NAME } from '../../lib/site';

export default function StoryEpisode({ meta, body, prev, next }) {
  const canonical = `${SITE}/story/${meta.slug}`;
  const publishedISO = `${meta.date}T09:00:00+09:00`;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: meta.title,
    description: meta.summary,
    datePublished: publishedISO,
    dateModified: publishedISO,
    inLanguage: 'ko-KR',
    image: `${SITE}/api/og-home`,
    author: { '@type': 'Organization', name: ORG_NAME },
    publisher: { '@type': 'Organization', name: 'ONE-HUB', logo: { '@type': 'ImageObject', url: `${SITE}/icons/icon-512.png` } },
    mainEntityOfPage: { '@type': 'WebPage', '@id': canonical },
    isPartOf: { '@type': 'CreativeWorkSeries', name: '분당 조부장의 자산 이야기' },
  };
  return (
    <>
      <Head>
        <title>{meta.title} | ONE-HUB</title>
        <meta name="description" content={meta.summary} />
        <link rel="canonical" href={canonical} />
        <meta property="og:type" content="article" />
        <meta property="og:title" content={`${meta.title} | ONE-HUB`} />
        <meta property="og:description" content={meta.summary} />
        <meta property="og:url" content={canonical} />
        <meta property="og:image" content={`${SITE}/api/og-home`} />
        <meta property="article:published_time" content={publishedISO} />
        <meta name="twitter:card" content="summary_large_image" />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      </Head>

      <div style={{ minHeight: '100vh', background: '#F4F9FF', fontFamily: 'Pretendard, sans-serif' }}>
        <PageHero
          breadcrumb={[{ label: 'Story', href: '/story' }, { label: `EP.${meta.ep}` }]}
          eyebrow={`분당 조부장의 자산 이야기 · ${meta.date}`}
          title={`${meta.emoji} ${meta.title}`}
          subtitle={meta.summary}
        />
        <main className="oh-main" style={{ maxWidth: 720 }}>
          <article className="ep-body" dangerouslySetInnerHTML={{ __html: body }} />

          <div className="ep-nav">
            <div className="ep-nav-cell">
              {prev && (
                <Link className="ep-nav-link" href={`/story/${prev.slug}`}>
                  <span className="ep-nav-dir">← 이전 화</span>
                  <span className="ep-nav-t">{prev.title}</span>
                </Link>
              )}
            </div>
            <Link className="ep-nav-all" href="/story">전체 화 목록</Link>
            <div className="ep-nav-cell right">
              {next && (
                <Link className="ep-nav-link right" href={`/story/${next.slug}`}>
                  <span className="ep-nav-dir">다음 화 →</span>
                  <span className="ep-nav-t">{next.title}</span>
                </Link>
              )}
            </div>
          </div>

          <div className="ep-cta">
            <h3>조 부장처럼, 세 자산을 한곳에서.</h3>
            <div className="ep-cta-row">
              <a className="ep-btn ep-btn-primary" href="/pwa">🚀 ONE-HUB 앱 시작하기</a>
              <a className="ep-btn ep-btn-ghost" href="/daily">📋 오늘의 운영일지</a>
            </div>
          </div>
        </main>
      </div>

      <style jsx>{`
        .ep-body :global(h2) { font-size: 20px; font-weight: 800; color: #12213B; margin: 34px 0 14px; letter-spacing: -.3px; }
        .ep-body :global(p) { font-size: 16.5px; line-height: 1.95; color: #334155; margin-bottom: 16px; word-break: keep-all; }
        .ep-body :global(blockquote) { border-left: 3px solid #2F6BFF; background: #EAF1FF; margin: 22px 0; padding: 12px 18px; border-radius: 0 10px 10px 0; color: #475569; font-size: 15px; line-height: 1.7; }
        .ep-body :global(em) { color: #64748B; font-style: italic; }
        .ep-nav { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 44px; }
        .ep-nav-cell { flex: 1; }
        .ep-nav-cell.right { text-align: right; }
        .ep-nav-link { display: inline-flex; flex-direction: column; gap: 3px; padding: 12px 16px; background: #fff; border: 1px solid #E8EEF7; border-radius: 12px; max-width: 220px; }
        .ep-nav-link.right { align-items: flex-end; }
        .ep-nav-dir { font-size: 12px; color: #64748B; font-weight: 700; }
        .ep-nav-t { font-size: 13px; color: #12213B; font-weight: 700; }
        .ep-nav-all { font-size: 13px; font-weight: 700; color: #64748B; padding: 11px 16px; background: #fff; border: 1px solid #E8EEF7; border-radius: 12px; white-space: nowrap; }
        .ep-cta { margin-top: 40px; background: linear-gradient(150deg, #12213B, #20375F); color: #fff; border-radius: 24px; padding: 40px 32px; text-align: center; }
        .ep-cta h3 { font-size: 21px; font-weight: 800; margin-bottom: 20px; letter-spacing: -.4px; }
        .ep-cta-row { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
        .ep-btn { display: inline-flex; align-items: center; gap: 7px; font-weight: 700; font-size: 15px; padding: 14px 22px; border-radius: 14px; }
        .ep-btn-primary { background: #fff; color: #12213B; }
        .ep-btn-ghost { background: rgba(255,255,255,.08); color: #fff; border: 1px solid rgba(255,255,255,.22); }
        @media (max-width: 560px) { .ep-nav { flex-direction: column; align-items: stretch; } .ep-nav-cell.right { text-align: left; } .ep-nav-link, .ep-nav-link.right { max-width: 100%; align-items: flex-start; } .ep-nav-all { text-align: center; } }
      `}</style>
    </>
  );
}

function readAll() {
  const dir = path.join(process.cwd(), 'content', 'story');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => {
      const { data } = matter(fs.readFileSync(path.join(dir, f), 'utf8'));
      return { slug: f.replace(/\.md$/, ''), ep: data.ep || 0, title: data.title || f, published: data.published !== false };
    })
    .filter((e) => e.published)
    .sort((a, b) => a.ep - b.ep);
}

export async function getStaticPaths() {
  return { paths: readAll().map((e) => ({ params: { slug: e.slug } })), fallback: false };
}

export async function getStaticProps({ params }) {
  const dir = path.join(process.cwd(), 'content', 'story');
  const raw = fs.readFileSync(path.join(dir, `${params.slug}.md`), 'utf8');
  const { data, content } = matter(raw);
  const all = readAll();
  const idx = all.findIndex((e) => e.slug === params.slug);
  return {
    props: {
      meta: {
        slug: params.slug,
        title: data.title || params.slug,
        ep: data.ep || 0,
        date: data.date || '',
        emoji: data.emoji || '📖',
        summary: data.summary || '',
      },
      body: marked(content),
      prev: idx > 0 ? { slug: all[idx - 1].slug, title: all[idx - 1].title } : null,
      next: idx >= 0 && idx < all.length - 1 ? { slug: all[idx + 1].slug, title: all[idx + 1].title } : null,
    },
  };
}
