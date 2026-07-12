import Head from 'next/head';
import Link from 'next/link';
import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import PageHero from '../components/PageHero';
import { SITE } from '../lib/site';

export default function StoryIndex({ episodes }) {
  const canonical = `${SITE}/story`;
  const description =
    '분당에 자가 한 채, 대기업 18년 차 조 부장. 주식·ETF·부동산을 하나의 AI로 함께 운영하는 이야기 — 매주 한 편씩 이어지는 시리즈.';
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: '분당 조부장의 자산 이야기',
    itemListElement: episodes.map((e, i) => ({
      '@type': 'ListItem', position: i + 1, url: `${SITE}/story/${e.slug}`, name: e.title,
    })),
  };
  return (
    <>
      <Head>
        <title>분당 조부장의 자산 이야기 (시리즈) | ONE-HUB</title>
        <meta name="description" content={description} />
        <link rel="canonical" href={canonical} />
        <meta property="og:type" content="website" />
        <meta property="og:title" content="분당 조부장의 자산 이야기 (시리즈) | ONE-HUB" />
        <meta property="og:description" content={description} />
        <meta property="og:url" content={canonical} />
        <meta property="og:image" content={`${SITE}/api/og-home`} />
        <meta name="twitter:card" content="summary_large_image" />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      </Head>

      <div style={{ minHeight: '100vh', background: '#F4F9FF', fontFamily: 'Pretendard, sans-serif' }}>
        <PageHero
          eyebrow="Story · 머니더버니 노트 · 매주 연재"
          title="분당 조부장의 자산 이야기"
          subtitle="주식·ETF·부동산을 하나의 AI로 굴리기 시작한 조 부장의 이야기. 성공도, 실패도, 아무것도 하지 않은 날까지 — 매주 한 편씩 이어집니다."
        />
        <main className="oh-main" style={{ maxWidth: 760 }}>
          <p className="s-note">
            ※ ONE-HUB의 운영 철학과 실제 판단 방식을 한 인물의 시선으로 풀어낸 <b>예시 서사</b>입니다. 특정 개인의 실화나 수익 보장을 뜻하지 않습니다.
          </p>
          <div className="s-list">
            {episodes.map((e) => (
              <Link className="s-card" key={e.slug} href={`/story/${e.slug}`}>
                <div className="s-emoji">{e.emoji}</div>
                <div className="s-body">
                  <div className="s-meta"><span className="s-ep">EP.{e.ep}</span><span className="s-date">{e.date}</span></div>
                  <div className="s-title">{e.title}</div>
                  <p className="s-summary">{e.summary}</p>
                  <span className="s-read">이 화 읽기 →</span>
                </div>
              </Link>
            ))}
          </div>
        </main>
      </div>

      <style jsx>{`
        .s-note { font-size: 13px; color: #64748B; line-height: 1.7; background: #EAF1FF; border: 1px solid #DCE7FF; border-radius: 14px; padding: 14px 18px; margin-bottom: 30px; }
        .s-note b { color: #2F6BFF; }
        .s-list { display: flex; flex-direction: column; gap: 14px; }
        .s-card { display: flex; gap: 18px; align-items: flex-start; background: #fff; border: 1px solid #E8EEF7; border-radius: 20px; padding: 24px 24px; box-shadow: 0 8px 28px rgba(31,63,120,.07); transition: transform .15s ease, box-shadow .15s ease; }
        .s-card:hover { transform: translateY(-2px); box-shadow: 0 12px 32px rgba(31,63,120,.12); }
        .s-emoji { font-size: 34px; flex-shrink: 0; line-height: 1.1; }
        .s-body { flex: 1; }
        .s-meta { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; }
        .s-ep { font-size: 11px; font-weight: 800; letter-spacing: .06em; color: #2F6BFF; background: #EAF1FF; padding: 3px 8px; border-radius: 6px; }
        .s-date { font-size: 12px; color: #94A3B8; font-family: 'Space Mono', monospace; }
        .s-title { font-size: 18px; font-weight: 800; letter-spacing: -.3px; color: #12213B; margin-bottom: 8px; }
        .s-summary { font-size: 14px; color: #64748B; line-height: 1.65; margin-bottom: 10px; }
        .s-read { font-size: 13px; font-weight: 700; color: #2F6BFF; }
        @media (max-width: 560px) { .s-card { padding: 20px; gap: 14px; } .s-emoji { font-size: 28px; } }
      `}</style>
    </>
  );
}

export async function getStaticProps() {
  const dir = path.join(process.cwd(), 'content', 'story');
  let episodes = [];
  try {
    episodes = fs.readdirSync(dir)
      .filter((f) => f.endsWith('.md'))
      .map((f) => {
        const { data } = matter(fs.readFileSync(path.join(dir, f), 'utf8'));
        return {
          slug: f.replace(/\.md$/, ''),
          title: data.title || f,
          ep: data.ep || 0,
          date: data.date || '',
          emoji: data.emoji || '📖',
          summary: data.summary || '',
          published: data.published !== false,
        };
      })
      .filter((e) => e.published)
      .sort((a, b) => a.ep - b.ep);
  } catch (e) {
    episodes = [];
  }
  return { props: { episodes } };
}
