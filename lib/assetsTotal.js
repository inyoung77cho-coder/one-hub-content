// [N1] 총자산 원장 — 단일 병합 규칙. 전 화면이 이 함수 하나만 쓴다.
//
// 저장소별 의미(★ 이 규칙을 어기면 총자산이 또 갈라집니다):
//   백엔드 /api/assets/total  … KIS 주식 · 백엔드 ETF 평가 · 부동산 평가 · 예수금 (원)
//   onehub_stock_holdings     … 직접입력 주식 '리스트' (권위) — KIS에 없는 종목
//   onehub_onboard_assets
//        .etf_uk              … etf.js가 기록하는 ETF '실시간 미러'(등록 포지션 + 직접입력 ETF 전체)
//        .realestate_uk       … 사용자가 입력한 부동산 값
//        .cash_uk             … 사용자가 입력한 현금
//        .stock_uk            … 온보딩 '추정치'로만 사용(리스트가 비었을 때의 폴백).
//                                 과거엔 폼이 여기에 '누적'했으나 삭제 시 차감되지 않아 드리프트 → 누적 중단.
//
// 병합 규칙:
//   주식   = 백엔드(KIS) + [직접입력 리스트 | 없으면 온보딩 추정치]   ← KIS와는 다른 자산이라 '더함'
//   ETF    = 실시간 미러 우선, 없으면 백엔드    ← '대체'(미러가 이미 전체라 더하면 이중합산)
//   부동산 = 백엔드 평가 우선, 없으면 사용자값  ← '대체'
//   현금   = 사용자값 우선, 없으면 백엔드       ← '대체'
//
// 반환(억 단위): { ok, source, total_uk, realty_state, breakdown{stock_uk,etf_uk,realestate_uk,cash_uk} }
import { stockHoldingsValueKrw } from "./stockHoldings";

function readOnboard() {
  if (typeof window === "undefined") return null;
  try { return JSON.parse(localStorage.getItem("onehub_onboard_assets") || "null"); } catch { return null; }
}

const round2 = (v) => Math.round(Number(v) * 100) / 100;
const uk = (won) => (won == null ? null : round2(Number(won) / 1e8));

// [N1] 직접입력 주식 평가액(억) — 권위 소스는 리스트. 해외(USD)는 환율 없으면 제외(기존 동작 유지).
export function manualStockUk(trader = "A") {
  try {
    const won = stockHoldingsValueKrw(trader, null);
    return won > 0 ? uk(won) : null;
  } catch { return null; }
}

// [N1] 단일 병합 — 백엔드값(억 단위 정규화 완료)과 로컬 저장소를 규칙대로 합친다.
function computeTotals(backend, trader) {
  const onb = readOnboard() || {};
  const b = backend || {};

  // 주식: 백엔드(KIS) + [직접입력 리스트 | 온보딩 추정치].
  //   리스트가 있으면 리스트가 권위(누적기 드리프트 제거). 리스트가 비었을 때만 온보딩 추정치를 폴백으로
  //   쓴다 — 둘을 더하면 같은 자산을 두 번 세게 된다.
  const bStock = b.stock_uk != null ? Number(b.stock_uk) : null;
  const mStock = manualStockUk(trader);
  const estStock = onb.stock_uk != null ? Number(onb.stock_uk) : null;
  const manualPart = mStock != null ? mStock : estStock;
  const stock_uk = bStock == null && manualPart == null ? null : round2((bStock || 0) + (manualPart || 0));

  // ETF: 실시간 미러(전체) 우선 → 대체. 없으면 백엔드.
  const mirror = onb.etf_uk != null && Number(onb.etf_uk) > 0 ? Number(onb.etf_uk) : null;
  const etf_uk = mirror != null ? round2(mirror) : (b.etf_uk != null ? round2(b.etf_uk) : null);

  // 부동산: 백엔드 평가 우선 → 대체. 없으면 사용자 입력.
  const realestate_uk = b.realestate_uk != null ? round2(b.realestate_uk)
    : (onb.realestate_uk != null ? round2(onb.realestate_uk) : null);

  // 현금: 사용자 입력 우선 → 대체. 없으면 백엔드(예수금).
  const cash_uk = onb.cash_uk != null ? round2(onb.cash_uk)
    : (b.cash_uk != null ? round2(b.cash_uk) : null);

  const parts = [stock_uk, etf_uk, realestate_uk, cash_uk].filter((v) => v != null);
  if (!parts.length) return null;
  return {
    total_uk: round2(parts.reduce((s, v) => s + Number(v), 0)),
    breakdown: { stock_uk, etf_uk, realestate_uk, cash_uk },
  };
}

const wrap = (merged, source) => {
  const re = merged.breakdown.realestate_uk;
  return {
    ok: true, source,
    total_uk: merged.total_uk,
    realty_state: re != null && re > 0 ? "entered" : "none",
    breakdown: merged.breakdown,
  };
};

export async function fetchAssetsTotal(trader = "A") {
  // 1) 백엔드 원장 (realty_state 유무로 폴백하지 않는다 — 폴백이 곧 규칙 갈라짐이었음)
  try {
    const r = await fetch(`/api/assets/total?trader=${trader}`);
    const d = await r.json();
    if (d?.ok && d.breakdown) {
      const bd = d.breakdown;
      const merged = computeTotals(
        { stock_uk: uk(bd.stock), etf_uk: uk(bd.etf), realestate_uk: uk(bd.realty), cash_uk: uk(bd.cash) },
        trader
      );
      if (merged) return wrap(merged, "backend");
    }
  } catch {}
  // 2) 폴백: 구 total-asset(breakdown은 이미 억 단위)
  try {
    const r = await fetch(`/api/realestate/v2/total-asset?trader_id=${trader}`);
    const d = await r.json();
    const merged = computeTotals(d?.breakdown, trader);
    if (merged) return wrap(merged, "fallback");
  } catch {}
  // 3) 로컬만 (백엔드 불가)
  const merged = computeTotals(null, trader);
  if (merged) return wrap(merged, "local");

  return { ok: false, source: "none", total_uk: null, realty_state: "none", breakdown: {} };
}
