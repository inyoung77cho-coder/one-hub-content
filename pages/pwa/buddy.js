// [S51-3] 버니 AI 비서 — /pwa/buddy (운영자 계정 전용, 다른 곳에서 링크하지 않는다).
//   ① 동의(처음 한 번) → ② 오늘 화면: 자산 현황(기기 계산) · 오늘의 흐름 1~4건(버니) · 버니에게 자료 주기.
//   엔진: /api/ops/buddy/daily(작업 시작) → /api/ops/buddy/job?id=(상태 조회). 서버는 아무것도 저장하지 않는다.
//
//   ★숫자: 자산 금액·증감은 lib/buddyFacts(원장 breakdown·getDelta)가 만든 값만 화면에 그린다. 버니 문장 속 숫자도
//    엔진 규칙상 facts 의 숫자만 쓰지만, 화면의 '자산 현황' 칸은 버니 응답과 무관하게 기기 값으로 그린다.
//   ★실패는 실패로: 생성 실패 시 [다시] + 이유. 자산 현황 칸은 그대로 보인다. 가짜 흐름·가짜 문장을 만들지 않는다.
//   ★읽어 주기: [브리핑 듣기] 탭에서 만든 Audio 요소 하나를 재사용(S49 와 같은 이유 — iOS 자동재생). 자동 재생 없음.
//   ★동의 전에는 어떤 것도 서버로 보내지 않는다(사실표 계산은 기기 안에서만).
//   3단계(질문·조사·피드백)·4단계(어제 이후)는 이 화면에 아직 그리지 않는다.
import { useCallback, useEffect, useRef, useState } from "react";
import Head from "next/head";
import AppHeader from "../../components/AppHeader";
import BottomNav from "../../components/BottomNav";
import TutorBunny from "../../components/TutorBunny";
import { getTrader } from "../../lib/trader";
import { loadFacts } from "../../lib/buddyFacts";
import { ukWords } from "../../lib/briefingScript";
import { getConsent, setConsent, revokeConsent, todayKst, getDay, saveResult, patchDay, addNote, removeNote } from "../../lib/buddyStore";

const TEACHER_KEY = "onehub_tutor_teacher"; // S49 선생님 선택을 그대로 따른다
const POLL_MS = 3000;
const POLL_MAX_MS = 6 * 60 * 1000;
const AUDIO_START_GUARD_MS = 15000;
const JOB_RESUME_MS = 50 * 60 * 1000; // 엔진은 작업 결과를 1시간 보관 — 그보다 짧게만 이어 받는다

const CLASS_KO = { stock: "주식", etf: "ETF", realestate: "부동산", cash: "현금", pension: "연금" };
const ERR_KO = {
  buddy_key_missing: "서버 연결 키가 설정되지 않았습니다(Vercel 환경변수 ENGLISH_ADMIN_KEY).",
  buddy_disabled: "엔진 쪽 키가 설정되지 않았습니다.",
  unauthorized: "엔진이 연결 키를 거부했습니다.",
  forbidden: "운영자 계정만 쓸 수 있습니다.",
  llm_unavailable: "AI 모델을 쓸 수 없는 상태입니다.",
  llm_failed: "버니가 정리하지 못했습니다.",
  busy: "다른 정리가 진행 중입니다. 잠시 후 다시 눌러 주세요.",
  proxy_failed: "엔진에 연결하지 못했습니다.",
  job_not_found: "진행 중이던 작업을 찾지 못했습니다(엔진 재시작 등).",
  timeout: "정리가 너무 오래 걸려 멈췄습니다.",
  network: "네트워크 연결이 끊겼습니다.",
};
const errKo = (c) => ERR_KO[c] || `알 수 없는 오류(${c || "?"})`;
const WARN_KO = {
  PENSION_UNAVAILABLE: "연금 잔액", FX_UNAVAILABLE: "환율", BACKEND_UNAVAILABLE: "서버 자료", ETF_PRICE_MISSING: "일부 ETF 시세",
  SUSPECT_PRICE: "의심 시세", SYNC_PENDING: "기기 동기화", DUPLICATE_WITH_KIS: "중복 종목", AVG_PRICE_OUT_OF_RANGE: "평단 범위",
  LEDGER_UNAVAILABLE: "자산 원장", HOLDINGS_UNAVAILABLE: "보유 종목",
};

