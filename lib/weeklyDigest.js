// [S32-1] 주차 하나의 다섯 블록 데이터를 한 번에 모은다. ★새 수집기 없음 — 전부 기존 소스.
//   서버측(API 라우트)에서 실행. 데이터 없는 블록은 빈 배열/null 반환하고 오류를 던지지 않는다
//   (만든 게 없는 주가 정상이다). weekBounds 는 KST 기준(서버 UTC 오프셋 명시 처리).
import manifest from "./generated/weeklyManifest.json";

const KST = 9 * 3600 * 1000;
const RE_API = process.env.RE_API_URL || "http://54.180.54.132:5002";
const RE_KEY = process.env.RE_ACCESS_KEY || "";
const ENGINE_API = process.env.ENGINE_API_URL || "http://54.180.54.132:5001";

// 월요일 00:00 ~ 일요일 23:59:59 (KST). 주차 번호 "YYYY-Www"(ISO week) 반환.
export function weekBounds(dateISO) {
  const base = dateISO ? new Date(dateISO) : new Date();
  // KST 로 옮긴 '벽시계' 시각으로 요일 계산
  const k = new Date(base.getTime() + KST);
  const dow = (k.getUTCDay() + 6) % 7; // 월=0 … 일=6
  const kMondayMid = Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate()) - dow * 86400000;
  const startMs = kMondayMid - KST;                 // KST 월요일 00:00 을 UTC ms 로
  const endMs = startMs + 7 * 86400000 - 1;         // 일요일 23:59:59.999
  // ISO week 번호
  const thu = new Date(kMondayMid + 3 * 86400000);  // 그 주 목요일(UTC 자정 기준)
  const year = thu.getUTCFullYear();
  const jan1 = Date.UTC(year, 0, 1);
  const week = Math.floor((thu.getTime() - jan1) / 86400000 / 7) + 1;
  const weekNo = `${year}-W${String(week).padStart(2, "0")}`;
  const fmt = (ms) => new Date(ms + KST).toISOString().slice(0, 10);
  return { weekNo, startMs, endMs, startDate: fmt(startMs), endDate: fmt(endMs) };
}

// weekNo("YYYY-Www") → 그 주 월요일의 대략 날짜(bounds 재계산용)
function boundsForWeekNo(weekNo) {
  if (!weekNo) return weekBounds();
  const m = String(weekNo).match(/^(\d{4})-W(\d{2})$/);
  if (!m) return weekBounds();
  const year = Number(m[1]), week = Number(m[2]);
  // ISO week1 = 1월 4일이 포함된 주
  const jan4 = Date.UTC(year, 0, 4);
  const jan4Dow = (new Date(jan4).getUTCDay() + 6) % 7;
  const week1Mon = jan4 - jan4Dow * 86400000;
  const mon = week1Mon + (week - 1) * 7 * 86400000;
  return weekBounds(new Date(mon + 3 * 86400000).toISOString());
}

async function getJson(url, opts) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(7000), ...(opts || {}) });
    return await r.json();
  } catch (e) { return null; }
}

