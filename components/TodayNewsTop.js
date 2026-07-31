// components/TodayNewsTop.js
// PWA '오늘' 맨 위 카드 — 오늘의 뉴스 키워드 + 중요 헤드라인 요약(글랜스용).
// - 데이터: /api/today/news (아래 TodayNews 상세 카드와 같은 소스).
// - 중요도·고정 우선으로 상위 헤드라인을 뽑고, 카테고리를 키워드 칩으로.
// - 비어있으면 렌더 안 함. 탭하면 아래 상세 뉴스(#today-news)로 스크롤.
import { useEffect, useState } from "react";

const CAT = {
  global: "글로벌", macro: "거시", markets: "증시",
  realestate: "부동산", policy: "정책", affairs: "시사",
};

export default function TodayNewsTop() {
  const [items, setItems] = useState(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/today/news")
      .then((r) => r.json())
      .then((d) => { if (alive) setItems(Array.isArray(d?.items) ? d.items : []); })
      .catch(() => { if (alive) setItems([]); });
    return () => { alive = false; };
  }, []);

  if (!items || items.length === 0) return null;

  // 고정 > 중요도 > 최신 순으로 상위 헤드라인, 카테고리는 키워드 칩(등장 순서 유지·중복 제거).
  const sorted = [...items].sort(
    (a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (b.importance || 0) - (a.importance || 0)
  );
  const heads = sorted.slice(0, 3);
  const keywords = [];
  items.forEach((it) => { const k = CAT[it.category] || "시사"; if (!keywords.includes(k)) keywords.push(k); });

  const goDetail = () => {
    try { document.getElementById("today-news")?.scrollIntoView({ behavior: "smooth" }); } catch (e) {}
  };

  return (
    <section className="card tnt" onClick={goDetail} role="button" tabIndex={0}>
      <div className="tnt-h">
        <span className="tnt-title">📰 오늘의 뉴스</span>
        <span className="tnt-cnt">{items.length}건</span>
        <span className="tnt-go">전체 보기 ↓</span>
      </div>
      <div className="tnt-kw">
        {keywords.slice(0, 6).map((k, i) => <span className="tnt-chip" key={i}>#{k}</span>)}
      </div>
      <ul className="tnt-heads">
        {heads.map((h) => (
          <li className="tnt-head" key={h.id}>
            <span className="tnt-dot" />
            {h.pinned ? "📌 " : ""}{h.headline}
            {h.importance >= 4 && <span className="tnt-imp">중요</span>}
          </li>
        ))}
      </ul>

      <style jsx>{`
        .tnt { cursor: pointer; background: linear-gradient(135deg, #F7FAFF 0%, #EEF4FF 100%); border: 1px solid #DCE7FA; }
        .tnt-h { display: flex; align-items: baseline; gap: 8px; margin-bottom: 10px; }
        .tnt-title { font-size: 15px; font-weight: 800; color: #12213B; }
        .tnt-cnt { font-size: 11.5px; font-weight: 800; color: #2F6BFF; background: #E4EDFF; border-radius: 6px; padding: 2px 7px; }
        .tnt-go { margin-left: auto; font-size: 12px; font-weight: 800; color: #2F6BFF; }
        .tnt-kw { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
        .tnt-chip { font-size: 11px; font-weight: 700; color: #3A5C97; background: #E7EEFC; border-radius: 6px; padding: 3px 8px; }
        .tnt-heads { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
        .tnt-head { display: flex; align-items: center; gap: 8px; font-size: 13.5px; font-weight: 700; color: #26364F; line-height: 1.4; }
        .tnt-dot { width: 5px; height: 5px; border-radius: 50%; background: #2F6BFF; flex: none; }
        .tnt-imp { font-size: 10px; font-weight: 800; color: #D0342C; background: #FDECEC; border-radius: 5px; padding: 1px 6px; margin-left: 4px; flex: none; }
      `}</style>
    </section>
  );
}
