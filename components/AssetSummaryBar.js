// [v11 IA] 공유 총자산 요약 바 — 모든 자산 페이지 상단에 동일하게 표시(자산 통합성).
//   기존 /api/v2/total-asset(주식+ETF+부동산 집계) 재사용. 미입력 자산군은 "준비중" 안전표시.
import { useEffect, useState } from "react";
import { useRouter } from "next/router";

const COLOR = { stock: "var(--color-primary)", etf: "var(--color-etf)", realestate: "var(--color-success)", cash: "var(--color-warning)" };

export default function AssetSummaryBar() {
  const router = useRouter();
  const [d, setD] = useState(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    // 온보딩 입력 자산 병합 — 백엔드 집계 값 + 온보딩 입력 값 합산
    const merge = (j) => {
      let onb = null;
      try { onb = JSON.parse(localStorage.getItem("onehub_onboard_assets") || "null"); } catch (e) {}
      const b = { ...(j?.breakdown || {}) };
      const add = (x, y) => {
        if (x == null && y == null) return null;
        return Math.round(((Number(x) || 0) + (Number(y) || 0)) * 100) / 100;
      };
      const stock_uk = add(b.stock_uk, onb && onb.stock_uk);
      const etf_uk = add(b.etf_uk, onb && onb.etf_uk);
      const realestate_uk = add(b.realestate_uk, onb && onb.realestate_uk);
      const cash_uk = add(b.cash_uk, onb && onb.cash_uk);
      const parts = [stock_uk, etf_uk, realestate_uk, cash_uk].filter((v) => v != null);
      if (parts.length === 0 && (j?.total_uk == null)) return null;
      const total_uk = Math.round(parts.reduce((s, v) => s + Number(v), 0) * 100) / 100;
      return { total_uk, breakdown: { stock_uk, etf_uk, realestate_uk, cash_uk } };
    };
    fetch("/api/realestate/v2/total-asset?trader_id=A")
      .then((r) => r.json()).then((j) => { const m = merge(j); if (m) setD(m); else setErr(true); })
      .catch(() => { const m = merge(null); if (m) setD(m); else setErr(true); });
  }, []);

  const b = d?.breakdown || {};
  const chips = [
    ["주식", "stock", b.stock_uk, "/pwa?tab=recommend"],
    ["ETF", "etf", b.etf_uk, "/pwa/etf"],
    ["부동산", "realestate", b.realestate_uk, "/pwa/realestate"],
    ["현금", "cash", b.cash_uk, "/pwa/onboarding"],
  ];

  return (
    <div className="asb">
      <div className="asb-top">
        <span className="asb-lbl">총자산</span>
        <span className="asb-total">{d ? `${d.total_uk}억` : err ? "—" : "…"}</span>
      </div>
      <div className="asb-chips">
        {chips.map(([label, key, val, href]) => (
          <button key={key} className="asb-chip" onClick={() => router.push(href)}>
            <span className="asb-cl"><span className="asb-dot" style={{ background: COLOR[key] }} />{label}</span>
            <span className={`asb-cv ${val == null ? "pend" : ""}`}>{val == null ? "준비중" : `${val}억`}</span>
          </button>
        ))}
      </div>
      <style jsx>{`
        .asb { background: var(--color-card); border: 1px solid var(--color-line); border-radius: var(--radius-md, 14px); padding: 12px 14px; margin: 8px 0 12px; box-shadow: var(--shadow-card); }
        .asb-top { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 10px; }
        .asb-lbl { font-size: 0.72rem; color: var(--color-ink-2); font-weight: 700; }
        .asb-total { font-size: 1.5rem; font-weight: 800; color: var(--color-ink); }
        .asb-chips { display: flex; gap: 6px; }
        /* [balance] 4칩 세로 스택 — 좁은 폭에서 라벨이 글자 단위로 깨지지 않도록 nowrap */
        .asb-chip { flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; align-items: center; gap: 4px; background: var(--color-card-soft); border: 1px solid var(--color-line); border-radius: 10px; padding: 9px 4px; cursor: pointer; text-align: center; }
        .asb-cl { display: inline-flex; align-items: center; gap: 4px; font-size: 0.7rem; color: var(--color-ink-2); font-weight: 600; white-space: nowrap; }
        .asb-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
        .asb-cv { font-size: 0.8rem; color: var(--color-ink); font-weight: 800; white-space: nowrap; }
        .asb-cv.pend { color: var(--color-ink-3); font-weight: 600; font-size: 0.72rem; }
      `}</style>
    </div>
  );
}
