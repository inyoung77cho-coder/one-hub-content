// [나 vs AI 대결] AI가 추천한 종목에 대한 "내 판단"(매매함/안함)을 기록하고,
//   3일·7일 뒤 실제 수익으로 '내 판단 vs AI 단독매매' 승부를 채점하는 클라이언트 원장(ledger).
//
// 왜 클라이언트인가: "AI 추천 중 내가 무엇을 샀고 무엇을 지나쳤는가"는 앱만 아는 정보다
//   (백엔드는 사용자의 개별 승인/거절 판단을 성과 데이터셋으로 보관하지 않음).
//   → 승인=매매(take) / 거절·스킵=관망(pass)을 로컬에 남기고, 이후 접속 때 현재가를
//     스냅샷으로 축적해 3일/7일 시점 수익을 산출한다. 데이터가 없으면 정직하게 '집계 중'.
//
// 저장 스키마(localStorage onehub_ai_vs_me): [{ code, name, trader, ts, entry, decision, snaps:[{ts,price}] }]

const KEY = "onehub_ai_vs_me";
const DAY = 86400000;

function read() {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; }
}
function write(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list.slice(-120))); } catch {}
}

export function getLedger(trader) {
  const all = read();
  return trader ? all.filter((e) => (e.trader || "A") === trader) : all;
}

// 판단 1건 기록. 같은 종목을 같은 날 다시 누르면 최신 결정으로 갱신(중복 방지).
export function recordDecision({ code, name, entry, decision, trader = "A" }) {
  if (!code) return;
  const list = read();
  const now = Date.now();
  const dayKey = Math.floor(now / DAY);
  const idx = list.findIndex(
    (e) => e.code === code && (e.trader || "A") === trader && Math.floor(e.ts / DAY) === dayKey
  );
  const price = Number(entry) || null;
  if (idx >= 0) {
    list[idx].decision = decision;
    if (price) list[idx].entry = list[idx].entry || price;
  } else {
    list.push({
      code, name: name || code, trader, ts: now,
      entry: price, decision, // 'take' | 'pass'
      snaps: price ? [{ ts: now, price }] : [],
    });
  }
  write(list);
}

// 접속 시 현재가 스냅샷 축적(하루 1회). fetchPrice(code) → number|null.
export async function matureLedger(trader, fetchPrice) {
  const list = read();
  const now = Date.now();
  const mine = list.filter((e) => (e.trader || "A") === trader && e.entry > 0);
  // 마지막 스냅이 20시간 넘게 오래된 항목만 갱신(과도한 호출 방지)
  const stale = mine.filter((e) => {
    const last = (e.snaps || [])[e.snaps.length - 1];
    return !last || now - last.ts > 20 * 3600000;
  });
  await Promise.all(
    stale.map(async (e) => {
      try {
        const price = await fetchPrice(e.code);
        if (price > 0) {
          e.snaps = [...(e.snaps || []), { ts: now, price }].slice(-24);
        }
      } catch {}
    })
  );
  write(list);
  return list.filter((e) => (e.trader || "A") === trader);
}

// 특정 시점(진입 + windowDays) 근처 스냅으로 수익률(%) 산출. 없으면 null.
export function returnAt(entry, windowDays) {
  if (!entry?.entry || !(entry.snaps?.length)) return null;
  const target = entry.ts + windowDays * DAY;
  const tol = (windowDays <= 3 ? 2 : 3.5) * DAY; // 3일은 ±2일, 7일은 ±3.5일 허용
  let best = null, bestDiff = Infinity;
  for (const s of entry.snaps) {
    const diff = Math.abs(s.ts - target);
    // 목표 시점 이후(또는 근처)의 스냅을 우선
    if (s.ts >= target - DAY && diff < bestDiff) { best = s; bestDiff = diff; }
  }
  if (!best || bestDiff > tol) return null;
  return Math.round((best.price / entry.entry - 1) * 1000) / 10;
}

// 창(3 or 7일) 기준 '나 vs AI' 승부 계산.
//   AI 단독 = 추천 전부 매매했다고 가정 → 전체 종목 평균 수익
//   내 판단 = 내가 산(take) 종목만 평균 수익 (안 산 종목은 내 포트폴리오에 없음)
//   pass 정오답: 내려가면 잘 지나침(정답), 오르면 놓침(오답)
export function computeShowdown(list, windowDays) {
  const rows = list
    .map((e) => ({ e, r: returnAt(e, windowDays) }))
    .filter((x) => x.r != null);
  if (!rows.length) return { ready: false, n: 0 };
  const takes = rows.filter((x) => x.e.decision === "take");
  const avg = (arr) => (arr.length ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10 : 0);
  const aiRet = avg(rows.map((x) => x.r));                 // AI: 추천 전부
  const myRet = takes.length ? avg(takes.map((x) => x.r)) : 0; // 나: 산 것만
  const diff = Math.round((myRet - aiRet) * 10) / 10;
  const winner = Math.abs(diff) < 0.3 ? "tie" : diff > 0 ? "me" : "ai";
  const details = rows
    .map((x) => {
      const pass = x.e.decision === "pass";
      const correct = pass ? x.r < 0 : x.r >= 0; // 지나침=하락이면 정답 / 매매=상승이면 정답
      return { code: x.e.code, name: x.e.name, decision: x.e.decision, ret: x.r, correct };
    })
    .sort((a, b) => Math.abs(b.ret) - Math.abs(a.ret));
  return { ready: true, n: rows.length, takeN: takes.length, passN: rows.length - takes.length, myRet, aiRet, diff, winner, details };
}
