// [v11 IA] 공유 하단 네비 — 독립 페이지(ETF/부동산/Portfolio/AI자산/설정)를
//   메인 PWA와 동일한 자산 카테고리로 묶어 "다른 앱 느낌"을 제거한다.
import { useRouter } from "next/router";

const ITEMS = [
  ["home", "홈", "🏠", "/pwa"],
  ["ai", "AI자산", "🤖", "/pwa/ai-advisor"],
  ["stock", "주식", "📈", "/pwa?tab=recommend"],
  ["etf", "ETF", "📊", "/pwa/etf"],
  ["realestate", "부동산", "🏢", "/pwa/realestate"],
  ["settings", "설정", "⚙️", "/pwa/settings"],
];

export default function AssetBottomNav({ active }) {
  const router = useRouter();
  return (
    <nav className="abn">
      {ITEMS.map(([key, label, icon, href]) => (
        <button
          key={key}
          className={`abn-item ${active === key ? "on" : ""}`}
          onClick={() => router.push(href)}
          aria-label={label}
        >
          <span className="abn-ic">{icon}</span>
          <span className="abn-lb">{label}</span>
        </button>
      ))}
      <style jsx>{`
        .abn {
          position: fixed; bottom: 0; left: 0; right: 0; z-index: 100;
          max-width: 480px; margin: 0 auto;
          display: flex; background: rgba(255,255,255,0.96); backdrop-filter: blur(8px);
          border-top: 1px solid #e5e7eb; box-shadow: 0 -1px 8px rgba(0,0,0,0.04);
        }
        .abn-item {
          flex: 1; display: flex; flex-direction: column; align-items: center; gap: 2px;
          padding: 7px 0 9px; background: none; border: none; cursor: pointer;
          color: #9ca3af; font-family: -apple-system, sans-serif;
        }
        .abn-item.on { color: #2563eb; }
        .abn-ic { font-size: 1.15rem; line-height: 1; filter: grayscale(0.4); }
        .abn-item.on .abn-ic { filter: none; }
        .abn-lb { font-size: 0.63rem; font-weight: 700; }
      `}</style>
    </nav>
  );
}
