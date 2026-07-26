import Head from 'next/head';
import Link from 'next/link';
import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import PageHero from '../../components/PageHero';
import { SITE } from '../../lib/site';
import { areaLabel, areaChip } from '../../lib/pyeong';

const DEAL_COLOR = {
  '매매': { bg: '#EAF1FF', fg: '#2F6BFF' },
  '전세': { bg: '#E7FAF2', fg: '#0E9E6A' },
  '월세': { bg: '#FFF6E5', fg: '#B45309' },
  '분양': { bg: '#EEE9FF', fg: '#6A4CFF' },
};

// 추세 칩 색상 — 리포트가 regions[].trend 를 담으면 시각화(구 리포트는 trend 없음 → 칩 생략).
const TREND = {
  '상승': { bg: '#FDECEC', fg: '#D0342C', ico: '▲' },
  '하락': { bg: '#EAF3FF', fg: '#1D6FE0', ico: '▼' },
  '보합': { bg: '#EEF2F8', fg: '#64748B', ico: '▬' },
  '혼조': { bg: '#F6EEFF', fg: '#7A4CE0', ico: '↕' },
  '정보부족': { bg: '#F1F5F9', fg: '#94A3B8', ico: '·' },
};

// 리포트 안의 '단지 하이라이트' 한 줄 — 단지 · 평(병기) · 호가.
// 면적은 lib/pyeong 규칙(전용㎡ + 약 N평)으로 통일 표기한다.
function ReportHighlight({ h }) {
  if (!h) return null;
  const area = h.pyeong ? areaChip(h.pyeong) : '';
  return (
    <li className="rp-hl">
      <span className="rp-hl-danji">{h.danji || '단지 미상'}</span>
      {area && <span className="rp-hl-area">{area}</span>}
      {h.price && <span className="rp-hl-price">{h.price}</span>}
      {h.note && <span className="rp-hl-note">{h.note}</span>}
    </li>
  );
}

