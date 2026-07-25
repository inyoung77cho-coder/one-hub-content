// pages/welcome.js — 첫 사용자용 공개 광고 겸 온보딩 가이드(로그인 불필요).
//   카톡/SNS로 공유하는 링크: https://app.one-hub.kr/welcome
//   middleware 보호 대상(/pwa·/api)이 아니므로 누구나 열 수 있다. CTA는 /pwa → 카카오 로그인으로 유도.
import Head from "next/head";
import { useEffect, useState } from "react";

const SITE = "https://app.one-hub.kr"; // 공개 공유 도메인(canonical·OG용). Vercel 앱이 이 도메인으로 서빙됨.

const FEATURES = [
  {
    ic: "💼",
    title: "흩어진 자산을 한눈에",
    body: "주식·ETF·부동산·현금을 합쳐 총자산과 어제 대비 변화를 봅니다. 한쪽으로 쏠렸는지 자동으로 짚어주고, 옮길 방법까지 제안합니다.",
    tags: ["총자산 추세", "쏠림 진단", "기기 간 동기화"],
  },
  {
    ic: "🛡️",
    title: "믿을 수 있는 AI — 실패까지 공개",
    body: "AI가 매일 종목을 분석하고 차단·관망 이유를 밝힙니다. ‘나 vs AI’ 가상 대결로 내 판단과 겨루고, AI가 틀린 것까지 사후 검증해 보여줍니다.",
    tags: ["나 vs AI 대결", "매일 자기검증", "AI 성적표"],
  },
  {
    ic: "🏢",
    title: "부동산까지 함께",
    body: "내 단지의 저평가·고평가를 점수로, ‘갈아타기’ 갭 분석으로 다음 집을 계획합니다. 지역 시세 동향 소식도 한 곳에서.",
    tags: ["ONE Score", "갈아타기 갭", "지역 동향"],
  },
];

const STEPS = [
  { h: "카카오로 로그인", p: "따로 아이디·비밀번호를 만들지 않습니다. 카카오 계정으로 바로 시작합니다.", hint: "비밀번호를 저장하지 않아 안전합니다." },
  { h: "약관에 동의", p: "이용약관·개인정보·투자 유의사항을 확인하고 동의합니다. 마케팅 수신은 선택입니다.", hint: "" },
  { h: "내 자산을 입력", p: "주식·ETF·부동산·현금 중 가진 것만 넣으면 됩니다. 종목·단지는 검색으로 쉽게, 나중에 추가·수정도 됩니다.", hint: "한 기기에서 입력하면 다른 기기에서도 그대로 보입니다." },
  { h: "오늘·자산·AI 탭 둘러보기", p: "하단 4개 탭이 전부입니다. 매일 ‘오늘’ 탭만 열어봐도 그날 할 일과 AI 판단을 한눈에 볼 수 있습니다.", hint: "" },
];

const TABS = [
  { ic: "🎯", b: "오늘", s: "그날 할 일·중요 알림·AI 통합 판단" },
  { ic: "💼", b: "자산", s: "총자산 지도·어제 대비 변화·쏠림 진단" },
  { ic: "🛡️", b: "AI", s: "나 vs AI·자기검증·리포트·성적표" },
  { ic: "⚙️", b: "설정", s: "계정·알림·구독 상태" },
];

