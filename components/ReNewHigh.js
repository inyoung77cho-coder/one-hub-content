// [S28-10] 신고가 카드 — 부동산 화면 최상단. ★신고가 없는 날엔 아무것도 안 뜬다(null).
//   중요도: 내 단지(onehub_re_my_property) 우선 → 없으면 최신 1건(관심 지역 근사). 하나만 보여준다(피로 방지).
import { useEffect, useState } from "react";

export default function ReNewHigh() {
  const [item, setItem] = useState(null);
  useEffect(() => {
    let alive = true;
    fetch("/api/pwa/re/new-high")
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        const items = (d && d.items) || [];
        if (!items.length) return;
        let my = null;
        try { my = JSON.parse(localStorage.getItem("onehub_re_my_property") || "null"); } catch (e) {}
        const myName = my && my.name;
        const mine = myName ? items.find((x) => x.complex === myName) : null;
        const top = mine || items[0];
        setItem({ ...top, mine: !!mine });
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  if (!item) return null;
  return (
    <div className="rnh">
      <span className="rnh-ic" aria-hidden="true">🏠</span>
      <div className="rnh-body">
        <div className="rnh-t">{item.mine ? "내 단지 신고가" : "관심 지역 신고가"} · {item.complex}</div>
        <div className="rnh-s">
          {item.area_m2 ? `${Math.round(item.area_m2)}㎡ · ` : ""}
          {Number(item.price_manwon).toLocaleString()}만원
          {item.source ? ` · ${item.source}` : ""}
        </div>
      </div>
      <style jsx>{`
        .rnh { display: flex; align-items: center; gap: 10px; margin: 0 0 12px; padding: 12px 14px; border-radius: var(--radius-card); border: 1px solid var(--color-primary); background: var(--color-primary-soft); }
        .rnh-ic { font-size: var(--fs-6); flex: none; }
        .rnh-body { min-width: 0; }
        .rnh-t { font-size: var(--fs-3); font-weight: 800; color: var(--color-primary); }
        .rnh-s { font-size: var(--fs-2); color: var(--color-ink-2); margin-top: 2px; }
      `}</style>
    </div>
  );
}
