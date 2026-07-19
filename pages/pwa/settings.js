// 설정 페이지 — 일반 뷰 / 운영자 뷰 분리 (워크오더 v10 §5⑤)
//   일반 사용자: 알림 · 테마 · 계정 · 연동
//   운영자(A/B 토글 소유자): 시스템 상태 · Token · Scheduler · Circuit Breaker · 버전
//   색상은 디자인 토큰(var(--…))만 사용. 다크모드는 <html data-theme> 단일 소스.
import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import BottomNav from "../../components/BottomNav";
import { setTraderGlobal } from "../../lib/trader";
import QuickAddSheet from "../../components/shared/QuickAddSheet";
import { APP_VERSION, BUILD_STAMP } from "../../lib/version";
import { logout } from "../../lib/session";

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
  const [trader, setTrader] = useState("A");
  const [opsView, setOpsView] = useState(false); // 운영자 뷰 표시 여부
  const [editAsset, setEditAsset] = useState(null); // [S3.5] 온보딩 항목별 빠른 편집 시트
  const [traderStat, setTraderStat] = useState({}); // [v11 #18] 트레이더 A/B 엔진 상태 (기존 engine-status 재사용)
  const [ops, setOps] = useState(null);   // [§3-9 #18] /api/ops/traders (매수/차단/에러/채널/자율)
  const [usage, setUsage] = useState(null); // [§3-9 #19] /api/ops/usage (KIS/Claude/서버 비용)
  const [me, setMe] = useState(null); // [NI-5] 로그인 사용자 등급(tier/role) — 운영자 탭 분기·베타 배지
  const [fb, setFb] = useState(null); // [NI-6] 피드백 대시보드(admin 전용)
  const [fbFilter, setFbFilter] = useState("all"); // [NI-6] 카테고리 필터
  const tick = useRef(null);

  // [NI-6] 피드백 목록 로딩(admin만 — 서버가 /api/ops 강제). 상태변경 후 재조회.
  const loadFeedback = useCallback(async () => {
    try {
      const r = await fetch("/api/ops/feedback");
      if (!r.ok) return;
      const d = await r.json();
      if (d && d.ok) setFb(d);
    } catch {}
  }, []);
  const setFbStatus = useCallback(async (id, status) => {
    try {
      await fetch("/api/ops/feedback", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status }) });
      loadFeedback();
    } catch {}
  }, [loadFeedback]);

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
    try { setTrader(localStorage.getItem("onehub_trader") || "A"); } catch {}
    try { setOpsView(localStorage.getItem("onehub_ops_view") === "1"); } catch {}
    loadHealth();
    ["A", "B"].forEach((t) => {
      fetch(`/api/pwa-engine-status?trader=${t}`)
        .then((r) => r.json())
        .then((d) => { if (d && d.ok) setTraderStat((prev) => ({ ...prev, [t]: d })); })
        .catch(() => {});
    });
    // [§3-9 #18] 트레이더 운영 상세(매수/차단/에러/채널/자율) — 미구현 시 graceful null 유지
    fetch("/api/ops/traders")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d && Array.isArray(d.traders)) setOps(d.traders); })
      .catch(() => {});
    // [§3-9 #19] 사용금액·리소스(KIS/Claude/서버 월 비용) — 미구현 시 graceful null 유지
    fetch("/api/ops/usage")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d && d.ok) setUsage(d); })
      .catch(() => {});
    // [NI-5] 로그인 사용자 등급 로딩(운영자 탭 분기·베타 배지)
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => { if (d && d.authenticated) setMe(d); })
      .catch(() => {});
    // [NI-6] 피드백 목록(admin만 로드됨 — 비-admin은 403 무시)
    loadFeedback();
    if (typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window) {
      navigator.serviceWorker.getRegistration().then((reg) =>
        reg?.pushManager.getSubscription().then((s) => setPushOn(!!s))).catch(() => {});
    }
    const onTrader = (e) => setTrader(e?.detail === "B" ? "B" : "A"); // [§3-8] 홈 등에서 전환 시 동기화
    window.addEventListener("onehub-trader-change", onTrader);
    const id = setInterval(loadHealth, 30000);
    return () => { clearInterval(id); window.removeEventListener("onehub-trader-change", onTrader); };
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
    // [v10 UI] <html data-theme> 단일 소스 동기화
    try { window.dispatchEvent(new Event("onehub-theme-change")); } catch {}
  };

  const chooseTrader = (t) => {
    setTrader(t);
    setTraderGlobal(t); // [§3-8] 전 페이지 즉시 반영(브로드캐스트)
  };

  const toggleOps = () => {
    const next = !opsView;
    setOpsView(next);
    try { localStorage.setItem("onehub_ops_view", next ? "1" : "0"); } catch {}
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
          body: JSON.stringify({ trader, endpoint: j.endpoint, keys: j.keys }) });
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
  // 미상은 위험(빨강)이 아니라 중립 회색 (§5③ 시맨틱 원칙)
  const cbColor = cb === "OPEN" ? "var(--color-danger)" : cb === "HALF_OPEN" ? "var(--color-warning)" : cb ? "var(--color-success)" : "var(--color-ink-3)";
  const teleConnected = health?.telegram?.status === "connected";

  // [NI-5] 등급은 서버 세션 기준(프론트 조작 불가 — 운영자 API도 서버에서 admin 검증).
  const isAdmin = me?.user?.role === "admin";
  const showOps = opsView && isAdmin; // 운영자 뷰는 admin만
  // TODO(P3): tier==='free'/'premium' 페이월 분기는 이 등급 위에 얹는다. 지금은 결제·유료 잠금 없음(전원 beta 무료).

  return (
    <div className="m pwa-shell">
      <div className="hd"><h1>⚙️ 설정</h1></div>

      {/* [NI-5-d] 베타 테스터 배지 — 정식 출시 후에도 무료 */}
      {me && !isAdmin && (
        <div style={{ margin: "0 0 12px", padding: "10px 12px", borderRadius: 10, background: "rgba(99,102,241,0.12)", color: "var(--color-ink, #1e293b)", fontSize: "0.78rem", fontWeight: 700, textAlign: "center" }}>
          🧪 베타 테스터 · 정식 출시 후에도 무료로 이용하실 수 있어요
        </div>
      )}

      {/* 뷰 전환 세그먼트 — 일반 / 운영자 (운영자 탭은 admin 전용) */}
      {isAdmin && (
        <div className="seg">
          <button className={!showOps ? "on" : ""} onClick={() => showOps && toggleOps()}>일반</button>
          <button className={showOps ? "on" : ""} onClick={() => !showOps && toggleOps()}>운영자</button>
        </div>
      )}

      {!showOps ? (
        <>
          {/* ── 일반 뷰: 알림 · 테마 · 계정 · 연동 ── */}
          {/* 알림 */}
          <div className="card">
            <div className="k">알림 설정</div>
            <div className="row">
              <span className="l">Web Push 알림</span>
              <button className={`sw ${pushOn ? "on" : ""}`} disabled={pushBusy} onClick={togglePush} aria-label="푸시 토글"><span className="knob" /></button>
            </div>
            {pushMsg && <div className="msg">{pushMsg}</div>}
            <div className="hint">텔레그램 알림·매매신호·리포트를 폰 푸시로 동시 수신합니다.</div>
          </div>

          {/* 테마 */}
          <div className="card">
            <div className="k">테마</div>
            <div className="row">
              <span className="l">{dark ? "다크 모드" : "라이트 모드"}</span>
              <button className="tbtn" onClick={toggleTheme}>{dark ? "☀️ 라이트로" : "🌙 다크로"}</button>
            </div>
          </div>

          {/* 계정 */}
          <div className="card">
            <div className="k">계정</div>
            <div className="row">
              <span className="l">지금 보는 계좌</span>
              <div className="tt">
                <button className={trader === "A" ? "on" : ""} onClick={() => chooseTrader("A")}>A</button>
                <button className={trader === "B" ? "on" : ""} onClick={() => chooseTrader("B")}>B</button>
              </div>
            </div>
            <div className="hint">화면의 모든 자산·주문이 선택한 계좌 기준으로 표시됩니다. B를 선택하면 상단에 표시가 나타납니다.</div>
            <div className="row" style={{ marginTop: 12, borderTop: "1px solid var(--color-line)", paddingTop: 12 }}>
              <span className="l">로그아웃</span>
              <button className="tbtn" onClick={logout}>로그아웃</button>
            </div>
            <div className="hint">로그아웃하면 이 기기에 저장된 내 자산·게임·설정이 함께 지워집니다(공용 기기 보호).</div>
          </div>

          {/* [S3.5] 온보딩 항목별 편집 — 전체 재입력 폐기, 항목마다 독립 수정(동일 빠른입력 폼 재사용) */}
          <div className="card">
            <div className="k">온보딩 · 자산 편집</div>
            <div className="row">
              <span className="l">투자 성향</span>
              <button className="tbtn" onClick={() => router.push("/pwa/onboarding")}>수정</button>
            </div>
            {[["stock", "보유 주식"], ["etf", "보유 ETF"], ["realestate", "부동산"], ["cash", "현금"]].map(([k, l]) => (
              <div className="row" key={k} style={{ marginTop: 8 }}>
                <span className="l">{l}</span>
                <button className="tbtn" onClick={() => setEditAsset(k)}>수정</button>
              </div>
            ))}
            <div className="hint">항목별로 독립 편집합니다. 투자 성향을 바꾸면 목표 비중(AI자산 리밸런싱)이 자동 재파생됩니다.</div>
          </div>

          {/* [H2/X7] 도움말 — 용어사전·온보딩 재실행. 전문용어를 배울 곳이 없던 문제 해소. */}
          <div className="card">
            <div className="k">도움말</div>
            <div className="row">
              <span className="l">용어사전</span>
              <button className="tbtn" onClick={() => router.push("/pwa/glossary")}>열기</button>
            </div>
            <div className="row" style={{ marginTop: 8 }}>
              <span className="l">온보딩 다시 하기</span>
              <button className="tbtn" onClick={() => router.push("/pwa/onboarding")}>시작</button>
            </div>
            <div className="hint">어려운 용어는 용어사전에서 쉬운 말로 확인할 수 있어요. 화면 곳곳의 ⓘ도 같은 설명을 보여줍니다.</div>
            {/* [V1] 빌드 스탬프 — 지금 보는 화면이 최신 배포인지 확인용 */}
            <div className="row" style={{ marginTop: 8 }}>
              <span className="l">버전</span>
              <span className="l" style={{ color: "var(--color-ink-3)", fontVariantNumeric: "tabular-nums" }}>{APP_VERSION} · {BUILD_STAMP}</span>
            </div>
          </div>

          {/* 연동 */}
          <div className="card">
            <div className="k">연동</div>
            <div className="row">
              <span className="l">텔레그램</span>
              <span className="badge" style={{ color: teleConnected ? "var(--color-success)" : "var(--color-ink-3)", borderColor: teleConnected ? "var(--color-success)" : "var(--color-ink-3)" }}>
                {teleConnected ? "연결됨" : "미연결"}
              </span>
            </div>
            <div className="hint">매매신호와 리포트를 텔레그램으로도 받습니다. 승인·주문은 앱에서 하세요.</div>
          </div>
        </>
      ) : (
        <>
          {/* ── 운영자 뷰: 시스템 상태 · Token · Scheduler · Circuit Breaker · 버전 ── */}
          <div className="opsnote">운영자 전용 · 시스템 상태 및 엔진 진단</div>

          {/* [NI-6] 피드백 대시보드 — 지인 의견을 한 곳에서(화면·사람·카테고리·상태) */}
          <div className="card">
            <div className="k">💬 피드백 {fb && <span className="rt">· 총 {fb.total} · 미확인 {fb.unread}</span>}</div>
            {!fb || !Array.isArray(fb.items) ? (
              <div className="hint">불러오는 중…</div>
            ) : fb.items.length === 0 ? (
              <div className="hint">아직 피드백이 없습니다. 지인이 앱 화면의 💬 버튼으로 남기면 여기에 누가·어디서·뭐라고 정리됩니다.</div>
            ) : (
              <>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "6px 0 10px" }}>
                  {[["all", "전체"], ["bug", "🔴버그"], ["inconvenience", "🟡불편"], ["suggestion", "💡제안"], ["praise", "💚칭찬"]].map(([k, l]) => (
                    <button key={k} onClick={() => setFbFilter(k)}
                      style={{ padding: "5px 10px", borderRadius: 14, border: fbFilter === k ? "1.5px solid #4f46e5" : "1px solid var(--color-line,#e2e8f0)", background: fbFilter === k ? "rgba(79,70,229,0.1)" : "transparent", color: "var(--color-ink)", fontSize: "0.72rem", fontWeight: fbFilter === k ? 800 : 500, cursor: "pointer" }}>
                      {l}{k !== "all" && fb.counts[k] ? ` ${fb.counts[k]}` : ""}
                    </button>
                  ))}
                </div>
                {fb.items.filter((x) => fbFilter === "all" || x.category === fbFilter).map((x) => {
                  const em = { bug: "🔴", inconvenience: "🟡", suggestion: "💡", praise: "💚" }[x.category] || "·";
                  const mini = { padding: "4px 10px", borderRadius: 8, border: "1px solid var(--color-line,#e2e8f0)", background: "transparent", color: "var(--color-ink)", fontSize: "0.7rem", fontWeight: 700, cursor: "pointer" };
                  return (
                    <div key={x.id} style={{ borderTop: "1px solid var(--color-line,#eef2f7)", padding: "9px 0" }}>
                      <div style={{ fontSize: "0.72rem", color: "var(--color-ink-3)" }}>
                        {em} <b>{x.nickname}</b> · {x.screen} · {new Date(x.created_at).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                        {x.status !== "new" && <span style={{ marginLeft: 6, color: x.status === "done" ? "#16a34a" : "#2563eb" }}>· {x.status === "done" ? "완료" : "확인"}</span>}
                      </div>
                      <div style={{ fontSize: "0.85rem", margin: "3px 0 6px", color: "var(--color-ink)", whiteSpace: "pre-wrap" }}>{x.message}</div>
                      <div style={{ display: "flex", gap: 6 }}>
                        {x.status === "new" && <button style={mini} onClick={() => setFbStatus(x.id, "reviewed")}>확인</button>}
                        {x.status !== "done" && <button style={mini} onClick={() => setFbStatus(x.id, "done")}>완료</button>}
                        <a style={{ ...mini, textDecoration: "none" }} href={x.url} target="_blank" rel="noreferrer">원문 ↗</a>
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>

          {/* System Health */}
          <div className="card">
            <div className="k">시스템 상태 {health && <span className="rt">· {health.timestamp}</span>}</div>
            {!health && <div className="none">불러오는 중…</div>}
            {health && (
              <>
                <div className="grid">
                  {items.map((it) => (
                    <div className="hi" key={it.k}>
                      <span className="dot" style={{ background: it.ok ? "var(--color-success)" : "var(--color-danger)" }} />
                      <div className="hi-m"><span className="hi-k">{it.k}</span><span className="hi-v">{it.v}</span></div>
                    </div>
                  ))}
                </div>
                <div className="cbrow">
                  <span>Circuit Breaker</span>
                  <span className="cb" style={{ color: cbColor, borderColor: cbColor }}>{cb || "측정 준비 중"}</span>
                </div>
                <Link href="/pwa/system-health" className="detail">상세 로그·이벤트 →</Link>
              </>
            )}
          </div>

          {/* [v11 #18 / §3-9] 트레이더 A/B 관리 — engine-status + /api/ops/traders(있으면) 병합 */}
          <div className="card">
            <div className="k">트레이더 관리 · A / B</div>
            {["A", "B"].map((t) => {
              const st = traderStat[t];
              const tok = (health?.tokens || []).find((x) => x.trader_id === t);
              const op = Array.isArray(ops) ? ops.find((x) => String(x.id).toUpperCase() === t) : null;
              const active = !!(st && st.ok);
              // 채널 연동: ops.channels 우선, 없으면 텔레그램은 시스템 상태로 추정, 카톡은 미연동 기본
              const tg = op?.channels?.tg ?? (teleConnected ? "on" : "off");
              const kakao = op?.channels?.kakao ?? "off";
              const chBadge = (label, state) => {
                const on = state === "on", pending = state === "pending";
                const c = on ? "var(--color-success)" : pending ? "var(--color-warning-ink)" : "var(--color-ink-3)";
                const bg = on ? "var(--color-success-soft)" : pending ? "var(--color-warning-soft)" : "var(--color-card-soft)";
                return (
                  <span key={label} style={{ fontSize: "0.66rem", fontWeight: 700, padding: "2px 8px", borderRadius: 7, background: bg, color: c }}>
                    {label} {on ? "연동" : pending ? "대기" : "미연동"}
                  </span>
                );
              };
              return (
                <div key={t} style={{ padding: "10px 0", borderTop: t === "B" ? "1px solid var(--color-line)" : "none" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontWeight: 800, fontSize: "0.9rem", display: "flex", alignItems: "center" }}>
                      <span className="dot" style={{ width: 8, height: 8, borderRadius: "50%", marginRight: 6, background: active ? "var(--color-success)" : "var(--color-danger)" }} />
                      Trader {t}
                    </span>
                    <span style={{ fontSize: "0.7rem", fontWeight: 700, padding: "2px 9px", borderRadius: 8, background: (op?.autonomous ?? st?.aimode) ? "var(--color-primary-soft)" : "var(--color-card-soft)", color: (op?.autonomous ?? st?.aimode) ? "var(--color-primary)" : "var(--color-ink-3)" }}>
                      자율모드 {(op?.autonomous ?? st?.aimode) ? "ON" : "OFF"}
                    </span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 8, fontSize: "0.74rem", color: "var(--color-ink-2)" }}>
                    <div>엔진 <b style={{ color: "var(--color-ink)" }}>{active ? "가동" : "응답없음"}</b></div>
                    <div>레짐 <b style={{ color: "var(--color-ink)" }}>{st?.regime_current ?? "-"}</b></div>
                    <div>오늘 매수 <b style={{ color: "var(--color-ink)" }}>{op?.buys ?? "-"}건</b></div>
                    <div>오늘 차단 <b style={{ color: "var(--color-ink)" }}>{op?.blocks ?? "-"}건</b></div>
                    <div>에러 <b style={{ color: (op?.errors ?? 0) > 0 ? "var(--color-danger)" : "var(--color-ink)" }}>{op?.errors ?? "-"}건</b></div>
                    <div>토큰 <b style={{ color: "var(--color-ink)", fontFamily: "ui-monospace, monospace" }}>{tok ? mmss(tok.remaining_sec) : "-"}</b></div>
                  </div>
                  <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                    {chBadge("텔레그램", tg)}
                    {chBadge("카카오톡", kakao)}
                  </div>
                  {/* [S7.7] Trader B 카카오 OAuth CTA — 미연동 시 연결 버튼 직접 노출 */}
                  {t === "B" && kakao !== "on" && (
                    <button className="kakao-cta" onClick={() => { window.location.href = "/api/oauth/kakao/start?trader=B"; }}>
                      💬 Trader B 카카오 연결 · 친구 앱 OAuth →
                    </button>
                  )}
                </div>
              );
            })}
            {!ops && <div className="hint">매수/차단/에러 건수는 운영 집계 API(/api/ops/traders) 신설 후 실시간 표기됩니다. 현재는 엔진 가동 상태만 표시합니다.</div>}
          </div>

          {/* [v11 #19 / §3-9] 사용금액 · 리소스 — /api/ops/usage(있으면) + 실측 토큰 */}
          <div className="card">
            <div className="k">💳 사용금액 · 리소스 {usage?.month && <span className="rt">· {usage.month}</span>}</div>
            {usage ? (
              <>
                <div className="usage-total">
                  이번 달 사용금액
                  <b>₩{Number(usage.month_total ?? 0).toLocaleString("ko-KR")}</b>
                </div>
                <div className="ubreak">
                  <div className="ub"><span>KIS</span><b>{usage.kis?.quota_pct != null ? `무료한도 ${usage.kis.quota_pct}%` : "무료한도 내"}</b></div>
                  <div className="ub"><span>Claude API</span><b>₩{Number(usage.claude?.cost ?? 0).toLocaleString("ko-KR")}</b></div>
                  <div className="ub"><span>서버</span><b>₩{Number(usage.server?.cost ?? 0).toLocaleString("ko-KR")}</b></div>
                </div>
                {usage.kis?.calls != null && <div className="hint">KIS 호출 {Number(usage.kis.calls).toLocaleString("ko-KR")}회 · 무료한도 내 운영 중</div>}
              </>
            ) : (
              <>
                <div className="row"><span className="l">서버</span><span style={{ fontWeight: 700 }}>Lightsail · ap-northeast-2</span></div>
                {["A", "B"].map((t) => {
                  const tok = (health?.tokens || []).find((x) => x.trader_id === t);
                  return (
                    <div className="row" style={{ marginTop: 8 }} key={t}>
                      <span className="l">KIS 토큰 {t}</span>
                      <span style={{ fontWeight: 700, fontFamily: "ui-monospace, monospace" }}>{tok ? mmss(tok.remaining_sec) : "-"}</span>
                    </div>
                  );
                })}
                <div className="hint">⚠️ 이번 달 사용금액(KIS 호출량 · Claude API 비용 · 서버 비용)은 아직 계측(호출 카운터/토큰 로깅) API가 없어 표기하지 않습니다. /api/ops/usage 신설 후 자동 표기됩니다.</div>
              </>
            )}
          </div>

          {/* 버전 */}
          <div className="card">
            <div className="k">버전 정보</div>
            <div className="row"><span className="l">APP_VERSION</span><span className="ver">{health?.app_version || "…"}</span></div>
          </div>
        </>
      )}

      <style jsx>{`
        .m { max-width: 480px; margin: 0 auto; min-height: 100vh; background: var(--color-bg); padding: 0 14px calc(env(safe-area-inset-bottom, 0px) + 84px); font-family: var(--font-sans); color: var(--color-ink); }
        .hd { display: flex; align-items: center; gap: 10px; padding: 12px 2px; } .hd h1 { font-size: 1.05rem; font-weight: 800; margin: 0; }
        .seg { display: flex; gap: 3px; background: var(--color-card-soft); border: 1px solid var(--color-line); padding: 3px; border-radius: var(--radius-pill); margin-bottom: 12px; }
        .seg button { flex: 1; padding: 8px 0; border: none; background: none; border-radius: var(--radius-pill); font-family: var(--font-sans); font-size: 0.82rem; font-weight: 700; color: var(--color-ink-2); cursor: pointer; }
        .seg button.on { background: var(--color-card); color: var(--color-primary); box-shadow: var(--shadow-card); }
        .opsnote { font-size: 0.72rem; color: var(--color-ink-3); margin: -2px 2px 10px; }
        .card { background: var(--color-card); border: 1px solid var(--color-line); border-radius: var(--radius-card); padding: 16px; margin-bottom: 10px; box-shadow: var(--shadow-card); }
        .k { font-size: 0.78rem; font-weight: 700; color: var(--color-ink-2); margin-bottom: 12px; } .rt { font-weight: 400; font-size: 0.66rem; }
        .none { color: var(--color-ink-3); font-size: 0.85rem; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .hi { display: flex; align-items: center; gap: 8px; }
        .dot { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; }
        .hi-m { display: flex; flex-direction: column; } .hi-k { font-size: 0.7rem; color: var(--color-ink-2); } .hi-v { font-size: 0.86rem; font-weight: 700; }
        .cbrow { display: flex; align-items: center; justify-content: space-between; margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--color-line); font-size: 0.84rem; }
        .cb { font-size: 0.74rem; font-weight: 800; border: 1px solid; border-radius: 8px; padding: 3px 10px; }
        .detail { display: block; margin-top: 12px; text-align: center; font-size: 0.78rem; color: var(--color-primary); text-decoration: none; font-weight: 700; }
        .row { display: flex; align-items: center; justify-content: space-between; }
        .l { font-size: 0.88rem; } .ver { font-family: ui-monospace, monospace; font-weight: 700; color: var(--color-primary); }
        .hint { font-size: 0.72rem; color: var(--color-ink-3); margin-top: 10px; }
        .msg { font-size: 0.76rem; color: var(--color-success); margin-top: 8px; }
        .badge { font-size: 0.72rem; font-weight: 800; border: 1px solid; border-radius: 8px; padding: 3px 10px; }
        .sw { width: 46px; height: 26px; border-radius: 13px; border: none; background: var(--color-line); position: relative; transition: background .2s; padding: 0; cursor: pointer; }
        .sw.on { background: var(--color-primary); } .sw:disabled { opacity: 0.6; }
        .knob { position: absolute; top: 3px; left: 3px; width: 20px; height: 20px; border-radius: 50%; background: #fff; transition: left .2s; }
        .sw.on .knob { left: 23px; }
        .tbtn { background: none; border: 1px solid var(--color-line); border-radius: 8px; padding: 6px 12px; font-size: 0.82rem; font-weight: 700; cursor: pointer; color: inherit; }
        .tt { display: flex; gap: 3px; background: var(--color-card-soft); padding: 3px; border-radius: var(--radius-pill); }
        .tt button { border: none; background: none; color: var(--color-ink-2); padding: 5px 14px; border-radius: var(--radius-pill); cursor: pointer; font-weight: 700; font-size: 0.8rem; }
        .tt button.on { background: var(--color-primary); color: #fff; }
        .usage-total { display: flex; align-items: baseline; justify-content: space-between; font-size: 0.82rem; color: var(--color-ink-2); font-weight: 700; padding-bottom: 12px; border-bottom: 1px solid var(--color-line); }
        .usage-total b { font-size: 1.3rem; font-weight: 800; color: var(--color-ink); font-family: var(--font-display, var(--font-sans)); }
        .ubreak { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-top: 12px; }
        .ub { display: flex; flex-direction: column; gap: 3px; background: var(--color-card-soft); border-radius: var(--radius-sm); padding: 8px 10px; }
        .ub span { font-size: 0.66rem; color: var(--color-ink-3); font-weight: 700; } .ub b { font-size: 0.82rem; font-weight: 800; color: var(--color-ink); }
        /* [S7.7] 카카오 B 연결 CTA */
        .kakao-cta { width: 100%; margin-top: 10px; border: none; border-radius: 10px; padding: 10px 0; font-size: 0.78rem; font-weight: 800; color: var(--color-ink); background: var(--color-warning); cursor: pointer; font-family: var(--font-sans); }
      `}</style>
      <style jsx global>{`body { background: var(--color-bg); margin: 0; }`}</style>
      {editAsset && <QuickAddSheet initialAsset={editAsset} onClose={() => setEditAsset(null)} />}
      <BottomNav active="settings" />
    </div>
  );
}
