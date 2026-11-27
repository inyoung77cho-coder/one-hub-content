// [S49-3] 수업 후 버니 선생님과 대화 — /pwa/tutor?lesson=<id>  (영어 전용)
//   화면 3개(한 페이지 안 전환): ① 시작(선생님 고르기) → ② 대화(얼굴+자막) → ③ 마무리.
//   엔진: POST /api/english/lesson-chat (지문은 엔진이 lesson_id 로 읽는다). 실패는 실패로 보여준다 —
//   가짜 튜터 문장·가짜 지문을 만들지 않는다(집 규칙).
//
//   ★오디오(iOS 자동재생 제약): [대화 시작] 탭 안에서 Audio 요소 하나를 만들어 무음으로 재생 권한을 얻고,
//    이후 모든 발화는 그 요소의 src 만 바꿔 재생한다(발화마다 new Audio() 금지).
//    speak → turn 전환은 오디오 'ended' 이벤트로 한다(타이머 아님). 오디오 실패여도 turn 으로 넘기고 자막은 유지.
//
//   기록: 선생님 선택·자막 켬/끔만 localStorage(동기화 안 함). 대화 본문은 페이지 메모리에만 —
//   고쳐준 문장은 사용자가 [내 단어장에 담기]를 누른 것만 vocabNote 에 저장.
//   녹음 로직(pickMime·startRec·stopRec·sendAudio)은 english.js WeekendChat 에서 복사(공용화 리팩터링 금지).
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import AppHeader from "../../components/AppHeader";
import BottomNav from "../../components/BottomNav";
import TutorBunny from "../../components/TutorBunny";
import { getTrader } from "../../lib/trader";
import { isSaved as isVocabSaved, toggleSave as toggleVocab } from "../../lib/vocabNote";

const TEACHER_KEY = "onehub_tutor_teacher";
const SUB_KEY = "onehub_tutor_sub";
const TTS_MAX = 200;             // /api/english/speak 영어 상한(프록시가 200자에서 자른다)
const TUTOR_TIMEOUT_MS = 30000;  // 프록시 25초 + 여유
const AUDIO_START_GUARD_MS = 15000; // 재생 시작 자체가 안 되는 경우(네트워크 정지)만 실패로 본다

const TEACHERS = [
  { kind: "boy", name: "남자 버니", desc: "자신감 있는 선생님", voice: "en-male" },
  { kind: "girl", name: "여자 버니", desc: "귀여운 선생님", voice: "en-female" },
];

// 200자를 넘는 발화는 문장 단위로 잘라 순서대로 재생(엔진이 180자를 지키는 것이 1차 방어).
function chunkSay(text) {
  const s = String(text || "").replace(/\s+/g, " ").trim();
  if (!s) return [];
  if (s.length <= TTS_MAX) return [s];
  const sentences = s.match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g) || [s];
  const out = [];
  let cur = "";
  const push = (x) => { const t = x.trim(); if (t) out.push(t); };
  for (const raw of sentences) {
    const sen = raw.trim();
    if (sen.length > TTS_MAX) {           // 한 문장이 너무 길면 단어 경계로
      push(cur); cur = "";
      let part = "";
      for (const w of sen.split(" ")) {
        if ((part + " " + w).trim().length > TTS_MAX) { push(part); part = w; } else part = (part + " " + w).trim();
      }
      push(part);
      continue;
    }
    if ((cur + " " + sen).trim().length > TTS_MAX) { push(cur); cur = sen; } else cur = (cur + " " + sen).trim();
  }
  push(cur);
  return out;
}

// iOS 재생 권한용 무음 WAV(0.1초) — 네트워크 없이 제스처 안에서 즉시 재생하기 위함.
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

const mmss = (sec) => { const s = Math.max(0, Math.floor(sec)); return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; };

