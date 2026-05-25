import Head from 'next/head';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';

export default function Home({ reports, stats }) {
  const latest = reports[0] || null;
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
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
    if (regime === 'BULL') return '▲';
    if (regime === 'BEAR') return '▼';
    return '➖';
  };

  const regimeClass = (regime) => {
    if (regime === 'BULL') return 'regime-bull';
    if (regime === 'BEAR') return 'regime-bear';
    return 'regime-side';
  };

  return (
    <>
      <Head>
        <title>ONE-HUB — AI 자동매매 플랫폼</title>
        <meta name="description" content="AI 엔진이 시장을 읽고, 사람이 판단합니다. ONE-HUB 자동매매 운영 현황." />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Space+Mono:ital,wght@0,400;0,700;1,400&family=Syne:wght@400;600;700;800&display=swap" rel="stylesheet" />
      </Head>

      <div className="page-wrapper">
        {/* ── NAV ── */}
        <nav className="nav">
          <div className="nav-inner">
            <Link href="/" className="nav-logo">
              <span className="logo-bracket">[</span>
              ONE-HUB
              <span className="logo-bracket">]</span>
            </Link>
            <div className="nav-links">
              <Link href="/" className="nav-link active">대시보드</Link>
              <Link href="/daily" className="nav-link">Daily</Link>
              <Link href="/weekly" className="nav-link dim">Weekly</Link>
              <Link href="/engines" className="nav-link dim">Engines</Link>
              <Link href="/strategies" className="nav-link dim">Strategies</Link>
              <Link href="/community" className="nav-link dim">Community</Link>
              <Link href="/about" className="nav-link dim">About</Link>
            </div>
            <button className="nav-menu-btn" aria-label="메뉴" id="menu-btn">
              <span></span><span></span><span></span>
            </button>
          </div>
        </nav>

        {/* ── HERO STATUS BAR ── */}
        <div className="status-bar">
          <div className="status-item">
            <span className="status-dot pulse"></span>
            <span className="status-label">LIVE</span>
          </div>
          <div className="status-divider">|</div>
          <div className="status-item">
            <span className="status-label mono">auto_trade v7.0</span>
          </div>
          <div className="status-divider">|</div>
          <div className="status-item">
            <span className="status-label mono">AWS Lightsail · 54.180.144.53</span>
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
          {/* ── TODAY HERO ── */}
          {latest ? (
            <section className="hero-section">
              <div className="hero-date-line">
                <span className="mono dim">{latest.date}</span>
                <span className="hero-separator">—</span>
                <span className="hero-title-text">오늘의 시장 요약</span>
              </div>

              <div className="hero-grid">
                {/* 왼쪽: 핵심 상태 */}
                <div className="hero-main">
                  <div className="market-regime-card">
                    <div className="mrc-header">
                      <span className="mrc-label">MARKET REGIME</span>
                      <span className={`heat-indicator ${heatColor(latest.heat_grade)}`}>
                        {latest.heat_grade} · {latest.heat_score}
                      </span>
                    </div>
                    <div className="mrc-regime">
                      <span className={`mrc-regime-text ${regimeClass(latest.regime)}`}>
                        {regimeIcon(latest.regime)} {latest.regime}
                      </span>
                    </div>
                    <div className="mrc-pnl">
                      <span className="mrc-pnl-emoji">{latest.pnl_emoji}</span>
                      <span className="mrc-pnl-label">오늘의 방향성</span>
                    </div>
                    <div className="mrc-trades">
                      <span className="mrc-trade-count">{latest.trade_count}</span>
                      <span className="mrc-trade-label">건 체결</span>
                    </div>
                  </div>

                  <div className="tags-row">
                    {latest.tags && latest.tags.map(tag => (
                      <span key={tag} className="tag">#{tag}</span>
                    ))}
                  </div>
                </div>

                {/* 오른쪽: Claude Insight */}
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
                    전체 분석 보기 →
                  </Link>
                </div>
              </div>
            </section>
          ) : (
            <section className="hero-section">
              <div className="no-data">아직 데이터가 없습니다.</div>
            </section>
          )}

          {/* ── AI 판단 차단 사유 시각화 ── */}
          <section className="section">
            <div className="section-header">
              <h2 className="section-title">AI 판단 근거</h2>
              <span className="section-subtitle mono">매매 차단 사유 분석</span>
            </div>
            <div className="block-reasons-grid">
              {[
                { label: '변동성 과다', value: 72, icon: '⚡', color: 'var(--amber)' },
                { label: '추세 불명확', value: 58, icon: '〰', color: 'var(--text-dim)' },
                { label: '거래량 부족', value: 45, icon: '📉', color: 'var(--blue)' },
                { label: '리스크 한도', value: 31, icon: '🛑', color: 'var(--red)' },
                { label: '횡보장 판단', value: 89, icon: '↔', color: 'var(--green)' },
                { label: '매크로 이벤트', value: 24, icon: '🌐', color: 'var(--purple)' },
              ].map(item => (
                <div key={item.label} className="block-reason-item">
                  <div className="br-top">
                    <span className="br-icon">{item.icon}</span>
                    <span className="br-label">{item.label}</span>
                    <span className="br-value mono" style={{ color: item.color }}>{item.value}%</span>
                  </div>
                  <div className="br-bar-bg">
                    <div
                      className="br-bar-fill"
                      style={{ width: `${item.value}%`, background: item.color }}
                    ></div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* ── 누적 통계 ── */}
          <section className="section">
            <div className="section-header">
              <h2 className="section-title">누적 통계</h2>
              <span className="section-subtitle mono">운영 시작 이후 전체</span>
            </div>
            <div className="stats-grid">
              <div className="stat-card">
                <span className="stat-label">운영 일수</span>
                <span className="stat-value">{stats.totalDays}<span className="stat-unit">일</span></span>
              </div>
              <div className="stat-card">
                <span className="stat-label">총 리포트</span>
                <span className="stat-value">{stats.totalReports}<span className="stat-unit">건</span></span>
              </div>
              <div className="stat-card">
                <span className="stat-label">BULL 장세</span>
                <span className="stat-value regime-bull">{stats.bullDays}<span className="stat-unit">일</span></span>
              </div>
              <div className="stat-card">
                <span className="stat-label">BEAR 장세</span>
                <span className="stat-value regime-bear">{stats.bearDays}<span className="stat-unit">일</span></span>
              </div>
              <div className="stat-card">
                <span className="stat-label">SIDEWAYS</span>
                <span className="stat-value regime-side">{stats.sidewaysDays}<span className="stat-unit">일</span></span>
              </div>
              <div className="stat-card">
                <span className="stat-label">AI 매매 없음</span>
                <span className="stat-value dim">{stats.zeroTradeDays}<span className="stat-unit">일</span></span>
              </div>
            </div>

            {/* Regime 히트맵 바 */}
            <div className="regime-bar-section">
              <span className="regime-bar-label mono dim">장세 분포</span>
              <div className="regime-bar">
                <div
                  className="regime-bar-segment bull"
                  style={{ width: `${stats.totalDays > 0 ? (stats.bullDays / stats.totalDays) * 100 : 33}%` }}
                  title={`BULL ${stats.bullDays}일`}
                ></div>
                <div
                  className="regime-bar-segment side"
                  style={{ width: `${stats.totalDays > 0 ? (stats.sidewaysDays / stats.totalDays) * 100 : 34}%` }}
                  title={`SIDEWAYS ${stats.sidewaysDays}일`}
                ></div>
                <div
                  className="regime-bar-segment bear"
                  style={{ width: `${stats.totalDays > 0 ? (stats.bearDays / stats.totalDays) * 100 : 33}%` }}
                  title={`BEAR ${stats.bearDays}일`}
                ></div>
              </div>
              <div className="regime-bar-legend">
                <span className="rbl-item"><span className="rbl-dot bull"></span>BULL {stats.bullDays}일</span>
                <span className="rbl-item"><span className="rbl-dot side"></span>SIDEWAYS {stats.sidewaysDays}일</span>
                <span className="rbl-item"><span className="rbl-dot bear"></span>BEAR {stats.bearDays}일</span>
              </div>
            </div>
          </section>

          {/* ── 최근 리포트 목록 ── */}
          <section className="section">
            <div className="section-header">
              <h2 className="section-title">최근 운영일지</h2>
              <Link href="/daily" className="section-more">전체 보기 →</Link>
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
                  <span className="rr-trades mono dim">{r.trade_count}건</span>
                  <span className="rr-arrow">→</span>
                </Link>
              ))}
            </div>
          </section>

          {/* ── 커밍순 페이지 허브 ── */}
          <section className="section">
            <div className="section-header">
              <h2 className="section-title">플랫폼 로드맵</h2>
              <span className="section-subtitle mono">30일 구축 플랜</span>
            </div>
            <div className="hub-grid">
              {[
                { href: '/daily', label: 'Daily Report', desc: '매일 AI 운영일지', status: 'live', week: null },
                { href: '/weekly', label: 'Weekly Digest', desc: '주간 성과 요약', status: 'soon', week: '3주차' },
                { href: '/engines', label: 'Engine Hub', desc: 'AI 엔진 현황판', status: 'soon', week: '4주차' },
                { href: '/strategies', label: 'Strategies', desc: '전략 라이브러리', status: 'soon', week: '4주차' },
                { href: '/community', label: 'Community', desc: '텔레그램·카카오', status: 'soon', week: '2주차' },
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

        {/* ── FOOTER ── */}
        <footer className="footer">
          <div className="footer-inner">
            <span className="mono dim">ONE-HUB © 2026</span>
            <span className="footer-sep">·</span>
            <span className="mono dim">auto_trade v7.0 running on AWS Lightsail</span>
            <span className="footer-sep">·</span>
            <span className="mono dim">매일 15:30 KST 자동 업데이트</span>
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
        heat_grade: data.heat_grade || 'WARM',
        pnl_emoji: data.pnl_emoji || '➖',
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
  };

  return { props: { reports, stats } };
}
