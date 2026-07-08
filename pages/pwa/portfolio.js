// ONE-HUB v10 — 통합 자산 대시보드 (Sprint 5 캡스톤)
// 주식(5001) + ETF(5003) 실평가액을 한 화면 총자산으로. 부동산(5002)은 분석엔진 연동 카드.
// ★백엔드 무변경: 기존 프록시(/api/pwa-dashboard, /api/pwa/etf/report)를 프론트에서 합산.
import { useEffect, useState } from "react";
import Link from "next/link";
import TopNav from "../../components/TopNav";

const won = (n) => {
  if (n == null) return "-";
  const a = Math.abs(n);
  if (a >= 1e8) return `${(n / 1e8).toFixed(2)}억`;
  if (a >= 1e4) return `${Math.round(n / 1e4).toLocaleString()}만`;
  return Math.round(n).toLocaleString();
};

// 간단 도넛 (SVG) — 세그먼트 [{label,value,color}]
function Donut({ segments, total }) {
  const R = 54, C = 2 * Math.PI * R;
  let offset = 0;
  return (
    <svg viewBox="0 0 140 140" width="150" height="150">
      <circle cx="70" cy="70" r={R} fill="none" stroke="var(--color-line)" strokeWidth="18" />
      {segments.map((s) => {
        const frac = total > 0 ? s.value / total : 0;
        const dash = frac * C;
        const el = (
          <circle key={s.label} cx="70" cy="70" r={R} fill="none" stroke={s.color}
            strokeWidth="18" strokeDasharray={`${dash} ${C - dash}`}
            strokeDashoffset={-offset} transform="rotate(-90 70 70)" />
        );
        offset += dash;
        return el;
      })}
      <text x="70" y="66" textAnchor="middle" fontSize="10" fill="var(--color-ink-3)">총자산</text>
      <text x="70" y="82" textAnchor="middle" fontSize="15" fontWeight="800" fill="var(--color-ink)">{won(total)}</text>
    </svg>
  );
}

