// [H2] 용어사전 페이지 — data/glossary.json 단일 원천을 렌더(하드코딩 금지).
//   전문용어를 배울 곳이 없던 문제(X7) 해소. 검색 + 전체 목록. Term(ⓘ)과 동일 소스.
import { useState } from "react";
import AppHeader from "../../components/AppHeader";
import GLOSSARY from "../../data/glossary.json";

export default function GlossaryPage() {
  const [q, setQ] = useState("");
  const entries = Object.entries(GLOSSARY).filter(([k]) => k !== "_meta");
  const kw = q.trim().toLowerCase();
  const list = kw
    ? entries.filter(([k, v]) => k.toLowerCase().includes(kw) || String(v).toLowerCase().includes(kw))
    : entries;

  return (
    <div className="gl pwa-shell">
      <AppHeader />
      <div className="gl-hd"><h1>📖 용어사전</h1><span className="gl-sub">{entries.length}개 용어 · 쉬운 말로</span></div>

      <div className="gl-search">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="용어 검색 (예: 관심도, 손익비, 국면)"
          aria-label="용어 검색"
        />
      </div>

      {list.length === 0 ? (
        <div className="gl-empty">‘{q}’에 해당하는 용어가 없어요.</div>
      ) : (
        <div className="gl-list">
          {list.map(([term, desc]) => (
            <div className="gl-item" key={term}>
              <div className="gl-term">{term}</div>
              <div className="gl-desc">{desc}</div>
            </div>
          ))}
        </div>
      )}

      <div className="gl-foot">화면 곳곳의 <b>ⓘ</b>를 누르면 같은 설명이 바로 떠요.</div>

      <style jsx>{`
        .gl { max-width: 480px; margin: 0 auto; padding: 0 14px calc(env(safe-area-inset-bottom, 0px) + 40px); font-family: var(--font-sans); color: var(--color-ink); min-height: 100vh; background: var(--color-bg); }
        .gl-hd { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; margin: 6px 2px 14px; }
        .gl-hd h1 { font-size: var(--fs-7); font-weight: 800; letter-spacing: -.5px; margin: 0; }
        .gl-sub { font-size: var(--fs-2); font-weight: 600; color: var(--color-ink-3); }
        .gl-search { margin-bottom: 14px; }
        .gl-search input { width: 100%; box-sizing: border-box; border: 1px solid var(--color-line); background: var(--color-card); border-radius: var(--radius-md); padding: 12px 14px; font-size: var(--fs-4); font-family: var(--font-sans); color: var(--color-ink); }
        .gl-search input:focus { outline: none; border-color: var(--color-primary); }
        .gl-list { display: flex; flex-direction: column; gap: 10px; }
        .gl-item { background: var(--color-card); border: 1px solid var(--color-line); border-radius: var(--radius-md); padding: 14px 15px; box-shadow: var(--shadow-card); }
        .gl-term { font-size: var(--fs-4); font-weight: 800; color: var(--color-ink); margin-bottom: 5px; }
        .gl-desc { font-size: var(--fs-3); line-height: 1.6; color: var(--color-ink-2); word-break: keep-all; }
        .gl-empty { font-size: var(--fs-4); color: var(--color-ink-2); padding: 24px 4px; text-align: center; }
        .gl-foot { font-size: var(--fs-2); color: var(--color-ink-3); text-align: center; margin-top: 18px; line-height: 1.5; }
        .gl-foot b { color: var(--color-primary); }
      `}</style>
      <style jsx global>{`body { background: var(--color-bg); margin: 0; }`}</style>
    </div>
  );
}
