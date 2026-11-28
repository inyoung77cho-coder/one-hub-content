// [S49] 분해 레이어 — "어제 대비 왜 움직였나" 중 계산으로 답할 수 있는 부분을 걷어낸다.
//   4단: 환율 / 시장 / 섹터 / 고유.  LLM 없음 · 화면 없음(화면은 S50).
//
//   r_krw = 원화 기준 일간 수익률(대표님이 보는 숫자)
//   r_fx  = USD/KRW 일간 변화            (국내 종목은 0)
//   r_usd = r_krw − r_fx                 (근사 — 교차항 r_usd·r_fx 는 '고유'에 남는다)
//   r_mkt = 시장 지수 일간 변화(spx / kospi)
//   r_sec = 섹터 벤치마크 일간 변화      (sector:null 또는 섹터 이력 실패면 r_sec = r_mkt → 섹터 조각 0, 3단)
//
//   환율 = r_fx · 시장 = r_mkt · 섹터 = r_sec − r_mkt · 고유 = r_usd − r_sec
//   ⇒ 네 조각의 합 = r_krw (정의상 정확 — 반올림 외 오차 없음. 검증은 sumError 로 노출)
//
//   ★베타를 쓰지 않는다(고유 = 달러수익률 − 섹터벤치마크 그대로).
//     β 는 추정 기간에 따라 흔들리고 사용자에게 설명할 수 없다.
//   ★한계(숨기지 말 것): 시장·섹터보다 변동성이 큰 종목(예: SK하이닉스, 레버리지성 테마 ETF)은
//     시장이 1% 움직일 때 2% 움직여도 그 초과분이 전부 '고유'로 잡힌다 → '고유'가 실제보다 크게 보인다.
//     반대로 변동성이 작은 종목(SCHD 등)은 시장 하락일에 '고유'가 플러스로 보일 수 있다.
//   ★날짜: 각 대상의 마지막 두 거래일(종목 이력 기준) d0→d1 을 쓰고, 지수·환율·섹터도 '같은 두 날짜'의
//     종가만 쓴다. 날짜가 없으면 보간·추정하지 않고 missing 으로 뺀다.
//     환율 일봉(Yahoo KRW=X)은 UTC 일 기준이라 미국 종가 시각과 몇 시간 어긋난다 — 근사로 둔다.
//   ★금액: ETF 는 lib/etfLive.js 가 합산에 실제로 넣은 종목별 평가액(byTicker), 국내 주식은
//     allHoldings 의 포지션(수량×현재가)을 그대로 받는다. 여기서 자산 총합을 만들지 않는다(원장 계약).
//     금액 기여 = 전일 평가액(현재 평가액 ÷ (1+r_krw)) × 조각. 그래서 조각별 금액의 합 = 그 종목의 하루 손익.
import { cachedJson } from "./quoteCache";

// [S49] 벤치마크 매핑 — 판단이 들어간 표다. 바뀔 수 있으므로 ★여기 한 곳에만★ 둔다.
//   market: "spx" | "kospi"
//   sector: 섹터 벤치마크 티커(:5003 etf/history 로 이력 조회) | null(= 섹터 분해 안 함, 3단)
//   매핑에 없는 티커는 분해하지 않는다(missing). 추측해서 끼워 넣지 말 것.
export const BENCH = {
  SMH:  { market: "spx", sector: "SMH"  },  // 섹터 그 자체 → 고유 = 0
  IGPT: { market: "spx", sector: "SMH"  },
  DRAM: { market: "spx", sector: "SMH"  },
  BOTZ: { market: "spx", sector: "SMH"  },
  IGV:  { market: "spx", sector: "IGV"  },
  PLTR: { market: "spx", sector: "IGV"  },
  QQQM: { market: "spx", sector: "QQQM" },
  VOO:  { market: "spx", sector: null   },  // 시장 그 자체
  SCHD: { market: "spx", sector: null   },  // 배당 스타일 — 섹터 아님
  SHLD: { market: "spx", sector: null   },  // 방산 — 이력 있는 벤치마크 없음(새 소스 추가 안 함)
  TOPT: { market: "spx", sector: null   },
  XOVR: { market: "spx", sector: null   },
  "005930": { market: "kospi", sector: null }, // 삼성전자 — :5003 이력은 있으나 국내 섹터 벤치마크 이력 소스가 없음
  "000660": { market: "kospi", sector: null }, // SK하이닉스 — 같음
};

