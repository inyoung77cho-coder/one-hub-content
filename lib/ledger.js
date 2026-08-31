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
import { getSyncState, hasLocalAssets, SYNC_EVENT } from "./syncManager";
import { getStockHoldings } from "./stockHoldings";
import { fetchLiveEtfKrw } from "./etfLive";
import { fetchStockQuotes, holdingValueKrw } from "./stockLive";

const round2 = (v) => Math.round(Number(v) * 100) / 100;
const uk = (won) => (won == null ? null : round2(Number(won) / 1e8));

function readOnboard() {
  if (typeof window === "undefined") return null;
  try { return JSON.parse(localStorage.getItem("onehub_onboard_assets") || "null"); } catch { return null; }
}

// 직접입력 주식 1건 평가액(원). 해외(USD)는 환율 없이 환산 불가 → 제외(경고로 표면화).
const stockWon = (h) => (h.ccy === "USD" ? null : Number(h.avgPrice) * Number(h.shares));
// 평단 온전성: 원 단위 정수 · 0 초과 · 300만원 이하(국내주식 현실 범위) — 위반 시 총자산에서 제외.
//   [N6] 단, 사용자가 "이 값이 맞습니다"로 확인(verified)했으면 포함한다.
//        범위 규칙은 사람의 확인보다 위에 있지 않다 — 실제로 비싼 종목일 수 있고, 판단은 사람 몫이다.
const saneAvg = (h) => {
  if (h.verified === true) return true;
  const p = Number(h.avgPrice);
  return Number.isFinite(p) && p > 0 && Number.isInteger(p) && p <= 3000000;
};

async function getJson(url) {
  try { const r = await fetch(url); return await r.json(); } catch { return null; }
}

// [S19-1] 기기 동기화가 끝나기 전에 원장을 확정하지 않는다.
//   _app.js 의 initSync 는 비동기라, 페이지의 getLedger 와 경주한다. 로컬이 비어 있는 첫 로그인에서
//   원장이 먼저 이기면 onboard 값(부동산·현금)이 통째로 빠진 총자산이 화면에 박힌다.
//   기다리는 경우는 딱 하나 — '아직 pending 이고 로컬에도 아무것도 없을 때'. 재방문은 즉시 진행한다.
const SYNC_WAIT_MS = 3500;
function waitForSync() {
  if (typeof window === "undefined") return Promise.resolve("ready");
  let st;
  try { st = getSyncState(); } catch { return Promise.resolve("ready"); }
  if (st !== "pending") return Promise.resolve(st);
  try { if (hasLocalAssets()) return Promise.resolve("local"); } catch {}
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => {
      if (done) return; done = true;
      clearTimeout(t);
      try { window.removeEventListener(SYNC_EVENT, onReady); } catch {}
      resolve(v);
    };
    const onReady = () => finish(getSyncState());
    const t = setTimeout(() => finish("pending"), SYNC_WAIT_MS);
    try { window.addEventListener(SYNC_EVENT, onReady); } catch { finish("pending"); }
  });
}

