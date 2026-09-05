// [S31-6] 증권 계좌 개설 제휴 카드 — 자리만. active 제휴처가 없으면 아무것도 렌더 안 함(합격선).
//   ★AI 판단·추천 화면 안에는 절대 넣지 말 것(수익이 판단에 영향 준다는 오해). 세 자리에만: 온보딩 주식·오늘(보유0·KIS미연동)·설정 연동.
//   클릭 측정은 자체 카운터(외부 추적 스크립트 없음 — CSP·개인정보·성능). place=어디서 눌렀는지(로그 아님, 집계용 라벨).
import { useMemo } from "react";
import { activePartners } from "../lib/partners";

export default function PartnerCard({ place = "", compact = false }) {
  const partners = useMemo(() => activePartners(), []);
  if (!partners.length) return null; // 계약 전 = 아무것도 안 뜸

  const click = (p) => {
    // 자체 카운터만(fire-and-forget). 외부 추적 없음.
    try { fetch("/api/pwa/partner-click", { method: "POST" }).catch(() => {}); } catch (e) {}
    try { window.open(p.url, "_blank", "noopener,noreferrer"); } catch (e) {}
  };

  return (
    <section className={`pc ${compact ? "compact" : ""}`}>
      <div className="pc-h">증권 계좌가 없으시면 <span className="pc-tag">제휴 링크</span></div>
      <div className="pc-list">
        {partners.map((p) => (
          <button type="button" className="pc-item" key={p.id} onClick={() => click(p)}>
            <span className="pc-nm">{p.name}</span>
            {p.note && <span className="pc-note">{p.note}</span>}
            <span className="pc-arrow">개설 →</span>
          </button>
        ))}
      </div>
      <div className="pc-foot">어느 곳을 고르셔도 ONE·HUB 기능은 같습니다. 제휴 링크로 이동하며, 개설은 각 증권사에서 진행됩니다.</div>

      <style jsx>{`
        .pc { background: var(--color-card); border: 1px solid var(--color-line); border-radius: var(--radius-card); padding: 14px; margin: 10px 0; }
        .pc.compact { padding: 12px; }
        .pc-h { font-size: var(--fs-3); font-weight: 700; color: var(--color-ink); margin-bottom: 10px; display: flex; align-items: center; gap: 8px; }
        .pc-tag { font-size: var(--fs-1); font-weight: 700; color: var(--color-ink-3); background: var(--color-card-soft); border-radius: var(--radius-sm); padding: 2px 7px; }
        .pc-list { display: flex; flex-direction: column; gap: 7px; }
        .pc-item { display: flex; align-items: center; gap: 8px; border: 1px solid var(--color-line); background: var(--color-card); border-radius: var(--radius-md); padding: 11px 13px; cursor: pointer; font-family: var(--font-sans); text-align: left; }
        .pc-nm { font-size: var(--fs-3); font-weight: 700; color: var(--color-ink); }
        .pc-note { font-size: var(--fs-1); color: var(--color-ink-3); }
        .pc-arrow { margin-left: auto; font-size: var(--fs-2); font-weight: 700; color: var(--color-primary); }
        .pc-foot { margin-top: 10px; font-size: var(--fs-1); color: var(--color-ink-3); line-height: 1.5; word-break: keep-all; }
      `}</style>
    </section>
  );
}