const SERIES_N = 40;
export const CACHE_KEY = "onehub_decompose_cache"; // 기기 안 당일 캐시(SYNC_KEYS 미등록 — 시장 데이터 파생값만)
const DAY_RESET_HOUR_KST = 7; // 미국 장 마감 반영 전(07시 이전)에 만든 캐시는 07시에 만료

const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));
function kstNow(now = Date.now()) { return new Date(now + 9 * 3600 * 1000); }
function kstDay(now) { return kstNow(now).toISOString().slice(0, 10); }
// 캐시 유효 판정: 같은 KST 날짜 + (07시 이전에 만든 캐시는 07시가 지나면 만료)
function cacheFresh(entry, now = Date.now()) {
  if (!entry || entry.day !== kstDay(now)) return false;
  const madeHour = kstNow(entry.ts).getUTCHours();
  const nowHour = kstNow(now).getUTCHours();
  return !(madeHour < DAY_RESET_HOUR_KST && nowHour >= DAY_RESET_HOUR_KST);
}

// closes:[{date,close}] → Map(date→close) (유효 행만)
function toMap(rows) {
  const m = new Map();
  (rows || []).forEach((r) => { if (isDate(r?.date) && Number.isFinite(Number(r?.close)) && Number(r.close) > 0) m.set(r.date, Number(r.close)); });
  return m;
}
function lastTwo(m) {
  const ds = [...m.keys()].sort();
  return ds.length >= 2 ? [ds[ds.length - 2], ds[ds.length - 1]] : null;
}
// 같은 두 날짜의 변화율. 한쪽이라도 없으면 null(보간 없음).
function chg(m, d0, d1) {
  if (!m) return null;
  const a = m.get(d0), b = m.get(d1);
  return a > 0 && b > 0 ? b / a - 1 : null;
}

