// [ENG] 매일 영어 — 경제/디스플레이 뉴스 지문 + 유튜브 영상, 하루 각 1건.
//   백엔드 = onehub-english.service(:5005), 프록시 = /api/english/[fn].
//   학습 흐름은 ①먼저 듣기(대본 가림) → ②지문·표현 읽기 → ③다시 듣기 3단계.
//   지문은 원문 복사가 아니라 사실만 추려 다시 쓴 학습용 텍스트(원문은 링크로).
import { useCallback, useEffect, useRef, useState } from "react";
import AppHeader from "../../components/AppHeader";
import BottomNav from "../../components/BottomNav";

// 상단 대메뉴 = 경제영어(en) / 중국어(zh) / 일반영어(gen). 각 대메뉴 아래 하위 메뉴로 계층 구분.
const MODES = [
  ["en", "💼", "경제영어"],
  ["zh", "🇨🇳", "중국어"],
  ["gen", "🎬", "일반영어"],
];
// 대메뉴별 하위 메뉴 [키, 아이콘, 라벨]
const SUBTABS = {
  en:  [["news", "📰", "뉴스"], ["video", "▶️", "영상"], ["idiom", "💬", "이디엄"]],
  zh:  [["news", "📰", "신문"], ["video", "▶️", "영상"], ["idiom", "💬", "구어"]],
  gen: [["live", "🎬", "라이브"], ["review", "📝", "주말복습"]],
};
const TRACK_KO = { economy: "경제", display: "디스플레이", general: "생활영어" };
const TRACK_KO_ZH = { economy: "경제", display: "디스플레이", general: "생활중국어" };
const SPEEDS = [0.75, 1, 1.25];

// [2026-08-26] 발음 듣기 — 단어를 복사해 다른 곳에서 듣던 번거로움 해소.
//   edge-tts(무료·LLM 사용량 한도와 무관)라 lesson.has_audio(LLM으로 만든 지문 낭독)
//   여부와 상관없이 항상 눌러볼 수 있다.
function SpeakButton({ text, lang }) {
  const [playing, setPlaying] = useState(false);
  const play = (e) => {
    e.stopPropagation();
    if (!text) return;
    setPlaying(true);
    const audio = new Audio(`/api/english/speak?text=${encodeURIComponent(text)}&language=${lang}`);
    audio.play().catch(() => {});
    audio.onended = () => setPlaying(false);
    audio.onerror = () => setPlaying(false);
  };
  return (
    <button type="button" className={`lc-speak${playing ? " on" : ""}`} onClick={play} aria-label={`${text} 발음 듣기`} title="발음 듣기">
      🔊
    </button>
  );
}

function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00`);
  const wd = ["일", "월", "화", "수", "목", "금", "토"][d.getDay()];
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${wd})`;
}

