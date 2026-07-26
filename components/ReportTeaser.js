// components/ReportTeaser.js
// PWA 안에서 앱 사용자를 board(부동산 정보 보드)로 유도하는 요약 카드.
// - 최신 게시된 '지역별 동향 리포트'의 핵심(headline)과 지역 몇 개를 미리 보여주고
//   "전체 보기"로 board 로 연결한다.
// - 리포트가 없으면 제보 정보 건수로 유도.
// - 둘 다 없으면 아무것도 렌더하지 않는다(빈 자리 방지).
//
// 데이터는 공개 프록시(/api/board/report, /api/board/gathered)에서 클라이언트 fetch.
// 실패해도 조용히 사라진다 — PWA 본 화면을 절대 방해하지 않는다.

import { useEffect, useState } from 'react';

export default function ReportTeaser() {
  const [report, setReport] = useState(null);
  const [gatheredCount, setGatheredCount] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    Promise.all([
      fetch('/api/board/report').then((r) => r.json()).catch(() => ({})),
      fetch('/api/board/gathered').then((r) => r.json()).catch(() => ({})),
    ]).then(([rep, gat]) => {
      if (!alive) return;
      setReport(rep && rep.report ? rep.report : null);
      setGatheredCount(gat && typeof gat.count === 'number' ? gat.count : 0);
      setReady(true);
    });
    return () => { alive = false; };
  }, []);

  if (!ready) return null;
  if (!report && !gatheredCount) return null;

  const regions = report && report.body && Array.isArray(report.body.regions)
    ? report.body.regions.slice(0, 4) : [];
  // 추세 화살표(리포트가 trend 를 담을 때만; 구 리포트는 생략)
  const TREND_ICO = { '상승': '▲', '하락': '▼', '보합': '', '혼조': '↕', '정보부족': '' };

  return (
    <a className="rt-card" href="/board/realestate">
      <div className="rt-top">
        <span className="rt-flag">🟡 부동산 정보 보드</span>
        <span className="rt-go">전체 보기 →</span>
      </div>

      {report ? (
        <>
          <div className="rt-title">{report.title}</div>
          {report.headline && <p className="rt-headline">{report.headline}</p>}
          {regions.length > 0 && (
            <div className="rt-chips">
              {regions.map((r, i) => (
                <span className={`rt-chip${r.trend === '상승' ? ' up' : r.trend === '하락' ? ' dn' : ''}`} key={i}>
                  {r.area}{TREND_ICO[r.trend] ? ` ${TREND_ICO[r.trend]}` : ''}
                </span>
              ))}
              {report.body.regions.length > regions.length && (
                <span className="rt-chip rt-more">+{report.body.regions.length - regions.length}</span>
              )}
            </div>
          )}
          <div className="rt-meta">
            {report.period_label} · {report.source_count}건 종합 · 🟡 미검증 참고용
          </div>
        </>
      ) : (
        <>
          <div className="rt-title">카톡방 제보 {gatheredCount}건 게시 중</div>
          <p className="rt-headline">단지별 호가·시세 소식을 모아 보여드립니다. 국토부 실거래로 확인되지 않은 참고용입니다.</p>
        </>
      )}

      <style jsx>{`
        .rt-card { display: block; text-decoration: none; background: linear-gradient(135deg,#FFFDF7 0%,#FFF7E8 100%);
          border: 1px solid #F0D89A; border-radius: 18px; padding: 18px 20px; margin: 14px 0;
          box-shadow: 0 6px 20px rgba(180,140,40,.08); transition: transform .12s ease, box-shadow .12s ease; }
        .rt-card:active { transform: scale(.99); }
        .rt-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
        .rt-flag { font-size: 11.5px; font-weight: 800; color: #B45309; }
        .rt-go { font-size: 12.5px; font-weight: 800; color: #2F6BFF; }
        .rt-title { font-size: 16px; font-weight: 800; color: #12213B; letter-spacing: -.3px; margin-bottom: 6px; line-height: 1.4; }
        .rt-headline { font-size: 13px; color: #46566E; line-height: 1.58; margin: 0 0 10px; }
        .rt-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
        .rt-chip { font-size: 11px; font-weight: 700; color: #3A5C97; background: #EAF1FF; border-radius: 6px; padding: 3px 8px; }
        .rt-chip.up { background: #FDECEC; color: #D0342C; }
        .rt-chip.dn { background: #EAF3FF; color: #1D6FE0; }
        .rt-more { background: #F1F5F9; color: #64748B; }
        .rt-meta { font-size: 11.5px; color: #94A3B8; font-weight: 600; }
      `}</style>
    </a>
  );
}
