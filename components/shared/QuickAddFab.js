// [S3] 전역 빠른입력 FAB — 우하단 ＋ 버튼. 어느 페이지에서든 4자산 입력 시트를 연다.
//   서브페이지(ETF/부동산/AI자산)에 마운트. 저장 시 QuickAddSheet가 스토어 기록 + 이벤트 방송.
import { useState } from "react";
import QuickAddSheet from "./QuickAddSheet";

export default function QuickAddFab({ initialAsset = "stock" }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="qa-fab" onClick={() => setOpen(true)} aria-label="빠른 입력">＋</button>
      {open && <QuickAddSheet initialAsset={initialAsset} onClose={() => setOpen(false)} />}
      <style jsx>{`
        .qa-fab {
          position: fixed; right: max(16px, calc(50vw - 240px + 16px)); bottom: calc(env(safe-area-inset-bottom, 0px) + 20px);
          z-index: 150; width: 52px; height: 52px; border-radius: 50%; border: none;
          background: var(--color-primary); color: #fff; font-size: 26px; font-weight: 300; line-height: 1;
          box-shadow: var(--shadow-float); cursor: pointer; display: grid; place-items: center;
          font-family: var(--font-sans);
        }
      `}</style>
    </>
  );
}
