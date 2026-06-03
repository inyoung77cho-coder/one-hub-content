
import fs from 'fs'

import path from 'path'

import matter from 'gray-matter'

import { marked } from 'marked'

import Link from 'next/link'

import Head from 'next/head'

import { useEffect, useState } from 'react'



export default function DailyReport({ meta, body, prev, next }) {

  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  const regimeIcon  = (r) => r === 'BULL' ? '▲' : r === 'BEAR' ? '▼' : '➖'

  const regimeClass = (r) => r === 'BULL' ? 'regime-bull' : r === 'BEAR' ? 'regime-bear' : 'regime-side'

  const heatColor   = (g) => ({ HOT:'heat-hot', WARM:'heat-warm', COOL:'heat-cool', COLD:'heat-cold' }[g] || 'heat-cool')

  return (

    <>

      <Head>

        <title>{meta.title} — ONE-HUB</title>

        <meta name="description" content={meta.insight || meta.title} />

        <meta name="viewport" content="width=device-width, initial-scale=1" />

        <meta property="og:title" content={meta.title} />

        <meta property="og:description" content={meta.insight || ''} />

        <link rel="preconnect" href="https://fonts.googleapis.com" />

        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />

        <link href="https://fonts.googleapis.com/css2?family=Space+Mono:ital,wght@0,400;0,700;1,400&family=Syne:wght@400;600;700;800&display=swap" rel="stylesheet" />

      </Head>

      <div className="page-wrapper">

        <nav className="nav">

          <div className="nav-inner">

            <Link href="/" className="nav-logo">

              <span className="logo-bracket">[</span>ONE-HUB<span className="logo-bracket">]</span>

            </Link>

            <div className="nav-links">

              <Link href="/"           className="nav-link">대시보드</Link>

              <Link href="/daily"      className="nav-link active">Daily</Link>

              <Link href="/weekly"     className="nav-link dim">Weekly</Link>

              <Link href="/engines"    className="nav-link dim">Engines</Link>

              <Link href="/strategies" className="nav-link dim">Strategies</Link>

              <Link href="/community"  className="nav-link dim">Community</Link>

              <Link href="/about"      className="nav-link dim">About</Link>

            </div>

          </div>

        </nav>

        <div className="status-bar">

          <span className="status-item mono">DAILY REPORT</span>

          <span className="status-divider">|</span>

          <span className="status-item mono">{meta.date}</span>

          <span className="status-divider">|</span>

          <span className={`status-item mono ${regimeClass(meta.regime)}`}>{regimeIcon(meta.regime)} {meta.regime}</span>

          <span className="status-divider">|</span>

          <span className={`heat-indicator ${heatColor(meta.heat_grade)}`}>Heat {meta.heat_score} · {meta.heat_grade}</span>

        </div>

        <main className="daily-main">

          <div className="report-header-card">

            <div className="report-header-top">

              <div className="report-breadcrumb">

                <Link href="/daily" className="breadcrumb-link">← Daily</Link>

                <span className="breadcrumb-sep">/</span>

                <span className="mono" style={{fontSize:'12px',color:'#9A9690'}}>{meta.date}</span>

              </div>

              <div className="report-badges">

                <span className={`regime-badge-lg ${regimeClass(meta.regime)}`}>{regimeIcon(meta.regime)} {meta.regime}</span>

                <span className={`heat-indicator ${heatColor(meta.heat_grade)}`}>Heat {meta.heat_score}</span>

                <span className="trade-count-badge">매매 {meta.trade_count}건</span>

              </div>

            </div>

            <h1 className="report-title">

              <span className="pnl-emoji">{meta.pnl_emoji}</span>

              {meta.title}

            </h1>

            {meta.insight && (

              <div className="insight-block">

                <div className="insight-label mono">AI INSIGHT</div>

                <p className="insight-text">{meta.insight}</p>

              </div>

            )}

          </div>

          <div className="report-body-card">

            <div className="post-body" dangerouslySetInnerHTML={{ __html: body }} />

          </div>

          <div className="report-nav-row">

            <div className="report-nav-cell">

              {prev && (

                <Link href={`/daily/${prev}`} className="report-nav-link">

                  <span className="nav-dir">← 이전</span>

                  <span className="nav-date mono">{prev}</span>

                </Link>

              )}

            </div>

            <Link href="/daily" className="report-nav-all">전체 목록</Link>

            <div className="report-nav-cell right">

              {next && (

                <Link href={`/daily/${next}`} className="report-nav-link right">

                  <span className="nav-dir">다음 →</span>

                  <span className="nav-date mono">{next}</span>

                </Link>

              )}

            </div>

          </div>

        </main>

        <nav className="bottom-tab-bar">

          <Link href="/"        className="tab-item"><span className="tab-icon">⌂</span><span className="tab-label">홈</span></Link>

          <Link href="/daily"   className="tab-item active"><span className="tab-icon">◎</span><span className="tab-label">Daily</span></Link>

          <Link href="/weekly"  className="tab-item"><span className="tab-icon">◈</span><span className="tab-label">Weekly</span></Link>

          <Link href="/engines" className="tab-item"><span className="tab-icon">⚙</span><span className="tab-label">Engines</span></Link>

          <Link href="/about"   className="tab-item"><span className="tab-icon">◉</span><span className="tab-label">About</span></Link>

        </nav>


      <style jsx>{`

        .page-wrapper{min-height:100vh;background:#F8F7F2;color:#1A1A1A;font-family:'Syne',sans-serif;padding-bottom:80px;}

        .nav{position:sticky;top:0;z-index:100;background:rgba(248,247,242,0.95);backdrop-filter:blur(12px);border-bottom:1px solid #E0DDD4;height:56px;}

        .nav-inner{max-width:1080px;margin:0 auto;padding:0 1.5rem;height:100%;display:flex;align-items:center;gap:2rem;}

        .nav-logo{font-family:'Space Mono',monospace;font-size:14px;font-weight:700;letter-spacing:0.08em;color:#1A1A1A;white-space:nowrap;}

        .logo-bracket{color:#00AA55;}

        .nav-links{display:flex;gap:0.1rem;flex:1;overflow-x:auto;scrollbar-width:none;}

        .nav-links::-webkit-scrollbar{display:none;}

        .nav-link{font-size:13px;font-weight:600;padding:6px 12px;border-radius:6px;color:#4A4A4A;transition:all 0.15s;white-space:nowrap;}

        .nav-link:hover{background:#EDECEA;color:#1A1A1A;}

        .nav-link.active{background:#1A1A1A;color:#F8F7F2;}

        .nav-link.dim{color:#9A9690;}

        .status-bar{background:#1A1A1A;color:#F8F7F2;display:flex;align-items:center;gap:0.75rem;padding:0 1.5rem;height:36px;font-size:11px;overflow-x:auto;scrollbar-width:none;}

        .status-bar::-webkit-scrollbar{display:none;}

        .status-item{white-space:nowrap;}

        .status-divider{color:#4A4A4A;}

        .mono{font-family:'Space Mono',monospace;}

        .heat-indicator{font-family:'Space Mono',monospace;font-size:11px;padding:3px 10px;border-radius:20px;border:1px solid;}

        .heat-hot{color:#DD3333;border-color:#DD333340;background:#DD333310;}

        .heat-warm{color:#CC8800;border-color:#CC880040;background:#CC880010;}

        .heat-cool{color:#4A9FDD;border-color:#4A9FDD40;background:#4A9FDD10;}

        .heat-cold{color:#6A6660;border-color:#6A666040;background:#6A666010;}

        .regime-bull{color:#00AA55;}

        .regime-bear{color:#DD3333;}

        .regime-side{color:#CC8800;}

        .daily-main{max-width:760px;margin:0 auto;padding:2rem 1.5rem;display:flex;flex-direction:column;gap:1.5rem;}

        .report-header-card{background:#FFFFFF;border:1px solid #E0DDD4;border-radius:12px;padding:1.5rem;display:flex;flex-direction:column;gap:1rem;}

        .report-header-top{display:flex;align-items:flex-start;justify-content:space-between;gap:1rem;flex-wrap:wrap;}

        .report-breadcrumb{display:flex;align-items:center;gap:6px;}

        .breadcrumb-link{font-size:13px;color:#6A6660;font-weight:500;transition:color 0.15s;}

        .breadcrumb-link:hover{color:#1A1A1A;}

        .breadcrumb-sep{color:#C0BDB4;font-size:12px;}

        .report-badges{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}

        .regime-badge-lg{font-family:'Space Mono',monospace;font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;border:1px solid currentColor;letter-spacing:0.06em;}

        .trade-count-badge{font-family:'Space Mono',monospace;font-size:11px;padding:3px 10px;border-radius:20px;border:1px solid #E0DDD4;color:#6A6660;background:#F8F7F2;}

        .report-title{font-size:1.4rem;font-weight:700;line-height:1.35;color:#1A1A1A;letter-spacing:-0.01em;display:flex;align-items:flex-start;gap:8px;}

        .pnl-emoji{font-size:1.2rem;flex-shrink:0;margin-top:2px;}

        .insight-block{background:#F8F7F2;border:1px solid #E0DDD4;border-left:3px solid #1A1A1A;border-radius:0 8px 8px 0;padding:0.9rem 1.1rem;}

        .insight-label{font-size:10px;font-weight:700;letter-spacing:0.12em;color:#9A9690;margin-bottom:6px;}

        .insight-text{font-size:14px;line-height:1.65;color:#3A3A3A;font-style:italic;}

        .report-body-card{background:#FFFFFF;border:1px solid #E0DDD4;border-radius:12px;padding:1.5rem;}

        :global(.post-body h2){font-size:1.05rem;font-weight:700;margin:1.8rem 0 0.6rem;padding-bottom:0.4rem;border-bottom:1px solid #E0DDD4;color:#1A1A1A;}

        :global(.post-body h3){font-size:0.95rem;font-weight:700;margin:1.4rem 0 0.4rem;color:#2A2A2A;}

        :global(.post-body p){font-size:14px;line-height:1.75;color:#3A3A3A;margin-bottom:0.75rem;}

        :global(.post-body ul),:global(.post-body ol){padding-left:1.4rem;margin-bottom:0.75rem;}

        :global(.post-body li){font-size:14px;line-height:1.7;color:#3A3A3A;margin-bottom:3px;}

        :global(.post-body table){width:100%;border-collapse:collapse;font-family:'Space Mono',monospace;font-size:12px;margin:1rem 0;}

        :global(.post-body th){background:#F8F7F2;padding:8px 12px;text-align:left;border:1px solid #E0DDD4;font-size:11px;color:#6A6660;}

        :global(.post-body td){padding:7px 12px;border:1px solid #E0DDD4;color:#2A2A2A;}

        :global(.post-body tr:nth-child(even) td){background:#FAFAF8;}

        :global(.post-body code){font-family:'Space Mono',monospace;font-size:12px;background:#F0EDE8;padding:2px 6px;border-radius:4px;color:#3A3A3A;}

        :global(.post-body strong){font-weight:700;color:#1A1A1A;}

        :global(.post-body hr){border:none;border-top:1px solid #E0DDD4;margin:1.5rem 0;}

        .report-nav-row{display:flex;align-items:center;justify-content:space-between;gap:1rem;}

        .report-nav-cell{flex:1;}

        .report-nav-cell.right{text-align:right;}

        .report-nav-link{display:inline-flex;flex-direction:column;gap:2px;padding:10px 14px;background:#FFFFFF;border:1px solid #E0DDD4;border-radius:8px;transition:all 0.15s;max-width:180px;}

        .report-nav-link:hover{border-color:#1A1A1A;background:#F8F7F2;}

        .report-nav-link.right{align-items:flex-end;}

        .nav-dir{font-size:12px;color:#6A6660;font-weight:600;}

        .nav-date{font-size:11px;color:#9A9690;}

        .report-nav-all{font-size:13px;font-weight:600;color:#6A6660;padding:10px 16px;background:#F8F7F2;border:1px solid #E0DDD4;border-radius:8px;transition:all 0.15s;white-space:nowrap;}

        .report-nav-all:hover{background:#1A1A1A;color:#F8F7F2;border-color:#1A1A1A;}

        .bottom-tab-bar{display:none;position:fixed;bottom:0;left:0;right:0;height:60px;background:rgba(248,247,242,0.97);backdrop-filter:blur(12px);border-top:1px solid #E0DDD4;z-index:200;justify-content:space-around;align-items:center;}

        .tab-item{display:flex;flex-direction:column;align-items:center;gap:3px;padding:4px 12px;border-radius:8px;flex:1;}

        .tab-icon{font-size:16px;color:#9A9690;}

        .tab-label{font-size:10px;font-weight:600;color:#9A9690;letter-spacing:0.04em;}

        .tab-item.active .tab-icon,.tab-item.active .tab-label{color:#1A1A1A;}

        @media(max-width:768px){

          .nav-links{display:none;}

          .bottom-tab-bar{display:flex;}

          .daily-main{padding:1.2rem 1rem;}

          .report-header-card,.report-body-card{padding:1.1rem;}

          .report-title{font-size:1.15rem;}

          .report-header-top{flex-direction:column;}

        }

        @media(max-width:480px){

          .report-nav-row{flex-direction:column;}

          .report-nav-link{max-width:100%;width:100%;}

          .report-nav-all{width:100%;text-align:center;}

        }

      `}</style>

    </>

  )

}




