import fs from 'fs'
import path from 'path'
import matter from 'gray-matter'
import Link from 'next/link'
import Head from 'next/head'
import { useState } from 'react'
import CTABar from '../../components/CTABar'

export default function WeeklyIndex({ reports }) {
  const [selectedRegime, setSelectedRegime] = useState('ALL')

  // ① 최근 4주 KPI 계산
  const recent4 = reports.slice(0, 4)
  const avgHeat   = recent4.length ? Math.round(recent4.reduce((s, r) => s + (r.avg_heat || 0), 0) / recent4.length) : null
  const totalTrades = recent4.reduce((s, r) => s + (r.total_trades || 0), 0)
  const recentReports = reports.filter(r => r.dominant_regime === 'BEAR' || r.dominant_regime === 'BULL' || r.dominant_regime === 'SIDEWAYS')

  // ② Regime 필터
  const filtered = selectedRegime === 'ALL' ? reports : reports.filter(r => r.dominant_regime === selectedRegime)

  const regimeBg  = (r) => r === 'BULL' ? '#FDEAEA' : r === 'BEAR' ? '#EAF3FB' : '#F0EDE8'
  const regimeClr = (r) => r === 'BULL' ? '#DD3333' : r === 'BEAR' ? '#3A8BD4' : '#6A6660'

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
          <h1 style={{ fontFamily: "monospace", fontSize: "13px", letterSpacing: "0.2em", color: "#9A9690", textTransform: "uppercase", marginBottom: "24px" }}>
            Weekly Reports
          </h1>

          {/* ① KPI 요약 카드 (최근 4주) */}
          {recent4.length > 0 && (
            <div style={{ background: "#FFFFFF", border: "1px solid #E0DDD4", borderRadius: 12, padding: "18px 20px", marginBottom: 24 }}>
              <div style={{ fontFamily: "monospace", fontSize: "10px", color: "#9A9690", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 14 }}>
                📊 주간 성과 요약 (최근 {recent4.length}주)
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
                {[
                  { label: "평균 Heat",  val: avgHeat != null ? `${avgHeat}/100` : "-" },
                  { label: "총 매수",    val: `${totalTrades}건` },
                  { label: "기록 수",    val: `${reports.length}주` },
                  { label: "최신",       val: reports[0]?.week ?? "-" },
                ].map(({ label, val }) => (
                  <div key={label} style={{ textAlign: "center" }}>
                    <div style={{ fontFamily: "monospace", fontSize: "14px", fontWeight: 800, color: "#1A1A1A", marginBottom: 4 }}>{val}</div>
                    <div style={{ fontSize: "10px", color: "#9A9690" }}>{label}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ② Regime 필터 */}
          <div style={{ display: "flex", gap: 6, marginBottom: 20, flexWrap: "wrap" }}>
            {['ALL', 'BULL', 'BEAR', 'SIDEWAYS'].map(r => (
              <button key={r} onClick={() => setSelectedRegime(r)}
                style={{ padding: "5px 14px", borderRadius: 6, border: "1px solid #E0DDD4",
                  background: selectedRegime === r ? "#1A1A1A" : "#FFFFFF",
                  color: selectedRegime === r ? "#F8F7F2" : "#6A6660",
                  cursor: "pointer", fontFamily: "monospace", fontSize: "11px", fontWeight: selectedRegime === r ? 700 : 400 }}>
                {r === 'ALL' ? '전체' : r}
              </button>
            ))}
            <span style={{ fontFamily: "monospace", fontSize: "11px", color: "#9A9690", alignSelf: "center", marginLeft: "auto" }}>
              {filtered.length}개 리포트
            </span>
          </div>

          {/* 리포트 목록 */}
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {filtered.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 0", color: "#9A9690", fontFamily: "monospace", fontSize: "12px" }}>
                해당 Regime의 리포트가 없습니다.
              </div>
            ) : filtered.map(r => (
              <Link key={r.week} href={`/weekly/${r.week}`} style={{ textDecoration: "none" }}>
                <div style={{ background: "#FFFFFF", border: "1px solid #E0DDD4", borderRadius: "10px", padding: "18px 20px", cursor: "pointer" }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = "#D0CCC4"}
                  onMouseLeave={e => e.currentTarget.style.borderColor = "#E0DDD4"}>
                  <div style={{ fontFamily: "monospace", fontSize: "13px", fontWeight: 700, color: "#1A1A1A", marginBottom: "6px" }}>{r.week}</div>
                  <div style={{ fontFamily: "monospace", fontSize: "11px", color: "#6A6660", marginBottom: "10px" }}>
                    {r.monday && r.friday ? `${r.monday} ~ ${r.friday}` : r.monday || r.friday || ""}
                  </div>
                  <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                    <span style={{ fontFamily: "monospace", fontSize: "10px", fontWeight: 700, padding: "2px 8px", borderRadius: "4px",
                      background: regimeBg(r.dominant_regime), color: regimeClr(r.dominant_regime) }}>
                      {r.dominant_regime || "SIDEWAYS"}
                    </span>
                    <span style={{ fontFamily: "monospace", fontSize: "11px", color: "#9A9690" }}>Heat {r.avg_heat}/100</span>
                    <span style={{ fontFamily: "monospace", fontSize: "11px", color: "#9A9690" }}>매매 {r.total_trades}건</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
          <CTABar />
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
    if (seen.has(week)) return acc
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
