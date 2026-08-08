// [OS-2] 공유 버튼 — 카카오톡·텔레그램 등 앱 홍보 채널. 별도 SDK/앱키 없이 동작하도록:
//   모바일에선 OS 공유시트(navigator.share)를 띄운다 — 카카오톡이 설치돼 있으면 시트에 자동으로 뜬다.
//   지원 안 하는 환경(주로 데스크톱)에선 텔레그램 공유 링크를 새 창으로 연다.
import { useState } from "react";

export default function ShareButton({ title, text, url, label = "공유", compact = false }) {
  const [toast, setToast] = useState(false);

  const share = async (e) => {
    e?.stopPropagation();
    const shareUrl = url || (typeof window !== "undefined" ? window.location.href : "");
    const shareText = text || title || "";
    if (typeof navigator !== "undefined" && navigator.share) {
      try { await navigator.share({ title, text: shareText, url: shareUrl }); return; } catch { return; } // 사용자 취소 포함 조용히 무시
    }
    try {
      const tgUrl = `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareText)}`;
      window.open(tgUrl, "_blank", "noopener,noreferrer");
    } catch {}
    try {
      await navigator.clipboard?.writeText(shareUrl);
      setToast(true);
      setTimeout(() => setToast(false), 1800);
    } catch {}
  };

  return (
    <span className="shb-wrap">
      <button type="button" className={`shb ${compact ? "compact" : ""}`} onClick={share} aria-label="공유하기">
        🔗 {!compact && label}
      </button>
      {toast && <span className="shb-toast">링크 복사됨</span>}
      <style jsx>{`
        .shb-wrap { position: relative; display: inline-flex; }
        .shb { border: 1px solid var(--color-line); background: var(--color-card); color: var(--color-ink-2); font-size: 11.5px; font-weight: 700; padding: 6px 11px; border-radius: 999px; cursor: pointer; font-family: var(--font-sans); }
        .shb.compact { padding: 6px 8px; font-size: 13px; }
        .shb-toast { position: absolute; top: -30px; right: 0; background: var(--color-ink); color: var(--color-card); font-size: 10.5px; font-weight: 700; padding: 4px 9px; border-radius: 8px; white-space: nowrap; }
      `}</style>
    </span>
  );
}
