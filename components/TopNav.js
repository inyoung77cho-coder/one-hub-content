// [v10 UI] 공유 상단 탭 내비 (AppShell / TopNav)
//   워크오더 §2·§4.2: 하단 탭바를 제거하고 전 페이지를 상단 탭 내비로 일원화한다.
//   홈 · AI자산 · 주식 · ETF · 부동산 · 설정. 색상은 디자인 토큰(var(--…))만 사용.
import { useRouter } from "next/router";

const ITEMS = [
  ["home", "홈", "/pwa"],
  ["ai", "AI자산", "/pwa/ai-advisor"],
  ["stock", "주식", "/pwa?tab=recommend"],
  ["etf", "ETF", "/pwa/etf"],
  ["realestate", "부동산", "/pwa/realestate"],
  ["settings", "설정", "/pwa/settings"],
];

export default function TopNav({ active }) {
  const router = useRouter();
  return (
    <header className="tn">
      <div className="tn-brand">
        <span className="tn-dot" />
        <span className="tn-title">ONE-HUB</span>
      </div>
      <nav className="tn-tabs" aria-label="주요 자산 카테고리">
        {ITEMS.map(([key, label, href]) => (
          <button
            key={key}
            className={`tn-tab ${active === key ? "on" : ""}`}
            onClick={() => router.push(href)}
            aria-current={active === key ? "page" : undefined}
          >
            {label}
          </button>
        ))}
      </nav>
      <style jsx>{`
        .tn {
          position: sticky; top: 0; z-index: 100;
          max-width: 480px; margin: 0 auto;
          background: var(--color-bg); /* fallback */
          background: color-mix(in srgb, var(--color-bg) 88%, transparent);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          border-bottom: 1px solid var(--color-line);
          padding: calc(env(safe-area-inset-top, 0px) + 10px) 12px 0;
        }
        .tn-brand { display: flex; align-items: center; gap: 7px; padding: 0 2px 8px; }
        .tn-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--color-success); flex-shrink: 0; }
        .tn-title { font-family: var(--font-sans); font-size: 1rem; font-weight: 800; letter-spacing: 0.04em; color: var(--color-ink); }
        .tn-tabs { display: flex; gap: 2px; overflow-x: auto; scrollbar-width: none; }
        .tn-tabs::-webkit-scrollbar { display: none; }
        .tn-tab {
          flex: 1 0 auto; white-space: nowrap;
          padding: 9px 12px; background: none; border: none; cursor: pointer;
          color: var(--color-ink-3); font-family: var(--font-sans);
          font-size: 0.82rem; font-weight: 700;
          border-bottom: 2px solid transparent; transition: color .15s, border-color .15s;
        }
        .tn-tab.on { color: var(--color-primary); border-bottom-color: var(--color-primary); }
      `}</style>
    </header>
  );
}
