import Head from 'next/head';
import Link from 'next/link';
import PageHero from '../components/PageHero';
import { SITE } from '../lib/site';

const CHAPTERS = [
  {
    no: '01',
    title: '흩어진 세 자산',
    body: [
      '분당에 자가 한 채. 대기업 18년 차, 조 부장. 마흔여덟. 남들은 성공했다고 말한다. 그런데 통장 잔고를 볼 때마다 마음이 불편하다.',
      '주식 계좌엔 3년 전 지인 말만 믿고 산 종목들이 파랗게 물려 있다. ETF는 “분산이 답”이라기에 몇 개 담아뒀는데, 뭘 왜 샀는지 이제 기억나지 않는다. 아파트는 대출이 절반. 오르긴 올랐다는데, 팔 것도 아니니 계좌엔 찍히지 않는다.',
      '세 자산은 각자 다른 앱, 다른 세상에 살고 있었다. 전체가 지금 얼마인지, 뭘 더 사고 뭘 줄여야 하는지 — 아무도 한 화면에서 말해주지 않았다.',
    ],
  },
  {
    no: '02',
    title: 'ONE-HUB를 만나다',
    body: [
      '조 부장이 ONE-HUB를 켠 첫날, 화면엔 익숙한 수익률 대신 문장 하나가 떠 있었다. “오늘은 아무것도 하지 않는 것이 최선입니다.”',
      '이상한 자산 앱이었다. 사라고 부추기지 않았다. 대신 주식·ETF·부동산을 한곳에 모아, 각각의 기준으로 읽어줬다. 시장 온도, 국면(Regime), 세금, 실거래가 — 세 자산이 처음으로 같은 테이블에 앉았다.',
      '“배분이 70:30인데, 목표는 55:45네요.” 앱은 그렇게, 그가 몰랐던 자신의 그림을 처음으로 보여줬다.',
    ],
  },
  {
    no: '03',
    title: 'AI는 읽고, 사람은 결정한다',
    body: [
      '매일 오후 3시 30분, ONE-HUB의 엔진이 시장을 훑고 후보를 골라냈다. 하지만 방아쇠를 당기는 건 언제나 조 부장이었다.',
      '“AI가 대신 사주는 거 아니었어?” 처음엔 답답했다. 그런데 몇 주가 지나자 알았다. 결정을 남에게 넘기지 않는 것, 그게 이 도구의 핵심이었다. AI는 근거를 만들고, 사람은 책임을 진다.',
      '그는 더 이상 “누가 좋다더라”로 사지 않았다. 왜 사는지, 왜 안 사는지를 매일 한 줄로 적기 시작했다.',
    ],
  },
  {
    no: '04',
    title: '아무것도 하지 않은 날',
    body: [
      '어떤 주는 AI가 여덟 번을 “차단”했다. 조건을 못 넘긴 후보 여덟 개가 그대로 걸러졌고, 실행은 0건이었다.',
      '예전의 조 부장이라면 좀이 쑤셔 뭐라도 샀을 것이다. 하지만 그날의 운영일지엔 이렇게 남았다. “하락장에서 아무것도 하지 않은 것이 최선의 판단이었다.”',
      '지지 않는 날들이 쌓였다. 그는 처음으로, 쉬는 것도 전략이라는 말을 몸으로 이해했다.',
    ],
  },
  {
    no: '05',
    title: '손절의 밤',
    body: [
      '물론 늘 이기지는 않았다. 어느 밤, 손절 라인이 걸렸다. 자동 규칙이 포지션을 정리했고, 계좌엔 붉은 숫자가 찍혔다.',
      '쓰라렸다. 그런데 다음 날 운영일지는 실패를 지우지 않았다. “손절 자동 실행은 잘한 선택이었으나, 진입 기준을 더 높였어야 한다는 시장의 경고다.”',
      '실패가 기록으로 남으니, 다음 판단이 조금 더 정교해졌다. 그는 손실보다 그 문장이 더 오래 남았다고 했다.',
    ],
  },
  {
    no: '06',
    title: '1년 후',
    body: [
      '드라마 같은 대박은 없었다. 자산이 갑자기 두 배가 되지도 않았다. 대신 달라진 건 조 부장 자신이었다.',
      '이제 그는 세 자산을 한 화면에서 본다. 오늘 시장이 어떤 국면인지, 자신의 배분이 목표에서 얼마나 벗어났는지 말할 수 있다. 무엇보다, 흔들리지 않는다.',
      '“수익률을 자랑하려고 시작한 게 아니었어요. 내 돈의 판단 과정을, 드디어 내가 이해하게 된 거죠.” — 이건, 그 이야기다.',
    ],
  },
];

