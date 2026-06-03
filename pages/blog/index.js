import fs from 'fs'

import path from 'path'

import matter from 'gray-matter'

import Link from 'next/link'

import Head from 'next/head'



export default function Blog({ posts }) {

  return (

    <>

      <Head>

        <title>Blog — ONE-HUB AI 투자 인사이트</title>

        <meta name="description" content="AI 자동매매, 한국 주식 분석, 퀀트 투자 방법론을 공유합니다." />

        <meta name="viewport" content="width=device-width, initial-scale=1" />

      </Head>

      <div className="page-wrapper">


        <div className="status-bar">

          <span style={{fontFamily:'Space Mono,monospace',fontSize:'11px'}}>BLOG · AI 투자 인사이트</span>

        </div>

        <main style={{maxWidth:'760px',margin:'0 auto',padding:'2rem 1.5rem'}}>

          <h1 style={{fontSize:'1.4rem',fontWeight:700,color:'#1A1A1A',marginBottom:'0.4rem'}}>AI 투자 인사이트</h1>

          <p style={{fontSize:'13px',color:'#6A6660',marginBottom:'1.5rem'}}>AI 자동매매 운영 경험과 투자 방법론을 공유합니다.</p>

          <div style={{display:'flex',flexDirection:'column',gap:'12px'}}>

            {posts.map(post => (

              <Link key={post.slug} href={'/blog/'+post.slug} style={{display:'block',background:'#FFFFFF',border:'1px solid #E0DDD4',borderRadius:'12px',padding:'1.2rem 1.4rem',textDecoration:'none'}}>

                <div style={{display:'flex',justifyContent:'space-between',gap:'1rem',flexWrap:'wrap'}}>

                  <div style={{flex:1}}>

                    <h2 style={{fontSize:'15px',fontWeight:600,color:'#1A1A1A',marginBottom:'6px'}}>{post.title}</h2>

                    <p style={{fontSize:'13px',color:'#6A6660',lineHeight:1.55}}>{post.description}</p>

                    <div style={{display:'flex',gap:'6px',marginTop:'8px',flexWrap:'wrap'}}>

                      {(post.tags||[]).map(t => (<span key={t} style={{fontSize:'10px',padding:'2px 8px',borderRadius:'12px',background:'#F8F7F2',border:'1px solid #E0DDD4',color:'#6A6660'}}>#{t}</span>))}

                    </div>

                  </div>

                  <span style={{fontFamily:'Space Mono,monospace',fontSize:'11px',color:'#9A9690',whiteSpace:'nowrap'}}>{post.date}</span>

                </div>

              </Link>

            ))}

          </div>

        </main>

      </div>

      <style jsx global>{`

        .page-wrapper{min-height:100vh;background:#F8F7F2;color:#1A1A1A;font-family:'Syne',sans-serif;}

        .nav{position:sticky;top:0;z-index:100;background:rgba(248,247,242,0.95);backdrop-filter:blur(12px);border-bottom:1px solid #E0DDD4;height:56px;}

        .nav-inner{max-width:1080px;margin:0 auto;padding:0 1.5rem;height:100%;display:flex;align-items:center;gap:2rem;}

        .nav-logo{font-family:'Space Mono',monospace;font-size:14px;font-weight:700;color:#1A1A1A;}

        .logo-bracket{color:#00AA55;}

        .nav-links{display:flex;gap:0.1rem;flex:1;overflow-x:auto;scrollbar-width:none;}

        .nav-link{font-size:13px;font-weight:600;padding:6px 12px;border-radius:6px;color:#4A4A4A;transition:all 0.15s;}

        .nav-link:hover{background:#EDECEA;color:#1A1A1A;}

        .nav-link.active{background:#1A1A1A;color:#F8F7F2;}

        .nav-link.dim{color:#9A9690;}

        .status-bar{background:#1A1A1A;color:#F8F7F2;display:flex;align-items:center;padding:0 1.5rem;height:36px;}

      `}</style>

    </>

  )

}



export async function getStaticProps() {

  const dir = path.join(process.cwd(), 'content', 'blog')

  let posts = []

  if (fs.existsSync(dir)) {

    const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'))

    posts = files.map(filename => {

      const raw = fs.readFileSync(path.join(dir, filename), 'utf8')

      const { data } = matter(raw)

      return { slug: data.slug || filename.replace('.md',''), title: data.title||'', date: data.date||'', description: data.description||'', tags: data.tags||[] }

    }).sort((a,b) => b.date.localeCompare(a.date))

  }

  return { props: { posts } }

}

