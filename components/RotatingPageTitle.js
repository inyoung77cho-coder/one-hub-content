// [OS-2] 전 페이지 공통 상단 타이틀 패턴 — 고정 단어(예: "오늘")는 검정 볼드로 고정, 뒤에 붙는 단어만
//   "종목변경" 버튼(행 맨 오른쪽)을 눌러 순환한다. 전환 중 살짝 회색으로 비쳤다 검정으로 자연스럽게
//   자리잡는 애니메이션(사용자 피드백 반영 — 전엔 계속 회색이었음).
//   onChange(index): 버튼으로 순환할 때마다 호출(콘텐츠 필터링용). onLabelClick: 라벨 텍스트 자체를
//   탭했을 때만 호출(예: 즉시 다른 페이지로 이동) — 버튼 순환과는 분리된 별개 동작.
//   controlledIndex(선택): 딥링크 등 버튼 밖에서 현재 인덱스가 바뀔 수 있는 페이지(예: AI 트러스트
//   허브의 ?sec= 쿼리)는 이 값을 넘겨 라벨이 항상 실제 상태와 일치하게 한다.
import { useEffect, useState } from "react";

export default function RotatingPageTitle({ fixed = "", items, buttonLabel = "종목변경", onLabelClick, onChange, compact = false, controlledIndex, mutedSuffix = false, spaced = false }) {
  const [idx, setIdx] = useState(controlledIndex ?? 0);
  const [anim, setAnim] = useState(false);
  const cur = items[idx % items.length];

  // 버튼이 아니라 외부(딥링크·다른 버튼)에서 인덱스가 바뀐 경우 라벨을 즉시 맞춘다(애니메이션 없이).
  useEffect(() => {
    if (controlledIndex != null && controlledIndex !== idx) setIdx(controlledIndex);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controlledIndex]);

  const advance = () => {
    setAnim(true);
    setTimeout(() => {
      const next = (idx + 1) % items.length;
      setIdx(next);
      if (typeof onChange === "function") onChange(next, items[next]);
      requestAnimationFrame(() => requestAnimationFrame(() => setAnim(false)));
    }, 180);
  };

  const label = (
    <span
      className={`rpt-suffix ${anim ? "fade" : ""} ${onLabelClick ? "clickable" : ""} ${mutedSuffix ? "muted" : ""} ${spaced ? "spaced" : ""}`}
      onClick={onLabelClick ? () => onLabelClick(cur, idx) : undefined}
      role={onLabelClick ? "button" : undefined}
      tabIndex={onLabelClick ? 0 : undefined}
    >
      {cur?.suffix || ""}
    </span>
  );

  return (
    <div className={`rpt ${compact ? "compact" : ""}`}>
      {compact ? label : (
        <h1 className="rpt-title">
          <span className="rpt-fixed">{fixed}</span>
          {label}
        </h1>
      )}
      {items.length > 1 && (
        <button type="button" className="rpt-btn" onClick={advance}>{buttonLabel}</button>
      )}
      <style jsx>{`
        .rpt { display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0; }
        /* [사용자 피드백] AI 페이지(index.js .pwa-wrapper)에서만 --font-display가 'Syne'로 로컬
           재정의되어 있어 이 타이틀만 다른 폰트로 보였다 — font-sans를 직접 써서 전 페이지 통일,
           letter-spacing도 조금 더 좁게. */
        .rpt-title { margin: 0; font-size: 20px; font-weight: 800; letter-spacing: -.6px; font-family: var(--font-sans); display: flex; }
        .rpt-fixed { color: var(--color-ink); }
        .rpt-suffix { color: var(--color-ink); font-weight: 800; opacity: 1; transform: translateY(0); transition: opacity .18s ease, transform .18s ease, color .28s ease; }
        .rpt-suffix.fade { opacity: 0; transform: translateY(3px); color: var(--color-ink-3); }
        /* [사용자 피드백] 고정 단어("오늘"/"AI")를 강조하기 위해 접미사는 항상 회색으로 표시 */
        .rpt-suffix.muted { color: var(--color-ink-3); }
        .rpt-suffix.clickable { cursor: pointer; text-decoration: underline; text-underline-offset: 2px; }
        /* [사용자 지시] "AI" 뒤 접미사("vs 나 대결" 등) 사이 한 칸 — 라벨 문자열에 공백을 심는 대신
           명시적 margin으로 처리(브라우저의 공백 트리밍/자간에 영향받지 않도록). "오늘"+"의 대결"처럼
           붙여 써야 하는 페이지는 이 prop을 안 쓰면 된다. */
        .rpt-suffix.spaced { margin-left: .3em; }
        .rpt.compact .rpt-suffix { font-size: 12px; }
        /* [사용자 피드백] compact(자산)와 일반(오늘) 모드가 버튼 크기·위치까지 달랐던 버그 — "이야기"
           페이지의 지역변경 버튼과 동일 규격(패딩 6px 12px·폰트 11.5px)으로 항상 통일, 항상 맨 오른쪽. */
        .rpt-btn {
          flex-shrink: 0; margin-left: auto; border: 1px solid var(--color-line); background: var(--color-card);
          color: var(--color-ink-2); font-size: 11.5px; font-weight: 700; padding: 6px 12px; border-radius: 999px;
          cursor: pointer; font-family: var(--font-sans);
        }
      `}</style>
    </div>
  );
}
