// 설정 페이지 — System Health(운영 상태) + 알림 + 테마 + 버전 (workorder v10 §4)
import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/router";
import Link from "next/link";

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = typeof window !== "undefined" ? window.atob(base64) : "";
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

const mmss = (s) => {
  if (s == null || s < 0) return "-";
  const m = Math.floor(s / 60), sec = s % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
};

export default function Settings() {
  const router = useRouter();
  const [health, setHealth] = useState(null);
  const [tokenSec, setTokenSec] = useState(null);
  const [theme, setTheme] = useState("light");
  const [pushOn, setPushOn] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushMsg, setPushMsg] = useState("");
  const tick = useRef(null);

  const loadHealth = useCallback(async () => {
    try {
      const r = await fetch("/api/health/status");
      const d = await r.json();
      if (d.services) {
        setHealth(d);
        const t = (d.tokens || []).find((x) => x.trader_id === "A");
        if (t) setTokenSec(t.remaining_sec);
      }
    } catch {}
  }, []);

  useEffect(() => {
    try { setTheme(localStorage.getItem("onehub_theme") || "light"); } catch {}
    loadHealth();
    if (typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window) {
      navigator.serviceWorker.getRegistration().then((reg) =>
        reg?.pushManager.getSubscription().then((s) => setPushOn(!!s))).catch(() => {});
    }
    const id = setInterval(loadHealth, 30000);
    return () => clearInterval(id);
  }, [loadHealth]);

  // 토큰 남은시간 1초 카운트다운
  useEffect(() => {
    if (tokenSec == null) return;
    tick.current = setInterval(() => setTokenSec((s) => (s == null ? s : Math.max(0, s - 1))), 1000);
    return () => clearInterval(tick.current);
  }, [tokenSec == null]);

  const toggleTheme = () => {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    try { localStorage.setItem("onehub_theme", next); } catch {}
  };

  const togglePush = async () => {
    setPushBusy(true); setPushMsg("");
    try {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) throw new Error("이 브라우저는 푸시를 지원하지 않습니다.");
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      if (pushOn && existing) {
        await fetch("/api/push-unsubscribe", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: existing.endpoint }) }).catch(() => {});
        await existing.unsubscribe();
        setPushOn(false); setPushMsg("알림을 껐습니다.");
      } else {
        const perm = await Notification.requestPermission();
        if (perm !== "granted") throw new Error("알림 권한이 거부되었습니다.");
        const keyRes = await fetch("/api/push-vapid-key");
        const keyData = await keyRes.json();
        if (!keyData.ok || !keyData.key) throw new Error("VAPID 키 조회 실패");
        const sub = existing || await reg.pushManager.subscribe({
          userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(keyData.key) });
        const j = sub.toJSON();
        const res = await fetch("/api/push-subscribe", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ trader: "A", endpoint: j.endpoint, keys: j.keys }) });
        const d = await res.json();
        if (!d.ok) throw new Error(d.error || "구독 등록 실패");
        setPushOn(true); setPushMsg("알림을 켰습니다.");
      }
    } catch (e) { setPushMsg(String(e.message || e)); }
    finally { setPushBusy(false); }
  };

  const dark = theme === "dark";
  const svcOk = (s) => s === "active";
  const items = health ? [
    { k: "KIS", ok: (health.kis?.A?.ok) === true, v: health.kis?.A?.ok ? "연결됨" : "오류" },
    { k: "Token", ok: (tokenSec ?? 0) > 0, v: mmss(tokenSec) },
    { k: "Scheduler", ok: health.scheduler?.status === "running", v: health.scheduler?.status || "-" },
    { k: "DB", ok: health.database?.status === "ok", v: health.database?.status || "-" },
    { k: "Telegram", ok: health.telegram?.status === "connected", v: health.telegram?.status || "-" },
    { k: "AI Engine", ok: svcOk(health.services?.["onehub.service"]), v: svcOk(health.services?.["onehub.service"]) ? "running" : "stopped" },
  ] : [];
  const cb = health?.circuit_state;
  const cbColor = cb === "OPEN" ? "#dc2626" : cb === "HALF_OPEN" ? "#d97706" : "#16a34a";

  return (
    <div className={`m ${dark ? "dk" : ""}`}>
      <header className="hd">
        <Link href="/pwa" className="bk">←</Link>
        <h1>⚙️ 설정</h1>
      </header>

      {/* 1. System Health */}
      <div className="card">
        <div className="k">시스템 상태 {health && <span className="rt">· {health.timestamp}</span>}</div>
        {!health && <div className="none">불러오는 중…</div>}
        {health && (
          <>
            <div className="grid">
              {items.map((it) => (
                <div className="hi" key={it.k}>
                  <span className="dot" style={{ background: it.ok ? "#16a34a" : "#dc2626" }} />
                  <div className="hi-m"><span className="hi-k">{it.k}</span><span className="hi-v">{it.v}</span></div>
                </div>
              ))}
            </div>
            <div className="cbrow">
              <span>Circuit Breaker</span>
              <span className="cb" style={{ color: cbColor, borderColor: cbColor }}>{cb || "-"}</span>
            </div>
            <Link href="/pwa/system-health" className="detail">상세 로그·이벤트 →</Link>
          </>
        )}
      </div>

      {/* 2. 알림 설정 */}
      <div className="card">
        <div className="k">알림 설정</div>
        <div className="row">
          <span className="l">Web Push 알림</span>
          <button className={`sw ${pushOn ? "on" : ""}`} disabled={pushBusy} onClick={togglePush} aria-label="푸시 토글"><span className="knob" /></button>
        </div>
        {pushMsg && <div className="msg">{pushMsg}</div>}
        <div className="hint">텔레그램 알림·매매신호·리포트를 폰 푸시로 동시 수신합니다.</div>
      </div>

      {/* 3. 테마 */}
      <div className="card">
        <div className="k">테마</div>
        <div className="row">
          <span className="l">{dark ? "다크 모드" : "라이트 모드"}</span>
          <button className="tbtn" onClick={toggleTheme}>{dark ? "☀️ 라이트로" : "🌙 다크로"}</button>
        </div>
      </div>

      {/* 4. 버전 */}
      <div className="card">
        <div className="k">버전 정보</div>
        <div className="row"><span className="l">APP_VERSION</span><span className="ver">{health?.app_version || "…"}</span></div>
      </div>

      <style jsx>{`
        .m { max-width: 480px; margin: 0 auto; min-height: 100vh; background: #f7f9fc; padding: 0 14px 40px; font-family: -apple-system, sans-serif; color: #111827; }
        .m.dk { background: #0b0e14; color: #e5e7eb; }
        .hd { display: flex; align-items: center; gap: 10px; padding: 14px 2px; } .bk { text-decoration: none; color: #2563eb; font-size: 1.2rem; font-weight: 700; } .hd h1 { font-size: 1.05rem; font-weight: 800; margin: 0; }
        .card { background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px; margin-bottom: 10px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
        .dk .card { background: #131722; border-color: #232838; box-shadow: none; }
        .k { font-size: 0.78rem; font-weight: 700; color: #6b7280; margin-bottom: 12px; } .dk .k { color: #9aa4b2; } .rt { font-weight: 400; font-size: 0.66rem; }
        .none { color: #9ca3af; font-size: 0.85rem; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .hi { display: flex; align-items: center; gap: 8px; }
        .dot { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; }
        .hi-m { display: flex; flex-direction: column; } .hi-k { font-size: 0.7rem; color: #6b7280; } .dk .hi-k { color: #9aa4b2; } .hi-v { font-size: 0.86rem; font-weight: 700; }
        .cbrow { display: flex; align-items: center; justify-content: space-between; margin-top: 14px; padding-top: 12px; border-top: 1px solid #f1f5f9; font-size: 0.84rem; } .dk .cbrow { border-color: #232838; }
        .cb { font-size: 0.74rem; font-weight: 800; border: 1px solid; border-radius: 8px; padding: 3px 10px; }
        .detail { display: block; margin-top: 12px; text-align: center; font-size: 0.78rem; color: #2563eb; text-decoration: none; font-weight: 700; }
        .row { display: flex; align-items: center; justify-content: space-between; }
        .l { font-size: 0.88rem; } .ver { font-family: ui-monospace, monospace; font-weight: 700; color: #2563eb; }
        .hint { font-size: 0.72rem; color: #9ca3af; margin-top: 10px; }
        .msg { font-size: 0.76rem; color: #16a34a; margin-top: 8px; }
        .sw { width: 46px; height: 26px; border-radius: 13px; border: none; background: #e5e7eb; position: relative; transition: background .2s; padding: 0; cursor: pointer; }
        .sw.on { background: #2563eb; } .sw:disabled { opacity: 0.6; }
        .knob { position: absolute; top: 3px; left: 3px; width: 20px; height: 20px; border-radius: 50%; background: #fff; transition: left .2s; }
        .sw.on .knob { left: 23px; }
        .tbtn { background: none; border: 1px solid #d1d5db; border-radius: 8px; padding: 6px 12px; font-size: 0.82rem; font-weight: 700; cursor: pointer; color: inherit; }
        .dk .tbtn { border-color: #3a4152; }
      `}</style>
      <style jsx global>{`body { margin: 0; }`}</style>
    </div>
  );
}
