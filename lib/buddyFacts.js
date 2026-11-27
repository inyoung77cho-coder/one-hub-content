// [S51-1] 버니 사실표 — 원장·증감·보유를 읽어 '서버로 보낼 사실'만 조립한다.
//   ★자산 합산 금지(N1): 금액은 getLedger().breakdown 값을 옮기고, 비중은 그 값을 총자산으로 나눌 뿐이다.
//   ★보내지 않는 것: 계좌번호·수량·원 단위 금액·단지 이름·동호수·경고 안의 종목 이름(경고는 코드만).
//   ★모르는 값은 null 로 둔다(0 으로 채우지 않는다) — 버니가 '확인하지 못했다'고 말하게.
//
//   buildFacts({ ledger, delta, stocks, etfs, region }) — 순수 함수(단위 확인용).
//   loadFacts(trader) — 화면용: 원장·증감·보유·지역을 읽어 buildFacts 에 넘긴다.
import { getLedger } from "./ledger";
import { getDelta } from "./assetHistory";
import { getAllStockPositions, getAllEtfPositions } from "./allHoldings";
import { fetchStockQuotes } from "./stockLive";
import { guOf } from "./storyRegion";

const r1 = (v) => (v == null || !Number.isFinite(Number(v)) ? null : Math.round(Number(v) * 10) / 10);
const r3 = (v) => (v == null || !Number.isFinite(Number(v)) ? null : Math.round(Number(v) * 1000) / 1000);
const n = (v) => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

// 손절선 '이탈' — today.js 인라인 판정과 같은 조건(현재가 ≤ 손절선). 근접(3%)은 이탈이 아니다.
export function stopBreached(p) {
  const sl = n(p?.stop_loss), cur = n(p?.current_price);
  return sl != null && sl > 0 && cur != null && cur > 0 && cur <= sl;
}

// 보유 1건의 원화 평가액(비중 계산용). 모르면 null — 해외(USD)는 환율 경로가 달라 비중을 내지 않는다.
function valueWon(p) {
  if (p.source === "kis") return n(p.eval_amount);
  if ((p.ccy || "KRW") !== "KRW") return null;
  const cur = n(p.current_price), q = n(p.qty);
  return cur != null && q != null ? cur * q : null;
}

export function buildFacts({ ledger, delta, stocks = [], etfs = [], region = "" } = {}) {
  const b = ledger?.breakdown || {};
  const total = n(ledger?.total_uk);
  const op = n(b.operating_uk);
  // 머리 숫자: 운용자산이 있으면 운용자산, 없으면 총자산. 둘 다 없으면 null(원장 실패).
  const useOp = op != null;
  const head_label = useOp ? "운용자산" : "총자산";
  const head_uk = useOp ? op : total;

  // 증감: 머리 숫자와 같은 정의일 때만. 운용 델타가 null(정의 바뀐 날)이면 증감을 보내지 않는다.
  let d = null;
  if (delta && n(delta.days) != null) {
    const head = useOp ? n(delta.operating) : n(delta.total);
    if (head != null) {
      const by = {};
      [["stock", "stock"], ["etf", "etf"], ["realestate", "realty"], ["cash", "cash"], ["pension", "pension"]].forEach(([k, src]) => {
        const v = n(delta[src]);
        if (v != null) by[k] = r3(v);
      });
      d = { days: n(delta.days), prev_date: delta.prevDate || "", head_uk: r3(head), by_class: by };
    }
  }

  // 비중: 총자산(원장 total_uk) 대비 자산군 비율 — 나눗셈만. 키에 기준을 적어 버니가 혼동하지 않게.
  const weights = {};
  if (total != null && total > 0) {
    [["주식(총자산 대비%)", b.stock_uk], ["ETF(총자산 대비%)", b.etf_uk], ["부동산(총자산 대비%)", b.realestate_uk], ["현금(총자산 대비%)", b.cash_uk]]
      .forEach(([k, v]) => { if (n(v) != null) weights[k] = r1((n(v) / total) * 100); });
  }

  const totalWon = total != null && total > 0 ? total * 1e8 : null;
  const holdings = [];
  const events = [];
  const push = (p, kind) => {
    const name = String(p?.name || p?.code || "").trim();
    if (!name) return;
    const v = valueWon(p);
    holdings.push({
      name, kind,
      chg_1d_pct: r1(p.change_1d),
      ret_pct: p._quoteMissing ? null : r1(p.pnl_rate),
      weight_pct: v != null && totalWon ? r1((v / totalWon) * 100) : null,
    });
    if (kind === "stock" && stopBreached(p)) events.push({ type: "stop_breached", name });
  };
  (stocks || []).forEach((p) => push(p, "stock"));
  (etfs || []).forEach((p) => push(p, "etf"));

  // 경고는 코드만(메시지·종목 이름 제외), 중복 제거.
  // DUPLICATE_WITH_KIS 는 '확인 못 함'이 아니라 중복 제외 안내라 보내지 않는다.
  const warnings = [...new Set((ledger?.warnings || []).map((w) => w?.code).filter((c) => c && c !== "DUPLICATE_WITH_KIS"))];
  if (!ledger || ledger.ok === false) warnings.push("LEDGER_UNAVAILABLE");

  return { head_label, head_uk: r3(head_uk), delta: d, weights, holdings, events, warnings, region: region || "" };
}

// KIS 포지션은 당일 등락 필드가 없다(S51-0 W7) — 같은 시세 경로로 change_1d 만 채운다. 실패하면 null 유지.
async function fillKisChange(stocks) {
  const kis = stocks.filter((p) => p.source === "kis" && p.code && p.change_1d == null);
  if (!kis.length) return stocks;
  try {
    const { quotes } = await fetchStockQuotes(kis.map((p) => ({ id: "kis:" + p.code, code: p.code, name: p.name })));
    return stocks.map((p) => {
      if (p.source !== "kis") return p;
      const q = quotes["kis:" + p.code];
      return q && q.changePct != null ? { ...p, change_1d: q.changePct } : p;
    });
  } catch { return stocks; }
}

// 지역: 내 대표단지의 법정동 → 구 이름만(단지 이름은 우리 서버 조회에만 쓰고 버니로는 보내지 않는다).
async function loadRegion() {
  let name = "";
  try { name = JSON.parse(localStorage.getItem("onehub_re_my_property") || "null")?.name || ""; } catch {}
  if (!name) return "";
  try {
    const r = await fetch(`/api/pwa/re/complexAreas?complex=${encodeURIComponent(name)}`);
    const d = r.ok ? await r.json() : null;
    const dong = d?.법정동 || "";
    return guOf(dong) || dong || "";
  } catch { return ""; }
}

export async function loadFacts(trader) {
  const [ledger, stocks0, etfs, region] = await Promise.all([
    getLedger(trader).catch(() => null),
    getAllStockPositions(trader).catch(() => null),
    getAllEtfPositions(trader).catch(() => null),
    loadRegion(),
  ]);
  const stocks = stocks0 ? await fillKisChange(stocks0) : [];
  let delta = null;
  try { delta = getDelta(trader); } catch {}
  const facts = buildFacts({ ledger, delta, stocks, etfs: etfs || [], region });
  if (stocks0 == null || etfs == null) facts.warnings.push("HOLDINGS_UNAVAILABLE");
  return { facts, ledger };
}
