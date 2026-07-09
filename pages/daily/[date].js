
import fs from 'fs'

import path from 'path'

import matter from 'gray-matter'

import { marked } from 'marked'

import Link from 'next/link'

import Head from 'next/head'

import { SITE, ORG_NAME, REGIME_KO } from '../../lib/site'

import { useEffect, useState } from 'react'



export default function DailyReport({ meta, body, prev, next }) {

  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  const regimeIcon  = (r) => r === 'BULL' ? '▲' : r === 'BEAR' ? '▼' : '➖'

  const regimeClass = (r) => r === 'BULL' ? 'regime-bull' : r === 'BEAR' ? 'regime-bear' : 'regime-side'

  const heatColor   = (g) => ({ HOT:'heat-hot', WARM:'heat-warm', COOL:'heat-cool', COLD:'heat-cold' }[g] || 'heat-cool')

  // ── SEO 파생값 (단일 출처 lib/site) ─────────────────────────
  const canonical    = `${SITE}/daily/${meta.date}`
  const regimeKo     = REGIME_KO[meta.regime] || '횡보장'
  const publishedISO = `${meta.date}T15:30:00+09:00` // 운영일지는 매일 15:30 KST 발행
  const ogImage      = `${SITE}/api/og?date=${encodeURIComponent(meta.date)}`
    + `&regime=${encodeURIComponent(meta.regime)}`
    + `&heat=${encodeURIComponent(meta.heat_score)}`
    + `&grade=${encodeURIComponent(meta.heat_grade)}`
    + `&trades=${encodeURIComponent(meta.trade_count)}`
    + `&insight=${encodeURIComponent(meta.insight || '')}`
  const keywords     = ['ONE-HUB','AI 자산운영','주식','ETF','부동산','자동매매 대안','AI 투자 판단', regimeKo, ...(meta.tags || [])].join(', ')

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: meta.title,
    description: meta.insight || meta.title,
    datePublished: publishedISO,
    dateModified: publishedISO,
    inLanguage: 'ko-KR',
    image: ogImage,
    author: { '@type': 'Organization', name: ORG_NAME },
    publisher: {
      '@type': 'Organization',
      name: 'ONE-HUB',
      logo: { '@type': 'ImageObject', url: `${SITE}/icons/icon-512.png` },
    },
    mainEntityOfPage: { '@type': 'WebPage', '@id': canonical },
    about: ['주식', 'ETF', '부동산', 'AI 자산운영', regimeKo],
  }

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

        {/* ── SEO 보강: canonical / Article OG / Twitter / 구조화 데이터 ── */}

        <link rel="canonical" href={canonical} />

        <meta name="keywords" content={keywords} />

        <meta property="og:type" content="article" />

        <meta property="og:site_name" content="ONE-HUB" />

        <meta property="og:locale" content="ko_KR" />

        <meta property="og:url" content={canonical} />

        <meta property="og:image" content={ogImage} />

        <meta property="og:image:width" content="1200" />

        <meta property="og:image:height" content="630" />

        <meta property="og:image:alt" content={`${meta.date} ${regimeKo} · ONE-HUB 오늘의 AI 자산운영 판단`} />

        <meta property="article:published_time" content={publishedISO} />

        <meta name="twitter:card" content="summary_large_image" />

        <meta name="twitter:title" content={meta.title} />

        <meta name="twitter:description" content={meta.insight || meta.title} />

        <meta name="twitter:image" content={ogImage} />

        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      </Head>

      <div className="page-wrapper">


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

                <span className="mono" style={{fontSize:'12px',color:'#94A3B8'}}>{meta.date}</span>

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


      </div>
      <style jsx>{`

        .page-wrapper{min-height:100vh;background:#F4F9FF;color:#12213B;font-family:'Pretendard',sans-serif;padding-bottom:80px;}

        .nav{position:sticky;top:0;z-index:100;background:rgba(248,247,242,0.95);backdrop-filter:blur(12px);border-bottom:1px solid #E8EEF7;height:56px;}

        .nav-inner{max-width:1080px;margin:0 auto;padding:0 1.5rem;height:100%;display:flex;align-items:center;gap:2rem;}

        .nav-logo{font-family:'Space Mono',monospace;font-size:14px;font-weight:700;letter-spacing:0.08em;color:#12213B;white-space:nowrap;}

        .logo-bracket{color:#16C784;}

        .nav-links{display:flex;gap:0.1rem;flex:1;overflow-x:auto;scrollbar-width:none;}

        .nav-links::-webkit-scrollbar{display:none;}

        .nav-link{font-size:13px;font-weight:600;padding:6px 12px;border-radius:6px;color:#475569;transition:all 0.15s;white-space:nowrap;}

        .nav-link:hover{background:#EAF1FF;color:#12213B;}

        .nav-link.active{background:#12213B;color:#F4F9FF;}

        .nav-link.dim{color:#94A3B8;}

        .status-bar{background:#12213B;color:#F4F9FF;display:flex;align-items:center;gap:0.75rem;padding:0 1.5rem;height:36px;font-size:11px;overflow-x:auto;scrollbar-width:none;}

        .status-bar::-webkit-scrollbar{display:none;}

        .status-item{white-space:nowrap;}

        .status-divider{color:#475569;}

        .mono{font-family:'Space Mono',monospace;}

        .heat-indicator{font-family:'Space Mono',monospace;font-size:11px;padding:3px 10px;border-radius:20px;border:1px solid;}

        .heat-hot{color:#DD3333;border-color:#DD333340;background:#DD333310;}

        .heat-warm{color:#CC8800;border-color:#CC880040;background:#CC880010;}

        .heat-cool{color:#2F6BFF;border-color:#2F6BFF40;background:#2F6BFF10;}

        .heat-cold{color:#64748B;border-color:#64748B40;background:#64748B10;}

        .regime-bull{color:#16C784;}

        .regime-bear{color:#DD3333;}

        .regime-side{color:#CC8800;}

        .daily-main{max-width:760px;margin:0 auto;padding:2rem 1.5rem;display:flex;flex-direction:column;gap:1.5rem;}

        .report-header-card{background:#FFFFFF;border:1px solid #E8EEF7;border-radius:12px;padding:1.5rem;display:flex;flex-direction:column;gap:1rem;}

        .report-header-top{display:flex;align-items:flex-start;justify-content:space-between;gap:1rem;flex-wrap:wrap;}

        .report-breadcrumb{display:flex;align-items:center;gap:6px;}

        .breadcrumb-link{font-size:13px;color:#64748B;font-weight:500;transition:color 0.15s;}

        .breadcrumb-link:hover{color:#12213B;}

        .breadcrumb-sep{color:#CBD5E1;font-size:12px;}

        .report-badges{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}

        .regime-badge-lg{font-family:'Space Mono',monospace;font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;border:1px solid currentColor;letter-spacing:0.06em;}

        .trade-count-badge{font-family:'Space Mono',monospace;font-size:11px;padding:3px 10px;border-radius:20px;border:1px solid #E8EEF7;color:#64748B;background:#F4F9FF;}

        .report-title{font-size:1.4rem;font-weight:700;line-height:1.35;color:#12213B;letter-spacing:-0.01em;display:flex;align-items:flex-start;gap:8px;}

        .pnl-emoji{font-size:1.2rem;flex-shrink:0;margin-top:2px;}

        .insight-block{background:#F4F9FF;border:1px solid #E8EEF7;border-left:3px solid #12213B;border-radius:0 8px 8px 0;padding:0.9rem 1.1rem;}

        .insight-label{font-size:10px;font-weight:700;letter-spacing:0.12em;color:#94A3B8;margin-bottom:6px;}

        .insight-text{font-size:14px;line-height:1.65;color:#334155;font-style:italic;}

        .report-body-card{background:#FFFFFF;border:1px solid #E8EEF7;border-radius:12px;padding:1.5rem;}

        :global(.post-body h2){font-size:1.05rem;font-weight:700;margin:1.8rem 0 0.6rem;padding-bottom:0.4rem;border-bottom:1px solid #E8EEF7;color:#12213B;}

        :global(.post-body h3){font-size:0.95rem;font-weight:700;margin:1.4rem 0 0.4rem;color:#1E293B;}

        :global(.post-body p){font-size:14px;line-height:1.75;color:#334155;margin-bottom:0.75rem;}

        :global(.post-body ul),:global(.post-body ol){padding-left:1.4rem;margin-bottom:0.75rem;}

        :global(.post-body li){font-size:14px;line-height:1.7;color:#334155;margin-bottom:3px;}

        :global(.post-body table){width:100%;border-collapse:collapse;font-family:'Space Mono',monospace;font-size:12px;margin:1rem 0;}

        :global(.post-body th){background:#F4F9FF;padding:8px 12px;text-align:left;border:1px solid #E8EEF7;font-size:11px;color:#64748B;}

        :global(.post-body td){padding:7px 12px;border:1px solid #E8EEF7;color:#1E293B;}

        :global(.post-body tr:nth-child(even) td){background:#F8FAFC;}

        :global(.post-body code){font-family:'Space Mono',monospace;font-size:12px;background:#EEF3FB;padding:2px 6px;border-radius:4px;color:#334155;}

        :global(.post-body strong){font-weight:700;color:#12213B;}

        :global(.post-body hr){border:none;border-top:1px solid #E8EEF7;margin:1.5rem 0;}

        .report-nav-row{display:flex;align-items:center;justify-content:space-between;gap:1rem;}

        .report-nav-cell{flex:1;}

        .report-nav-cell.right{text-align:right;}

        .report-nav-link{display:inline-flex;flex-direction:column;gap:2px;padding:10px 14px;background:#FFFFFF;border:1px solid #E8EEF7;border-radius:8px;transition:all 0.15s;max-width:180px;}

        .report-nav-link:hover{border-color:#12213B;background:#F4F9FF;}

        .report-nav-link.right{align-items:flex-end;}

        .nav-dir{font-size:12px;color:#64748B;font-weight:600;}

        .nav-date{font-size:11px;color:#94A3B8;}

        .report-nav-all{font-size:13px;font-weight:600;color:#64748B;padding:10px 16px;background:#F4F9FF;border:1px solid #E8EEF7;border-radius:8px;transition:all 0.15s;white-space:nowrap;}

        .report-nav-all:hover{background:#12213B;color:#F4F9FF;border-color:#12213B;}

        .bottom-tab-bar{display:none;position:fixed;bottom:0;left:0;right:0;height:60px;background:rgba(248,247,242,0.97);backdrop-filter:blur(12px);border-top:1px solid #E8EEF7;z-index:200;justify-content:space-around;align-items:center;}

        .tab-item{display:flex;flex-direction:column;align-items:center;gap:3px;padding:4px 12px;border-radius:8px;flex:1;}

        .tab-icon{font-size:16px;color:#94A3B8;}

        .tab-label{font-size:10px;font-weight:600;color:#94A3B8;letter-spacing:0.04em;}

        .tab-item.active .tab-icon,.tab-item.active .tab-label{color:#12213B;}

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

        tags:        data.tags || [],

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

