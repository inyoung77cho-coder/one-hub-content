// C-1 검증 — ETF 평가 상태 계약(partial vs fully_evaluated). 실행: node scripts/etfLive.state.test.mjs
//   fetchLiveEtfKrw 는 네트워크·다수 import 라 반환 결정부 로직을 그대로 복제해 계약을 검증한다
//   (동일 결정: lib/etfLive.js 의 fully_evaluated/source/partial 3분기).
const decide = (missing, excluded, suspect, any, summaryVal) => {
  const fully_evaluated = missing.length === 0 && excluded.length === 0 && suspect.length === 0;
  if (any) return { live: true, source: "live", partial: missing.length > 0, fully_evaluated };
  if (summaryVal != null) return { live: false, source: "backend_summary", partial: false, fully_evaluated: false };
  return { live: false, source: "none", partial: false, fully_evaluated: false };
};
let P = 0, F = 0; const c = (n, x) => { console.log((x ? "PASS " : "FAIL ") + n); x ? P++ : F++; };
c("전부 신뢰합산 → fully_evaluated=true", decide([], [], [], true, null).fully_evaluated === true);
c("일부 시세누락 → partial=true·fully_evaluated=false", (() => { const r = decide([{}], [], [], true, null); return r.partial === true && r.fully_evaluated === false; })());
c("★excluded 있고 missing 없음 → partial=false 지만 fully_evaluated=false", (() => { const r = decide([], [{}], [], true, null); return r.partial === false && r.fully_evaluated === false; })());
c("suspect 있음 → fully_evaluated=false", decide([], [], [{}], true, null).fully_evaluated === false);
c("백엔드 폴백 → source=backend_summary·fully_evaluated=false", (() => { const r = decide([{}], [], [], false, 123); return r.source === "backend_summary" && r.fully_evaluated === false; })());
c("전부 실패·폴백없음 → source=none", decide([{}], [], [], false, null).source === "none");
console.log(`\n${P} passed, ${F} failed`); process.exit(F ? 1 : 0);
