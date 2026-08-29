// [오늘의 부동산] /pwa(오늘) 페이지용 자체완결 부동산 섹션 — 시황 + 최근 실거래 + 입력 진입.
//   분석 카드(내단지 포지션 등)는 /pwa/realestate 로 분리, 여기선 '오늘' 흐름만.
import { useEffect, useState } from "react";

const uk1 = (n) => (n == null ? "-" : Number(n).toFixed(1));

export default function ReTodaySection({ region = "서현동" }) {
  const [brief, setBrief] = useState(null);
  const [feed, setFeed] = useState(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/pwa/re/briefing?region=${encodeURIComponent(region)}`)
      .then((r) => r.json()).then((d) => { if (alive) setBrief(d); }).catch(() => { if (alive) setBrief({ error: true }); });
    fetch(`/api/pwa/re/feed`)
      .then((r) => r.json()).then((d) => { if (alive) setFeed(Array.isArray(d?.feed) ? d.feed : []); }).catch(() => { if (alive) setFeed([]); });
    return () => { alive = false; };
  }, [region]);

  return (
    <section className="ret-card">
      <div className="ret-hd">
        <span>🏢 오늘의 부동산{brief?.region ? ` · ${brief.region}` : ""}</span>
        <a href="/pwa/realestate" className="ret-more">내 단지 분석 →</a>
      </div>

      {brief && !brief.error ? (
        <div className="ret-brief">
          <span className="ret-phase">{brief.phase}</span>
          {brief.leader && <span className="ret-lead">대장 <b>{brief.leader}</b> {uk1(brief.leader_84 != null ? brief.leader_84 : brief.leader_price)}억</span>}
          <span className="ret-chg">분기 {brief.chg_q >= 0 ? "+" : ""}{brief.chg_q}% · 연 {brief.chg_yr >= 0 ? "+" : ""}{brief.chg_yr}%</span>
        </div>
      ) : (
        <div className="ret-empty">{brief?.error ? "시황을 불러오지 못했습니다" : "시황 불러오는 중…"}</div>
      )}

      {feed && feed.length > 0 && (
        <div className="ret-feed">
          <div className="ret-feed-h">📈 최근 실거래 <span>동일 단지·평형 직전 대비</span></div>
          {feed.slice(0, 6).map((f, i) => (
            <div className="ret-frow" key={`${f.단지명}-${f.거래일}-${i}`}>
              <span className="ret-fname">{f.단지명}</span>
              <span className="ret-fmeta">{f.전용면적}㎡ · {f.거래일?.slice(5)}</span>
              <span className="ret-fprice">{f.거래금액_억}억{f.변동률 != null && (
                <em className={f.변동률 > 0 ? "up" : f.변동률 < 0 ? "dn" : ""}> {f.변동률 > 0 ? "▲" : f.변동률 < 0 ? "▼" : "−"}{Math.abs(f.변동률)}%</em>
              )}</span>
            </div>
          ))}
        </div>
      )}

      <a href="/pwa/input" className="ret-input">＋ 부동산 매매 입력</a>

      <style jsx>{`
        .ret-card { background: var(--color-card); border: 1px solid var(--color-line); border-radius: 16px; padding: 15px 15px 14px; box-shadow: var(--shadow-card); margin-bottom: 12px; }
        .ret-hd { display: flex; align-items: center; gap: 8px; font-size: 0.92rem; font-weight: 800; color: var(--color-ink); }
        .ret-more { margin-left: auto; font-size: 0.72rem; font-weight: 700; color: var(--color-primary); text-decoration: none; }
        .ret-brief { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 10px; }
        .ret-phase { font-size: 0.8rem; font-weight: 800; color: #fff; background: var(--color-primary); border-radius: 999px; padding: 3px 10px; }
        .ret-lead { font-size: 0.78rem; color: var(--color-ink-2); }
        .ret-lead b { color: var(--color-ink); font-weight: 800; }
        .ret-chg { font-size: 0.74rem; color: var(--color-ink-3); font-variant-numeric: tabular-nums; }
        .ret-empty { margin-top: 10px; font-size: 0.78rem; color: var(--color-ink-3); }
        .ret-feed { margin-top: 12px; border-top: 1px solid var(--color-line); padding-top: 10px; }
        .ret-feed-h { font-size: 0.74rem; font-weight: 800; color: var(--color-ink-2); margin-bottom: 6px; }
        .ret-feed-h span { font-weight: 500; color: var(--color-ink-3); font-size: 0.66rem; margin-left: 5px; }
        .ret-frow { display: flex; align-items: center; gap: 8px; padding: 5px 0; font-size: 0.76rem; }
        .ret-fname { font-weight: 700; color: var(--color-ink); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .ret-fmeta { color: var(--color-ink-3); font-size: 0.68rem; white-space: nowrap; }
        .ret-fprice { margin-left: auto; font-weight: 800; color: var(--color-ink); white-space: nowrap; font-variant-numeric: tabular-nums; }
        .ret-fprice em { font-style: normal; font-size: 0.7rem; font-weight: 700; }
        .ret-fprice em.up { color: var(--color-danger); } .ret-fprice em.dn { color: var(--color-primary); }
        .ret-input { display: block; text-align: center; margin-top: 12px; padding: 10px; border-radius: 11px; border: 1px solid var(--color-line); background: var(--color-card-soft); color: var(--color-primary); font-size: 0.8rem; font-weight: 800; text-decoration: none; }
      `}</style>
    </section>
  );
}