// CA 엔진 종합 리포트 — 운영자가 승인 게시한 '지역별 동향' 초안.
// 수집정보를 AI가 지역별로 묶어 요약·추세를 서술한 것. 역시 🟡 미검증 참고용.
// 자유 형식: 지역별 카드 + 추세 칩 + (있으면) 단지 하이라이트. 구 리포트(trend/highlights
// 없는 body_json)도 그대로 렌더된다 — 없는 필드는 조용히 생략.
function ReportSection({ report }) {
  if (!report || !report.body) return null;
  const b = report.body;
  const regions = Array.isArray(b.regions) ? b.regions : [];
  const themes = Array.isArray(b.themes) ? b.themes : [];
  return (
    <section className="rp-wrap">
      <div className="rp-badges">
        <span className="rp-flag">🟡 종합 리포트 · 미검증</span>
        <span className="rp-meta">{report.period_label} · {report.source_count}건 종합</span>
      </div>
      <h2 className="rp-title">{report.title}</h2>
      {report.headline && <p className="rp-headline">{report.headline}</p>}

      {regions.length > 0 && (
        <div className="rp-regions">
          {regions.map((r, i) => {
            const tr = r.trend && TREND[r.trend];
            const highlights = Array.isArray(r.highlights) ? r.highlights : [];
            return (
              <div className="rp-region" key={i}>
                <div className="rp-area-row">
                  <span className="rp-area">{r.area}</span>
                  {tr && (
                    <span className="rp-trend" style={{ background: tr.bg, color: tr.fg }}>
                      {tr.ico} {r.trend}
                    </span>
                  )}
                </div>
                {r.note && <p className="rp-note">{r.note}</p>}
                {highlights.length > 0 && (
                  <ul className="rp-hls">
                    {highlights.map((h, j) => <ReportHighlight h={h} key={j} />)}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}

      {themes.length > 0 && (
        <div className="rp-themes">
          <div className="rp-themes-h">가로지르는 이슈</div>
          <ul>{themes.map((t, i) => <li key={i}>{t}</li>)}</ul>
        </div>
      )}

      {b.overall && (
        <div className="rp-overall"><div className="rp-themes-h">종합</div><p>{b.overall}</p></div>
      )}

      <p className="rp-legal">※ 출처: 공개 채팅방·이용자 제보로 수집한 호가 정보. 국토교통부 실거래로 확인되지 않은 미검증 참고용입니다. 면적은 제보에 쓰인 평형(평) 기준입니다.</p>

      <style jsx>{`
        .rp-wrap { margin-top: 34px; background: #fff; border: 1px solid #E1E9F5; border-radius: 20px; padding: 26px 28px; box-shadow: 0 8px 28px rgba(31,63,120,.06); }
        .rp-badges { display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; margin-bottom: 10px; }
        .rp-flag { font-size: 11px; font-weight: 800; padding: 4px 9px; border-radius: 7px; background: #FEF3C7; color: #B45309; }
        .rp-meta { font-size: 12px; color: #94A3B8; font-weight: 700; }
        .rp-title { font-size: 20px; font-weight: 800; color: #12213B; letter-spacing: -.4px; margin: 0 0 8px; }
        .rp-headline { font-size: 14.5px; color: #2F4A73; line-height: 1.6; font-weight: 700; margin: 0 0 18px; }
        .rp-regions { display: flex; flex-direction: column; gap: 14px; margin-bottom: 18px; }
        .rp-region { border: 1px solid #EEF2F8; border-left: 3px solid #2F6BFF; border-radius: 12px; padding: 14px 16px; background: #FBFCFF; }
        .rp-area-row { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; flex-wrap: wrap; }
        .rp-area { font-size: 14px; font-weight: 800; color: #2F6BFF; }
        .rp-trend { font-size: 11px; font-weight: 800; padding: 3px 8px; border-radius: 6px; }
        .rp-note { font-size: 13px; color: #46566E; line-height: 1.62; margin: 0; }
        .rp-hls { list-style: none; margin: 10px 0 0; padding: 10px 0 0; border-top: 1px dashed #E1E9F5; display: flex; flex-direction: column; gap: 6px; }
        .rp-hl { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; font-size: 12.5px; line-height: 1.5; }
        .rp-hl-danji { font-weight: 800; color: #12213B; }
        .rp-hl-area { font-size: 11.5px; font-weight: 700; color: #64748B; background: #EEF2F8; border-radius: 5px; padding: 1px 6px; }
        .rp-hl-price { font-weight: 800; color: #B45309; }
        .rp-hl-note { color: #64748B; }
        .rp-themes, .rp-overall { border-top: 1px solid #EEF2F8; padding-top: 14px; margin-top: 4px; }
        .rp-themes-h { font-size: 12.5px; font-weight: 800; color: #64748B; margin-bottom: 8px; }
        .rp-themes ul { margin: 0; padding-left: 18px; }
        .rp-themes li { font-size: 13px; color: #46566E; line-height: 1.7; }
        .rp-overall p { font-size: 13.5px; color: #26364F; line-height: 1.66; margin: 0; }
        .rp-legal { font-size: 12px; color: #94A3B8; line-height: 1.6; margin: 18px 0 0; }
      `}</style>
    </section>
  );
}

// 수집 호가 정렬용 — pyeong 문자열에서 첫 ㎡ 수치를 뽑아 오름차순.
function m2Key(v) {
  const m = String(v ?? '').match(/\d+(?:\.\d+)?/);
  return m ? parseFloat(m[0]) : Infinity;
}

// 시세 호가들을 단지별로 묶는다 → [{ danji, rows:[...], latest }]. 최근 수집 단지가 위로.
function groupByDanji(items) {
  const map = new Map();
  items.forEach((it) => {
    const key = (it.danji || '단지 미상').trim();
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(it);
  });
  const groups = [];
  for (const [danji, rows] of map.entries()) {
    rows.sort((a, b) => {
      const ak = m2Key(a.pyeong), bk = m2Key(b.pyeong);
      if (ak !== bk) return ak - bk;                       // 평형 오름차순
      return String(b.posted_at || b.gathered_at || '').localeCompare(
        String(a.posted_at || a.gathered_at || ''));       // 같은 평형은 최신 먼저
    });
    const latest = rows.reduce((mx, r) => {
      const d = String(r.posted_at || r.gathered_at || '');
      return d > mx ? d : mx;
    }, '');
    groups.push({ danji, rows, latest });
  }
  groups.sort((a, b) => String(b.latest).localeCompare(String(a.latest)));
  return groups;
}

// CA 엔진 수집정보 — 운영자가 카톡방에서 받아 승인 게시한 참고 정보.
// 🟡 미검증: 국토부 실거래(ONE Score·시세)와 시각적으로 명확히 구분한다.
// 데이터는 getStaticProps(ISR)에서 서버가 받아온다 — 클라이언트 fetch/하이드레이션에
// 의존하지 않으므로, 하이드레이션이 실패해도 이 섹션은 정상 렌더된다.
//
// 구성(사용자 결정 2026-07-26):
//  - '단지별 호가 내역': 호가 있는 시세 제보를 단지로 묶어 평형·호가·수집일 표로.
//  - '시황·정책': 호가 없는 뉴스성 제보(is_news)는 별도 카드로.
function GatheredSection({ items = [], notice = '' }) {
  if (!items.length) return null;

  const news = items.filter((it) => it.is_news ?? !it.price);
  const sise = items.filter((it) => !(it.is_news ?? !it.price));
  const groups = groupByDanji(sise);

  return (
    <section className="gt-wrap">
      <div className="gt-head">
        <h2 className="gt-title">🟡 제보 정보</h2>
        <span className="gt-sub">{items.length}건 · 미검증 · 면적은 평형(평) 기준</span>
      </div>

      {groups.length > 0 && (
        <>
          <div className="gt-subhead">🏢 단지별 호가 내역 <span>{groups.length}개 단지</span></div>
          <div className="gt-grid">
            {groups.map((g) => (
              <div className="gt-danji" key={g.danji}>
                <div className="gt-danji-h">
                  <span className="gt-danji-name">{g.danji}</span>
                  <span className="gt-danji-n">호가 {g.rows.length}건</span>
                </div>
                <div className="gt-rows">
                  {g.rows.map((it) => {
                    const area = it.pyeong ? areaLabel(it.pyeong) : '';
                    const price = it.price_display || it.price;
                    return (
                      <div className="gt-row" key={it.id}>
                        <div className="gt-row-top">
                          <span className="gt-row-area">{area || '면적 미상'}</span>
                          {price && <span className="gt-row-price">{price}</span>}
                        </div>
                        {it.summary && <p className="gt-row-note">{it.summary}</p>}
                        <div className="gt-row-meta">
                          {it.info_type && <span className="gt-tag">{it.info_type}</span>}
                          <span className="gt-when">{String(it.posted_at || it.gathered_at || '').slice(0, 10)} 수집</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="gt-disclaimer">🟡 미검증 호가 · 국토부 실거래로 확인되지 않은 참고용</div>
              </div>
            ))}
          </div>
        </>
      )}

      {news.length > 0 && (
        <>
          <div className="gt-subhead news">📰 시황·정책 소식 <span>{news.length}건</span></div>
          <div className="gt-newsgrid">
            {news.map((it) => (
              <div className="gt-card gt-news" key={it.id}>
                <div className="gt-badges">
                  <span className="gt-flag">🟡 제보 · 미검증</span>
                  {it.info_type && <span className="gt-type">{it.info_type}</span>}
                </div>
                {it.danji && <div className="gt-newshead">{it.danji}</div>}
                {it.summary && <p className="gt-newsbody">{it.summary}</p>}
                <div className="gt-date">{String(it.posted_at || it.gathered_at || '').slice(0, 10)} 수집</div>
              </div>
            ))}
          </div>
        </>
      )}

      {notice && <p className="gt-notice">{notice}</p>}

      <style jsx>{`
        .gt-wrap { margin-top: 34px; }
        .gt-head { display: flex; align-items: baseline; gap: 10px; margin-bottom: 14px; flex-wrap: wrap; }
        .gt-title { font-size: 17px; font-weight: 800; color: #12213B; letter-spacing: -.3px; margin: 0; }
        .gt-sub { font-size: 12px; font-weight: 700; color: #B45309; }
        .gt-subhead { font-size: 13.5px; font-weight: 800; color: #2F4A73; margin: 20px 0 12px; display: flex; align-items: baseline; gap: 8px; }
        .gt-subhead span { font-size: 11.5px; font-weight: 700; color: #94A3B8; }
        .gt-subhead.news { color: #3A5C97; }
        .gt-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; }
        .gt-danji { background: #FFFCF5; border: 1px dashed #F0C879; border-radius: 16px; padding: 16px 18px; }
        .gt-danji-h { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; margin-bottom: 10px; padding-bottom: 10px; border-bottom: 1px solid #F3E6C6; }
        .gt-danji-name { font-size: 16px; font-weight: 800; color: #12213B; letter-spacing: -.3px; }
        .gt-danji-n { font-size: 11.5px; font-weight: 800; color: #B45309; background: #FEF3C7; border-radius: 6px; padding: 2px 8px; white-space: nowrap; }
        .gt-rows { display: flex; flex-direction: column; gap: 10px; }
        .gt-row { border-bottom: 1px solid #F5EDD8; padding-bottom: 10px; }
        .gt-row:last-child { border-bottom: none; padding-bottom: 0; }
        .gt-row-top { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
        .gt-row-area { font-size: 13px; font-weight: 700; color: #46566E; }
        .gt-row-price { font-size: 16px; font-weight: 800; color: #B45309; letter-spacing: -.3px; white-space: nowrap; }
        .gt-row-note { font-size: 12.5px; color: #64748B; line-height: 1.55; margin: 5px 0 0; }
        .gt-row-meta { display: flex; align-items: center; gap: 8px; margin-top: 6px; }
        .gt-tag { font-size: 10.5px; font-weight: 800; padding: 2px 7px; border-radius: 6px; background: #F1F5F9; color: #475569; }
        .gt-when { font-size: 11px; color: #A0AEC0; font-family: 'Space Mono', monospace; }
        .gt-disclaimer { font-size: 10.5px; color: #B45309; margin-top: 12px; padding-top: 10px; border-top: 1px solid #F3E6C6; line-height: 1.5; }
        .gt-newsgrid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; }
        .gt-card { border-radius: 16px; padding: 18px 20px; }
        .gt-badges { display: flex; gap: 6px; margin-bottom: 10px; flex-wrap: wrap; }
        .gt-flag { font-size: 10.5px; font-weight: 800; padding: 4px 8px; border-radius: 7px; background: #FEF3C7; color: #B45309; }
        .gt-type { font-size: 10.5px; font-weight: 800; padding: 4px 8px; border-radius: 7px; background: #F1F5F9; color: #475569; }
        .gt-news { background: #FBFCFF; border: 1px solid #C9D8EF; }
        .gt-newshead { font-size: 13px; font-weight: 800; color: #3A5C97; margin-bottom: 6px; }
        .gt-newsbody { font-size: 14px; color: #26364F; line-height: 1.62; font-weight: 600; margin: 0 0 10px; letter-spacing: -.2px; }
        .gt-date { font-size: 11.5px; color: #94A3B8; font-family: 'Space Mono', monospace; }
        .gt-notice { font-size: 12px; color: #94A3B8; line-height: 1.7; margin-top: 14px; }
        @media (max-width: 640px) { .gt-grid, .gt-newsgrid { grid-template-columns: 1fr; } }
      `}</style>
    </section>
  );
}

export default function RealEstateBoard({ listings, gathered, gatheredNotice, report }) {
  const canonical = `${SITE}/board/realestate`;
  const description = '협력업체가 등록하는 신규 부동산 매물·시세 정보 보드. ONE-HUB 홈에서 새 소식을 먼저 확인하세요.';
  return (
    <>
      <Head>
        <title>부동산 신규 정보 보드 | ONE-HUB</title>
        <meta name="description" content={description} />
        <link rel="canonical" href={canonical} />
        <meta property="og:type" content="website" />
        <meta property="og:title" content="부동산 신규 정보 보드 | ONE-HUB" />
        <meta property="og:description" content={description} />
        <meta property="og:url" content={canonical} />
        <meta property="og:image" content={`${SITE}/api/og-home`} />
        <meta name="twitter:card" content="summary_large_image" />
      </Head>

      <div style={{ minHeight: '100vh', background: '#F4F9FF', fontFamily: 'Pretendard, sans-serif' }}>
        <PageHero
          eyebrow="The Board · 부동산"
          title="🏢 부동산 신규 정보"
          subtitle="ONE-HUB 협력업체가 등록한 신규 매물·시세 소식입니다. 새 정보가 올라오면 이곳에 먼저 게시됩니다."
        />
        <main className="oh-main" style={{ maxWidth: 900 }}>
          <div className="rb-top">
            <span className="rb-count">총 {listings.length}건</span>
            <Link className="rb-add" href="/partners/realestate">협력업체 매물 등록 →</Link>
          </div>

          {listings.length === 0 ? (
            <div className="oh-card" style={{ textAlign: 'center', color: '#64748B', padding: '48px 24px' }}>
              아직 등록된 정보가 없습니다. 협력업체 등록을 통해 첫 매물을 올려주세요.
            </div>
          ) : (
            <div className="rb-grid">
              {listings.map((l) => {
                const dc = DEAL_COLOR[l.deal] || { bg: '#F1F5F9', fg: '#64748B' };
                return (
                  <div className="rb-card" key={l.slug}>
                    <div className="rb-badges">
                      <span className="rb-ptype">{l.ptype}</span>
                      {l.deal && <span className="rb-deal" style={{ background: dc.bg, color: dc.fg }}>{l.deal}</span>}
                      {l.sample && <span className="rb-sample">예시</span>}
                    </div>
                    <div className="rb-title">{l.title}</div>
                    <div className="rb-region">📍 {l.region}</div>
                    <div className="rb-price">{l.price}</div>
                    <div className="rb-meta">
                      {l.area && <span>전용 {l.area}㎡</span>}
                      {l.partner && <span>· {l.partner}</span>}
                    </div>
                    {l.summary && <p className="rb-summary">{l.summary}</p>}
                    <div className="rb-date">{l.date}</div>
                  </div>
                );
              })}
            </div>
          )}

          <ReportSection report={report} />
          <GatheredSection items={gathered} notice={gatheredNotice} />

          <div className="rb-source">
            <b>데이터 출처</b>
            <ul>
              <li><b>실거래가·시세·ONE Score</b> — 국토교통부 실거래가 공개시스템(RTMS) OpenAPI (상업 이용 허가 공공데이터)</li>
              <li><b>제보·수집 정보(🟡)</b> — 협력업체·이용자 제보 및 공개 채팅방에서 수집한 <b>미검증</b> 호가 정보. 국토부 실거래로 확인되지 않았습니다.</li>
            </ul>
          </div>
          <p className="rb-legal">
            ※ 게시 정보는 협력업체·이용자가 제공한 자료이며 ONE-HUB는 정확성을 보증하지 않습니다. 거래 전 현장·서류 확인은 이용자 책임입니다.
            {listings.some((l) => l.sample) && ' 「예시」 표기 항목은 보드 형식 안내용 샘플입니다.'}
          </p>
        </main>
      </div>

      <style jsx>{`
        .rb-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 18px; }
        .rb-count { font-size: 14px; font-weight: 700; color: #475569; }
        .rb-add { font-size: 13px; font-weight: 700; color: #2F6BFF; }
        .rb-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; }
        .rb-card { background: #fff; border: 1px solid #E8EEF7; border-radius: 20px; padding: 22px 22px; box-shadow: 0 8px 28px rgba(31,63,120,.07); }
        .rb-badges { display: flex; gap: 6px; margin-bottom: 12px; flex-wrap: wrap; }
        .rb-ptype { font-size: 11px; font-weight: 800; padding: 4px 9px; border-radius: 7px; background: #F1F5F9; color: #475569; }
        .rb-deal { font-size: 11px; font-weight: 800; padding: 4px 9px; border-radius: 7px; }
        .rb-sample { font-size: 10px; font-weight: 800; padding: 4px 8px; border-radius: 7px; background: #FEF3C7; color: #B45309; }
        .rb-title { font-size: 16.5px; font-weight: 800; color: #12213B; letter-spacing: -.3px; margin-bottom: 6px; }
        .rb-region { font-size: 13px; color: #64748B; margin-bottom: 12px; }
        .rb-price { font-size: 20px; font-weight: 800; color: #2F6BFF; letter-spacing: -.4px; margin-bottom: 6px; }
        .rb-meta { font-size: 12.5px; color: #94A3B8; display: flex; gap: 4px; margin-bottom: 12px; }
        .rb-summary { font-size: 13.5px; color: #475569; line-height: 1.6; margin-bottom: 14px; }
        .rb-date { font-size: 12px; color: #94A3B8; font-family: 'Space Mono', monospace; }
        .rb-source { margin-top: 26px; background: #F1F6FE; border: 1px solid #E1E9F5; border-radius: 12px; padding: 14px 16px; }
        .rb-source > b { font-size: 12.5px; font-weight: 800; color: #2F4A73; }
        .rb-source ul { margin: 8px 0 0; padding-left: 16px; }
        .rb-source li { font-size: 12px; color: #46566E; line-height: 1.65; margin-bottom: 4px; }
        .rb-source li b { color: #12213B; }
        .rb-legal { font-size: 12px; color: #94A3B8; line-height: 1.7; margin-top: 14px; }
        @media (max-width: 640px) { .rb-grid { grid-template-columns: 1fr; } }
      `}</style>
    </>
  );
}

export async function getStaticProps() {
  const dir = path.join(process.cwd(), 'content', 'listings');
  let listings = [];
  try {
    listings = fs.readdirSync(dir)
      .filter((f) => f.endsWith('.md'))
      .map((f) => {
        const { data } = matter(fs.readFileSync(path.join(dir, f), 'utf8'));
        return {
          slug: f.replace(/\.md$/, ''),
          title: data.title || '', region: data.region || '', ptype: data.ptype || '기타',
          deal: data.deal || '', price: data.price || '가격 문의', area: data.area || '',
          partner: data.partner || '', date: data.date || '', summary: data.summary || '',
          sample: !!data.sample, published: data.published !== false,
        };
      })
      .filter((l) => l.published)
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  } catch (e) {
    listings = [];
  }
  // CA 수집정보/리포트 — RE 엔진(:5002)에서 승인 게시분만 가져온다.
  // 실패해도 협력업체 매물 보드는 그대로 떠야 하므로 절대 throw 하지 않는다.
  const base = process.env.RE_API_URL || 'http://54.180.54.132:5002';
  const key = process.env.RE_ACCESS_KEY || '';
  const auth = key ? `?key=${encodeURIComponent(key)}` : '';
  const hdr = { headers: { 'X-API-Key': key } };

  let gathered = [];
  let gatheredNotice = '';
  try {
    const r = await fetch(`${base}/api/board/gathered${auth}`, hdr);
    if (r.ok) {
      const d = await r.json();
      gathered = Array.isArray(d.items) ? d.items : [];
      gatheredNotice = d.notice || '';
    }
  } catch (e) {
    gathered = [];
  }

  let report = null;
  try {
    const r = await fetch(`${base}/api/board/report${auth}`, hdr);
    if (r.ok) {
      const d = await r.json();
      report = d.report || null;
    }
  } catch (e) {
    report = null;
  }

  // ISR: 운영자가 봇에서 [게시]를 누르면 최대 5분 뒤 보드에 반영된다.
  return { props: { listings, gathered, gatheredNotice, report }, revalidate: 300 };
}
