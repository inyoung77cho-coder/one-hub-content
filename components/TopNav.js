// [v10 UI] 공유 상단 앱셸(AppShell / TopNav) — 시안(onehub-*.html) 통일 헤더+탭.
//   로고 헤더(🔍/⚙️) + 흰 라운드 탭 컨테이너(활성 탭 = 네이비 pill).
//   워크오더 §2·§4.2: 하단 탭 제거, 상단 탭으로 일원화. 색은 디자인 토큰만 사용.
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
    <div className="tn">
      <header className="tn-hd">
        <button type="button" className="tn-logo" onClick={() => router.push("/pwa")} aria-label="홈으로">ONE<span className="tn-dot">·</span>HUB</button>
        <div className="tn-ic">
          <button aria-label="AI 종목 검색" onClick={() => router.push("/pwa?tab=analyze")}>🔍</button>
          <button aria-label="설정" onClick={() => router.push("/pwa/settings")}>⚙️</button>
        </div>
      </header>
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
          background: var(--color-bg);
          padding: calc(env(safe-area-inset-top, 0px) + 8px) 2px 10px;
        }
        .tn-hd { display: flex; align-items: center; justify-content: space-between; padding: 4px 4px 12px; }
        /* [통일] 로고 글자톤 = PWA 본문/제목색(--color-ink)과 동일. 클릭 시 홈 이동 */
        .tn-logo { font-weight: 800; font-size: 20px; letter-spacing: -.5px; color: var(--color-ink); font-family: var(--font-sans); background: none; border: none; padding: 0; cursor: pointer; }
        .tn-dot { color: var(--color-success); }
        .tn-ic { display: flex; gap: 8px; }
        .tn-ic button {
          width: 34px; height: 34px; border-radius: 50%; background: var(--color-card);
          border: none; display: grid; place-items: center; font-size: 15px; cursor: pointer;
          box-shadow: var(--shadow-card);
        }
        .tn-tabs {
          display: flex; gap: 2px; background: var(--color-card); border-radius: 16px;
          padding: 4px; box-shadow: var(--shadow-card);
        }
        .tn-tab {
          flex: 1 1 0; min-width: 0; display: flex; align-items: center; justify-content: center;
          white-space: nowrap; line-height: 1; min-height: 36px;
          font-size: 12.5px; font-weight: 600; letter-spacing: -.4px;
          color: var(--color-ink-3); background: none; border: none; cursor: pointer;
          border-radius: 11px; font-family: var(--font-sans); transition: background .15s, color .15s;
        }
        .tn-tab.on { background: var(--hero-grad-1); color: #fff; font-weight: 700; }
        :global([data-theme="dark"]) .tn-tab.on { background: var(--color-primary); }
        @media (max-width: 380px) { .tn-tab { font-size: 11.5px; letter-spacing: -.5px; } }
      `}</style>
    </div>
  );
}
