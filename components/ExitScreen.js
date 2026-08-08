// [OS-1] 나가기(로그아웃) 작별 화면 — 1.1초 보여준 뒤 onDone() 호출(실제 로그아웃 이동).
//   PWA는 OS 차원의 "앱 종료" 이벤트를 감지할 공식 hook이 없어(모바일 브라우저 공통 제약),
//   사용자가 명시적으로 누르는 "나가기/로그아웃" 버튼에만 적용한다.
import { useEffect, useState } from "react";

const DURATION = 1100;

export default function ExitScreen({ onDone }) {
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const fadeTimer = setTimeout(() => setFading(true), DURATION - 200);
    const doneTimer = setTimeout(() => { if (typeof onDone === "function") onDone(); }, DURATION);
    return () => { clearTimeout(fadeTimer); clearTimeout(doneTimer); };
  }, [onDone]);

  return (
    <div className={`exit ${fading ? "out" : ""}`} role="status" aria-live="polite">
      <div className="exit-mark">ONE<span className="exit-dot">·</span>HUB</div>
      <div className="exit-tag">다음에 또 만나요</div>
      <style jsx>{`
        .exit {
          position: fixed; inset: 0; z-index: 20000;
          display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px;
          background: linear-gradient(160deg, #0F1B30 0%, #12213B 55%, #0A1424 100%);
          transition: opacity .2s ease;
        }
        .exit.out { opacity: 0; }
        .exit-mark { font-family: var(--font-sans); font-weight: 800; font-size: 28px; letter-spacing: -1px; color: #fff; }
        .exit-dot { color: #2CD48C; }
        .exit-tag { font-family: var(--font-sans); font-size: 12.5px; font-weight: 600; letter-spacing: .3px; color: rgba(255,255,255,.55); }
      `}</style>
    </div>
  );
}
