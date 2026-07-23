// [v11 IA] 공유 총자산 요약 바 — 모든 자산 페이지 상단에 동일하게 표시(자산 통합성).
//   [N1] 총자산은 lib/assetsTotal 단일 규칙만 사용. 미입력 자산군은 "준비중" 안전표시.
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { getLedger } from "../lib/ledger";
import { getTrader } from "../lib/trader";
import { recordSnapshot, getDelta } from "../lib/assetHistory";

const COLOR = { stock: "var(--color-primary)", etf: "var(--color-etf)", realestate: "var(--color-success)", cash: "var(--color-warning)" };
// 변화액(억) 표기 헬퍼
const dvUk = (v) => (v == null ? null : `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(2)}억`);
const dCls = (v) => (v == null ? "" : v > 0.004 ? "up" : v < -0.004 ? "down" : "flat");

export default function AssetSummaryBar() {
  const router = useRouter();
  const [d, setD] = useState(null);
  const [err, setErr] = useState(false);
  const [delta, setDelta] = useState(null);
  useEffect(() => {
    // [N1] 자체 병합 삭제 — 총자산은 lib/ledger 단일 원장만 사용(화면마다 총자산이 갈라지던 원인).
    //   기존 자체 merge는 ETF 이중합산 + trader_id=A 하드코딩(B 계정 무시) 버그가 있었다.
    const load = () => getLedger(getTrader())
      .then((r) => {
        if (r?.ok) {
          setD(r); setErr(false);
          // [추세] 이 공유 바가 어느 화면에 있든 오늘치 총자산을 적립 → 전일 대비 변화 표시
          const tr = getTrader();
          if (r.total_uk != null) { recordSnapshot(tr, r); setDelta(getDelta(tr)); }
        } else setErr(true);
      })
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
        {/* [추세] 전일 대비 총자산 변화(브라우저 스냅샷). 하루뿐이면 표시 안 함. */}
        {delta && delta.total != null && (
          <span className={`asb-delta ${dCls(delta.total)}`}>
            {delta.total >= 0 ? "▲" : "▼"} {dvUk(delta.total)}
          </span>
        )}
        {/* [N1] 좁은 바에서도 불완전 사실은 숨기지 않는다 — 툴팁이 아니라 보이는 표식으로. */}
        {(d?.warnings || []).some((w) => w.code === "BACKEND_UNAVAILABLE") && (
          <span className="asb-warn" title="증권사 연동 자산을 불러오지 못해 실제보다 적습니다">⚠ 일부 누락</span>
        )}
      </div>
      <div className="asb-chips">
        {chips.map(([label, key, val, href]) => {
          // chips 키(stock/etf/realestate/cash) → delta 키(stock/etf/realty/cash)
          const dk = key === "realestate" ? "realty" : key;
          const dv = delta ? delta[dk] : null;
          return (
            <button key={key} className="asb-chip" onClick={() => router.push(href)}>
              <span className="asb-cl"><span className="asb-dot" style={{ background: COLOR[key] }} />{label}</span>
              <span className={`asb-cv ${val == null ? "pend" : ""}`}>{val == null ? "준비중" : `${val}억`}</span>
              {dv != null && Math.abs(dv) >= 0.005 && (
                <span className={`asb-cd ${dCls(dv)}`}>{dvUk(dv)}</span>
              )}
            </button>
          );
        })}
      </div>
      <style jsx>{`
        .asb { background: var(--color-card); border: 1px solid var(--color-line); border-radius: var(--radius-md, 14px); padding: 12px 14px; margin: 8px 0 12px; box-shadow: var(--shadow-card); }
        .asb-top { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 10px; }
        .asb-lbl { font-size: 0.72rem; color: var(--color-ink-2); font-weight: 700; }
        .asb-total { font-size: 1.5rem; font-weight: 800; color: var(--color-ink); }
        .asb-delta { font-size: 0.78rem; font-weight: 800; font-variant-numeric: tabular-nums; white-space: nowrap; margin-left: auto; }
        .asb-delta.up { color: var(--color-success, #0E9E6A); }
        .asb-delta.down { color: var(--color-danger, #E5484D); }
        .asb-delta.flat { color: var(--color-ink-3); }
        .asb-warn { font-size: 0.66rem; font-weight: 700; color: var(--color-warning); white-space: nowrap; }
        .asb-chips { display: flex; gap: 6px; }
        /* [balance] 4칩 세로 스택 — 좁은 폭에서 라벨이 글자 단위로 깨지지 않도록 nowrap */
        .asb-chip { flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; align-items: center; gap: 4px; background: var(--color-card-soft); border: 1px solid var(--color-line); border-radius: 10px; padding: 9px 4px; cursor: pointer; text-align: center; }
        .asb-cl { display: inline-flex; align-items: center; gap: 4px; font-size: 0.7rem; color: var(--color-ink-2); font-weight: 600; white-space: nowrap; }
        .asb-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
        .asb-cv { font-size: 0.8rem; color: var(--color-ink); font-weight: 800; white-space: nowrap; }
        .asb-cv.pend { color: var(--color-ink-3); font-weight: 600; font-size: 0.72rem; }
        .asb-cd { font-size: 0.62rem; font-weight: 700; font-variant-numeric: tabular-nums; white-space: nowrap; line-height: 1; }
        .asb-cd.up { color: var(--color-success, #0E9E6A); }
        .asb-cd.down { color: var(--color-danger, #E5484D); }
        .asb-cd.flat { color: var(--color-ink-3); }
      `}</style>
    </div>
  );
}
