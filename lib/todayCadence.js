// [S23 T-6] 주간·월간·분기 훅 — 오늘 날짜를 받아 '발동한 훅만' 반환하는 함수.
//   매일 훅(오늘 페이지)만으로는 하루 안 들어오면 이탈한다. 조건을 만족하는 날에만 화면 맨 위에
//   카드 한 장이 추가된다. 아닌 날엔 아무것도 없다(매일 뜨면 배경이 되어 효과 0).
//   ★숫자는 기존 소스에서만: 주간=getVerdictScorecard(S22-5), 월간=onehub_target_class(S22-4),
//     11월=taxCalendar(S22-8). 새 API 없음. 데이터 없으면 훅을 반환하지 않는다(빈 카드 금지).
//   ★소표본 정직성: 채점 30건 미만이면 승률을 단정하지 않고 추이만(samplePolicy).
import { getVerdictScorecard } from "./verdictStats";
import { getTargetClass, computeClassDrift, topDriftMessage } from "./targetClass";
import { taxFocusOf } from "./taxCalendar";
import { samplePolicy } from "./sampleSize";
import { dueForReview } from "./vocabNote"; // [S25-7] 오늘 복습할 표현 훅

// 요일 기반 영업일(주말 제외) — marketHours 와 동일 근사(공휴일 미반영, 백엔드 market_calendar 가 권위).
function isBizDay(d) { const w = d.getDay(); return w >= 1 && w <= 5; }
function isFirstBizDayOfMonth(d) {
  if (!isBizDay(d)) return false;
  for (let day = 1; day < d.getDate(); day++) {
    if (isBizDay(new Date(d.getFullYear(), d.getMonth(), day))) return false;
  }
  return true;
}
function isFirstBizDayOfQuarter(d) {
  const qStartMonth = Math.floor(d.getMonth() / 3) * 3;
  if (d.getMonth() !== qStartMonth) return false;
  return isFirstBizDayOfMonth(d);
}

// opClass = 운용 breakdown { stock, etf, realestate, cash }(억). date 미지정 시 오늘.
export function getTodayCadence({ trader = "A", date, opClass } = {}) {
  const d = date instanceof Date ? date : new Date();
  const hooks = [];

  // 월요일 — [S24-2] 지난 7일 창 내 판단 요약(누적 아님). 주간 0건이면 반환 안 함.
  if (d.getDay() === 1) {
    let sc = null;
    try { sc = getVerdictScorecard(trader, { days: 7 }); } catch (e) {}
    if (sc && sc.total > 0) {
      const pol = samplePolicy(sc.scored);
      const winTxt = pol.declareWinner && sc.winRate != null ? ` · 승률 ${sc.winRate}%` : "";
      const aiTxt = pol.declareWinner && sc.diff != null ? ` · AI 대비 ${sc.diff >= 0 ? "+" : ""}${sc.diff}%p` : "";
      const fmt = (dt) => `${dt.getMonth() + 1}/${dt.getDate()}`;
      const rangeTxt = `${fmt(new Date(d.getTime() - 7 * 86400000))}~${fmt(new Date(d.getTime() - 86400000))}`;
      hooks.push({ key: "weekly", icon: "🗓️", title: `지난주(${rangeTxt}) 내 판단`, text: `판단 ${sc.total}건${winTxt}${aiTxt}`, href: "/pwa?tab=report&sec=vs" });
    }
  }

  // [S24-11] 월요일 — 지난주 부동산(weekly 페이지가 적립한 onehub_re_weekly). 데이터 없으면 반환 안 함.
  if (d.getDay() === 1 && typeof window !== "undefined") {
    try {
      const rw = JSON.parse(localStorage.getItem("onehub_re_weekly") || "null");
      if (rw && (rw.trades != null || rw.leader)) {
        const parts = [];
        if (rw.trades != null) parts.push(rw.trades > 0 ? `내 지역 실거래 ${rw.trades}건` : "지난주 실거래 없음");
        if (rw.leader) parts.push(`대장 ${rw.leader}${rw.leaderPrice ? ` ${rw.leaderPrice}억` : ""}`);
        if (parts.length) hooks.push({ key: "re_weekly", icon: "🏠", title: "지난주 부동산", text: parts.join(" · "), href: "/pwa/weekly" });
      }
    } catch (e) {}
  }

  // 매월 첫 영업일 — 자산군 배분 이탈(목표 미설정이거나 이탈 없으면 반환 안 함)
  if (isFirstBizDayOfMonth(d)) {
    let msg = null;
    try { msg = topDriftMessage(computeClassDrift(opClass, getTargetClass())); } catch (e) {}
    if (msg && msg.tone === "warn" && msg.top) {
      hooks.push({ key: "monthly", icon: "📊", title: "이번 달 배분 점검", text: msg.text, href: "/pwa/etf" });
    }
  }

  // 11월 첫 영업일 — 절세 마감(taxCalendar)
  if (d.getMonth() === 10 && isFirstBizDayOfMonth(d)) {
    const focus = taxFocusOf(11);
    if (focus) hooks.push({ key: "tax", icon: "🧾", title: focus.title, text: focus.desc, href: "/pwa/etf?etf=rec" });
  }

  // 분기 첫 영업일 — 부동산 점검(브리핑 상세는 페이지에서; 여기선 지어낸 숫자 없이 안내만)
  if (isFirstBizDayOfQuarter(d)) {
    hooks.push({ key: "quarterly", icon: "🏠", title: "분기 부동산 점검", text: "내 단지 분기 변화·상급지 갭을 확인하세요", href: "/pwa/realestate" });
  }

  // [S25-7] 오늘 복습할 단어 — 조용한 날에도 복습할 것은 있다(매일). 없으면 반환 안 함.
  if (typeof window !== "undefined") {
    try {
      const due = dueForReview(trader);
      if (due && due.length) hooks.push({ key: "vocab", icon: "⭐", title: "오늘 복습할 표현", text: `${due.length}개 · 기억나는지 확인해 보세요`, href: "/pwa/vocab" });
    } catch (e) {}
  }

  return hooks;
}
