// [G5] 하단 4탭 + FAB — 엄지 도달 영역으로 IA 이동(상단 5탭 = 도달 밖 해소).
//   오늘(액션) · 자산(캐비닛) · AI(신뢰·기록) · 설정. 우하단 FAB = 빠른입력.
//   '자산' 내부 세그먼트(종합·주식·ETF·부동산)는 각 페이지 상단 세그먼트(TopNav)가 담당.
import { useRouter } from "next/router";
import { useState } from "react";
import QuickAddSheet from "./shared/QuickAddSheet";

const TABS = [
  ["today", "🎯", "오늘", "/pwa/today"],
  ["assets", "💼", "자산", "/pwa?tab=dashboard"],
  ["ai", "🛡️", "AI", "/pwa?tab=report"],
  ["settings", "⚙️", "설정", "/pwa/settings"],
];

export default function BottomNav({ active }) {
  const router = useRouter();
  const [qaOpen, setQaOpen] = useState(false);
  return (
    <>
      <button className="bn-fab" onClick={() => setQaOpen(true)} aria-label="자산 빠른입력" title="자산 빠른입력">＋</button>
      {qaOpen && <QuickAddSheet initialAsset="stock" onClose={() => setQaOpen(false)} />}
      <nav className="bn" aria-label="주요 메뉴">
        {TABS.map(([key, ic, label, href]) => (
          <button
            key={key}
            type="button"
            className={`bn-t ${active === key ? "on" : ""}`}
            aria-current={active === key ? "page" : undefined}
            onClick={() => router.push(href)}
          >
            <span className="bn-ic" aria-hidden="true">{ic}</span>
            <span className="bn-l">{label}</span>
          </button>
        ))}
      </nav>
      <style jsx>{`
        .bn {
          position: fixed; left: 50%; bottom: 0; transform: translateX(-50%);
          width: 100%; max-width: 480px; z-index: 150;
          display: flex; align-items: stretch;
          background: var(--color-card); border-top: 1px solid var(--color-line);
          padding-bottom: env(safe-area-inset-bottom, 0px);
          box-shadow: 0 -4px 20px rgba(0,0,0,.06);
        }
        .bn-t {
          flex: 1 1 0; min-width: 0; min-height: 56px;
          display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px;
          border: none; background: none; cursor: pointer; padding: 8px 2px;
          font-family: var(--font-sans, inherit); color: var(--color-ink-3);
        }
        .bn-ic { font-size: 20px; line-height: 1; }
        .bn-l { font-size: 10.5px; font-weight: 700; letter-spacing: -.3px; }
        .bn-t.on { color: var(--color-primary); }
        .bn-fab {
          position: fixed; right: calc(50% - 240px + 16px); bottom: calc(env(safe-area-inset-bottom, 0px) + 68px);
          z-index: 151; width: 52px; height: 52px; border-radius: 50%;
          border: none; background: var(--color-primary); color: #fff;
          font-size: 26px; font-weight: 300; line-height: 1; cursor: pointer;
          box-shadow: var(--shadow-float, 0 8px 24px rgba(0,0,0,.2));
        }
        @media (max-width: 480px) { .bn-fab { right: 16px; } }
      `}</style>
    </>
  );
}
