// components/TodayNews.js
// PWA '오늘'의 뉴스 섹션 — 뉴스 엔진(onehub-news)의 게시 뉴스를 카드로 보여준다.
// - 데이터: 공개 프록시 /api/today/news (클라이언트 fetch).
// - 실패/빈 목록이면 아무것도 렌더하지 않는다(빈 자리·에러 방지) — ReportTeaser 패턴.
// - 운영자가 텔레그램 뉴스봇으로 올린 요약이 여기에 뜬다. 확정 뉴스가 아니라 '운영자 큐레이션'.
import { useEffect, useState } from "react";
import BriefTimestamp from "./BriefTimestamp";
import { parseNewsBody, impactTone, NEWS_SECTIONS } from "../lib/newsFormat";

const CAT = NEWS_SECTIONS;

export default function TodayNews({ items: itemsProp }) {
  const [fetched, setFetched] = useState(null);
  // [뉴스 통합] 부모(오늘 페이지)가 items 를 넘기면 자체 fetch 하지 않는다(중복 요청 방지).
  const items = itemsProp !== undefined ? itemsProp : fetched;

  useEffect(() => {
    if (itemsProp !== undefined) return;
    let alive = true;
    fetch("/api/today/news")
      .then((r) => r.json())
      .then((d) => { if (alive) setFetched(Array.isArray(d?.items) ? d.items : []); })
      .catch(() => { if (alive) setFetched([]); });
    return () => { alive = false; };
  }, [itemsProp]);

  if (!items || items.length === 0) return null;

  // [뉴스 통합] 상단 글랜스 카드(TodayNewsTop)의 등록 시각·키워드를 이 단일 카드로 흡수.
  const latestAt = items.reduce((mx, it) => (it.created_at && (!mx || it.created_at > mx) ? it.created_at : mx), null);
  const keywords = [];
  items.forEach((it) => { const k = (CAT[it.category] || CAT.affairs).ko; if (!keywords.includes(k)) keywords.push(k); });

  return (
    <section className="card tnw" id="today-news">
      <div className="tnw-hh">📰 오늘의 뉴스 <span className="tnw-sub">OneHub 큐레이션</span></div>
      {latestAt && <div className="tnw-reg"><BriefTimestamp at={latestAt} label="등록" /></div>}
      {keywords.length > 0 && (
        <div className="tnw-kw">{keywords.slice(0, 6).map((k, i) => <span className="tnw-chip" key={i}>#{k}</span>)}</div>
      )}
      <div className="tnw-list">
        {items.slice(0, 8).map((it) => {
          const c = CAT[it.category] || CAT.affairs;
          const { bullets: body, impact } = parseNewsBody(it.summary_md);
          const tone = impactTone(impact);
          return (
            <div className="tnw-item" key={it.id}>
              <div className="tnw-top">
                <span className="tnw-cat" style={{ background: c.bg, color: c.fg }}>{c.ko}</span>
                {it.pinned && <span className="tnw-pin">📌</span>}
                <span className="tnw-head">{it.headline}</span>
              </div>
              {body.length > 0 && (
                <ul className="tnw-body">{body.slice(0, 4).map((l, i) => <li key={i}>{l}</li>)}</ul>
              )}
              {tone && (
                <div className="tnw-impact" style={{ background: tone.bg, color: tone.color }}>
                  영향도 {impact} · {tone.label}
                </div>
              )}
              <div className="tnw-meta">
                {it.source_label || "OneHub 제공"}
                {it.external_publication && <span className="tnw-ext"> · 🟡 외부보도 기반</span>}
                <span className="tnw-when"> · {String(it.created_at || "").slice(0, 10)}</span>
              </div>
            </div>
          );
        })}
      </div>
      <p className="tnw-foot">※ OneHub가 큐레이션한 뉴스 요약입니다. 개인정보·원문 전재는 자동 제거되며, 투자자문이 아닙니다.</p>

      <style jsx>{`
        .tnw { }
        .tnw-hh { font-size: 15px; font-weight: 800; color: #12213B; display: flex; align-items: baseline; gap: 8px; margin-bottom: 8px; }
        .tnw-sub { font-size: 11.5px; font-weight: 700; color: #94A3B8; }
        .tnw-reg { margin: -2px 0 8px; }
        .tnw-kw { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; }
        .tnw-chip { font-size: 11px; font-weight: 700; color: #3A5C97; background: #E7EEFC; border-radius: 6px; padding: 3px 8px; }
        .tnw-list { display: flex; flex-direction: column; gap: 12px; }
        .tnw-item { border-bottom: 1px solid #EEF2F8; padding-bottom: 12px; }
        .tnw-item:last-child { border-bottom: none; padding-bottom: 0; }
        .tnw-top { display: flex; align-items: baseline; gap: 6px; flex-wrap: wrap; margin-bottom: 5px; }
        .tnw-cat { font-size: 10.5px; font-weight: 800; padding: 2px 7px; border-radius: 6px; }
        .tnw-pin { font-size: 11px; }
        .tnw-head { font-size: 14.5px; font-weight: 800; color: #12213B; letter-spacing: -.2px; }
        .tnw-body { margin: 4px 0 0; padding-left: 16px; }
        .tnw-body li { font-size: 13px; color: #46566E; line-height: 1.6; }
        .tnw-impact { display: inline-block; font-size: 10.5px; font-weight: 800; padding: 2px 8px; border-radius: 6px; margin-top: 6px; }
        .tnw-meta { font-size: 11.5px; color: #94A3B8; margin-top: 6px; }
        .tnw-ext { color: #B45309; font-weight: 700; }
        .tnw-when { color: #A0AEC0; }
        .tnw-foot { font-size: 11px; color: #94A3B8; line-height: 1.6; margin: 12px 0 0; }
      `}</style>
    </section>
  );
}