export default function TutorPage() {
  const router = useRouter();
  const lessonId = router.isReady ? String(router.query.lesson || "").trim() : null;

  // ── 레슨 조회(로딩·성공·실패 구분) ──
  const [lessonState, setLessonState] = useState("load"); // load | ok | error | missing
  const [lesson, setLesson] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  // ── 설정(기기별, 동기화 안 함) ──
  const [teacher, setTeacher] = useState("boy");
  const [subOn, setSubOn] = useState(true);

  // ── 대화 ──
  const [screen, setScreen] = useState("start"); // start | chat | end
  const [phase, setPhase] = useState("think");    // think | speak | turn | listen | stt | review | error
  const [talking, setTalking] = useState(false);  // 오디오가 실제로 재생 중일 때만 입 움직임
  const [msgs, setMsgs] = useState([]);           // {role:'tutor'|'student', text, ko?}
  const [cur, setCur] = useState(null);           // 직전 튜터 응답 {say, ko, fix}
  const [usedAll, setUsedAll] = useState([]);
  const [fixes, setFixes] = useState([]);
  const [audioErr, setAudioErr] = useState(false);
  const [draft, setDraft] = useState("");        // 받아쓰기 결과 / 키보드 입력
  const [kbOpen, setKbOpen] = useState(false);
  const [recErr, setRecErr] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [endInfo, setEndInfo] = useState(null);  // {sec, turns}
  const [savedFix, setSavedFix] = useState({});   // better 문장 → 단어장 저장 여부

  const audioRef = useRef(null);
  const queueRef = useRef([]);
  const speakingRef = useRef(false);
  const startGuardRef = useRef(null);
  const histRef = useRef([]);
  const lastActionRef = useRef("");
  const sessionRef = useRef(0);
  const startedAtRef = useRef(0);
  const mrRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const inputRef = useRef(null);
  const voiceRef = useRef("en-male");

  useEffect(() => {
    try {
      const t = localStorage.getItem(TEACHER_KEY); if (t === "boy" || t === "girl") setTeacher(t);
      const s = localStorage.getItem(SUB_KEY); if (s != null) setSubOn(s === "1");
    } catch (e) {}
  }, []);
  useEffect(() => { voiceRef.current = (TEACHERS.find((t) => t.kind === teacher) || TEACHERS[0]).voice; }, [teacher]);

  useEffect(() => {
    if (!router.isReady) return;
    if (!lessonId || !/^\d+$/.test(lessonId)) { setLessonState("missing"); return; }
    let alive = true;
    setLessonState("load"); setLesson(null);
    fetch(`/api/english/lesson?id=${encodeURIComponent(lessonId)}`)
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })).catch(() => ({ ok: false, d: null })))
      .then(({ ok, d }) => {
        if (!alive) return;
        // 프록시는 상류 연결 실패 시 200 {items:[]} 를 준다 → id·지문이 있어야 성공으로 본다.
        if (ok && d && d.id && d.passage_en) { setLesson(d); setLessonState("ok"); }
        else setLessonState("error");
      })
      .catch(() => { if (alive) setLessonState("error"); });
    return () => { alive = false; };
  }, [router.isReady, lessonId, reloadKey]);

  // 경과 시간 — 표시만(상한·자동 종료 없음)
  useEffect(() => {
    if (screen !== "chat") return undefined;
    const t = setInterval(() => setElapsed((Date.now() - startedAtRef.current) / 1000), 1000);
    return () => clearInterval(t);
  }, [screen]);

  // ── 오디오: 요소 하나 재사용 ──
  const clearGuard = () => { if (startGuardRef.current) { clearTimeout(startGuardRef.current); startGuardRef.current = null; } };
  const finishSpeak = useCallback((failed) => {
    clearGuard();
    if (!speakingRef.current) return;
    speakingRef.current = false;
    queueRef.current = [];
    setTalking(false);
    if (failed) setAudioErr(true);
    setPhase("turn");
  }, []);
  const playNext = useCallback(() => {
    const a = audioRef.current;
    const next = queueRef.current.shift();
    if (!a || !next) { finishSpeak(false); return; }
    clearGuard();
    startGuardRef.current = setTimeout(() => finishSpeak(true), AUDIO_START_GUARD_MS);
    a.src = `/api/english/speak?text=${encodeURIComponent(next)}&language=en&voice=${voiceRef.current}`;
    const p = a.play();
    if (p && p.catch) p.catch((e) => { if (e && e.name === "AbortError") return; finishSpeak(true); });
  }, [finishSpeak]);
  const ensureAudio = () => {
    if (audioRef.current) return audioRef.current;
    const a = new Audio();
    a.preload = "auto";
    a.addEventListener("playing", () => { if (speakingRef.current) { clearGuard(); setTalking(true); } });
    a.addEventListener("pause", () => setTalking(false));
    a.addEventListener("waiting", () => setTalking(false));
    a.addEventListener("ended", () => {
      setTalking(false);
      if (!speakingRef.current) return;              // 무음 언락 재생의 ended 는 무시
      if (queueRef.current.length) playNext(); else finishSpeak(false);
    });
    a.addEventListener("error", () => { if (speakingRef.current) finishSpeak(true); });
    audioRef.current = a;
    return a;
  };
  const unlockAudio = () => {   // 반드시 사용자 탭 핸들러 안에서 호출
    const a = ensureAudio();
    try { a.src = silentUrl(); const p = a.play(); if (p && p.catch) p.catch(() => {}); } catch (e) {}
  };
  const playSay = useCallback((text) => {
    const chunks = chunkSay(text);
    setAudioErr(false);
    if (!chunks.length || !audioRef.current) { setPhase("turn"); return; }
    queueRef.current = chunks;
    speakingRef.current = true;
    setPhase("speak");
    playNext();
  }, [playNext]);
  const stopAudio = () => {
    clearGuard();
    speakingRef.current = false; queueRef.current = []; setTalking(false);
    try { audioRef.current && audioRef.current.pause(); } catch (e) {}
  };

  // ── 튜터 호출 ──
  const callTutor = useCallback(async (action = "") => {
    const sid = sessionRef.current;
    lastActionRef.current = action;
    setPhase("think"); setAudioErr(false); setRecErr("");
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TUTOR_TIMEOUT_MS);
    try {
      const r = await fetch("/api/english/lesson-chat", {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: ctrl.signal,
        body: JSON.stringify({
          lesson_id: Number(lessonId),
          history: histRef.current.map((m) => ({ role: m.role, text: m.text })),
          action,
        }),
      });
      const d = await r.json().catch(() => null);
      if (sid !== sessionRef.current) return;   // 끝냈거나 다시 시작한 뒤 도착한 응답은 버린다
      if (!r.ok || !d || typeof d.say !== "string" || !d.say.trim()) throw new Error("tutor_failed");
      const say = d.say.trim();
      const ko = typeof d.ko === "string" ? d.ko.trim() : "";
      const fix = d.fix && d.fix.original && d.fix.better ? { original: String(d.fix.original), better: String(d.fix.better) } : null;
      histRef.current = [...histRef.current, { role: "tutor", text: say, ko }];
      setMsgs(histRef.current);
      setCur({ say, ko, fix });
      if (fix) setFixes((f) => (f.some((x) => x.better === fix.better) ? f : [...f, fix]));
      if (Array.isArray(d.used) && d.used.length) setUsedAll((u) => [...u, ...d.used.filter((x) => x && !u.includes(x))]);
      playSay(say);
    } catch (e) {
      if (sid !== sessionRef.current) return;
      setPhase("error");   // 가짜 튜터 문장을 만들지 않는다. 내 답은 histRef 에 그대로 남아 [다시] 때 재전송.
    } finally {
      clearTimeout(timer);
    }
  }, [lessonId, playSay]);

  // ── 녹음(english.js WeekendChat 에서 복사) ──
  const hintStr = () => {   // 이 레슨의 표현·단어 → whisper 편향 힌트
    const ex = ((lesson && lesson.expressions) || []).map((e) => e && e.expr).filter(Boolean);
    const wd = ((lesson && lesson.words) || []).map((w) => w && w.word).filter(Boolean);
    let s = "";
    if (ex.length) s += "Expressions: " + ex.slice(0, 8).join("; ") + ".";
    if (wd.length) s += (s ? " " : "") + "Words: " + wd.slice(0, 10).join("; ") + ".";
    return s.slice(0, 400);
  };
  const pickMime = () => {
    for (const m of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/aac", "audio/ogg"]) {
      try { if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) return m; } catch (e) {}
    }
    return "";
  };
  const sendAudio = (blob) => {
    const sid = sessionRef.current;
    setPhase("stt"); setRecErr("");
    const h = hintStr();
    fetch("/api/english/transcribe" + (h ? `?hint=${encodeURIComponent(h)}` : ""), {
      method: "POST", headers: { "Content-Type": blob.type || "application/octet-stream" }, body: blob,
    }).then((r) => r.json()).then((d) => {
      if (sid !== sessionRef.current) return;
      const text = ((d && d.text) || "").trim();
      if (!text) { setPhase("turn"); setRecErr("잘 안 들렸어요. 다시 말해볼까요?"); return; }
      setDraft(text); setPhase("review");
    }).catch(() => { if (sid !== sessionRef.current) return; setPhase("turn"); setRecErr("녹음 전송 실패 — 다시 시도해 주세요."); });
  };
  const startRec = async () => {
    setRecErr("");
    if (typeof navigator === "undefined" || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || typeof MediaRecorder === "undefined") {
      setRecErr("이 브라우저는 녹음을 지원하지 않아요. 키보드로 입력해 주세요."); setKbOpen(true); setPhase("turn"); return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = pickMime();
      const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data && e.data.size) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        try { streamRef.current && streamRef.current.getTracks().forEach((t) => t.stop()); } catch (e) {}
        if (mr._discard) return;   // 끝내기·뒤로 등으로 버린 녹음
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || mime || "audio/webm" });
        if (blob.size < 600) { setPhase("turn"); setRecErr("너무 짧아요. 한 문장으로 말해볼까요?"); return; }
        sendAudio(blob);
      };
      mr.start(); mrRef.current = mr; setPhase("listen");
    } catch (e) { setRecErr("마이크 사용 권한이 필요해요. 키보드로 입력해 주세요."); setKbOpen(true); setPhase("turn"); }
  };
  const stopRec = () => { try { if (mrRef.current && mrRef.current.state === "recording") mrRef.current.stop(); } catch (e) {} };
  const discardRec = () => {
    try { if (mrRef.current && mrRef.current.state === "recording") { mrRef.current._discard = true; mrRef.current.stop(); } } catch (e) {}
    try { streamRef.current && streamRef.current.getTracks().forEach((t) => t.stop()); } catch (e) {}
  };

  // 언마운트 정리
  useEffect(() => () => {
    sessionRef.current += 1;
    discardRec();
    try { audioRef.current && audioRef.current.pause(); } catch (e) {}
    clearGuard();
  }, []);

  // ── 흐름 ──
  const startChat = () => {   // [대화 시작] / [다시 대화] 탭 핸들러 — 여기서 재생 권한을 얻는다
    unlockAudio();
    sessionRef.current += 1;
    histRef.current = [];
    setMsgs([]); setCur(null); setUsedAll([]); setFixes([]); setDraft(""); setKbOpen(false);
    setRecErr(""); setAudioErr(false); setEndInfo(null);
    startedAtRef.current = Date.now(); setElapsed(0);
    setScreen("chat");
    callTutor("");   // history 비어 있음 → 선생님이 먼저 말을 건다
  };
  const sendStudent = (text) => {
    const t = String(text || "").trim();
    if (!t) return;
    histRef.current = [...histRef.current, { role: "student", text: t }];
    setMsgs(histRef.current);
    setDraft(""); setKbOpen(false); setRecErr("");
    callTutor("");
  };
  const endChat = () => {
    sessionRef.current += 1;
    discardRec(); stopAudio();
    const turns = histRef.current.filter((m) => m.role === "student").length;
    setEndInfo({ sec: (Date.now() - startedAtRef.current) / 1000, turns });
    setScreen("end");
  };
  const goBack = () => { endChatSilently(); router.push("/pwa/english"); };
  const endChatSilently = () => { sessionRef.current += 1; discardRec(); stopAudio(); };
  const chooseTeacher = (k) => { setTeacher(k); try { localStorage.setItem(TEACHER_KEY, k); } catch (e) {} };
  const toggleSub = () => { const v = !subOn; setSubOn(v); try { localStorage.setItem(SUB_KEY, v ? "1" : "0"); } catch (e) {} };
  const saveFix = (fx) => {
    try {
      const r = toggleVocab({ lang: "en", text: fx.better, meaning: `고친 문장 (내가 쓴 말: ${fx.original})`, source: (lesson && lesson.title_en) || "버니 선생님 대화" }, getTrader());
      setSavedFix((s) => ({ ...s, [fx.better]: r.saved }));
    } catch (e) {}
  };
  const isFixSaved = (fx) => {
    if (savedFix[fx.better] != null) return savedFix[fx.better];
    try { return isVocabSaved("en", fx.better, getTrader()); } catch (e) { return false; }
  };

  const bunnyPhase = phase === "think" || phase === "stt" ? "think"
    : phase === "listen" ? "listen"
    : phase === "speak" && talking ? "speak" : "idle";
  const statusText = {
    think: "선생님이 생각하는 중", speak: "선생님이 말하는 중", turn: "내 차례예요",
    listen: "듣는 중", stt: "받아쓰는 중…", review: "이렇게 들었어요", error: "선생님 응답을 받지 못했어요",
  }[phase];
  const lastStudent = [...msgs].reverse().find((m) => m.role === "student");
  const teacherName = (TEACHERS.find((t) => t.kind === teacher) || TEACHERS[0]).name;

  return (
    <div className="tu-wrap">
      <AppHeader />
      <main className="tu-main">
        {/* ① 시작 */}
        {screen === "start" && (
          <section className="tu-card">
            {lessonState === "load" && <p className="tu-muted">수업을 불러오는 중…</p>}
            {lessonState === "missing" && (
              <>
                <p className="tu-err">어떤 수업인지 알 수 없어요. 영어 탭에서 레슨을 열고 [4단계]를 눌러 주세요.</p>
                <button type="button" className="tu-btn ghost" onClick={() => router.push("/pwa/english")}>수업으로</button>
              </>
            )}
            {lessonState === "error" && (
              <>
                <p className="tu-err">수업을 불러오지 못했어요.</p>
                <button type="button" className="tu-btn ghost" onClick={() => setReloadKey((k) => k + 1)}>다시</button>
              </>
            )}
            {lessonState === "ok" && lesson && (
              <>
                <p className="tu-kicker">4단계 · 버니 선생님과 대화</p>
                <h1 className="tu-title">{lesson.title_en}</h1>
                {lesson.title_ko && <p className="tu-sub">{lesson.title_ko}</p>}
                <p className="tu-lead">방금 읽은 내용으로 영어로 이야기해요. 말로 답하는 게 기본이고, 키보드도 쓸 수 있어요. 끝내고 싶을 때 [끝내기]를 누르면 돼요.</p>
                <div className="tu-pick" role="radiogroup" aria-label="선생님 고르기">
                  {TEACHERS.map((t) => (
                    <button key={t.kind} type="button" role="radio" aria-checked={teacher === t.kind} aria-label={`${t.name} — ${t.desc}`}
                      className={`tu-pickbtn${teacher === t.kind ? " on" : ""}`} onClick={() => chooseTeacher(t.kind)}>
                      <TutorBunny kind={t.kind} phase="idle" size={96} />
                      <b>{t.name}</b>
                      <span>{t.desc}</span>
                    </button>
                  ))}
                </div>
                <button type="button" className="tu-btn primary big" onClick={startChat}>대화 시작</button>
              </>
            )}
          </section>
        )}

        {/* ② 대화 */}
        {screen === "chat" && (
          <section className="tu-chat">
            <div className="tu-bar">
              <button type="button" className="tu-icon" aria-label="뒤로 (대화를 끝내고 영어 탭으로)" onClick={goBack}>←</button>
              <b className="tu-name">버니 선생님</b>
              <span className="tu-time" aria-label="경과 시간">{mmss(elapsed)}</span>
              <button type="button" className="tu-mini" onClick={toggleSub} aria-pressed={subOn}>{subOn ? "자막 끄기" : "자막 켜기"}</button>
              <button type="button" className="tu-mini end" onClick={endChat}>끝내기</button>
            </div>

            <div className="tu-stage">
              <TutorBunny kind={teacher} phase={bunnyPhase} size={240} />
              <p className="tu-status" aria-live="polite">{teacherName} · {statusText}</p>
            </div>

            <div className="tu-subs" aria-live="polite">
              {!subOn ? (
                <p className="tu-muted">자막 꺼짐</p>
              ) : cur ? (
                <>
                  <p className="tu-say">{cur.say}</p>
                  {cur.ko && <p className="tu-ko">{cur.ko}</p>}
                  {cur.fix && (
                    <p className="tu-fix"><s>{cur.fix.original}</s> → <b>{cur.fix.better}</b></p>
                  )}
                </>
              ) : (
                <p className="tu-muted">{phase === "error" ? "" : "선생님이 첫마디를 준비하고 있어요…"}</p>
              )}
            </div>

            {audioErr && (phase === "turn" || phase === "review") && <p className="tu-warn">소리를 재생하지 못했어요. 자막을 읽고 답해 주세요.</p>}
            {recErr && <p className="tu-warn">{recErr}</p>}

            <div className="tu-ctrl">
              {(phase === "think" || phase === "speak" || phase === "stt") && (
                <button type="button" className="tu-btn wait" disabled>
                  {phase === "think" ? "선생님이 생각하는 중" : phase === "speak" ? "선생님이 말하는 중" : "받아쓰는 중…"}
                </button>
              )}

              {phase === "error" && (
                <>
                  <p className="tu-err">선생님 응답을 받지 못했어요.</p>
                  {lastStudent && <p className="tu-mine">내 답: {lastStudent.text}</p>}
                  <button type="button" className="tu-btn primary" onClick={() => callTutor(lastActionRef.current)}>다시</button>
                </>
              )}

              {phase === "turn" && (
                <>
                  <button type="button" className="tu-btn primary big" onClick={startRec}>🎤 말하기</button>
                  <div className="tu-row">
                    <button type="button" className="tu-btn ghost" onClick={() => { setKbOpen((v) => !v); setTimeout(() => { try { inputRef.current && inputRef.current.focus(); } catch (e) {} }, 0); }} aria-expanded={kbOpen}>⌨️ 키보드</button>
                    <button type="button" className="tu-btn ghost" onClick={() => callTutor("hint")}>💡 힌트 주세요</button>
                    <button type="button" className="tu-btn ghost" onClick={() => cur && playSay(cur.say)} disabled={!cur}>🔁 다시 말해 주세요</button>
                  </div>
                  {kbOpen && (
                    <div className="tu-row">
                      <input ref={inputRef} className="tu-input" value={draft} onChange={(e) => setDraft(e.target.value)}
                        placeholder="영어로 입력…" aria-label="답 입력" maxLength={600}
                        onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) sendStudent(draft); }} />
                      <button type="button" className="tu-btn primary" onClick={() => sendStudent(draft)} disabled={!draft.trim()}>보내기</button>
                    </div>
                  )}
                </>
              )}

              {phase === "listen" && (
                <button type="button" className="tu-btn rec big" onClick={stopRec}>● 듣는 중 · 눌러서 끝내기</button>
              )}

              {phase === "review" && (
                <>
                  <p className="tu-label">이렇게 들었어요 (고칠 수 있어요)</p>
                  <input className="tu-input full" value={draft} onChange={(e) => setDraft(e.target.value)} aria-label="인식된 문장" maxLength={600} />
                  <div className="tu-row">
                    <button type="button" className="tu-btn ghost" onClick={() => { setDraft(""); startRec(); }}>다시 말하기</button>
                    <button type="button" className="tu-btn primary" onClick={() => sendStudent(draft)} disabled={!draft.trim()}>보내기</button>
                  </div>
                </>
              )}
            </div>
          </section>
        )}

        {/* ③ 마무리 */}
        {screen === "end" && endInfo && (
          <section className="tu-card">
            <h1 className="tu-title">오늘 대화 정리</h1>
            <div className="tu-stats">
              <div><span>대화 시간</span><b>{Math.floor(endInfo.sec / 60)}분 {Math.floor(endInfo.sec % 60)}초</b></div>
              <div><span>주고받은 횟수</span><b>{endInfo.turns}번</b></div>
            </div>

            <h2 className="tu-h2">직접 쓴 표현</h2>
            {usedAll.length ? (
              <div className="tu-chips">{usedAll.map((u) => <span key={u} className="tu-chip">{u}</span>)}</div>
            ) : <p className="tu-muted">이번 대화에서 레슨 표현·단어를 쓴 기록이 없어요.</p>}

            <h2 className="tu-h2">고쳐준 문장</h2>
            {fixes.length ? (
              <ul className="tu-fixes">
                {fixes.map((fx) => {
                  const saved = isFixSaved(fx);
                  return (
                    <li key={fx.better}>
                      <p className="tu-fix"><s>{fx.original}</s><br /><b>{fx.better}</b></p>
                      <button type="button" className={`tu-btn ghost sm${saved ? " on" : ""}`} onClick={() => saveFix(fx)} aria-pressed={saved}>
                        {saved ? "★ 단어장에 담김 (빼기)" : "☆ 내 단어장에 담기"}
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : <p className="tu-muted">고쳐준 문장이 없어요.</p>}

            <h2 className="tu-h2">전체 대화</h2>
            {msgs.length ? (
              <ol className="tu-log">
                {msgs.map((m, i) => (
                  <li key={i} className={m.role === "tutor" ? "t" : "me"}>
                    <span className="who">{m.role === "tutor" ? "버니" : "나"}</span>
                    <span className="txt">{m.text}{m.ko ? <em>{m.ko}</em> : null}</span>
                  </li>
                ))}
              </ol>
            ) : <p className="tu-muted">주고받은 대화가 없어요.</p>}
            <p className="tu-muted small">대화 내용은 저장되지 않아요. 이 화면을 떠나면 사라집니다.</p>

            <div className="tu-row">
              <button type="button" className="tu-btn ghost" onClick={() => router.push("/pwa/english")}>수업으로</button>
              <button type="button" className="tu-btn primary" onClick={startChat}>다시 대화</button>
            </div>
          </section>
        )}
      </main>
      <BottomNav />
      <style jsx>{`
        .tu-wrap { min-height: 100vh; background: var(--color-bg); padding-bottom: var(--nav-clearance-fab); }
        .tu-main { max-width: 560px; margin: 0 auto; padding: 12px 14px 40px; }
        .tu-card { background: var(--color-card); border: 1px solid var(--color-line); border-radius: var(--radius-md); padding: 18px 16px; box-shadow: var(--shadow-card); }
        .tu-kicker { margin: 0 0 6px; font-size: var(--fs-2); font-weight: 800; color: var(--color-primary); }
        .tu-title { margin: 0 0 4px; font-size: var(--fs-6); font-weight: 800; color: var(--color-ink); line-height: 1.35; word-break: keep-all; }
        .tu-sub { margin: 0 0 10px; font-size: var(--fs-3); color: var(--color-ink-2); word-break: keep-all; }
        .tu-lead { margin: 0 0 14px; font-size: var(--fs-3); color: var(--color-ink-2); line-height: 1.6; word-break: keep-all; }
        .tu-muted { margin: 0; font-size: var(--fs-3); color: var(--color-ink-3); }
        .tu-muted.small { margin-top: 14px; font-size: var(--fs-2); }
        .tu-err { margin: 0 0 10px; font-size: var(--fs-4); font-weight: 700; color: var(--color-danger); word-break: keep-all; }
        .tu-warn { margin: 10px 0 0; font-size: var(--fs-3); font-weight: 700; color: var(--color-warning-ink); word-break: keep-all; }
        .tu-mine { margin: 0 0 10px; font-size: var(--fs-3); color: var(--color-ink-2); word-break: break-word; }
        .tu-pick { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 14px; }
        .tu-pickbtn { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 12px 8px; min-height: 44px; border: 2px solid var(--color-line); border-radius: var(--radius-md); background: var(--color-card-soft); color: var(--color-ink); font-family: var(--font-sans); cursor: pointer; }
        .tu-pickbtn b { font-size: var(--fs-4); font-weight: 800; }
        .tu-pickbtn span { font-size: var(--fs-2); color: var(--color-ink-2); }
        .tu-pickbtn.on { border-color: var(--color-primary); background: var(--color-primary-soft); }
        .tu-btn { min-height: 44px; padding: 10px 14px; border-radius: var(--radius-sm); font-size: var(--fs-4); font-weight: 800; font-family: var(--font-sans); cursor: pointer; border: 1px solid transparent; }
        .tu-btn.primary { background: var(--color-primary); color: var(--color-on-primary); }
        .tu-btn.ghost { background: var(--color-card); color: var(--color-primary); border-color: var(--color-line); }
        .tu-btn.ghost.on { border-color: var(--color-primary); background: var(--color-primary-soft); }
        .tu-btn.big { width: 100%; min-height: 56px; font-size: var(--fs-5); border-radius: var(--radius-md); }
        .tu-btn.wait { width: 100%; min-height: 56px; background: var(--color-card-soft); color: var(--color-ink-3); border-color: var(--color-line); }
        .tu-btn.rec { background: var(--color-danger); color: var(--color-on-primary); animation: tuPulse 1s ease-in-out infinite; }
        .tu-btn.sm { min-height: 44px; font-size: var(--fs-3); padding: 8px 12px; }
        .tu-btn:disabled { opacity: .55; cursor: default; }
        @keyframes tuPulse { 0%, 100% { opacity: 1; } 50% { opacity: .75; } }
        .tu-row { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
        .tu-row .tu-btn { flex: 1 1 auto; }
        .tu-input { flex: 1 1 180px; min-width: 0; min-height: 44px; box-sizing: border-box; padding: 10px 12px; border: 1.5px solid var(--color-line); border-radius: var(--radius-sm); font-size: var(--fs-5); font-family: var(--font-sans); background: var(--color-bg); color: var(--color-ink); }
        .tu-input.full { width: 100%; }
        .tu-input:focus { outline: none; border-color: var(--color-primary); }
        .tu-label { margin: 0 0 6px; font-size: var(--fs-2); font-weight: 800; color: var(--color-ink-3); }

        .tu-chat { background: var(--color-card); border: 1px solid var(--color-line); border-radius: var(--radius-md); padding: 10px 12px 16px; box-shadow: var(--shadow-card); }
        .tu-bar { display: flex; align-items: center; gap: 6px; }
        .tu-icon { width: 44px; height: 44px; border: none; background: none; font-size: var(--fs-6); color: var(--color-ink); cursor: pointer; border-radius: var(--radius-sm); }
        .tu-name { font-size: var(--fs-4); font-weight: 800; color: var(--color-ink); white-space: nowrap; }
        .tu-time { font-size: var(--fs-3); font-weight: 700; color: var(--color-ink-3); font-variant-numeric: tabular-nums; margin-right: auto; }
        .tu-mini { min-height: 44px; padding: 6px 10px; border: 1px solid var(--color-line); background: var(--color-card); color: var(--color-ink-2); border-radius: var(--radius-sm); font-size: var(--fs-2); font-weight: 800; font-family: var(--font-sans); cursor: pointer; white-space: nowrap; }
        .tu-mini.end { color: var(--color-danger); }
        .tu-stage { display: flex; flex-direction: column; align-items: center; gap: 8px; margin-top: 8px; }
        .tu-status { margin: 0; font-size: var(--fs-3); font-weight: 700; color: var(--color-ink-2); }
        .tu-subs { margin-top: 12px; min-height: 72px; padding: 12px 14px; border-radius: var(--radius-md); background: var(--color-card-soft); border: 1px solid var(--color-line); }
        .tu-say { margin: 0; font-size: var(--fs-5); font-weight: 700; line-height: 1.55; color: var(--color-ink); word-break: break-word; }
        .tu-ko { margin: 6px 0 0; font-size: var(--fs-3); font-weight: 600; line-height: 1.55; color: var(--color-ink-2); word-break: keep-all; }
        .tu-fix { margin: 8px 0 0; font-size: var(--fs-3); line-height: 1.55; color: var(--color-ink); word-break: break-word; }
        .tu-fix s { color: var(--color-ink-3); }
        .tu-fix b { color: var(--color-success-ink); }
        .tu-ctrl { margin-top: 12px; }

        .tu-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 10px 0 4px; }
        .tu-stats div { background: var(--color-card-soft); border: 1px solid var(--color-line); border-radius: var(--radius-sm); padding: 10px 12px; display: flex; flex-direction: column; gap: 2px; }
        .tu-stats span { font-size: var(--fs-2); color: var(--color-ink-3); font-weight: 700; }
        .tu-stats b { font-size: var(--fs-5); color: var(--color-ink); }
        .tu-h2 { margin: 16px 0 8px; font-size: var(--fs-3); font-weight: 800; color: var(--color-ink-3); }
        .tu-chips { display: flex; flex-wrap: wrap; gap: 6px; }
        .tu-chip { padding: 6px 12px; border-radius: 999px; background: var(--color-success-soft); color: var(--color-success-ink); font-size: var(--fs-3); font-weight: 800; }
        .tu-fixes { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
        .tu-fixes li { padding: 10px 12px; border: 1px solid var(--color-line); border-radius: var(--radius-sm); background: var(--color-card-soft); }
        .tu-fixes .tu-fix { margin: 0 0 8px; }
        .tu-log { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
        .tu-log li { display: flex; gap: 8px; font-size: var(--fs-3); line-height: 1.5; color: var(--color-ink); }
        .tu-log .who { flex: 0 0 34px; font-weight: 800; color: var(--color-ink-3); }
        .tu-log li.me .who { color: var(--color-primary); }
        .tu-log .txt { word-break: break-word; }
        .tu-log em { display: block; font-style: normal; color: var(--color-ink-2); font-size: var(--fs-2); }
        @media (prefers-reduced-motion: reduce) { .tu-btn.rec { animation: none; } }
      `}</style>
    </div>
  );
}
