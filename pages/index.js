import Head from 'next/head';
import Link from 'next/link';
import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { SITE, ORG_NAME } from '../lib/site';

const REGIME_EMOJI = { BULL: '📈', BEAR: '📉', SIDEWAYS: '➖' };
const REGIME_LABEL = { BULL: '상승장', BEAR: '하락장', SIDEWAYS: '횡보장' };
const REGIME_TAG = { BULL: 'p-bull', BEAR: 'p-bear', SIDEWAYS: 'p-flat' };

export default function Home({ reports, stats, cases }) {
  const latest = reports[0] || null;
  const emoji = (r) => REGIME_EMOJI[r] || '➖';
  const label = (r) => REGIME_LABEL[r] || '횡보장';
  const analyzed = latest ? (latest.block_count || 0) + (latest.trade_count || 0) : 0;

  // 조부장 오늘 경제일기 — 오늘 운영일지(latest)로 매일 갱신되는 1인칭 일기
  const diary = latest ? {
    open: latest.regime === 'BEAR'
        ? '출근길 지하철에서 지수를 확인했다. 오늘도 화면이 파랗다.'
        : latest.regime === 'BULL'
        ? '아침 뉴스가 온통 강세 얘기다. 이럴 때가 오히려 더 조심스럽다.'
        : '시장은 오늘도 방향을 정하지 못했다. 그래서 나도 서두르지 않기로 했다.',
    act: latest.trade_count > 0
        ? `ONE-HUB가 걸러준 후보 중 ${latest.trade_count}건, 내 손으로 승인 버튼을 눌렀다.`
        : 'AI는 후보를 모두 걸렀고, 나는 오늘 아무것도 사지 않았다. 참는 것도 결정이다.',
    close: latest.regime === 'BEAR'
        ? '잃지 않은 하루가, 내일의 실탄을 남긴다.'
        : latest.regime === 'BULL'
        ? '오를 때일수록 전체 배분을 본다. 남들 따라가지 않는다.'
        : '기다림도 하나의 포지션이다. 오늘의 나는 흔들리지 않았다.',
  } : null;

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
      sameAs: ['https://t.me/onehub_jiy_bot', 'https://github.com/inyoung77cho-coder'],
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
        <main>
          {/* HERO */}
          <section className="hero">
            <div className="container">
              <p className="hero-live">
                <span className="dotlive" aria-hidden="true"></span> LIVE · 주식·ETF·부동산 통합 운영
                {latest && <> · 오늘 {emoji(latest.regime)} {label(latest.regime)}</>}
              </p>
              <h1>
                당신은 <em>AI를 이길 수</em> 있나요?
              </h1>
              <p className="lead">
                매일 AI가 종목을 고릅니다. 당신도 고르세요. 같은 <b>가상 1천만원</b>으로 시작해,
                3일 뒤 누가 더 벌었는지 <b>지갑 잔고</b>로 겨룹니다. — 주식·ETF·부동산을 AI와 함께
                운영하는 ONE-HUB의, 가장 재밌는 시작.
              </p>
              <div className="hero-cta">
                <a className="btn btn-white btn-lg" href="/pwa?tab=report&sec=vs">⚔️ AI와 대결 시작</a>
              </div>
              <p className="hero-disclaim">※ 가상 게임머니로 하는 <b>판단 연습</b>입니다. 실제 투자·주문이 아니며, 최종 판단은 본인 책임입니다(투자자문 아님).</p>
              <div className="hero-teaser">
                <span className="tchip">통합 자산 <b>주식 · ETF · 부동산</b></span>
                {latest && (
                  <span className="tchip">
                    오늘 판단 <b>{latest.trade_count > 0 ? `실행 ${latest.trade_count}건` : '진입 자제'}</b>
                  </span>
                )}
                <span className="tchip">누적 운영 <b>{stats.totalDays}일</b>{stats.watchDays > 0 ? ` (매매 ${stats.tradeDays} · 관망 ${stats.watchDays})` : ''}</span>
              </div>
            </div>
          </section>

          {/* [HI-2] ⚔️ 나 vs AI 게임 — 최상단 훅. 관찰 → 참여로. (단일사용자: 당신 vs AI, PWA 게임 연결) */}
          <section className="gamehook">
            <div className="container">
              <div className="gh-card">
                <div className="gh-top"><span className="gh-lbl">⚔️ 나 vs AI · 가상 대결</span><span className="gh-virtual">가상·모의</span></div>
                <div className="gh-versus">
                  <div className="gh-side"><span className="gh-who">🙋 나</span><span className="gh-seed">1,000만</span></div>
                  <span className="gh-x">VS</span>
                  <div className="gh-side"><span className="gh-who">AI 🤖</span><span className="gh-seed">1,000만</span></div>
                </div>
                <p className="gh-desc">같은 <b>가상 시드머니</b>로 출발합니다. AI가 오늘 고른 종목에 당신도 <b>사거나 지나치고</b>,
                  3일 뒤 <b>내 지갑 vs AI 지갑</b> 잔고로 승부를 봅니다. "3승 2패"가 아니라 <b>"얼마 벌었나"</b>로.</p>
                <div className="gh-steps">
                  <span className="gh-step">① 오늘 AI 선택 보기</span>
                  <span className="gh-step">② 나라면 매수/관망</span>
                  <span className="gh-step">③ 3일 뒤 지갑 대결</span>
                </div>
                <div className="gh-example">
                  <div className="gh-ex-lbl">예를 들면 이렇게 진행됩니다</div>
                  <div className="gh-ex-row"><span className="gh-ex-day">Day 1</span>AI가 A종목을 추천 — 당신은 &ldquo;아니, 너무 올랐다&rdquo;며 관망을 선택</div>
                  <div className="gh-ex-row"><span className="gh-ex-day">Day 3</span>A종목 -4% 하락 — 관망한 당신의 판단이 이겼습니다 🏆</div>
                  <div className="gh-ex-note">반대로 당신이 옳지 않을 수도 있습니다. 승패보다 중요한 건, <b>왜 그렇게 판단했는지</b>가 매번 기록으로 남는다는 것.</div>
                </div>
                <a className="btn btn-white btn-lg gh-cta" href="/pwa?tab=report&sec=vs">지금 대결 시작 →</a>
                <p className="gh-foot">🎮 가상·모의 게임 · 실제 자산 아님 · 재미로 판단을 남길수록 AI가 더 정확해집니다(당신의 판단이 학습 데이터).</p>
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

          {/* 조부장 오늘 경제일기 (상단 프로미넌트) */}
          {latest && diary && (
            <section style={{ paddingTop: 44, paddingBottom: 0 }}>
              <div className="container">
                <div className="diary">
                  <div className="diary-side">
                    <div className="diary-avatar" aria-hidden="true">🧑‍💼</div>
                    <div className="diary-who">조 부장<span>분당 · 대기업 18년차</span></div>
                  </div>
                  <div className="diary-main">
                    <div className="diary-top">
                      <span className="diary-eyebrow">📔 조부장의 오늘 경제일기</span>
                      <span className="diary-date">{latest.date} · {emoji(latest.regime)} {label(latest.regime)}</span>
                    </div>
                    <p className="diary-p">{diary.open}</p>
                    <p className="diary-quote">&ldquo;{latest.insight}&rdquo;</p>
                    <p className="diary-p">{diary.act} {diary.close}</p>
                    <div className="diary-links">
                      <a href="/story">조 부장 이야기 처음부터 →</a>
                      <a href={`/daily/${latest.date}`}>오늘 판단 근거 보기 →</a>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          )}

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

          {/* USE CASES — PWA 활용 사례 (3자산 균형) */}
          <section style={{ paddingTop: 0 }}>
            <div className="container">
              <div className="sec-head">
                <p className="eyebrow">HOW YOU USE IT</p>
                <h2>세 자산, 이렇게 씁니다</h2>
                <p>&ldquo;AI가 어떻게 판단하나&rdquo;가 아니라 — 당신의 세 자산에 무엇이 달라지는지, 사례로 봅니다.</p>
              </div>
              <div className="usecases">
                <div className="uc uc-stock">
                  <div className="uc-badge">📈 주식</div>
                  <h3>&ldquo;물려있는 종목, 팔까 말까?&rdquo;</h3>
                  <p>보유 종목마다 매일 손절·홀딩 신호와 <b>그 이유</b>를 받습니다. 감으로 버티지 않고, 규칙으로 지킵니다.</p>
                </div>
                <div className="uc uc-etf">
                  <div className="uc-badge">📊 ETF</div>
                  <h3>&ldquo;내 ETF 3개, 사실 같은 지수였다?&rdquo;</h3>
                  <p>중복도·환차·세금까지 반영한 <b>실질수익</b>으로 봅니다. 분산인 줄 알았던 게 집중이었음을 잡아줍니다.</p>
                </div>
                <div className="uc uc-re">
                  <div className="uc-badge">🏢 부동산</div>
                  <h3>&ldquo;내 아파트, 지금 저평가일까?&rdquo;</h3>
                  <p>실거래가 기반 <b>ONE Score</b>로 보유·추가·관망을 자산 <b>전체 배분</b> 안에서 판단합니다.</p>
                </div>
              </div>
              <div style={{ textAlign: 'center', marginTop: 26 }}>
                <a className="btn btn-primary btn-lg" href="/pwa">🚀 앱에서 내 자산으로 시작하기</a>
              </div>
            </div>
          </section>

          {/* STORY */}
          <section style={{ paddingTop: 0 }}>
            <div className="container">
              <div className="story-wrap">
                <p className="story-eyebrow">STORY · 머니더버니 노트</p>
                <h2 className="story-title">분당 조부장의 자산 이야기</h2>
                <p className="story-body">
                  분당에 자가 한 채, 대기업 18년 차 조 부장. 남들은 성공했다지만 통장은 늘 불안하다.
                  물려서 손실 난 주식, 뭘 살지 모르는 ETF, 대출 낀 아파트 한 채 — 세 자산은 따로 놀고 노후 계산은 서지 않는다.
                </p>
                <p className="story-body">
                  그가 ONE-HUB로 세 자산을 한곳에 모았다. AI가 매일 시장을 읽고, 최종 결정은 조 부장이 내린다.
                  잘한 날도, &lsquo;아무것도 하지 않은 게 최선&rsquo;이던 날도, 손절로 쓰라린 날도 — 그대로 기록된다. 이건 그 이야기다.
                </p>
                <a href="/story" className="story-cta">조 부장의 이야기 계속 읽기 →</a>
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
                <a className="today-wrap" href={`/daily/${latest.date}`} aria-label={`${latest.date} 오늘의 판단 전체 보기`}>
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
                </a>
              </div>
            </section>
          )}

          {/* REAL CASES — 후기 대신 실제 운영일지 사례(날조 없음) */}
          {cases && cases.length > 0 && (
            <section style={{ paddingTop: 0 }}>
              <div className="container">
                <div className="sec-head">
                  <p className="eyebrow">REAL CASES · 실제 있었던 일</p>
                  <h2>후기 대신, 실제 있었던 판단을 보여드립니다</h2>
                  <p>꾸며낸 이용자 후기가 아니라 — 운영일지에 실제로 기록된 날짜·수치·인사이트 그대로입니다.</p>
                </div>
                <div className="usecases">
                  {cases.map((c) => (
                    <a className="uc case-card" key={c.key} href={`/daily/${c.date}`}>
                      <div className="uc-badge">{c.ic} {c.tag} · {c.date}</div>
                      <h3>{c.headline}</h3>
                      <p>&ldquo;{c.quote}&rdquo;</p>
                      <span className="case-link">그날 판단 전체 보기 →</span>
                    </a>
                  ))}
                </div>
              </div>
            </section>
          )}

          {/* OPERATING LOG */}
          <section style={{ paddingTop: 0 }}>
            <div className="container">
              <div className="sec-head">
                <p className="eyebrow">DAILY REPORTS · 매일 16:30 업데이트</p>
                <h2>운영일지</h2>
                <p>매일의 시장 판단을 기록으로 남깁니다. ONE-HUB의 콘텐츠이자 신뢰의 근거입니다.</p>
              </div>
              <div className="logs">
                {/* index 0(최신)은 위 TODAY'S JUDGMENT에 이미 표시되므로 그 다음 건부터 */}
                {reports.slice(1, 5).map((r) => (
                  <a className="log" key={r.date} href={`/daily/${r.date}`}>
                    <div className="log-top">
                      <span className="log-date">{r.date}</span>
                      <span className={`phase-tag ${REGIME_TAG[r.regime] || 'p-flat'}`}>
                        {emoji(r.regime)} {r.regime}
                      </span>
                    </div>
                    <p className="log-txt">{r.insight}</p>
                    <span className="log-foot">실행 {r.trade_count || 0}건 · 자세히 →</span>
                  </a>
                ))}
              </div>
              <div style={{ textAlign: 'center', marginTop: 28 }}>
                <a className="btn btn-ghost" href="/daily">운영일지 전체 보기 →</a>
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
                <div className="stat"><div className="num">{stats.totalDays}</div><div className="lbl">운영 일수{stats.watchDays > 0 ? <><br /><span style={{ fontSize: '0.68rem', fontWeight: 600, opacity: 0.7 }}>매매 {stats.tradeDays} · 관망 {stats.watchDays}</span></> : null}</div></div>
              </div>
              <p className="trust-note">※ 모든 수치는 운영일지 데이터(매일 15:30 KST 갱신)에서 자동 집계됩니다.{stats.watchDays > 0 ? ' ‘관망’은 엔진이 가동됐으나 선별 결과 매매하지 않은 날입니다(중단 아님).' : ''}</p>
              {/* [HI-4] 트랙레코드 ↔ 게임 연결 — 참여자 집계(사람 승률)는 다중사용자 인프라 후. 지금은 도전 프레임만. */}
              <div className="tr-game">
                <div className="tr-game-t">⚔️ AI는 완벽하지 않습니다 — 그래서 당신이 이길 수 있습니다</div>
                <div className="tr-game-d">AI가 {stats.totalBlocked}건을 걸렀지만 모두 옳지는 않았습니다. 같은 가상 시드로 AI와 붙어, 당신의 판단이 더 나았는지 지갑으로 확인하세요.</div>
                <a className="btn btn-line btn-lg tr-game-cta" href="/pwa?tab=report&sec=vs">⚔️ AI와 대결 시작 →</a>
              </div>
            </div>
          </section>

          {/* THE BOARD — 성과 랭킹 + 부동산 신규정보 (경쟁·재미) */}
          <section style={{ paddingTop: 0 }}>
            <div className="container">
              <div className="sec-head">
                <p className="eyebrow">THE BOARD · 함께, 재미있게</p>
                <h2>이번 주, 누가 잘하고 있나</h2>
                <p>혼자가 아니라 함께 — 참여자들의 성과 보드와 새 부동산 소식을 홈에서 먼저 봅니다.</p>
              </div>
              <div className="board-grid">
                <a className="board-card" href="/leaderboard">
                  <div className="board-ic">🏆</div>
                  <div className="board-body">
                    <div className="board-t">주간·일일 성과 랭킹</div>
                    <div className="board-d">수익·정확도 상위 참여자 보드 — 경쟁하듯 배웁니다.</div>
                  </div>
                  <span className="board-arrow">보드 열기 →</span>
                </a>
                <a className="board-card" href="/board/realestate">
                  <div className="board-ic">🏢</div>
                  <div className="board-body">
                    <div className="board-t">부동산 신규 정보</div>
                    <div className="board-d">협력업체가 올리는 신규 매물·시세 소식을 홈에서 먼저.</div>
                  </div>
                  <span className="board-arrow">보드 열기 →</span>
                </a>
              </div>
            </div>
          </section>

          {/* PWA FUNNEL (콘솔 중복 제거 · 단일 퍼널) */}
          <section>
            <div className="container">
              <div className="funnel">
                <p className="eyebrow">THE CONSOLE</p>
                <h2 className="funnel-h">운영은 앱에서 — 주식·ETF·부동산을 한 콘솔에서</h2>
                <p className="funnel-p">
                  분석·배분·리밸런싱·의사결정은 ONE-HUB PWA 콘솔이 담당합니다. 홈페이지는 기록과 이야기를, 앱은 실제 운영을.
                </p>
                <div className="funnel-tags">
                  <span>🤖 AI 자산운영</span><span>💼 통합 자산</span><span>📊 ETF</span><span>🏢 부동산</span><span>🛡️ 시스템 상태</span>
                </div>
                <a href="/pwa" className="btn btn-primary btn-lg" style={{ marginTop: 20 }}>🚀 ONE-HUB 앱 시작하기</a>
                <p className="funnel-sub">
                  설치 없이 웹에서 바로 · 홈 화면에 추가하면 실시간 알림까지 ·{' '}
                  <Link href="/pwa-guide" style={{ color: 'var(--blue)', fontWeight: 700 }}>설치 가이드</Link>
                </p>
              </div>
            </div>
          </section>

          {/* ACQUISITION CHANNELS (유입 강화) */}
          <section style={{ paddingTop: 0 }}>
            <div className="container">
              <div className="sec-head">
                <p className="eyebrow">FOLLOW ONE-HUB</p>
                <h2>매일의 판단을, 원하는 채널에서</h2>
                <p>새 글·리포트·영상은 아래 채널로 먼저 도착합니다. 팔로우하고 ONE-HUB의 성장 과정을 함께 보세요.</p>
              </div>
              <div className="channels">
                <div className="channel channel-soon">
                  <div className="ch-ic">▶️</div>
                  <div className="ch-t">YouTube <span className="ch-soon">준비중</span></div>
                  <div className="ch-d">AI 운영 브이로그·시장 브리핑 영상</div>
                  <span className="ch-cta-soon">곧 공개</span>
                </div>
                <a className="channel" href="/blog">
                  <div className="ch-ic">✍️</div>
                  <div className="ch-t">블로그</div>
                  <div className="ch-d">AI 판단 근거·투자 방법론 아티클</div>
                  <span className="ch-cta">읽으러 가기 →</span>
                </a>
                <a className="channel" href="https://t.me/onehub_jiy_bot" target="_blank" rel="noopener">
                  <div className="ch-ic">✈️</div>
                  <div className="ch-t">텔레그램</div>
                  <div className="ch-d">매일 15:30 리포트를 실시간으로</div>
                  <span className="ch-cta">채널 참여 →</span>
                </a>
                <a className="channel" href="/community">
                  <div className="ch-ic">💬</div>
                  <div className="ch-t">커뮤니티</div>
                  <div className="ch-d">뉴스레터·카카오·전체 채널 허브</div>
                  <span className="ch-cta">전체 보기 →</span>
                </a>
              </div>
              <p className="channels-more">
                용어가 낯설다면 <a href="/learning-center">러닝센터 · 지표 해설</a>부터, 더 깊이 보려면 <a href="/blog">블로그</a>로.
              </p>
            </div>
          </section>

          {/* [FB-7 §7.3] 자동 리포트 홈 공개 — 분당 하이퍼로컬 SEO·유입. 매주 자동 생성되는 리포트를 홈에서. */}
          <section style={{ paddingTop: 0 }}>
            <div className="container">
              <div className="sec-head">
                <p className="eyebrow">AUTO REPORT</p>
                <h2>매주 자동 생성되는 리포트, 홈에서 바로</h2>
                <p>엔진이 국토부 실거래와 시장에서 확인된 자료를 종합해 매주 리포트를 씁니다. 확정과 미검증(🟡 참고)을 구분해 투명하게 공개합니다.</p>
              </div>
              <div className="channels">
                <a className="channel" href="/board/realestate">
                  <div className="ch-ic">🏠</div>
                  <div className="ch-t">분당 부동산 주간 리포트</div>
                  <div className="ch-d">대장 단지 흐름 · 실거래(확정)+시장확인(🟡 미검증) 종합</div>
                  <span className="ch-cta">리포트 보기 →</span>
                </a>
                <a className="channel" href="/weekly">
                  <div className="ch-ic">📊</div>
                  <div className="ch-t">주식 주간 리포트</div>
                  <div className="ch-d">국면 · 과열도 · 매매 요약 자동 발행</div>
                  <span className="ch-cta">리포트 보기 →</span>
                </a>
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
          {/* CTA BAND (퍼널 마감) */}
          <section>
            <div className="container">
              <div className="cta-band">
                <h2 className="cta-h">세 자산, 이제 따로 굴리지 마세요.</h2>
                <p className="cta-p">주식·ETF·부동산을 하나의 AI로 — 오늘부터 ONE-HUB.</p>
                <a href="/pwa" className="btn btn-white btn-lg">🚀 무료로 앱 시작하기</a>
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
                <Link href="/partners/realestate">협력업체</Link>
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
        .wrap :global(a){text-decoration:none}
        .wrap :global(a:not([class])){color:inherit}
        .container{max-width:var(--maxw);margin:0 auto;padding:0 22px}
        .eyebrow{font-size:12.5px;font-weight:800;letter-spacing:.4px;color:var(--blue);margin-bottom:12px}
        .eyebrow-green{color:#7FE9C0}
        section{padding:64px 0}
        .sec-head{text-align:center;max-width:640px;margin:0 auto 40px}
        .sec-head h2{font-size:30px;font-weight:800;letter-spacing:-.6px;line-height:1.3}
        .sec-head p{font-size:15px;color:var(--ink2);margin-top:12px;line-height:1.6}

        /* STORY 티저 */
        .story-wrap{background:linear-gradient(150deg,var(--hero1),var(--hero2));color:#fff;border-radius:24px;padding:48px 44px;box-shadow:var(--shadow)}
        .story-eyebrow{font-size:12.5px;font-weight:800;letter-spacing:.5px;color:#7FE9C0;text-transform:uppercase;margin-bottom:14px}
        .story-title{font-size:28px;font-weight:800;letter-spacing:-.6px;margin-bottom:18px}
        .story-body{font-size:16px;line-height:1.85;color:#D7E1F3;max-width:780px;margin-bottom:14px}
        .story-cta{display:inline-block;margin-top:12px;font-size:15px;font-weight:700;color:#7FE9C0}
        @media(max-width:640px){.story-wrap{padding:32px 24px}.story-title{font-size:22px}.story-body{font-size:15px}}

        /* PWA 퍼널 밴드 */
        .funnel{background:#fff;border:1px solid var(--line);border-radius:24px;padding:52px 40px;box-shadow:var(--shadow);text-align:center}
        .funnel-h{font-size:26px;font-weight:800;letter-spacing:-.5px;margin:10px 0 12px;color:var(--ink)}
        .funnel-p{font-size:15px;color:var(--ink2);max-width:640px;margin:0 auto 20px;line-height:1.65}
        .funnel-tags{display:flex;gap:8px;flex-wrap:wrap;justify-content:center}
        .funnel-tags span{background:var(--blue-soft);color:var(--blue);font-size:13px;font-weight:700;padding:7px 13px;border-radius:11px}
        .funnel-sub{font-size:13px;color:var(--ink3);margin-top:16px}
        @media(max-width:640px){.funnel{padding:36px 22px}.funnel-h{font-size:21px}}

        /* 유입 채널 */
        .channels{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}
        .channel{background:#fff;border:1px solid var(--line);border-radius:18px;padding:22px 20px;box-shadow:var(--shadow);display:flex;flex-direction:column;gap:5px;transition:transform .15s ease,box-shadow .15s ease}
        .channel:hover{transform:translateY(-2px);box-shadow:0 12px 32px rgba(31,63,120,.12)}
        .ch-ic{font-size:26px;margin-bottom:6px}
        .ch-t{font-size:16px;font-weight:800;color:var(--ink)}
        .ch-d{font-size:13px;color:var(--ink2);line-height:1.5;flex:1}
        .ch-cta{font-size:13px;font-weight:700;color:var(--blue);margin-top:10px}
        .ch-cta-soon{font-size:13px;font-weight:700;color:var(--ink3);margin-top:10px}
        .channel-soon{opacity:.72;cursor:default}
        .channel-soon:hover{transform:none;box-shadow:var(--shadow)}
        .ch-soon{font-size:10px;font-weight:800;color:#64748B;background:#F1F5F9;padding:2px 7px;border-radius:6px;margin-left:6px;vertical-align:middle}

        /* 3자산 활용 사례 */
        .usecases{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
        .uc{background:#fff;border:1px solid var(--line);border-radius:20px;padding:26px 22px;box-shadow:var(--shadow)}
        .uc-badge{display:inline-block;font-size:12.5px;font-weight:800;padding:5px 11px;border-radius:9px;margin-bottom:14px}
        .uc-stock .uc-badge{background:var(--blue-soft);color:var(--blue)}
        .uc-etf .uc-badge{background:var(--green-soft);color:#0E9E6A}
        .uc-re .uc-badge{background:#FFF6E5;color:#B45309}
        .uc h3{font-size:17px;font-weight:800;letter-spacing:-.3px;color:var(--ink);line-height:1.45;margin-bottom:10px}
        .uc p{font-size:14px;color:var(--ink2);line-height:1.7}
        .uc p b{color:var(--ink)}
        @media(max-width:820px){.usecases{grid-template-columns:1fr}}
        .case-card{display:block;cursor:pointer;transition:transform .15s ease,box-shadow .15s ease}
        .case-card:hover{transform:translateY(-2px);box-shadow:0 12px 32px rgba(31,63,120,.12)}
        .case-card .uc-badge{background:#F1F5F9;color:var(--ink2)}
        .case-card p{font-style:italic}
        .case-link{display:inline-block;margin-top:12px;font-size:13px;font-weight:700;color:var(--blue)}

        /* 성과 보드 */
        .board-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
        .board-card{display:flex;align-items:center;gap:16px;background:#fff;border:1px solid var(--line);border-radius:18px;padding:22px 24px;box-shadow:var(--shadow);transition:transform .15s ease}
        .board-card:hover{transform:translateY(-2px)}
        .board-soon{opacity:.72;cursor:default}
        .board-soon:hover{transform:none}
        .board-ic{font-size:30px;flex-shrink:0}
        .board-body{flex:1}
        .board-t{font-size:16px;font-weight:800;color:var(--ink)}
        .board-d{font-size:13px;color:var(--ink2);margin-top:4px;line-height:1.5}
        .board-arrow{font-size:13px;font-weight:700;color:var(--blue);flex-shrink:0}
        .board-arrow-soon{font-size:13px;font-weight:700;color:var(--ink3);flex-shrink:0}
        @media(max-width:640px){.board-grid{grid-template-columns:1fr}}
        .channels-more{text-align:center;font-size:14px;color:var(--ink2);margin-top:24px}
        .channels-more :global(a){color:var(--blue);font-weight:700}

        /* 조부장 오늘 경제일기 */
        .diary{display:flex;gap:26px;background:linear-gradient(135deg,#FFFFFF,#F1F6FF);border:1px solid #DCE7FF;border-radius:24px;padding:30px 34px;box-shadow:var(--shadow)}
        .diary-side{flex-shrink:0;width:96px;text-align:center}
        .diary-avatar{font-size:48px;line-height:1}
        .diary-who{font-size:12.5px;font-weight:800;color:var(--ink);margin-top:8px;line-height:1.4;display:flex;flex-direction:column}
        .diary-who span{font-size:10.5px;font-weight:600;color:var(--ink3);margin-top:2px}
        .diary-main{flex:1;min-width:0}
        .diary-top{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:14px}
        .diary-eyebrow{font-size:15px;font-weight:800;color:var(--blue);letter-spacing:-.2px}
        .diary-date{font-size:12.5px;color:var(--ink3);font-family:'Space Mono',monospace}
        .diary-p{font-size:15px;line-height:1.8;color:var(--ink);margin-bottom:8px;word-break:keep-all}
        .diary-quote{font-size:16px;line-height:1.65;color:var(--ink);font-weight:700;border-left:3px solid var(--blue);padding:2px 0 2px 14px;margin:12px 0}
        .diary-links{display:flex;gap:20px;flex-wrap:wrap;margin-top:16px}
        .diary-links :global(a){font-size:13.5px;font-weight:700;color:var(--blue)}
        @media(max-width:640px){.diary{flex-direction:column;gap:16px;padding:24px 22px}.diary-side{width:auto;display:flex;align-items:center;gap:12px;text-align:left}.diary-who{align-items:flex-start}.diary-avatar{font-size:40px}}
        @media(max-width:860px){.channels{grid-template-columns:1fr 1fr}}
        @media(max-width:520px){.channels{grid-template-columns:1fr}}

        /* 최종 CTA 밴드 */
        .cta-band{background:linear-gradient(150deg,var(--blue),var(--hero1));color:#fff;border-radius:24px;padding:56px 40px;text-align:center}
        .cta-h{font-size:28px;font-weight:800;letter-spacing:-.6px;margin-bottom:12px}
        .cta-p{font-size:15.5px;color:#DCE6FA;margin-bottom:26px}
        @media(max-width:640px){.cta-band{padding:40px 24px}.cta-h{font-size:22px}}

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
        .hero-disclaim{margin-top:18px;font-size:12px;color:#8fa0c0;line-height:1.6}
        .hero-disclaim b{color:#C7D4EC;font-weight:700}
        /* [HI-2] 나 vs AI 게임 훅 섹션 */
        .gamehook{padding:0 0 8px;background:var(--hero1)}
        .gh-card{max-width:560px;margin:0 auto;transform:translateY(-28px);background:#fff;border-radius:20px;padding:22px 20px;box-shadow:0 18px 50px rgba(10,20,50,.28)}
        .gh-top{display:flex;align-items:center;justify-content:space-between;gap:8px}
        .gh-lbl{font-size:15px;font-weight:800;color:#0E1B3A}
        .gh-virtual{font-size:11px;font-weight:800;color:#2F6BFF;background:rgba(47,107,255,.1);padding:3px 10px;border-radius:999px;white-space:nowrap}
        .gh-versus{display:flex;align-items:center;justify-content:center;gap:20px;margin:16px 0 6px;padding:14px 0;background:#F3F6FC;border-radius:14px}
        .gh-side{display:flex;flex-direction:column;align-items:center;gap:3px}
        .gh-who{font-size:14px;font-weight:800;color:#0E1B3A}
        .gh-seed{font-size:20px;font-weight:900;color:#2F6BFF;font-family:ui-monospace,monospace}
        .gh-x{font-size:15px;font-weight:900;color:#9AA7C2}
        .gh-desc{font-size:14px;color:#3A4666;line-height:1.65;margin:12px 0;word-break:keep-all}
        .gh-desc b{color:#0E1B3A;font-weight:800}
        .gh-steps{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px}
        .gh-step{font-size:12px;font-weight:700;color:#3A4666;background:#EEF2FB;border-radius:8px;padding:6px 10px}
        .gh-example{background:#F8FAFF;border:1px dashed #C7D4EC;border-radius:12px;padding:14px 16px;margin-bottom:14px}
        .gh-ex-lbl{font-size:11px;font-weight:800;color:#8894AE;letter-spacing:.3px;text-transform:uppercase;margin-bottom:8px}
        .gh-ex-row{font-size:13px;color:#3A4666;line-height:1.6;margin-bottom:4px;word-break:keep-all}
        .gh-ex-day{display:inline-block;font-size:10.5px;font-weight:800;color:#2F6BFF;background:rgba(47,107,255,.1);border-radius:6px;padding:2px 7px;margin-right:8px;font-family:ui-monospace,monospace}
        .gh-ex-note{font-size:12px;color:#8894AE;line-height:1.55;margin-top:8px;word-break:keep-all}
        .gh-ex-note b{color:#3A4666;font-weight:800}
        .gh-cta{width:100%;justify-content:center;background:#2F6BFF !important;color:#fff !important;text-align:center}
        .gh-foot{font-size:11.5px;color:#8894AE;margin-top:12px;line-height:1.6;word-break:keep-all}
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
        /* [HI-4] 트랙레코드 게임 연결 */
        .tr-game{max-width:560px;margin:22px auto 0;text-align:center;background:#F3F6FC;border:1px solid #E1E8F5;border-radius:16px;padding:20px 18px}
        .tr-game-t{font-size:16px;font-weight:800;color:#0E1B3A;line-height:1.5;word-break:keep-all}
        .tr-game-d{font-size:13.5px;color:#3A4666;line-height:1.6;margin:8px 0 14px;word-break:keep-all}
        .tr-game-cta{display:inline-flex;background:#2F6BFF !important;color:#fff !important;border:none !important}
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
    // [AI-8] 정직한 트랙레코드 — '운영일'을 매매일/관망일로 분해. 관망일(선별 결과 매매 없음)을
    //   숨기지 않는다. 봇은 가동됐으나 BEAR 국면 등으로 매매하지 않은 날이 있음(자율모드 OFF 아님).
    tradeDays: reports.filter((r) => (r.trade_count || 0) > 0).length,
    watchDays: reports.filter((r) => (r.trade_count || 0) === 0).length,
  };

  // [실전 사례] 후기 대신 — 실제 운영일지에서 뽑은 3가지 실제 사례(날조 없음, 전부 content/daily 실데이터).
  //   ① 가장 많이 걸러낸 날(방어) ② 실제 매매가 있었던 날(실행) ③ 하락장에서 버틴 날(관망).
  // latest(오늘의 판단 카드에 이미 표시됨)는 후보에서 제외 — 안 그러면 실행 사례가 매번 오늘과 겹침.
  const caseCandidates = reports.slice(1);
  const byBlock = [...caseCandidates].filter((r) => (r.block_count || 0) > 0).sort((a, b) => (b.block_count || 0) - (a.block_count || 0));
  const byTrade = [...caseCandidates].filter((r) => (r.trade_count || 0) > 0).sort((a, b) => (b.trade_count || 0) - (a.trade_count || 0));
  const byBear = caseCandidates.filter((r) => r.regime === 'BEAR' && (r.trade_count || 0) === 0);
  const cases = [];
  if (byBlock[0]) cases.push({ key: 'block', ic: '🛡️', tag: '방어', date: byBlock[0].date, headline: `${byBlock[0].block_count}건을 걸러낸 날`, quote: byBlock[0].insight });
  if (byTrade[0]) cases.push({ key: 'trade', ic: '⚡', tag: '실행', date: byTrade[0].date, headline: `${byTrade[0].trade_count}건을 실행한 날`, quote: byTrade[0].insight });
  if (byBear[0]) cases.push({ key: 'watch', ic: '🧊', tag: '관망', date: byBear[0].date, headline: '하락장에서 아무것도 사지 않은 날', quote: byBear[0].insight });

  return { props: { reports, stats, cases } };
}