function LessonCard({ lesson, lang }) {
  const [revealed, setRevealed] = useState(false);
  const [speed, setSpeed] = useState(1);
  const audioRef = useRef(null);

  // playbackRate 는 src 가 바뀌거나 새로 마운트되면 1로 돌아간다 — 매번 다시 건다.
  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = speed;
  }, [speed, lesson.id]);

  const replay = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    el.currentTime = 0;
    el.playbackRate = speed;
    el.play().catch(() => {});
  }, [speed]);

  const exprs = lesson.expressions || [];
  const words = lesson.words || [];
  const isIdiom = lesson.medium === "idiom";

  return (
    <article className="lc">
      <div className="lc-top">
        <span className="lc-track">{(lang === "zh" ? TRACK_KO_ZH : TRACK_KO)[lesson.track] || lesson.track}</span>
        <span className="lc-src">{lesson.source_name}</span>
      </div>

      <h2 className="lc-title">{lesson.title_en}</h2>
      {lesson.title_ko && <p className="lc-titleko">{lesson.title_ko}</p>}

      {lesson.has_audio ? (
        <div className="lc-audio">
          <div className="lc-step">🎧 1단계 · 대본 없이 먼저 들어보세요</div>
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <audio ref={audioRef} src={`/api/english/audio/${lesson.id}`} controls preload="none" />
          <div className="lc-speed">
            {SPEEDS.map((s) => (
              <button
                key={s}
                type="button"
                className={speed === s ? "on" : ""}
                onClick={() => setSpeed(s)}
              >
                {s}x
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="lc-noaudio">음성이 아직 없습니다 (텍스트로 학습하세요)</div>
      )}

      {!revealed ? (
        <button type="button" className="lc-reveal" onClick={() => setRevealed(true)}>
          📖 2단계 · {isIdiom ? "대화 보기" : "지문 보기"}
        </button>
      ) : (
        <>
          <section className="lc-sec">
            <h3>{isIdiom ? "대화 (LISTEN & READ)" : "지문 (READ)"}</h3>
            {/* 이디엄 레슨은 "Mike: …" 형태의 대화라 줄바꿈을 살려야 읽힌다. */}
            <p className={isIdiom ? "lc-passage lc-dialogue" : "lc-passage"}>{lesson.passage_en}</p>
          </section>

          {lesson.summary_ko && (
            <section className="lc-sec">
              <h3>{isIdiom ? "상황" : "한국어 요약"}</h3>
              <p className="lc-ko">{lesson.summary_ko}</p>
            </section>
          )}

          {exprs.length > 0 && (
            <section className="lc-sec">
              <h3>{isIdiom ? "오늘의 이디엄" : "오늘의 표현"}</h3>
              <ol className="lc-exprs">
                {exprs.map((e, i) => (
                  <li key={i}>
                    <b>{e.expr}</b>
                    <SpeakButton text={e.expr} lang={lang} />
                    {e.pinyin && <span className="lc-pinyin"> [{e.pinyin}]</span>}
                    <span className="lc-mean"> — {e.meaning_ko}</span>
                    {/* 아래 2개는 이디엄에서만 온다. 직역을 같이 보여주면
                        글자만 보고 왜 오해하는지가 드러난다. */}
                    {e.literal_ko && <div className="lc-lit">직역: {e.literal_ko}</div>}
                    {e.nuance_ko && <div className="lc-nu">쓸 때: {e.nuance_ko}</div>}
                    {e.example_en && <div className="lc-ex">{e.example_en}</div>}
                    {e.example_ko && <div className="lc-exko">{e.example_ko}</div>}
                    {e.example2_en && <div className="lc-ex">{e.example2_en}</div>}
                  </li>
                ))}
              </ol>
            </section>
          )}

          {words.length > 0 && (
            <section className="lc-sec">
              <h3>{isIdiom ? "함께 볼 단어" : "단어"}</h3>
              <ul className="lc-words">
                {words.map((w, i) => (
                  <li key={i}>
                    <b>{w.word}</b>
                    <SpeakButton text={w.word} lang={lang} />
                    {w.pinyin && <span className="lc-pinyin"> [{w.pinyin}]</span>}
                    {w.pos && <i className="lc-pos"> {w.pos}</i>}
                    <span className="lc-mean"> {w.meaning_ko}</span>
                    {w.example_en && <div className="lc-ex">{w.example_en}</div>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {lesson.has_audio && (
            <button type="button" className="lc-again" onClick={replay}>
              🎧 3단계 · 다시 듣기
            </button>
          )}
        </>
      )}

      <div className="lc-foot">
        {lesson.medium === "video" && !lesson.has_transcript && (
          <span className="lc-warn">자막을 못 받아와 제목·설명 기반으로 만들었어요</span>
        )}
        {isIdiom && (
          <span className="lc-warn">예문·대화는 실제 작품 대사 인용이 아니라 학습용으로 새로 쓴 것입니다</span>
        )}
        {!isIdiom && lesson.source_url && (
          <a href={lesson.source_url} target="_blank" rel="noreferrer noopener">
            🔗 {lesson.medium === "video" ? "영상 보기" : "원문 보기"}
          </a>
        )}
      </div>

      <style jsx>{`
        .lc { background: var(--color-card); border: 1px solid var(--color-line); border-radius: 14px; padding: 16px; box-shadow: var(--shadow-card); }
        .lc-top { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
        .lc-track { font-size: 11px; font-weight: 800; color: #fff; background: var(--color-primary); border-radius: 999px; padding: 3px 9px; }
        .lc-src { font-size: 11.5px; font-weight: 600; color: var(--color-ink-3); }
        .lc-title { font-size: 1rem; font-weight: 800; line-height: 1.4; margin: 0 0 4px; color: var(--color-ink); }
        .lc-titleko { font-size: .8rem; color: var(--color-ink-2); margin: 0 0 12px; word-break: keep-all; }
        .lc-audio { margin: 12px 0; }
        .lc-step { font-size: .74rem; font-weight: 700; color: var(--color-ink-3); margin-bottom: 6px; }
        .lc-audio audio { width: 100%; height: 36px; }
        .lc-speed { display: flex; gap: 6px; margin-top: 8px; }
        .lc-speed button { flex: 0 0 auto; font-size: .72rem; font-weight: 700; padding: 4px 10px; border-radius: 999px; border: 1px solid var(--color-line); background: var(--color-bg); color: var(--color-ink-2); cursor: pointer; font-family: var(--font-sans); }
        .lc-speed button.on { background: var(--color-primary); border-color: var(--color-primary); color: #fff; }
        .lc-noaudio { font-size: .75rem; color: var(--color-ink-3); margin: 10px 0; }
        .lc-reveal, .lc-again { width: 100%; margin-top: 12px; padding: 12px; border-radius: 10px; border: none; background: var(--color-primary); color: #fff; font-size: .86rem; font-weight: 800; cursor: pointer; font-family: var(--font-sans); }
        .lc-again { background: var(--color-bg); color: var(--color-primary); border: 1px solid var(--color-primary); }
        .lc-sec { margin-top: 16px; }
        .lc-sec h3 { font-size: .74rem; font-weight: 800; color: var(--color-ink-3); letter-spacing: .3px; margin: 0 0 7px; text-transform: uppercase; }
        .lc-passage { font-size: .92rem; line-height: 1.85; color: var(--color-ink); margin: 0; }
        .lc-dialogue { white-space: pre-line; }
        .lc-ko { font-size: .82rem; line-height: 1.7; color: var(--color-ink-2); margin: 0; white-space: pre-line; word-break: keep-all; }
        .lc-exprs, .lc-words { margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 10px; }
        .lc-words { list-style: none; padding-left: 0; }
        .lc-exprs li, .lc-words li { font-size: .84rem; color: var(--color-ink); line-height: 1.5; }
        .lc-pos { font-size: .72rem; color: var(--color-ink-3); font-style: normal; }
        .lc-pinyin { font-size: .78rem; color: var(--color-primary); font-weight: 600; }
        .lc-speak { display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; margin-left: 4px; padding: 0; border: none; background: var(--color-card-soft); border-radius: 50%; cursor: pointer; font-size: .74rem; vertical-align: middle; }
        .lc-speak.on { background: var(--color-primary-soft); }
        .lc-mean { color: var(--color-ink-2); }
        .lc-ex { font-size: .8rem; color: var(--color-ink-2); margin-top: 3px; padding-left: 8px; border-left: 2px solid var(--color-line); }
        .lc-exko { font-size: .74rem; color: var(--color-ink-3); padding-left: 10px; }
        .lc-lit { font-size: .76rem; color: var(--color-ink-3); margin-top: 3px; }
        .lc-nu { font-size: .78rem; color: var(--color-ink-2); margin-top: 2px; }
        .lc-foot { margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--color-line); display: flex; flex-direction: column; gap: 6px; }
        .lc-foot a { font-size: .78rem; font-weight: 700; color: var(--color-primary); text-decoration: none; }
        .lc-warn { font-size: .72rem; color: var(--color-ink-3); }
      `}</style>
    </article>
  );
}

// [2026-08-26] 주간 복습 — 최근 7일치 레슨에서 나온 표현·단어를 하나로 모아, 매일 새로 쌓인
//   것들 중 뭘 놓쳤는지 주말에 한 번에 훑어볼 수 있게 한다. 새 LLM 생성 없이 이미 만들어진
//   레슨을 재구성만 해서 보여주는 화면이라 발음 듣기와 마찬가지로 항상 동작한다.
function WeeklyReviewCard({ item, textKey, lang }) {
  return (
    <li className="wr-row">
      <div className="wr-top">
        <b>{item[textKey]}</b>
        <SpeakButton text={item[textKey]} lang={lang} />
        {item.pinyin && <span className="lc-pinyin"> [{item.pinyin}]</span>}
        <span className="wr-date mono">{item.lesson_date?.slice(5)}</span>
      </div>
      <span className="lc-mean">{item.meaning_ko}</span>
      {item.example_en && <div className="lc-ex">{item.example_en}</div>}
      <style jsx>{`
        .wr-row { list-style: none; padding: 10px 0; border-bottom: 1px solid var(--color-line); }
        .wr-top { display: flex; align-items: center; flex-wrap: wrap; gap: 2px; }
        .wr-date { margin-left: auto; font-size: .66rem; color: var(--color-ink-3); }
      `}</style>
    </li>
  );
}

function WeeklyReview({ weekly, lang }) {
  if (weekly.loading) return <div className="en-state">불러오는 중…</div>;
  const exprs = weekly.data?.expressions || [];
  const words = weekly.data?.words || [];
  if (exprs.length === 0 && words.length === 0) {
    return <div className="en-state">지난 7일간 쌓인 표현·단어가 아직 없어요.</div>;
  }
  return (
    <div className="wr">
      <div className="wr-range">{weekly.data.since} ~ {weekly.data.until} · 레슨 {weekly.data.lesson_count}건에서 모음</div>
      {exprs.length > 0 && (
        <section className="lc-sec">
          <h3>이번 주 표현 · {exprs.length}개</h3>
          <ul className="lc-exprs">
            {exprs.map((e, i) => <WeeklyReviewCard key={i} item={e} textKey="expr" lang={lang} />)}
          </ul>
        </section>
      )}
      {words.length > 0 && (
        <section className="lc-sec">
          <h3>이번 주 단어 · {words.length}개</h3>
          <ul className="lc-exprs">
            {words.map((w, i) => <WeeklyReviewCard key={i} item={w} textKey="word" lang={lang} />)}
          </ul>
        </section>
      )}
      <style jsx>{`
        .wr-range { font-size: .74rem; color: var(--color-ink-3); margin-bottom: 4px; }
      `}</style>
    </div>
  );
}

// [Live English] 큰 자막 + 단어 카라오케 — /speak-timed 의 단어 타이밍으로 재생에 맞춰 하이라이트.
function Karaoke({ text, lang, onActive, onClear }) {
  const [marks, setMarks] = useState(null);      // null=미로딩, []=경계없음
  const [idx, setIdx] = useState(-1);
  const [loading, setLoading] = useState(false);
  const audioRef = useRef(null);
  const words = String(text || "").trim().split(/\s+/);
  // 오디오는 기존 /speak(같은 text·voice → 동일 합성), 타이밍은 /speak-timed 마크로.
  const audioSrc = `/api/english/speak?text=${encodeURIComponent(text)}&language=${lang}`;

  const play = async () => {
    if (marks == null) {
      setLoading(true);
      try {
        const r = await fetch(`/api/english/speak-timed?text=${encodeURIComponent(text)}&language=${lang}`);
        const d = await r.json();
        setMarks(Array.isArray(d.marks) ? d.marks : []);
      } catch (e) { setMarks([]); }
      setLoading(false);
    }
    setIdx(-1);
    try { audioRef.current.currentTime = 0; await audioRef.current.play(); } catch (e) {}
  };
  const onTime = () => {
    const t = (audioRef.current?.currentTime || 0) * 1000;
    const m = marks || [];
    let i = -1;
    for (let k = 0; k < m.length; k++) { if (t + 60 >= m[k].t) i = k; else break; }
    setIdx(i);
    if (onActive) onActive(words, i);          // 영상 위 자막 오버레이 동기
  };
  const end = () => { setIdx(-1); if (onClear) onClear(); };
  return (
    <div className="ka">
      <div className="ka-text">
        {words.map((w, i) => <span key={i} className={i === idx ? "on" : ""}>{w} </span>)}
      </div>
      <button type="button" className="ka-play" onClick={play} disabled={loading}>
        {loading ? "준비 중…" : "▶ 자막 따라 듣기"}
      </button>
      <audio ref={audioRef} src={audioSrc} onTimeUpdate={onTime} onEnded={end} preload="none" />
      <style jsx>{`
        .ka { }
        .ka-text { font-size: 1.5rem; font-weight: 800; line-height: 1.5; color: var(--color-ink); letter-spacing: -.01em; }
        .ka-text span { transition: color .1s, background .1s; padding: 0 1px; border-radius: 4px; }
        .ka-text span.on { color: #fff; background: var(--color-primary); }
        .ka-play { margin-top: 10px; border: none; border-radius: 10px; padding: 9px 16px; background: var(--color-primary-soft); color: var(--color-primary); font-weight: 800; font-size: .82rem; cursor: pointer; font-family: inherit; }
        .ka-play:disabled { opacity: .6; }
      `}</style>
    </div>
  );
}

// [진짜 자막 카라오케] BBC 'The English We Speak' 실제 오디오 + Whisper 단어 타임스탬프.
//   오디오 재생시간에 맞춰 단어를 큰 글씨로 하이라이트(우리가 만든 카라오케). 매일 자동 갱신.
function BbcKaraoke() {
  const [clips, setClips] = useState(null);
  const [ci, setCi] = useState(0);
  const [wi, setWi] = useState(-1);
  const audioRef = useRef(null);
  useEffect(() => {
    let alive = true;
    fetch(`/api/english/karaoke-clips`).then((r) => r.json())
      .then((d) => { if (alive) setClips(d.items || []); })
      .catch(() => alive && setClips([]));
    return () => { alive = false; };
  }, []);

  if (clips == null) return <div className="en-state">카라오케 불러오는 중…</div>;
  if (!clips.length) return <div className="en-state">카라오케 클립이 아직 준비 안 됐어요.</div>;
  const clip = clips[ci] || clips[0];
  const cues = clip.cues || [];
  const onTime = () => {
    const t = audioRef.current?.currentTime || 0;
    let idx = -1;
    for (let k = 0; k < cues.length; k++) { if (t + 0.05 >= cues[k].t) idx = k; else break; }
    setWi(idx);
  };
  // 자막을 '고정 2줄 페이지'로 끊는다(문장 끝, 6~14단어). 페이지는 경계에서만 통째로 바뀌고,
  // 그 안에서 지금 읽는 단어만 반전 표시 → 글이 매 단어 밀리지 않아 헷갈리지 않는다.
  const pages = [];
  let curp = [];
  for (let k = 0; k < cues.length; k++) {
    curp.push(k);
    const endsSent = /[.!?]["')\]]?$/.test(cues[k].w);
    if ((endsSent && curp.length >= 6) || curp.length >= 14) { pages.push(curp); curp = []; }
  }
  if (curp.length) pages.push(curp);
  let pageIdx = 0;
  if (wi >= 0) { for (let p = 0; p < pages.length; p++) { if (pages[p].indexOf(wi) !== -1) { pageIdx = p; break; } } }
  const pageWords = pages[pageIdx] || [];
  const img = clip.image ? clip.image.replace(/^http:\/\//, "https://") : "";

  return (
    <div className="bk">
      <div className="bk-hd">🎤 <b>BBC 카라오케</b> <span className="bk-sub">{clip.channel?.replace("BBC · ", "") || ""}</span></div>
      <div className="bk-title">{clip.title}</div>
      <div className="bk-stage" style={img ? { backgroundImage: `url(${img})` } : undefined}>
        <div className="bk-cap">
          {pageWords.map((gi) => (
            <span key={gi} className={gi === wi ? "on" : gi < wi ? "past" : ""}>{cues[gi].w} </span>
          ))}
        </div>
      </div>
      <audio ref={audioRef} src={`/api${clip.audio_url}`} onTimeUpdate={onTime} onEnded={() => setWi(-1)} controls preload="none" />
      {clip.note && <p className="bk-note">💡 {clip.note}</p>}
      {clips.length > 1 && (
        <div className="bk-chips">
          {clips.map((c, i) => (
            <button key={i} type="button" className={`bk-chip${i === ci ? " on" : ""}`} onClick={() => { setCi(i); setWi(-1); }}>{c.title}</button>
          ))}
        </div>
      )}
      <p className="bk-src">BBC Learning English 실제 오디오 + 자동 단어 동기(매일 갱신)</p>
      <style jsx>{`
        .bk { background: var(--color-card); border: 1px solid var(--color-line); border-radius: 16px; padding: 16px 15px 15px; box-shadow: var(--shadow-card); }
        .bk-hd { font-size: .9rem; color: var(--color-ink); }
        .bk-hd b { font-weight: 800; }
        .bk-sub { font-size: .7rem; font-weight: 700; color: var(--color-primary); background: var(--color-primary-soft); border-radius: 999px; padding: 1px 8px; margin-left: 5px; }
        .bk-title { margin-top: 6px; font-size: .82rem; font-weight: 800; color: var(--color-ink-2); }
        .bk-stage { position: relative; width: 100%; aspect-ratio: 16 / 9; margin: 12px 0 0; border-radius: 12px; overflow: hidden; background: #0b1220 center / cover no-repeat; display: flex; align-items: flex-end; }
        .bk-cap { width: 100%; box-sizing: border-box; min-height: 3em; max-height: 100%; overflow: hidden; padding: 16px 16px 15px; background: linear-gradient(transparent, rgba(0,0,0,.35), rgba(0,0,0,.82)); color: rgba(255,255,255,.88); font-size: 1.15rem; font-weight: 800; line-height: 1.5; text-align: center; overflow-wrap: break-word; word-break: normal; }
        .bk-cap span { transition: color .12s, background .12s; padding: 1px 3px; border-radius: 5px; }
        .bk-cap span.past { color: rgba(255,255,255,.45); }
        .bk-cap span.on { color: #191600; background: #ffe14a; box-shadow: 0 0 0 2px #ffe14a; }
        .bk audio { width: 100%; display: block; margin-top: 10px; }
        .bk-note { margin-top: 10px; font-size: .76rem; color: var(--color-ink-2); line-height: 1.5; word-break: keep-all; }
        .bk-chips { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 10px; }
        .bk-chip { border: 1px solid var(--color-line); background: var(--color-card); color: var(--color-ink-3); border-radius: 999px; padding: 5px 11px; font-size: .72rem; font-weight: 700; cursor: pointer; font-family: inherit; }
        .bk-chip.on { background: var(--color-primary-soft); border-color: var(--color-primary); color: var(--color-primary); }
        .bk-src { margin-top: 10px; font-size: .64rem; color: var(--color-ink-3); }
      `}</style>
    </div>
  );
}

function LiveEnglish() {
  const [videos, setVideos] = useState(null);
  const [vidIdx, setVidIdx] = useState(0);
  useEffect(() => {
    let alive = true;
    fetch(`/api/english/live-videos`).then((r) => r.json())
      .then((d) => { if (alive) setVideos((d.items || []).filter((x) => x.video_id)); })
      .catch(() => alive && setVideos([]));
    return () => { alive = false; };
  }, []);

  if (videos == null) return <div className="en-state">라이브 영상 불러오는 중…</div>;
  if (!videos.length) return <div className="en-state">라이브 영상을 불러오지 못했어요.</div>;
  const v = videos[vidIdx] || videos[0];
  const shortCh = (c) => String(c || "").replace(/\s*\(.*\)\s*/, "");
  // 유튜브 자체 자막(CC)을 켠다 — cc_load_policy=1. (임의 영상의 단어 카라오케는 유튜브 차단으로 불가.)
  const src = `https://www.youtube.com/embed/${v.video_id}?cc_load_policy=1&hl=en&cc_lang_pref=en&rel=0&modestbranding=1`;

  return (
    <div className="live">
      <BbcKaraoke />
      <div className="live-vhd">🎬 셀럽·BBC 짧은 영상 <span>자막(CC) ON</span></div>
      <div className="live-vid">
        <iframe key={v.video_id} src={src} title={v.title || "video"}
          allow="accelerometer; encrypted-media; picture-in-picture; fullscreen" allowFullScreen loading="lazy" />
      </div>
      <div className="live-vcap">
        <span className="live-vtitle">{v.is_short ? "⚡" : "▶"} {v.channel} · {v.title}</span>
        {videos.length > 1 && (
          <button type="button" className="live-next" onClick={() => setVidIdx((i) => (i + 1) % videos.length)}>다른 영상 →</button>
        )}
      </div>
      <div className="live-chips">
        {videos.map((x, i) => (
          <button key={i} type="button" className={`live-chip${i === vidIdx ? " on" : ""}`} onClick={() => setVidIdx(i)}>
            {x.is_short ? "⚡ " : ""}{shortCh(x.channel)}
          </button>
        ))}
      </div>
      <p className="live-note">셀럽·BBC 짧은 영어 영상. 영상 플레이어의 <b>자막(CC)</b>을 켜면 화면에 자막이 나옵니다.</p>
      <style jsx>{`
        .live { display: flex; flex-direction: column; gap: 12px; padding: 4px 2px 20px; }
        .live-vhd { font-size: .82rem; font-weight: 800; color: var(--color-ink); margin-top: 4px; }
        .live-vhd span { font-size: .66rem; font-weight: 600; color: var(--color-ink-3); margin-left: 5px; }
        .live-vid { border-radius: 14px; overflow: hidden; box-shadow: var(--shadow-card); }
        .live-vid iframe { width: 100%; aspect-ratio: 16/9; border: 0; display: block; }
        .live-vcap { display: flex; align-items: center; gap: 8px; font-size: .76rem; font-weight: 700; color: var(--color-ink); padding: 9px 12px; background: var(--color-card); border-radius: 10px; }
        .live-vtitle { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .live-next { flex-shrink: 0; border: 1px solid var(--color-line); background: var(--color-card-soft); color: var(--color-primary); border-radius: 8px; padding: 5px 9px; font-size: .7rem; font-weight: 800; cursor: pointer; font-family: inherit; }
        .live-chips { display: flex; gap: 6px; flex-wrap: wrap; }
        .live-chip { border: 1px solid var(--color-line); background: var(--color-card); color: var(--color-ink-3); border-radius: 999px; padding: 6px 11px; font-size: .72rem; font-weight: 700; cursor: pointer; font-family: inherit; }
        .live-chip.on { background: var(--color-primary-soft); border-color: var(--color-primary); color: var(--color-primary); }
        .live-note { font-size: .68rem; color: var(--color-ink-3); line-height: 1.5; margin: 2px 0 0; word-break: keep-all; }
        .live-note b { color: var(--color-primary); }
      `}</style>
    </div>
  );
}

// [주말 AI 튜터] 글 대신 '대화형' — 튜터가 영어로 묻고(음성), 학습자가 영어로 답한다.
// 배운 표현이 나오면 정답. 막히면 ① 관련 단어 → ② 표현 힌트 → ③ 정답 이디엄 을 차례로 눌러 넣어 유도.
const QZ_OPENERS = [
  "Okay, let's chat! Answer me in English.",
  "Your turn — reply to me in English.",
  "Let's practice speaking. Say it in English!",
  "Nice. Now tell me in your own English.",
  "Great, keep going — answer me in English.",
];

function WeekendChat({ lang = "en" }) {
  const [items, setItems] = useState(null);
  const [i, setI] = useState(0);
  const [ans, setAns] = useState("");
  const [state, setState] = useState("ask"); // ask | correct
  const [hint, setHint] = useState(0);       // 0 없음 · 1 관련단어 · 2 표현힌트 · 3 정답이디엄
  const [tries, setTries] = useState(0);
  const [score, setScore] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => {
    let alive = true;
    setItems(null); setI(0); setScore(0); setState("ask"); setAns(""); setHint(0); setTries(0);
    fetch(`/api/english/weekly-review?language=${lang}`).then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        const q = (d.expressions || []).filter((e) => e.expr && e.meaning_ko && e.example_en);
        setItems(q.slice(0, 10));
      }).catch(() => alive && setItems([]));
    return () => { alive = false; };
  }, [lang]);

  if (items == null) return <div className="en-state">튜터 준비 중…</div>;
  if (!items.length) return <div className="en-state">이번 주 배운 표현이 아직 없어요.<br />뉴스·이디엄에서 학습하면 주말 대화가 만들어집니다.</div>;

  const done = i >= items.length;
  const cur = done ? null : items[i];
  const opener = QZ_OPENERS[i % QZ_OPENERS.length];
  const speak = (text) => { try { new Audio(`/api/english/speak?text=${encodeURIComponent(text)}&language=en`).play().catch(() => {}); } catch (e) {} };
  const norm = (s) => (s || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  const exprWords = cur ? cur.expr.split(/\s+/).filter(Boolean) : [];
  const skeleton = exprWords.map((w) => w[0] + "·".repeat(Math.max(1, w.length - 1))).join("  ");
  const insert = (chip) => {
    setAns((a) => (a && !a.endsWith(" ") ? a + " " : a) + chip + " ");
    try { inputRef.current && inputRef.current.focus(); } catch (e) {}
  };
  const check = () => {
    if (norm(ans).includes(norm(cur.expr))) {
      setState("correct"); setScore((s) => s + 1);
      speak("Perfect! That's exactly right. Well done.");
    } else {
      const t = tries + 1; setTries(t);
      setHint((h) => Math.min(3, Math.max(h, t)));  // 틀릴수록 힌트를 한 단계씩 더 연다
    }
  };
  const next = () => { setI((x) => x + 1); setAns(""); setState("ask"); setHint(0); setTries(0); };
  const restart = () => { setI(0); setScore(0); setState("ask"); setAns(""); setHint(0); setTries(0); };

  return (
    <div className="qz">
      <div className="qz-teacher"><span className="qz-av">👩‍🏫</span><b>AI 영어 튜터</b>
        {!done && <span className="qz-prog">{i + 1} / {items.length}</span>}</div>

      {done ? (
        <>
          <div className="qz-done">오늘 대화 완료! 배운 표현 <b>{score} / {items.length}</b> 성공 👏</div>
          <button type="button" className="qz-btn" onClick={restart}>다시 하기</button>
        </>
      ) : (
        <>
          {/* 튜터 말풍선 — 영어로 질문(음성) */}
          <div className="qz-bubble tutor">
            <p className="qz-say">{opener}</p>
            <p className="qz-say sm">Reply so it means: <b>“{cur.meaning_ko}”</b></p>
            <button type="button" className="qz-listen" onClick={() => speak(opener + " Try to use today's expression.")}>🔊 튜터 목소리로 듣기</button>
          </div>

          {state === "correct" ? (
            <>
              {/* 내 답 말풍선 + 튜터 확인 + 원어민 예문 카라오케 */}
              <div className="qz-bubble me"><p className="qz-say">{ans.trim()}</p></div>
              <div className="qz-fb ok">✅ Perfect! <b>{cur.expr}</b> — 자연스럽게 나왔어요.</div>
              <div className="qz-reveal"><Karaoke text={cur.example_en} lang={lang} /></div>
              {cur.example_ko && <div className="qz-exko">{cur.example_ko}</div>}
              <button type="button" className="qz-btn" onClick={next}>{i + 1 < items.length ? "다음 대화 →" : "결과 보기 →"}</button>
            </>
          ) : (
            <>
              <input ref={inputRef} className="qz-input" value={ans} onChange={(e) => setAns(e.target.value)}
                placeholder="영어로 대답해 보세요…" onKeyDown={(e) => e.key === "Enter" && ans.trim() && check()} />

              {tries > 0 && hint === 0 && <div className="qz-fb wrong">거의 다 왔어요! 배운 표현을 넣어 다시 말해볼까요?</div>}

              {/* 막히면 차례로 유도 — ① 관련 단어 → ② 표현 힌트 → ③ 정답 이디엄 */}
              {hint >= 1 && (
                <div className="qz-hint">
                  <div className="qz-hl">① 관련 단어 — 눌러서 문장에 넣어보세요</div>
                  <div className="qz-chips">
                    {exprWords.map((w, k) => (
                      <button key={k} type="button" className="qz-chip" onClick={() => insert(w)}>{w}</button>
                    ))}
                  </div>
                </div>
              )}
              {hint >= 2 && (
                <div className="qz-hint">
                  <div className="qz-hl">② 표현 힌트</div>
                  <div className="qz-skel">{skeleton}</div>
                </div>
              )}
              {hint >= 3 && (
                <div className="qz-hint">
                  <div className="qz-hl">③ 이 표현(idiom)을 그대로 써보세요</div>
                  <div className="qz-chips">
                    <button type="button" className="qz-chip solid" onClick={() => insert(cur.expr)}>{cur.expr}</button>
                  </div>
                </div>
              )}

              <div className="qz-row">
                {hint < 3 && <button type="button" className="qz-ghost" onClick={() => setHint((h) => Math.min(3, h + 1))}>💡 힌트</button>}
                <button type="button" className="qz-btn flex" onClick={check} disabled={!ans.trim()}>보내기</button>
              </div>
            </>
          )}
        </>
      )}

      <style jsx>{`
        .qz { background: var(--color-card); border: 1px solid var(--color-line); border-radius: 16px; padding: 18px 16px 20px; box-shadow: var(--shadow-card); }
        .qz-teacher { display: flex; align-items: center; gap: 8px; font-size: .9rem; color: var(--color-ink); }
        .qz-av { font-size: 1.4rem; }
        .qz-teacher b { font-weight: 800; }
        .qz-prog { margin-left: auto; font-size: .72rem; font-weight: 700; color: var(--color-ink-3); background: var(--color-card-soft); border-radius: 999px; padding: 2px 9px; }
        .qz-bubble { margin-top: 14px; padding: 12px 14px; border-radius: 14px; }
        .qz-bubble.tutor { background: var(--color-card-soft); border: 1px solid var(--color-line); border-top-left-radius: 4px; }
        .qz-bubble.me { background: var(--color-primary-soft); border: 1px solid var(--color-primary); border-top-right-radius: 4px; margin-left: 18%; }
        .qz-say { margin: 0; font-size: 1.02rem; font-weight: 700; line-height: 1.5; color: var(--color-ink); word-break: break-word; }
        .qz-say.sm { margin-top: 6px; font-size: .82rem; font-weight: 600; color: var(--color-ink-2); }
        .qz-say.sm b { color: var(--color-primary); }
        .qz-listen { margin-top: 10px; border: 1px solid var(--color-line); background: var(--color-card); color: var(--color-ink-2); border-radius: 9px; padding: 7px 12px; font-size: .76rem; font-weight: 700; cursor: pointer; font-family: inherit; }
        .qz-input { width: 100%; box-sizing: border-box; margin-top: 12px; padding: 12px 13px; border: 1.5px solid var(--color-line); border-radius: 11px; font-size: 1rem; font-family: inherit; background: var(--color-bg); color: var(--color-ink); }
        .qz-input:focus { outline: none; border-color: var(--color-primary); }
        .qz-hint { margin-top: 12px; }
        .qz-hl { font-size: .72rem; font-weight: 800; color: var(--color-ink-3); margin-bottom: 6px; }
        .qz-chips { display: flex; flex-wrap: wrap; gap: 7px; }
        .qz-chip { border: 1px solid var(--color-line); background: var(--color-card-soft); color: var(--color-ink); border-radius: 999px; padding: 7px 13px; font-size: .86rem; font-weight: 700; cursor: pointer; font-family: inherit; }
        .qz-chip.solid { background: var(--color-primary); color: #fff; border-color: var(--color-primary); }
        .qz-skel { font-size: 1.15rem; font-weight: 800; letter-spacing: 1px; color: var(--color-primary); word-break: break-word; }
        .qz-fb { margin-top: 10px; font-size: .84rem; font-weight: 700; word-break: keep-all; }
        .qz-fb.ok { color: var(--color-success); } .qz-fb.wrong { color: var(--color-danger); }
        .qz-reveal { margin-top: 10px; }
        .qz-exko { margin-top: 6px; font-size: .78rem; color: var(--color-ink-3); }
        .qz-done { margin-top: 14px; font-size: .95rem; font-weight: 800; color: var(--color-ink); }
        .qz-row { display: flex; gap: 8px; align-items: stretch; margin-top: 14px; }
        .qz-ghost { flex-shrink: 0; border: 1.5px solid var(--color-line); background: var(--color-card-soft); color: var(--color-ink-2); border-radius: 12px; padding: 0 14px; font-size: .82rem; font-weight: 800; cursor: pointer; font-family: inherit; }
        .qz-btn { width: 100%; margin-top: 14px; border: none; border-radius: 12px; padding: 13px; background: var(--color-primary); color: #fff; font-size: .92rem; font-weight: 800; cursor: pointer; font-family: inherit; }
        .qz-btn.flex { flex: 1; width: auto; margin-top: 0; }
        .qz-btn:disabled { opacity: .55; }
      `}</style>
    </div>
  );
}

export default function EnglishPage() {
  const [mode, setMode] = useState("en");        // en(경제영어) / zh(중국어) / gen(일반영어)
  const [tab, setTab] = useState("news");
  const [feed, setFeed] = useState({ loading: true, date: null, items: [], error: null, review: false });
  const [past, setPast] = useState({ open: false, loading: false, items: [] });

  const lang = mode === "zh" ? "zh" : "en";
  const isWeekend = [0, 6].includes(new Date().getDay());
  const changeMode = (m) => { setMode(m); setTab(SUBTABS[m][0][0]); };

  useEffect(() => {
    let alive = true;
    if (mode === "gen") return () => { alive = false; };   // 라이브/복습(WeekendQuiz)이 자체 로드
    // 경제영어(en)·중국어(zh) 매체 피드
    setFeed({ loading: true, date: null, items: [], error: null, review: false });
    setPast({ open: false, loading: false, items: [] });
    if (isWeekend) {
      fetch(`/api/english/lessons?medium=${tab}&language=${lang}&limit=7`)
        .then((r) => r.json())
        .then((d) => { if (alive) setFeed({ loading: false, date: null, items: d.items || [], error: d.error || null, review: true }); })
        .catch(() => alive && setFeed({ loading: false, date: null, items: [], error: "연결 실패", review: true }));
    } else {
      fetch(`/api/english/today?medium=${tab}&language=${lang}`)
        .then((r) => r.json())
        .then((d) => { if (alive) setFeed({ loading: false, date: d.date, items: d.items || [], error: d.error || null, review: false }); })
        .catch(() => alive && setFeed({ loading: false, date: null, items: [], error: "연결 실패", review: false }));
    }
    return () => { alive = false; };
  }, [mode, tab, lang, isWeekend]);

  const loadPast = () => {
    if (past.open) return setPast((p) => ({ ...p, open: false }));
    setPast({ open: true, loading: true, items: [] });
    fetch(`/api/english/lessons?medium=${tab}&language=${lang}&limit=12`)
      .then((r) => r.json())
      .then((d) => {
        // 오늘 것은 위에 이미 있으니 뺀다.
        const todayIds = new Set(feed.items.map((i) => i.id));
        setPast({ open: true, loading: false, items: (d.items || []).filter((i) => !todayIds.has(i.id)) });
      })
      .catch(() => setPast({ open: true, loading: false, items: [] }));
  };

  return (
    <div className="en pwa-shell">
      <AppHeader />
      <div className="en-hd">
        <h1>{mode === "gen" ? "🎬 일반 영어" : mode === "zh" ? "🇨🇳 매일 중국어" : "💼 경제 영어"}</h1>
        <span className="en-sub">
          {mode === "gen"
            ? "생활영어 라이브(셀럽 영상+카라오케) · 주말 복습"
            : mode === "zh"
            ? "경제 · 디스플레이 신문/영상 + 구어(HSK4-5)"
            : "경제 · 디스플레이 뉴스/영상 + 이디엄"}
        </span>
      </div>

      {/* 대메뉴 (경제영어/중국어/일반영어) */}
      <div className="en-langs" role="tablist">
        {MODES.map(([key, ic, label]) => (
          <button key={key} type="button" role="tab" aria-selected={mode === key}
            className={mode === key ? "on" : ""} onClick={() => changeMode(key)}>
            <span aria-hidden="true">{ic}</span> {label}
          </button>
        ))}
      </div>

      {/* 하위 메뉴 — 대메뉴별로 다름(계층). */}
      <div className="en-subtabs" role="tablist">
        {SUBTABS[mode].map(([key, ic, label]) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key}
            className={tab === key ? "on" : ""} onClick={() => setTab(key)}>
            <span aria-hidden="true">{ic}</span> {label}
          </button>
        ))}
      </div>

      {mode === "gen" && tab === "live" ? (
        <LiveEnglish lang="en" />
      ) : mode === "gen" && tab === "review" ? (
        <WeekendChat lang="en" />
      ) : (
        <>
          {feed.review && (
            <div className="en-review-hd">📚 주말 <b>이번 주 복습</b> · {(SUBTABS[mode].find((t) => t[0] === tab) || [, , ""])[2]} — 주말엔 새 학습 대신 이번 주 것을 다시 봐요.</div>
          )}
          {feed.loading ? (
            <div className="en-state">불러오는 중…</div>
          ) : feed.items.length === 0 ? (
            <div className="en-state">
              {feed.review ? "이번 주 학습이 아직 없어요." : <>아직 준비된 학습이 없어요.<br />매일 아침 6시에 새 레슨이 올라옵니다.</>}
              {feed.error && <div className="en-err">({feed.error})</div>}
            </div>
          ) : (
            <>
              {!feed.review && <div className="en-date">{fmtDate(feed.date)}</div>}
              <div className="en-list">
                {feed.items.map((l) => (
                  feed.review
                    ? <div key={l.id}><div className="en-pastdate">{fmtDate(l.lesson_date)}</div><LessonCard lesson={l} lang={lang} /></div>
                    : <LessonCard key={l.id} lesson={l} lang={lang} />
                ))}
              </div>
            </>
          )}

          {!feed.review && (
            <button type="button" className="en-past" onClick={loadPast}>
              {past.open ? "지난 학습 접기" : "지난 학습 보기"}
            </button>
          )}
          {!feed.review && past.open && (
            <div className="en-list">
              {past.loading ? (
                <div className="en-state">불러오는 중…</div>
              ) : past.items.length === 0 ? (
                <div className="en-state">지난 학습이 없습니다.</div>
              ) : (
                past.items.map((l) => (
                  <div key={l.id}>
                    <div className="en-pastdate">{fmtDate(l.lesson_date)}</div>
                    <LessonCard lesson={l} lang={lang} />
                  </div>
                ))
              )}
            </div>
          )}
        </>
      )}

      <p className="en-foot">
        뉴스·영상 지문은 원문을 그대로 옮긴 것이 아니라 사실만 추려 학습용으로 다시 쓴 글이고(원문은 각 카드의 링크),
        이디엄 예문·대화도 실제 작품 대사 인용이 아니라 새로 쓴 것입니다.
      </p>

      <BottomNav active="english" />

      <style jsx>{`
        .en { max-width: 480px; margin: 0 auto; padding: 0 14px calc(env(safe-area-inset-bottom, 0px) + 96px); font-family: var(--font-sans); color: var(--color-ink); min-height: 100vh; background: var(--color-bg); }
        .en-hd { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; margin: 6px 2px 14px; }
        .en-hd h1 { font-size: 22px; font-weight: 800; letter-spacing: -.5px; margin: 0; }
        .en-sub { font-size: 12px; font-weight: 600; color: var(--color-ink-3); }
        .en-langs { display: flex; gap: 8px; margin-bottom: 10px; }
        .en-langs button { flex: 1 1 0; padding: 8px; border-radius: 10px; border: 1px solid var(--color-line); background: var(--color-card); color: var(--color-ink-2); font-size: .8rem; font-weight: 700; cursor: pointer; font-family: var(--font-sans); }
        .en-langs button.on { background: var(--color-ink); border-color: var(--color-ink); color: #fff; }
        .en-tabs { display: flex; gap: 8px; margin-bottom: 14px; }
        .en-tabs button { flex: 1 1 0; padding: 10px; border-radius: 10px; border: 1px solid var(--color-line); background: var(--color-card); color: var(--color-ink-2); font-size: .85rem; font-weight: 800; cursor: pointer; font-family: var(--font-sans); }
        .en-tabs button.on { background: var(--color-primary); border-color: var(--color-primary); color: #fff; }
        /* 하위 메뉴 — 대메뉴보다 작게·연하게(계층 구분). 알약형. */
        .en-subtabs { display: flex; gap: 6px; margin: 0 0 14px; padding-left: 6px; }
        .en-subtabs button { padding: 6px 13px; border-radius: 999px; border: 1px solid var(--color-line); background: var(--color-card); color: var(--color-ink-3); font-size: .76rem; font-weight: 700; cursor: pointer; font-family: var(--font-sans); }
        .en-subtabs button.on { background: var(--color-primary-soft); border-color: var(--color-primary); color: var(--color-primary); }
        .en-date { font-size: .78rem; font-weight: 700; color: var(--color-ink-3); margin: 0 2px 10px; }
        .en-pastdate { font-size: .74rem; font-weight: 700; color: var(--color-ink-3); margin: 0 2px 6px; }
        .en-list { display: flex; flex-direction: column; gap: 14px; }
        .en-state { font-size: .85rem; color: var(--color-ink-2); text-align: center; padding: 32px 8px; line-height: 1.7; }
        .en-err { font-size: .72rem; color: var(--color-ink-3); margin-top: 6px; }
        .en-past { width: 100%; margin-top: 16px; padding: 11px; border-radius: 10px; border: 1px solid var(--color-line); background: var(--color-card); color: var(--color-ink-2); font-size: .82rem; font-weight: 700; cursor: pointer; font-family: var(--font-sans); }
        .en-weekend { width: 100%; margin: 4px 0 10px; padding: 12px 14px; border-radius: 12px; border: 1px solid var(--color-primary-soft); background: var(--color-primary-soft); color: var(--color-ink); font-size: .8rem; font-weight: 700; cursor: pointer; font-family: var(--font-sans); text-align: left; }
        .en-weekend b { color: var(--color-primary); }
        .en-foot { font-size: .72rem; color: var(--color-ink-3); text-align: center; margin-top: 18px; line-height: 1.6; word-break: keep-all; }
      `}</style>
      <style jsx global>{`body { background: var(--color-bg); margin: 0; }`}</style>
    </div>
  );
}
