// [N1] 자산 원장 — 앱 전체에서 자산 합계를 내는 '유일한' 함수.
//   불변 계약: 어느 화면에서 보든 총자산은 이 함수가 낸 하나의 값이다.
//              어떤 페이지도 자산을 직접 더하지 않는다(표시만 한다).
//
// 소스와 채택 규칙 (자산군마다 '하나'만 채택 — 덧셈은 총액 계산 1회뿐):
//   주식   : 백엔드(KIS 계좌) + 직접입력 리스트(onehub_stock_holdings)
//            └ 서로 다른 계좌라 합산이 정당. 단 같은 종목코드가 양쪽에 있으면 직접입력 제외(중복).
//            └ 리스트가 비었으면 온보딩 추정치(onboard.stock_uk)를 폴백으로 사용.
//   ETF    : lib/etfLive.fetchLiveEtfKrw = 백엔드 등록 포지션(수량×실측종가) + 직접입력 보유 + 환율.
//            └ '대체'다. 여기에 무엇도 더하지 않는다(과거 10.34억 = 5.15 + 5.19 이중합산의 원인).
//            └ onboard.etf_uk 미러는 더 이상 읽지도 쓰지도 않는다.
//   부동산 : 백엔드 평가 우선, 없으면 사용자 입력(onboard.realestate_uk).
//   현금   : 사용자 입력 우선(onboard.cash_uk), 없으면 백엔드 예수금.
//
// 반환: { ok, as_of, total_uk, breakdown{stock_uk,etf_uk,realestate_uk,cash_uk},
//         realty_state, sources{...}, warnings[...] }
import { getStockHoldings } from "./stockHoldings";
import { fetchLiveEtfKrw } from "./etfLive";

const round2 = (v) => Math.round(Number(v) * 100) / 100;
const uk = (won) => (won == null ? null : round2(Number(won) / 1e8));

function readOnboard() {
  if (typeof window === "undefined") return null;
  try { return JSON.parse(localStorage.getItem("onehub_onboard_assets") || "null"); } catch { return null; }
}

// 직접입력 주식 1건 평가액(원). 해외(USD)는 환율 없이 환산 불가 → 제외(경고로 표면화).
const stockWon = (h) => (h.ccy === "USD" ? null : Number(h.avgPrice) * Number(h.shares));
// 평단 온전성: 원 단위 정수 · 0 초과 · 300만원 이하(국내주식 현실 범위) — 위반 시 총자산에서 제외.
const saneAvg = (h) => {
  const p = Number(h.avgPrice);
  return Number.isFinite(p) && p > 0 && Number.isInteger(p) && p <= 3000000;
};

async function getJson(url) {
  try { const r = await fetch(url); return await r.json(); } catch { return null; }
}