// ── 순수 계산(네트워크 없음) ─────────────────────────────────────────────
//   targets: [{ target, kind:"etf"|"stock", amountKrw|null }]
//   series : { fx: Map|null, mkt: {spx: Map|null, kospi: Map|null}, tick: {TICKER: Map|null}, errors: {key: reason} }
export function computeDecomposition(targets, series) {
  const items = [], missing = [];
  const fxMap = series?.fx || null;
  for (const t of targets) {
    const target = String(t.target || "").toUpperCase();
    const b = BENCH[target];
    const miss = (reason) => missing.push({ target, kind: t.kind, reason });
    if (!b) { miss("벤치마크 매핑 없음(추측 분해 안 함)"); continue; }
    const own = series?.tick?.[target];
    if (!own) { miss(`종목 일별 이력 없음${series?.errors?.[target] ? ` — ${series.errors[target]}` : ""}`); continue; }
    const dd = lastTwo(own);
    if (!dd) { miss("종목 일별 이력이 2거래일 미만"); continue; }
    const [d0, d1] = dd;
    const overseas = b.market === "spx";
    const mktMap = series?.mkt?.[b.market];
    if (!mktMap) { miss(`시장 지수(${b.market}) 시계열 없음`); continue; }
    if (overseas && !fxMap) { miss("환율(USD/KRW) 시계열 없음 — 해외 종목 전부 분해 불가"); continue; }
    const r_local = chg(own, d0, d1);              // 현지 통화 수익률(해외=달러, 국내=원)
    const r_fx = overseas ? chg(fxMap, d0, d1) : 0;
    const r_mkt = chg(mktMap, d0, d1);
    if (r_local == null) { miss("종목 종가 이상"); continue; }
    if (r_fx == null) { miss(`환율 ${d0}·${d1} 종가 중 없음(보간 안 함)`); continue; }
    if (r_mkt == null) { miss(`시장 지수(${b.market}) ${d0}·${d1} 종가 중 없음(보간 안 함)`); continue; }
    const r_krw = (1 + r_local) * (1 + r_fx) - 1;   // 원화 기준 실제 일간 수익률
    // 섹터: 매핑 null → 3단. 섹터 이력 실패·날짜 없음 → 3단으로 내려가고 이유를 남긴다.
    let r_sec = null, sectorReason = null;
    if (b.sector) {
      r_sec = target === b.sector ? r_local : chg(series?.tick?.[b.sector], d0, d1);
      if (r_sec == null) sectorReason = `섹터 벤치마크(${b.sector}) ${d0}·${d1} 이력 없음 — 3단으로 분해`;
    } else sectorReason = "섹터 벤치마크 미지정(매핑 null) — 3단으로 분해";
    const sectorAvailable = r_sec != null;
    const r_usd = r_krw - r_fx;
    const sec = sectorAvailable ? r_sec : r_mkt;
    const pieces = { fx: r_fx, market: r_mkt, sector: sec - r_mkt, own: r_usd - sec };
    const P = (x) => x * 100; // %p 단위로 반환
    const sumPct = P(pieces.fx) + P(pieces.market) + P(pieces.sector) + P(pieces.own);
    const amountKrw = Number.isFinite(t.amountKrw) && t.amountKrw > 0 ? t.amountKrw : null;
    const prevKrw = amountKrw != null ? amountKrw / (1 + r_krw) : null;
    items.push({
      target, kind: t.kind, marketIndex: b.market, sectorBench: sectorAvailable ? b.sector : null,
      from: d0, to: d1,
      // 네 조각과 r_krw 는 %p 단위. market = '시장 기여'(지수 이름은 marketIndex)
      r_krw: P(r_krw), fx: P(pieces.fx), market: P(pieces.market), sector: P(pieces.sector), own: P(pieces.own),
      sumError: Math.abs(sumPct - P(r_krw)),
      sectorAvailable, sectorReason: sectorAvailable ? null : sectorReason,
      amountKrw, amountDelta: prevKrw != null ? prevKrw * r_krw : null,
      amountBy: prevKrw != null ? { fx: prevKrw * pieces.fx, market: prevKrw * pieces.market, sector: prevKrw * pieces.sector, own: prevKrw * pieces.own } : null,
    });
  }
  // 금액 없는 대상은 금액 가중 합에 넣을 수 없다 → 분해(퍼센트)는 보여주되 missing 에 이유를 남긴다.
  items.filter((it) => it.amountKrw == null).forEach((it) => missing.push({ target: it.target, kind: it.kind, reason: "평가액 없음(시세 미수신 등) — 금액 합계에서 제외" }));

  // byFactor = 금액 가중 합(원). 퍼센트 평균이 아니다.
  const byFactor = { fx: 0, market: 0, sector: 0, own: 0 };
  const sectorGroups = {}; // 같은 섹터 벤치마크의 섹터 조각을 금액 하나로 묶는다(같은 원인을 여러 번 말하지 않기)
  let totalDelta = 0;
  items.forEach((it) => {
    if (!it.amountBy) return;
    for (const k of Object.keys(byFactor)) byFactor[k] += it.amountBy[k];
    totalDelta += it.amountDelta;
    if (it.sectorBench) {
      const g = (sectorGroups[it.sectorBench] = sectorGroups[it.sectorBench] || { bench: it.sectorBench, members: [], amount: 0, from: it.from, to: it.to });
      g.members.push(it.target); g.amount += it.amountBy.sector;
    }
  });
  const asOf = {};
  items.forEach((it) => { if (!asOf[it.marketIndex] || it.to > asOf[it.marketIndex]) asOf[it.marketIndex] = it.to; });
  const maxSumError = items.reduce((m, it) => Math.max(m, it.sumError), 0);
  return { ok: items.length > 0, asOf, items, byFactor, totalDelta, sectorGroups: Object.values(sectorGroups), missing, maxSumError };
}

// ── 데이터 수집(cachedJson — 30초 캐시·동시요청 중복제거) ──────────────────
//   호출 수 = 지수(대상이 속한 시장만, ≤2) + 환율(해외 있을 때 1) + 종목·섹터 이력(중복 제거) — 대상 15개면 ≤18.
async function fetchSeries(targets) {
  const errors = {};
  const mapped = targets.map((t) => String(t.target).toUpperCase()).filter((t) => BENCH[t]);
  const markets = [...new Set(mapped.map((t) => BENCH[t].market))];
  const needFx = markets.includes("spx");
  const tickers = [...new Set([...mapped, ...mapped.map((t) => BENCH[t].sector).filter(Boolean)])];
  const idx = async (sym) => {
    const d = await cachedJson(`/api/index/history?symbol=${sym}&series=${SERIES_N}`);
    if (d?.ok && Array.isArray(d.series)) return toMap(d.series);
    errors[sym] = d?.error || "응답 없음"; return null;
  };
  const hist = async (tk) => {
    const d = await cachedJson(`/api/etf/history?ticker=${encodeURIComponent(tk)}`);
    if (d?.ok && Array.isArray(d.closes) && d.closes.length) return toMap(d.closes);
    errors[tk] = d?.error || "응답 없음"; return null;
  };
  const [fx, mktPairs, tickPairs] = await Promise.all([
    needFx ? idx("usdkrw") : Promise.resolve(null),
    Promise.all(markets.map(async (m) => [m, await idx(m)])),
    Promise.all(tickers.map(async (tk) => [tk, await hist(tk)])),
  ]);
  return { fx, mkt: Object.fromEntries(mktPairs), tick: Object.fromEntries(tickPairs), errors };
}

