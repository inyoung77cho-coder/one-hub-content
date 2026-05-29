
import fs from 'fs'

import path from 'path'

import matter from 'gray-matter'

import { marked } from 'marked'

import Link from 'next/link'

import Head from 'next/head'

import dynamic from 'next/dynamic'



const Comments = dynamic(() => import('../../components/Comments'), { ssr: false })



export default function DailyReport({ meta, body }) {

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



      <header className="site-header">

        <Link href="/">ONE-HUB</Link>

        <nav>

          <Link href="/">Daily</Link>

        </nav>

      </header>



      <div className="container">

        <h1 style={{fontSize:'1.4rem', fontWeight:700, margin:'1.5rem 0 0.5rem'}}>

          {meta.pnl_emoji} {meta.title}

        </h1>



        <div className="post-meta">

          <span>{meta.date}</span>

          <span className={`regime-badge regime-${meta.regime}`}>

            {meta.regime}

          </span>

          <span>Heat {meta.heat_score}/100 ({meta.heat_grade})</span>

          <span>매매 {meta.trade_count}건</span>

        </div>



        {meta.insight && (

          <div className="insight-box">

            {meta.insight}

          </div>

        )}



        <div

          className="post-body"

          dangerouslySetInnerHTML={{ __html: body }}

        />



        <div style={{marginTop:'2rem', paddingTop:'1rem', borderTop:'1px solid #222'}}>

          <Link href="/" style={{color:'#4a90e2', textDecoration:'none', fontSize:'0.9rem'}}>

            ← 전체 목록으로

          </Link>

        </div>



        <Comments date={meta.date} />



      </div>

    </>

  )

}



export async function getStaticProps({ params }) {

  const filePath = path.join(process.cwd(), 'content', 'daily', `${params.date}.md`)

  const raw = fs.readFileSync(filePath, 'utf8')

  const { data, content } = matter(raw)

  const cleanInsight = (data.insight || '').replace(/\\"/g, '"')

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

    },

  }

}



export async function getStaticPaths() {

  const dir = path.join(process.cwd(), 'content', 'daily')

  const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'))

  return {

    paths: files.map(f => ({ params: { date: f.replace('.md', '') } })),

    fallback: false,

  }

}

