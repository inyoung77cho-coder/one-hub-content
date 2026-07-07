// 미션 탭 — 4개 미션 선택 화면
import { useRouter } from "next/router";
import Link from "next/link";

const M = [
  { icon: "🏠", title: "우리집 갈아타기", desc: "같은 단지 평형 이동 — Gap 추이 분석", href: "/realestate/mission-a" },
  { icon: "🏙️", title: "상급지 이동", desc: "더 좋은 단지로 — 가격 격차 얼마?", href: "/realestate/mission-b" },
  { icon: "🧭", title: "새 지역 탐색", desc: "AI 추천 지역 랭킹", href: "/realestate/mission-c" },
  { icon: "📊", title: "저평가 단지 찾기", desc: "ONE Score 기반 투자 가치 발굴", href: "/realestate/mission-d" },
];

export default function Missions() {
  const router = useRouter();
  return (
    <div className="m">
      <header className="hd"><Link href="/realestate" className="bk">←</Link><h1>미션 선택</h1></header>
      <div className="list">
        {M.map((c) => (
          <div key={c.href} className="card" onClick={() => router.push(c.href)}>
            <span className="ic">{c.icon}</span>
            <div className="bd"><div className="t">{c.title}</div><div className="d">{c.desc}</div></div>
            <span className="ar">›</span>
          </div>
        ))}
      </div>
      <nav className="tabbar">
        {[["home", "🏠", "홈", "/realestate"], ["mission", "🎯", "미션", "/realestate/missions"], ["search", "🔍", "탐색", "/realestate/mission-c"], ["my", "👤", "MY", "/realestate/my"]].map(([k, i, l, h]) => (
          <button key={k} className={`tab ${k === "mission" ? "on" : ""}`} onClick={() => router.push(h)}><span>{i}</span><span className="tl">{l}</span></button>))}
      </nav>
      <style jsx>{`
        .m { max-width: 480px; margin: 0 auto; min-height: 100vh; background: #f7f9fc; padding: 0 14px 80px; font-family: -apple-system, sans-serif; color: #111827; }
        .hd { display: flex; align-items: center; gap: 10px; padding: 14px 2px; } .bk { text-decoration: none; color: #2563eb; font-size: 1.2rem; font-weight: 700; } .hd h1 { font-size: 1.05rem; font-weight: 800; margin: 0; }
        .list { display: flex; flex-direction: column; gap: 10px; }
        .card { display: flex; align-items: center; gap: 12px; background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
        .ic { font-size: 1.6rem; } .bd { flex: 1; } .t { font-weight: 700; font-size: 0.92rem; } .d { font-size: 0.74rem; color: #6b7280; margin-top: 2px; } .ar { color: #9ca3af; }
        .tabbar { position: fixed; bottom: 0; left: 0; right: 0; max-width: 480px; margin: 0 auto; display: flex; background: #fff; border-top: 1px solid #e5e7eb; }
        .tab { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 8px 0; background: none; border: none; color: #9ca3af; font-size: 1.2rem; } .tab.on { color: #2563eb; } .tl { font-size: 0.68rem; }
      `}</style>
      <style jsx global>{`body { background: #f7f9fc; margin: 0; }`}</style>
    </div>
  );
}
