// [S22-4] 자산군 목표 배분 — 주식·ETF·부동산·현금 사이의 목표(운용자산 기준, 실거주 제외).
//   기존 onehub_target_alloc(ETF 내부 국내/해외)와 다른 축이다. 여기선 자산군 단위 목표를 둔다.
//   미설정이면 null(추측 기본값 없음). 저장은 SYNC_KEYS(onehub_target_class)로 기기 간 동기화.
const KEY = "onehub_target_class";

export const CLASS_KEYS = ["stock", "etf", "realestate", "cash"];
export const CLASS_LABELS = { stock: "주식", etf: "ETF", realestate: "부동산", cash: "현금" };

// 프리셋(합 100). ETF 페이지 프리셋과 결이 같게 안정형→공격형으로 위험자산 비중 증가.
export const CLASS_PRESETS = {
  안정형: { stock: 15, etf: 35, realestate: 30, cash: 20 },
  중립형: { stock: 25, etf: 40, realestate: 25, cash: 10 },
  공격형: { stock: 40, etf: 45, realestate: 10, cash: 5 },
};

export function getTargetClass() {
  if (typeof window === "undefined") return null;
  try { const o = JSON.parse(localStorage.getItem(KEY) || "null"); return o && typeof o === "object" ? o : null; }
  catch { return null; }
}

// 목표 저장(합이 100이 아니면 100으로 정규화). preset 이름도 함께 보관.
export function setTargetClass(obj, presetName = null) {
  const raw = obj || {};
  const sum = CLASS_KEYS.reduce((s, k) => s + (Number(raw[k]) || 0), 0);
  const out = {};
  CLASS_KEYS.forEach((k) => { out[k] = sum > 0 ? Math.round(((Number(raw[k]) || 0) / sum) * 1000) / 10 : 0; });
  if (presetName) out._preset = presetName;
  try { localStorage.setItem(KEY, JSON.stringify(out)); } catch {}
  if (typeof window !== "undefined") { try { window.dispatchEvent(new Event("onehub-assets-change")); } catch {} }
  return out;
}

export function clearTargetClass() {
  try { localStorage.removeItem(KEY); } catch {}
  if (typeof window !== "undefined") { try { window.dispatchEvent(new Event("onehub-assets-change")); } catch {} }
}

// 운용 breakdown(억, 실거주 제외)과 목표를 받아 자산군별 현재%·목표%·이탈(%p)을 낸다.
//   op = { stock, etf, realestate(투자용만), cash }. 분모 = 그 합(=운용자산).
export function computeClassDrift(op, target) {
  if (!target) return null;
  const tot = CLASS_KEYS.reduce((s, k) => s + (Number(op?.[k]) || 0), 0);
  if (!(tot > 0)) return null;
  return CLASS_KEYS.map((k) => {
    const curPct = ((Number(op?.[k]) || 0) / tot) * 100;
    const tgtPct = Number(target?.[k]) || 0;
    return { key: k, label: CLASS_LABELS[k], curPct: Math.round(curPct * 10) / 10, tgtPct, drift: Math.round((curPct - tgtPct) * 10) / 10 };
  });
}

// 가장 큰 이탈 한 줄 문구(종합자산 헤드라인용). 없으면 null.
export function topDriftMessage(drift) {
  if (!drift || !drift.length) return null;
  const top = [...drift].sort((a, b) => Math.abs(b.drift) - Math.abs(a.drift))[0];
  if (!top || Math.abs(top.drift) < 3) return { text: "목표 배분에 거의 맞습니다", tone: "ok", top: null };
  const dir = top.drift > 0 ? "많습니다" : "적습니다";
  return { text: `${top.label}이(가) 목표보다 ${top.drift > 0 ? "+" : ""}${top.drift}%p ${dir}`, tone: "warn", top };
}
