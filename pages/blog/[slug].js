import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { marked } from 'marked';
import Link from 'next/link';
import Head from 'next/head';

const TAG_COLORS = {
  ai: '#2563eb', ml: '#7c3aed', stock: '#16a34a', macro: '#d97706',
  quant: '#0891b2', risk: '#dc2626', etf: '#059669', default: '#64748b',
};
function tagColor(tag) {
  return TAG_COLORS[(tag || '').toLowerCase()] || TAG_COLORS.default;
}

export default function BlogPost({ meta, body, prevPost, nextPost }) {
  const wordsPerMin = 200;
  const wordCount = body.replace(/<[^>]+>/g, '').split(/\s+/).length;
  const readTime = Math.max(1, Math.round(wordCount / wordsPerMin));
  const bannerColor = tagColor(meta.tags?.[0]);

  return (
    <>
      <Head>
        <title>{meta.title} — ONE-HUB Blog</title>
        <meta name="description" content={meta.description} />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta property="og:title" content={meta.title} />
        <meta property="og:description" content={meta.description} />
        <link href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css" rel="stylesheet" />
      </Head>

      <div style={{ minHeight: '100vh', background: '#f8fafc', fontFamily: 'Pretendard, sans-serif', paddingBottom: 60 }}>

        {/* 상단 바 */}
        <div style={{ background: '#1e293b', display: 'flex', alignItems: 'center', padding: '0 24px', height: 36, gap: 12 }}>
          <Link href="/blog" style={{ fontSize: 11, fontFamily: 'monospace', color: '#94a3b8', textDecoration: 'none' }}>← Blog</Link>
          <span style={{ color: '#334155', margin: '0 4px' }}>|</span>
          <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#64748b' }}>{meta.date}</span>
        </div>

        <main style={{ maxWidth: 760, margin: '0 auto', padding: '2rem 1.5rem' }}>

          {/* ① 상단 헤더 카드 */}
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, overflow: 'hidden',
                        marginBottom: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
            {/* 대표 이미지 or 색상 배너 */}
            {meta.image ? (
              <img src={meta.image} alt={meta.title} style={{ width: '100%', height: 180, objectFit: 'cover' }} />
            ) : (
              <div style={{ width: '100%', height: 100,
                            background: `linear-gradient(135deg, ${bannerColor}22 0%, ${bannerColor}44 100%)`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2.5rem' }}>
                {meta.tags?.[0] === 'ai' ? '🤖' : meta.tags?.[0] === 'stock' ? '📈' : meta.tags?.[0] === 'quant' ? '📊' : meta.tags?.[0] === 'macro' ? '🌐' : '💡'}
              </div>
            )}
            <div style={{ padding: '20px 24px 22px' }}>
              {/* 태그칩 */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                {(meta.tags || []).map(t => (
                  <span key={t} style={{ fontSize: 10, padding: '3px 10px', borderRadius: 12,
                                         background: `${tagColor(t)}15`, color: tagColor(t), fontWeight: 700 }}>
                    #{t}
                  </span>
                ))}
              </div>
              {/* 제목 */}
              <h1 style={{ fontSize: 24, fontWeight: 800, color: '#1e293b', lineHeight: 1.35, marginBottom: 8 }}>
                {meta.title}
              </h1>
              {/* 요약 */}
              {meta.description && (
                <p style={{ fontSize: 14, color: '#64748b', lineHeight: 1.6, marginBottom: 12 }}>{meta.description}</p>
              )}
              {/* 날짜 + 읽기 시간 */}
              <div style={{ display: 'flex', gap: 12, fontSize: 11, color: '#94a3b8', fontFamily: 'monospace' }}>
                <span>{meta.date}</span>
                <span>·</span>
                <span>읽기 {readTime}분</span>
              </div>
            </div>
          </div>

          {/* ② 본문 영역 */}
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: '28px 32px',
                        marginBottom: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
            <div className="post-body" dangerouslySetInnerHTML={{ __html: body }} />
          </div>

          {/* ③ 이전 글 / 다음 글 네비게이션 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
            {prevPost ? (
              <Link href={`/blog/${prevPost.slug}`} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12,
                          padding: '14px 16px', textDecoration: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>← 이전 글</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', lineHeight: 1.4 }}>{prevPost.title}</div>
              </Link>
            ) : <div />}
            {nextPost ? (
              <Link href={`/blog/${nextPost.slug}`} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12,
                          padding: '14px 16px', textDecoration: 'none', textAlign: 'right', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>다음 글 →</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', lineHeight: 1.4 }}>{nextPost.title}</div>
              </Link>
            ) : <div />}
          </div>

          {/* 블로그 목록으로 */}
          <Link href="/blog" style={{ fontSize: 13, fontWeight: 600, color: '#64748b', padding: '10px 16px',
                                       background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8,
                                       textDecoration: 'none', display: 'inline-block' }}>
            ← 블로그 목록
          </Link>
        </main>
      </div>

      <style jsx global>{`
        .post-body h2 { font-size: 18px; font-weight: 700; margin: 32px 0 12px; padding-bottom: 8px; border-bottom: 1px solid #e2e8f0; color: #1e293b; }
        .post-body h3 { font-size: 15px; font-weight: 700; margin: 24px 0 8px; color: #2563eb; }
        .post-body p  { font-size: 14px; line-height: 1.8; color: #374151; margin-bottom: 14px; }
        .post-body ul, .post-body ol { padding-left: 20px; margin-bottom: 14px; }
        .post-body li { font-size: 14px; line-height: 1.8; color: #374151; margin-bottom: 4px; }
        .post-body strong { font-weight: 700; color: #1e293b; }
        .post-body hr { border: none; border-top: 1px solid #e2e8f0; margin: 24px 0; }
        .post-body a  { color: #2563eb; text-decoration: underline; }
        .post-body blockquote { background: #f0f6ff; border-left: 3px solid #2563eb; padding: 12px 16px; border-radius: 8px; margin: 16px 0; }
        .post-body blockquote p { margin: 0; color: #1e293b; }
        .post-body code { font-family: monospace; font-size: 13px; background: #f1f5f9; padding: 2px 6px; border-radius: 4px; }
        .post-body pre  { background: #1e293b; color: #e2e8f0; padding: 16px 20px; border-radius: 12px; overflow-x: auto; margin: 16px 0; }
        .post-body pre code { background: none; padding: 0; color: inherit; font-size: 13px; }
        .post-body img { width: 100%; border-radius: 12px; margin: 16px 0; }
        @media (max-width: 600px) {
          .post-body h2 { font-size: 16px; }
          .post-body h3 { font-size: 14px; }
        }
      `}</style>
    </>
  );
}

export async function getStaticProps({ params }) {
  const dir = path.join(process.cwd(), 'content', 'blog');
  const filePath = path.join(dir, params.slug + '.md');
  const raw = fs.readFileSync(filePath, 'utf8');
  const { data, content } = matter(raw);

  // 이전/다음 글 계산
  let prevPost = null, nextPost = null;
  if (fs.existsSync(dir)) {
    const all = fs.readdirSync(dir).filter(f => f.endsWith('.md')).map(f => {
      const r = fs.readFileSync(path.join(dir, f), 'utf8');
      const { data: d } = matter(r);
      return { slug: d.slug || f.replace('.md', ''), title: d.title || '', date: d.date || '' };
    }).sort((a, b) => b.date.localeCompare(a.date));
    const idx = all.findIndex(p => p.slug === params.slug);
    if (idx > 0)              nextPost = all[idx - 1];
    if (idx < all.length - 1) prevPost = all[idx + 1];
  }

  return {
    props: {
      meta: {
        title: data.title || params.slug,
        date: data.date || '',
        description: data.description || '',
        tags: data.tags || [],
        image: data.image || null,
      },
      body: marked(content),
      prevPost,
      nextPost,
    },
  };
}

export async function getStaticPaths() {
  const dir = path.join(process.cwd(), 'content', 'blog');
  let paths = [];
  if (fs.existsSync(dir)) {
    paths = fs.readdirSync(dir).filter(f => f.endsWith('.md')).map(f => ({ params: { slug: f.replace('.md', '') } }));
  }
  return { paths, fallback: false };
}
