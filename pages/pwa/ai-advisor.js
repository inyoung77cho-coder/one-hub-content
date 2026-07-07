// AI Advisor — 자산운영 AI 브레인 탭 (통합 자산 기반 종합 판단/리밸런싱)
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import AssetBottomNav from "../../components/AssetBottomNav";

const api = (fn) => `/api/realestate/v2/${fn}?trader_id=A`;
const Stars = ({ n }) => <span className="st">{"★".repeat(n)}{"☆".repeat(5 - n)}</span>;

export default function AIAdvisor() {
  const router = useRouter();
  const [advisor, setAdvisor] = useState(null);
  const [summary, setSummary] = useState(null);
  const [rebal, setRebal] = useState(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch(api("ai-advisor")).then((r) => r.json()),
      fetch(api("ai-summary")).then((r) => r.json()),
      fetch(api("rebalance-plan")).then((r) => r.json()),
    ]).then(([a, s, rb]) => { setAdvisor(a); setSummary(s); setRebal(rb); })
      .catch(() => setErr(true));
  }, []);

  const score = advisor?.ai_score ?? 0;
  const scoreColor = score >= 80 ? "#16a34a" : score >= 50 ? "#d97706" : "#dc2626";

  return (
    <div className="m">
      <header className="hd">
        <Link href="/pwa" className="bk">←</Link>
        <h1>🤖 AI 자산운영</h1>
      </header>

      {err && <div className="card err">AI 엔진 연결에 실패했습니다. 잠시 후 다시 시도하세요.</div>}

      {/* 배분 점수 */}
      <div className="card score">
        <div className="sc-l">
          <div className="k">통합 배분 점수</div>
          <div className="sc-n" style={{ color: scoreColor }}>{score}<span>점</span></div>
        </div>
        <div className="sc-bar"><div className="sc-fill" style={{ width: `${score}%`, background: scoreColor }} /></div>
      </div>

      {/* 오늘의 AI 요약 */}
      <div className="card">
        <div className="k">📋 오늘 무엇을 하시겠습니까?</div>
        {!summary && !err && <div className="none">분석 중…</div>}
        {summary?.summary_items?.map((t, i) => <div className="sm" key={i}>{t}</div>)}
      </div>

      {/* 종합 AI 조언 */}
      <div className="card">
        <div className="k">🧠 종합 판단</div>
        {!advisor && !err && <div className="none">분석 중…</div>}
        {advisor && <p className="advice">{advisor.overall_advice}</p>}
      </div>

      {/* 자산별 판단 */}
      {advisor?.asset_judgments && (
        <div className="card">
          <div className="k">자산별 판단</div>
          {advisor.asset_judgments.map((j) => (
            <div className="jg" key={j.type}>
              <span className="jg-ic">{j.icon}</span>
              <div className="jg-mid">
                <div className="jg-t">{j.type} <Stars n={j.stars} /></div>
                <div className="jg-p">현재 {j.pct}% · 목표 {j.target}% <em className={j.diff > 0 ? "up" : j.diff < 0 ? "dn" : ""}>({j.diff > 0 ? "+" : ""}{j.diff}%p)</em></div>
              </div>
              <span className={`jg-ac ac-${j.action}`}>{j.action}</span>
            </div>
          ))}
        </div>
      )}

      {/* 리밸런싱 플랜 */}
      {rebal?.rebalance_needed && (
        <div className="card">
          <div className="k">⚖️ 리밸런싱 플랜</div>
          {rebal.steps.map((s, i) => (
            <div className="rb" key={i}>
              <span className="rb-a">{s.asset}</span>
              <span className="rb-mv">{s.current}% → {s.target}%</span>
              <span className={`rb-ac ac-${s.action}`}>{s.action} {s.amount_uk}억</span>
            </div>
          ))}
          <div className="rb-note">{rebal.note}</div>
        </div>
      )}

      <div className="links">
        <Link href="/pwa/portfolio" className="lk">💼 통합 포트폴리오</Link>
        <Link href="/pwa/etf" className="lk">📊 ETF 상세</Link>
      </div>

      <AssetBottomNav active="ai" />

      <style jsx>{`
        .m { max-width: 480px; margin: 0 auto; min-height: 100vh; background: #f7f9fc; padding: 0 14px 84px; font-family: -apple-system, sans-serif; color: #111827; }
        .hd { display: flex; align-items: center; gap: 10px; padding: 14px 2px; } .bk { text-decoration: none; color: #2563eb; font-size: 1.2rem; font-weight: 700; } .hd h1 { font-size: 1.05rem; font-weight: 800; margin: 0; }
        .card { background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px; margin-bottom: 10px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
        .err { color: #dc2626; font-size: 0.85rem; }
        .k { font-size: 0.78rem; font-weight: 700; color: #6b7280; margin-bottom: 10px; }
        .none { color: #9ca3af; font-size: 0.85rem; }
        .score { display: flex; flex-direction: column; gap: 10px; }
        .sc-l { display: flex; align-items: baseline; justify-content: space-between; }
        .sc-n { font-size: 2rem; font-weight: 800; } .sc-n span { font-size: 0.9rem; margin-left: 2px; }
        .sc-bar { height: 8px; background: #f1f5f9; border-radius: 4px; overflow: hidden; } .sc-fill { height: 100%; border-radius: 4px; transition: width .4s; }
        .sm { font-size: 0.9rem; padding: 7px 0; border-bottom: 1px solid #f1f5f9; color: #1f2937; }
        .sm:last-child { border-bottom: none; }
        .advice { font-size: 0.9rem; line-height: 1.6; color: #1f2937; margin: 0; }
        .jg { display: flex; align-items: center; gap: 10px; padding: 9px 0; border-bottom: 1px solid #f1f5f9; }
        .jg:last-child { border-bottom: none; }
        .jg-ic { font-size: 1.3rem; } .jg-mid { flex: 1; }
        .jg-t { font-size: 0.9rem; font-weight: 700; } .st { color: #f59e0b; font-size: 0.75rem; margin-left: 4px; }
        .jg-p { font-size: 0.76rem; color: #6b7280; margin-top: 2px; } .jg-p em { font-style: normal; } .up { color: #dc2626; } .dn { color: #2563eb; }
        .jg-ac, .rb-ac { font-size: 0.76rem; font-weight: 700; padding: 4px 10px; border-radius: 8px; }
        .ac-유지 { background: #f1f5f9; color: #64748b; } .ac-축소 { background: #fef2f2; color: #dc2626; } .ac-확대 { background: #eff6ff; color: #2563eb; }
        .rb { display: flex; align-items: center; gap: 8px; padding: 8px 0; border-bottom: 1px solid #f1f5f9; }
        .rb-a { font-weight: 700; font-size: 0.86rem; width: 54px; } .rb-mv { flex: 1; font-size: 0.8rem; color: #6b7280; }
        .rb-note { font-size: 0.72rem; color: #9ca3af; margin-top: 10px; }
        .links { display: flex; gap: 8px; margin-top: 4px; }
        .lk { flex: 1; text-align: center; background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 14px 8px; text-decoration: none; color: #111827; font-size: 0.84rem; font-weight: 700; }
      `}</style>
      <style jsx global>{`body { background: #f7f9fc; margin: 0; }`}</style>
    </div>
  );
}
