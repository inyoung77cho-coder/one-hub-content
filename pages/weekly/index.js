import fs from 'fs'
import path from 'path'
import matter from 'gray-matter'
import Link from 'next/link'
import Head from 'next/head'

export default function WeeklyIndex({ reports }) {
  return (
    <>
      <Head>

        <title>Weekly Reports — ONE-HUB</title>

        <meta name="description" content="ONE-HUB 주간 운영 리포트. 매주 금요일 한 주간의 시장 분석과 운영 회고를 발행합니다." />

        <meta name="viewport" content="width=device-width, initial-scale=1" />

        <meta property="og:title" content="Weekly Reports — ONE-HUB" />

        <meta property="og:description" content="ONE-HUB 주간 운영 리포트. 매주 금요일 한 주간의 시장 분석과 운영 회고를 발행합니다." />

        <meta property="og:url" content="https://one-hub-content.vercel.app/weekly" />

        <meta property="og:type" content="website" />

        <meta property="og:site_name" content="ONE-HUB" />

        <meta name="twitter:card" content="summary" />

        <meta name="twitter:title" content="Weekly Reports — ONE-HUB" />

        <meta name="twitter:description" content="ONE-HUB 주간 운영 리포트. 매주 금요일 한 주간의 시장 분석과 운영 회고를 발행합니다." />

      </Head>
      <div style={{ minHeight: "100vh", background: "#F8F7F2", color: "#1a202c", fontFamily: "'Noto Sans KR', sans-serif", padding: "0 0 80px" }}>
        <main style={{ maxWidth: "800px", margin: "0 auto", padding: "40px 24px" }}>
          <h1 style={{ fontFamily: "monospace", fontSize: "13px", letterSpacing: "0.2em", color: "#9A9690", textTransform: "uppercase", marginBottom: "32px" }}>
            Weekly Reports
          </h1>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {reports.map(r => (
              <Link key={r.week} href={`/weekly/${r.week}`} style={{ textDecoration: "none" }}>
                <div style={{ background: "#FFFFFF", border: "1px solid #E0DDD4", borderRadius: "10px", padding: "18px 20px", cursor: "pointer" }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = "#D0CCC4"}
                  onMouseLeave={e => e.currentTarget.style.borderColor = "#E0DDD4"}>
                  <div style={{ fontFamily: "monospace", fontSize: "13px", fontWeight: 700, color: "#1A1A1A", marginBottom: "6px" }}>{r.week}</div>
                  <div style={{ fontFamily: "monospace", fontSize: "11px", color: "#6A6660", marginBottom: "10px" }}>{r.monday} ~ {r.friday}</div>
                  <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                    <span style={{ fontFamily: "monospace", fontSize: "10px", fontWeight: 700, padding: "2px 8px", borderRadius: "4px",
                      background: r.dominant_regime === "BULL" ? "#FDEAEA" : r.dominant_regime === "BEAR" ? "#EAF3FB" : "#F0EDE8",
                      color: r.dominant_regime === "BULL" ? "#DD3333" : r.dominant_regime === "BEAR" ? "#3A8BD4" : "#6A6660" }}>
                      {r.dominant_regime}
                    </span>
                    <span style={{ fontFamily: "monospace", fontSize: "11px", color: "#9A9690" }}>Heat {r.avg_heat}/100</span>
                    <span style={{ fontFamily: "monospace", fontSize: "11px", color: "#9A9690" }}>매매 {r.total_trades}건</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </main>
      </div>
    </>
  )
}

export async function getStaticProps() {
  const dir = path.join(process.cwd(), 'content', 'weekly')
  if (!fs.existsSync(dir)) return { props: { reports: [] } }
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.md')).sort().reverse()
  const seen = new Set()
  const reports = files.reduce((acc, f) => {
    const raw = fs.readFileSync(path.join(dir, f), 'utf8')
    const { data } = matter(raw)
    const week = data.week || data.slug || f.replace('.md', '')
    if (seen.has(week)) return acc   // 중복 주차 제거
    seen.add(week)
    acc.push({
      week,
      monday: data.monday || data.mon || '',
      friday: data.friday || data.fri || '',
      dominant_regime: data.dominant_regime || 'SIDEWAYS',
      avg_heat: data.avg_heat || 50,
      total_trades: data.total_trades || data.trade_count || 0,
    })
    return acc
  }, [])
  return { props: { reports } }
}
