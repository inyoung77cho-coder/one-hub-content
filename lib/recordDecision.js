// [S23 T-1] AI 제안에 대한 내 판단을 '가격을 먼저 확보한 뒤' 기록한다.
//   entry(기록 시점 가격)가 없으면 채점 체인이 끊긴다(S19-2에서 고친 버그) — 그래서 시세를 먼저
//   시도하고, 실패해도 recordDecision 이 pending_entry 로 남겨 다음 접속 때 백필한다.
//   추천 카드(index.js)·오늘 화면(today.js)이 이 한 함수를 공유한다(로직 복제 금지).
import { recordDecision } from "./verdictLedger";
import { fetchStockQuote } from "./stockLive";
import { recordVerdictDay } from "./visitLog"; // [S23 T-10] 판단 기록일 계기판

export async function recordDecisionWithPrice({ code, name, decision, trader = "A", source = "manual", priceHint = null, score = null }) {
  let entry = Number(priceHint) || null;
  if (!entry && code) {
    try { const q = await fetchStockQuote(code); entry = q?.price || null; } catch (e) {}
  }
  recordDecision({ code, name, entry, decision, trader, source, score });
  try { recordVerdictDay(trader); } catch (e) {} // [S23 T-10] 판단한 날로 집계(스트릭 배지 아님, 주간 리포트용)
  return { ok: true, entry };
}
