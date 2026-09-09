// [S32-3/4/9] 주간 리포트 녹화용 한 화면 — 다섯 블록을 순서대로 하나씩. 운영자 전용.
//   준비(비녹화): 블록③ 후보 고르기 + 경고 + 제목3안·챕터·설명 + 복사/다운로드/게시.
//   녹화(?record=1): 헤더·하단탭·애니메이션·배지 끔, 다크 고정, 글자 1.4배. ?guide=1 이면 16:9 세이프 가이드.
import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import { buildWeeklyScript, buildWeeklyMeta } from "../../lib/episodeDraft";
import { getVerdictScorecard } from "../../lib/verdictStats";
import { getTrader } from "../../lib/trader";

const CHOSEN_KEY = "onehub_weekly_chosen3";

export default function WeeklyReport() {
  const router = useRouter();
  const record = router.query.record === "1";
  const guide = router.query.guide === "1";
  const [allowed, setAllowed] = useState(null); // null=확인중 | true | false
  const [digest, setDigest] = useState(undefined); // undefined=로딩 | null=없음 | {}
  const [idx, setIdx] = useState(0);
  const [chosen, setChosen] = useState([]);
  const [copied, setCopied] = useState(false);
  const touchX = useRef(null);

  // 운영자 확인(미들웨어가 이미 막지만 클라에서도 확인 → 비관리자는 /pwa/today)
  useEffect(() => {
    let dead = false;
    fetch("/api/auth/me").then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (dead) return;
      const ok = !!(d && d.authenticated && d.user && d.user.role === "admin");
      setAllowed(ok);
      if (!ok) router.replace("/pwa/today");
    }).catch(() => { if (!dead) { setAllowed(false); router.replace("/pwa/today"); } });
    return () => { dead = true; };
  }, [router]);

  // 녹화 모드: 다크 고정(시스템 추종 끄기). 해제 시 원복.
  useEffect(() => {
    if (!record) return;
    const root = document.documentElement;
    const prev = root.getAttribute("data-theme");
    root.setAttribute("data-theme", "dark");
    return () => { if (prev) root.setAttribute("data-theme", prev); };
  }, [record]);

  useEffect(() => { try { const c = JSON.parse(localStorage.getItem(CHOSEN_KEY) || "[]"); if (Array.isArray(c)) setChosen(c); } catch (e) {} }, []);

  useEffect(() => {
    if (allowed !== true) return;
    let dead = false;
    const url = `/api/weekly/digest${record ? "?record=1" : ""}`;
    fetch(url).then((r) => r.json()).then((d) => { if (!dead) setDigest(d && d.ok ? (d.digest || null) : null); })
      .catch(() => { if (!dead) setDigest(null); });
    return () => { dead = true; };
  }, [allowed, record]);

  // 심판석(로컬)에서 블록③ 검증 후보(놓친 수익·피한 손실)를 덧붙인다 — 서버는 localStorage 를 못 본다(S30-5).
  const extraCandidates = (() => {
    try {
      const sc = getVerdictScorecard(getTrader(), { days: 7 });
      const out = [];
      if (sc && sc.avoidedCount > 0) out.push({ text: `관망이 정답이었던 판단 ${sc.avoidedCount}건 · 평균 ${sc.avoidedAvg}% 손실을 피했습니다` });
      if (sc && sc.missedCount > 0) out.push({ text: `관망했는데 오른 종목 ${sc.missedCount}건 · 평균 ${sc.missedAvg}%를 놓쳤습니다` });
      return out;
    } catch (e) { return []; }
  })();

  const script = digest ? buildWeeklyScript(digest, { chosen3: chosen, extraCandidates }) : null;
  const meta = digest ? buildWeeklyMeta(digest, { chosen3: chosen }) : null;
  const blocks = script ? script.blocks : [];
  const cur = blocks[idx];

  const go = useCallback((delta) => setIdx((i) => Math.max(0, Math.min(4, i + delta))), []);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "ArrowRight") go(1); else if (e.key === "ArrowLeft") go(-1); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  const toggleCand = (text) => {
    setChosen((prev) => {
      const next = prev.includes(text) ? prev.filter((x) => x !== text) : [...prev, text];
      try { localStorage.setItem(CHOSEN_KEY, JSON.stringify(next)); } catch (e) {}
      return next;
    });
  };

  const fullMarkdown = () => {
    if (!script || !meta) return "";
    const lines = [`# ${meta.titles[0]}`, "", `주차 ${digest.week} · ${digest.range}`, ""];
    script.blocks.forEach((b) => {
      lines.push(`## ${b.n}. ${b.title} (${b.targetSec}초)`, "", b.text || "(비어 있음)", "");
    });
    lines.push("---", "", "### 제목 3안");
    meta.titles.forEach((t) => lines.push(`- ${t}`));
    lines.push("", "### 챕터"); meta.chapters.forEach((c) => lines.push(c));
    lines.push("", "### 설명란", meta.description);
    if (script.warnings.length) { lines.push("", "### ⚠️ 확인 필요"); script.warnings.forEach((w) => lines.push(`- ${w}`)); }
    return lines.join("\n");
  };

  const copyAll = async () => {
    const md = fullMarkdown();
    try { await navigator.clipboard.writeText(md); } catch (e) {
      try { const ta = document.createElement("textarea"); ta.value = md; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); document.body.removeChild(ta); } catch (e2) {}
    }
    setCopied(true); setTimeout(() => setCopied(false), 1500);
  };
  const downloadMd = () => {
    const md = fullMarkdown();
    const wk = (digest.week || "week").replace(/^\d{4}-W/, "");
    try {
      const blob = new Blob([md], { type: "text/markdown" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `weekly-${wk}.md`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
    } catch (e) {}
  };
  // [S32-9] 이야기 탭 게시본(읽는 요약) — 블록 ①·②·⑤만, 300자 내외. 마스킹은 API 가 이미 적용(?record).
  const readingSummary = () => {
    if (!script) return "";
    const pick = (n) => (script.blocks.find((b) => b.n === n)?.text || "").replace(/\n+/g, " ").trim();
    return [pick(1), pick(2), pick(5)].filter(Boolean).join("\n\n").slice(0, 320);
  };

  if (allowed === false) return null;
  if (allowed === null || digest === undefined) {
    return <div className="wr-load">불러오는 중…<style jsx>{`.wr-load{padding:40px;text-align:center;color:var(--color-ink-3);font-family:var(--font-sans)}`}</style></div>;
  }

  const empty = digest === null || !blocks.length;

  return (
    <>
      <Head><title>주간 리포트{record ? " · 녹화" : ""}</title><meta name="robots" content="noindex" /></Head>
      <div className={`wr ${record ? "rec" : ""}`}>
        {guide && record && <div className="wr-guide" aria-hidden="true" />}

        {!record && (
          <div className="wr-top">
            <span className="wr-week">주간 리포트 · {digest?.week || "-"}</span>
            <span className="wr-range">{digest?.range || ""}</span>
            <button className="wr-recbtn" onClick={() => router.push("/pwa/weekly-report?record=1")}>녹화 모드 →</button>
          </div>
        )}

        {empty ? (
          <div className="wr-empty">이번 주는 만든 게 없습니다 — 만든 게 없는 주도 정상입니다.</div>
        ) : (
          <>
            {/* 블록 뷰어 */}
            <section className="wr-stage" onTouchStart={(e) => { touchX.current = e.touches[0].clientX; }}
              onTouchEnd={(e) => { if (touchX.current == null) return; const dx = e.changedTouches[0].clientX - touchX.current; if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1); touchX.current = null; }}>
              <div className="wr-blockhead">
                <span className="wr-bn">{cur.n}</span>
                <span className="wr-bt">{cur.title}</span>
                <span className="wr-bsec">{cur.targetSec}초</span>
              </div>

              {cur.n === 3 && !record ? (
                <div className="wr-cands">
                  <div className="wr-cands-h">후보에서 고르세요 — 이 블록은 자동으로 쓰지 않습니다(시리즈의 심장).</div>
                  {(cur.candidates || []).length === 0 && <div className="wr-cands-none">이번 주 후보가 없습니다. 직접 입력으로 추가하세요.</div>}
                  {(cur.candidates || []).map((c, i) => (
                    <label className={`wr-cand ${chosen.includes(c) ? "on" : ""}`} key={i}>
                      <input type="checkbox" checked={chosen.includes(c)} onChange={() => toggleCand(c)} />
                      <span>{c}</span>
                    </label>
                  ))}
                  {chosen.length > 0 && (
                    <div className="wr-skel"><b>고른 항목 뼈대</b>{"\n"}{cur.text}</div>
                  )}
                </div>
              ) : (
                <pre className="wr-script">{cur.text || (cur.n === 3 ? "③ 후보에서 골라 살을 붙이세요." : "(이번 주 이 블록은 비어 있습니다)")}</pre>
              )}

              {cur.warnings && cur.warnings.length > 0 && !record && (
                <div className="wr-warn">{cur.warnings.map((w, i) => <div key={i}>⚠ {w}</div>)}</div>
              )}
            </section>

            {/* 진행 표시 + 이동 */}
            <div className="wr-nav">
              <button className="wr-arrow" onClick={() => go(-1)} disabled={idx === 0} aria-label="이전 블록">←</button>
              <div className="wr-dots">{blocks.map((b, i) => <span key={i} className={`wr-dot ${i === idx ? "on" : ""}`} />)}</div>
              <button className="wr-arrow" onClick={() => go(1)} disabled={idx === 4} aria-label="다음 블록">→</button>
            </div>

            {/* 준비 패널(비녹화) — 제목·챕터·설명·발행 */}
            {!record && meta && (
              <section className="wr-prep">
                {script.warnings.length > 0 && (
                  <div className="wr-prep-warn"><b>확인 필요 {script.warnings.length}건</b>{script.warnings.map((w, i) => <div key={i}>· {w}</div>)}</div>
                )}
                <div className="wr-prep-b"><div className="wr-prep-h">제목 3안 <span>서로 다른 블록에서</span></div>{meta.titles.map((t, i) => <div className="wr-title" key={i}>{i + 1}. {t}</div>)}</div>
                <div className="wr-prep-b"><div className="wr-prep-h">챕터</div><pre className="wr-mono">{meta.chapters.join("\n")}</pre></div>
                <div className="wr-prep-b"><div className="wr-prep-h">설명란</div><pre className="wr-mono wr-desc">{meta.description}</pre></div>
                <div className="wr-actions">
                  <button className="wr-act primary" onClick={copyAll}>{copied ? "복사됨 ✓" : "대본 전체 복사"}</button>
                  <button className="wr-act" onClick={downloadMd}>.md 다운로드</button>
                </div>
                <div className="wr-prep-b"><div className="wr-prep-h">이야기 탭 게시본 <span>읽는 요약 · ①②⑤</span></div><pre className="wr-mono wr-read">{readingSummary()}</pre>
                  <div className="wr-readnote">S29 주간 회차 자리에 이 요약을 올립니다. 게시본에도 마스킹이 적용됩니다(녹화 모드로 열면 마스킹된 값). 실제 게시는 <code>content/episodes/</code> 회차로 커밋합니다.</div>
                </div>
              </section>
            )}
          </>
        )}
      </div>

      <style jsx>{`
        .wr { max-width: 560px; margin: 0 auto; padding: 12px 16px 40px; font-family: var(--font-sans); color: var(--color-ink); min-height: 100vh; background: var(--color-bg); }
        .wr.rec { max-width: 900px; padding: 40px; font-size: 1.4em; min-height: 100vh; }
        .wr-guide { position: fixed; inset: 5.5% 3%; border: 2px dashed rgba(255,255,255,.4); border-radius: 8px; pointer-events: none; z-index: 50; }
        .wr-top { display: flex; align-items: baseline; gap: 10px; margin-bottom: 14px; flex-wrap: wrap; }
        .wr-week { font-size: var(--fs-4); font-weight: 800; }
        .wr-range { font-size: var(--fs-1); color: var(--color-ink-3); }
        .wr-recbtn { margin-left: auto; border: 1px solid var(--color-primary); background: var(--color-primary); color: var(--color-on-primary, #fff); border-radius: var(--radius-sm); padding: 7px 13px; font-size: var(--fs-2); font-weight: 700; font-family: var(--font-sans); cursor: pointer; }
        .wr-empty { padding: 60px 20px; text-align: center; color: var(--color-ink-2); font-size: var(--fs-3); line-height: 1.6; word-break: keep-all; }
        .wr-stage { background: var(--color-card); border: 1px solid var(--color-line); border-radius: var(--radius-card); padding: 20px; box-shadow: var(--shadow-card); }
        .wr.rec .wr-stage { background: var(--color-card); border: none; box-shadow: none; min-height: 60vh; }
        .wr-blockhead { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; }
        .wr-bn { width: 30px; height: 30px; flex: none; display: grid; place-items: center; border-radius: 8px; background: var(--color-primary-soft); color: var(--color-primary); font-weight: 800; }
        .wr-bt { font-size: var(--fs-4); font-weight: 800; }
        .wr-bsec { margin-left: auto; font-family: var(--font-mono, monospace); font-size: var(--fs-1); color: var(--color-ink-3); border: 1px solid var(--color-line); border-radius: 999px; padding: 2px 9px; }
        .wr-script { white-space: pre-wrap; word-break: keep-all; font-family: var(--font-sans); font-size: var(--fs-4); line-height: 1.7; color: var(--color-ink); margin: 0; }
        .wr.rec .wr-script { font-size: 1.15em; line-height: 1.8; }
        .wr-cands-h { font-size: var(--fs-2); font-weight: 700; color: var(--color-ink-2); margin-bottom: 10px; word-break: keep-all; }
        .wr-cands-none { font-size: var(--fs-2); color: var(--color-ink-3); }
        .wr-cand { display: flex; gap: 10px; align-items: flex-start; padding: 10px 11px; border: 1px solid var(--color-line); border-radius: 10px; margin-bottom: 7px; cursor: pointer; font-size: var(--fs-3); line-height: 1.5; word-break: keep-all; }
        .wr-cand.on { border-color: var(--color-primary); background: var(--color-primary-soft); }
        .wr-cand input { margin-top: 3px; flex: none; }
        .wr-skel { white-space: pre-wrap; margin-top: 10px; padding: 12px; background: var(--color-card-soft); border-radius: 10px; font-size: var(--fs-2); line-height: 1.6; color: var(--color-ink-2); }
        .wr-skel b { display: block; color: var(--color-ink); margin-bottom: 6px; }
        .wr-warn { margin-top: 12px; font-size: var(--fs-1); color: var(--color-warning-ink, var(--color-warning)); background: var(--color-warning-soft); border-radius: 8px; padding: 8px 11px; line-height: 1.5; word-break: keep-all; }
        .wr-nav { display: flex; align-items: center; justify-content: center; gap: 18px; margin: 18px 0; }
        .wr-arrow { width: 42px; height: 42px; border-radius: 50%; border: 1px solid var(--color-line); background: var(--color-card); color: var(--color-ink); font-size: 18px; cursor: pointer; }
        .wr-arrow:disabled { opacity: .35; }
        .wr-dots { display: flex; gap: 9px; }
        .wr-dot { width: 9px; height: 9px; border-radius: 50%; background: var(--color-line); }
        .wr-dot.on { background: var(--color-primary); }
        .wr-prep { margin-top: 8px; display: flex; flex-direction: column; gap: 14px; }
        .wr-prep-warn { font-size: var(--fs-1); color: var(--color-warning-ink, var(--color-warning)); background: var(--color-warning-soft); border-radius: 10px; padding: 11px 13px; line-height: 1.6; word-break: keep-all; }
        .wr-prep-b { background: var(--color-card); border: 1px solid var(--color-line); border-radius: var(--radius-card); padding: 14px 16px; }
        .wr-prep-h { font-size: var(--fs-3); font-weight: 800; margin-bottom: 8px; display: flex; align-items: baseline; gap: 8px; }
        .wr-prep-h span { font-size: var(--fs-1); font-weight: 600; color: var(--color-ink-3); }
        .wr-title { font-size: var(--fs-3); color: var(--color-ink); line-height: 1.6; padding: 4px 0; word-break: keep-all; }
        .wr-mono { white-space: pre-wrap; word-break: break-word; font-family: var(--font-mono, monospace); font-size: var(--fs-2); line-height: 1.6; color: var(--color-ink-2); margin: 0; }
        .wr-desc, .wr-read { background: var(--color-card-soft); border-radius: 8px; padding: 10px; }
        .wr-readnote { margin-top: 8px; font-size: var(--fs-1); color: var(--color-ink-3); line-height: 1.5; word-break: keep-all; }
        .wr-readnote code { font-family: var(--font-mono, monospace); }
        .wr-actions { display: flex; gap: 10px; }
        .wr-act { flex: 1; border: 1px solid var(--color-line); background: var(--color-card); color: var(--color-ink); border-radius: var(--radius-sm); padding: 11px; font-size: var(--fs-3); font-weight: 700; font-family: var(--font-sans); cursor: pointer; }
        .wr-act.primary { border-color: var(--color-primary); background: var(--color-primary); color: var(--color-on-primary, #fff); }
      `}</style>
    </>
  );
}
