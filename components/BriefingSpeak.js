// [S24-9] 오늘 브리핑 읽어주기 버튼 — 한국어(edge-tts, /api/english/speak?language=ko).
//   ★iOS Safari 는 사용자 제스처 없이 audio.play() 를 막는다 → 반드시 버튼 탭에서 시작(자동재생 없음).
//   ★MediaSession 설정 — 화면을 잠가도 재생이 이어지고 잠금화면에 제목이 뜬다(출퇴근용 핵심).
//   같은 대본은 백엔드가 (text) 해시로 캐시 → 두 번 요청해도 TTS 는 한 번만.
import { useRef, useState, useEffect } from "react";
import { earn } from "../lib/activityToken"; // [S24-12] 브리핑 청취 완료 토큰
import { getTrader } from "../lib/trader";

export default function BriefingSpeak({ script }) {
  const [state, setState] = useState("idle"); // idle | loading | playing
  const audioRef = useRef(null);

  const stop = () => {
    const a = audioRef.current;
    if (a) { try { a.pause(); a.currentTime = 0; } catch (e) {} }
    setState("idle");
  };

  useEffect(() => () => { const a = audioRef.current; if (a) { try { a.pause(); } catch (e) {} } }, []);

  const play = () => {
    if (!script) return;
    let a = audioRef.current;
    if (!a) {
      a = new Audio();
      audioRef.current = a;
      a.onended = () => { setState("idle"); try { earn("briefing", getTrader()); } catch (e) {} }; // [S24-12] 끝까지 들었을 때만
      a.onerror = () => setState("idle");
    }
    a.src = `/api/english/speak?text=${encodeURIComponent(script)}&language=ko`;
    setState("loading");
    a.play().then(() => {
      setState("playing");
      try {
        if ("mediaSession" in navigator && window.MediaMetadata) {
          navigator.mediaSession.metadata = new window.MediaMetadata({ title: "오늘의 자산 브리핑", artist: "ONE·HUB" });
          navigator.mediaSession.setActionHandler("pause", stop);
          navigator.mediaSession.setActionHandler("stop", stop);
          navigator.mediaSession.setActionHandler("play", play);
        }
      } catch (e) {}
    }).catch(() => setState("idle"));
  };

  if (!script) return null;
  const busy = state === "playing" || state === "loading";
  return (
    <button type="button" className="brf-speak" onClick={busy ? stop : play} aria-label="오늘 브리핑 듣기">
      {state === "playing" ? "⏸ 정지" : state === "loading" ? "… 준비" : "🔊 들려주기"}
      <style jsx>{`
        .brf-speak { border: 1px solid var(--color-line); background: var(--color-card); color: var(--color-ink-2); border-radius: 999px; padding: 4px 11px; font-size: 0.72rem; font-weight: 700; font-family: var(--font-sans); cursor: pointer; white-space: nowrap; }
      `}</style>
    </button>
  );
}
