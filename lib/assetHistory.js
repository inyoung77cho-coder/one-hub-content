// lib/assetHistory.js
// 총자산 일별 스냅샷 — 브라우저(localStorage)에 하루 1건 기록.
//
// 왜 클라이언트인가: 총자산(getLedger)은 백엔드 계좌 + 사용자 입력(onboard localStorage)을
//   합쳐 클라에서 계산된다. 서버는 사용자별 '총자산'을 알지 못한다(자산 원장 계약 N1).
//   그래서 서버 크론이 아니라, 앱을 열 때 그 시점의 총자산을 브라우저에 적립한다.
//   → 주식엔진을 건드리지 않고, 오늘부터 곧바로 추세가 쌓인다.
//
// 저장 형태(trader별): [{ date:'2026-07-23', total, stock, etf, realty, cash }, ...] (오름차순, 최근 90일)
// total/breakdown 단위: 억(uk). getLedger 반환과 동일.

const MAX_DAYS = 90;
const KEY = (tr) => `onehub_asset_history_${tr || 'A'}`;

function kstToday() {
  // 브라우저 로컬 시간대에 무관하게 KST 기준 'YYYY-MM-DD' (하루 1건 판정용)
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function read(trader) {
  try {
    const raw = localStorage.getItem(KEY(trader));
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch (e) {
    return [];
  }
}

function write(trader, list) {
  try {
    localStorage.setItem(KEY(trader), JSON.stringify(list.slice(-MAX_DAYS)));
  } catch (e) { /* 저장 실패는 조용히 무시 — 추세는 부가기능 */ }
}

// 앱이 총자산을 계산한 직후 호출. 오늘치가 있으면 최신값으로 갱신(장중 변동 반영), 없으면 추가.
export function recordSnapshot(trader, ledger) {
  if (!ledger || !ledger.ok || ledger.total_uk == null) return;
  const b = ledger.breakdown || {};
  const snap = {
    date: kstToday(),
    total: num(ledger.total_uk),
    stock: num(b.stock_uk),
    etf: num(b.etf_uk),
    realty: num(b.realestate_uk),
    cash: num(b.cash_uk),
    // [S23 T-2] 운용자산(실거주 제외)·실거주 — 오늘 화면이 '운용 전일 대비'를 시세 갱신과 섞지 않게.
    operating: num(b.operating_uk),
    residence: num(b.residence_uk),
  };
  if (snap.total == null) return;
  const list = read(trader);
  const i = list.findIndex((x) => x.date === snap.date);
  if (i >= 0) list[i] = snap;
  else list.push(snap);
  list.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  write(trader, list);
}

export function getHistory(trader) {
  return read(trader);
}

// [S24-1] 곡선용 '단위가 일관된' 시계열. operating 필드는 S23 TA(2026-09-02)에 추가돼, 그 전 스냅샷엔
//   없다. operating 과 total 을 섞어 그리면 실거주 있는 계정에서 하루 만에 82% 급락한 것처럼 보인다.
//   → 혼합 방지 가드를 '데이터를 만드는 쪽'에 둔다(Sparkline 은 받은 배열만 그림).
//   useOperating(=실거주 있음)이면 operating 이 채워진 구간만, 아니면 total(항상 있음) 전체.
export function getAssetSeries(trader, useOperating) {
  const list = read(trader);
  if (useOperating) return list.filter((h) => h.operating != null).map((h) => h.operating);
  return list.filter((h) => h.total != null).map((h) => h.total);
}

// 오늘(마지막) vs 직전 '다른 날' 스냅샷의 차이. 데이터가 2일 미만이면 null.
export function getDelta(trader) {
  const list = read(trader);
  if (list.length < 2) return null;
  const today = list[list.length - 1];
  const prev = list[list.length - 2];
  const d = (k) => (today[k] != null && prev[k] != null ? today[k] - prev[k] : null);
  // [S23 T-4] 실제 경과일수 — '3일 전 대비'를 '어제 대비'로 오인하지 않게.
  const daysBetween = (() => {
    try {
      const a = new Date(prev.date + "T00:00:00Z").getTime();
      const b = new Date(today.date + "T00:00:00Z").getTime();
      return Math.max(1, Math.round((b - a) / 86400000));
    } catch (e) { return 1; }
  })();
  return {
    prevDate: prev.date,
    days: daysBetween,
    total: d('total'),
    stock: d('stock'),
    etf: d('etf'),
    realty: d('realty'),
    cash: d('cash'),
    operating: d('operating'),
    residence: d('residence'),
  };
}
