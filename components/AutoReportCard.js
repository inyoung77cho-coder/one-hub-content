// components/AutoReportCard.js
// [FB-2 §2.7] '자동 리포트 요약' — 나열이 아니라 안내(원칙1). 자동 생성 리포트의 한 줄 요약 + 링크.
//   주식 데일리·주식 위클리는 content/*.md frontmatter 의 실제 insight 요약(날조 없음, getStaticProps 주입).
//   부동산·ETF 트렌드는 해당 페이지로 바로가기(부동산 주간 리포트 엔진은 FB-5에서 요약 연결 예정).
import { useEffect, useState } from "react";
import { useRouter } from "next/router";

function trunc(s, n = 46) {
  if (!s) return "";
  const t = String(s).trim();
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
}

export default function AutoReportCard({ reports }) {
  const router = useRouter();
  const daily = reports?.daily || null;
  const weekly = reports?.weekly || null;

  // [FB-5 §5.4] 부동산 주간 리포트 요약(확정+미검증 병기)을 백엔드에서 표면화.
  const [reWeekly, setReWeekly] = useState(null);
  useEffect(() => {
    let alive = true;
    fetch("/api/pwa/re/weekly")
      .then((r) => r.json())
      .then((d) => { if (alive && d && d.ok) setReWeekly(d); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  const reLine = reWeekly
    ? `대장 ${reWeekly.leader || "시범삼성"} ${reWeekly.leader_now != null ? `${reWeekly.leader_now}억 · ` : ""}${String(reWeekly.market_phase || "").replace(/\s*[⚪🔴🟢🟡]\s*$/, "").trim()}${reWeekly.unverified?.count > 0 ? ` · 🟡 미검증 ${reWeekly.unverified.count}건` : ""}`
    : "실거래·호가 주간 동향";

  const rows = [
    {
      key: "daily", ic: "📈", title: "주식 데일리",
      line: daily?.insight ? trunc(daily.insight) : "최신 운영일지 보기",
      meta: daily?.date || null,
      href: "/pwa/daily",
    },
    {
      key: "weekly", ic: "📅", title: "주식 위클리",
      line: weekly?.insight ? trunc(weekly.insight) : "주간 국면·매매 요약 보기",
      meta: weekly?.week || null,
      href: "/pwa/weekly",
    },
    {
      key: "re", ic: "🏠", title: "부동산 트렌드",
      line: reLine,
      meta: reWeekly?.week ? String(reWeekly.week).replace("년 ", "-").replace("월 ", "-").replace("일 주간", "") : null,
      href: "/pwa/realestate",
    },
    {
      key: "etf", ic: "📊", title: "ETF 트렌드",
      line: "국내/해외 배분·시장 변화점",
      meta: null,
      href: "/pwa/etf",
    },
  ];

  return (
    <section className="arc-card">
      <div className="arc-h">🗂 AI 리포트 <span className="arc-sub">일간 · 주간</span></div>
      <div className="arc-list">
        {rows.map((r) => (
          <button className="arc-row" key={r.key} onClick={() => router.push(r.href)}>
            <span className="arc-ic">{r.ic}</span>
            <span className="arc-body">
              <span className="arc-t">{r.title}{r.meta && <span className="arc-meta">{r.meta}</span>}</span>
              <span className="arc-s">{r.line}</span>
            </span>
            <span className="arc-go">→</span>
          </button>
        ))}
      </div>

      <style jsx>{`
        .arc-card { background: var(--color-card); border: 1px solid var(--color-line); border-radius: var(--radius-card, 14px); padding: 16px; margin-bottom: 12px; box-shadow: var(--shadow-card); }
        .arc-h { font-size: 0.92rem; font-weight: 800; color: var(--color-ink); margin-bottom: 12px; display: flex; align-items: baseline; gap: 8px; }
        .arc-sub { font-size: 0.66rem; font-weight: 700; color: var(--color-ink-3); }
        .arc-list { display: flex; flex-direction: column; }
        .arc-row { display: flex; align-items: center; gap: 10px; width: 100%; text-align: left; padding: 10px 2px; background: none; border: none; border-bottom: 1px solid var(--color-line); cursor: pointer; font-family: var(--font-sans); min-height: 46px; }
        .arc-row:last-child { border-bottom: none; }
        .arc-row:active { background: var(--color-card-soft, var(--color-line)); }
        .arc-ic { flex: none; font-size: 16px; width: 22px; text-align: center; }
        .arc-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
        .arc-t { font-size: 0.8rem; font-weight: 800; color: var(--color-ink); display: flex; align-items: baseline; gap: 6px; }
        .arc-meta { font-size: 0.62rem; font-weight: 700; color: var(--color-ink-3); font-variant-numeric: tabular-nums; }
        .arc-s { font-size: 0.73rem; font-weight: 600; color: var(--color-ink-2); word-break: keep-all; line-height: 1.4; overflow: hidden; text-overflow: ellipsis; }
        .arc-go { flex: none; font-size: 0.9rem; font-weight: 800; color: var(--color-primary); }
      `}</style>
    </section>
  );
}
