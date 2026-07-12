// [S1.1] 총자산 단일 소스 클라이언트 헬퍼.
//   1순위: 백엔드 /api/assets/total (계약: total, realty_state, breakdown{stock,etf,realty,cash} · 원)
//   폴백: 기존 /api/realestate/v2/total-asset + 온보딩 입력 합산(현행과 동일 결과 · 회귀 없음)
//   반환(정규화 · 억(uk) 단위): { ok, source, total_uk, realty_state, breakdown{stock_uk,etf_uk,realestate_uk,cash_uk} }

function readOnboard() {
  if (typeof window === "undefined") return null;
  try { return JSON.parse(localStorage.getItem("onehub_onboard_assets") || "null"); } catch { return null; }
}
const add = (x, y) => {
  if (x == null && y == null) return null;
  return Math.round(((Number(x) || 0) + (Number(y) || 0)) * 100) / 100;
};

// 폴백: 백엔드 total-asset breakdown + 온보딩 입력 합산 (index.js mergeOnboardAssets와 동일 로직)
function mergeOnboard(d) {
  const b = { ...(d?.breakdown || {}) };
  const onb = readOnboard();
  const stock_uk = add(b.stock_uk, onb && onb.stock_uk);
  const etf_uk = add(b.etf_uk, onb && onb.etf_uk);
  const realestate_uk = add(b.realestate_uk, onb && onb.realestate_uk);
  const cash_uk = add(b.cash_uk, onb && onb.cash_uk);
  const parts = [stock_uk, etf_uk, realestate_uk, cash_uk].filter((v) => v != null);
  if (parts.length === 0 && d?.total_uk == null) return null;
  const total_uk = Math.round(parts.reduce((s, v) => s + Number(v), 0) * 100) / 100;
  return { total_uk, breakdown: { stock_uk, etf_uk, realestate_uk, cash_uk } };
}

const uk = (won) => (won == null ? null : Math.round((Number(won) / 1e8) * 100) / 100);

export async function fetchAssetsTotal(trader = "A") {
  // 1) 단일 소스 시도
  try {
    const r = await fetch(`/api/assets/total?trader=${trader}`);
    const d = await r.json();
    if (d?.ok && d.breakdown && d.realty_state) {
      const bd = d.breakdown;
      let etf_uk = uk(bd.etf);
      let total_uk = uk(d.total);
      // [D1] etf.js가 localStorage에 기록한 '실시간 ETF 평가액'이 있으면
      //   백엔드의 stale 종가 기반 값 대신 그 값을 사용 → 대시보드 총자산이 항상 최신 ETF 반영.
      const onb = readOnboard();
      const liveEtf = onb && onb.etf_uk != null ? Number(onb.etf_uk) : null;
      if (liveEtf != null && liveEtf > 0 && Math.abs(liveEtf - (etf_uk || 0)) > 0.0005) {
        total_uk = total_uk != null
          ? Math.round((total_uk - (etf_uk || 0) + liveEtf) * 100) / 100
          : liveEtf;
        etf_uk = liveEtf;
      }
      return {
        ok: true, source: "backend",
        total_uk,
        realty_state: d.realty_state === "entered" ? "entered" : "none",
        breakdown: {
          stock_uk: uk(bd.stock), etf_uk,
          realestate_uk: uk(bd.realty), cash_uk: uk(bd.cash),
        },
      };
    }
  } catch {}
  // 2) 폴백: 기존 total-asset + 온보딩
  try {
    const r = await fetch(`/api/realestate/v2/total-asset?trader_id=${trader}`);
    const d = await r.json();
    const merged = mergeOnboard(d);
    if (merged) {
      const re = merged.breakdown.realestate_uk;
      return {
        ok: true, source: "fallback",
        total_uk: merged.total_uk,
        realty_state: re != null && re > 0 ? "entered" : "none",
        breakdown: merged.breakdown,
      };
    }
  } catch {}
  // 3) 온보딩만이라도
  const merged = mergeOnboard(null);
  if (merged) {
    const re = merged.breakdown.realestate_uk;
    return { ok: true, source: "onboard", total_uk: merged.total_uk,
      realty_state: re != null && re > 0 ? "entered" : "none", breakdown: merged.breakdown };
  }
  return { ok: false, source: "none", total_uk: null, realty_state: "none", breakdown: {} };
}
