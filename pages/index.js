import fs from 'fs'
import path from 'path'
import matter from 'gray-matter'
import Link from 'next/link'
import Head from 'next/head'

export default function Home({ posts }) {
  return (
    <>
      <Head>
        <title>ONE-HUB — AI 자동매매 운영일지</title>
        <meta name="description" content="AI와 함께 주식 자동매매를 운영하는 ONE-HUB 일일 리포트" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <header className="site-header">
        <Link href="/">ONE-HUB</Link>
        <nav>
          <Link href="/">Daily</Link>
        </nav>
      </header>

      <div className="hero">
        <h1>ONE-HUB Daily Report</h1>
        <p>AI 자동매매 운영 기록 — 성공과 실패를 솔직하게</p>
      </div>

      <div className="container">
        <div className="card-grid">
          {posts.map(post => (
            <Link key={post.slug} href={`/daily/${post.slug}`} className="card">
              <div className="card-date">
                {post.date}
                <span className={`regime-badge regime-${post.regime}`}>
                  {post.regime}
                </span>
              </div>
              <div className="card-title">
                <span className="card-emoji">{post.pnl_emoji}</span>
                {post.title}
              </div>
              {post.insight && (
                <div className="card-insight">💡 {post.insight}</div>
              )}
            </Link>
          ))}
        </div>
        {posts.length === 0 && (
          <p style={{color:'#888', marginTop:'2rem', textAlign:'center'}}>
            아직 게시된 리포트가 없습니다.
          </p>
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
    posts = files
      .map(filename => {
        const raw = fs.readFileSync(path.join(dir, filename), 'utf8')
        const { data } = matter(raw)
        return {
          slug:      filename.replace('.md', ''),
          title:     data.title     || filename.replace('.md', ''),
          date:      data.date      || '',
          regime:    data.regime    || 'SIDEWAYS',
          pnl_emoji: data.pnl_emoji || '➖',
          insight:   data.insight   || '',
        }
      })
      .filter(p => p.date)
      .sort((a, b) => b.date.localeCompare(a.date))
  }
  return { props: { posts } }
}
