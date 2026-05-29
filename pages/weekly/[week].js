
import fs from 'fs'

import path from 'path'

import matter from 'gray-matter'

import { marked } from 'marked'

import Link from 'next/link'

import Head from 'next/head'



export default function WeeklyReport({ meta, body }) {

  return (

    <>

      <Head>

        <title>{meta.title} — ONE-HUB</title>

        <meta name="viewport" content="width=device-width, initial-scale=1" />

        <link href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Syne:wght@400;700;800&display=swap" rel="stylesheet" />

      </Head>

      <header className="site-header">

        <Link href="/">ONE-HUB</Link>

        <nav><Link href="/">Daily</Link><Link href="/weekly">Weekly</Link></nav>

      </header>

      <div className="container">

        <h1 style={{fontSize:'1.4rem',fontWeight:700,margin:'1.5rem 0 0.5rem'}}>{meta.title}</h1>

        <div className="post-meta">

          <span>{meta.monday} ~ {meta.friday}</span>

          <span className={`regime-badge regime-${meta.dominant_regime}`}>{meta.dominant_regime}</span>

          <span>Heat {meta.avg_heat}/100</span>

          <span>매매 {meta.total_trades}건</span>

        </div>

        <div className="post-body" dangerouslySetInnerHTML={{ __html: body }} />

        <div style={{marginTop:'2rem',paddingTop:'1rem',borderTop:'1px solid #222'}}>

          <Link href="/weekly" style={{color:'#4a90e2',textDecoration:'none',fontSize:'0.9rem'}}>

            ← Weekly 목록으로

          </Link>

        </div>

      </div>

    </>

  )

}



export async function getStaticProps({ params }) {

  const filePath = path.join(process.cwd(), 'content', 'weekly', `${params.week}.md`)

  const raw = fs.readFileSync(filePath, 'utf8')

  const { data, content } = matter(raw)

  return {

    props: {

      meta: {

        title: data.title || params.week,

        monday: data.monday || '',

        friday: data.friday || '',

        dominant_regime: data.dominant_regime || 'SIDEWAYS',

        avg_heat: data.avg_heat || 50,

        total_trades: data.total_trades || 0,

      },

      body: marked(content),

    },

  }

}



export async function getStaticPaths() {

  const dir = path.join(process.cwd(), 'content', 'weekly')

  if (!fs.existsSync(dir)) return { paths: [], fallback: false }

  const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'))

  return {

    paths: files.map(f => ({ params: { week: f.replace('.md','') } })),

    fallback: false,

  }

}

