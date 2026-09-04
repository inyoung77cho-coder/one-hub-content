// [S29-8] 이번 주 회차 소재 초안 — ★기존 데이터만. 새 수집기 없음. 없는 소재는 그냥 빠진다.
//   숫자마다 출처를 함께(영상에서 잘못 말하면 되돌릴 수 없다). 초안은 초안 — 리서치를 없애는 용도.
//   소재가 2개 미만이면 정직하게 말한다. (LLM 문장 다듬기가 필요하면 S27 :5005 서킷브레이커 경유 —
//    여기선 지어내지 않도록 규칙 기반 조립만; 숫자는 각 소스 화면 값과 동일.)
import { getVerdictScorecard } from "./verdictStats";
import { getTrader } from "./trader";

export async function buildEpisodeDraft() {
  const tr = (() => { try { return getTrader(); } catch { return "A"; } })();
  const items = [];

  // ① 차단 종목 후일담 — 가장 강함(이 앱만 가능)
  try {
    const d = await fetch(`/api/pwa/accuracy?trader_id=${tr}`).then((r) => r.json());
    const s = d && d.ok ? d.summary : null;
    if (s && s.total_checked > 0) {
      const recent = (d.recent || []).filter((r) => r.price_change_pct != null);
      const miss = recent.filter((r) => r.price_change_pct > 0).sort((a, b) => b.price_change_pct - a.price_change_pct)[0];
      items.push({
        headline: `AI가 막은 종목들 — 차단 적중률 ${s.accuracy_pct ?? "-"}% (${s.success_count}/${s.total_checked}건)`,
        detail: miss ? `가장 큰 오판: ${miss.stock} 차단 후 +${miss.price_change_pct.toFixed(1)}%` : "큰 오판 없음",
        source: "차단 정확도(/api/pwa/accuracy)",
      });
    }
  } catch (e) {}

  // ② 나 vs AI 주간
  try {
    const sc = getVerdictScorecard(tr, { days: 7 });
    if (sc && sc.total > 0) {
      const ai = typeof sc.aiRet === "number" ? `${sc.aiRet >= 0 ? "+" : ""}${sc.aiRet.toFixed(1)}%` : "-";
      items.push({
        headline: `내 판단 ${sc.total}건 · 승률 ${sc.winRate ?? "-"}% (AI 평균 ${ai})`,
        detail: sc.passRate != null ? `관망 ${sc.passRate}%${sc.missedAvg != null ? ` · 놓친 수익 ${sc.missedAvg}%` : ""}` : "",
        source: "심판석(getVerdictScorecard·7일)",
      });
    }
  } catch (e) {}

  // ③ 부동산 신고가(S28-10)
  try {
    const d = await fetch("/api/pwa/re/new-high").then((r) => r.json());
    const it = (d && d.items) ? d.items[0] : null;
    if (it) items.push({
      headline: `신고가 · ${it.complex} ${Number(it.price_manwon).toLocaleString()}만원`,
      detail: it.area_m2 ? `${Math.round(it.area_m2)}㎡` : "",
      source: "신고가(/api/pwa/re/new-high)",
    });
  } catch (e) {}

  const enough = items.length >= 2;
  const top = items.slice(0, 3);
  const minutes = Math.max(3, top.length * 2);
  let script = "";
  if (enough) {
    script = [
      "[인트로] 이번 주 ONE·HUB, 데이터로 보는 세 가지.",
      ...top.map((it, i) => `[${i + 1}] ${it.headline}. ${it.detail || ""} (출처: ${it.source})`),
      "[아웃트로] 숫자는 앱 화면 그대로입니다. 다음 주에 또.",
    ].join("\n");
  }
  return { items: top, enough, script, minutes };
}
