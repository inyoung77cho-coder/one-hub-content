import fs from 'fs'

import path from 'path'

import matter from 'gray-matter'

import { marked } from 'marked'

import Link from 'next/link'

import Head from 'next/head'



export default function BlogPost({ meta, body }) {

  return (

    <>

      <Head>

        <title>{meta.title} — ONE-HUB Blog</title>

        <meta name="description" content={meta.description} />

        <meta name="viewport" content="width=device-width, initial-scale=1" />

        <meta property="og:title" content={meta.title} />

        <meta property="og:description" content={meta.description} />

      </Head>

      <div className="page-wrapper">

        <nav className="nav">

          <div className="nav-inner">

            <Link href="/" className="nav-logo"><span className="logo-bracket">[</span>ONE-HUB<span className="logo-bracket">]</span></Link>

            <div className="nav-links">

              <Link href="/" className="nav-link">대시보드</Link>

              <Link href="/daily" className="nav-link">Daily</Link>

              <Link href="/blog" className="nav-link active">Blog</Link>

              <Link href="/about" className="nav-link dim">About</Link>

            </div>

          </div>

        </nav>

        <div className="status-bar">

          <Link href="/blog" style={{fontSize:'11px',fontFamily:'monospace',color:'#9A9690'}}>← Blog</Link>

          <span style={{color:'#4A4A4A',margin:'0 8px'}}>|</span>

          <span style={{fontSize:'11px',fontFamily:'monospace',color:'#F8F7F2'}}>{meta.date}</span>

        </div>

        <main style={{maxWidth:'760px',margin:'0 auto',padding:'2rem 1.5rem'}}>

          <div style={{background:'#FFFFFF',border:'1px solid #E0DDD4',borderRadius:'12px',padding:'1.5rem',marginBottom:'1.5rem'}}>

            <div style={{display:'flex',gap:'6px',marginBottom:'0.8rem',flexWrap:'wrap'}}>

              {(meta.tags||[]).map(t => (<span key={t} style={{fontSize:'10px',padding:'2px 8px',borderRadius:'12px',background:'#F8F7F2',border:'1px solid #E0DDD4',color:'#6A6660'}}>#{t}</span>))}

            </div>

            <h1 style={{fontSize:'1.4rem',fontWeight:700,color:'#1A1A1A',lineHeight:1.35,marginBottom:'0.6rem'}}>{meta.title}</h1>

            <p style={{fontSize:'13px',color:'#6A6660',lineHeight:1.6}}>{meta.description}</p>

          </div>

          <div style={{background:'#FFFFFF',border:'1px solid #E0DDD4',borderRadius:'12px',padding:'1.5rem'}}>

            <div className="post-body" dangerouslySetInnerHTML={{ __html: body }} />

          </div>

          <div style={{marginTop:'1.5rem',display:'flex',justifyContent:'space-between',gap:'1rem'}}>

            <Link href="/blog" style={{fontSize:'13px',fontWeight:600,color:'#6A6660',padding:'10px 16px',background:'#FFFFFF',border:'1px solid #E0DDD4',borderRadius:'8px'}}>← 블로그 목록</Link>

            <Link href="/daily" style={{fontSize:'13px',fontWeight:600,color:'#F8F7F2',padding:'10px 16px',background:'#1A1A1A',borderRadius:'8px'}}>Daily 리포트 →</Link>

          </div>

        </main>

      </div>

      <style jsx global>{`

        .page-wrapper{min-height:100vh;background:#F8F7F2;color:#1A1A1A;font-family:'Syne',sans-serif;padding-bottom:3rem;}

        .nav{position:sticky;top:0;z-index:100;background:rgba(248,247,242,0.95);backdrop-filter:blur(12px);border-bottom:1px solid #E0DDD4;height:56px;}

        .nav-inner{max-width:1080px;margin:0 auto;padding:0 1.5rem;height:100%;display:flex;align-items:center;gap:2rem;}

        .nav-logo{font-family:'Space Mono',monospace;font-size:14px;font-weight:700;color:#1A1A1A;}

        .logo-bracket{color:#00AA55;}

        .nav-links{display:flex;gap:0.1rem;overflow-x:auto;scrollbar-width:none;}

        .nav-link{font-size:13px;font-weight:600;padding:6px 12px;border-radius:6px;color:#4A4A4A;transition:all 0.15s;}

        .nav-link.active{background:#1A1A1A;color:#F8F7F2;}

        .nav-link.dim{color:#9A9690;}

        .status-bar{background:#1A1A1A;color:#F8F7F2;display:flex;align-items:center;padding:0 1.5rem;height:36px;}

        .post-body h2{font-size:1.05rem;font-weight:700;margin:1.8rem 0 0.6rem;padding-bottom:0.4rem;border-bottom:1px solid #E0DDD4;color:#1A1A1A;}

        .post-body h3{font-size:0.95rem;font-weight:700;margin:1.4rem 0 0.4rem;color:#2A2A2A;}

        .post-body p{font-size:14px;line-height:1.75;color:#3A3A3A;margin-bottom:0.75rem;}

        .post-body ul,.post-body ol{padding-left:1.4rem;margin-bottom:0.75rem;}

        .post-body li{font-size:14px;line-height:1.7;color:#3A3A3A;margin-bottom:3px;}

        .post-body strong{font-weight:700;color:#1A1A1A;}

        .post-body hr{border:none;border-top:1px solid #E0DDD4;margin:1.5rem 0;}

        .post-body a{color:#00AA55;text-decoration:underline;}

        .post-body code{font-family:'Space Mono',monospace;font-size:12px;background:#F0EDE8;padding:2px 6px;border-radius:4px;}

      `}</style>

    </>

  )

}



export async function getStaticProps({ params }) {

  const filePath = path.join(process.cwd(), 'content', 'blog', params.slug+'.md')

  const raw = fs.readFileSync(filePath, 'utf8')

  const { data, content } = matter(raw)

  return { props: { meta: { title: data.title||params.slug, date: data.date||'', description: data.description||'', tags: data.tags||[] }, body: marked(content) } }

}



export async function getStaticPaths() {

  const dir = path.join(process.cwd(), 'content', 'blog')

  let paths = []

  if (fs.existsSync(dir)) {

    paths = fs.readdirSync(dir).filter(f => f.endsWith('.md')).map(f => ({ params: { slug: f.replace('.md','') } }))

  }

  return { paths, fallback: false }

}

