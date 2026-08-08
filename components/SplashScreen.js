// [OS-1] 앱 구동 스플래시 — PWA 진입 시 1.4초 브랜드 화면. 실제 앱 재실행/새로고침 때만 뜨고
//   (모듈 스코프 플래그로 SPA 내부 이동에서는 재생 안 함), 자동으로 페이드아웃된다.
import { useEffect, useState } from "react";

const DURATION = 1400;
let shown = false; // 진짜 새 로드(리프레시/재실행)에서만 true → 다시 false. SPA 내부 이동엔 안 남.

export default function SplashScreen() {
  const [visible, setVisible] = useState(!shown);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    if (shown) { setVisible(false); return; }
    shown = true;
    const fadeTimer = setTimeout(() => setFading(true), DURATION - 250);
    const hideTimer = setTimeout(() => setVisible(false), DURATION);
    return () => { clearTimeout(fadeTimer); clearTimeout(hideTimer); };
  }, []);

  if (!visible) return null;

  return (
    <div className={`splash ${fading ? "out" : ""}`} aria-hidden="true">
      <div className="splash-mark">
        ONE<span className="splash-dot">·</span>HUB
      </div>
      <div className="splash-tag">AI와 함께 굴리는 자산</div>
      <style jsx>{`
        .splash {
          position: fixed; inset: 0; z-index: 20000;
          display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px;
          background: linear-gradient(160deg, #0F1B30 0%, #12213B 55%, #0A1424 100%);
          transition: opacity .25s ease;
        }
        .splash.out { opacity: 0; }
        .splash-mark { font-family: var(--font-sans); font-weight: 800; font-size: 32px; letter-spacing: -1px; color: #fff; }
        .splash-dot { color: #2CD48C; }
        .splash-tag { font-family: var(--font-sans); font-size: 12.5px; font-weight: 600; letter-spacing: .3px; color: rgba(255,255,255,.55); }
      `}</style>
    </div>
  );
}
