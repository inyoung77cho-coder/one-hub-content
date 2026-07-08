// AI Advisor — 자산운영 AI 브레인 탭 (통합 자산 기반 종합 판단/리밸런싱)
import { useEffect, useState } from "react";
import Link from "next/link";
import TopNav from "../../components/TopNav";
import AssetSummaryBar from "../../components/AssetSummaryBar";

const api = (fn) => `/api/realestate/v2/${fn}?trader_id=A`;
const Stars = ({ n }) => <span className="st">{"★".repeat(n)}{"☆".repeat(5 - n)}</span>;

export default function AIAdvisor() {
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

  // [v10 UI §5③] 미측정(0점/null)은 위험(빨강)이 아니라 "측정 준비 중"(회색 중립)으로 표기.
  const rawScore = advisor?.ai_score;
  const measured = rawScore != null && Number(rawScore) > 0;
  const score = measured ? Number(rawScore) : 0;
  const scoreColor = !measured
    ? "var(--color-ink-3)"
    : score >= 80 ? "var(--color-success)"
    : score >= 50 ? "var(--color-warning)"
    : "var(--color-danger)";

  return (
    <div className="m">
      <TopNav active="ai" />
      <div className="hd"><h1>🤖 AI 자산운영</h1></div>

      <AssetSummaryBar />

      {err && <div className="card err">AI 엔진 연결에 실패했습니다. 잠시 후 다시 시도하세요.</div>}

      {/* 배분 점수 — 미측정은 회색 "측정 준비 중" (§5③) */}
      <div className="card score">
        <div className="sc-l">
          <div className="k">통합 배분 점수</div>
          {measured
            ? <div className="sc-n" style={{ color: scoreColor }}>{score}<span>점</span></div>
            : <div className="sc-pending">측정 준비 중</div>}
        </div>
        <div className="sc-bar"><div className="sc-fill" style={{ width: `${measured ? score : 0}%`, background: scoreColor }} /></div>
        {!measured && <div className="sc-hint">자산 입력이 완료되면 배분 점수가 산출됩니다.</div>}
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

      <style jsx>{`
        .m { max-width: 480px; margin: 0 auto; min-height: 100vh; background: var(--color-bg); padding: 0 14px calc(env(safe-area-inset-bottom, 0px) + 24px); font-family: var(--font-sans); color: var(--color-ink); }
        .hd { display: flex; align-items: center; gap: 10px; padding: 12px 2px 6px; } .hd h1 { font-size: 1.05rem; font-weight: 800; margin: 0; }
        .card { background: var(--color-card); border: 1px solid var(--color-line); border-radius: var(--radius-card); padding: 16px; margin-bottom: 10px; box-shadow: var(--shadow-card); }
        .err { color: var(--color-danger); font-size: 0.85rem; }
        .k { font-size: 0.78rem; font-weight: 700; color: var(--color-ink-2); margin-bottom: 10px; }
        .none { color: var(--color-ink-3); font-size: 0.85rem; }
        .score { display: flex; flex-direction: column; gap: 10px; }
        .sc-l { display: flex; align-items: baseline; justify-content: space-between; }
        .sc-n { font-size: 2rem; font-weight: 800; } .sc-n span { font-size: 0.9rem; margin-left: 2px; }
        .sc-pending { font-size: 1.05rem; font-weight: 800; color: var(--color-ink-3); }
        .sc-bar { height: 8px; background: var(--color-line); border-radius: 4px; overflow: hidden; } .sc-fill { height: 100%; border-radius: 4px; transition: width .4s; }
        .sc-hint { font-size: 0.72rem; color: var(--color-ink-3); }
        .sm { font-size: 0.9rem; padding: 7px 0; border-bottom: 1px solid var(--color-line); color: var(--color-ink); }
        .sm:last-child { border-bottom: none; }
        .advice { font-size: 0.9rem; line-height: 1.6; color: var(--color-ink); margin: 0; }
        .jg { display: flex; align-items: center; gap: 10px; padding: 9px 0; border-bottom: 1px solid var(--color-line); }
        .jg:last-child { border-bottom: none; }
        .jg-ic { font-size: 1.3rem; } .jg-mid { flex: 1; }
        .jg-t { font-size: 0.9rem; font-weight: 700; } .st { color: var(--color-warning); font-size: 0.75rem; margin-left: 4px; }
        .jg-p { font-size: 0.76rem; color: var(--color-ink-2); margin-top: 2px; } .jg-p em { font-style: normal; }
        /* [v10 UI §1] 목표 초과=초록, 미달=빨강 */
        .up { color: var(--color-success); } .dn { color: var(--color-danger); }
        .jg-ac, .rb-ac { font-size: 0.76rem; font-weight: 700; padding: 4px 10px; border-radius: 8px; }
        .ac-유지 { background: var(--color-card-soft); color: var(--color-ink-2); } .ac-축소 { background: var(--color-danger-soft); color: var(--color-danger); } .ac-확대 { background: var(--color-success-soft); color: var(--color-success-ink); }
        .rb { display: flex; align-items: center; gap: 8px; padding: 8px 0; border-bottom: 1px solid var(--color-line); }
        .rb-a { font-weight: 700; font-size: 0.86rem; width: 54px; } .rb-mv { flex: 1; font-size: 0.8rem; color: var(--color-ink-2); }
        .rb-note { font-size: 0.72rem; color: var(--color-ink-3); margin-top: 10px; }
        .links { display: flex; gap: 8px; margin-top: 4px; }
        .lk { flex: 1; text-align: center; background: var(--color-card); border: 1px solid var(--color-line); border-radius: var(--radius-card); padding: 14px 8px; text-decoration: none; color: var(--color-ink); font-size: 0.84rem; font-weight: 700; }
      `}</style>
      <style jsx global>{`body { background: var(--color-bg); margin: 0; }`}</style>
    </div>
  );
}
