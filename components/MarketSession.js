// components/MarketSession.js
// [FB-3 §3.5] 관심종목 카드 시각 표기 — 의미 없는 '방금' 대신 한국 증시 세션(장중/장마감/장전/주말)을
//   표기해 '매매 시간에 맞춰' 맥락을 준다. 스코어링은 장중에 의미가 크고, 장 마감 후엔 다음 장에 갱신된다.
//   KST(UTC+9) 기준. 하이드레이션 불일치 방지를 위해 마운트 후에만 렌더.
import { useEffect, useState } from "react";
import { getKrxSession, getNxtSession } from "../lib/marketHours";

// [2026-08-27 버그 수정] 이 파일이 자체적으로 09:00~15:30만 아는 옛 시간표를 갖고 있어서
//   08:00 NXT 프리마켓 시작이 화면에 전혀 안 보였다(사용자 리포트) — lib/marketHours.js가
//   이미 NXT 08:00 개장을 포함해 정확히 갖고 있으므로 그걸 그대로 재사용한다(중복 로직 제거).
function session() {
  const now = new Date();
  const kst = new Date(now.getTime() + (now.getTimezoneOffset() + 540) * 60000);
  const hm = kst.getHours() * 60 + kst.getMinutes();
  const hhmm = `${String(kst.getHours()).padStart(2, "0")}:${String(kst.getMinutes()).padStart(2, "0")}`;
  const krx = getKrxSession(now);
  const nxt = getNxtSession(now);

  if (krx.key === "closed_weekend") return { txt: "주말 · 장 마감", dot: "off", time: hhmm };
  if (hm < 8 * 60) return { txt: "장 시작 전 · 08:00 NXT 프리마켓", dot: "wait", time: hhmm };
  if (nxt.phase === "pre") return { txt: "NXT 프리마켓 진행중 · 09:00 KRX 개장", dot: "wait", time: hhmm };
  if (krx.phase === "regular") return { txt: "장중 · 기술점수 실시간", dot: "live", time: hhmm };
  if (krx.phase === "call") return { txt: `${krx.label} · 09:00 개장`, dot: "wait", time: hhmm };
  return { txt: "장 마감 · 다음 장에 갱신", dot: "off", time: hhmm };
}

export default function MarketSession() {
  const [s, setS] = useState(null);
  useEffect(() => {
    setS(session());
    const t = setInterval(() => setS(session()), 60000);
    return () => clearInterval(t);
  }, []);
  if (!s) return null;
  return (
    <span className={`ms ms-${s.dot}`}>
      <span className="ms-dot" aria-hidden="true" />
      {s.txt}<span className="ms-t"> · {s.time} KST</span>
      <style jsx>{`
        .ms { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; font-weight: 700; color: var(--color-ink-3, #94a3b8); font-family: var(--font-sans, inherit); font-variant-numeric: tabular-nums; }
        .ms-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--color-ink-3, #94a3b8); flex-shrink: 0; }
        .ms-live .ms-dot { background: var(--color-success, #22c55e); }
        .ms-wait .ms-dot { background: var(--color-warning, #f97316); }
        .ms-off .ms-dot { background: var(--color-ink-3, #94a3b8); }
        .ms-t { opacity: 0.8; }
      `}</style>
    </span>
  );
}
