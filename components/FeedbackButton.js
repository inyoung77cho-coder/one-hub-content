// components/FeedbackButton.js — NI-6 전 화면 플로팅 피드백 버튼 + 슬라이드업 폼.
// 마찰 최소(카테고리 한 탭 + 한 줄 + 보내기), 맥락 자동(화면명·버전·신원은 서버에서).
import { useEffect, useState } from "react";
import { useRouter } from "next/router";

const CATS = [
  { key: "bug", label: "버그", emoji: "🔴" },
  { key: "inconvenience", label: "불편", emoji: "🟡" },
  { key: "suggestion", label: "제안", emoji: "💡" },
  { key: "praise", label: "칭찬", emoji: "💚" },
];

// 화면명 자동(지인이 "어디였더라" 안 하도록)
const SCREENS = {
  "/pwa": "홈", "/pwa/index": "홈", "/pwa/today": "오늘",
  "/pwa/assets": "자산", "/pwa/portfolio": "포트폴리오", "/pwa/ai-advisor": "AI 자산",
  "/pwa/realestate": "부동산", "/pwa/etf": "ETF", "/pwa/input": "입력",
  "/pwa/settings": "설정", "/pwa/weekly": "주간 리포트", "/pwa/onboarding": "온보딩",
  "/pwa/system-health": "시스템 상태", "/pwa/accuracy": "AI 정확도",
};
function screenName(pathname) {
  if (SCREENS[pathname]) return SCREENS[pathname];
  const seg = (pathname || "").split("/").filter(Boolean);
  return seg.length ? seg[seg.length - 1] : "홈";
}

export default function FeedbackButton({ variant = "float" }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [cat, setCat] = useState("inconvenience");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [ver, setVer] = useState("");

  useEffect(() => {
    // 버전 맥락 자동(선택) — 실패해도 무시
    fetch("/api/version").then((r) => r.json()).then((d) => setVer(d?.version || d?.api_contract || "")).catch(() => {});
  }, []);

  const screen = screenName(router.pathname);

  const submit = async () => {
    if (!msg.trim() || busy) return;
    setBusy(true);
    try {
      const r = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: cat, message: msg.trim(), screen, appVersion: ver }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.ok) { setDone(true); setMsg(""); }
    } finally { setBusy(false); }
  };

  const close = () => { setOpen(false); setTimeout(() => setDone(false), 200); };

  // [OS-2] 헤더 아이콘 버전 — 🔍 검색 버튼과 같은 크기로 상단에 배치(전역 플로팅 버튼 대체, 당분간만 사용).
  const iconStyle = { width: 34, height: 34, borderRadius: "50%", background: "var(--color-card)",
    border: "none", display: "grid", placeItems: "center", fontSize: 15, cursor: "pointer", boxShadow: "var(--shadow-card)" };
  const floatStyle = { position: "fixed", left: 14, bottom: 78, zIndex: 900, width: 46, height: 46, borderRadius: 23,
    border: "none", background: "#4f46e5", color: "#fff", fontSize: 20, boxShadow: "0 4px 14px rgba(79,70,229,0.45)", cursor: "pointer" };

  return (
    <>
      <button aria-label="의견 보내기" title="의견 보내기" onClick={() => setOpen(true)}
        style={variant === "icon" ? iconStyle : floatStyle}>
        💬
      </button>

      {open && (
        <div onClick={close} style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 460, background: "var(--color-surface,#fff)", color: "var(--color-ink,#0f172a)", borderRadius: "16px 16px 0 0", padding: "18px 18px 24px", boxShadow: "0 -8px 30px rgba(0,0,0,0.25)" }}>
            {done ? (
              <div style={{ textAlign: "center", padding: "20px 0" }}>
                <div style={{ fontSize: 40 }}>🙏</div>
                <div style={{ fontWeight: 800, margin: "8px 0 4px" }}>감사합니다!</div>
                <div style={{ fontSize: 13, color: "#64748b" }}>의견을 확인 후 반영하겠습니다.</div>
                <button onClick={close} style={{ marginTop: 16, padding: "10px 22px", borderRadius: 10, border: "none", background: "#4f46e5", color: "#fff", fontWeight: 700, cursor: "pointer" }}>닫기</button>
              </div>
            ) : (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontWeight: 800, fontSize: 15 }}>💬 의견 보내기</div>
                  <button onClick={close} style={{ border: "none", background: "none", fontSize: 20, cursor: "pointer", color: "#94a3b8" }}>✕</button>
                </div>
                <div style={{ fontSize: 12, color: "#64748b", margin: "4px 0 12px" }}>화면: <b>{screen}</b> · 자동 기록</div>

                <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
                  {CATS.map((c) => (
                    <button key={c.key} onClick={() => setCat(c.key)}
                      style={{ flex: 1, padding: "9px 0", borderRadius: 10, border: cat === c.key ? "2px solid #4f46e5" : "1px solid #e2e8f0",
                        background: cat === c.key ? "rgba(79,70,229,0.10)" : "transparent", color: "var(--color-ink,#0f172a)",
                        fontSize: 13, fontWeight: cat === c.key ? 800 : 500, cursor: "pointer" }}>
                      {c.emoji} {c.label}
                    </button>
                  ))}
                </div>

                <textarea value={msg} onChange={(e) => setMsg(e.target.value)} rows={3} maxLength={2000}
                  placeholder={cat === "praise" ? "어떤 점이 좋으셨나요?" : "뭐가 불편하셨나요? 한 줄이면 충분합니다."}
                  style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 14, boxSizing: "border-box", resize: "vertical", fontFamily: "inherit", color: "var(--color-ink,#0f172a)", background: "var(--color-surface,#fff)" }} />

                <button onClick={submit} disabled={busy || !msg.trim()}
                  style={{ width: "100%", marginTop: 12, height: 46, borderRadius: 12, border: "none",
                    background: busy || !msg.trim() ? "#94a3b8" : "#4f46e5", color: "#fff", fontSize: 15, fontWeight: 800, cursor: busy ? "wait" : "pointer" }}>
                  {busy ? "보내는 중…" : "보내기"}
                </button>
                <div style={{ fontSize: 11, color: "#94a3b8", textAlign: "center", marginTop: 8 }}>계정·화면·버전은 자동으로 함께 전송됩니다.</div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