// Map 은 JSON 이 안 되므로 캐시에는 [date,close] 배열로 넣는다.
const ser = (m) => (m ? [...m.entries()] : null);
const des = (a) => (Array.isArray(a) ? new Map(a) : null);
function readCache(now) {
  try {
    const e = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
    return cacheFresh(e, now) ? e : null;
  } catch { return null; }
}

// 시계열은 하루 1회분만 받는다(일별 종가는 하루 한 번 바뀜). 금액은 매번 호출측 값으로 다시 가중한다.
//   ★실패가 하나라도 있으면 캐시에 넣지 않는다 → 다음 열람 때 재시도(실패를 하루 동안 굳히지 않음).
export async function loadSeriesCached(targets, { now = Date.now(), fetcher = fetchSeries } = {}) {
  const want = [...new Set(targets.map((t) => String(t.target).toUpperCase()).filter((t) => BENCH[t]))].sort();
  const c = typeof localStorage !== "undefined" ? readCache(now) : null;
  if (c && want.every((t) => c.targets.includes(t))) {
    return { fx: des(c.fx), mkt: { spx: des(c.mkt?.spx), kospi: des(c.mkt?.kospi) }, tick: Object.fromEntries(Object.entries(c.tick || {}).map(([k, v]) => [k, des(v)])), errors: {}, cached: true };
  }
  const s = await fetcher(targets);
  if (!Object.keys(s.errors).length && typeof localStorage !== "undefined") {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ day: kstDay(now), ts: now, targets: want, fx: ser(s.fx), mkt: { spx: ser(s.mkt.spx), kospi: ser(s.mkt.kospi) }, tick: Object.fromEntries(Object.entries(s.tick).map(([k, v]) => [k, ser(v)])) }));
    } catch {}
  }
  return { ...s, cached: false };
}

// 대상 + 금액 만들기 — 금액은 기존 계산값을 그대로 받는다(여기서 자산을 합산하지 않는다).
//   etfLive: fetchLiveEtfKrw() 결과(byTicker 사용) · stockPositions: allHoldings.getAllStockPositions() 결과
export function buildTargets({ etfLive, stockPositions } = {}) {
  const out = new Map();
  Object.entries(etfLive?.byTicker || {}).forEach(([tk, v]) => {
    const k = String(tk).toUpperCase(); const prev = out.get(k);
    out.set(k, { target: k, kind: "etf", amountKrw: (prev?.amountKrw || 0) + (Number(v) || 0) });
  });
  (stockPositions || []).forEach((p) => {
    const k = String(p?.code || "").toUpperCase(); if (!k) return;
    if (p.ccy && p.ccy !== "KRW") { out.set(k, out.get(k) || { target: k, kind: "stock", amountKrw: null }); return; }
    const v = Number(p.qty) > 0 && Number(p.current_price) > 0 ? Number(p.qty) * Number(p.current_price) : null;
    const prev = out.get(k);
    out.set(k, { target: k, kind: prev?.kind || "stock", amountKrw: v == null ? (prev?.amountKrw ?? null) : (prev?.amountKrw || 0) + v });
  });
  return [...out.values()];
}

// 진입점 — S50 화면이 부른다. 부동산·연금·현금은 대상이 아니다(일간 분해 불성립 / 범위 밖).
export async function getDailyDecomposition({ etfLive, stockPositions, now } = {}) {
  const targets = buildTargets({ etfLive, stockPositions });
  if (!targets.length) return { ok: false, asOf: {}, items: [], byFactor: { fx: 0, market: 0, sector: 0, own: 0 }, totalDelta: 0, sectorGroups: [], missing: [], maxSumError: 0, cached: false };
  const series = await loadSeriesCached(targets, { now });
  const r = computeDecomposition(targets, series);
  return { ...r, cached: series.cached };
}
