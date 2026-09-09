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

// ─────────────────────────────────────────────────────────────────────────────
// [S32-6/7/8] 주간 리포트 대본 초안. ★블록 ③(배운 것·틀린 것)은 자동으로 쓰지 않는다 — 후보만.
//   말하기 속도 분당 330자 기준. 상한 넘으면 잘라내지 말고 warnings 로 올려 사람이 뺀다.

// [S32-8] 개발 용어 → 사람 말 번역 사전. 매주 자란다(배열 하나에 모아둔다).
export const TERM_MAP = [
  [/allHoldings\s*통합|보유\s*소스\s*통합/g, "직접 입력한 종목도 오늘 화면에 나오게 했습니다"],
  [/레이트\s*리밋|rate\s*limit/gi, "너무 많이 조회하면 잠시 쉬게 했습니다"],
  [/하이드레이션|hydration/gi, "화면이 처음 뜰 때 멈추던 문제"],
  [/withdrawPlan|인출\s*계획\s*산수/g, "은퇴 후 이 돈으로 몇 년 쓸 수 있는지 계산"],
  [/funnel|가입\s*깔때기/gi, "가입부터 첫 판단까지 몇 명이 남는지"],
  [/backendHealth|헬스\s*엔드포인트|health/gi, "서버가 살아있는지 밖에서 확인"],
  [/공개\s*(실거래|도구)|estimate/gi, "로그인 없이 아파트 실거래를 보는 도구"],
  [/캐시|cache/gi, "한 번 받은 값을 잠시 재사용해 빠르게"],
  [/마스킹|masking/gi, "영상에 나가면 안 되는 값을 가리기"],
  [/온보딩|onboarding/gi, "처음 시작할 때 자산 입력 단계"],
  [/심판석|verdict/gi, "내 판단을 채점하는 화면"],
  [/정비소|MaintenanceShop/gi, "AI가 나아졌는지 보는 운영자 화면"],
];

// 남은 기술 용어(영문 대문자 3자+·스프린트 코드·파일 경로)를 찾아 표시한다. 조용히 통과 금지.
const TECH_PATTERNS = [
  /\bS\d+-[A-Z]{1,2}\b/g,     // 스프린트 코드 S31-AA
  /\bS\d+-\d+\b/g,            // 항목 코드 S32-6
  /\b[A-Za-z0-9_/.-]+\.(js|mjs|ts|py|json|md)\b/g, // 파일 경로
  /\b[A-Z]{3,}\b/g,          // 영문 대문자 3자+ (KIS, ETF 등도 잡히지만 화면에서 사람이 판단)
];

export function translateTech(input) {
  let text = String(input || "");
  for (const [re, rep] of TERM_MAP) text = text.replace(re, rep);
  const needsReview = [];
  for (const p of TECH_PATTERNS) {
    const m = text.match(p);
    if (m) needsReview.push(...m);
  }
  return { text, needsReview: [...new Set(needsReview)] };
}

const SEC_PER_CHAR = 60 / 330; // 분당 330자
const secOf = (chars) => Math.round(chars * SEC_PER_CHAR);

const BLOCK_SPEC = [
  { n: 1, title: "이번 주 숫자", targetSec: 40, limit: 220 },
  { n: 2, title: "이번 주 만든 것", targetSec: 100, limit: 550 },
  { n: 3, title: "이번 주 배운 것·틀린 것", targetSec: 120, limit: 660 },
  { n: 4, title: "시장에서 있었던 일", targetSec: 100, limit: 550 },
  { n: 5, title: "다음 주에 할 것", targetSec: 40, limit: 220 },
];