export async function getStaticProps({ params }) {

  const dir      = path.join(process.cwd(), 'content', 'daily')

  const filePath = path.join(dir, `${params.date}.md`)

  const raw      = fs.readFileSync(filePath, 'utf8')

  const { data, content } = matter(raw)

  const cleanInsight = (data.insight || '').replace(/\\"/g, '"')

  let prev = null, next = null

  if (fs.existsSync(dir)) {

    const files = fs.readdirSync(dir).filter(f => f.endsWith('.md')).map(f => f.replace('.md','')).sort()

    const idx = files.indexOf(params.date)

    if (idx > 0)              prev = files[idx - 1]

    if (idx < files.length-1) next = files[idx + 1]

  }

  return {

    props: {

      meta: {

        title:       data.title       || params.date,

        date:        data.date        || params.date,

        regime:      data.regime      || 'SIDEWAYS',

        heat_score:  data.heat_score  || 50,

        heat_grade:  data.heat_grade  || 'COOL',

        pnl_emoji:   data.pnl_emoji   || '➖',

        trade_count: data.trade_count || 0,

        insight:     cleanInsight,

      },

      body: marked(content),

      prev,

      next,

    },

  }

}



export async function getStaticPaths() {

  const dir = path.join(process.cwd(), 'content', 'daily')

  let paths = []

  if (fs.existsSync(dir)) {

    const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'))

    paths = files.map(filename => ({ params: { date: filename.replace('.md','') } }))

  }

  return { paths, fallback: false }

}

