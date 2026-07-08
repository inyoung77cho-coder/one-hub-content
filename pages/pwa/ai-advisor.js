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
  const [targetAlloc, setTargetAlloc] = useState(null); // §5② 온보딩 성향→목표배분 소스

  useEffect(() => {
    // §5② 온보딩에서 성향으로 산출한 목표 배분(%)을 "목표 %" 단일 소스로 사용
    try {
      const raw = localStorage.getItem("onehub_target_alloc");
      if (raw) setTargetAlloc(JSON.parse(raw));
    } catch (e) {}
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

      {/* HERO — AI 자산운영 배분 점수 (다크 네이비 앵커). 미측정은 회색 "측정 준비 중" (§5③) */}
      <section className="hero">
        <div className="h-eyebrow">
          <span className="h-lbl">🤖 AI 자산운영 · 통합 배분 점수</span>
          <span className="h-live">LIVE</span>
        </div>
        {measured
          ? <div className="h-score">{score}<span>점</span></div>
          : <div className="h-pending">측정 준비 중</div>}
        <div className="h-bar"><div className="h-fill" style={{ width: `${measured ? score : 0}%`, background: measured ? "var(--hero-accent)" : "var(--hero-ink-faint)" }} /></div>
        <div className="h-note">{measured ? "자산 배분의 균형도를 100점 기준으로 평가합니다." : "자산 입력이 완료되면 배분 점수가 산출됩니다."}</div>
      </section>

      <AssetSummaryBar />

      {err && <div className="card err">AI 엔진 연결에 실패했습니다. 잠시 후 다시 시도하세요.</div>}

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
          {advisor.asset_judgments.map((j) => {
            // §5② 온보딩 목표배분이 있으면 그 값을 목표%로, 갭도 재계산
            const tgt = targetAlloc && targetAlloc[j.type] != null ? targetAlloc[j.type] : j.target;
            const diff = targetAlloc && targetAlloc[j.type] != null ? Math.round((j.pct - tgt) * 10) / 10 : j.diff;
            return (
              <div className="jg" key={j.type}>
                <span className="jg-ic">{j.icon}</span>
                <div className="jg-mid">
                  <div className="jg-t">{j.type} <Stars n={j.stars} /></div>
                  <div className="jg-p">현재 {j.pct}% · 목표 {tgt}% <em className={diff > 0 ? "up" : diff < 0 ? "dn" : ""}>({diff > 0 ? "+" : ""}{diff}%p)</em></div>
                </div>
                <span className={`jg-ac ac-${j.action}`}>{j.action}</span>
              </div>
            );
          })}
          {targetAlloc && <div className="tgt-src">목표 %는 온보딩 투자성향 결과에서 산출됩니다.</div>}
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
        .hero { background: linear-gradient(135deg, var(--hero-grad-1), var(--hero-grad-2)); color: var(--hero-ink); border-radius: var(--radius-hero); padding: 20px 18px; box-shadow: var(--shadow-float); margin-bottom: 12px; }
        .h-eyebrow { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 12px; }
        .h-lbl { font-size: 12px; font-weight: 700; color: var(--hero-ink-sub); }
        .h-live { background: var(--color-success); color: #04351f; font-size: 9px; font-weight: 800; padding: 3px 7px; border-radius: 5px; letter-spacing: .5px; }
        .h-score { font-size: 2.6rem; font-weight: 800; letter-spacing: -.02em; line-height: 1; color: var(--hero-accent); }
        .h-score span { font-size: 1.1rem; font-weight: 700; margin-left: 3px; color: var(--hero-ink-soft); }
        .h-pending { font-size: 1.3rem; font-weight: 800; color: var(--hero-ink-faint); }
        .h-bar { height: 8px; background: var(--hero-fill-line); border-radius: 4px; overflow: hidden; margin-top: 12px; }
        .h-fill { height: 100%; border-radius: 4px; transition: width .4s; }
        .h-note { font-size: 11px; color: var(--hero-ink-faint); margin-top: 10px; line-height: 1.5; }
        .card { background: var(--color-card); border: 1px solid var(--color-line); border-radius: var(--radius-card); padding: 16px; margin-bottom: 10px; box-shadow: var(--shadow-card); }
        .err { color: var(--color-danger); font-size: 0.85rem; }
        .k { font-size: 0.78rem; font-weight: 700; color: var(--color-ink-2); margin-bottom: 10px; }
        .none { color: var(--color-ink-3); font-size: 0.85rem; }
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
        .tgt-src { font-size: 0.68rem; color: var(--color-ink-3); margin-top: 10px; padding-top: 8px; border-top: 1px dashed var(--color-line); }
        .links { display: flex; gap: 8px; margin-top: 4px; }
        .lk { flex: 1; text-align: center; background: var(--color-card); border: 1px solid var(--color-line); border-radius: var(--radius-card); padding: 14px 8px; text-decoration: none; color: var(--color-ink); font-size: 0.84rem; font-weight: 700; }
      `}</style>
      <style jsx global>{`body { background: var(--color-bg); margin: 0; }`}</style>
    </div>
  );
}
