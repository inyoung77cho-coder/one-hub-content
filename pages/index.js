import Head from 'next/head';
import Link from 'next/link';
import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { SITE, ORG_NAME } from '../lib/site';

const REGIME_EMOJI = { BULL: '📈', BEAR: '📉', SIDEWAYS: '➖' };
const REGIME_LABEL = { BULL: '상승장', BEAR: '하락장', SIDEWAYS: '횡보장' };
const REGIME_TAG = { BULL: 'p-bull', BEAR: 'p-bear', SIDEWAYS: 'p-flat' };

export default function Home({ reports, stats }) {
  const latest = reports[0] || null;
  const emoji = (r) => REGIME_EMOJI[r] || '➖';
  const label = (r) => REGIME_LABEL[r] || '횡보장';
  const analyzed = latest ? (latest.block_count || 0) + (latest.trade_count || 0) : 0;

  const canonical = `${SITE}/`;
  const ogImage = `${SITE}/api/og-home`;
  const description =
    '주식·ETF·부동산을 하나의 AI가 분석·배분·운영합니다. AI가 시장을 읽고 후보를 선별하면 최종 결정은 사람이 하며, 그 판단 과정을 매일 운영일지로 투명하게 공개합니다.';

  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      '@id': `${SITE}/#org`,
      name: 'ONE-HUB',
      alternateName: ORG_NAME,
      url: `${SITE}/`,
      logo: `${SITE}/icons/icon-512.png`,
      description: '주식·ETF·부동산을 하나의 AI가 분석·배분·운영하는 통합 자산관리 플랫폼',
      sameAs: ['https://t.me/onehub', 'https://blog.naver.com/onehub'],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      '@id': `${SITE}/#website`,
      name: 'ONE-HUB',
      url: `${SITE}/`,
      inLanguage: 'ko-KR',
      publisher: { '@id': `${SITE}/#org` },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: 'ONE-HUB 운영일지 최신 리포트',
      itemListOrder: 'https://schema.org/ItemListOrderDescending',
      itemListElement: reports.slice(0, 4).map((r, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        url: `${SITE}/daily/${r.date}`,
        name: `${r.date} · ${label(r.regime)} 판단`,
      })),
    },
  ];

  return (
    <>
      <Head>
        <title>ONE-HUB · 주식·ETF·부동산을 AI가 함께 운영하는 통합 자산관리 플랫폼</title>
        <meta name="description" content={description} />
        <meta
          name="keywords"
          content="ONE-HUB, AI 자산운영, 통합 자산관리, 주식, ETF, 부동산, AI 투자 판단, 리밸런싱, 자동매매 대안, 운영일지"
        />
        <link rel="canonical" href={canonical} />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css"
        />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="ONE-HUB" />
        <meta property="og:locale" content="ko_KR" />
        <meta property="og:url" content={canonical} />
        <meta property="og:title" content="ONE-HUB · 주식·ETF·부동산 AI 통합 자산운영 플랫폼" />
        <meta property="og:description" content={description} />
        <meta property="og:image" content={ogImage} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="ONE-HUB · 주식·ETF·부동산 AI 통합 자산운영" />
        <meta name="twitter:description" content={description} />
        <meta name="twitter:image" content={ogImage} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      </Head>

      <div className="wrap">
        {/* NAV */}
        <header className="nav">
          <div className="container nav-in">
            <Link href="/" className="brand" aria-label="ONE-HUB 홈">
              ONE<span className="dot">·</span>HUB
            </Link>
            <nav className="nav-links" aria-label="주 메뉴">
              <Link href="/daily">운영일지</Link>
              <Link href="/blog">인사이트</Link>
              <Link href="/community">커뮤니티</Link>
              <Link href="/about">About</Link>
              <Link href="/pwa" className="btn btn-primary">앱 열기 →</Link>
            </nav>
            <Link href="/pwa" className="btn btn-primary nav-app-m" aria-label="ONE-HUB 앱 열기">앱 열기</Link>
          </div>
        </header>

        <main>
          {/* HERO */}
          <section className="hero">
            <div className="container">
              <p className="hero-live">
                <span className="dotlive" aria-hidden="true"></span> LIVE · 주식·ETF·부동산 통합 운영
                {latest && <> · 오늘 {emoji(latest.regime)} {label(latest.regime)}</>}
              </p>
              <h1>
                주식 · ETF · 부동산을<br />
                <em>AI가 함께 운영</em>합니다.
              </h1>
              <p className="lead">
                흩어진 세 자산을 한 곳에서 분석하고 배분합니다. AI가 시장을 읽고 후보를 선별하면 최종 결정은 사람이
                하며, 그 판단 과정을 매일 투명하게 공개합니다.
              </p>
              <div className="hero-cta">
                <Link className="btn btn-white btn-lg" href="/pwa">🚀 ONE-HUB 앱 시작하기</Link>
                <Link className="btn btn-line btn-lg" href={latest ? `/daily/${latest.date}` : '/daily'}>
                  📋 오늘의 판단 보기
                </Link>
              </div>
              <div className="hero-teaser">
                <span className="tchip">통합 자산 <b>주식 · ETF · 부동산</b></span>
                {latest && (
                  <span className="tchip">
                    오늘 판단 <b>{latest.trade_count > 0 ? `실행 ${latest.trade_count}건` : '진입 자제'}</b>
                  </span>
                )}
                <span className="tchip">누적 운영 <b>{stats.totalDays}일</b></span>
              </div>
            </div>
          </section>

          {/* DEFINITION BAND */}
          <div className="defband">
            <div className="container defband-in">
              <p className="defband-txt">
                ONE-HUB는 <span>주식 · ETF · 부동산</span>을 하나의 AI가 분석·배분·운영하는{' '}
                <span>통합 자산관리 플랫폼</span>입니다.
              </p>
              <div className="asset-chips">
                <span className="asset-chip ac-stock">📈 주식</span>
                <span className="asset-chip ac-etf">📊 ETF</span>
                <span className="asset-chip ac-re">🏢 부동산</span>
              </div>
            </div>
          </div>

          {/* WHY */}
          <section>
            <div className="container">
              <div className="sec-head">
                <p className="eyebrow">WHY ONE-HUB</p>
                <h2>수익률이 아니라, 판단 과정을 봅니다</h2>
                <p>
                  주식·ETF·부동산을 AI가 한 곳에서 분석하고 배분합니다. 결과만 보여주는 자산 서비스와 달리, 매일
                  무엇을 왜 그렇게 결정했는지 기록으로 남깁니다.
                </p>
              </div>
              <div className="pillars">
                <article className="pillar">
                  <div className="pic pic-blue" aria-hidden="true">🔍</div>
                  <h3>투명한 기록</h3>
                  <p>매수·관망·차단의 이유를 매일 공개. 실패와 &ldquo;아무것도 안 한 날&rdquo;까지 그대로 남깁니다.</p>
                </article>
                <article className="pillar">
                  <div className="pic pic-green" aria-hidden="true">🤝</div>
                  <h3>AI + 사람</h3>
                  <p>AI가 시장을 읽고 후보를 선별하면, 최종 실행은 사람이 승인합니다. 블랙박스가 아닙니다.</p>
                </article>
                <article className="pillar">
                  <div className="pic pic-amber" aria-hidden="true">📐</div>
                  <h3>3자산 통합 운영</h3>
                  <p>주식·ETF·부동산을 각각의 기준(Heat·Regime·세금·실거래)으로 판단하고, 목표 배분에 맞춰 리밸런싱합니다.</p>
                </article>
              </div>
            </div>
          </section>

          {/* TODAY */}
          {latest && (
            <section style={{ paddingTop: 0 }}>
              <div className="container">
                <div className="sec-head">
                  <p className="eyebrow">TODAY&apos;S JUDGMENT</p>
                  <h2>오늘 AI는 무엇을 했는가?</h2>
                </div>
                <Link className="today-wrap" href={`/daily/${latest.date}`} aria-label={`${latest.date} 오늘의 판단 전체 보기`}>
                  <div className="today-l">
                    <p className="d">{latest.date} · 오늘의 판단</p>
                    <p className="phase">
                      {emoji(latest.regime)} {label(latest.regime)} ·{' '}
                      {latest.trade_count > 0 ? `실행 ${latest.trade_count}건` : '진입 자제'}
                    </p>
                    <div className="today-metrics">
                      <div className="tm"><div className="k">분석</div><div className="v">{analyzed}</div></div>
                      <div className="tm"><div className="k">차단</div><div className="v">{latest.block_count || 0}</div></div>
                      <div className="tm"><div className="k">실행</div><div className="v">{latest.trade_count || 0}</div></div>
                    </div>
                  </div>
                  <div className="today-r">
                    <div className="quote-mark" aria-hidden="true">&ldquo;</div>
                    <p className="quote">{latest.insight}</p>
                    <p className="quote-meta">ONE-HUB Insight · AI 분석 15:30 KST</p>
                    <span className="link-arrow">전체 분석 보기 →</span>
                  </div>
                </Link>
              </div>
            </section>
          )}

          {/* OPERATING LOG */}
          <section style={{ paddingTop: 0 }}>
            <div className="container">
              <div className="sec-head">
                <p className="eyebrow">DAILY REPORTS · 매일 15:30 업데이트</p>
                <h2>운영일지</h2>
                <p>매일의 시장 판단을 기록으로 남깁니다. ONE-HUB의 콘텐츠이자 신뢰의 근거입니다.</p>
              </div>
              <div className="logs">
                {reports.slice(0, 4).map((r) => (
                  <Link className="log" key={r.date} href={`/daily/${r.date}`}>
                    <div className="log-top">
                      <span className="log-date">{r.date}</span>
                      <span className={`phase-tag ${REGIME_TAG[r.regime] || 'p-flat'}`}>
                        {emoji(r.regime)} {r.regime}
                      </span>
                    </div>
                    <p className="log-txt">{r.insight}</p>
                    <span className="log-foot">실행 {r.trade_count || 0}건 · 자세히 →</span>
                  </Link>
                ))}
              </div>
              <div style={{ textAlign: 'center', marginTop: 28 }}>
                <Link className="btn btn-ghost" href="/daily">운영일지 전체 보기 →</Link>
              </div>
            </div>
          </section>

          {/* TRUST STATS */}
          <section className="trust">
            <div className="container">
              <div className="sec-head">
                <p className="eyebrow eyebrow-green">TRACK RECORD</p>
                <h2 style={{ color: '#fff' }}>{stats.totalDays}일간, 있는 그대로 기록했습니다</h2>
              </div>
              <div className="stats">
                <div className="stat"><div className="num">{stats.totalAnalyzed}</div><div className="lbl">누적 분석</div></div>
                <div className="stat"><div className="num">{stats.totalBlocked}</div><div className="lbl">AI 차단</div></div>
                <div className="stat"><div className="num">{stats.totalTrades}</div><div className="lbl">최종 실행</div></div>
                <div className="stat"><div className="num">{stats.totalDays}</div><div className="lbl">운영 일수</div></div>
              </div>
              <p className="trust-note">※ 모든 수치는 운영일지 데이터(매일 15:30 KST 갱신)에서 자동 집계됩니다.</p>
            </div>
          </section>

          {/* PWA PREVIEW */}
          <section>
            <div className="container">
              <div className="sec-head">
                <p className="eyebrow">THE CONSOLE</p>
                <h2>주식·ETF·부동산, 한 콘솔에서</h2>
                <p>세 자산의 분석·배분·리밸런싱·의사결정을 PWA 콘솔에서 통합 운영합니다. 홈페이지는 기록을, 앱은 운영을 담당합니다.</p>
              </div>
              <div className="previews">
                {[
                  { href: '/pwa/ai-advisor', icon: '🤖', t: 'AI 자산운영', d: '3자산 종합 판단과 리밸런싱 플랜.' },
                  { href: '/pwa/portfolio', icon: '💼', t: '통합 자산', d: '주식·ETF·부동산 총자산을 한 화면에.' },
                  { href: '/pwa/etf', icon: '📊', t: 'ETF 자산', d: '실질수익·환차·세금·중복도 분석.' },
                  { href: '/pwa/realestate', icon: '🏢', t: '부동산 자산', d: 'ONE Score 랭킹·저평가·시장 브리핑.' },
                  { href: '/pwa', icon: '📈', t: '주식 운영', d: '추천·보유·AI 판단 기록.' },
                  { href: '/pwa/system-health', icon: '🛡️', t: '시스템 상태', d: '엔진·토큰·스케줄러 헬스체크.' },
                ].map((p) => (
                  <Link className="pv" key={p.t} href={p.href}>
                    <div className="pv-shot">
                      <span aria-hidden="true">{p.icon}</span>
                      <span className="pv-badge">LIVE</span>
                    </div>
                    <div className="pv-body">
                      <h3>{p.t}</h3>
                      <p>{p.d}</p>
                      <span className="pv-link">앱에서 열기 →</span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </section>

          {/* CONTENT & COMMUNITY */}
          <section style={{ paddingTop: 0 }}>
            <div className="container">
              <div className="cc">
                <div className="cc-card cc-news">
                  <h3>📮 개발로그 · 인사이트</h3>
                  <p>1인 기업이 AI 투자 OS를 만들어가는 과정과 시장 인사이트를 기록합니다. &ldquo;머니더버니&rdquo;의 빌드 로그.</p>
                  <div className="cc-btns">
                    <Link href="/blog">개발로그 보기 →</Link>
                  </div>
                </div>
                <div className="cc-card cc-comm">
                  <h3>💬 커뮤니티</h3>
                  <p>매일의 AI 판단과 리포트를 실시간으로 받아보고, 함께 이야기 나눠요.</p>
                  <div className="cc-btns">
                    <a href="https://t.me/onehub" target="_blank" rel="noopener">텔레그램 채널</a>
                    <a href="https://pf.kakao.com/onehub" target="_blank" rel="noopener">카카오 채널</a>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* ROADMAP */}
          <section style={{ paddingTop: 0 }}>
            <div className="container">
              <div className="sec-head">
                <p className="eyebrow">ROADMAP</p>
                <h2>다음에 올 것들</h2>
              </div>
              <div className="roadmap">
                <div className="rm">Weekly Digest<span>3주차</span></div>
                <div className="rm">Engine Hub<span>4주차</span></div>
                <div className="rm">전략 라이브러리<span>4주차</span></div>
                <div className="rm">참여자 온보딩 위저드<span>예정</span></div>
              </div>
            </div>
          </section>
        </main>

        {/* FOOTER */}
        <footer className="footer">
          <div className="container">
            <div className="foot-in">
              <div>
                <div className="foot-brand">ONE<span style={{ color: '#16C784' }}>·</span>HUB</div>
                <div style={{ marginTop: 8 }}>주식·ETF·부동산 AI 통합 자산운영 플랫폼 · auto_trade v10.0</div>
              </div>
              <nav className="foot-links" aria-label="푸터 메뉴">
                <Link href="/daily">운영일지</Link>
                <Link href="/about">About</Link>
                <Link href="/community">커뮤니티</Link>
                <Link href="/pwa">앱 열기</Link>
              </nav>
            </div>
            <p className="foot-disclaimer">
              © 2026 ONE-HUB · running on AWS Lightsail · 매일 15:30 KST 자동 업데이트
              <br />
              ONE-HUB가 제공하는 정보는 투자 판단의 참고 자료이며 투자 자문·일임이 아닙니다. 모든 투자의 최종 결정과 책임은 이용자 본인에게 있습니다.
            </p>
          </div>
        </footer>
      </div>

      <style jsx>{`
        .wrap {
          --bg:#F4F9FF;--card:#FFFFFF;--ink:#1E293B;--ink2:#64748B;--ink3:#94A3B8;
          --line:#E8EEF7;--blue:#2F6BFF;--blue-soft:#EAF1FF;--green:#16C784;--green-soft:#E7FAF2;
          --red:#F04452;--amber:#F5A524;--shadow:0 8px 28px rgba(31,63,120,.07);
          --hero1:#12213B;--hero2:#20375F;--maxw:1080px;
          min-height:100vh;background:var(--bg);color:var(--ink);
          font-family:'Pretendard',-apple-system,BlinkMacSystemFont,sans-serif;line-height:1.5;
        }
        .wrap :global(a){text-decoration:none;color:inherit}
        .container{max-width:var(--maxw);margin:0 auto;padding:0 22px}
        .eyebrow{font-size:12.5px;font-weight:800;letter-spacing:.4px;color:var(--blue);margin-bottom:12px}
        .eyebrow-green{color:#7FE9C0}
        section{padding:64px 0}
        .sec-head{text-align:center;max-width:640px;margin:0 auto 40px}
        .sec-head h2{font-size:30px;font-weight:800;letter-spacing:-.6px;line-height:1.3}
        .sec-head p{font-size:15px;color:var(--ink2);margin-top:12px;line-height:1.6}

        .nav{position:sticky;top:0;z-index:50;background:rgba(244,249,255,.85);backdrop-filter:blur(12px);border-bottom:1px solid var(--line)}
        .nav-in{display:flex;align-items:center;justify-content:space-between;height:64px}
        .brand{font-size:20px;font-weight:800;letter-spacing:-.5px}
        .brand .dot{color:var(--green)}
        .nav-links{display:flex;align-items:center;gap:28px}
        .nav-links :global(a){font-size:14px;font-weight:600;color:var(--ink2)}
        .nav-links :global(a:hover){color:var(--ink)}
        .btn{display:inline-flex;align-items:center;gap:7px;font-weight:700;border-radius:12px;cursor:pointer;border:none;font-family:inherit}
        .btn-primary{background:var(--blue);color:#fff;font-size:14px;padding:11px 18px}
        .btn-ghost{background:#fff;color:var(--ink);font-size:14px;padding:11px 18px;border:1px solid var(--line)}
        .nav-app-m{display:none}
        @media(max-width:760px){.nav-links{display:none}.nav-app-m{display:inline-flex}}

        .hero{background:linear-gradient(150deg,var(--hero1),var(--hero2));color:#fff;padding:80px 0 88px;overflow:hidden}
        .hero-live{display:inline-flex;align-items:center;gap:9px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.14);border-radius:20px;padding:7px 14px;font-size:12.5px;font-weight:600;color:#C7D4EC;margin-bottom:24px}
        .dotlive{width:8px;height:8px;border-radius:50%;background:#16C784;box-shadow:0 0 0 4px rgba(22,199,132,.2)}
        .hero h1{font-size:46px;font-weight:800;letter-spacing:-1.5px;line-height:1.18}
        .hero h1 :global(em){font-style:normal;color:#7FE9C0}
        .hero .lead{font-size:16.5px;color:#C7D4EC;margin-top:20px;max-width:560px;line-height:1.65}
        .hero-cta{display:flex;gap:12px;margin-top:32px;flex-wrap:wrap}
        .btn-lg{font-size:15px;padding:15px 24px;border-radius:14px}
        .btn-white{background:#fff;color:var(--hero1)}
        .btn-line{background:rgba(255,255,255,.06);color:#fff;border:1px solid rgba(255,255,255,.2)}
        .hero-teaser{display:flex;gap:10px;margin-top:34px;flex-wrap:wrap}
        .tchip{background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.1);border-radius:12px;padding:10px 15px;font-size:13px;color:#C7D4EC}
        .tchip b{color:#fff;font-weight:700}
        @media(max-width:640px){.hero h1{font-size:34px}}

        .defband{background:var(--card);border-bottom:1px solid var(--line)}
        .defband-in{padding:26px 22px;display:flex;align-items:center;justify-content:center;gap:22px;flex-wrap:wrap;text-align:center}
        .defband-txt{font-size:15.5px;font-weight:700;letter-spacing:-.3px}
        .defband-txt span{color:var(--blue)}
        .asset-chips{display:flex;gap:10px}
        .asset-chip{display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:700;padding:8px 13px;border-radius:11px}
        .ac-stock{background:var(--blue-soft);color:var(--blue)}
        .ac-etf{background:var(--green-soft);color:#0E9E6A}
        .ac-re{background:#FFF6E5;color:#B45309}

        .pillars{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}
        .pillar{background:var(--card);border-radius:20px;padding:28px 24px;box-shadow:var(--shadow)}
        .pillar .pic{width:52px;height:52px;border-radius:15px;display:grid;place-items:center;font-size:24px;margin-bottom:16px}
        .pic-blue{background:var(--blue-soft)}.pic-green{background:var(--green-soft)}.pic-amber{background:#FFF6E5}
        .pillar h3{font-size:18px;font-weight:800;letter-spacing:-.3px}
        .pillar p{font-size:14px;color:var(--ink2);margin-top:9px;line-height:1.6}
        @media(max-width:760px){.pillars{grid-template-columns:1fr}}

        .today-wrap{background:var(--card);border-radius:24px;box-shadow:var(--shadow);overflow:hidden;display:grid;grid-template-columns:1fr 1fr}
        .today-l{background:linear-gradient(150deg,var(--hero1),var(--hero2));color:#fff;padding:36px 32px}
        .today-l .d{font-size:13px;color:#9DB6E6;font-weight:600}
        .today-l .phase{font-size:26px;font-weight:800;margin:8px 0 20px}
        .today-metrics{display:flex;gap:10px}
        .tm{flex:1;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.1);border-radius:13px;padding:13px;text-align:center}
        .tm .k{font-size:11px;color:#9DB6E6;font-weight:600}
        .tm .v{font-size:19px;font-weight:800;margin-top:4px}
        .today-r{padding:36px 32px;display:flex;flex-direction:column;justify-content:center}
        .quote-mark{font-size:34px;color:var(--blue);font-weight:800;line-height:.6}
        .quote{font-size:17px;font-weight:600;line-height:1.6;letter-spacing:-.2px;margin:12px 0 18px}
        .quote-meta{font-size:12.5px;color:var(--ink3);font-weight:600;margin-bottom:20px}
        .link-arrow{font-size:13px;font-weight:700;color:var(--blue)}
        @media(max-width:760px){.today-wrap{grid-template-columns:1fr}}

        .logs{display:grid;grid-template-columns:repeat(2,1fr);gap:14px}
        .log{background:var(--card);border-radius:18px;padding:20px 22px;box-shadow:var(--shadow);display:flex;flex-direction:column;gap:10px;transition:transform .15s ease,box-shadow .15s ease}
        .log:hover{transform:translateY(-2px);box-shadow:0 12px 32px rgba(31,63,120,.12)}
        .log-top{display:flex;align-items:center;justify-content:space-between}
        .log-date{font-size:13px;font-weight:800}
        .phase-tag{font-size:11px;font-weight:800;padding:4px 9px;border-radius:7px}
        .p-bear{background:#FDECEE;color:var(--red)}
        .p-bull{background:var(--green-soft);color:#0E9E6A}
        .p-flat{background:#F1F5F9;color:var(--ink2)}
        .log-txt{font-size:14px;color:var(--ink);line-height:1.6}
        .log-foot{font-size:12px;color:var(--ink3);font-weight:600}
        @media(max-width:760px){.logs{grid-template-columns:1fr}}

        .trust{background:#12213B;color:#fff}
        .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:24px;text-align:center}
        .stat .num{font-size:40px;font-weight:800;letter-spacing:-1px;color:#7FE9C0}
        .stat .lbl{font-size:13px;color:#9DB6E6;font-weight:600;margin-top:6px}
        .trust-note{text-align:center;font-size:12px;color:#5F7290;margin-top:26px}
        @media(max-width:640px){.stats{grid-template-columns:1fr 1fr;gap:28px 16px}}

        .previews{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
        .pv{background:var(--card);border-radius:20px;box-shadow:var(--shadow);overflow:hidden;display:flex;flex-direction:column;transition:transform .15s ease}
        .pv:hover{transform:translateY(-2px)}
        .pv-shot{height:150px;background:linear-gradient(150deg,#EAF1FF,#DDE8FB);display:grid;place-items:center;font-size:40px;position:relative}
        .pv-badge{position:absolute;top:12px;right:12px;font-size:10px;font-weight:800;color:var(--green);background:#fff;padding:3px 8px;border-radius:6px}
        .pv-body{padding:18px 20px}
        .pv-body h3{font-size:16px;font-weight:800}
        .pv-body p{font-size:13px;color:var(--ink2);margin-top:6px;line-height:1.55}
        .pv-link{font-size:13px;font-weight:700;color:var(--blue);margin-top:12px;display:inline-block}
        @media(max-width:760px){.previews{grid-template-columns:1fr}}

        .cc{display:grid;grid-template-columns:1fr 1fr;gap:18px}
        .cc-card{border-radius:22px;padding:34px 30px;color:#fff}
        .cc-news{background:linear-gradient(150deg,#2F6BFF,#5A8BFF)}
        .cc-comm{background:linear-gradient(150deg,#16C784,#0E9E6A)}
        .cc-card h3{font-size:22px;font-weight:800;letter-spacing:-.4px}
        .cc-card p{font-size:14px;margin-top:10px;line-height:1.6;opacity:.92}
        .cc-btns{display:flex;gap:10px;margin-top:20px;flex-wrap:wrap}
        .cc-btns :global(a){background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.25);color:#fff;border-radius:12px;padding:12px 18px;font-size:14px;font-weight:700}
        @media(max-width:760px){.cc{grid-template-columns:1fr}}

        .roadmap{display:flex;flex-wrap:wrap;gap:12px;justify-content:center}
        .rm{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:13px 18px;font-size:13.5px;font-weight:700;color:var(--ink2)}
        .rm span{font-size:11px;font-weight:800;color:var(--amber);margin-left:7px}

        .footer{background:#0E1A2E;color:#8AA0C6;padding:44px 0;font-size:13px}
        .foot-in{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:16px}
        .foot-brand{color:#fff;font-weight:800;font-size:18px}
        .foot-links{display:flex;gap:20px}
        .foot-links :global(a){color:#8AA0C6}
        .foot-links :global(a:hover){color:#fff}
        .foot-disclaimer{margin-top:20px;font-size:11.5px;color:#5F7290;line-height:1.6}
      `}</style>
    </>
  );
}

export async function getStaticProps() {
  const contentDir = path.join(process.cwd(), 'content', 'daily');
  let reports = [];

  try {
    const files = fs.readdirSync(contentDir).filter((f) => f.endsWith('.md')).sort().reverse();
    reports = files
      .slice(0, 30)
      .map((file) => {
        const raw = fs.readFileSync(path.join(contentDir, file), 'utf8');
        const { data } = matter(raw);
        return {
          date: data.date || file.replace('.md', ''),
          regime: data.regime || 'SIDEWAYS',
          heat_score: data.heat_score || 50,
          heat_grade: data.heat_grade || 'WARM',
          pnl_emoji: data.pnl_emoji || '➖',
          trade_count: data.trade_count || 0,
          block_count: data.block_count || 0,
          tags: data.tags || [],
          insight: (data.insight || '').replace(/\\"/g, '"'),
          published: data.published !== false,
        };
      })
      .filter((r) => r.published);
  } catch (e) {
    reports = [];
  }

  const stats = {
    totalDays: reports.length,
    totalReports: reports.length,
    totalTrades: reports.reduce((s, r) => s + (r.trade_count || 0), 0),
    totalBlocked: reports.reduce((s, r) => s + (r.block_count || 0), 0),
    totalAnalyzed: reports.reduce((s, r) => s + (r.block_count || 0) + (r.trade_count || 0), 0),
  };

  return { props: { reports, stats } };
}
