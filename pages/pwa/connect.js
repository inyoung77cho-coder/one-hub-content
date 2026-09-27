// [2026-09-27] 증권계좌 연결 — 첫 사용자가 내 자산을 불러오는 3가지 방법을 한 곳에서.
import AppHeader from "../../components/AppHeader";
import BottomNav from "../../components/BottomNav";
import ConnectAccountGuide from "../../components/ConnectAccountGuide";

export default function ConnectPage() {
  return (
    <div className="cn pwa-shell">
      <AppHeader />
      <main className="cn-main">
        <h1 className="cn-title">🔗 증권계좌 연결</h1>
        <ConnectAccountGuide />
      </main>
      <BottomNav active="assets" />
      <style jsx>{`
        .cn { max-width: 480px; margin: 0 auto; padding: 0 14px var(--nav-clearance-fab); font-family: var(--font-sans); color: var(--color-ink); min-height: 100vh; background: var(--color-bg); }
        .cn-main { padding-top: 6px; }
        .cn-title { font-size: var(--fs-5); font-weight: 800; margin: 8px 2px 12px; }
      `}</style>
    </div>
  );
}
