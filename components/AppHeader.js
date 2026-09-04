// [UI 통일] 전 PWA 페이지 공통 상단 헤더 — ONE·HUB 로고 + 🔍(검색) + ⚙️(설정).
//   ＋(빠른입력)은 하단 BottomNav의 FAB가 담당. ⚙️(설정)은 하단 탭에서 빠져 상단 버튼으로 이동(ⓒ).
//   로고=오늘(홈) 이동. 검색=AI 종목 검색(onSearch 있으면 그걸, 없으면 /pwa?tab=analyze 이동).
import { useRouter } from "next/router";
import { useState } from "react";
import dynamic from "next/dynamic";
import TraderBadge from "./shared/TraderBadge";
// [S29-4] 헤더 오른쪽은 🔍 · ⚙️ 둘만. 의견 버튼은 설정 안으로 이동(엄지 안 닿는 자리에서 뺌).
// [S29-5] 🔍 는 페이지 이동이 아니라 맥락 검색 시트를 연다(동적 로드 — 열 때만).
const SearchSheet = dynamic(() => import("./SearchSheet"), { ssr: false });

export default function AppHeader({ onSearch }) {
  const router = useRouter();
  const [searchOpen, setSearchOpen] = useState(false);
  const search = () => {
    if (typeof onSearch === "function") onSearch();
    else setSearchOpen(true);
  };
  return (
    <header className="apphd">
      <button type="button" className="apphd-logo" onClick={() => router.push("/pwa/today")} aria-label="오늘">
        ONE<span className="apphd-dot">·</span>HUB
      </button>
      <div className="apphd-actions">
        <TraderBadge />
        <button type="button" className="apphd-search" onClick={search} aria-label="검색" title="검색">🔍</button>
        <button type="button" className="apphd-search" onClick={() => router.push("/pwa/settings")} aria-label="설정" title="설정">⚙️</button>
      </div>
      {searchOpen && <SearchSheet onClose={() => setSearchOpen(false)} />}
      <style jsx>{`
        .apphd {
          position: sticky; top: 0; z-index: 140;
          max-width: 480px; margin: 0 auto;
          display: flex; align-items: center; justify-content: space-between;
          background: var(--color-bg);
          padding: calc(env(safe-area-inset-top, 0px) + 12px) 2px 10px;
        }
        .apphd-logo {
          font-weight: 800; font-size: 20px; letter-spacing: -.5px;
          color: var(--color-ink); font-family: var(--font-sans);
          background: none; border: none; padding: 0; cursor: pointer;
        }
        .apphd-dot { color: var(--color-success); }
        .apphd-actions { display: flex; align-items: center; gap: 8px; }
        .apphd-search {
          width: 34px; height: 34px; border-radius: 50%; background: var(--color-card);
          border: none; display: grid; place-items: center; font-size: 15px; cursor: pointer;
          box-shadow: var(--shadow-card);
        }
      `}</style>
    </header>
  );
}
