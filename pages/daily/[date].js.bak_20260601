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
        <meta property="og:title" content={meta.title} />
        <meta property="og:description" content={meta.insight || ''} />
      </Head>
      <div style={{ minHeight: "100vh", background: "#0a0c10", color: "#e8edf5", fontFamily: "'Noto Sans KR', sans-serif", padding: "0 0 80px" }}>
        <main style={{ maxWidth: "780px", margin: "0 auto", padding: "40px 24px" }}>
          {/* 날짜 + 장세 */}
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
            <span style={{ fontFamily: "monospace", fontSize: "12px", color: "#4a5568" }}>{meta.date}</span>
            <span style={{ fontFamily: "monospace", fontSize: "10px", fontWeight: 700, padding: "2px 8px", borderRadius: "4px",
              background: meta.regime === "BULL" ? "#3d0010" : meta.regime === "BEAR" ? "#0d2540" : "#151a22",
              color: meta.regime === "BULL" ? "#ff4757" : meta.regime === "BEAR" ? "#4fa3e0" : "#8a9ab5" }}>
              {meta.regime}
            </span>
            <span style={{ fontFamily: "monospace", fontSize: "11px", color: "#4a5568" }}>Heat {meta.heat_score}/100</span>
            <span style={{ fontFamily: "monospace", fontSize: "11px", color: "#4a5568" }}>매매 {meta.trade_count}건</span>
          </div>

          {/* 제목 */}
          <h1 style={{ fontSize: "22px", fontWeight: 700, color: "#e8edf5", marginBottom: "20px", lineHeight: 1.4 }}>
            {meta.pnl_emoji} {meta.title}
          </h1>

          {/* AI Insight */}
          {meta.insight && (
            <div style={{ background: "#0f1218", border: "1px solid #2a3344", borderRadius: "10px", padding: "18px 20px", marginBottom: "28px" }}>
              <div style={{ fontFamily: "monospace", fontSize: "9px", color: "#4a5568", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "10px" }}>Claude AI Insight</div>
              <p style={{ fontSize: "14px", color: "#e8edf5", lineHeight: 1.7, margin: 0, fontStyle: "italic" }}>"{meta.insight}"</p>
            </div>
          )}

          {/* 본문 */}
          <div style={{ fontSize: "14px", color: "#8a9ab5", lineHeight: 1.8 }}
            dangerouslySetInnerHTML={{ __html: body }} />

          {/* 뒤로가기 */}
          <div style={{ marginTop: "40px", paddingTop: "20px", borderTop: "1px solid #1e2530" }}>
            <Link href="/daily" style={{ fontFamily: "monospace", fontSize: "12px", color: "#4a5568", textDecoration: "none" }}>
              ← 전체 목록으로
            </Link>
          </div>

          {/* 댓글 */}
          <Comments date={meta.date} />
        </main>
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
