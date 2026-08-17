// [G5] 하단 탭 + FAB — 엄지 도달 영역으로 IA 이동(상단 5탭 = 도달 밖 해소).
//   오늘(액션) · 자산(캐비닛) · 이야기(커뮤니티) · AI(신뢰·기록). 우하단 FAB = 빠른입력.
//   설정(⚙️)은 각 페이지 상단 헤더 버튼으로 이동(하단 탭에서 제거) — 페이지 어디서나 1탭 접근 유지.
//   '자산' 내부 세그먼트(종합·주식·ETF·부동산)는 각 페이지 상단 세그먼트(TopNav)가 담당.
import { useRouter } from "next/router";
import { useState, useEffect } from "react";
import QuickAddSheet from "./shared/QuickAddSheet";

const TABS = [
  ["today", "🎯", "오늘", "/pwa/today"],
  ["assets", "💼", "자산", "/pwa/assets"],
  ["story", "💬", "이야기", "/pwa/story"],
  ["english", "🇬🇧", "영어", "/pwa/english"],
  ["ai", "🛡️", "AI", "/pwa?tab=report"],
];

// [2026-08-09] Claude 비용 절감 step 3 — BottomNav는 사실상 모든 PWA 탭에서 마운트되므로
// "앱이 열려있다"는 신호를 보내기 가장 적당한 지점. 10분 스로틀(localStorage)로 매 탭 이동마다
// 재전송하지 않는다. 실패해도 무시(표시용 스킵 로직일 뿐, 없어도 기능에 영향 없음).
const HEARTBEAT_KEY = "onehub_hb_sent_at";
const HEARTBEAT_THROTTLE_MS = 10 * 60 * 1000;
function pingHeartbeat() {
  try {
    const last = Number(localStorage.getItem(HEARTBEAT_KEY) || 0);
    if (Date.now() - last < HEARTBEAT_THROTTLE_MS) return;
    localStorage.setItem(HEARTBEAT_KEY, String(Date.now()));
  } catch {}
  fetch("/api/pwa-heartbeat", { method: "POST" }).catch(() => {});
}

export default function BottomNav({ active }) {
  const router = useRouter();
  const [qaOpen, setQaOpen] = useState(false);

  useEffect(() => {
    pingHeartbeat();
    const onVisible = () => { if (document.visibilityState === "visible") pingHeartbeat(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

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
