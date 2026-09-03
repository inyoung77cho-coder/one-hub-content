// [S24-4] 홈 화면 추가 유도 — 진짜 앱 느낌의 8할은 standalone 모드다. 방문 3일차에 한 번만.
//   Android/크롬: beforeinstallprompt 를 잡아 네이티브 설치. iOS Safari: 이벤트가 없어 '공유→홈 화면에 추가' 3단계 안내.
//   거절하면 다시 묻지 않는다(onehub_install_dismissed). 이미 standalone 이면 아무것도 안 함.
import { useEffect, useState } from "react";
import { getTrader } from "../lib/trader";
import { getVisitLog } from "../lib/visitLog";

function visitDayCount(tr) {
  try { const o = getVisitLog(tr) || {}; return Object.values(o).filter((r) => r && r.visit).length; } catch { return 0; }
}
function isIos() {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
}
function isStandalone() {
  try { return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true; } catch { return false; }
}

export default function InstallPrompt() {
  const [show, setShow] = useState(false);
  const [ios, setIos] = useState(false);
  const [deferred, setDeferred] = useState(null);

  useEffect(() => {
    if (typeof window === "undefined" || isStandalone()) return;
    let dismissed = false;
    try { dismissed = localStorage.getItem("onehub_install_dismissed") === "1"; } catch (e) {}
    if (dismissed) return;
    if (visitDayCount(getTrader()) < 3) return; // 3일차부터
    const onBIP = (e) => { e.preventDefault(); setDeferred(e); setShow(true); };
    window.addEventListener("beforeinstallprompt", onBIP);
    if (isIos()) { setIos(true); setShow(true); }
    return () => window.removeEventListener("beforeinstallprompt", onBIP);
  }, []);

  const dismiss = () => { setShow(false); try { localStorage.setItem("onehub_install_dismissed", "1"); } catch (e) {} };
  const install = async () => {
    if (deferred) { try { deferred.prompt(); await deferred.userChoice; } catch (e) {} }
    dismiss();
  };

  if (!show) return null;
  return (
    <div className="ipm-wrap" role="dialog" aria-label="홈 화면에 추가">
      <div className="ipm-card">
        <div className="ipm-h">📲 홈 화면에 추가하면 앱처럼 열립니다</div>
        {ios ? (
          <ol className="ipm-steps">
            <li>하단 <b>공유</b> 버튼 <span aria-hidden>􀈂</span> 을 누르고</li>
            <li><b>홈 화면에 추가</b> 를 선택한 뒤</li>
            <li><b>추가</b> 를 누르면 주소창 없이 앱처럼 열립니다.</li>
          </ol>
        ) : (
          <p className="ipm-p">한 번 설치하면 주소창 없이 전체 화면으로, 빠르게 열립니다.</p>
        )}
        <div className="ipm-cta">
          {!ios && <button className="ipm-b p" onClick={install}>홈 화면에 추가</button>}
          <button className="ipm-b" onClick={dismiss}>다음에</button>
        </div>
      </div>
      <style jsx>{`
        .ipm-wrap { position: fixed; left: 0; right: 0; bottom: 0; z-index: 300; display: flex; justify-content: center; padding: 0 12px calc(env(safe-area-inset-bottom, 0px) + 84px); pointer-events: none; }
        .ipm-card { pointer-events: auto; width: 100%; max-width: 440px; background: var(--color-card); border: 1px solid var(--color-line); border-radius: 16px; box-shadow: 0 12px 40px rgba(10,22,44,0.24); padding: 16px; }
        .ipm-h { font-size: 0.9rem; font-weight: 800; color: var(--color-ink); margin-bottom: 8px; }
        .ipm-p { font-size: 0.82rem; color: var(--color-ink-2); line-height: 1.5; margin: 0 0 12px; word-break: keep-all; }
        .ipm-steps { margin: 0 0 12px; padding-left: 18px; font-size: 0.8rem; color: var(--color-ink-2); line-height: 1.7; }
        .ipm-cta { display: flex; gap: 8px; }
        .ipm-b { flex: 1; border: 1px solid var(--color-line); background: var(--color-card); color: var(--color-ink-2); border-radius: 10px; padding: 11px; font-size: 0.82rem; font-weight: 700; font-family: var(--font-sans); cursor: pointer; }
        .ipm-b.p { border-color: var(--color-primary); background: var(--color-primary); color: #fff; }
      `}</style>
    </div>
  );
}
