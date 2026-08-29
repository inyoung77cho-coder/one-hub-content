// [ENG] 매일 영어 — 경제/디스플레이 뉴스 지문 + 유튜브 영상, 하루 각 1건.
//   백엔드 = onehub-english.service(:5005), 프록시 = /api/english/[fn].
//   학습 흐름은 ①먼저 듣기(대본 가림) → ②지문·표현 읽기 → ③다시 듣기 3단계.
//   지문은 원문 복사가 아니라 사실만 추려 다시 쓴 학습용 텍스트(원문은 링크로).
import { useCallback, useEffect, useRef, useState } from "react";
import AppHeader from "../../components/AppHeader";
import BottomNav from "../../components/BottomNav";

// 상단 모드 = 경제영어(en) / 중국어(zh) / 라이브영어(live). live는 독립 탭(하위 탭 없음).
const MODES = [
  ["en", "💼", "경제영어"],
  ["zh", "🇨🇳", "중국어"],
  ["live", "🎬", "라이브영어"],
];
// 경제영어·중국어 하위 탭 — 매체 공통, 라벨만 언어별(영어: 뉴스/영상/이디엄, 중국어: 신문/영상/구어).
const TABS = [
  ["news", "📰"],
  ["video", "▶️"],
  ["idiom", "💬"],
];
const TAB_LABEL = {
  en: { news: "뉴스", video: "영상", idiom: "이디엄" },
  zh: { news: "신문", video: "영상", idiom: "구어" },
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

function LiveEnglish({ lang }) {
  const [exprs, setExprs] = useState(null);
  const [videos, setVideos] = useState([]);
  const [vidIdx, setVidIdx] = useState(0);
  const [cap, setCap] = useState(null); // 영상 위 자막 {words, idx}
  useEffect(() => {
    let alive = true;
    setExprs(null); setVideos([]); setVidIdx(0); setCap(null);
    // [재미있는 생활영어] 이디엄(생활영어) 표현 우선 + 주간 표현 보강 — 경제 지문 대신 회화 표현.
    Promise.all([
      fetch(`/api/english/lessons?medium=idiom&language=${lang}&limit=7`).then((r) => r.json()).catch(() => ({ items: [] })),
      fetch(`/api/english/weekly-review?language=${lang}`).then((r) => r.json()).catch(() => ({ expressions: [] })),
    ]).then(([idiomD, wk]) => {
      if (!alive) return;
      const pool = [
        ...(idiomD.items || []).flatMap((l) => l.expressions || []),
        ...(wk.expressions || []),
      ];
      const seen = new Set();
      const all = pool.filter((e) => {
        const k = (e.example_en || "").trim().toLowerCase();
        if (!k || seen.has(k)) return false;
        seen.add(k); return true;
      }).slice(0, 15);
      setExprs(all);
    });
    // [재미있는 생활영어 유튜브] 큐레이션 채널(BBC Learning English·Vanessa·TV Series 등) 최신 영상.
    fetch(`/api/english/live-videos`).then((r) => r.json())
      .then((d) => { if (alive) setVideos((d.items || []).filter((x) => x.video_id)); })
      .catch(() => {});
    return () => { alive = false; };
  }, [lang]);

  if (exprs == null) return <div className="en-state">불러오는 중…</div>;
  const video = videos[vidIdx] || null;
  return (
    <div className="live">
      <div className="live-intro">🎬 <b>Live English</b> — 영상 위에 표현 <b>자막이 얹히고</b>, 발음에 맞춰 <b>단어가 하이라이트</b>됩니다. 경제 밖 <b>재미있는 생활영어</b> 표현으로 따라 읽어요.</div>
      <div className="live-vid">
        {video?.video_id
          ? <iframe src={`https://www.youtube.com/embed/${video.video_id}`} title={video.title || "video"}
              allow="accelerometer; encrypted-media; picture-in-picture" allowFullScreen loading="lazy" />
          : <div className="live-vph">🎬 생활영어 영상 불러오는 중…</div>}
        {cap && cap.words.length > 0 && (
          <div className="live-cap">
            {cap.words.map((w, i) => <span key={i} className={i === cap.idx ? "on" : ""}>{w} </span>)}
          </div>
        )}
      </div>
      {video && (
        <div className="live-vcap">
          <span className="live-vtitle">▶ {video.channel} · {video.title}</span>
          {videos.length > 1 && (
            <button type="button" className="live-next" onClick={() => { setCap(null); setVidIdx((i) => (i + 1) % videos.length); }}>다른 영상 →</button>
          )}
        </div>
      )}
      {!exprs.length ? (
        <div className="en-state">표현이 아직 없어요. 이디엄 탭에서 학습하면 여기에 모입니다.</div>
      ) : exprs.map((e, i) => (
        <div className="live-card" key={i}>
          <Karaoke text={e.example_en} lang={lang}
            onActive={(w, idx) => setCap({ words: w, idx })} onClear={() => setCap(null)} />
          <div className="live-mean"><b>{e.expr}</b> — {e.meaning_ko}</div>
          {e.example_ko && <div className="live-ko">{e.example_ko}</div>}
        </div>
      ))}
      <style jsx>{`
        .live { display: flex; flex-direction: column; gap: 14px; padding: 4px 2px 20px; }
        .live-intro { font-size: .78rem; color: var(--color-ink-2); line-height: 1.6; background: var(--color-card-soft); border-radius: 12px; padding: 12px 14px; word-break: keep-all; }
        .live-intro b { color: var(--color-primary); }
        .live-vid { position: relative; border-radius: 14px; overflow: hidden; box-shadow: var(--shadow-card); }
        .live-vid iframe { width: 100%; aspect-ratio: 16/9; border: 0; display: block; }
        .live-vph { width: 100%; aspect-ratio: 16/9; display: flex; align-items: center; justify-content: center; background: var(--color-card-soft); color: var(--color-ink-3); font-size: 1rem; font-weight: 700; }
        .live-cap { position: absolute; left: 0; right: 0; bottom: 0; padding: 12px 14px 14px; background: linear-gradient(transparent, rgba(0,0,0,.82)); color: #fff; font-size: 1.2rem; font-weight: 800; line-height: 1.4; text-align: center; pointer-events: none; }
        .live-cap span { padding: 0 1px; border-radius: 4px; transition: color .1s, background .1s; }
        .live-cap span.on { color: #191600; background: #ffd54a; }
        .live-vcap { display: flex; align-items: center; gap: 8px; font-size: .74rem; font-weight: 700; color: var(--color-ink-2); padding: 8px 12px; background: var(--color-card); border-radius: 10px; }
        .live-vtitle { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .live-next { flex-shrink: 0; border: 1px solid var(--color-line); background: var(--color-card-soft); color: var(--color-primary); border-radius: 8px; padding: 5px 9px; font-size: .7rem; font-weight: 800; cursor: pointer; font-family: inherit; }
        .live-card { background: var(--color-card); border: 1px solid var(--color-line); border-radius: 16px; padding: 18px 16px; box-shadow: var(--shadow-card); }
        .live-mean { margin-top: 12px; font-size: .82rem; color: var(--color-ink-2); word-break: keep-all; }
        .live-mean b { color: var(--color-primary); font-weight: 800; }
        .live-ko { margin-top: 4px; font-size: .78rem; color: var(--color-ink-3); }
      `}</style>
    </div>
  );
}

export default function EnglishPage() {
  const [mode, setMode] = useState("en");        // en(경제영어) / zh(중국어) / live(라이브영어)
  const [tab, setTab] = useState("news");
  const [feed, setFeed] = useState({ loading: true, date: null, items: [], error: null, review: false });
  const [past, setPast] = useState({ open: false, loading: false, items: [] });

  const lang = mode === "zh" ? "zh" : "en";
  const isWeekend = [0, 6].includes(new Date().getDay());

  useEffect(() => {
    if (mode === "live") return;                 // LiveEnglish가 자체 로드
    let alive = true;
    setFeed({ loading: true, date: null, items: [], error: null, review: false });
    setPast({ open: false, loading: false, items: [] });
    if (isWeekend) {
      // [주말 복습] 새 콘텐츠 없이 그 주 이 매체 레슨을 복습으로 보여준다(뉴스/영상/이디엄 각각).
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
        <h1>{mode === "live" ? "🎬 라이브 영어" : mode === "zh" ? "🇨🇳 매일 중국어" : "💼 경제 영어"}</h1>
        <span className="en-sub">
          {mode === "live"
            ? "영상 몰입 + 표현 카라오케 — 자막 단어를 발음에 맞춰 따라 읽기"
            : mode === "zh"
            ? "경제 · 디스플레이 신문/영상 + 오늘의 구어(HSK4-5)"
            : "경제 · 디스플레이 뉴스/영상 + 오늘의 이디엄"}
        </span>
      </div>

      <div className="en-langs" role="tablist">
        {MODES.map(([key, ic, label]) => (
          <button key={key} type="button" role="tab" aria-selected={mode === key}
            className={mode === key ? "on" : ""} onClick={() => setMode(key)}>
            <span aria-hidden="true">{ic}</span> {label}
          </button>
        ))}
      </div>

      {mode !== "live" && (
        <div className="en-tabs" role="tablist">
          {TABS.map(([key, ic]) => (
            <button key={key} type="button" role="tab" aria-selected={tab === key}
              className={tab === key ? "on" : ""} onClick={() => setTab(key)}>
              <span aria-hidden="true">{ic}</span> {TAB_LABEL[lang][key]}
            </button>
          ))}
        </div>
      )}

      {mode === "live" ? (
        <LiveEnglish lang="en" />
      ) : (
        <>
          {feed.review && (
            <div className="en-review-hd">📚 주말 <b>이번 주 복습</b> · {TAB_LABEL[lang][tab]} — 주말엔 새 학습 대신 이번 주 것을 다시 봐요.</div>
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