export default function Portfolio() {
  const [stock, setStock] = useState(null);
  const [etf, setEtf] = useState(null);
  const [reUk, setReUk] = useState(null);   // 부동산 보유 평가액(억)
  const [err, setErr] = useState(null);

  useEffect(() => {
    fetch("/api/pwa-dashboard?trader=A").then((r) => r.json())
      .then((d) => setStock(d?.balance?.total_asset ?? null)).catch(() => {});
    fetch("/api/pwa/etf/report?trader=A").then((r) => r.json())
      .then((d) => { if (d.error) setErr(d.error); setEtf(d?.summary?.value_krw ?? null); })
      .catch((e) => setErr(e.message));
    fetch("/api/pwa/re/holdings?trader=A").then((r) => r.json())
      .then((d) => setReUk(d?.total_uk ?? null)).catch(() => {});
  }, []);

  const s = stock || 0, e = etf || 0, re = (reUk || 0) * 1e8;
  const total = s + e + re;
  const hasRe = re > 0;
  const segments = [
    { label: "주식", value: s, color: "var(--color-primary)" },
    { label: "ETF", value: e, color: "var(--color-etf)" },
    ...(hasRe ? [{ label: "부동산", value: re, color: "var(--color-success)" }] : []),
  ];
  const pct = (v) => (total > 0 ? (v / total * 100).toFixed(1) : "0");

  // 간단 AI 제안 (집중도)
  const suggestions = [];
  if (total > 0) {
    const etfPct = e / total * 100;
    if (etfPct > 90) suggestions.push(`ETF 비중 ${etfPct.toFixed(0)}% — 주식/현금 분산 검토`);
    if (s / total * 100 > 90) suggestions.push(`주식 비중 과다 — ETF/부동산 분산 검토`);
  }

  return (
    <div className="pf">
      <TopNav active="ai" />
      <div className="pf-title"><h1>통합 자산</h1><span className="live">LIVE</span></div>

      {err && <div className="err">일부 데이터 로드 오류: {err}</div>}
      {stock == null && etf == null && !err && <div className="loading">불러오는 중…</div>}

      {/* 총자산 도넛 */}
      <section className="card solid">
        <div className="donut-wrap">
          <Donut segments={segments} total={total} />
          <div className="legend">
            {segments.map((seg) => (
              <div className="lg" key={seg.label}>
                <span className="dot" style={{ background: seg.color }} />
                <span className="lg-l">{seg.label}</span>
                <b className="lg-v">{won(seg.value)}원</b>
                <span className="lg-p">{pct(seg.value)}%</span>
              </div>
            ))}
            {!hasRe && (
              <div className="lg re">
                <span className="dot" style={{ background: "var(--color-line)" }} />
                <span className="lg-l">부동산</span>
                <span className="lg-p">보유 미입력</span>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* 자산별 바로가기 */}
      <section className="card">
        <div className="label">자산별 상세</div>
        <Link href="/pwa" className="row"><span>📈 주식</span><b>{won(s)}원</b><span className="arr">→</span></Link>
        <Link href="/pwa/etf" className="row"><span>💵 ETF</span><b>{won(e)}원</b><span className="arr">→</span></Link>
        <Link href="/pwa/realestate" className="row"><span>🏠 부동산</span>{hasRe ? <b>{won(re)}원</b> : <span className="muted">ONE Score·저평가</span>}<span className="arr">→</span></Link>
      </section>

      {/* AI 제안 */}
      {suggestions.length > 0 && (
        <section className="card">
          <div className="label">AI 배분 제안</div>
          {suggestions.map((t, i) => <div className="sug" key={i}>· {t}</div>)}
        </section>
      )}

      <div className="foot">주식·ETF는 실평가액 합산(확정). 부동산은 분석 엔진 — 보유자산 입력 시 총자산에 합산 예정.</div>

      <style jsx>{`
        .pf { max-width: 480px; margin: 0 auto; padding: 0 14px calc(env(safe-area-inset-bottom, 0px) + 24px); font-family: var(--font-sans); color: var(--color-ink); }
        .pf-title { display: flex; align-items: center; gap: 10px; padding: 12px 2px 6px; }
        .pf-title h1 { font-size: 1.15rem; font-weight: 800; margin: 0; flex: 1; color: var(--color-ink); }
        .live { font-size: 0.62rem; font-weight: 800; color: #fff; background: var(--color-primary); padding: 2px 7px; border-radius: 6px; }
        .err { background: var(--color-warning-soft); color: var(--color-warning-ink); padding: 9px 12px; border-radius: 10px; font-size: 0.78rem; }
        .loading { color: var(--color-ink-2); padding: 24px; text-align: center; }
        .card { background: var(--color-card); border: 1px solid var(--color-line); border-radius: var(--radius-card); padding: 16px; margin-bottom: 12px; box-shadow: var(--shadow-card); }
        .card.solid { background: var(--color-card-soft); border-color: var(--color-line); }
        .label { font-size: 0.78rem; font-weight: 700; color: var(--color-ink-2); margin-bottom: 8px; }
        .donut-wrap { display: flex; align-items: center; gap: 14px; }
        .legend { flex: 1; display: flex; flex-direction: column; gap: 8px; }
        .lg { display: grid; grid-template-columns: 14px 44px 1fr auto; align-items: center; gap: 6px; font-size: 0.84rem; }
        .lg .dot { width: 10px; height: 10px; border-radius: 3px; }
        .lg-l { color: var(--color-ink-2); font-weight: 600; }
        .lg-v { text-align: right; font-weight: 700; }
        .lg-p { color: var(--color-ink-3); font-size: 0.72rem; text-align: right; }
        .lg.re .lg-p { color: var(--color-ink-3); }
        .row { display: flex; align-items: center; gap: 8px; padding: 11px 2px; border-bottom: 1px solid var(--color-line); text-decoration: none; color: var(--color-ink); font-size: 0.9rem; }
        .row b { font-weight: 700; } .row .muted { color: var(--color-ink-3); font-size: 0.78rem; }
        .row span:first-child { flex: 1; } .arr { color: var(--color-ink-3); }
        .sug { font-size: 0.8rem; color: var(--color-primary); background: var(--color-primary-soft); padding: 8px 10px; border-radius: 8px; margin-top: 4px; }
        .foot { font-size: 0.68rem; color: var(--color-ink-3); text-align: center; margin-top: 16px; line-height: 1.5; }
      `}</style>
      <style jsx global>{`body { background: var(--color-bg); margin: 0; }`}</style>
    </div>
  );
}
