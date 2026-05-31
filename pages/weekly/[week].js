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
        <title>{meta.week} — ONE-HUB Weekly</title>
        <meta name="description" content={`ONE-HUB 주간 리포트 ${meta.week}`} />
      </Head>
      <div style={{ minHeight: "100vh", background: "#0a0c10", color: "#e8edf5", fontFamily: "'Noto Sans KR', sans-serif", padding: "0 0 80px" }}>
        <main style={{ maxWidth: "780px", margin: "0 auto", padding: "40px 24px" }}>
          {/* 헤더 정보 */}
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
            <span style={{ fontFamily: "monospace", fontSize: "12px", color: "#4a5568" }}>{meta.monday} ~ {meta.friday}</span>
            <span style={{ fontFamily: "monospace", fontSize: "10px", fontWeight: 700, padding: "2px 8px", borderRadius: "4px",
              background: meta.dominant_regime === "BULL" ? "#3d0010" : meta.dominant_regime === "BEAR" ? "#0d2540" : "#151a22",
              color: meta.dominant_regime === "BULL" ? "#ff4757" : meta.dominant_regime === "BEAR" ? "#4fa3e0" : "#8a9ab5" }}>
              {meta.dominant_regime}
            </span>
            <span style={{ fontFamily: "monospace", fontSize: "11px", color: "#4a5568" }}>Heat {meta.avg_heat}/100</span>
            <span style={{ fontFamily: "monospace", fontSize: "11px", color: "#4a5568" }}>매매 {meta.total_trades}건</span>
          </div>

          {/* 제목 */}
          <h1 style={{ fontSize: "22px", fontWeight: 700, color: "#e8edf5", marginBottom: "20px", lineHeight: 1.4 }}>
            {meta.week} 주간 리포트
          </h1>

          {/* AI Insight */}
          {meta.insight && (
            <div style={{ background: "#0f1218", border: "1px solid #2a3344", borderRadius: "10px", padding: "18px 20px", marginBottom: "28px" }}>
              <div style={{ fontFamily: "monospace", fontSize: "9px", color: "#4a5568", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "10px" }}>Weekly AI Insight</div>
              <p style={{ fontSize: "14px", color: "#e8edf5", lineHeight: 1.7, margin: 0, fontStyle: "italic" }}>"{meta.insight}"</p>
            </div>
          )}

          {/* 본문 */}
          {body && (
            <div style={{ fontSize: "14px", color: "#8a9ab5", lineHeight: 1.8 }}
              dangerouslySetInnerHTML={{ __html: body }} />
          )}

          {/* 뒤로가기 */}
          <div style={{ marginTop: "40px", paddingTop: "20px", borderTop: "1px solid #1e2530" }}>
            <Link href="/weekly" style={{ fontFamily: "monospace", fontSize: "12px", color: "#4a5568", textDecoration: "none" }}>
              ← 전체 목록으로
            </Link>
          </div>
        </main>
      </div>
    </>
  )
}

export async function getStaticProps({ params }) {
  const filePath = path.join(process.cwd(), 'content', 'weekly', `${params.week}.md`)
  if (!fs.existsSync(filePath)) return { notFound: true }
  const raw = fs.readFileSync(filePath, 'utf8')
  const { data, content } = matter(raw)
  return {
    props: {
      meta: {
        week:             data.week             || params.week,
        monday:           data.monday           || '',
        friday:           data.friday           || '',
        dominant_regime:  data.dominant_regime  || 'SIDEWAYS',
        avg_heat:         data.avg_heat         || 50,
        total_trades:     data.total_trades     || 0,
        insight:          data.insight          || '',
      },
      body: content ? marked(content) : '',
    },
  }
}

export async function getStaticPaths() {
  const dir = path.join(process.cwd(), 'content', 'weekly')
  if (!fs.existsSync(dir)) return { paths: [], fallback: false }
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'))
  return {
    paths: files.map(f => ({ params: { week: f.replace('.md', '') } })),
    fallback: false,
  }
}
