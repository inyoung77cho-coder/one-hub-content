// [ENG] 매일 영어 — 경제/디스플레이 뉴스 지문 + 유튜브 영상, 하루 각 1건.
//   백엔드 = onehub-english.service(:5005), 프록시 = /api/english/[fn].
//   학습 흐름은 ①먼저 듣기(대본 가림) → ②지문·표현 읽기 → ③다시 듣기 3단계.
//   지문은 원문 복사가 아니라 사실만 추려 다시 쓴 학습용 텍스트(원문은 링크로).
import { useCallback, useEffect, useRef, useState } from "react";
import AppHeader from "../../components/AppHeader";
import BottomNav from "../../components/BottomNav";

const TABS = [
  ["news", "📰", "뉴스"],
  ["video", "▶️", "영상"],
  ["idiom", "💬", "이디엄"],
  ["review", "📝", "주간복습"],
];
// 중국어 모드에서 탭 글자를 중국어로 — "생활중국어"(4글자)처럼 길어지면 그 버튼만
// box 가 커져 나머지 탭과 크기가 안 맞는다. 전부 한자 2글자로 맞춰 폭을 통일한다.
const TABS_ZH_LABEL = { news: "新闻", video: "视频", idiom: "口语", review: "复习" };
const LANGS = [
  ["en", "🇬🇧", "영어"],
  ["zh", "🇨🇳", "중국어"],
];
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

export default function EnglishPage() {
  const [lang, setLang] = useState("en");
  const [tab, setTab] = useState("news");
  const [feed, setFeed] = useState({ loading: true, date: null, items: [], error: null });
  const [past, setPast] = useState({ open: false, loading: false, items: [] });
  const [weekly, setWeekly] = useState({ loading: true, data: null });

  const switchLang = (next) => setLang(next);

  useEffect(() => {
    let alive = true;
    if (tab === "review") {
      setWeekly({ loading: true, data: null });
      fetch(`/api/english/weekly-review?language=${lang}`)
        .then((r) => r.json())
        .then((d) => { if (alive) setWeekly({ loading: false, data: d }); })
        .catch(() => alive && setWeekly({ loading: false, data: { expressions: [], words: [] } }));
      return () => { alive = false; };
    }
    setFeed({ loading: true, date: null, items: [], error: null });
    setPast({ open: false, loading: false, items: [] });
    fetch(`/api/english/today?medium=${tab}&language=${lang}`)
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        setFeed({ loading: false, date: d.date, items: d.items || [], error: d.error || null });
      })
      .catch(() => alive && setFeed({ loading: false, date: null, items: [], error: "연결 실패" }));
    return () => {
      alive = false;
    };
  }, [tab, lang]);

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
        <h1>{lang === "zh" ? "🇨🇳 매일 중국어" : "🇬🇧 매일 영어"}</h1>
        <span className="en-sub">
          {lang === "zh"
            ? "경제 · 디스플레이 뉴스/영상 + 오늘의 생활중국어(HSK4-5)"
            : "경제 · 디스플레이 뉴스/영상 + 오늘의 이디엄"}
        </span>
      </div>

      <div className="en-langs" role="tablist">
        {LANGS.map(([key, ic, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={lang === key}
            className={lang === key ? "on" : ""}
            onClick={() => switchLang(key)}
          >
            <span aria-hidden="true">{ic}</span> {label}
          </button>
        ))}
      </div>

      <div className="en-tabs" role="tablist">
        {TABS.map(([key, ic, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            className={tab === key ? "on" : ""}
            onClick={() => setTab(key)}
          >
            <span aria-hidden="true">{ic}</span> {lang === "zh" ? TABS_ZH_LABEL[key] : label}
          </button>
        ))}
      </div>

      {tab === "review" ? (
        <WeeklyReview weekly={weekly} lang={lang} />
      ) : feed.loading ? (
        <div className="en-state">불러오는 중…</div>
      ) : feed.items.length === 0 ? (
        <div className="en-state">
          아직 준비된 학습이 없어요.
          <br />
          매일 아침 6시에 새 레슨이 올라옵니다.
          {feed.error && <div className="en-err">({feed.error})</div>}
        </div>
      ) : (
        <>
          <div className="en-date">{fmtDate(feed.date)}</div>
          <div className="en-list">
            {feed.items.map((l) => (
              <LessonCard key={l.id} lesson={l} lang={lang} />
            ))}
          </div>
        </>
      )}

      {tab !== "review" && (
      <button type="button" className="en-past" onClick={loadPast}>
        {past.open ? "지난 학습 접기" : "지난 학습 보기"}
      </button>
      )}
      {tab !== "review" && past.open && (
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
        .en-foot { font-size: .72rem; color: var(--color-ink-3); text-align: center; margin-top: 18px; line-height: 1.6; word-break: keep-all; }
      `}</style>
      <style jsx global>{`body { background: var(--color-bg); margin: 0; }`}</style>
    </div>
  );
}
