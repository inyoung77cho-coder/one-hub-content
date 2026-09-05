// [S31-2] 공개 실거래 통계 페이지 — www.one-hub.kr/estimate. 로그인 없이. 랜딩(하단탭·헤더아이콘 없음).
//   ★규제(0-2): "적정가" 금지 → "최근 실거래 기준 통계". 이메일·전화 안 물음. 결과 본 뒤에만 가입 유도.
//   기존 :5002 재사용(공개 프록시 /api/public/re/*). S26 토큰 사용.
import { useState, useEffect, useCallback } from "react";
import Head from "next/head";
import { SITE } from "../lib/site";

const REGIONS = ["서현동", "정자동", "수내동", "이매동", "야탑동", "판교동"];
const APP = "https://app.one-hub.kr";

export default function Estimate() {
  const [region, setRegion] = useState("서현동");
  const [complexes, setComplexes] = useState([]);
  const [apt, setApt] = useState("");
  const [result, setResult] = useState(null);
  const [area, setArea] = useState(null); // 선택 평형(m2)
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    fetch(`/api/public/re/complexes?region=${encodeURIComponent(region)}`)
      .then((r) => r.json()).then((d) => { if (alive) setComplexes(d?.complexes || []); })
      .catch(() => {});
    return () => { alive = false; };
  }, [region]);

  const search = useCallback(async (name) => {
    const q = (name || apt).trim();
    if (!q) return;
    setLoading(true); setErr(""); setResult(null); setArea(null);
    try {
      const r = await fetch(`/api/public/re/estimate?apt=${encodeURIComponent(q)}&region=${encodeURIComponent(region)}`);
      if (r.status === 429) { setErr("잠시 후 다시 시도해 주세요 (요청이 많습니다)"); setLoading(false); return; }
      const d = await r.json();
      setResult(d);
      if (d?.areas?.length) setArea(d.areas[Math.floor(d.areas.length / 2)].m2); // 중간 평형 기본
      // [S31-3] 결과를 본 사람(공개 도구 조회) — 서버 카운터는 프록시가 집계. 여기선 화면만.
    } catch (e) { setErr("지금은 조회할 수 없습니다"); }
    setLoading(false);
  }, [apt, region]);

  const picked = result?.areas?.find((a) => a.m2 === area) || null;
  const trend = result?.trend || [];
  const tMin = trend.length ? Math.min(...trend.map((t) => t.price)) : 0;
  const tMax = trend.length ? Math.max(...trend.map((t) => t.price)) : 1;

  return (
    <>
      <Head>
        <title>아파트 실거래 통계 — ONE·HUB</title>
        <meta name="description" content="단지명만 넣으면 최근 실거래·평형별 시세·6개월 추이를 봅니다. 실거래 기반 통계입니다." />
        <link rel="canonical" href={`${SITE}/estimate`} />
        <meta property="og:type" content="website" />
        <meta property="og:title" content="아파트 실거래 통계 — ONE·HUB" />
        <meta property="og:description" content="단지명만 넣으면 최근 실거래·평형별 시세·6개월 추이. 로그인 없이." />
        <meta property="og:url" content={`${SITE}/estimate`} />
        <meta property="og:image" content={`${SITE}/api/og-home`} />
        <meta name="twitter:card" content="summary_large_image" />
      </Head>

      <div className="est">
        <header className="est-hd">
          <div className="est-brand">ONE·HUB</div>
          <h1 className="est-h1">아파트 실거래 통계</h1>
          <p className="est-sub">단지명만 넣으면 최근 실거래·평형별 시세·6개월 추이를 봅니다. <b>로그인 없이.</b></p>
        </header>

        <section className="est-card">
          <div className="est-field">
            <label>지역</label>
            <div className="est-regions">
              {REGIONS.map((g) => (
                <button key={g} type="button" className={`est-chip ${g === region ? "on" : ""}`} onClick={() => { setRegion(g); setApt(""); setResult(null); }}>{g}</button>
              ))}
            </div>
          </div>
          <div className="est-field">
            <label>단지명</label>
            <input list="est-complexes" value={apt} onChange={(e) => setApt(e.target.value)}
              placeholder="예: 시범우성" onKeyDown={(e) => { if (e.key === "Enter") search(); }} />
            <datalist id="est-complexes">{complexes.map((c) => <option key={c} value={c} />)}</datalist>
          </div>
          <button type="button" className="est-go" onClick={() => search()} disabled={loading || !apt.trim()}>
            {loading ? "불러오는 중…" : "실거래 보기"}
          </button>
          {err && <div className="est-err">{err}</div>}
        </section>

        {result && result.ok && !result.empty && (
          <section className="est-card">
            <div className="est-rh">{result.apt} <span className="est-rsub">{result.법정동 || result.region} · 최근 실거래 기준</span></div>

            {result.areas.length > 0 && (
              <>
                <div className="est-areas">
                  {result.areas.map((a) => (
                    <button key={a.m2} type="button" className={`est-achip ${a.m2 === area ? "on" : ""}`} onClick={() => setArea(a.m2)}>{a.평}평</button>
                  ))}
                </div>
                {picked && (
                  <div className="est-nums">
                    <div className="est-num"><span>대표 시세(중앙값)</span><b>{picked.rep_price_uk}억</b></div>
                    <div className="est-num"><span>최고 실거래</span><b>{picked.max_price_uk}억</b></div>
                    <div className="est-num"><span>거래 건수</span><b>{picked.n}건</b></div>
                    <div className="est-num"><span>전용면적</span><b>{picked.m2}㎡</b></div>
                  </div>
                )}
              </>
            )}

            {trend.length > 1 && (
              <div className="est-trend">
                <div className="est-trend-h">최근 6개월 추이 {result.change_pct != null && <span className={result.change_pct >= 0 ? "up" : "dn"}>{result.change_pct >= 0 ? "+" : ""}{result.change_pct}%</span>}</div>
                <div className="est-bars">
                  {trend.map((t) => {
                    const h = tMax > tMin ? 12 + ((t.price - tMin) / (tMax - tMin)) * 44 : 30;
                    return <div key={t.month} className="est-bar" title={`${t.month} · ${(t.price / 10000).toFixed(1)}억`}><span style={{ height: `${h}px` }} /><i>{t.month.slice(5)}</i></div>;
                  })}
                </div>
              </div>
            )}

            <div className="est-disc">규칙 기반 참고 정보 · 투자자문이나 특정 종목 권유가 아닙니다. 실거래 신고 자료 기반 통계이며 실제 거래가와 다를 수 있습니다.</div>

            {/* [S31-3] 결과를 본 뒤에만 가입 유도 */}
            <a className="est-cta" href={`${APP}/login?from=estimate&apt=${encodeURIComponent(result.apt)}&region=${encodeURIComponent(result.region)}`}>
              이 단지를 내 자산에 넣고 매주 추적하려면 → 시작하기
            </a>
            <div className="est-cta-sub">가입하면 내 단지 추적·갈아타기 비용·세금·대장 대비 추이를 볼 수 있어요.</div>
          </section>
        )}

        {result && result.ok && result.empty && (
          <section className="est-card">
            <div className="est-empty">아직 <b>{result.apt}</b>은(는) 실거래 데이터가 부족합니다.</div>
            <a className="est-cta" href={`${APP}/login?from=estimate&apt=${encodeURIComponent(result.apt)}&region=${encodeURIComponent(result.region)}`}>
              관심 단지로 등록하면 데이터가 쌓일 때 알려드립니다 → 시작하기
            </a>
          </section>
        )}

        <footer className="est-ft">© ONE·HUB · 실거래 신고 자료(국토교통부) 기반 통계</footer>
      </div>

      <style jsx>{`
        .est { max-width: 480px; margin: 0 auto; padding: 24px 16px 48px; font-family: var(--font-sans, system-ui); color: var(--color-ink, #12213B); background: var(--color-bg, #F4F9FF); min-height: 100vh; }
        .est-hd { text-align: center; margin-bottom: 20px; }
        .est-brand { font-size: var(--fs-2, 13px); font-weight: 800; color: var(--color-primary, #2F6BFF); letter-spacing: .5px; }
        .est-h1 { font-size: var(--fs-7, 26px); font-weight: 800; margin: 6px 0 8px; letter-spacing: -.5px; }
        .est-sub { font-size: var(--fs-3, 15px); color: var(--color-ink-2, #475569); line-height: 1.6; word-break: keep-all; margin: 0; }
        .est-card { background: var(--color-card, #fff); border: 1px solid var(--color-line, #E8EEF7); border-radius: var(--radius-card, 16px); box-shadow: var(--shadow-card, 0 1px 3px rgba(0,0,0,.06)); padding: 18px; margin-bottom: 14px; }
        .est-field { margin-bottom: 14px; }
        .est-field label { display: block; font-size: var(--fs-2, 13px); font-weight: 700; color: var(--color-ink-3, #64748B); margin-bottom: 7px; }
        .est-regions { display: flex; flex-wrap: wrap; gap: 6px; }
        .est-chip { border: 1px solid var(--color-line); background: var(--color-card); color: var(--color-ink-2); border-radius: 999px; padding: 7px 13px; font-size: var(--fs-2, 13px); font-weight: 700; cursor: pointer; font-family: inherit; }
        .est-chip.on { background: var(--color-primary); border-color: var(--color-primary); color: var(--color-on-primary, #fff); }
        .est-field input { width: 100%; box-sizing: border-box; border: 1px solid var(--color-line); border-radius: 12px; padding: 13px 14px; font-size: var(--fs-4, 16px); font-family: inherit; background: var(--color-card); color: var(--color-ink); }
        .est-go { width: 100%; border: none; border-radius: 12px; padding: 14px; font-size: var(--fs-4, 16px); font-weight: 800; background: var(--color-primary, #2F6BFF); color: var(--color-on-primary, #fff); cursor: pointer; font-family: inherit; }
        .est-go:disabled { opacity: .5; }
        .est-err { margin-top: 10px; font-size: var(--fs-2, 13px); color: var(--color-danger, #dc2626); }
        .est-rh { font-size: var(--fs-5, 19px); font-weight: 800; margin-bottom: 12px; }
        .est-rsub { font-size: var(--fs-1, 12px); font-weight: 600; color: var(--color-ink-3); margin-left: 4px; }
        .est-areas { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 14px; }
        .est-achip { border: 1px solid var(--color-line); background: var(--color-card); color: var(--color-ink-2); border-radius: 999px; padding: 6px 12px; font-size: var(--fs-2, 13px); font-weight: 700; cursor: pointer; font-family: inherit; }
        .est-achip.on { background: var(--color-primary-soft, #EAF1FF); border-color: var(--color-primary); color: var(--color-primary); }
        .est-nums { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .est-num { background: var(--color-card-soft, #F4F9FF); border-radius: 12px; padding: 12px 14px; }
        .est-num span { display: block; font-size: var(--fs-1, 12px); color: var(--color-ink-3); margin-bottom: 3px; }
        .est-num b { font-size: var(--fs-5, 19px); font-weight: 800; color: var(--color-ink); }
        .est-trend { margin-top: 16px; }
        .est-trend-h { font-size: var(--fs-3, 15px); font-weight: 700; margin-bottom: 10px; }
        .est-trend-h .up { color: var(--color-danger, #dc2626); }
        .est-trend-h .dn { color: var(--color-primary, #2563eb); }
        .est-bars { display: flex; align-items: flex-end; gap: 6px; height: 66px; }
        .est-bar { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; gap: 4px; }
        .est-bar span { width: 100%; max-width: 34px; background: var(--color-primary, #2F6BFF); border-radius: 4px 4px 0 0; display: block; }
        .est-bar i { font-size: 10px; color: var(--color-ink-3); font-style: normal; }
        .est-disc { margin-top: 16px; font-size: var(--fs-1, 12px); color: var(--color-ink-3); line-height: 1.55; word-break: keep-all; }
        .est-cta { display: block; margin-top: 16px; text-align: center; background: var(--color-primary, #2F6BFF); color: var(--color-on-primary, #fff); border-radius: 12px; padding: 14px; font-size: var(--fs-3, 15px); font-weight: 800; text-decoration: none; }
        .est-cta-sub { margin-top: 8px; font-size: var(--fs-1, 12px); color: var(--color-ink-3); text-align: center; word-break: keep-all; }
        .est-empty { font-size: var(--fs-3, 15px); color: var(--color-ink-2); line-height: 1.6; margin-bottom: 12px; word-break: keep-all; }
        .est-ft { text-align: center; font-size: var(--fs-1, 12px); color: var(--color-ink-3); margin-top: 20px; }
      `}</style>
    </>
  );
}