export async function buildDigest(weekNo) {
  const b = weekNo ? boundsForWeekNo(weekNo) : weekBounds();
  const inWeek = (dateStr) => {
    if (!dateStr) return false;
    const t = Date.parse(`${dateStr}T00:00:00+09:00`);
    return t >= b.startMs && t <= b.endMs;
  };

  // ── 블록 ① 숫자: 가입 깔때기(S30-9)
  let block1 = [];
  const fa = await getJson(`${RE_API}/api/v2/funnel-agg${RE_KEY ? `?key=${encodeURIComponent(RE_KEY)}` : ""}`, { headers: { "X-API-Key": RE_KEY } });
  if (fa && fa.ok && fa.counts) {
    const L = fa.labels || { signup: "가입", onboard_done: "온보딩 완료", first_holding: "보유 입력", first_verdict: "첫 판단", d7_return: "7일 재방문" };
    block1 = (fa.steps || Object.keys(fa.counts)).map((s) => ({ label: L[s] || s, value: fa.counts[s] || 0 }));
    if (fa.public) block1.push({ label: "공개 도구 조회", value: fa.public.tool_view || 0 }, { label: "공개 도구 가입", value: fa.public.tool_signup || 0 });
  }
  // [S34-8] 이번 주 유튜브 경유 수치(주차 기록 S34-5). 데이터 없으면 줄을 빼고 오류 안 던짐. 마스킹 대상 아님(본체).
  const wv = await getJson(`${RE_API}/api/v2/weekly-video?week=${b.weekNo}${RE_KEY ? `&key=${encodeURIComponent(RE_KEY)}` : ""}`, { headers: { "X-API-Key": RE_KEY } });
  if (wv && wv.ok && wv.videos) {
    let views = 0, signups = 0;
    for (const v of Object.values(wv.videos)) { views += v.views || 0; signups += v.signups || 0; }
    if (views > 0) block1.push({ label: "유튜브 조회", value: views }, { label: "유튜브 가입", value: signups });
  }

  // ── 블록 ② 만든 것: 결과 문서(주차 경계 안). "한 것" 전체가 아니라 H1 헤드라인만.
  const block2 = (manifest.made || [])
    .filter((m) => inWeek(m.date))
    .map((m) => ({ sprint: m.sprint, headline: m.headline, date: m.date }));

  // ── 블록 ③ 배운 것·틀린 것: ★후보만(사람이 고른다). 규칙별 성적(accuracy by_reason).
  let block3candidates = [];
  const acc = await getJson(`${ENGINE_API}/api/pwa/accuracy?trader_id=A`);
  if (acc && acc.ok && acc.by_reason) {
    const worst = Object.entries(acc.by_reason)
      .map(([reason, v]) => ({ reason, ...(v || {}) }))
      .filter((r) => (r.total || r.scored || 0) >= 2 && (r.accuracy_pct != null))
      .sort((a, b) => (a.accuracy_pct || 0) - (b.accuracy_pct || 0))
      .slice(0, 3)
      .map((r) => ({
        text: `${r.reason} 규칙이 이번 주 적중률 ${r.accuracy_pct}% (${r.hits ?? r.success_count ?? "?"}/${r.total ?? r.scored ?? "?"})`,
        source: "심판석(by_reason)",
      }));
    block3candidates = worst;
  }
  // 검증(avoided/missed) 후보는 클라이언트 localStorage(심판석)에서 페이지가 덧붙인다(S30-5).

  // ── 블록 ④ 시장: 차단 정확도 요약 + 주간 부동산
  let block4 = [];
  if (acc && acc.ok && acc.summary && acc.summary.total_checked > 0) {
    const s = acc.summary;
    block4.push({ headline: `AI 차단 적중률 ${s.accuracy_pct ?? "-"}% (${s.success_count}/${s.total_checked}건 검증)`, source: "정비소" });
  }
  const rew = await getJson(`${RE_API}/api/re/weekly${RE_KEY ? `?key=${encodeURIComponent(RE_KEY)}` : ""}`, { headers: { "X-API-Key": RE_KEY } });
  if (rew && !rew.error) {
    const trades = rew.total_trades ?? rew.trades ?? (Array.isArray(rew.items) ? rew.items.length : null);
    if (trades != null) block4.push({ headline: `내 지역 주간 실거래 ${trades}건${rew.leader ? ` · 대장 ${rew.leader}` : ""}`, source: "주간 부동산" });
  }

  // ── 블록 ⑤ 다음 주: 미완료 최신 작업지시서의 첫 배치/항목 하나(사람이 확정).
  let block5 = [];
  const doneSprints = new Set((manifest.made || []).map((m) => String(m.sprint || "").split("-")[0]));
  const pendingWo = (manifest.workorders || []).find((w) => {
    // 배치 결과가 하나도 안 나온 작업지시서(대략적 미완료 판정 — 사람이 확인)
    const code = String(w.sprint || "").match(/S\d+/);
    return code ? !doneSprints.has(code[0]) : true;
  }) || (manifest.workorders || [])[0];
  if (pendingWo) {
    block5.push({
      headline: pendingWo.firstItem || (pendingWo.batches[0] && pendingWo.batches[0].title) || pendingWo.title,
      source: `${pendingWo.sprint || ""} 작업지시서`,
      note: "미완료 판정은 사람이 확인",
    });
  }

  return {
    week: b.weekNo,
    range: `${b.startDate} ~ ${b.endDate}`,
    block1, block2, block3candidates, block4, block5,
  };
}
