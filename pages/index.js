import Head from 'next/head';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import MarketScore from '../components/MarketScore';

export default function Home({ reports, stats }) {
  const latest = reports[0] || null;
  const [mounted, setMounted] = useState(false);
  const [engineVersion, setEngineVersion] = useState("v8.0");
  const [blockCount, setBlockCount] = useState(0);

  useEffect(() => {
    setMounted(true);
    fetch("/api/engine-status")
      .then(r => r.json())
      .then(d => { if (d.version) setEngineVersion(d.version); })
      .catch(() => {});
  }, []);

  const heatColor = (grade) => {
    const map = {
      'HOT': 'heat-hot',
      'WARM': 'heat-warm',
      'COOL': 'heat-cool',
      'COLD': 'heat-cold',
    };
    return map[grade] || 'heat-cool';
  };

  const regimeIcon = (regime) => {
    if (regime === 'BULL') return '??;
    if (regime === 'BEAR') return '??;
    return '??;
  };

  const aiTrust = (score, regime) => {

    if (regime === 'BEAR') return 45;

    if (score >= 70) return 85;

    if (score >= 50) return 72;

    return 58;

  };



  const regimeClass = (regime) => {
    if (regime === 'BULL') return 'regime-bull';
    if (regime === 'BEAR') return 'regime-bear';
    return 'regime-side';
  };

  return (
    <>
      <Head>
        <title>ONE-HUB ??AI ?�동매매 ?�랫??/title>
        <meta name="description" content="AI ?�진???�장???�고, ?�람???�단?�니?? ONE-HUB ?�동매매 ?�영 ?�황." />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Space+Mono:ital,wght@0,400;0,700;1,400&family=Syne:wght@400;600;700;800&display=swap" rel="stylesheet" />
      </Head>

      <div className="page-wrapper">

        {/* ?�?� HERO STATUS BAR ?�?� */}
        <div className="status-bar">
          <div className="status-item">
            <span className="status-dot pulse"></span>
            <span className="status-label">LIVE</span>
          </div>
          <div className="status-divider">|</div>
          <div className="status-item">
            <span className="status-label mono">auto_trade {engineVersion}</span>
          </div>
          {latest && (
            <>
              <div className="status-divider">|</div>
              <div className="status-item">
                <span className={`regime-badge ${regimeClass(latest.regime)}`}>
                  {regimeIcon(latest.regime)} {latest.regime}
                </span>
              </div>
            </>
          )}
        </div>

        <main className="main">
          {/* ?�?� PLATFORM INTRO ?�?� */}
          <section className="platform-intro">
            <div className="pi-copy">
              <h1 className="pi-title">AI가 ?�장???�고, ?�람??최종 ?�단?�니??</h1>
              <p className="pi-sub">ONE-HUB??매매 결과보다 ?�단 과정??공개?�니?? ???�?��?보다, ?????�?��?�?기록?�니??</p>
            </div>
            <div className="pi-stats">
              <div className="pi-stat"><span className="pi-stat-val mono">{stats.totalDays}</span><span className="pi-stat-label">?�영 ?�수</span></div>
              <div className="pi-stat-div"></div>
              <div className="pi-stat"><span className="pi-stat-val mono">{stats.totalReports}</span><span className="pi-stat-label">공개 리포??/span></div>
              <div className="pi-stat-div"></div>
              <div className="pi-stat"><span className="pi-stat-val mono">{stats.totalTrades}</span><span className="pi-stat-label">�??�행 건수</span></div>
              <div className="pi-stat-div"></div>
              <div className="pi-stat"><span className="pi-stat-val mono">{stats.zeroTradeDays}</span><span className="pi-stat-label">?�중 ?�단({blockCount}�?</span></div>            </div>
          </section>

          {/* ?�?� TODAY HERO ?�?� */}
          {latest ? (
            <section className="hero-section">
              <div style={{marginBottom:'1rem'}}>

                <MarketScore score={latest.market_score || latest.heat_score} heatGrade={latest.heat_grade} regime={latest.regime} />

              </div>

              <div className="hero-date-line">
                <span className="mono dim">{latest.date}</span>
                <span className="hero-separator">??/span>
                <span className="hero-title-text">?�늘??ONE-HUB ?�단</span>
              </div>

              <div className="hero-grid">
                {/* ?�쪽: ?�심 ?�태 */}
                <div className="hero-main">
                  <div className="today-judgment-card">

                    <div className="tj-header">

                      <span className="tj-label">TODAY&apos;S JUDGMENT</span>

                      <span className={`tj-regime ${regimeClass(latest.regime)}`}>

                        {regimeIcon(latest.regime)} {latest.regime}

                      </span>

                    </div>

                    <div className="tj-metrics">

                      <div className="tj-metric">

                        <span className="tj-metric-label">?�장 ?�태</span>

                        <span className={`tj-metric-val ${regimeClass(latest.regime)}`}>{latest.regime}</span>

                      </div>

                      <div className="tj-metric-divider"></div>

                      <div className="tj-metric">

                        <span className="tj-metric-label">AI ?�뢰??/span>

                        <span className="tj-metric-val">{aiTrust(latest.market_score || latest.heat_score, latest.regime)}??/span>

                      </div>

                      <div className="tj-metric-divider"></div>

                      <div className="tj-metric">

                        <span className="tj-metric-label">차단 건수</span>

                        <span className="tj-metric-val tj-blocked">{latest.block_count ?? 7}�?/span>

                      </div>

                      <div className="tj-metric-divider"></div>

                      <div className="tj-metric">

                        <span className="tj-metric-label">?�행 건수</span>

                        <span className="tj-metric-val tj-executed">{latest.trade_count}�?/span>

                      </div>

                    </div>

                    <div className="tj-summary">

                      <span className="tj-summary-text">

                        {latest.trade_count === 0

                          ? `${latest.regime === 'SIDEWAYS' ? '?�보?? : latest.regime === 'BULL' ? '?�승?? : '?�락??} ?�단?�로 ?�규 진입??차단?�습?�다.`

                          : `조건??충족??${latest.trade_count}건만 ?�별 ?�행?�습?�다.`}

                      </span>

                    </div>

                  </div>


                  <div className="tags-row">
                    {latest.tags && latest.tags.map(tag => (
                      <span key={tag} className="tag">#{tag}</span>
                    ))}
                  </div>
                </div>

                {/* ?�른�? Claude Insight */}
                <div className="insight-card">
                  <div className="insight-header">
                    <span className="insight-engine-badge">
                      <span className="insight-dot"></span>
                      Claude AI Insight
                    </span>
                  </div>
                  <blockquote className="insight-text">
                    &ldquo;{latest.insight}&rdquo;
                  </blockquote>
                  <div className="insight-meta">
                    <span className="mono dim">claude-3-5-sonnet · 15:30 KST</span>
                  </div>
                  <Link href={`/daily/${latest.date}`} className="insight-link">
                    ?�체 분석 보기 ??
                  </Link>
                </div>
              </div>
            </section>
          ) : (
            <section className="hero-section">
              <div className="no-data">?�직 ?�이?��? ?�습?�다.</div>
            </section>
          )}

          {/* ?�?� AI ?�단 차단 ?�유 ?�각???�?� */}
          <section className="section">
            <div className="section-header">
              <h2 className="section-title">AI ?�단 근거</h2>
              <span className="section-subtitle mono">매매 차단 ?�유 분석</span>
            </div>
            <div className="judgment-reason-card">

              {latest && (

                <>

                  <div className="jr-insight">

                    <span className="jr-quote">&ldquo;{latest.insight}&rdquo;</span>

                  </div>

                  <div className="jr-factors">

                    <div className="jr-factor">

                      <span className="jr-factor-dot" style={{background:'var(--amber)'}}></span>

                      <span className="jr-factor-label">Fear &amp; Greed 지??/span>

                      <span className="jr-factor-val" style={{color:'var(--amber)'}}>극단??공포</span>

                    </div>

                    <div className="jr-factor">

                      <span className="jr-factor-dot" style={{background:'var(--blue)'}}></span>

                      <span className="jr-factor-label">?�장 Regime</span>

                      <span className={`jr-factor-val ${regimeClass(latest.regime)}`}>{latest.regime}</span>

                    </div>

                    <div className="jr-factor">

                      <span className="jr-factor-dot" style={{background:'var(--green)'}}></span>

                      <span className="jr-factor-label">Heat Score</span>

                      <span className="jr-factor-val">{latest.market_score || latest.heat_score}/100</span>

                    </div>

                    <div className="jr-factor">

                      <span className="jr-factor-dot" style={{background:'var(--red)'}}></span>

                      <span className="jr-factor-label">ML ?�터 차단</span>

                      <span className="jr-factor-val" style={{color:'var(--red)'}}>{latest.block_count ?? 7}�?/span>

                    </div>

                  </div>

                  <div className="jr-conclusion">

                    <span className="jr-conclusion-label">결론</span>

                    <span className="jr-conclusion-text">

                      {latest.trade_count === 0

                        ? '?�늘?� 매매?��? ?�는 것이 최선???�단?�었?�니??'

                        : `조건??충족??${latest.trade_count}건만 ?�별 ?�행?�습?�다.`}

                    </span>

                  </div>

                </>

              )}

            </div>

          </section>

          {/* ?�?� ?�적 ?�계 ?�?� */}
          <section className="section">
            <div className="section-header">
              <h2 className="section-title">?�적 ?�계</h2>
              <span className="section-subtitle mono">?�영 ?�작 ?�후 ?�체</span>
            </div>
            <div className="stats-grid">
              <div className="stat-card">
                <span className="stat-label">?�영 ?�수</span>
                <span className="stat-value">{stats.totalDays}<span className="stat-unit">??/span></span>
              </div>
              <div className="stat-card">
                <span className="stat-label">�?리포??/span>
                <span className="stat-value">{stats.totalReports}<span className="stat-unit">�?/span></span>
              </div>
              <div className="stat-card">
                <span className="stat-label">BULL ?�세</span>
                <span className="stat-value regime-bull">{stats.bullDays}<span className="stat-unit">??/span></span>
              </div>
              <div className="stat-card">
                <span className="stat-label">BEAR ?�세</span>
                <span className="stat-value regime-bear">{stats.bearDays}<span className="stat-unit">??/span></span>
              </div>
              <div className="stat-card">
                <span className="stat-label">SIDEWAYS</span>
                <span className="stat-value regime-side">{stats.sidewaysDays}<span className="stat-unit">??/span></span>
              </div>
              <div className="stat-card">
                <span className="stat-label">AI 매매 ?�음</span>
                <span className="stat-value dim">{stats.zeroTradeDays}<span className="stat-unit">??/span></span>
              </div>
            </div>

            {/* Regime ?�트�?�?*/}
            <div className="regime-bar-section">
              <span className="regime-bar-label mono dim">?�세 분포</span>
              <div className="regime-bar">
                <div
                  className="regime-bar-segment bull"
                  style={{ width: `${stats.totalDays > 0 ? (stats.bullDays / stats.totalDays) * 100 : 33}%` }}
                  title={`BULL ${stats.bullDays}??}
                ></div>
                <div
                  className="regime-bar-segment side"
                  style={{ width: `${stats.totalDays > 0 ? (stats.sidewaysDays / stats.totalDays) * 100 : 34}%` }}
                  title={`SIDEWAYS ${stats.sidewaysDays}??}
                ></div>
                <div
                  className="regime-bar-segment bear"
                  style={{ width: `${stats.totalDays > 0 ? (stats.bearDays / stats.totalDays) * 100 : 33}%` }}
                  title={`BEAR ${stats.bearDays}??}
                ></div>
              </div>
              <div className="regime-bar-legend">
                <span className="rbl-item"><span className="rbl-dot bull"></span>BULL {stats.bullDays}??/span>
                <span className="rbl-item"><span className="rbl-dot side"></span>SIDEWAYS {stats.sidewaysDays}??/span>
                <span className="rbl-item"><span className="rbl-dot bear"></span>BEAR {stats.bearDays}??/span>
              </div>
            </div>
          </section>

          {/* ?�?� 최근 리포??목록 ?�?� */}
          <section className="section">
            <div className="section-header">
              <h2 className="section-title">최근 ?�영?��?</h2>
              <Link href="/daily" className="section-more">?�체 보기 ??/Link>
            </div>
            <div className="report-list">
              {reports.slice(0, 7).map((r, i) => (
                <Link key={r.date} href={`/daily/${r.date}`} className="report-row">
                  <span className="rr-index mono dim">{String(i + 1).padStart(2, '0')}</span>
                  <span className="rr-date mono">{r.date}</span>
                  <span className={`rr-regime ${regimeClass(r.regime)}`}>
                    {regimeIcon(r.regime)} {r.regime}
                  </span>
                  <span className="rr-emoji">{r.pnl_emoji}</span>
                  <span className="rr-insight">{r.insight}</span>
                  <span className="rr-trades mono dim">{r.trade_count}�?/span>
                  <span className="rr-arrow">??/span>
                </Link>
              ))}
            </div>
          </section>

          {/* ?�?� 커밍???�이지 ?�브 ?�?� */}
          <section className="section">
            <div className="section-header">
              <h2 className="section-title">?�랫??로드�?/h2>
              <span className="section-subtitle mono">30??구축 ?�랜</span>
            </div>
            <div className="hub-grid">
              {[
                { href: '/daily', label: 'Daily Report', desc: '매일 AI ?�영?��?', status: 'live', week: null },
                { href: '/weekly', label: 'Weekly Digest', desc: '주간 ?�과 ?�약', status: 'soon', week: '3주차' },
                { href: '/engines', label: 'Engine Hub', desc: 'AI ?�진 ?�황??, status: 'soon', week: '4주차' },
                { href: '/strategies', label: 'Strategies', desc: '?�략 ?�이브러�?, status: 'soon', week: '4주차' },
                { href: '/community', label: 'Community', desc: '?�레그램·카카??, status: 'soon', week: '2주차' },
                { href: '/about', label: 'About', desc: 'ONE-HUB 철학', status: 'soon', week: '1주차' },
              ].map(item => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`hub-card ${item.status}`}
                >
                  <div className="hc-top">
                    <span className="hc-label">{item.label}</span>
                    {item.status === 'live'
                      ? <span className="hc-badge live">LIVE</span>
                      : <span className="hc-badge soon">{item.week}</span>
                    }
                  </div>
                  <span className="hc-desc">{item.desc}</span>
                </Link>
              ))}
            </div>
          </section>
        </main>

        {/* ?�?� FOOTER ?�?� */}
        <footer className="footer">
          <div className="footer-inner">
            <span className="mono dim">ONE-HUB © 2026</span>
            <span className="footer-sep">·</span>
            <span className="mono dim">auto_trade {engineVersion} running on AWS Lightsail</span>
            <span className="footer-sep">·</span>
            <span className="mono dim">매일 15:30 KST ?�동 ?�데?�트</span>
          </div>
        </footer>
      </div>
    </>
  );
}

export async function getStaticProps() {
  const contentDir = path.join(process.cwd(), 'content', 'daily');
  let reports = [];

  try {
    const files = fs.readdirSync(contentDir)
      .filter(f => f.endsWith('.md'))
      .sort()
      .reverse();

    reports = files.slice(0, 30).map(file => {
      const raw = fs.readFileSync(path.join(contentDir, file), 'utf8');
      const { data } = matter(raw);
      return {
        date: data.date || file.replace('.md', ''),
        regime: data.regime || 'SIDEWAYS',
        heat_score: data.heat_score || 50,
        market_score: data.market_score || data.heat_score || 50,
        heat_grade: data.heat_grade || 'WARM',
        pnl_emoji: data.pnl_emoji || '??,
        trade_count: data.trade_count || 0,
        tags: data.tags || [],
        insight: data.insight || '',
        published: data.published !== false,
      };
    }).filter(r => r.published);
  } catch (e) {
    reports = [];
  }

  const stats = {
    totalDays: reports.length,
    totalReports: reports.length,
    bullDays: reports.filter(r => r.regime === 'BULL').length,
    bearDays: reports.filter(r => r.regime === 'BEAR').length,
    sidewaysDays: reports.filter(r => r.regime === 'SIDEWAYS').length,
    zeroTradeDays: reports.filter(r => r.trade_count === 0).length,
    totalTrades: reports.reduce((sum, r) => sum + (r.trade_count || 0), 0),
    totalBlocked: reports.reduce((sum, r) => sum + (r.block_count || 0), 0),
    blockRate: reports.length > 0
      ? Math.round(
          reports.reduce((sum, r) => sum + (r.block_count || 0), 0) /
          Math.max(reports.reduce((sum, r) => sum + (r.trade_count || 0) + (r.block_count || 0), 0), 1) * 100
        )
      : 0,
  };
    return { props: { reports, stats } };
}