let _silentUrl = null;
function silentUrl() {
  if (_silentUrl) return _silentUrl;
  const n = 800, buf = new ArrayBuffer(44 + n), v = new DataView(buf);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, "RIFF"); v.setUint32(4, 36 + n, true); w(8, "WAVE"); w(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, 8000, true); v.setUint32(28, 8000, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true);
  w(36, "data"); v.setUint32(40, n, true);
  for (let i = 0; i < n; i++) v.setUint8(44 + i, 128);
  _silentUrl = URL.createObjectURL(new Blob([buf], { type: "audio/wav" }));
  return _silentUrl;
}

// 읽는 문장 → 어느 카드인지(엔진이 매핑을 주지 않으므로 제목 낱말 겹침으로 추정). 못 찾으면 null.
function topicOfSentence(sentence, topics) {
  const words = (t) => String(t || "").split(/[\s·,.'"“”‘’()]+/).filter((w) => w.length >= 2);
  let best = null, bestN = 1;
  (topics || []).forEach((t, i) => {
    const n = words(t.title).filter((w) => sentence.includes(w)).length;
    if (n > bestN) { best = i; bestN = n; }
  });
  return best;
}

const signUk = (v) => (v > 0 ? "+" : v < 0 ? "−" : "") + ukWords(Math.abs(v));
function deltaWord(delta) {
  if (!delta) return "";
  return delta.days === 1 ? "어제보다" : `${delta.days}일 전보다`;
}

export default function BuddyPage() {
  const [allowed, setAllowed] = useState(null);
  const [consent, setConsentState] = useState(null);
  const [trader, setTrader] = useState("");
  const [teacher, setTeacher] = useState("boy");
  const [today] = useState(() => todayKst());

  const [factsState, setFactsState] = useState("idle"); // idle|load|ok|error
  const [facts, setFacts] = useState(null);
  const [gen, setGen] = useState({ state: "idle", stage: "", error: "" }); // idle|run|done|failed
  const [result, setResult] = useState(null);
  const [savedAt, setSavedAt] = useState("");
  const [notes, setNotes] = useState([]);
  const [noteText, setNoteText] = useState("");
  const [noteUrl, setNoteUrl] = useState("");

  const [reading, setReading] = useState(false);
  const [talking, setTalking] = useState(false);
  const [subtitle, setSubtitle] = useState("");
  const [activeTopic, setActiveTopic] = useState(null);
  const [audioErr, setAudioErr] = useState(false);

  const audioRef = useRef(null);
  const queueRef = useRef([]);
  const readingRef = useRef(false);
  const guardRef = useRef(null);
  const pollRef = useRef(0); // 폴링 세대 — 새 생성·언마운트 시 이전 폴링 중단

  // 운영자 확인(미들웨어 /api/ops 가 이미 막지만 화면도 확인 — 비관리자에게는 아무것도 보내지 않는다)
  useEffect(() => {
    let dead = false;
    fetch("/api/auth/me").then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (!dead) setAllowed(!!(d && d.authenticated && d.user && d.user.role === "admin"));
    }).catch(() => { if (!dead) setAllowed(false); });
    return () => { dead = true; pollRef.current += 1; };
  }, []);

  useEffect(() => {
    setConsentState(getConsent());
    setTrader(getTrader());
    try { const t = localStorage.getItem(TEACHER_KEY); if (t === "boy" || t === "girl") setTeacher(t); } catch (e) {}
  }, []);

  // 그날 저장된 결과·자료 복원
  useEffect(() => {
    if (!trader) return;
    const d = getDay(trader, today);
    if (d?.result) { setResult(d.result); setSavedAt(d.at || ""); setGen({ state: "done", stage: "", error: "" }); }
    setNotes(d?.notes || []);
  }, [trader, today]);

  // 사실표 — 기기 안에서만 계산(동의와 무관하게 화면 표시용으로 계산하되, 서버 전송은 동의 후에만)
  const calcFacts = useCallback(async () => {
    if (!trader) return null;
    setFactsState("load");
    try {
      const { facts: f } = await loadFacts(trader);
      setFacts(f);
      setFactsState(f.head_uk == null ? "error" : "ok");
      return f;
    } catch (e) {
      setFactsState("error");
      return null;
    }
  }, [trader]);
  useEffect(() => { if (allowed && trader) calcFacts(); }, [allowed, trader, calcFacts]);

  // ── 작업 폴링 ──
  const poll = useCallback(async (jobId, headUk) => {
    const gen0 = ++pollRef.current;
    const t0 = Date.now();
    while (gen0 === pollRef.current) {
      if (Date.now() - t0 > POLL_MAX_MS) { setGen({ state: "failed", stage: "", error: "timeout" }); patchDay(trader, today, { job: null }); return; }
      await new Promise((r) => setTimeout(r, POLL_MS));
      if (gen0 !== pollRef.current) return;
      let r, j;
      try {
        r = await fetch(`/api/ops/buddy/job?id=${jobId}`);
        j = await r.json().catch(() => ({}));
      } catch (e) { continue; } // 일시적 네트워크 끊김은 다음 주기에 다시
      if (!r.ok) { setGen({ state: "failed", stage: "", error: j?.error || `http_${r.status}` }); patchDay(trader, today, { job: null }); return; }
      if (j.state === "running") { setGen({ state: "run", stage: j.stage || "정리 중", error: "" }); continue; }
      if (j.state === "done" && j.result) {
        const saved = saveResult(trader, today, headUk, j.result);
        patchDay(trader, today, { job: null });
        setResult(j.result); setSavedAt(saved.at || ""); setGen({ state: "done", stage: "", error: "" });
        return;
      }
      setGen({ state: "failed", stage: "", error: j.error || "llm_failed" }); patchDay(trader, today, { job: null });
      return;
    }
  }, [trader, today]);

  // 진행 중이던 작업 이어 받기(화면을 떠났다 돌아온 경우)
  useEffect(() => {
    if (!allowed || !consent || !trader) return;
    const d = getDay(trader, today);
    if (d?.job?.id && !d?.result && Date.now() - Date.parse(d.job.at) < JOB_RESUME_MS) {
      setGen({ state: "run", stage: "정리 중", error: "" });
      poll(d.job.id, d.job.head_uk ?? null);
    }
  }, [allowed, consent, trader, today, poll]);

  const generate = async () => {
    if (!consent || gen.state === "run") return;
    stopReading();
    setGen({ state: "run", stage: "사실표 계산 중", error: "" });
    const f = (await calcFacts()) || facts;
    if (!f) { setGen({ state: "failed", stage: "", error: "facts" }); return; }
    let r, j;
    try {
      r = await fetch("/api/ops/buddy/daily", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: today, facts: f, my_notes: notes, prior: [] }),
      });
      j = await r.json().catch(() => ({}));
    } catch (e) { setGen({ state: "failed", stage: "", error: "network" }); return; }
    if (!r.ok || !j.job_id) { setGen({ state: "failed", stage: "", error: j?.error || `http_${r.status}` }); return; }
    patchDay(trader, today, { job: { id: j.job_id, at: new Date().toISOString(), head_uk: f.head_uk } });
    setGen({ state: "run", stage: "뉴스 수집 중", error: "" });
    poll(j.job_id, f.head_uk);
  };

  // ── 읽어 주기(Audio 하나 재사용) ──
  const clearGuard = () => { if (guardRef.current) { clearTimeout(guardRef.current); guardRef.current = null; } };
  const stopReading = () => {
    clearGuard();
    readingRef.current = false; queueRef.current = [];
    setReading(false); setTalking(false); setActiveTopic(null);
    const a = audioRef.current; if (a) { try { a.pause(); } catch (e) {} }
  };
  const playNext = () => {
    const a = audioRef.current;
    const next = queueRef.current.shift();
    if (!a || !next) { stopReading(); setSubtitle(""); return; }
    setSubtitle(next);
    const ti = topicOfSentence(next, result?.topics);
    if (ti != null) setActiveTopic(ti);
    clearGuard();
    guardRef.current = setTimeout(() => { setAudioErr(true); stopReading(); }, AUDIO_START_GUARD_MS);
    a.src = `/api/english/speak?text=${encodeURIComponent(next)}&language=ko`;
    const p = a.play();
    if (p && p.catch) p.catch((e) => { if (e && e.name === "AbortError") return; setAudioErr(true); stopReading(); });
  };
  const playNextRef = useRef(playNext);
  playNextRef.current = playNext;
  const ensureAudio = () => {
    if (audioRef.current) return audioRef.current;
    const a = new Audio();
    a.preload = "auto";
    a.addEventListener("playing", () => { if (readingRef.current) { clearGuard(); setTalking(true); } });
    a.addEventListener("pause", () => setTalking(false));
    a.addEventListener("waiting", () => setTalking(false));
    a.addEventListener("ended", () => { setTalking(false); if (readingRef.current) playNextRef.current(); });
    a.addEventListener("error", () => { if (readingRef.current) { setAudioErr(true); stopReading(); } });
    audioRef.current = a;
    return a;
  };
  const startReading = () => { // 반드시 탭 핸들러 안에서
    const say = result?.say || [];
    if (!say.length) return;
    const a = ensureAudio();
    try { a.src = silentUrl(); const p = a.play(); if (p && p.catch) p.catch(() => {}); } catch (e) {}
    setAudioErr(false);
    queueRef.current = say.slice();
    readingRef.current = true;
    setReading(true);
    setTimeout(() => playNextRef.current(), 150);
  };
  useEffect(() => () => { readingRef.current = false; clearGuard(); try { audioRef.current?.pause(); } catch (e) {} }, []);

  // ── 자료 주기 ──
  const submitNote = () => {
    const text = noteText.trim(), url = noteUrl.trim();
    if (!text && !url) return;
    const d = addNote(trader, today, { text, url: /^https?:\/\//.test(url) ? url : "" });
    setNotes(d.notes || []); setNoteText(""); setNoteUrl("");
  };
  const dropNote = (i) => { const d = removeNote(trader, today, i); setNotes(d.notes || []); };

  const agree = () => setConsentState(setConsent());
  const revoke = () => { stopReading(); revokeConsent(); setConsentState(null); pollRef.current += 1; };

  const phase = gen.state === "run" ? "think" : talking ? "speak" : "idle";

  if (allowed !== true) {
    return (
      <div className="bd-wrap">
        <Head><title>버니 비서 · ONE-HUB</title><meta name="robots" content="noindex" /></Head>
        <AppHeader />
        <p className="bd-muted pad">{allowed === false ? "운영자 계정만 쓸 수 있습니다." : "확인 중…"}</p>
        <BottomNav />
        <style jsx>{`.bd-wrap{min-height:100vh;background:var(--color-bg)} .pad{padding:24px} .bd-muted{color:var(--color-ink-3);font-size:var(--fs-3)}`}</style>
      </div>
    );
  }

  // 자산 현황(기기 계산값)
  const d = facts?.delta;
  const by = d?.by_class || {};
  const topMove = Object.entries(by).filter(([, v]) => v != null && v !== 0).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))[0];
  const topics = result?.topics || [];

  return (
    <div className="bd-wrap">
      <Head><title>버니 비서 · ONE-HUB</title><meta name="robots" content="noindex" /></Head>
      <AppHeader />
      <main className="bd-main">
        {!consent ? (
          <section className="bd-card">
            <p className="bd-kicker">버니 AI 비서 · 처음 한 번</p>
            <h1 className="bd-title">버니에게 무엇을 보내나요?</h1>
            <p className="bd-lead">버니가 오늘의 흐름을 내 자산과 연결해 설명하려면, 아래 정보를 AI(Anthropic Claude)로 보내야 합니다. 서버는 받은 내용을 저장하지 않고, 결과는 이 기기에만 남습니다.</p>
            <div className="bd-two">
              <div className="bd-box ok">
                <b>보내는 것</b>
                <ul><li>자산군별 금액(억 단위)과 비중, 직전 대비 증감</li><li>보유 종목 이름 · 수익률 · 당일 등락 · 비중</li><li>손절선 이탈 여부 · 조회 실패 항목</li><li>사는 지역(구 이름)</li><li>내가 버니에게 준 자료</li></ul>
              </div>
              <div className="bd-box no">
                <b>보내지 않는 것</b>
                <ul><li>계좌번호 · 보유 수량 · 원 단위 금액</li><li>카카오 계정 정보</li><li>실거주 단지 이름과 동호수</li></ul>
              </div>
            </div>
            <button type="button" className="bd-btn primary big" onClick={agree}>동의하고 시작</button>
            <p className="bd-muted small">동의는 이 화면 아래에서 언제든 철회할 수 있습니다.</p>
          </section>
        ) : (
          <>
            {/* 상단: 버니 + 자막 + 듣기 */}
            <section className="bd-hero">
              <div className="bd-face"><TutorBunny kind={teacher} phase={phase} size={120} /></div>
              <div className="bd-heroR">
                <p className="bd-sub" aria-live="polite">
                  {reading && subtitle ? subtitle
                    : gen.state === "run" ? `버니가 정리하고 있어요 · ${gen.stage || "정리 중"}`
                    : result ? (result.quiet ? "오늘은 따로 짚을 흐름이 없습니다." : `오늘의 흐름 ${topics.length}건을 골랐어요.`)
                    : "오늘의 흐름을 정리해 드릴까요?"}
                </p>
                <div className="bd-row">
                  {result?.say?.length > 0 && (reading
                    ? <button type="button" className="bd-btn ghost" onClick={stopReading}>멈춤</button>
                    : <button type="button" className="bd-btn primary" onClick={startReading}>브리핑 듣기</button>)}
                  {gen.state !== "run" && (
                    <button type="button" className="bd-btn ghost" onClick={generate}>{result ? "다시 정리" : "오늘 정리하기"}</button>
                  )}
                </div>
                {audioErr && <p className="bd-warn">소리를 재생하지 못했어요. 자막과 카드는 그대로 볼 수 있어요.</p>}
              </div>
            </section>

            {/* 자산 현황 — 기기 계산값 */}
            <section className="bd-card">
              <p className="bd-label">자산 현황 · 이 기기에서 계산</p>
              {factsState === "load" && <p className="bd-muted">계산 중…</p>}
              {factsState === "error" && (
                <>
                  <p className="bd-err">자산 원장을 계산하지 못했습니다.</p>
                  <button type="button" className="bd-btn ghost sm" onClick={calcFacts}>다시</button>
                </>
              )}
              {factsState === "ok" && facts && (
                <>
                  <p className="bd-head"><span>{facts.head_label}</span><b>{ukWords(facts.head_uk)}</b></p>
                  {d ? (
                    <p className="bd-delta">{deltaWord(d)} <b className={d.head_uk > 0 ? "up" : d.head_uk < 0 ? "dn" : ""}>{d.head_uk === 0 ? "변동 없음" : signUk(d.head_uk)}</b>
                      {topMove && <> · 가장 많이 움직인 자산 {CLASS_KO[topMove[0]] || topMove[0]} {signUk(topMove[1])}</>}</p>
                  ) : <p className="bd-muted">직전 기록이 없어 증감은 말하지 않습니다.</p>}
                  {facts.warnings.length > 0 && <p className="bd-warn">확인하지 못한 항목: {facts.warnings.map((w) => WARN_KO[w] || w).join(" · ")}</p>}
                </>
              )}
            </section>

            {/* 생성 상태 */}
            {gen.state === "failed" && (
              <section className="bd-card">
                <p className="bd-err">{gen.error === "facts" ? "사실표를 만들지 못해 버니에게 보내지 않았습니다." : errKo(gen.error)}</p>
                <button type="button" className="bd-btn ghost sm" onClick={generate}>다시</button>
              </section>
            )}

            {/* 오늘의 흐름 */}
            {result && (
              <section>
                <p className="bd-label out">오늘의 흐름{savedAt ? ` · ${new Date(savedAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })} 정리` : ""}</p>
                {result.quiet || !topics.length ? (
                  <div className="bd-card"><p className="bd-muted">오늘은 따로 짚을 흐름이 없습니다.</p></div>
                ) : topics.map((t, i) => (
                  <article key={t.id || i} className={`bd-card bd-topic${activeTopic === i ? " on" : ""}`}>
                    <h2 className="bd-ttl">{t.title}</h2>
                    {t.related?.length > 0 && <div className="bd-chips">{t.related.map((r) => <span key={r} className="bd-chip">{r}</span>)}</div>}
                    <dl className="bd-dl">
                      <dt>무슨 일</dt><dd>{t.fact}</dd>
                      <dt>내 자산과의 연결</dt><dd>{t.link}</dd>
                      <dt>버니의 해석 <em>확신 {t.confidence}</em></dt><dd>{t.view}</dd>
                      <dt>반대로 보면</dt><dd>{t.counter}</dd>
                      {t.watch && (<><dt>살펴볼 것</dt><dd>{t.watch}</dd></>)}
                    </dl>
                    {t.sources?.length > 0 && (
                      <ul className="bd-src">
                        {t.sources.map((s, k) => (
                          <li key={k}>{s.url ? <a href={s.url} target="_blank" rel="noopener noreferrer">{s.title || s.url}</a> : <span>{s.title}</span>}{s.at ? <em> · {s.at}</em> : null}</li>
                        ))}
                      </ul>
                    )}
                  </article>
                ))}
              </section>
            )}

            {/* 버니에게 자료 주기 */}
            <section className="bd-card">
              <p className="bd-label">버니에게 자료 주기 · 다음 정리 때 함께 봅니다</p>
              {notes.length > 0 && (
                <ul className="bd-notes">
                  {notes.map((n, i) => (
                    <li key={i}><span>{n.text}{n.url ? ` ${n.url}` : ""}</span><button type="button" className="bd-x" aria-label="자료 지우기" onClick={() => dropNote(i)}>×</button></li>
                  ))}
                </ul>
              )}
              <textarea className="bd-input" rows={3} maxLength={1500} placeholder="기사 요약, 메모, 궁금한 점…" value={noteText} onChange={(e) => setNoteText(e.target.value)} />
              <div className="bd-row">
                <input className="bd-input line" type="url" placeholder="링크(선택)" value={noteUrl} onChange={(e) => setNoteUrl(e.target.value)} />
                <button type="button" className="bd-btn ghost sm" onClick={submitNote} disabled={!noteText.trim() && !noteUrl.trim()}>담기</button>
              </div>
            </section>

            <p className="bd-foot">버니의 해석은 참고용이며 매수·매도를 권하지 않습니다.</p>
            <button type="button" className="bd-revoke" onClick={revoke}>AI 전송 동의 철회</button>
          </>
        )}
      </main>
      <BottomNav />
      <style jsx>{`
        .bd-wrap { min-height: 100vh; background: var(--color-bg); padding-bottom: var(--nav-clearance-fab); }
        .bd-main { max-width: 560px; margin: 0 auto; padding: 12px 14px 40px; display: flex; flex-direction: column; gap: 12px; }
        .bd-card { background: var(--color-card); border: 1px solid var(--color-line); border-radius: var(--radius-md); padding: 16px; box-shadow: var(--shadow-card); }
        .bd-kicker { margin: 0 0 6px; font-size: var(--fs-2); font-weight: 800; color: var(--color-primary); }
        .bd-title { margin: 0 0 8px; font-size: var(--fs-6); font-weight: 800; color: var(--color-ink); word-break: keep-all; }
        .bd-lead { margin: 0 0 12px; font-size: var(--fs-3); line-height: 1.6; color: var(--color-ink-2); word-break: keep-all; }
        .bd-two { display: grid; grid-template-columns: 1fr; gap: 8px; margin-bottom: 14px; }
        .bd-box { border-radius: var(--radius-sm); padding: 10px 12px; border: 1px solid var(--color-line); background: var(--color-card-soft); }
        .bd-box b { font-size: var(--fs-3); font-weight: 800; color: var(--color-ink); }
        .bd-box.ok b { color: var(--color-primary); }
        .bd-box.no b { color: var(--color-danger); }
        .bd-box ul { margin: 6px 0 0; padding-left: 18px; font-size: var(--fs-3); line-height: 1.6; color: var(--color-ink-2); word-break: keep-all; }
        .bd-hero { display: flex; gap: 12px; align-items: center; background: var(--color-card); border: 1px solid var(--color-line); border-radius: var(--radius-md); padding: 12px; box-shadow: var(--shadow-card); }
        .bd-face { flex: 0 0 104px; }
        .bd-heroR { flex: 1 1 auto; min-width: 0; }
        .bd-sub { margin: 0 0 10px; min-height: 48px; font-size: var(--fs-4); font-weight: 700; line-height: 1.5; color: var(--color-ink); word-break: keep-all; }
        .bd-row { display: flex; flex-wrap: wrap; gap: 8px; }
        .bd-btn { min-height: 44px; padding: 10px 14px; border-radius: var(--radius-sm); font-size: var(--fs-4); font-weight: 800; font-family: var(--font-sans); cursor: pointer; border: 1px solid transparent; }
        .bd-btn.primary { background: var(--color-primary); color: var(--color-on-primary); }
        .bd-btn.ghost { background: var(--color-card); color: var(--color-primary); border-color: var(--color-line); }
        .bd-btn.big { width: 100%; min-height: 56px; font-size: var(--fs-5); border-radius: var(--radius-md); }
        .bd-btn.sm { font-size: var(--fs-3); padding: 8px 12px; }
        .bd-btn:disabled { opacity: .55; cursor: default; }
        .bd-label { margin: 0 0 8px; font-size: var(--fs-2); font-weight: 800; color: var(--color-ink-3); }
        .bd-label.out { margin: 4px 2px 8px; }
        .bd-head { margin: 0; display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
        .bd-head span { font-size: var(--fs-3); color: var(--color-ink-2); font-weight: 700; }
        .bd-head b { font-size: var(--fs-7, var(--fs-6)); font-weight: 800; color: var(--color-ink); }
        .bd-delta { margin: 6px 0 0; font-size: var(--fs-3); color: var(--color-ink-2); word-break: keep-all; }
        .bd-delta b.up { color: var(--color-danger); }
        .bd-delta b.dn { color: var(--color-primary); }
        .bd-muted { margin: 0; font-size: var(--fs-3); color: var(--color-ink-3); word-break: keep-all; }
        .bd-muted.small { margin-top: 10px; font-size: var(--fs-2); }
        .bd-err { margin: 0 0 8px; font-size: var(--fs-4); font-weight: 700; color: var(--color-danger); word-break: keep-all; }
        .bd-warn { margin: 8px 0 0; font-size: var(--fs-3); font-weight: 700; color: var(--color-warning-ink); word-break: keep-all; }
        .bd-topic { margin-bottom: 10px; transition: border-color .2s; }
        .bd-topic.on { border-color: var(--color-primary); box-shadow: 0 0 0 2px var(--color-primary-soft); }
        .bd-ttl { margin: 0 0 6px; font-size: var(--fs-5); font-weight: 800; color: var(--color-ink); line-height: 1.4; word-break: keep-all; }
        .bd-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
        .bd-chip { padding: 3px 10px; border-radius: 999px; background: var(--color-primary-soft); color: var(--color-primary); font-size: var(--fs-2); font-weight: 800; }
        .bd-dl { margin: 0; }
        .bd-dl dt { margin-top: 10px; font-size: var(--fs-2); font-weight: 800; color: var(--color-ink-3); }
        .bd-dl dt em { font-style: normal; margin-left: 6px; color: var(--color-primary); }
        .bd-dl dd { margin: 3px 0 0; font-size: var(--fs-3); line-height: 1.6; color: var(--color-ink); word-break: keep-all; }
        .bd-src { list-style: none; margin: 12px 0 0; padding: 10px 0 0; border-top: 1px dashed var(--color-line); display: flex; flex-direction: column; gap: 4px; }
        .bd-src li { font-size: var(--fs-2); color: var(--color-ink-2); word-break: break-all; }
        .bd-src a { color: var(--color-primary); }
        .bd-src em { font-style: normal; color: var(--color-ink-3); }
        .bd-notes { list-style: none; margin: 0 0 8px; padding: 0; display: flex; flex-direction: column; gap: 6px; }
        .bd-notes li { display: flex; gap: 8px; align-items: flex-start; font-size: var(--fs-3); color: var(--color-ink); background: var(--color-card-soft); border-radius: var(--radius-sm); padding: 8px 10px; word-break: break-all; }
        .bd-notes span { flex: 1 1 auto; }
        .bd-x { flex: 0 0 44px; min-height: 44px; margin: -8px -10px -8px 0; border: none; background: none; color: var(--color-ink-3); font-size: var(--fs-5); cursor: pointer; }
        .bd-input { width: 100%; box-sizing: border-box; padding: 10px 12px; border: 1.5px solid var(--color-line); border-radius: var(--radius-sm); font-size: var(--fs-4); font-family: var(--font-sans); background: var(--color-bg); color: var(--color-ink); resize: vertical; margin-bottom: 8px; }
        .bd-input.line { flex: 1 1 160px; min-width: 0; width: auto; min-height: 44px; margin: 0; }
        .bd-input:focus { outline: none; border-color: var(--color-primary); }
        .bd-foot { margin: 4px 2px 0; font-size: var(--fs-2); color: var(--color-ink-3); text-align: center; word-break: keep-all; }
        .bd-revoke { align-self: center; min-height: 44px; border: none; background: none; color: var(--color-ink-3); font-size: var(--fs-2); text-decoration: underline; cursor: pointer; font-family: var(--font-sans); }
      `}</style>
    </div>
  );
}
