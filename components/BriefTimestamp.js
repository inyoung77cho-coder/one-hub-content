// components/BriefTimestamp.js
// [FB-2 · §1-1 시각 표기 표준] market brief·리포트·검증결과 공통 "등록 시각" 배지.
//   형식: "등록 2026-08-02 07:00 KST 기준" (절대 시각 고정). '방금'·'실시간' 금지 원칙의 구현체.
//   LastUpdated(상대 신선도 ⟳ N분 전)와 역할이 다르다 — 이건 "언제 등록된 자료인가"를 못박는다.
//
// Props:
//   at      : 등록 시각. ISO 문자열(naive '2026-08-02T07:00:00' 또는 offset 포함) 또는 Date.
//   label   : 접두 라벨(기본 '등록'). '발행'·'검증' 등으로 교체 가능.
//   note    : 뒤에 붙는 부가 라벨(선택) — 예: '국토부 실거래 · 8월 3주차'.
//   verified: true=확정(파랑) / false=미검증(주황). 미지정 시 중립색.  (§원칙4 확정·미검증 분리)

function fmt(at) {
  if (!at) return null;
  // naive ISO('...THH:MM', 타임존 접미사 없음)는 저장된 벽시계를 그대로 KST로 표기한다.
  //   (엔진이 KST 벽시계를 naive 로 저장하므로 timezone 변환을 하면 이중 보정 버그가 난다.)
  if (typeof at === "string") {
    const m = at.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
    if (m && !/[zZ]|[+\-]\d{2}:?\d{2}$/.test(at)) {
      return `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}`;
    }
  }
  // Date 또는 타임존이 있는 문자열 → 실제 instant 를 KST 로 변환.
  const d = at instanceof Date ? at : new Date(at);
  if (isNaN(d.getTime())) return null;
  try {
    const day = d.toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
    const tm = d.toLocaleTimeString("en-GB", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false });
    return `${day} ${tm}`;
  } catch (e) {
    return null;
  }
}

export default function BriefTimestamp({ at, label = "등록", note, verified }) {
  const s = fmt(at);
  if (!s) return null;
  const cls = verified === true ? "bts ok" : verified === false ? "bts unv" : "bts";
  return (
    <span className={cls}>
      <span className="bts-lbl">{label}</span> {s} <span className="bts-kst">KST 기준</span>
      {note ? <span className="bts-note">· {note}</span> : null}
      <style jsx>{`
        .bts { display: inline-flex; align-items: baseline; gap: 4px; font-size: 11px; font-weight: 700; color: var(--color-ink-3, #94a3b8); font-family: var(--font-sans, inherit); font-variant-numeric: tabular-nums; letter-spacing: -0.1px; }
        .bts-lbl { font-weight: 800; color: var(--color-ink-2, #64748b); }
        .bts-kst { font-weight: 700; opacity: 0.85; }
        .bts-note { font-weight: 700; }
        .bts.ok .bts-lbl { color: var(--color-primary, #2f6bff); }
        .bts.unv .bts-lbl { color: var(--color-warning, #f97316); }
      `}</style>
    </span>
  );
}
