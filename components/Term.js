// [E-2] 전문 용어 인라인 팝오버 — 우측 ? 탭 시 설명(모달 아님, 컨텍스트 이탈 없음).
//   문구는 data/glossary.json 단일 소스에서 로드(카피 수정 시 이 파일 불변).
import { useState } from "react";
import GLOSSARY from "../data/glossary.json";

export default function Term({ children, term, k }) {
  const [open, setOpen] = useState(false);
  const key = term || k || (typeof children === "string" ? children : null);
  const desc = key ? GLOSSARY[key] : null;
  if (!desc) return <>{children}</>;
  return (
    <span className="oh-term">
      {children}
      <button type="button" className="oh-term-q" aria-label={`${key} 설명`}
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}>?</button>
      {open && (
        <span className="oh-term-wrap" onClick={(e) => e.stopPropagation()}>
          <span className="oh-term-scrim" onClick={(e) => { e.stopPropagation(); setOpen(false); }} />
          <span className="oh-term-pop"><b>{key}</b>{desc}</span>
        </span>
      )}
      <style jsx>{`
        .oh-term { position: relative; }
        .oh-term-q { display: inline-flex; align-items: center; justify-content: center; width: 14px; height: 14px; margin-left: 3px; vertical-align: middle; border: none; border-radius: 50%; background: var(--color-primary-soft, #e4eefe); color: var(--color-primary, #2f80ed); font-size: 9px; font-weight: 800; line-height: 1; cursor: pointer; font-family: var(--font-body, inherit); }
        .oh-term-scrim { position: fixed; inset: 0; z-index: 90; }
        .oh-term-pop { position: absolute; bottom: calc(100% + 6px); left: 0; z-index: 91; display: block; width: max-content; max-width: 240px; background: var(--color-card, #fff); color: var(--color-ink, #1f2a37); border: 1px solid var(--color-line, #e3ebf3); border-radius: 10px; padding: 9px 11px; font-size: 12px; font-weight: 500; line-height: 1.45; word-break: keep-all; box-shadow: 0 8px 24px rgba(0,0,0,.16); white-space: normal; }
        .oh-term-pop b { display: block; font-weight: 800; margin-bottom: 3px; color: var(--color-primary, #2f80ed); }
      `}</style>
    </span>
  );
}
