// [S24-10] 언어별 연속 재생 — 한 편이 끝나면 자동으로 다음. 현재 항목 강조·이전/다음/정지.
//   ★MediaSession 필수(연속 재생인데 잠금화면 제어 없으면 못 쓴다).
//   ★미리 다 만들지 않는다 — 다음 한 편만 preload(셀룰러·:5005 보호).
//   ★이어 듣기 위치 기억(localStorage, 기기별이 자연스러워 SYNC 대상 아님).
import { useRef, useState, useEffect, useCallback } from "react";

export default function AudioPlaylist({ items = [], storageKey = "onehub_listen_pos", title = "오늘의 듣기" }) {
  const [idx, setIdx] = useState(-1);       // -1 = 정지
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const save = (i) => { try { localStorage.setItem(storageKey, String(i)); } catch (e) {} };
  const stop = useCallback(() => { const a = audioRef.current; if (a) { try { a.pause(); } catch (e) {} } setPlaying(false); }, []);

  const playAt = useCallback((i) => {
    const list = itemsRef.current;
    if (i < 0 || i >= list.length) { stop(); return; }
    let a = audioRef.current;
    if (!a) {
      a = new Audio();
      audioRef.current = a;
      a.onended = () => { const cur = a._i; const n = (cur == null ? 0 : cur) + 1; if (n < itemsRef.current.length) playAt(n); else { setPlaying(false); } };
      a.onerror = () => setPlaying(false);
    }
    a._i = i;
    a.src = list[i].src;
    setIdx(i); save(i);
    a.play().then(() => {
      setPlaying(true);
      try {
        if ("mediaSession" in navigator && window.MediaMetadata) {
          navigator.mediaSession.metadata = new window.MediaMetadata({ title: list[i].title || "ONE·HUB 듣기", artist: "ONE·HUB · 오늘의 듣기" });
          navigator.mediaSession.setActionHandler("play", () => playAt(a._i));
          navigator.mediaSession.setActionHandler("pause", stop);
          navigator.mediaSession.setActionHandler("previoustrack", () => playAt(a._i - 1));
          navigator.mediaSession.setActionHandler("nexttrack", () => playAt(a._i + 1));
        }
      } catch (e) {}
    }).catch(() => setPlaying(false));
  }, [stop]);

  // 이어 듣기 위치 복원(자동 재생은 하지 않음 — iOS 제스처 필요). idx 만 세팅.
  useEffect(() => {
    try { const s = localStorage.getItem(storageKey); if (s != null) { const i = parseInt(s, 10); if (i >= 0 && i < items.length) setIdx(i); } } catch (e) {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length, storageKey]);

  // 다음 한 편만 preload.
  useEffect(() => {
    if (idx >= 0 && idx + 1 < items.length) { try { const p = new Audio(); p.preload = "metadata"; p.src = items[idx + 1].src; } catch (e) {} }
  }, [idx, items]);

  useEffect(() => () => stop(), [stop]);

  if (!items.length) return null;
  const startIdx = idx >= 0 ? idx : 0;
  return (
    <section className="apl">
      <div className="apl-h">{title}</div>
      <div className="apl-ctrl">
        <button type="button" className="apl-b" onClick={() => playAt(Math.max(0, startIdx - 1))} disabled={startIdx <= 0} aria-label="이전">⏮</button>
        <button type="button" className="apl-b p" onClick={() => (playing ? stop() : playAt(startIdx))} aria-label={playing ? "정지" : "이어 듣기"}>{playing ? "⏸ 정지" : "▶ 이어 듣기"}</button>
        <button type="button" className="apl-b" onClick={() => playAt(startIdx + 1)} disabled={startIdx >= items.length - 1} aria-label="다음">⏭</button>
      </div>
      <ol className="apl-list">
        {items.map((it, i) => (
          <li key={it.id ?? i}>
            <button type="button" className={`apl-row ${i === idx ? "on" : ""}`} onClick={() => playAt(i)}>
              <span className="apl-n">{i + 1}</span>
              <span className="apl-t">{it.title || `${i + 1}편`}</span>
              {i === idx && playing && <span className="apl-eq" aria-hidden>♪</span>}
            </button>
          </li>
        ))}
      </ol>
      <style jsx>{`
        .apl { background: var(--color-card); border: 1px solid var(--color-line); border-radius: 14px; padding: 14px; margin-top: 14px; }
        .apl-h { font-size: 0.86rem; font-weight: 800; color: var(--color-ink); margin-bottom: 10px; }
        .apl-ctrl { display: flex; gap: 8px; margin-bottom: 10px; }
        .apl-b { border: 1px solid var(--color-line); background: var(--color-card); color: var(--color-ink-2); border-radius: 10px; padding: 9px 12px; font-size: 0.82rem; font-weight: 700; font-family: var(--font-sans); cursor: pointer; }
        .apl-b.p { flex: 1; border-color: var(--color-primary); background: var(--color-primary); color: #fff; }
        .apl-b:disabled { opacity: 0.4; cursor: default; }
        .apl-list { list-style: none; margin: 0; padding: 0; }
        .apl-row { display: flex; align-items: center; gap: 10px; width: 100%; text-align: left; background: none; border: none; border-bottom: 1px solid var(--color-line); padding: 9px 2px; cursor: pointer; font-family: var(--font-sans); }
        .apl-row.on { color: var(--color-primary); }
        .apl-n { flex: none; width: 20px; font-size: 0.72rem; color: var(--color-ink-3); font-variant-numeric: tabular-nums; }
        .apl-t { flex: 1; min-width: 0; font-size: 0.82rem; color: var(--color-ink-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .apl-row.on .apl-t { color: var(--color-primary); font-weight: 700; }
        .apl-eq { flex: none; color: var(--color-primary); }
      `}</style>
    </section>
  );
}
