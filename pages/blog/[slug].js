import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { marked } from 'marked';
import Link from 'next/link';
import Head from 'next/head';
import { useState, useEffect } from 'react';

const TAG_COLORS = {
  ai: '#2563eb', ml: '#7c3aed', stock: '#16a34a', macro: '#d97706',
  quant: '#0891b2', risk: '#dc2626', etf: '#059669', default: '#64748b',
};
function tagColor(tag) {
  return TAG_COLORS[(tag || '').toLowerCase()] || TAG_COLORS.default;
}

function injectHeadingIds(html) {
  return html.replace(/<h2>(.*?)<\/h2>/g, (_, text) => {
    const id = text.replace(/<[^>]+>/g, '').trim().replace(/\s+/g, '-');
    return `<h2 id="${id}">${text}</h2>`;
  });
}

export default function BlogPost({ meta, body, prevPost, nextPost, relatedPosts }) {
  const [scrollProgress, setScrollProgress] = useState(0);
  const [copied, setCopied] = useState(false);
  const [aiData, setAiData] = useState(null);

  const plainText = body.replace(/<[^>]+>/g, '');
  const readTime = Math.max(1, Math.round(plainText.length / 500));

  const tocItems = (meta.rawContent || '').match(/^## .+/gm) || [];
  const showTOC = tocItems.length >= 3;

  const bannerColor = tagColor(meta.tags?.[0]);
  const processedBody = injectHeadingIds(body);

  useEffect(() => {
    const onScroll = () => {
      const total = document.body.scrollHeight - window.innerHeight;
      setScrollProgress(total > 0 ? (window.scrollY / total) * 100 : 0);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const today = new Date().toISOString().split('T')[0];
  useEffect(() => {
    if (meta.date !== today) return;
    const API = process.env.NEXT_PUBLIC_ENGINE_API_URL || 'http://54.180.54.132:5001';
    fetch(`${API}/api/pwa-dashboard?trader=A`)
      .then(r => r.json())
      .then(d => setAiData(d))
      .catch(() => {});
  }, [meta.date, today]);

  const scrollToHeading = (text) => {
    const id = text.replace(/^## /, '').replace(/<[^>]+>/g, '').trim().replace(/\s+/g, '-');
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  const handleXShare = () => {
    const url = encodeURIComponent(window.location.href);
    const text = encodeURIComponent(meta.title);
    window.open(`https://twitter.com/intent/tweet?text=${text}&url=${url}`, '_blank');
  };

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

      {/* 스크롤 진행 바 */}
      <div style={{ position:'fixed', top:0, left:0, zIndex:9999, height:3,
                    background:'#2563eb', width:`${scrollProgress}%`, transition:'width 0.1s' }} />

      <div style={{ minHeight:'100vh', background:'#f8fafc', fontFamily:'Pretendard, sans-serif', paddingBottom:60 }}>

        <div style={{ background:'#1e293b', display:'flex', alignItems:'center', padding:'0 24px', height:36, gap:12 }}>
          <Link href="/blog" style={{ fontSize:11, fontFamily:'monospace', color:'#94a3b8', textDecoration:'none' }}>← Blog</Link>
          <span style={{ color:'#334155' }}>|</span>
          <span style={{ fontSize:11, fontFamily:'monospace', color:'#64748b' }}>{meta.date}</span>
        </div>

        <main style={{ maxWidth:760, margin:'0 auto', padding:'2rem 1.5rem' }}>

          {/* 헤더 카드 */}
          <div style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:20, overflow:'hidden',
                        marginBottom:20, boxShadow:'0 2px 16px rgba(0,0,0,0.07)' }}>
            {meta.image ? (
              <img src={meta.image} alt={meta.title} style={{ width:'100%', height:180, objectFit:'cover' }} />
            ) : (
              <div style={{ width:'100%', height:100,
                            background:`linear-gradient(135deg,${bannerColor}22 0%,${bannerColor}44 100%)`,
                            display:'flex', alignItems:'center', justifyContent:'center', fontSize:'2.5rem' }}>
                {meta.tags?.[0]==='ai'?'🤖':meta.tags?.[0]==='stock'?'📈':meta.tags?.[0]==='quant'?'📊':meta.tags?.[0]==='macro'?'🌐':'💡'}
              </div>
            )}
            <div style={{ padding:'20px 24px 22px' }}>
              <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:12 }}>
                {(meta.tags||[]).map(t => (
                  <span key={t} style={{ fontSize:10, padding:'3px 10px', borderRadius:12,
                    background:`${tagColor(t)}15`, color:tagColor(t), fontWeight:700 }}>#{t}</span>
                ))}
              </div>
              <h1 style={{ fontSize:24, fontWeight:800, color:'#1e293b', lineHeight:1.35, marginBottom:8 }}>{meta.title}</h1>
              {meta.description && (
                <p style={{ fontSize:14, color:'#64748b', lineHeight:1.6, marginBottom:12 }}>{meta.description}</p>
              )}
              <div style={{ display:'flex', gap:12, fontSize:11, color:'#94a3b8', fontFamily:'monospace', alignItems:'center' }}>
                <span>{meta.date}</span>
                <span>·</span>
                <span>⏱️ {readTime}분 읽기</span>
              </div>
            </div>
          </div>

          {/* TOC */}
          {showTOC && (
            <div style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:20,
                          padding:'16px 20px', marginBottom:20, boxShadow:'0 2px 16px rgba(0,0,0,0.07)' }}>
              <div style={{ fontSize:12, fontWeight:700, color:'#94a3b8', marginBottom:10, letterSpacing:'0.05em' }}>📋 목차</div>
              <ol style={{ margin:0, padding:'0 0 0 18px' }}>
                {tocItems.map((item, i) => (
                  <li key={i} style={{ marginBottom:6 }}>
                    <button onClick={() => scrollToHeading(item)}
                      style={{ background:'none', border:'none', cursor:'pointer', fontSize:13,
                               color:'#2563eb', textAlign:'left', padding:0, fontFamily:'Pretendard, sans-serif' }}>
                      {item.replace(/^## /, '')}
                    </button>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* 본문 */}
          <div style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:20,
                        padding:'28px 32px', marginBottom:20, boxShadow:'0 2px 16px rgba(0,0,0,0.07)' }}>
            <div className="post-body" dangerouslySetInnerHTML={{ __html: processedBody }} />
          </div>

          {/* 오늘 AI 판단 카드 */}
          {meta.date === today && aiData && (
            <div style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:20,
                          padding:'20px 24px', marginBottom:20, boxShadow:'0 2px 16px rgba(0,0,0,0.07)' }}>
              <div style={{ fontSize:13, fontWeight:700, color:'#94a3b8', marginBottom:12 }}>🤖 작성일 AI 판단</div>
              {[
                { label:'시장',  value: aiData.regime || '-' },
                { label:'Heat', value: aiData.market?.heat_score != null ? `${aiData.market.heat_score} / 100` : '-' },
                { label:'차단', value: aiData.blocked_count != null ? `${aiData.blocked_count}건` : '-' },
                { label:'결론', value: aiData.regime==='BEAR'?'신규매수 금지':aiData.regime==='BULL'?'매수 우호':'선택적 매수' },
              ].map(r => (
                <div key={r.label} style={{ display:'flex', justifyContent:'space-between', fontSize:13,
                                            padding:'5px 0', borderBottom:'1px solid #f1f5f9' }}>
                  <span style={{ color:'#64748b' }}>{r.label}</span>
                  <span style={{ fontWeight:700, color:'#1e293b' }}>{r.value}</span>
                </div>
              ))}
            </div>
          )}

          {/* 관련 글 */}
          {relatedPosts?.length > 0 && (
            <div style={{ marginBottom:20 }}>
              <div style={{ fontSize:13, fontWeight:700, color:'#64748b', marginBottom:10 }}>이런 글도 읽어보세요 →</div>
              <div style={{ display:'flex', gap:12, overflowX:'auto', paddingBottom:4 }}>
                {relatedPosts.map(p => (
                  <Link key={p.slug} href={`/blog/${p.slug}`}
                    style={{ minWidth:180, background:'#fff', border:'1px solid #e2e8f0', borderRadius:20,
                             padding:'14px 16px', textDecoration:'none', flexShrink:0,
                             boxShadow:'0 2px 16px rgba(0,0,0,0.07)' }}>
                    <div style={{ fontSize:13, fontWeight:700, color:'#1e293b', lineHeight:1.4, marginBottom:4 }}>{p.title}</div>
                    <div style={{ fontSize:11, color:'#94a3b8', fontFamily:'monospace' }}>{p.date}</div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* 이전/다음 */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:20 }}>
            {prevPost ? (
              <Link href={`/blog/${prevPost.slug}`}
                style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:20,
                         padding:'14px 16px', textDecoration:'none', boxShadow:'0 2px 16px rgba(0,0,0,0.07)' }}>
                <div style={{ fontSize:11, color:'#94a3b8', marginBottom:4 }}>← 이전 글</div>
                <div style={{ fontSize:13, fontWeight:700, color:'#1e293b', lineHeight:1.4 }}>{prevPost.title}</div>
              </Link>
            ) : <div />}
            {nextPost ? (
              <Link href={`/blog/${nextPost.slug}`}
                style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:20,
                         padding:'14px 16px', textDecoration:'none', textAlign:'right',
                         boxShadow:'0 2px 16px rgba(0,0,0,0.07)' }}>
                <div style={{ fontSize:11, color:'#94a3b8', marginBottom:4 }}>다음 글 →</div>
                <div style={{ fontSize:13, fontWeight:700, color:'#1e293b', lineHeight:1.4 }}>{nextPost.title}</div>
              </Link>
            ) : <div />}
          </div>

          {/* 공유 */}
          <div style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:20,
                        padding:'20px 24px', marginBottom:20, textAlign:'center',
                        boxShadow:'0 2px 16px rgba(0,0,0,0.07)' }}>
            <div style={{ fontSize:13, color:'#64748b', marginBottom:12 }}>이 글이 도움이 됐나요?</div>
            <div style={{ display:'flex', gap:10, justifyContent:'center' }}>
              <button onClick={handleCopy}
                style={{ padding:'8px 18px', borderRadius:10, border:'1px solid #e2e8f0',
                         background: copied ? '#f0fdf4' : '#fff', color: copied ? '#22c55e' : '#374151',
                         fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'Pretendard, sans-serif' }}>
                {copied ? '✅ 복사됨' : '🔗 링크 복사'}
              </button>
              <button onClick={handleXShare}
                style={{ padding:'8px 18px', borderRadius:10, border:'1px solid #e2e8f0',
                         background:'#fff', color:'#374151', fontSize:13, fontWeight:600,
                         cursor:'pointer', fontFamily:'Pretendard, sans-serif' }}>
                🐦 X 공유
              </button>
            </div>
          </div>

          <Link href="/blog" style={{ fontSize:13, fontWeight:600, color:'#64748b', padding:'10px 16px',
            background:'#fff', border:'1px solid #e2e8f0', borderRadius:10,
            textDecoration:'none', display:'inline-block' }}>
            ← 블로그 목록
          </Link>
        </main>
      </div>

      <style jsx global>{`
        .post-body { font-size:15px; line-height:1.85; color:#374151; }
        .post-body h2 { font-size:20px; font-weight:800; color:#1e293b; margin-top:40px; margin-bottom:16px;
          padding-bottom:8px; border-bottom:2px solid #e2e8f0; }
        .post-body h3 { font-size:16px; font-weight:700; color:#2563eb; margin-top:28px; margin-bottom:12px; }
        .post-body p  { margin-bottom:20px; }
        .post-body ul, .post-body ol { padding-left:24px; margin-bottom:20px; }
        .post-body li { margin-bottom:8px; line-height:1.7; }
        .post-body strong { font-weight:700; color:#1e293b; }
        .post-body hr { border:none; border-top:1px solid #e2e8f0; margin:24px 0; }
        .post-body a  { color:#2563eb; text-decoration:underline; }
        .post-body blockquote { background:#f0f6ff; border-left:4px solid #2563eb;
          padding:16px 20px; border-radius:8px; margin:24px 0; }
        .post-body blockquote p { margin:0; color:#1e293b; font-weight:500; }
        .post-body code { background:#f1f5f9; font-family:'Space Mono',monospace;
          font-size:13px; padding:2px 6px; border-radius:4px; color:#2563eb; }
        .post-body pre { background:#1e293b; color:#e2e8f0; padding:20px; border-radius:12px;
          overflow-x:auto; margin:24px 0; font-size:13px; line-height:1.6; }
        .post-body pre code { background:none; padding:0; color:inherit; }
        .post-body img { width:100%; border-radius:12px; margin:20px 0; box-shadow:0 4px 20px rgba(0,0,0,0.08); }
        .post-body table { width:100%; border-collapse:collapse; margin:24px 0; font-size:14px; }
        .post-body th { background:#f0f6ff; font-weight:700; padding:10px 14px; border:1px solid #e2e8f0; }
        .post-body td { padding:10px 14px; border:1px solid #e2e8f0; }
        .post-body tr:nth-child(even) td { background:#f8fafc; }
        @media (max-width:600px) {
          .post-body h2 { font-size:17px; }
          .post-body h3 { font-size:14px; }
          .post-body { font-size:14px; }
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

  let prevPost = null, nextPost = null, relatedPosts = [];
  if (fs.existsSync(dir)) {
    const all = fs.readdirSync(dir).filter(f => f.endsWith('.md')).map(f => {
      const r = fs.readFileSync(path.join(dir, f), 'utf8');
      const { data: d } = matter(r);
      return { slug: d.slug || f.replace('.md',''), title: d.title||'', date: d.date||'', tags: d.tags||[] };
    }).sort((a, b) => b.date.localeCompare(a.date));

    const idx = all.findIndex(p => p.slug === params.slug);
    if (idx > 0)              nextPost = all[idx - 1];
    if (idx < all.length - 1) prevPost = all[idx + 1];

    const currentTags = data.tags || [];
    relatedPosts = all
      .filter(p => p.slug !== params.slug && p.tags.some(t => currentTags.includes(t)))
      .slice(0, 3);
  }

  return {
    props: {
      meta: { title: data.title||params.slug, date: data.date||'', description: data.description||'',
              tags: data.tags||[], image: data.image||null, rawContent: content },
      body: marked(content),
      prevPost,
      nextPost,
      relatedPosts,
    },
  };
}

export async function getStaticPaths() {
  const dir = path.join(process.cwd(), 'content', 'blog');
  let paths = [];
  if (fs.existsSync(dir)) {
    paths = fs.readdirSync(dir).filter(f => f.endsWith('.md'))
             .map(f => ({ params: { slug: f.replace('.md','') } }));
  }
  return { paths, fallback: false };
}
