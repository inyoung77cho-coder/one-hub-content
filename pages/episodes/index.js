// [S29-10] 공개 회차 목록 — 로그인 밖(www). 회차 상세로 연결.
import Head from 'next/head';
import Link from 'next/link';
import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import PageHero from '../../components/PageHero';
import { SITE } from '../../lib/site';

export default function EpisodesIndex({ episodes = [] }) {
  const canonical = `${SITE}/episodes`;
  return (
    <>
      <Head>
        <title>회차 | ONE-HUB</title>
        <meta name="description" content="ONE-HUB 주간 회차 — 앱의 데이터로 만든 이야기." />
        <link rel="canonical" href={canonical} />
        <meta property="og:title" content="회차 | ONE-HUB" />
        <meta property="og:description" content="앱의 데이터로 만든 주간 이야기." />
        <meta property="og:url" content={canonical} />
        <meta property="og:image" content={`${SITE}/api/og-home`} />
      </Head>
      <div style={{ minHeight: '100vh', background: '#F4F9FF', fontFamily: 'Pretendard, sans-serif' }}>
        <PageHero
          breadcrumb={[{ label: '회차' }]}
          eyebrow="ONE-HUB"
          title="주간 회차"
          subtitle="매주 토요일, 이 앱의 데이터로 만든 한 편."
        />
        <main className="oh-main" style={{ maxWidth: 720 }}>
          {episodes.length === 0 ? (
            <div className="ep-empty">아직 공개된 회차가 없습니다.</div>
          ) : (
            <div className="ep-list">
              {episodes.map((e) => (
                <Link className="ep-row" key={e.slug} href={`/episodes/${e.slug}`}>
                  <span className="ep-date">{e.date}</span>
                  <span className="ep-title">{e.title}</span>
                  {e.summary[0] && <span className="ep-sub">{e.summary[0]}</span>}
                </Link>
              ))}
            </div>
          )}
        </main>
      </div>
      <style jsx>{`
        .ep-list { display: flex; flex-direction: column; gap: 12px; }
        .ep-row { display: block; background: #fff; border: 1px solid #E8EEF7; border-radius: 14px; padding: 18px 20px; }
        .ep-date { font-size: 12px; color: #64748B; font-weight: 700; }
        .ep-title { display: block; font-size: 17px; font-weight: 800; color: #12213B; margin: 4px 0; letter-spacing: -.3px; word-break: keep-all; }
        .ep-sub { font-size: 14px; color: #475569; line-height: 1.6; word-break: keep-all; }
        .ep-empty { background: #fff; border: 1px solid #E8EEF7; border-radius: 14px; padding: 40px; text-align: center; color: #64748B; }
      `}</style>
    </>
  );
}

export async function getStaticProps() {
  const dir = path.join(process.cwd(), 'content', 'episodes');
  let episodes = [];
  try {
    if (fs.existsSync(dir)) {
      episodes = fs.readdirSync(dir).filter((f) => f.endsWith('.md')).map((f) => {
        const { data } = matter(fs.readFileSync(path.join(dir, f), 'utf8'));
        return {
          slug: f.replace(/\.md$/, ''),
          title: data.title || f,
          date: data.date || '',
          summary: Array.isArray(data.summary) ? data.summary : [],
          published: data.published !== false,
        };
      }).filter((e) => e.published).sort((a, b) => (a.date < b.date ? 1 : -1));
    }
  } catch { episodes = []; }
  return { props: { episodes } };
}
