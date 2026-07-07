// ONE-HUB UX v3.0 — 부동산 Mission 홈 (지역검색 → "오늘 무엇을 하시겠습니까?")
// .js + 인라인/styled-jsx (프로젝트에 Tailwind 없음). 데이터: /api/realestate/v2/home
import { useEffect, useState } from "react";
import { useRouter } from "next/router";

const MISSIONS = [
  { type: "A", icon: "🏠", title: "우리집 갈아타기", desc: "같은 단지 평형 이동 — Gap 추이", href: "/realestate/mission-a" },
  { type: "B", icon: "🏙️", title: "상급지 이동", desc: "더 좋은 단지로 — 가격 격차", href: "/realestate/mission-b" },
  { type: "C", icon: "🧭", title: "새 지역 탐색", desc: "AI 추천 지역 랭킹", href: "/realestate/mission-c" },
  { type: "D", icon: "📊", title: "저평가 단지 찾기", desc: "ONE Score 기반 투자가치", href: "/realestate/mission-d" },
];

function Stars({ n = 3 }) {
  return <span style={{ color: "#f59e0b", letterSpacing: "2px", fontSize: 15 }}>{"★".repeat(n)}{"☆".repeat(5 - n)}</span>;
}

export default function RealestateHome() {
  const router = useRouter();
  const [home, setHome] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try { const s = localStorage.getItem("onehub_profile"); if (s) setProfile(JSON.parse(s)); } catch {}
    fetch("/api/realestate/v2/home").then((r) => r.json())
      .then((d) => { setHome(d); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const primary = profile?.primary_mission || "";
  const ordered = [...MISSIONS.filter((m) => m.type === primary), ...MISSIONS.filter((m) => m.type !== primary)];
  const b = home?.ai_banner;

  return (
    <div className="re-home">
      <header className="hdr">
        <span className="title">부동산</span>
        <span className="region">{home?.default_region || "서현동"} ▾</span>
      </header>

      {/* 오늘의 AI 배너 */}
      <div className="pad">
        {loading ? <div className="card sk" /> : (
          <div className="card banner" onClick={() => b?.complex && router.push(`/realestate/mission-d?complex=${encodeURIComponent(b.complex)}`)}>
            <div className="banner-label">⚡ 오늘의 ONE-HUB AI</div>
            <Stars n={b?.stars ?? 3} />
            <div className="banner-main">{b?.complex ? `${b.complex} — ${b.decision}` : "데이터 준비 중"}</div>
            {b?.one_score != null && <div className="banner-sub">ONE Score {b.one_score}점</div>}
            <span className="banner-arr">→</span>
          </div>
        )}
      </div>

      <div className="pad">
        <h1 className="q">오늘 무엇을 하시겠습니까?</h1>
        {profile?.current_complex && <div className="q-sub">{profile.current_complex} 기준 맞춤 화면</div>}
      </div>

      {/* 미션 카드 */}
      <div className="pad cards">
        {ordered.map((m, i) => (
          <div key={m.type} className={`card mission ${i === 0 && primary ? "hl" : ""}`} onClick={() => router.push(m.href)}>
            <span className="m-icon">{m.icon}</span>
            <div className="m-body"><div className="m-title">{m.title}</div><div className="m-desc">{m.desc}</div></div>
            <span className="m-arr">›</span>
          </div>
        ))}
      </div>

      {/* 온보딩 CTA */}
      {!profile && (
        <div className="pad">
          <button className="cta" onClick={() => router.push("/realestate/onboarding")}>▶ 시작하기 — 30초 개인 설정</button>
        </div>
      )}

      {/* Watchlist */}
      {home?.watchlist_summary?.length > 0 && (
        <div className="pad">
          <div className="wl-label">관심 단지 최근 거래</div>
          {home.watchlist_summary.map((w, i) => (
            <div className="wl-row" key={i}>
              <span>{w.complex}</span>
              <span className="wl-meta">{w.last_deal} · {w.price_man ? `${(w.price_man / 10000).toFixed(1)}억` : "-"}</span>
            </div>
          ))}
        </div>
      )}

      {home?.updated_at && <div className="upd">업데이트: {home.updated_at}</div>}

      {/* 하단 탭 */}
      <nav className="tabbar">
        {[["home", "🏠", "홈", "/realestate"], ["mission", "🎯", "미션", "/realestate/missions"],
          ["search", "🔍", "탐색", "/realestate/mission-c"], ["my", "👤", "MY", "/realestate/my"]].map(([k, ic, la, href]) => (
          <button key={k} className={`tab ${k === "home" ? "on" : ""}`} onClick={() => router.push(href)}>
            <span className="tab-ic">{ic}</span><span className="tab-la">{la}</span>
          </button>
        ))}
      </nav>

      <style jsx>{`
        .re-home { max-width: 480px; margin: 0 auto; min-height: 100vh; background: #f7f9fc; padding-bottom: 80px; font-family: -apple-system, "Segoe UI", sans-serif; color: #111827; }
        .hdr { display: flex; align-items: center; justify-content: space-between; padding: 16px; position: sticky; top: 0; background: #f7f9fc; z-index: 5; }
        .title { font-size: 1.15rem; font-weight: 800; }
        .region { font-size: 0.82rem; color: #6b7280; font-weight: 600; }
        .pad { padding: 0 16px 12px; }
        .card { background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.06); }
        .sk { height: 82px; background: #eceff3; border: none; animation: pulse 1.4s ease-in-out infinite; }
        @keyframes pulse { 50% { opacity: .5; } }
        .banner { position: relative; cursor: pointer; background: linear-gradient(135deg,#f0f9ff,#e0f2fe); border-color: #bae6fd; }
        .banner-label { font-size: 0.72rem; font-weight: 700; color: #2563eb; margin-bottom: 4px; }
        .banner-main { font-size: 0.95rem; font-weight: 800; margin-top: 4px; }
        .banner-sub { font-size: 0.72rem; color: #9ca3af; margin-top: 2px; }
        .banner-arr { position: absolute; right: 16px; top: 16px; color: #2563eb; font-size: 20px; }
        .q { font-size: 1.15rem; font-weight: 800; margin: 4px 0 0; }
        .q-sub { font-size: 0.74rem; color: #9ca3af; margin-top: 2px; }
        .cards { display: flex; flex-direction: column; gap: 10px; }
        .mission { display: flex; align-items: center; gap: 12px; cursor: pointer; }
        .mission.hl { border: 2px solid #2563eb; }
        .m-icon { font-size: 1.6rem; }
        .m-body { flex: 1; }
        .m-title { font-size: 0.92rem; font-weight: 700; }
        .m-desc { font-size: 0.74rem; color: #6b7280; margin-top: 2px; }
        .m-arr { color: #9ca3af; font-size: 18px; }
        .cta { width: 100%; padding: 13px; border: none; border-radius: 12px; background: #2563eb; color: #fff; font-weight: 700; font-size: 0.9rem; }
        .wl-label { font-size: 0.72rem; font-weight: 700; color: #6b7280; margin-bottom: 6px; }
        .wl-row { display: flex; justify-content: space-between; padding: 9px 12px; background: #fff; border-radius: 10px; margin-bottom: 6px; font-size: 0.84rem; }
        .wl-meta { font-size: 0.72rem; color: #9ca3af; }
        .upd { text-align: center; font-size: 0.68rem; color: #9ca3af; margin: 8px 0; }
        .tabbar { position: fixed; bottom: 0; left: 0; right: 0; max-width: 480px; margin: 0 auto; display: flex; background: #fff; border-top: 1px solid #e5e7eb; }
        .tab { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 8px 0; background: none; border: none; color: #9ca3af; }
        .tab.on { color: #2563eb; }
        .tab-ic { font-size: 1.2rem; }
        .tab-la { font-size: 0.68rem; }
      `}</style>
      <style jsx global>{`body { background: #f7f9fc; margin: 0; }`}</style>
    </div>
  );
}
