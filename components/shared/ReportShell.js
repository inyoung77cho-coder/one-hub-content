// [리포트 PWA화] AI 신뢰도 아카이브 상세 리포트 공용 셸.
//   TopNav(신뢰도 탭 활성) + '← AI 신뢰도로' 백링크 + 제목. PWA 톤·디자인 토큰만 사용.
import Link from "next/link";
import TopNav from "../TopNav";

export default function ReportShell({ title, sub, children }) {
  return (
    <div className="rp pwa-shell">
      <TopNav active="trust" />
      <Link href="/pwa?tab=report" className="rp-back">← AI 신뢰도로</Link>
      <div className="rp-head">
        <h1 className="rp-title">{title}</h1>
        {sub && <p className="rp-sub">{sub}</p>}
      </div>
      {children}
      <div className="rp-foot">
        <Link href="/pwa?tab=report" className="rp-foot-link">← AI 신뢰도로 돌아가기</Link>
        <Link href="/pwa?tab=dashboard" className="rp-foot-link">🏠 대시보드</Link>
      </div>
      <style jsx>{`
        .rp { max-width: 480px; margin: 0 auto; padding: 0 14px calc(env(safe-area-inset-bottom, 0px) + 24px); font-family: var(--font-sans); color: var(--color-ink); }
        .rp-back { display: inline-block; font-size: 0.78rem; font-weight: 700; color: var(--color-ink-2); text-decoration: none; margin: 2px 0 10px; }
        .rp-head { margin-bottom: 14px; }
        .rp-title { font-size: 1.15rem; font-weight: 800; letter-spacing: -.3px; margin: 0; }
        .rp-sub { font-size: 0.78rem; color: var(--color-ink-3); margin: 5px 0 0; line-height: 1.5; word-break: keep-all; }
        .rp-foot { display: flex; gap: 10px; margin-top: 20px; }
        .rp-foot-link { flex: 1; text-align: center; background: var(--color-card); border: 1px solid var(--color-line); border-radius: 12px; box-shadow: var(--shadow-card); padding: 13px; font-size: 0.82rem; font-weight: 700; text-decoration: none; color: var(--color-ink); }
      `}</style>
      <style jsx global>{`body { background: var(--color-bg); margin: 0; }`}</style>
    </div>
  );
}
