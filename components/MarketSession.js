// components/MarketSession.js
// [FB-3 §3.5] 관심종목 카드 시각 표기 — 의미 없는 '방금' 대신 한국 증시 세션(장중/장마감/장전/주말)을
//   표기해 '매매 시간에 맞춰' 맥락을 준다. 스코어링은 장중에 의미가 크고, 장 마감 후엔 다음 장에 갱신된다.
//   KST(UTC+9) 기준. 하이드레이션 불일치 방지를 위해 마운트 후에만 렌더.
import { useEffect, useState } from "react";

function session() {
  const now = new Date();
  // 로컬 타임존과 무관하게 KST 벽시계 계산
  const kst = new Date(now.getTime() + (now.getTimezoneOffset() + 540) * 60000);
  const day = kst.getDay();               // 0 일 … 6 토
  const hm = kst.getHours() * 60 + kst.getMinutes();
  const hhmm = `${String(kst.getHours()).padStart(2, "0")}:${String(kst.getMinutes()).padStart(2, "0")}`;
  if (day === 0 || day === 6) return { txt: "주말 · 장 마감", dot: "off", time: hhmm };
  if (hm < 540) return { txt: "장 시작 전 · 09:00 개장", dot: "wait", time: hhmm };   // 09:00
  if (hm <= 930) return { txt: "장중 · 기술점수 실시간", dot: "live", time: hhmm };   // 15:30
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
