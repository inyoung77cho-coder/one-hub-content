import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import Link from 'next/link';
import Head from 'next/head';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import CTABar from '../../components/CTABar';

const TAG_COLORS = {
  ai: '#2563eb', ml: '#7c3aed', stock: '#16a34a', macro: '#d97706',
  quant: '#0891b2', risk: '#dc2626', etf: '#059669', default: '#64748b',
};

function tagColor(tags) {
  if (!tags || tags.length === 0) return TAG_COLORS.default;
  const t = (tags[0] || '').toLowerCase();
  return TAG_COLORS[t] || TAG_COLORS.default;
}

const FILTER_TAGS = ['전체', 'AI분석', '매크로', 'ETF', '퀀트', '운영일지'];

export default function Blog({ posts }) {
  const router = useRouter();
  const [selectedTag, setSelectedTag] = useState('전체');
  const [brief, setBrief] = useState(null);

  // [v9.0] URL ?tag= 파라미터로 자동 필터
  useEffect(() => {
    if (!router.isReady) return;
    const { tag } = router.query;
    if (tag) setSelectedTag(tag);
  }, [router.isReady, router.query]);

  // [v9.0] 오늘 시장 브리핑
  useEffect(() => {
    const API = process.env.NEXT_PUBLIC_ENGINE_API_URL || 'http://54.180.54.132:5001';
    fetch(`${API}/api/pwa-dashboard?trader=A`)
      .then(r => r.json())
      .then(d => setBrief(d))
      .catch(() => {});
  }, []);

  const filteredPosts = selectedTag === '전체'
    ? posts
    : posts.filter(p => (p.tags || []).some(t =>
        t.toLowerCase() === selectedTag.toLowerCase() ||
        t === selectedTag
      ));

  return (
    <>
      <Head>
        <title>Blog — ONE-HUB AI 투자 인사이트</title>
        <meta name="description" content="AI 자동매매, 한국 주식 분석, 퀀트 투자 방법론을 공유합니다." />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css" rel="stylesheet" />
      </Head>

      <div className="page-wrapper">
        <div className="status-bar">
          <span style={{ fontFamily: 'Space Mono,monospace', fontSize: '11px' }}>BLOG · AI 투자 인사이트</span>
        </div>

        <main style={{ maxWidth: '960px', margin: '0 auto', padding: '2rem 1.5rem' }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#1e293b', marginBottom: '0.4rem', fontFamily: 'Pretendard, sans-serif' }}>
            AI 투자 인사이트
          </h1>
          <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '1.2rem' }}>
            AI 자동매매 운영 경험과 투자 방법론을 공유합니다.
          </p>

          {/* [v9.0] 오늘 시장 브리핑 카드 */}
          {brief && (
            <div style={{
              background: brief.regime === 'BEAR' ? '#fef2f2' : brief.regime === 'BULL' ? '#f0fdf4' : '#fffbeb',
              border: '1px solid #e2e8f0', borderRadius: 20, padding: '16px 20px', marginBottom: '1.2rem',
              boxShadow: '0 2px 16px rgba(0,0,0,0.07)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>📡 오늘 시장 브리핑</span>
                <Link href="/pwa" style={{ fontSize: 11, color: '#2563eb', textDecoration: 'none', fontWeight: 600 }}>자세히 →</Link>
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 12,
                  background: brief.regime === 'BEAR' ? '#fee2e2' : brief.regime === 'BULL' ? '#dcfce7' : '#fef9c3',
                  color:      brief.regime === 'BEAR' ? '#ef4444' : brief.regime === 'BULL' ? '#22c55e' : '#f59e0b' }}>
                  {brief.regime === 'BEAR' ? '🔴 BEAR' : brief.regime === 'BULL' ? '🟢 BULL' : '🟡 SIDEWAYS'}
                </span>
                {brief.market?.heat_score != null && (
                  <span style={{ fontSize: 12, color: '#64748b' }}>Heat {brief.market.heat_score}</span>
                )}
                {brief.market?.fear_greed != null && (
                  <span style={{ fontSize: 12, color: '#64748b' }}>Fear {brief.market.fear_greed}</span>
                )}
              </div>
              <div style={{ fontSize: 12, color: '#374151', marginTop: 8 }}>
                AI 결론: {brief.regime === 'BEAR' ? '신규매수 금지' : brief.regime === 'BULL' ? '매수 우호 — 적극 검토' : '선택적 매수'}
              </div>
            </div>
          )}

          {/* 카테고리 필터 버튼 */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: '1.8rem' }}>
            {FILTER_TAGS.map(tag => (
              <button
                key={tag}
                onClick={() => setSelectedTag(tag)}
                style={{
                  padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                  border: 'none', cursor: 'pointer', fontFamily: 'Pretendard, sans-serif',
                  background: selectedTag === tag ? '#2563eb' : '#f1f5f9',
                  color:      selectedTag === tag ? '#fff'    : '#64748b',
                  transition: 'background 0.15s, color 0.15s',
                }}
              >
                {tag}
              </button>
            ))}
          </div>

          {filteredPosts.length === 0 && (
            <div style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8', fontSize: '14px',
                          background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0' }}>
              {selectedTag === '전체' ? '아직 게시된 글이 없습니다.' : `'${selectedTag}' 카테고리에 글이 없습니다.`}
            </div>
          )}

          {/* 카드 그리드 */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: 20,
          }}>
            {filteredPosts.map(post => {
              const color = tagColor(post.tags);
              return (
                <Link
                  key={post.slug}
                  href={'/blog/' + post.slug}
                  style={{ display: 'flex', flexDirection: 'column', textDecoration: 'none',
                           background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16,
                           overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
                           transition: 'box-shadow 0.15s' }}
                >
                  {/* 대표 이미지 or 색상 배너 */}
                  {post.image ? (
                    <img
                      src={post.image}
                      alt={post.title}
                      style={{ width: '100%', height: 140, objectFit: 'cover' }}
                    />
                  ) : (
                    <div style={{
                      width: '100%', height: 100,
                      background: `linear-gradient(135deg, ${color}22 0%, ${color}44 100%)`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '2rem',
                    }}>
                      {post.tags?.[0] === 'ai' ? '🤖' :
                       post.tags?.[0] === 'stock' ? '📈' :
                       post.tags?.[0] === 'quant' ? '📊' :
                       post.tags?.[0] === 'macro' ? '🌐' : '💡'}
                    </div>
                  )}

                  {/* 텍스트 영역 */}
                  <div style={{ padding: '16px 18px 18px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                    <h2 style={{ fontSize: '15px', fontWeight: 700, color: '#1e293b', marginBottom: 6,
                                 lineHeight: 1.45, fontFamily: 'Pretendard, sans-serif' }}>
                      {post.title}
                    </h2>
                    {post.description && (
                      <p style={{ fontSize: '13px', color: '#64748b', lineHeight: 1.55, margin: '0 0 12px',
                                  flex: 1,
                                  overflow: 'hidden', display: '-webkit-box',
                                  WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                        {post.description}
                      </p>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 'auto', flexWrap: 'wrap' }}>
                      {(post.tags || []).map(t => (
                        <span key={t} style={{
                          fontSize: '10px', padding: '2px 8px', borderRadius: 12,
                          background: `${tagColor([t])}15`, color: tagColor([t]),
                          fontWeight: 600,
                        }}>
                          #{t}
                        </span>
                      ))}
                      {post.date && (
                        <span style={{ marginLeft: 'auto', fontSize: '11px', color: '#94a3b8', whiteSpace: 'nowrap', fontFamily: 'monospace' }}>
                          {post.date}
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
          <CTABar />
        </main>
      </div>
    </>
  );
}

export async function getStaticProps() {
  const dir = path.join(process.cwd(), 'content', 'blog');
  let posts = [];
  if (fs.existsSync(dir)) {
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
    posts = files.map(filename => {
      const raw = fs.readFileSync(path.join(dir, filename), 'utf8');
      const { data } = matter(raw);
      return {
        slug: data.slug || filename.replace('.md', ''),
        title: data.title || '',
        date: data.date || '',
        description: data.description || '',
        tags: data.tags || [],
        image: data.image || null,
      };
    }).sort((a, b) => b.date.localeCompare(a.date));
  }
  return { props: { posts } };
}