export async function getLedger(trader = "A", opts = {}) {
  const sources = {};
  const warnings = [];

  // ── 0) [S19-1] 동기화 대기. awaitSync:false 로 명시적으로 끌 수 있다(주기 재조회 등).
  const sync_state = opts.awaitSync === false ? "skipped" : await waitForSync();
  if (sync_state === "pending") warnings.push({
    code: "SYNC_PENDING", name: null,
    message: "다른 기기에서 입력한 자산을 아직 불러오는 중입니다 — 총자산이 실제보다 적을 수 있습니다",
    excluded_from_totals: true,
  });

  // ── 1) 백엔드 원장 — 소스가 둘이고 '단위가 다르다'. 여기서 억(uk)으로 정규화해 한 모양으로 만든다.
  //   1차 /api/assets/total (원 단위): S1.1 계약 엔드포인트.
  //        ★ 이 라우트는 백엔드에 구현된 적이 없다(engine_status_api.py 라우트 24개 중 'assets' 0건, 실측 404).
  //          즉 '죽은' 게 아니라 '없는' 것이다. 살아나면 자동으로 1차가 우선된다.
  //   2차 /api/realestate/v2/total-asset (이미 억 단위): 실제로 살아서 KIS 주식·ETF를 주는 소스.
  //        ★ 구 lib/assetsTotal 은 이 폴백을 갖고 있었는데 원장(N1) 이관 때 내가 빠뜨렸다.
  //          그 결과 KIS 주식 0.09억이 총자산에서 조용히 사라졌다(실측으로 발각).
  const d = await getJson(`/api/assets/total?trader=${trader}`);
  let beUk = null;
  if (d?.ok && d.breakdown) {
    const b = d.breakdown;
    beUk = { stock: uk(b.stock), etf: uk(b.etf), realty: uk(b.realty), cash: uk(b.cash) };
    sources.backend = "assets/total";
  } else {
    const d2 = await getJson(`/api/realestate/v2/total-asset?trader_id=${trader}`);
    const b2 = d2?.breakdown;
    if (b2) {
      const n = (v) => (v == null ? null : round2(Number(v))); // 이미 억 단위 — 다시 나누지 않는다
      beUk = { stock: n(b2.stock_uk), etf: n(b2.etf_uk), realty: n(b2.realestate_uk), cash: n(b2.cash_uk) };
      sources.backend = "realestate/v2/total-asset";
    }
  }
  const beDown = !beUk;
  if (beDown) sources.backend = "none";

  // ── 2) KIS 보유 종목코드(중복 판정용). 못 구하면 중복 판정만 생략.
  const kisCodes = new Set();
  const dash = await getJson(`/api/pwa-dashboard?trader=${trader}`);
  let pos = dash?.balance?.positions;
  if (typeof pos === "string") { try { pos = JSON.parse(pos); } catch { pos = null; } }
  (Array.isArray(pos) ? pos : []).forEach((p) => { if (p?.code) kisCodes.add(String(p.code).toUpperCase()); });
  // [PWA 절삭 수정] dash.balance.total_asset 은 KIS tot_evlu_amt 를 그대로 int() 한 원 단위
  // 정수(auto_trade/main.py:2869) — beUk.stock 은 이 값을 억 단위로 반올림(round2, 백만원
  // 단위 손실)해 만든 값이라, 화면에 "원 단위 정확히" 쓰려면 반올림 전의 이 값을 따로 든다.
  const beStockWon = dash?.balance?.total_asset != null ? Number(dash.balance.total_asset) : null;

  // ── 3) 직접입력 주식 — 중복/이상치 분리
  //   [버그 수정] 종목코드만으로 "KIS와 중복"이라 보고 직접입력분을 총자산에서 제외해왔다.
  //   그런데 같은 종목(예: 삼성전자)을 KIS 연동 계좌와 전혀 다른 증권사(미래에셋 등) 계좌에
  //   각각 보유하는 건 흔하고 정당한 경우다 — 코드만 보면 "실수로 두 번 입력"과 구분이 안 된다.
  //   사용자가 STOCK_BROKERS 중 "한국투자"(KIS의 정식 명칭)나 미지정("기타")을 고른 경우만
  //   같은 계좌를 실수로 또 입력했을 가능성으로 보고 제외하고, 그 외 증권사를 명시적으로
  //   고른 경우는 사용자가 이미 "이건 다른 계좌"라고 밝힌 것이므로 정상적으로 합산한다.
  const AMBIGUOUS_BROKERS = ["한국투자", "기타", "", null, undefined];
  const isAmbiguousBroker = (h) => AMBIGUOUS_BROKERS.includes(h.broker);
  const isKisDup = (h) => h.code && kisCodes.has(String(h.code).toUpperCase()) && isAmbiguousBroker(h);
  const onb = readOnboard() || {};
  const all = getStockHoldings(trader) || [];
  const dup = all.filter(isKisDup);
  const rest = all.filter((h) => !isKisDup(h));
  const bad = rest.filter((h) => !saneAvg(h) && h.ccy !== "USD");
  const good = rest.filter((h) => saneAvg(h) || h.ccy === "USD");

  dup.forEach((h) => warnings.push({
    code: "DUPLICATE_WITH_KIS", name: h.name,
    message: `${h.name}은 증권사 연동에도 있어 합산에서 제외했습니다`, excluded_from_totals: true,
  }));
  // [N6] 평단 오염은 '합산에 쓰이는지'와 무관하게 물어야 한다.
  //   KIS 중복(dup)으로 합산에서 빠진 종목도 평단은 목록·수익률에 그대로 보인다.
  //   dup 을 먼저 걸러 rest 만 검사하면, 중복 종목의 오염 평단은 영원히 질문받지 못한다(실측으로 발견).
  const badAll = all.filter((h) => !saneAvg(h) && h.ccy !== "USD");
  badAll.forEach((h) => {
    const isDup = isKisDup(h);
    warnings.push({
      code: "AVG_PRICE_OUT_OF_RANGE", name: h.name,
      // id·평단을 함께 실어 UI가 '확인/수정'을 물어볼 수 있게 한다(앱이 임의로 고치지 않는다).
      id: h.id, avgPrice: Number(h.avgPrice), shares: Number(h.shares), dup_with_kis: !!isDup,
      message: isDup
        ? `${h.name} 평단(${Number(h.avgPrice).toLocaleString()}원)이 정상 범위를 벗어납니다. 증권사 연동에도 있어 총자산 합산에는 쓰지 않지만, 목록에는 이 값이 그대로 보입니다`
        : `${h.name} 평단(${Number(h.avgPrice).toLocaleString()}원)이 정상 범위를 벗어나 총자산에서 제외했습니다`,
      excluded_from_totals: true,
    });
  });

  // [라이브 평가] 직접입력 주식을 '현재가'로 재평가 → 접속 시마다 자동 갱신(스냅샷 아님).
  //   국내·해외 공통(/api/etf/quote), 해외는 fx로 원화 환산. 라이브 실패 시 저장 평단으로 폴백.
  const { quotes: stQuotes, fxRate: stFx } = await fetchStockQuotes(good);
  let manualWon = 0, manualAny = false, fxSkipped = 0;
  good.forEach((h) => {
    const { won } = holdingValueKrw(h, stQuotes[h.id], stFx);
    if (won == null) { fxSkipped += 1; return; } // 해외 + 라이브·환율 모두 없음
    manualWon += won; manualAny = true;
  });
  if (fxSkipped > 0) warnings.push({
    code: "FX_UNAVAILABLE", name: null,
    message: `해외 주식 ${fxSkipped}건은 현재가·환율 정보가 없어 총자산에서 제외했습니다`, excluded_from_totals: true,
  });

  // [N1] 백엔드 소스가 '둘 다' 없을 때만 경고한다 — 2차가 살아 있으면 KIS 값은 들어온다.
  if (beDown) warnings.push({
    code: "BACKEND_UNAVAILABLE", name: null,
    message: "증권사 연동 자산을 불러오지 못했습니다 — 총자산이 실제보다 적을 수 있습니다",
    excluded_from_totals: true,
  });

  // ── 4) 자산군별 '채택' — beUk 는 위에서 이미 억으로 정규화됐다(여기서 uk() 재적용 금지 = 1억분의 1 사고).
  const beStock = beUk?.stock ?? null;
  const manualUk = manualAny ? uk(manualWon) : null;
  const estStock = onb.stock_uk != null ? Number(onb.stock_uk) : null;
  const manualPart = manualUk != null ? manualUk : (all.length === 0 ? estStock : null);
  const stock_uk = beStock == null && manualPart == null ? null : round2((beStock || 0) + (manualPart || 0));
  // [PWA 절삭 수정] stock_uk(억, 2자리)와 별개로 화면 큰 숫자용 정확한 원 단위 합계.
  //   beStockWon 이 있으면(백엔드 정상 응답) 그걸 쓰고, 없으면 beStock(이미 반올림된 억)을
  //   원으로 환산해 기존과 동일한 근사치로 자연히 폴백한다. 온보딩 추정치(estStock)뿐인
  //   경우는 애초에 추정값이라 "정확한 원"이 없으므로 다루지 않는다(화면이 stock_uk*1e8
  //   근사 표기로 폴백 — 지금까지의 동작 그대로).
  const stock_won = beStockWon == null && !manualAny ? null
    : Math.round((beStockWon != null ? beStockWon : (beStock || 0) * 1e8) + (manualAny ? manualWon : 0));
  sources.stock = manualUk != null ? (beStock != null ? "backend+manual" : "manual")
    : beStock != null ? "backend" : manualPart != null ? "onboard(estimate)" : "none";

  const live = await fetchLiveEtfKrw(trader);
  const etf_uk = live?.krw != null ? uk(live.krw) : (beUk?.etf ?? null);
  sources.etf = live?.krw != null ? (live.live ? "live(replace)" : "backend-report") : beUk?.etf != null ? "backend" : "none";

  // [사용자 지시] 전세(월세) 보증금은 세입자에게 돌려줘야 할 부채성 항목이라 "실제 투자금액"이
  //   아니다. 지금까지는 평가금액(매매가/AVM 기준) 그대로를 총자산에 반영해 갭투자로 보유한
  //   부동산의 투자/실적 금액이 실제보다 커 보였다. "추가 부동산"(투자용) 등록 시 입력한
  //   보증금(realestate.js의 deposit 필드, 원 데이터는 그대로 두고 총자산 계산에서만 차감)을
  //   빼서 순자산 기준으로 만든다. 실거주 대표단지는 보증금 개념이 없어 그대로.
  const realestateGrossUk = beUk?.realty != null ? beUk.realty
    : (onb.realestate_uk != null ? round2(onb.realestate_uk) : null);
  const invProps = (() => {
    if (typeof window === "undefined") return [];
    try { const arr = JSON.parse(localStorage.getItem("onehub_re_properties") || "[]"); return Array.isArray(arr) ? arr : []; } catch { return []; }
  })();
  const depositUk = invProps.reduce((s, p) => s + (Number(p.deposit) || 0), 0);
  const realestate_uk = realestateGrossUk == null ? null : round2(Math.max(0, realestateGrossUk - depositUk));
  sources.realestate = realestateGrossUk == null ? "none"
    : (beUk?.realty != null ? "backend" : "onboard") + (depositUk > 0.005 ? "-net_of_deposit" : "");

  const cash_uk = onb.cash_uk != null ? round2(onb.cash_uk)
    : (beUk?.cash != null ? beUk.cash : null);
  sources.cash = onb.cash_uk != null ? "onboard" : (beUk?.cash != null ? "backend" : "none");

  // ── 5) 총액 — 앱 전체에서 자산을 더하는 건 여기 한 줄뿐이다.
  const parts = [stock_uk, etf_uk, realestate_uk, cash_uk].filter((v) => v != null);
  const total_uk = parts.length ? round2(parts.reduce((s, v) => s + Number(v), 0)) : null;

  const ledger = {
    ok: total_uk != null,
    as_of: new Date().toISOString(),
    total_uk,
    breakdown: { stock_uk, etf_uk, realestate_uk, cash_uk, stock_won },
    realty_state: realestate_uk != null && realestate_uk > 0 ? "entered" : "none",
    sync_state,
    sources,
    warnings,
  };

  // ── 6) 자기검증 — 총액과 자산군 합이 어긋나면 즉시 드러낸다.
  if (process.env.NODE_ENV === "development" && total_uk != null) {
    // 합산은 위 총액 계산 1회뿐이라, 검증은 별도 누산(forEach)으로 대조한다.
    // stock_won 은 억 단위가 아니라(원 단위 보조 필드) 이 억-단위 합계에서 제외한다.
    let sum = 0;
    [stock_uk, etf_uk, realestate_uk, cash_uk].forEach((v) => { if (v != null) sum += Number(v); });
    console.assert(Math.abs(total_uk - round2(sum)) < 0.01, `[N1] 총액 불일치: total=${total_uk} sum=${round2(sum)}`);
  }
  return ledger;
}
