import fs from 'fs'
import path from 'path'
import matter from 'gray-matter'
import Link from 'next/link'
import Head from 'next/head'

export default function WeeklyIndex({ reports }) {
  return (
    <>
      <Head><title>Weekly Reports — ONE-HUB</title></Head>
      <div style={{ minHeight: "100vh", background: "#0a0c10", color: "#e8edf5", fontFamily: "'Noto Sans KR', sans-serif", padding: "0 0 80px" }}>
        <main style={{ maxWidth: "800px", margin: "0 auto", padding: "40px 24px" }}>
          <h1 style={{ fontFamily: "monospace", fontSize: "13px", letterSpacing: "0.2em", color: "#4a5568", textTransform: "uppercase", marginBottom: "32px" }}>
            Weekly Reports
          </h1>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {reports.map(r => (
              <Link key={r.week} href={`/weekly/${r.week}`} style={{ textDecoration: "none" }}>
                <div style={{ background: "#0f1218", border: "1px solid #1e2530", borderRadius: "10px", padding: "18px 20px", cursor: "pointer" }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = "#2a3344"}
                  onMouseLeave={e => e.currentTarget.style.borderColor = "#1e2530"}>
                  <div style={{ fontFamily: "monospace", fontSize: "13px", fontWeight: 700, color: "#e8edf5", marginBottom: "6px" }}>{r.week}</div>
                  <div style={{ fontFamily: "monospace", fontSize: "11px", color: "#8a9ab5", marginBottom: "10px" }}>{r.monday} ~ {r.friday}</div>
                  <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                    <span style={{ fontFamily: "monospace", fontSize: "10px", fontWeight: 700, padding: "2px 8px", borderRadius: "4px",
                      background: r.dominant_regime === "BULL" ? "#3d0010" : r.dominant_regime === "BEAR" ? "#0d2540" : "#151a22",
                      color: r.dominant_regime === "BULL" ? "#ff4757" : r.dominant_regime === "BEAR" ? "#4fa3e0" : "#8a9ab5" }}>
                      {r.dominant_regime}
                    </span>
                    <span style={{ fontFamily: "monospace", fontSize: "11px", color: "#4a5568" }}>Heat {r.avg_heat}/100</span>
                    <span style={{ fontFamily: "monospace", fontSize: "11px", color: "#4a5568" }}>매매 {r.total_trades}건</span>
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
  const reports = files.map(f => {
    const raw = fs.readFileSync(path.join(dir, f), 'utf8')
    const { data } = matter(raw)
    return {
      week: data.week || f.replace('.md', ''),
      monday: data.monday || '',
      friday: data.friday || '',
      dominant_regime: data.dominant_regime || 'SIDEWAYS',
      avg_heat: data.avg_heat || 50,
      total_trades: data.total_trades || 0,
    }
  })
  return { props: { reports } }
}
