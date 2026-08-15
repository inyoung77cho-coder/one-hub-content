// MY 탭 — 프로필 요약 + 온보딩 재설정 + 자산 최적화(통합자산) 링크
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";

const ALERT_LABELS = {
  flash_deal: "급매 알림 (AI 추정 시세 대비 -5%)",
  gap_target: "Gap 목표 도달 알림",
  new_listing: "관심 단지 신규 거래",
  weekly_report: "주간 리포트 (금 18:00)",
};

export default function My() {
  const router = useRouter();
  const [p, setP] = useState(null);
  const [alerts, setAlerts] = useState(null);
  useEffect(() => {
    try { setP(JSON.parse(localStorage.getItem("onehub_profile") || "null")); } catch {}
    fetch("/api/realestate/v2/alerts?trader=A").then((r) => r.json()).then((d) => setAlerts(d.alerts || [])).catch(() => {});
  }, []);

  const toggle = (a) => {
    const next = !a.is_active;
    setAlerts((list) => list.map((x) => (x.alert_type === a.alert_type ? { ...x, is_active: next } : x)));
    fetch("/api/realestate/v2/alerts", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ alert_type: a.alert_type, is_active: next, threshold: a.threshold }) }).catch(() => {});
  };

  return (
    <div className="m">
      <header className="hd"><Link href="/realestate" className="bk">←</Link><h1>MY</h1></header>
      <div className="card">
        <div className="k">내 설정</div>
        {p ? (
          <div className="prof">
            <div><span>현재 단지</span><b>{p.current_complex || "미설정"}</b></div>
            <div><span>관심 미션</span><b>{(p.mission_types || []).join(", ") || "-"}</b></div>
            <div><span>목표 예산</span><b>{p.budget_uk}억</b></div>
            <div><span>희망 평형</span><b>{p.target_area_m2}㎡</b></div>
            <div><span>관심 지역</span><b>{(p.interest_dongs || []).join(", ") || "-"}</b></div>
          </div>
        ) : <div className="none">아직 온보딩을 하지 않았습니다.</div>}
        <button className="reset" onClick={() => router.push("/realestate/onboarding")}>{p ? "설정 재설정" : "30초 설정 시작"}</button>
      </div>

      {/* 알림 설정 (R-07) */}
      <div className="card">
        <div className="k">알림 설정</div>
        {!alerts && <div className="none">불러오는 중…</div>}
        {alerts?.map((a) => (
          <div className="al" key={a.alert_type}>
            <span className="al-l">{ALERT_LABELS[a.alert_type] || a.alert_type}</span>
            <button className={`sw ${a.is_active ? "on" : ""}`} onClick={() => toggle(a)} aria-label="토글"><span className="knob" /></button>
          </div>
        ))}
        <div className="al-note">알림은 텔레그램으로 발송됩니다.</div>
      </div>

      <Link href="/pwa/assets" className="card link"><span>💼 자산 최적화</span><span className="sub">주식+ETF+부동산 통합 자산</span><span className="ar">→</span></Link>
      <Link href="/pwa/realestate" className="card link"><span>📊 ONE Score 랭킹</span><span className="sub">서현동 단지 종합점수</span><span className="ar">→</span></Link>

      <nav className="tabbar">
        {[["home", "🏠", "홈", "/realestate"], ["mission", "🎯", "미션", "/realestate/missions"], ["search", "🔍", "탐색", "/realestate/mission-c"], ["my", "👤", "MY", "/realestate/my"]].map(([k, i, l, h]) => (
          <button key={k} className={`tab ${k === "my" ? "on" : ""}`} onClick={() => router.push(h)}><span>{i}</span><span className="tl">{l}</span></button>))}
      </nav>
      <style jsx>{`
        .m { max-width: 480px; margin: 0 auto; min-height: 100vh; background: #f7f9fc; padding: 0 14px 80px; font-family: -apple-system, sans-serif; color: #111827; }
        .hd { display: flex; align-items: center; gap: 10px; padding: 14px 2px; } .bk { text-decoration: none; color: #2563eb; font-size: 1.2rem; font-weight: 700; } .hd h1 { font-size: 1.05rem; font-weight: 800; margin: 0; }
        .card { background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px; margin-bottom: 10px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
        .k { font-size: 0.78rem; font-weight: 700; color: #6b7280; margin-bottom: 10px; }
        .prof div { display: flex; justify-content: space-between; padding: 6px 0; font-size: 0.86rem; border-bottom: 1px solid #f1f5f9; } .prof span { color: #6b7280; }
        .none { color: #9ca3af; font-size: 0.85rem; }
        .reset { width: 100%; padding: 11px; border: 1px solid #2563eb; border-radius: 10px; background: #fff; color: #2563eb; font-weight: 700; margin-top: 14px; }
        .link { display: flex; align-items: center; gap: 8px; text-decoration: none; color: #111827; font-size: 0.9rem; } .link > span:first-child { font-weight: 700; } .link .sub { flex: 1; color: #9ca3af; font-size: 0.74rem; } .ar { color: #cbd5e1; }
        .al { display: flex; align-items: center; justify-content: space-between; padding: 9px 0; border-bottom: 1px solid #f1f5f9; }
        .al-l { font-size: 0.86rem; color: #374151; }
        .sw { width: 42px; height: 24px; border-radius: 12px; border: none; background: #e5e7eb; position: relative; transition: background .2s; padding: 0; }
        .sw.on { background: #2563eb; }
        .knob { position: absolute; top: 3px; left: 3px; width: 18px; height: 18px; border-radius: 50%; background: #fff; transition: left .2s; }
        .sw.on .knob { left: 21px; }
        .al-note { font-size: 0.7rem; color: #9ca3af; margin-top: 10px; }
        .tabbar { position: fixed; bottom: 0; left: 0; right: 0; max-width: 480px; margin: 0 auto; display: flex; background: #fff; border-top: 1px solid #e5e7eb; }
        .tab { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 8px 0; background: none; border: none; color: #9ca3af; font-size: 1.2rem; } .tab.on { color: #2563eb; } .tl { font-size: 0.68rem; }
      `}</style>
      <style jsx global>{`body { background: #f7f9fc; margin: 0; }`}</style>
    </div>
  );
}
