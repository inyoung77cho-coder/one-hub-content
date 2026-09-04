// [S29-10] 공개 회차 페이지 — 로그인 밖(www)에서 읽힌다. 유입은 여기서만 일어난다.
//   pages/story/[slug].js 패턴 그대로(getStaticProps + OG + CTA). content/episodes/*.md 사용.
//   summary 는 3줄 배열 → og:description 은 join. 영상 있으면 임베드.
import Head from 'next/head';
import Link from 'next/link';
import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import PageHero from '../../components/PageHero';
import { SITE, ORG_NAME } from '../../lib/site';

export default function EpisodePublic({ meta }) {
  const canonical = `${SITE}/episodes/${meta.slug}`;
  const desc = (meta.summary || []).join(' ') || 'ONE-HUB 이번 주 회차';
  const publishedISO = `${meta.date}T09:00:00+09:00`;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: meta.title,
    description: desc,
    datePublished: publishedISO,
    inLanguage: 'ko-KR',
    image: `${SITE}/api/og-home`,
    author: { '@type': 'Organization', name: ORG_NAME },
    publisher: { '@type': 'Organization', name: 'ONE-HUB', logo: { '@type': 'ImageObject', url: `${SITE}/icons/icon-512.png` } },
    mainEntityOfPage: { '@type': 'WebPage', '@id': canonical },
  };
  return (
    <>
      <Head>
        <title>{meta.title} | ONE-HUB</title>
        <meta name="description" content={desc} />
        <link rel="canonical" href={canonical} />
        <meta property="og:type" content="article" />
        <meta property="og:title" content={`${meta.title} | ONE-HUB`} />
        <meta property="og:description" content={desc} />
        <meta property="og:url" content={canonical} />
        <meta property="og:image" content={`${SITE}/api/og-home`} />
        <meta property="article:published_time" content={publishedISO} />
        <meta name="twitter:card" content="summary_large_image" />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      </Head>

      <div style={{ minHeight: '100vh', background: '#F4F9FF', fontFamily: 'Pretendard, sans-serif' }}>
        <PageHero
          breadcrumb={[{ label: '회차', href: '/episodes' }, { label: meta.week || meta.date }]}
          eyebrow={`ONE-HUB 회차 · ${meta.date}`}
          title={meta.title}
          subtitle={desc}
        />
        <main className="oh-main" style={{ maxWidth: 720 }}>
          {meta.youtube_id ? (
            <div className="ep-embed">
              <iframe src={`https://www.youtube-nocookie.com/embed/${meta.youtube_id}`}
                title={meta.title} loading="lazy" allowFullScreen
                allow="accelerometer; encrypted-media; picture-in-picture" />
            </div>
          ) : (
            <div className="ep-embed ep-embed-empty">영상은 준비 중입니다 · 아래 요약을 먼저 보세요</div>
          )}

          {Array.isArray(meta.summary) && meta.summary.length > 0 && (
            <ul className="ep-sum">{meta.summary.map((s, i) => <li key={i}>{s}</li>)}</ul>
          )}

          {Array.isArray(meta.figures) && meta.figures.length > 0 && (
            <div className="ep-figs">
              {meta.figures.map((f, i) => (
                <div className="ep-fig" key={i}>
                  <b>{f.value}</b><span>{f.label}{f.source ? ` · ${f.source}` : ''}</span>
                </div>
              ))}
            </div>
          )}

          <div className="ep-cta">
            <h3>이 숫자, 내 자산으로 보면?</h3>
            <div className="ep-cta-row">
              <a className="ep-btn ep-btn-primary" href="https://app.one-hub.kr/pwa">내 자산으로 보기 →</a>
              <Link className="ep-btn ep-btn-ghost" href="/episodes">지난 회차</Link>
            </div>
          </div>
        </main>
      </div>

      <style jsx>{`
        .ep-embed { position: relative; width: 100%; aspect-ratio: 16 / 9; border-radius: 14px; overflow: hidden; background: #E8EEF7; }
        .ep-embed :global(iframe) { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; }
        .ep-embed-empty { display: grid; place-items: center; text-align: center; padding: 20px; color: #64748B; font-size: 15px; aspect-ratio: auto; min-height: 120px; }
        .ep-sum { margin: 20px 0 0; padding-left: 20px; }
        .ep-sum li { font-size: 16.5px; line-height: 1.9; color: #334155; margin-bottom: 8px; word-break: keep-all; }
        .ep-figs { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 18px; }
        .ep-fig { background: #fff; border: 1px solid #E8EEF7; border-radius: 12px; padding: 12px 16px; }
        .ep-fig b { display: block; font-size: 18px; color: #12213B; font-weight: 800; }
        .ep-fig span { font-size: 12px; color: #64748B; }
        .ep-cta { margin-top: 40px; background: linear-gradient(150deg, #12213B, #20375F); color: #fff; border-radius: 24px; padding: 40px 32px; text-align: center; }
        .ep-cta h3 { font-size: 21px; font-weight: 800; margin-bottom: 20px; letter-spacing: -.4px; }
        .ep-cta-row { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
        .ep-btn { display: inline-flex; align-items: center; gap: 7px; font-weight: 700; font-size: 15px; padding: 14px 22px; border-radius: 14px; }
        .ep-btn-primary { background: #fff; color: #12213B; }
        .ep-btn-ghost { background: rgba(255,255,255,.08); color: #fff; border: 1px solid rgba(255,255,255,.22); }
      `}</style>
    </>
  );
}

function readAll() {
  const dir = path.join(process.cwd(), 'content', 'episodes');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => {
      const { data } = matter(fs.readFileSync(path.join(dir, f), 'utf8'));
      return { slug: f.replace(/\.md$/, ''), date: data.date || '', published: data.published !== false };
    })
    .filter((e) => e.published)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

export async function getStaticPaths() {
  return { paths: readAll().map((e) => ({ params: { slug: e.slug } })), fallback: false };
}

export async function getStaticProps({ params }) {
  const dir = path.join(process.cwd(), 'content', 'episodes');
  const { data } = matter(fs.readFileSync(path.join(dir, `${params.slug}.md`), 'utf8'));
  return {
    props: {
      meta: {
        slug: params.slug,
        title: data.title || params.slug,
        date: data.date || '',
        week: data.week || '',
        youtube_id: data.youtube_id || '',
        summary: Array.isArray(data.summary) ? data.summary : (data.summary ? [String(data.summary)] : []),
        figures: Array.isArray(data.figures) ? data.figures : [],
      },
    },
  };
}
