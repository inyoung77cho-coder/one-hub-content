// [G3/H1] 트레이더 A/B 계정 스위처 — 헤더에 상시 노출.
//   전 페이지가 같은 계정을 바라보도록 전역 단일 소스(lib/trader useTrader)를 사용한다.
//   기존엔 설정 화면 깊숙이 숨어 있어(피드백 S4/H1) '지금 어느 계정인지'가 불명확했다.
import { useTrader } from "../../lib/trader";

export default function TraderSwitcher() {
  const [trader, choose] = useTrader();
  return (
    <div className="tsw" role="group" aria-label="트레이더 계정 선택">
      <span className="tsw-k" aria-hidden="true">계정</span>
      {["A", "B"].map((t) => (
        <button
          key={t}
          type="button"
          className={`tsw-b ${trader === t ? "on" : ""}`}
          aria-pressed={trader === t}
          aria-label={`트레이더 ${t}${trader === t ? " (선택됨)" : ""}`}
          onClick={() => choose(t)}
        >
          {t}
        </button>
      ))}
      <style jsx>{`
        .tsw { display: inline-flex; align-items: center; gap: 2px; background: var(--color-card-soft, var(--inset-bg)); border-radius: 9px; padding: 2px; box-shadow: var(--shadow-card); }
        .tsw-k { font-size: 9px; font-weight: 700; color: var(--color-ink-3); padding: 0 4px 0 5px; letter-spacing: -.2px; }
        .tsw-b { min-width: 28px; height: 30px; border: none; background: none; border-radius: 7px; font-family: var(--font-sans, inherit); font-size: 13px; font-weight: 800; color: var(--color-ink-3); cursor: pointer; line-height: 1; transition: background .12s, color .12s; }
        .tsw-b.on { background: var(--color-primary); color: #fff; }
      `}</style>
    </div>
  );
}