// digest → { blocks:[{n,title,targetSec,limit,text,warnings,candidates?}], totalSec, warnings }
//   opts.chosen3 = 사람이 고른 블록③ 항목 텍스트(있으면 뼈대 생성). opts.extraCandidates = 클라(심판석) 후보.
export function buildWeeklyScript(digest, opts = {}) {
  const d = digest || {};
  const warnings = [];
  const blocks = [];
  const mk = (spec, text, extra = {}) => {
    const t = String(text || "");
    const w = [];
    if (t.length > spec.limit) w.push(`블록 ${spec.n} 분량 초과: ${t.length}/${spec.limit}자 — 무엇을 뺄지 고르세요`);
    return { ...spec, text: t, chars: t.length, sec: secOf(t.length), warnings: w, ...extra };
  };

  // ① 숫자
  const b1 = (d.block1 || []).filter((x) => x.value != null);
  const b1txt = b1.length
    ? `이번 주 숫자입니다. ${b1.map((x) => `${x.label} ${x.value}`).join(", ")}.`
    : "";
  blocks.push(mk(BLOCK_SPEC[0], b1txt));

  // ② 만든 것 — 상위 3개, 번역층 적용(스프린트 코드·파일명 제거)
  const made = (d.block2 || []).slice(0, 3);
  let b2review = [];
  const b2lines = made.map((m) => {
    const { text, needsReview } = translateTech(m.headline || "");
    b2review.push(...needsReview);
    return `· ${text}`;
  });
  const b2txt = b2lines.length ? `이번 주 만든 것.\n${b2lines.join("\n")}` : "이번 주는 새로 만든 게 없습니다.";
  const b2 = mk(BLOCK_SPEC[1], b2txt);
  if (b2review.length) { const msg = `블록 ② 번역 필요: ${[...new Set(b2review)].join(", ")}`; b2.warnings.push(`⚠️ ${msg}`); warnings.push(msg); }
  blocks.push(b2);

  // ③ 배운 것·틀린 것 — ★자동으로 쓰지 않는다. 후보만. 고른 게 있으면 뼈대만.
  const candidates = [
    ...(d.block3candidates || []).map((c) => c.text || c),
    ...((opts.extraCandidates || []).map((c) => c.text || c)),
  ];
  let b3txt = "";
  if (Array.isArray(opts.chosen3) && opts.chosen3.length) {
    b3txt = opts.chosen3.map((c) =>
      `${c}.\n  무엇이 있었는지 → 왜 그랬는지 → 그래서 뭘 바꿨는지 (여기 살을 붙이세요)`
    ).join("\n\n");
  } else {
    warnings.push("블록 ③ 은 후보에서 사람이 고릅니다 — 자동 생성하지 않습니다");
  }
  blocks.push(mk(BLOCK_SPEC[2], b3txt, { candidates, autoWritten: false }));

  // ④ 시장
  const b4 = (d.block4 || []).slice(0, 3).map((x) => `· ${x.headline}`);
  blocks.push(mk(BLOCK_SPEC[3], b4.length ? `시장에서 있었던 일.\n${b4.join("\n")}` : ""));

  // ⑤ 다음 주 — 항목 하나만
  const b5 = (d.block5 || [])[0];
  blocks.push(mk(BLOCK_SPEC[4], b5 ? `다음 주에 할 것. ${translateTech(b5.headline).text}.` : ""));

  const totalSec = blocks.reduce((a, x) => a + x.targetSec, 0);
  blocks.forEach((x) => x.warnings.forEach((w) => warnings.push(w)));
  return { blocks, totalSec, warnings: [...new Set(warnings)] };
}

// [S32-7] 발행 부속물 — 제목 3안·챕터·설명란·썸네일.
export const WEEKLY_FIXED_DESC = [
  "혼자 만드는 자산 앱 개발기 — 매주 만든 것과 배운 것을 숫자로 공개합니다.",
  "이 영상의 모든 숫자는 앱 화면에 실제로 있는 값입니다(지어내지 않습니다).",
  "투자 자문이나 특정 종목 권유가 아닙니다.",
].join("\n");

export function buildWeeklyMeta(digest, opts = {}) {
  const d = digest || {};
  const weekLabel = (d.week || "").replace(/^\d{4}-W/, "") + "주차";
  const prefix = `혼자 만드는 자산 앱 · ${weekLabel} | `;

  // 제목 3안 — 서로 다른 블록에서(③ 고른 것 or 후보 / ① 숫자 / ②)
  const t3 = opts.chosen3 && opts.chosen3[0];
  const t3c = (d.block3candidates || [])[0];
  const fromB3 = t3 || (t3c && (t3c.text || t3c)) || "이번 주에 고친 것과 못 고친 것";
  const sign = (d.block1 || []).find((x) => /첫 판단|first_verdict/.test(x.label));
  const signup = (d.block1 || []).find((x) => /가입|signup/.test(x.label));
  const fromB1 = (signup && sign) ? `가입자 ${signup.value}명, 그중 첫 판단은 ${sign.value}명` : "이번 주 숫자로 보는 한 주";
  const fromB2 = (d.block2 || [])[0] ? translateTech((d.block2[0].headline || "")).text : "이번 주에 만든 것";
  const titles = [prefix + String(fromB3).slice(0, 40), prefix + fromB1, prefix + fromB2];

  // 챕터 — 블록별 목표 길이 누적
  let acc = 0;
  const chapters = BLOCK_SPEC.map((s) => {
    const mm = String(Math.floor(acc / 60)).padStart(1, "0");
    const ss = String(acc % 60).padStart(2, "0");
    acc += s.targetSec;
    return `${mm}:${ss} ${s.title}`;
  });

  // 설명란 = 고정 문구 + 요약 3줄 + 링크
  const sum3 = [
    (d.block1 || []).length ? `숫자: ${(d.block1 || []).slice(0, 3).map((x) => `${x.label} ${x.value}`).join(", ")}` : null,
    (d.block2 || []).length ? `만든 것: ${translateTech((d.block2[0].headline || "")).text}` : null,
    (d.block5 || []).length ? `다음 주: ${translateTech((d.block5[0].headline || "")).text}` : null,
  ].filter(Boolean);
  const description = [
    WEEKLY_FIXED_DESC, "",
    ...sum3, "",
    "앱: https://app.one-hub.kr/pwa",
    "실거래 통계(로그인 없이): https://one-hub.kr/estimate",
  ].join("\n");

  const thumbText = `${weekLabel}\n${String(fromB3).replace(/\s+규칙.*$/, "").slice(0, 16)}`;

  return { titles, chapters, description, thumbText };
}