export async function getLedger(trader = "A") {
  const sources = {};
  const warnings = [];

  // ── 1) 백엔드 원장(원 단위). 실패해도 진행한다(폴백으로 규칙을 갈아타지 않는다).
  const d = await getJson(`/api/assets/total?trader=${trader}`);
  const be = d?.ok && d.breakdown ? d : null;

  // ── 2) KIS 보유 종목코드(중복 판정용). 못 구하면 중복 판정만 생략.
  const kisCodes = new Set();
  const dash = await getJson(`/api/pwa-dashboard?trader=${trader}`);
  let pos = dash?.balance?.positions;
  if (typeof pos === "string") { try { pos = JSON.parse(pos); } catch { pos = null; } }
  (Array.isArray(pos) ? pos : []).forEach((p) => { if (p?.code) kisCodes.add(String(p.code).toUpperCase()); });

  // ── 3) 직접입력 주식 — 중복/이상치 분리
  const onb = readOnboard() || {};
  const all = getStockHoldings(trader) || [];
  const dup = all.filter((h) => h.code && kisCodes.has(String(h.code).toUpperCase()));
  const rest = all.filter((h) => !(h.code && kisCodes.has(String(h.code).toUpperCase())));
  const bad = rest.filter((h) => !saneAvg(h) && h.ccy !== "USD");
  const good = rest.filter((h) => saneAvg(h) || h.ccy === "USD");

  dup.forEach((h) => warnings.push({
    code: "DUPLICATE_WITH_KIS", name: h.name,
    message: `${h.name}은 증권사 연동에도 있어 합산에서 제외했습니다`, excluded_from_totals: true,
  }));
  bad.forEach((h) => warnings.push({
    code: "AVG_PRICE_OUT_OF_RANGE", name: h.name,
    message: `${h.name} 평단(${Number(h.avgPrice).toLocaleString()}원)이 정상 범위를 벗어나 총자산에서 제외했습니다`,
    excluded_from_totals: true,
  }));

  let manualWon = 0, manualAny = false, fxSkipped = 0;
  good.forEach((h) => {
    const w = stockWon(h);
    if (w == null) { fxSkipped += 1; return; }
    manualWon += w; manualAny = true;
  });
  if (fxSkipped > 0) warnings.push({
    code: "FX_UNAVAILABLE", name: null,
    message: `해외 주식 ${fxSkipped}건은 환율 정보가 없어 총자산에서 제외했습니다`, excluded_from_totals: true,
  });

  // ── 4) 자산군별 '채택'
  const beStock = uk(be?.breakdown?.stock);
  const manualUk = manualAny ? uk(manualWon) : null;
  const estStock = onb.stock_uk != null ? Number(onb.stock_uk) : null;
  const manualPart = manualUk != null ? manualUk : (all.length === 0 ? estStock : null);
  const stock_uk = beStock == null && manualPart == null ? null : round2((beStock || 0) + (manualPart || 0));
  sources.stock = manualUk != null ? (beStock != null ? "backend+manual" : "manual")
    : beStock != null ? "backend" : manualPart != null ? "onboard(estimate)" : "none";

  const live = await fetchLiveEtfKrw(trader);
  const etf_uk = live?.krw != null ? uk(live.krw) : uk(be?.breakdown?.etf);
  sources.etf = live?.krw != null ? (live.live ? "live(replace)" : "backend-report") : be ? "backend" : "none";

  const realestate_uk = be?.breakdown?.realty != null ? uk(be.breakdown.realty)
    : (onb.realestate_uk != null ? round2(onb.realestate_uk) : null);
  sources.realestate = be?.breakdown?.realty != null ? "backend" : (onb.realestate_uk != null ? "onboard" : "none");

  const cash_uk = onb.cash_uk != null ? round2(onb.cash_uk)
    : (be?.breakdown?.cash != null ? uk(be.breakdown.cash) : null);
  sources.cash = onb.cash_uk != null ? "onboard" : (be?.breakdown?.cash != null ? "backend" : "none");

  // ── 5) 총액 — 앱 전체에서 자산을 더하는 건 여기 한 줄뿐이다.
  const parts = [stock_uk, etf_uk, realestate_uk, cash_uk].filter((v) => v != null);
  const total_uk = parts.length ? round2(parts.reduce((s, v) => s + Number(v), 0)) : null;

  const ledger = {
    ok: total_uk != null,
    as_of: new Date().toISOString(),
    total_uk,
    breakdown: { stock_uk, etf_uk, realestate_uk, cash_uk },
    realty_state: realestate_uk != null && realestate_uk > 0 ? "entered" : "none",
    sources,
    warnings,
  };

  // ── 6) 자기검증 — 총액과 자산군 합이 어긋나면 즉시 드러낸다.
  if (process.env.NODE_ENV === "development" && total_uk != null) {
    // 합산은 위 총액 계산 1회뿐이라, 검증은 별도 누산(forEach)으로 대조한다.
    let sum = 0;
    Object.values(ledger.breakdown).forEach((v) => { if (v != null) sum += Number(v); });
    console.assert(Math.abs(total_uk - round2(sum)) < 0.01, `[N1] 총액 불일치: total=${total_uk} sum=${round2(sum)}`);
  }
  return ledger;
}
