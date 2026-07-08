// [v11 IA] 공유 총자산 요약 바 — 모든 자산 페이지 상단에 동일하게 표시(자산 통합성).
//   기존 /api/v2/total-asset(주식+ETF+부동산 집계) 재사용. 미입력 자산군은 "준비중" 안전표시.
import { useEffect, useState } from "react";
import { useRouter } from "next/router";

const COLOR = { stock: "var(--color-primary)", etf: "#06b6d4", realestate: "var(--color-success)" };

export default function AssetSummaryBar() {
  const router = useRouter();
  const [d, setD] = useState(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    fetch("/api/realestate/v2/total-asset?trader_id=A")
      .then((r) => r.json()).then((j) => { if (j && j.total_uk != null) setD(j); else setErr(true); })
      .catch(() => setErr(true));
  }, []);

  const b = d?.breakdown || {};
  const chips = [
    ["주식", "stock", b.stock_uk, "/pwa?tab=recommend"],
    ["ETF", "etf", b.etf_uk, "/pwa/etf"],
    ["부동산", "realestate", b.realestate_uk, "/pwa/realestate"],
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
            <span className="asb-dot" style={{ background: COLOR[key] }} />
            <span className="asb-cl">{label}</span>
            <span className={`asb-cv ${val == null ? "pend" : ""}`}>{val == null ? "준비중" : `${val}억`}</span>
          </button>
        ))}
      </div>
      <style jsx>{`
        .asb { background: var(--color-card); border: 1px solid var(--color-line); border-radius: var(--radius-md, 14px); padding: 12px 14px; margin: 8px 0 12px; box-shadow: var(--shadow-card); }
        .asb-top { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 10px; }
        .asb-lbl { font-size: 0.72rem; color: var(--color-ink-2); font-weight: 700; }
        .asb-total { font-size: 1.5rem; font-weight: 800; color: var(--color-ink); }
        .asb-chips { display: flex; gap: 6px; overflow-x: auto; }
        .asb-chip { flex: 1; min-width: 0; display: flex; align-items: center; gap: 5px; background: var(--color-card-soft); border: 1px solid var(--color-line); border-radius: 9px; padding: 7px 8px; cursor: pointer; }
        .asb-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
        .asb-cl { font-size: 0.72rem; color: var(--color-ink-2); font-weight: 700; }
        .asb-cv { font-size: 0.72rem; color: var(--color-ink); font-weight: 700; margin-left: auto; }
        .asb-cv.pend { color: var(--color-ink-3); font-weight: 600; }
      `}</style>
    </div>
  );
}
