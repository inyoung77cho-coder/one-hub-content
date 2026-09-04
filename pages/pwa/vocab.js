// [S25-7] 내 단어장 — 별로 담은 표현·단어를 언제든 리마인드. 언어 필터·정렬·전체 듣기·복습(기억남/가물).
//   리마인드는 4단계 라이트닝(lib/vocabNote). 판정 버튼은 두 개. 별개 URL(/pwa/vocab).
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/router";
import AppHeader from "../../components/AppHeader";
import BottomNav from "../../components/BottomNav";
import AudioPlaylist from "../../components/shared/AudioPlaylist";
import { getTrader } from "../../lib/trader";
import { getVocab, review as reviewVocab, dueForReview, toggleSave } from "../../lib/vocabNote";

const LANGS = [["all", "전체"], ["en", "영어"], ["zh", "중국어"]];

export default function VocabPage() {
  const router = useRouter();
  const [lang, setLang] = useState("all");
  const [order, setOrder] = useState("recent"); // recent | old
  const [list, setList] = useState([]);
  const [tick, setTick] = useState(0);

  const load = useCallback(() => {
    try { setList(getVocab(getTrader())); } catch (e) { setList([]); }
  }, []);
  useEffect(() => { load(); const on = () => load(); window.addEventListener("onehub-vocab-change", on); window.addEventListener("onehub-trader-change", on); return () => { window.removeEventListener("onehub-vocab-change", on); window.removeEventListener("onehub-trader-change", on); }; }, [load]);

  const filtered = list
    .filter((v) => lang === "all" || v.lang === (lang === "en" ? "en" : "zh"))
    .sort((a, b) => (order === "recent" ? (b.savedAt || 0) - (a.savedAt || 0) : (a.savedAt || 0) - (b.savedAt || 0)));
  const due = (() => { try { return dueForReview(getTrader()); } catch (e) { return []; } })();
  const dueIds = new Set(due.map((x) => x.id));

  const playItems = filtered.map((v) => ({ id: v.id, title: `${v.text}${v.meaning ? ` — ${v.meaning}` : ""}`, src: `/api/english/speak?text=${encodeURIComponent(v.text)}&language=${v.lang === "zh" ? "zh" : "en"}` }));

  const doReview = (id, remembered) => { try { reviewVocab(id, remembered, getTrader()); } catch (e) {} setTick((t) => t + 1); load(); };
  const remove = (v) => { try { toggleSave({ lang: v.lang, text: v.text }, getTrader()); } catch (e) {} load(); };

  return (
    <div className="vc-wrap">
      <AppHeader />
      <main className="vc-main">
        <h1 className="vc-title">⭐ 내 단어장 <span className="vc-n">{list.length}</span></h1>
        {due.length > 0 && <p className="vc-due">오늘 복습할 것 {due.length}개 · 아래에서 <b>기억남/가물</b>로 남기면 다음 복습 간격이 정해집니다.</p>}

        <div className="vc-filters">
          <div className="vc-seg">{LANGS.map(([k, l]) => <button key={k} className={lang === k ? "on" : ""} onClick={() => setLang(k)}>{l}</button>)}</div>
          <button className="vc-order" onClick={() => setOrder((o) => (o === "recent" ? "old" : "recent"))}>{order === "recent" ? "최근순" : "오래된순"}</button>
        </div>

        {filtered.length === 0 ? (
          <div className="vc-card"><p className="vc-empty">담은 표현·단어가 없어요. 듣는 경제에서 표현 옆 <b>☆</b>를 누르면 여기에 쌓입니다.</p></div>
        ) : (
          <>
            {playItems.length >= 2 && <AudioPlaylist items={playItems} storageKey={`onehub_vocab_pos_${lang}`} title={`전체 듣기 · ${playItems.length}개`} />}
            <div className="vc-list">
              {filtered.map((v) => (
                <div key={v.id} className={`vc-item ${dueIds.has(v.id) ? "due" : ""}`}>
                  <div className="vc-item-top">
                    <span className="vc-text">{v.text}</span>
                    <span className="vc-box">Box {v.box || 1}</span>
                    <button className="vc-x" onClick={() => remove(v)} aria-label="빼기">★</button>
                  </div>
                  {v.meaning && <div className="vc-mean">{v.meaning}</div>}
                  <div className="vc-rv">
                    <button className="vc-rb ok" onClick={() => doReview(v.id, true)}>기억남</button>
                    <button className="vc-rb no" onClick={() => doReview(v.id, false)}>가물</button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </main>
      <BottomNav active="english" />
      <style jsx>{`
        .vc-wrap { min-height: 100vh; background: var(--color-bg); padding-bottom: var(--nav-clearance-fab); }
        .vc-main { max-width: 560px; margin: 0 auto; padding: 12px 14px 40px; }
        .vc-title { font-size: 1.1rem; font-weight: 800; color: var(--color-ink); margin: 6px 0 4px; }
        .vc-n { font-size: 0.8rem; color: var(--color-ink-3); }
        .vc-due { font-size: 0.8rem; color: var(--color-ink-2); background: var(--color-warning-soft, var(--inset-bg, rgba(0,0,0,0.04))); border-radius: 10px; padding: 9px 12px; margin: 6px 0 12px; word-break: keep-all; }
        .vc-filters { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
        .vc-seg { display: flex; gap: 2px; background: var(--inset-bg, rgba(0,0,0,0.04)); border-radius: 9px; padding: 2px; }
        .vc-seg button { border: none; background: transparent; color: var(--color-ink-3); border-radius: 7px; padding: 6px 12px; font-size: 0.76rem; font-weight: 700; font-family: var(--font-sans); cursor: pointer; }
        .vc-seg button.on { background: var(--color-card); color: var(--color-ink); }
        .vc-order { margin-left: auto; border: 1px solid var(--color-line); background: var(--color-card); color: var(--color-ink-2); border-radius: 8px; padding: 6px 12px; font-size: 0.76rem; font-weight: 700; font-family: var(--font-sans); cursor: pointer; }
        .vc-card { background: var(--color-card); border: 1px solid var(--color-line); border-radius: 14px; padding: 16px; }
        .vc-empty { font-size: 0.82rem; color: var(--color-ink-2); line-height: 1.55; margin: 0; word-break: keep-all; }
        .vc-list { display: flex; flex-direction: column; gap: 10px; margin-top: 12px; }
        .vc-item { background: var(--color-card); border: 1px solid var(--color-line); border-radius: 12px; padding: 12px; }
        .vc-item.due { border-color: var(--color-primary); }
        .vc-item-top { display: flex; align-items: center; gap: 8px; }
        .vc-text { font-size: 0.92rem; font-weight: 800; color: var(--color-ink); }
        .vc-box { font-size: 0.64rem; font-weight: 700; color: var(--color-ink-3); background: var(--inset-bg, rgba(0,0,0,0.04)); border-radius: 999px; padding: 2px 7px; }
        .vc-x { margin-left: auto; border: none; background: none; color: var(--color-warning-ink, #f59e0b); font-size: 1rem; cursor: pointer; }
        .vc-mean { font-size: 0.8rem; color: var(--color-ink-2); margin-top: 3px; }
        .vc-rv { display: flex; gap: 8px; margin-top: 10px; }
        .vc-rb { flex: 1; border: 1px solid var(--color-line); background: var(--color-card); border-radius: 9px; padding: 8px; font-size: 0.8rem; font-weight: 700; font-family: var(--font-sans); cursor: pointer; }
        .vc-rb.ok { border-color: var(--color-primary); color: var(--color-primary); }
        .vc-rb.no { color: var(--color-ink-2); }
      `}</style>
    </div>
  );
}