export default function Welcome() {
  const canonical = `${SITE}/welcome`;
  const title = "ONE-HUB — 내 모든 자산을 AI와 함께";
  const description = "주식·ETF·부동산·현금을 한 곳에서. AI가 매일 분석하고, 그 판단을 나와 겨루고, 틀린 것까지 투명하게 공개합니다. 카카오로 3초 만에 무료 시작.";

  return (
    <>
      <Head>
        <title>ONE-HUB · 첫 사용 가이드</title>
        <meta name="description" content={description} />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <link rel="canonical" href={canonical} />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="ONE-HUB" />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:url" content={canonical} />
        <meta property="og:image" content={`${SITE}/api/og-home`} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={title} />
        <meta name="twitter:description" content={description} />
        <meta name="twitter:image" content={`${SITE}/api/og-home`} />
      </Head>

      <div className="wc">
        {/* ── HERO ── */}
        <header className="hero">
          <div className="logo">ONE<span className="dot">·</span>HUB</div>
          <h1>내 모든 자산을,<br /><b>AI와 함께</b> 운영합니다</h1>
          <p className="lead">주식 · ETF · 부동산 · 현금을 한 곳에서. AI가 매일 시장을 분석하고, 그 판단을 나와 겨루고, 틀린 것까지 투명하게 공개합니다.</p>
          <a className="cta" href="/pwa">카카오로 3초 만에 시작하기 →</a>
          <span className="subcta">설치 없이 · 카카오 로그인 · 무료 시험 사용</span>

          <div className="peek" aria-label="총자산 화면 미리보기">
            <div className="peek-top"><span>총자산</span><b className="num">6.42억</b></div>
            <div className="peek-delta num">▲ +0.18억 · 어제 대비</div>
            {[
              ["#2F6BFF", "📈 주식", "2.16억", "34%"],
              ["#0E9E6A", "🏠 부동산", "3.24억", "50%"],
              ["#5B8CFF", "💹 ETF", "0.82억", "13%"],
              ["#B45309", "💵 현금", "0.20억", "3%"],
            ].map(([c, n, v, p]) => (
              <div className="peek-row" key={n}>
                <i className="peek-dot" style={{ background: c }} />
                <span className="peek-name">{n}</span>
                <span className="peek-val num">{v}</span>
                <span className="peek-pct num">{p}</span>
              </div>
            ))}
          </div>
        </header>

        {/* ── 무료 채점 체험(로그인 전) ── */}
        <FreeScoreWidget />

        {/* ── 3대 강점 ── */}
        <section className="sec">
          <div className="eyebrow">왜 ONE-HUB 인가</div>
          <h2>흩어진 자산 관리가 하나로 모입니다</h2>
          <p className="seclead">증권 앱 따로, 부동산 앱 따로, 엑셀 따로 보던 것을 한 화면에서. 게다가 AI가 옆에서 함께 판단합니다.</p>
          <div className="feats">
            {FEATURES.map((f) => (
              <div className="feat" key={f.title}>
                <div className="feat-ic">{f.ic}</div>
                <h3>{f.title}</h3>
                <p>{f.body}</p>
                <div className="tags">{f.tags.map((t) => <span className="tag" key={t}>{t}</span>)}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ── 시작 4단계 ── */}
        <section className="sec steps-sec">
          <div className="eyebrow">시작하기</div>
          <h2>4단계면 끝납니다</h2>
          <p className="seclead">설치할 것도, 복잡한 가입서류도 없습니다. 카카오만 있으면 됩니다.</p>
          <div className="steps">
            {STEPS.map((s, i) => (
              <div className="step" key={s.h}>
                <div className="step-n">{i + 1}</div>
                <div>
                  <h4>{s.h}</h4>
                  <p>{s.p}</p>
                  {s.hint ? <div className="hint">{s.hint}</div> : null}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── 하단 탭 안내 ── */}
        <section className="sec">
          <div className="eyebrow">화면 안내</div>
          <h2>하단 탭 4개만 기억하세요</h2>
          <p className="seclead">모든 기능은 이 네 곳으로 통합돼 있습니다.</p>
          <div className="tabs">
            {TABS.map((t) => (
              <div className="tabcard" key={t.b}>
                <div className="tic">{t.ic}</div>
                <b>{t.b}</b>
                <span>{t.s}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ── 신뢰 배너 ── */}
        <section className="sec">
          <div className="trust">
            <h3>🟡 우리는 ‘모른다’고 말합니다</h3>
            <p>확인되지 않은 정보는 미검증이라 표시하고, AI가 틀린 판단은 감추지 않고 공개합니다. 화려한 수익 약속 대신, 판단의 근거와 한계를 투명하게 보여주는 것 — 그게 ONE-HUB의 방식입니다.</p>
          </div>
        </section>

        {/* ── 최종 CTA ── */}
        <section className="sec finalcta">
          <h2>지금 시작해 볼까요?</h2>
          <a className="cta" href="/pwa">카카오로 시작하기 →</a>
        </section>

        {/* ── 면책 ── */}
        <div className="legal">
          <div className="legal-box">
            <p><b>투자 유의</b> · ONE-HUB가 제공하는 모든 정보(AI 분석·점수·리포트·시세 등)는 일반적인 참고용이며 투자자문·세무자문이 아닙니다. 과거 수익률·시뮬레이션은 미래 수익을 보장하지 않으며 원금 손실이 발생할 수 있습니다. 부동산 수집 정보는 국토부 실거래로 확인되지 않은 참고 정보입니다. 모든 투자·거래의 최종 판단과 책임은 이용자 본인에게 있습니다. <a href="/disclaimer">자세히 →</a></p>
          </div>
        </div>

        <footer className="foot">
          ONE·HUB · <a href="https://app.one-hub.kr">app.one-hub.kr</a><br />
          주식 · ETF · 부동산을 AI가 함께 운영하는 통합 자산관리
        </footer>
      </div>

      <style jsx>{`
        .wc { min-height: 100vh; background: #F4F8FF; color: #12213B;
          font-family: 'Pretendard', -apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif;
          line-height: 1.65; -webkit-font-smoothing: antialiased; }
        .num { font-variant-numeric: tabular-nums; }
        a { color: #2F6BFF; text-decoration: none; }

        .hero { text-align: center; padding: 60px 20px 48px; position: relative; overflow: hidden;
          background: radial-gradient(120% 80% at 50% -10%, #EAF1FF 0%, #F4F8FF 60%); }
        .logo { font-size: 15px; font-weight: 800; letter-spacing: .5px; color: #2F6BFF; margin-bottom: 20px; }
        .logo .dot { opacity: .5; margin: 0 1px; }
        .hero h1 { font-size: clamp(1.9rem, 6.5vw, 2.9rem); font-weight: 800; letter-spacing: -1px;
          line-height: 1.22; margin: 0 0 16px; }
        .hero h1 b { color: #2F6BFF; }
        .lead { font-size: clamp(1rem, 2.6vw, 1.12rem); color: #46566E; margin: 0 auto 26px; max-width: 30em; }
        .cta { display: inline-flex; align-items: center; gap: 8px; background: #2F6BFF; color: #fff;
          font-size: 1rem; font-weight: 800; padding: 14px 28px; border-radius: 999px;
          box-shadow: 0 8px 22px rgba(47,107,255,.28); transition: transform .12s ease; }
        .cta:hover { transform: translateY(-1px); }
        .cta:focus-visible { outline: 3px solid #2F6BFF; outline-offset: 3px; }
        .subcta { display: block; margin-top: 14px; font-size: 0.82rem; color: #8A99B0; }

        .peek { max-width: 360px; margin: 38px auto 0; background: #fff; border: 1px solid #E1E9F5;
          border-radius: 18px; box-shadow: 0 10px 30px rgba(31,63,120,.08); padding: 20px 22px; text-align: left; }
        .peek-top { display: flex; align-items: baseline; justify-content: space-between; }
        .peek-top span { font-size: 0.76rem; font-weight: 700; color: #8A99B0; }
        .peek-top b { font-size: 1.7rem; font-weight: 800; letter-spacing: -.5px; }
        .peek-delta { font-size: 0.82rem; font-weight: 800; color: #0E9E6A; margin: 4px 0 14px; }
        .peek-row { display: flex; align-items: center; gap: 10px; padding: 9px 0; border-top: 1px solid #E1E9F5; }
        .peek-dot { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; }
        .peek-name { font-size: 0.85rem; font-weight: 600; color: #46566E; flex: 1; }
        .peek-val { font-size: 0.85rem; font-weight: 800; }
        .peek-pct { font-size: 0.72rem; color: #8A99B0; min-width: 42px; text-align: right; }

        .sec { max-width: 720px; margin: 0 auto; padding: 46px 20px; }
        .eyebrow { font-size: 0.72rem; font-weight: 800; letter-spacing: 1.5px; text-transform: uppercase;
          color: #2F6BFF; text-align: center; margin-bottom: 8px; }
        .sec h2 { font-size: clamp(1.4rem, 4vw, 1.9rem); font-weight: 800; letter-spacing: -.5px;
          text-align: center; margin: 0 0 8px; }
        .seclead { font-size: 0.98rem; color: #46566E; text-align: center; max-width: 30em; margin: 0 auto 30px; }

        .feats { display: grid; gap: 16px; }
        .feat { background: #fff; border: 1px solid #E1E9F5; border-radius: 18px; padding: 24px;
          box-shadow: 0 10px 30px rgba(31,63,120,.06); }
        .feat-ic { font-size: 1.6rem; margin-bottom: 10px; }
        .feat h3 { font-size: 1.12rem; font-weight: 800; margin: 0 0 8px; letter-spacing: -.3px; }
        .feat p { font-size: 0.9rem; color: #46566E; margin: 0; }
        .tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 14px; }
        .tag { font-size: 0.7rem; font-weight: 700; padding: 4px 9px; border-radius: 7px;
          background: #EAF1FF; color: #2F6BFF; }

        .steps-sec { background: #fff; max-width: none; border-top: 1px solid #E1E9F5; border-bottom: 1px solid #E1E9F5; }
        .steps-sec .eyebrow, .steps-sec h2, .steps-sec .seclead, .steps { max-width: 680px; margin-left: auto; margin-right: auto; }
        .steps { display: grid; gap: 2px; }
        .step { display: grid; grid-template-columns: 44px 1fr; gap: 16px; align-items: start;
          padding: 18px 0; border-top: 1px solid #E1E9F5; }
        .step:first-child { border-top: none; }
        .step-n { width: 36px; height: 36px; border-radius: 50%; background: #2F6BFF; color: #fff;
          font-weight: 800; font-size: 1rem; display: flex; align-items: center; justify-content: center; }
        .step h4 { font-size: 1.02rem; font-weight: 800; margin: 4px 0 4px; }
        .step p { font-size: 0.88rem; color: #46566E; margin: 0; }
        .hint { font-size: 0.78rem; color: #8A99B0; margin-top: 4px; }

        .tabs { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; }
        .tabcard { background: #fff; border: 1px solid #E1E9F5; border-radius: 14px; padding: 18px 16px;
          text-align: center; box-shadow: 0 10px 30px rgba(31,63,120,.06); }
        .tic { font-size: 1.5rem; }
        .tabcard b { display: block; font-size: 0.92rem; font-weight: 800; margin: 8px 0 4px; }
        .tabcard span { font-size: 0.78rem; color: #46566E; }

        .trust { background: #EAF1FF; border-radius: 18px; padding: 26px 24px; text-align: center; }
        .trust h3 { font-size: 1.15rem; font-weight: 800; margin: 0 0 8px; }
        .trust p { font-size: 0.9rem; color: #46566E; margin: 0 auto; max-width: 34em; }

        .finalcta { text-align: center; }
        .finalcta h2 { margin-bottom: 20px; }

        .legal { padding: 30px 20px 10px; max-width: 720px; margin: 0 auto; }
        .legal-box { background: #FEF3C7; border: 1px solid rgba(180,83,9,.3); border-radius: 14px; padding: 18px 20px; }
        .legal-box b { color: #B45309; }
        .legal-box p { font-size: 0.8rem; color: #46566E; margin: 0; line-height: 1.7; }
        .foot { text-align: center; padding: 24px 20px 48px; color: #8A99B0; font-size: 0.78rem; }

        @media (min-width: 560px) { .tabs { grid-template-columns: repeat(4, 1fr); } }
      `}</style>
    </>
  );
}

// [P2] 로그인 전 무료 ONE Score 체험 — 지역·단지 선택 → 국토부 실거래 기반 채점.
function FreeScoreWidget() {
  const [regions, setRegions] = useState([]);
  const [region, setRegion] = useState("서현동");
  const [complexes, setComplexes] = useState([]);
  const [complex, setComplex] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    fetch("/api/score-preview?kind=regions").then((r) => r.json()).then((d) => {
      if (d.ok && d.regions.length) setRegions(d.regions);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    setComplexes([]); setComplex(""); setResult(null);
    fetch(`/api/score-preview?kind=complexes&region=${encodeURIComponent(region)}`)
      .then((r) => r.json()).then((d) => { if (d.ok) setComplexes(d.complexes); }).catch(() => {});
  }, [region]);

  async function score() {
    if (!complex) { setErr("단지를 선택해 주세요"); return; }
    setLoading(true); setErr(""); setResult(null);
    try {
      const d = await fetch(
        `/api/score-preview?kind=score&complex=${encodeURIComponent(complex)}&region=${encodeURIComponent(region)}&area=84`
      ).then((r) => r.json());
      if (d.ok) setResult(d); else setErr(d.error || "채점할 수 없습니다");
    } catch (e) { setErr("일시적으로 채점할 수 없습니다"); } finally { setLoading(false); }
  }

  const under = result && result.diff_pct != null && result.diff_pct < 0;
  const comps = result && result.components ? Object.entries(result.components) : [];

  return (
    <section className="fs">
      <div className="fs-inner">
        <div className="fs-eyebrow">로그인 없이 · 5초 체험</div>
        <h2 className="fs-title">내 단지, 지금 <b>무료로 채점</b>해 보세요</h2>
        <p className="fs-lead">국토부 실거래가로 계산한 ONE Score와 저평가율을 바로 확인합니다.</p>

        <div className="fs-form">
          <select value={region} onChange={(e) => setRegion(e.target.value)} aria-label="지역">
            {(regions.length ? regions : ["서현동"]).map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <select value={complex} onChange={(e) => setComplex(e.target.value)} aria-label="단지">
            <option value="">단지 선택</option>
            {complexes.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <button onClick={score} disabled={loading}>{loading ? "채점 중…" : "무료 채점"}</button>
        </div>
        {err && <div className="fs-err">{err}</div>}

        {result && (
          <div className="fs-result">
            <div className="fs-r-top">
              <div className="fs-r-name">{result.complex} <span>전용 {result.area}㎡</span></div>
              <div className={`fs-r-badge ${under ? "u" : "n"}`}>{result.valuation || result.decision}</div>
            </div>
            <div className="fs-r-score">
              <div className="fs-r-num">{Math.round(result.one_score)}<small>/100</small></div>
              <div className="fs-r-meta">
                <div className="fs-r-decision">{result.decision}</div>
                {result.diff_pct != null && (
                  <div className={`fs-r-gap ${under ? "u" : "o"}`}>
                    {under ? `저평가 ${Math.abs(Math.round(result.diff_pct))}%` : `고평가 ${Math.abs(Math.round(result.diff_pct))}%`}
                  </div>
                )}
              </div>
            </div>
            {result.reason && <p className="fs-r-reason">{result.reason}</p>}
            {comps.length > 0 && (
              <div className="fs-r-comps">
                {comps.map(([k, v]) => (
                  <div className="fs-r-comp" key={k}>
                    <span className="fs-r-ck">{k}</span>
                    <span className="fs-r-cbar"><i style={{ width: `${Math.max(0, Math.min(100, v))}%` }} /></span>
                    <span className="fs-r-cv">{Math.round(v)}</span>
                  </div>
                ))}
              </div>
            )}
            <a className="fs-cta" href="/pwa">관심단지로 등록하고 저평가 알림 받기 →</a>
            <p className="fs-disc">※ 국토부 실거래 기반 참고용 점수입니다. 투자자문이 아니며 투자 판단·책임은 본인에게 있습니다.</p>
          </div>
        )}

        {!result && <p className="fs-hint">가입하면 관심단지를 저장하고, 저평가 기준을 넘을 때 <b>알림</b>을 받을 수 있어요.</p>}
      </div>

      <style jsx>{`
        .fs { padding: 8px 20px 8px; }
        .fs-inner { max-width: 520px; margin: 0 auto; background: var(--surface); border: 1px solid var(--line);
          border-radius: 20px; padding: 26px 24px; box-shadow: var(--shadow); text-align: center; }
        .fs-eyebrow { font-size: 0.72rem; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; color: var(--brand); margin-bottom: 8px; }
        .fs-title { font-size: 1.35rem; font-weight: 800; letter-spacing: -.5px; margin: 0 0 6px; }
        .fs-title b { color: var(--brand); }
        .fs-lead { font-size: 0.88rem; color: var(--ink-2); margin: 0 0 18px; }
        .fs-form { display: grid; grid-template-columns: 1fr 1.3fr auto; gap: 8px; }
        .fs-form select, .fs-form button { font-size: 0.9rem; font-family: inherit; border-radius: 10px; padding: 11px 12px; border: 1px solid var(--line); }
        .fs-form select { background: var(--bg); color: var(--ink); }
        .fs-form button { background: var(--brand); color: #fff; font-weight: 800; border: none; cursor: pointer; white-space: nowrap; }
        .fs-form button:disabled { opacity: .6; }
        .fs-err { margin-top: 12px; font-size: 0.84rem; color: var(--warn); }
        .fs-hint { margin: 14px 0 0; font-size: 0.8rem; color: var(--ink-3); }
        .fs-result { margin-top: 18px; border-top: 1px solid var(--line); padding-top: 18px; text-align: left; }
        .fs-r-top { display: flex; align-items: center; justify-content: space-between; }
        .fs-r-name { font-size: 1rem; font-weight: 800; }
        .fs-r-name span { font-size: 0.78rem; color: var(--ink-3); font-weight: 600; }
        .fs-r-badge { font-size: 0.74rem; font-weight: 800; padding: 4px 10px; border-radius: 8px; }
        .fs-r-badge.u { background: var(--up-soft); color: var(--up); }
        .fs-r-badge.n { background: var(--brand-soft); color: var(--brand); }
        .fs-r-score { display: flex; align-items: baseline; gap: 16px; margin: 12px 0 8px; }
        .fs-r-num { font-size: 2.6rem; font-weight: 800; letter-spacing: -1px; line-height: 1; color: var(--brand); font-variant-numeric: tabular-nums; }
        .fs-r-num small { font-size: 1rem; color: var(--ink-3); font-weight: 700; }
        .fs-r-decision { font-size: 0.95rem; font-weight: 800; }
        .fs-r-gap { font-size: 0.82rem; font-weight: 800; margin-top: 2px; }
        .fs-r-gap.u { color: var(--up); } .fs-r-gap.o { color: var(--warn); }
        .fs-r-reason { font-size: 0.84rem; color: var(--ink-2); line-height: 1.6; margin: 6px 0 14px; }
        .fs-r-comps { display: grid; gap: 7px; margin-bottom: 16px; }
        .fs-r-comp { display: grid; grid-template-columns: 70px 1fr 28px; align-items: center; gap: 8px; }
        .fs-r-ck { font-size: 0.76rem; color: var(--ink-2); font-weight: 700; }
        .fs-r-cbar { height: 7px; background: var(--line); border-radius: 4px; overflow: hidden; }
        .fs-r-cbar i { display: block; height: 100%; background: var(--brand); border-radius: 4px; }
        .fs-r-cv { font-size: 0.76rem; font-weight: 800; text-align: right; color: var(--ink-2); font-variant-numeric: tabular-nums; }
        .fs-cta { display: block; text-align: center; background: var(--brand); color: #fff; font-weight: 800; font-size: 0.92rem;
          padding: 13px; border-radius: 12px; text-decoration: none; box-shadow: 0 8px 22px rgba(47,107,255,.24); }
        .fs-disc { font-size: 0.72rem; color: var(--ink-3); line-height: 1.55; margin: 12px 0 0; }
        @media (max-width: 460px) { .fs-form { grid-template-columns: 1fr 1fr; } .fs-form button { grid-column: 1 / -1; } }
      `}</style>
    </section>
  );
}
