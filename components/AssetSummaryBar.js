// [v11 IA] 공유 총자산 요약 바 — 모든 자산 페이지 상단에 동일하게 표시(자산 통합성).
//   [N1] 총자산은 lib/assetsTotal 단일 규칙만 사용. 미입력 자산군은 "준비중" 안전표시.
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { getLedger } from "../lib/ledger";
import { getTrader } from "../lib/trader";

const COLOR = { stock: "var(--color-primary)", etf: "var(--color-etf)", realestate: "var(--color-success)", cash: "var(--color-warning)" };

export default function AssetSummaryBar() {
  const router = useRouter();
  const [d, setD] = useState(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    // [N1] 자체 병합 삭제 — 총자산은 lib/ledger 단일 원장만 사용(화면마다 총자산이 갈라지던 원인).
    //   기존 자체 merge는 ETF 이중합산 + trader_id=A 하드코딩(B 계정 무시) 버그가 있었다.
    const load = () => getLedger(getTrader())
      .then((r) => { if (r?.ok) { setD(r); setErr(false); } else setErr(true); })
      .catch(() => setErr(true));
    load();
    const on = () => load();
    window.addEventListener("onehub-assets-change", on);
    window.addEventListener("onehub-trader-change", on);
    return () => {
      window.removeEventListener("onehub-assets-change", on);
      window.removeEventListener("onehub-trader-change", on);
    };
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
        {/* [N1] 좁은 바에서도 불완전 사실은 숨기지 않는다 — 툴팁이 아니라 보이는 표식으로. */}
        {(d?.warnings || []).some((w) => w.code === "BACKEND_UNAVAILABLE") && (
          <span className="asb-warn" title="증권사 연동 자산을 불러오지 못해 실제보다 적습니다">⚠ 일부 누락</span>
        )}
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
        .asb-warn { font-size: 0.66rem; font-weight: 700; color: var(--color-warning); white-space: nowrap; }
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