export default function StoryPage() {
  const canonical = `${SITE}/story`;
  const description =
    '분당에 자가 한 채, 대기업 18년 차 조 부장. 주식·ETF·부동산을 하나의 AI로 함께 운영하기 시작한 1년의 이야기 — 성공도, 실패도, 아무것도 하지 않은 날까지.';
  return (
    <>
      <Head>
        <title>분당 조부장의 자산 이야기 | ONE-HUB</title>
        <meta name="description" content={description} />
        <link rel="canonical" href={canonical} />
        <meta property="og:type" content="article" />
        <meta property="og:title" content="분당 조부장의 자산 이야기 | ONE-HUB" />
        <meta property="og:description" content={description} />
        <meta property="og:url" content={canonical} />
        <meta property="og:image" content={`${SITE}/api/og-home`} />
        <meta name="twitter:card" content="summary_large_image" />
      </Head>

      <div style={{ minHeight: '100vh', background: '#F4F9FF', fontFamily: 'Pretendard, sans-serif' }}>
        <PageHero
          eyebrow="Story · 머니더버니 노트"
          title="분당 조부장의 자산 이야기"
          subtitle="대기업 18년 차, 자가 한 채. 세 자산을 하나의 AI로 굴리기 시작한 조 부장의 1년 — 성공도, 실패도, 아무것도 하지 않은 날까지 그대로."
        />
        <main className="oh-main" style={{ maxWidth: 720 }}>
          <p className="story-note">
            ※ 아래 이야기는 ONE-HUB의 운영 철학과 실제 판단 방식(3자산 통합 분석 · AI 후보 선별 + 사람의 최종 결정 · 매일의 운영일지)을 한 인물의 시선으로 풀어낸
            <b> 예시 서사</b>입니다. 특정 개인의 실화나 수익 보장을 뜻하지 않습니다.
          </p>

          <article className="story-article">
            {CHAPTERS.map((c) => (
              <section key={c.no} className="chapter">
                <div className="chapter-no">CHAPTER {c.no}</div>
                <h2 className="chapter-title">{c.title}</h2>
                {c.body.map((p, i) => (
                  <p key={i} className="chapter-p">{p}</p>
                ))}
              </section>
            ))}
          </article>

          <div className="story-end">
            <h3>당신의 세 자산은, 지금 몇 시입니까?</h3>
            <p>조 부장의 시작은 거창하지 않았습니다. 흩어진 자산을 한곳에 모은 것뿐이었죠.</p>
            <div className="story-end-cta">
              <a className="oh-btn oh-btn-primary" href="/pwa">🚀 ONE-HUB 앱 시작하기</a>
              <a className="oh-btn oh-btn-ghost" href="/daily">📋 오늘의 운영일지 보기</a>
            </div>
          </div>
        </main>
      </div>

      <style jsx>{`
        .story-note {
          font-size: 13px; color: #64748B; line-height: 1.7; background: #EAF1FF;
          border: 1px solid #DCE7FF; border-radius: 14px; padding: 14px 18px; margin-bottom: 36px;
        }
        .story-note b { color: #2F6BFF; }
        .chapter { margin-bottom: 44px; }
        .chapter-no { font-size: 12px; font-weight: 800; letter-spacing: .12em; color: #2F6BFF; margin-bottom: 8px; }
        .chapter-title { font-size: 24px; font-weight: 800; letter-spacing: -.4px; color: #12213B; margin-bottom: 18px; line-height: 1.3; }
        .chapter-p { font-size: 16.5px; line-height: 1.95; color: #334155; margin-bottom: 16px; word-break: keep-all; }
        .story-end {
          margin-top: 20px; background: linear-gradient(150deg, #12213B, #20375F); color: #fff;
          border-radius: 24px; padding: 44px 36px; text-align: center;
        }
        .story-end h3 { font-size: 22px; font-weight: 800; letter-spacing: -.4px; margin-bottom: 12px; }
        .story-end p { font-size: 15px; color: #C7D4EC; line-height: 1.7; margin-bottom: 24px; }
        .story-end-cta { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
        .oh-btn { display: inline-flex; align-items: center; gap: 7px; font-weight: 700; font-size: 15px; padding: 14px 22px; border-radius: 14px; }
        .oh-btn-primary { background: #fff; color: #12213B; }
        .oh-btn-ghost { background: rgba(255,255,255,.08); color: #fff; border: 1px solid rgba(255,255,255,.22); }
        @media (max-width: 640px) {
          .chapter-title { font-size: 20px; }
          .chapter-p { font-size: 15.5px; }
          .story-end { padding: 32px 22px; }
        }
      `}</style>
    </>
  );
}
