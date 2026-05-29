
import fs from 'fs'

import path from 'path'

import matter from 'gray-matter'

import Link from 'next/link'

import Head from 'next/head'



export default function WeeklyIndex({ reports }) {

  return (

    <>

      <Head>

        <title>ONE-HUB Weekly</title>

        <meta name="viewport" content="width=device-width, initial-scale=1" />

        <link href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Syne:wght@400;700;800&display=swap" rel="stylesheet" />

      </Head>

      <header className="site-header">

        <Link href="/">ONE-HUB</Link>

        <nav><Link href="/">Daily</Link><Link href="/weekly">Weekly</Link></nav>

      </header>

      <div className="container">

        <h1 style={{fontSize:'1.4rem',fontWeight:700,margin:'1.5rem 0 1rem'}}>Weekly Reports</h1>

        <div className="reports-grid">

          {reports.map(r => (

            <Link key={r.week} href={`/weekly/${r.week}`} className="report-card">

              <div className="card-week">{r.week}</div>

              <div className="card-range">{r.monday} ~ {r.friday}</div>

              <div className="card-stats">

                <span className={`regime-badge regime-${r.dominant_regime}`}>{r.dominant_regime}</span>

                <span>Heat {r.avg_heat}/100</span>

                <span>매매 {r.total_trades}건</span>

              </div>

            </Link>

          ))}

        </div>

      </div>

    </>

  )

}



export async function getStaticProps() {

  const dir = path.join(process.cwd(), 'content', 'weekly')

  if (!fs.existsSync(dir)) return { props: { reports: [] } }

  const files = fs.readdirSync(dir).filter(f => f.endsWith('.md')).sort().reverse()

  const reports = files.map(f => {

    const raw = fs.readFileSync(path.join(dir, f), 'utf8')

    const { data } = matter(raw)

    return {

      week: data.week || f.replace('.md',''),

      monday: data.monday || '',

      friday: data.friday || '',

      dominant_regime: data.dominant_regime || 'SIDEWAYS',

      avg_heat: data.avg_heat || 50,

      total_trades: data.total_trades || 0,

    }

  })

  return { props: { reports } }

}

