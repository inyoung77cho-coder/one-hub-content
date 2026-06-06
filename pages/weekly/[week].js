import fs from 'fs'
import path from 'path'
import matter from 'gray-matter'
import { marked } from 'marked'
import Link from 'next/link'
import Head from 'next/head'

export default function WeeklyReport({ meta, body }) {
  const regimeColor = meta.dominant_regime === 'BULL' ? '#00AA55' : meta.dominant_regime === 'BEAR' ? '#DD3333' : '#F5A623'
  const regimeBg = meta.dominant_regime === 'BULL' ? '#EAF8F0' : meta.dominant_regime === 'BEAR' ? '#FDEAEA' : '#FFF8EE'
  return (
    <>
      <Head>
        <title>{meta.week} — ONE-HUB Weekly</title>
        <meta name="description" content={`ONE-HUB 주간 리포트 ${meta.week}`} />
      </Head>
      <div style={{ minHeight: "100vh", background: "#F8F7F2", fontFamily: "'Noto Sans KR', sans-serif", padding: "0 0 80px" }}>
        <main style={{ maxWidth: "780px", margin: "0 auto", padding: "40px 24px" }}>
          <div style={{ marginBottom: "32px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px", flexWrap: "wrap" }}>
              <span style={{ fontFamily: "monospace", fontSize: "11px", color: "#9A9690" }}>{meta.monday} ~ {meta.friday}</span>
              <span style={{ fontFamily: "monospace", fontSize: "10px", fontWeight: 700, padding: "2px 8px", borderRadius: "4px", background: regimeBg, color: regimeColor }}>{meta.dominant_regime}</span>
              <span style={{ fontFamily: "monospace", fontSize: "11px", color: "#9A9690" }}>Heat {meta.avg_heat}/100</span>
              <span style={{ fontFamily: "monospace", fontSize: "11px", color: "#9A9690" }}>매매 {meta.total_trades}건</span>
            </div>
            <h1 style={{ fontSize: "22px", fontWeight: 700, color: "#1A1A1A", margin: "0 0 8px", lineHeight: 1.4 }}>{meta.week} 주간 운영 보고서</h1>
            <p style={{ fontSize: "13px", color: "#9A9690", margin: 0, fontFamily: "monospace" }}>ONE-HUB AI Trading Engine — 의사결정 과정 공개</p>
          </div>
          {meta.insight && (
            <section style={{ background: "#1A1A1A", borderRadius: "10px", padding: "20px 24px", marginBottom: "20px" }}>
              <div style={{ fontFamily: "monospace", fontSize: "9px", color: "#9A9690", letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: "12px" }}>01 · Executive Summary</div>
              <p style={{ fontSize: "14px", color: "#F8F7F2", lineHeight: 1.8, margin: 0 }}>{meta.insight}</p>
            </section>
          )}
          <section style={{ background: "#FFFFFF", border: "1px solid #E0DDD4", borderRadius: "10px", padding: "20px 24px", marginBottom: "20px" }}>
            <div style={{ fontFamily: "monospace", fontSize: "9px", color: "#9A9690", letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: "16px" }}>02 · Weekly Performance</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "12px" }}>
              {[
                { label: "운영 일수", value: meta.trade_days + "일" },
                { label: "총 매매", value: meta.total_trades + "건" },
                { label: "Regime", value: meta.dominant_regime },
                { label: "Avg Heat", value: meta.avg_heat + "/100" },
              ].map((item, i) => (
                <div key={i} style={{ background: "#F8F7F2", borderRadius: "8px", padding: "12px 14px" }}>
                  <div style={{ fontFamily: "monospace", fontSize: "10px", color: "#9A9690", marginBottom: "6px" }}>{item.label}</div>
                  <div style={{ fontFamily: "monospace", fontSize: "16px", fontWeight: 700, color: "#1A1A1A" }}>{item.value}</div>
                </div>
              ))}
            </div>
            {meta.total_trades === 0 && (
              <div style={{ marginTop: "14px", padding: "10px 14px", background: "#F0EDE8", borderRadius: "6px", fontFamily: "monospace", fontSize: "12px", color: "#6A6660" }}>
                이번 주 매매 없음 — 시스템이 진입 조건 미충족으로 전량 차단
              </div>
            )}
          </section>
          {body && (
            <section style={{ background: "#FFFFFF", border: "1px solid #E0DDD4", borderRadius: "10px", padding: "20px 24px", marginBottom: "20px" }}>
              <div style={{ fontFamily: "monospace", fontSize: "9px", color: "#9A9690", letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: "16px" }}>03 · Market Review</div>
              <div style={{ fontSize: "13px", color: "#3A3A3A", lineHeight: 1.8 }} dangerouslySetInnerHTML={{ __html: body }} />
            </section>
          )}
          <section style={{ background: "#FFFFFF", border: "1px solid #E0DDD4", borderRadius: "10px", padding: "20px 24px", marginBottom: "20px" }}>
            <div style={{ fontFamily: "monospace", fontSize: "9px", color: "#9A9690", letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: "8px" }}>04 · Blocked Signal Review</div>
            <div style={{ fontFamily: "monospace", fontSize: "11px", color: "#6A6660", marginBottom: "14px" }}>ONE-HUB가 진입을 차단한 신호 — 핵심 차별점</div>
            {meta.blocked_count > 0 ? (
              <div style={{ fontFamily: "monospace", fontSize: "13px", color: "#1A1A1A" }}>이번 주 <strong>{meta.blocked_count}건</strong>의 신호를 차단했습니다.</div>
            ) : (
              <div style={{ padding: "12px 14px", background: "#F0EDE8", borderRadius: "6px", fontFamily: "monospace", fontSize: "12px", color: "#6A6660" }}>차단 데이터 준비 중 — 다음 버전에서 상세 내역이 공개됩니다</div>
            )}
          </section>
          <section style={{ background: "#FFFFFF", border: "1px solid #E0DDD4", borderRadius: "10px", padding: "20px 24px", marginBottom: "20px" }}>
            <div style={{ fontFamily: "monospace", fontSize: "9px", color: "#9A9690", letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: "16px" }}>05 · Engine Evolution</div>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "12px" }}>
              <span style={{ fontFamily: "monospace", fontSize: "18px", fontWeight: 700, color: "#1A1A1A" }}>{meta.version || 'v8.0'}</span>
              <span style={{ fontFamily: "monospace", fontSize: "11px", color: "#9A9690" }}>현재 운영 버전</span>
            </div>
            {meta.improvements ? (
              <p style={{ fontSize: "13px", color: "#3A3A3A", lineHeight: 1.7, margin: 0 }}>{meta.improvements}</p>
            ) : (
              <div style={{ padding: "12px 14px", background: "#F0EDE8", borderRadius: "6px", fontFamily: "monospace", fontSize: "12px", color: "#6A6660" }}>이번 주 엔진 개선 내역이 기록되면 여기에 표시됩니다</div>
            )}
          </section>
          {meta.next_week_outlook && (
            <section style={{ background: "#EAF8F0", border: "1px solid #B8E8D0", borderRadius: "10px", padding: "20px 24px", marginBottom: "20px" }}>
              <div style={{ fontFamily: "monospace", fontSize: "9px", color: "#00AA55", letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: "12px" }}>06 · Next Week Outlook</div>
              <p style={{ fontSize: "13px", color: "#1A1A1A", lineHeight: 1.8, margin: 0 }}>{meta.next_week_outlook}</p>
            </section>
          )}
          <div style={{ marginTop: "40px", paddingTop: "20px", borderTop: "1px solid #E0DDD4" }}>
            <Link href="/weekly" style={{ fontFamily: "monospace", fontSize: "12px", color: "#9A9690", textDecoration: "none" }}>← 전체 목록으로</Link>
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
        week:              data.week             || params.week,
        monday:            data.monday           || '',
        friday:            data.friday           || '',
        dominant_regime:   data.dominant_regime  || 'SIDEWAYS',
        avg_heat:          data.avg_heat         || 50,
        total_trades:      data.total_trades     || 0,
        trade_days:        data.trade_days       || 0,
        insight:           data.insight          || '',
        blocked_count:     data.blocked_count    || 0,
        version:           data.version          || 'v8.0',
        improvements:      data.improvements     || '',
        next_week_outlook: data.next_week_outlook || '',
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