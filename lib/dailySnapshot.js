// [S22-3] 총자산 곡선 적립 backstop — 어느 탭으로 들어와도 그날 총자산 스냅샷이 1건 남도록.
//   오늘·자산·AI 탭은 자체 load()에서 이미 recordSnapshot 하지만, ETF·부동산만 보고 나가면
//   그날 곡선에 구멍이 난다. 이 헬퍼를 그 페이지들 마운트에서 1회 호출해 빈틈을 메운다.
//   getLedger(단일 원장 N1)로 총자산을 구해 assetHistory 에 적립한다(같은 날은 자체 병합).
import { getLedger } from "./ledger";
import { recordSnapshot } from "./assetHistory";
import { getTrader } from "./trader";

let _doneKey = null; // 이 세션에서 성공 적립한 trader+날짜 — 중복 계산 방지

function kstDay() {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

export function ensureDailySnapshot() {
  if (typeof window === "undefined") return;
  let tr;
  try { tr = getTrader(); } catch (e) { return; }
  const key = `${tr}:${kstDay()}`;
  if (_doneKey === key) return;
  getLedger(tr)
    .then((L) => {
      if (L && L.ok && L.total_uk != null) { recordSnapshot(tr, L); _doneKey = key; }
    })
    .catch(() => {});
}
