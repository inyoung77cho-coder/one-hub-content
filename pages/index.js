import fs from 'fs'
import path from 'path'
import matter from 'gray-matter'
import Link from 'next/link'
import Head from 'next/head'

export default function Home({ posts, stats }) {
  const latest = posts[0]
  return (
    <>
      <Head>
        <title>ONE-HUB — AI 자동매매 운영일지</title>
        <meta name="viewport" content="width=device-width, initial-scale=1"/>
      </Head>

      <header className="site-header">
        <Link href="/">ONE-HUB</Link>
        <nav><Link href="/">Daily</Link></nav>
      </header>

      <div className="hero">
        <h1>ONE-HUB Daily Report</h1>
        <p>AI 자동매매 운영 기록 — 성공과 실패를 솔직하게</p>
      </div>

      <div className="container">

        {/* 오늘의 요약 대시보드 */}
        {latest && (
          <div className="dashboard">
            <h2 className="section-title">📊 오늘의 요약 ({latest.date})</h2>
            <div className="dashboard-grid">
              <div className="dash-card">
                <div className="dash-label">Market Regime</div>
                <div className={`regime-badge regime-${latest.regime}`}>{latest.regime}</div>
              </div>
              <div className="dash-card">
                <div className="dash-label">Heat Score</div>
                <div className="dash-value">{latest.heat_score}/100</div>
                <div className="dash-sub">{latest.heat_grade}</div>
              </div>
              <div className="dash-card">
                <div className="dash-label">오늘 손익</div>
                <div className="dash-value">{latest.pnl_emoji}</div>
              </div>
              <div className="dash-card">
                <div className="dash-label">매매 건수</div>
                <div className="dash-value">{latest.trade_count}건</div>
              </div>
            </div>
            {latest.insight && (
              <div className="insight-box">💡 {latest.insight}</div>
            )}
          </div>
        )}

        {/* 누적 통계 */}
        <div className="stats-row">
          <div className="stat-item">
            <div className="stat-num">{stats.total}</div>
            <div className="stat-label">총 운영일</div>
          </div>
          <div className="stat-item">
            <div className="stat-num">{stats.bull}</div>
            <div className="stat-label">🟢 BULL</div>
          </div>
          <div className="stat-item">
            <div className="stat-num">{stats.sideways}</div>
            <div className="stat-label">🟡 SIDEWAYS</div>
          </div>
          <div className="stat-item">
            <div className="stat-num">{stats.bear}</div>
            <div className="stat-label">🔴 BEAR</div>
          </div>
        </div>

        {/* 일별 리포트 목록 */}
        <h2 className="section-title">📅 Daily 리포트</h2>
        <div className="card-grid">
          {posts.map(post => (
            <Link key={post.slug} href={`/daily/${post.slug}`} className="card">
              <div className="card-date">
                {post.date}
                <span className={`regime-badge regime-${post.regime}`}>{post.regime}</span>
                <span className="heat-badge">🌡 {post.heat_score}</span>
              </div>
              <div className="card-title">
                <span className="card-emoji">{post.pnl_emoji}</span>
                {post.title}
              </div>
              {post.insight && (
                <div className="card-insight">💡 {post.insight}</div>
              )}
              <div className="card-meta">매매 {post.trade_count}건</div>
            </Link>
          ))}
        </div>
        {posts.length === 0 && (
          <p style={{color:'#888',marginTop:'2rem',textAlign:'center'}}>아직 게시된 리포트가 없습니다.</p>
        )}
      </div>
    </>
  )
}

export async function getStaticProps() {
  const dir = path.join(process.cwd(), 'content', 'daily')
  let posts = []
  if (fs.existsSync(dir)) {
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'))
    posts = files.map(filename => {
      const raw = fs.readFileSync(path.join(dir, filename), 'utf8')
      const { data } = matter(raw)
      return {
        slug: filename.replace('.md', ''),
        title: data.title || filename.replace('.md', ''),
        date: data.date || '',
        regime: data.regime || 'SIDEWAYS',
        heat_score: data.heat_score || 50,
        heat_grade: data.heat_grade || 'COOL',
        pnl_emoji: data.pnl_emoji || '➖',
        trade_count: data.trade_count || 0,
        insight: data.insight || '',
      }
    }).filter(p => p.date).sort((a, b) => b.date.localeCompare(a.date))
  }
  const stats = {
    total: posts.length,
    bull: posts.filter(p => p.regime === 'BULL').length,
    sideways: posts.filter(p => p.regime === 'SIDEWAYS').length,
    bear: posts.filter(p => p.regime === 'BEAR').length,
  }
  return { props: { posts, stats } }
}