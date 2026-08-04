// [2026-08-05] '나 vs AI' 서버 영속화.
//   근본원인: 시드/닉네임/판단원장이 localStorage에만 있어 카카오톡 인앱브라우저·iOS 사생활모드처럼
//   저장이 막히거나 세션마다 초기화되는 환경에서 "매일 1000만원으로 리셋"됐다(피드백 재접수).
//   서버(app_state 테이블, trader_id 기준)를 진실의 원천으로 승격하되, localStorage는 그대로 두어
//   즉시 동기 읽기용 캐시로 계속 쓴다. gameWallet.js/verdictLedger.js는 변경 시 "onehub-game-change"
//   이벤트를 쏘고, 이 모듈이 그걸 듣고 서버로 밀어올린다(순환 import 방지 목적으로 이벤트로 결합).

import { getSeed, setSeed, getNickname, setNickname } from "./gameWallet";

const LEDGER_KEY = "onehub_ai_vs_me";
const DAY = 86400000;

function readLedgerRaw() {
  try { return JSON.parse(localStorage.getItem(LEDGER_KEY) || "[]"); } catch { return []; }
}
function writeLedgerRaw(list) {
  try { localStorage.setItem(LEDGER_KEY, JSON.stringify(list.slice(-120))); } catch {}
}

// (trader, code, 하루) 단위로 병합 — 같은 키면 snaps가 더 많이 쌓인(더 최신 관측된) 쪽을 채택.
// 어느 한쪽만 갖고 있던 기록은 그대로 살아남는다(union) — 데이터 유실 없음.
function mergeLedgers(a, b) {
  const keyOf = (e) => `${e.trader || "A"}|${e.code}|${Math.floor((e.ts || 0) / DAY)}`;
  const map = new Map();
  [...(a || []), ...(b || [])].forEach((e) => {
    if (!e || !e.code) return;
    const k = keyOf(e);
    const prev = map.get(k);
    if (!prev || (e.snaps?.length || 0) >= (prev.snaps?.length || 0)) map.set(k, e);
  });
  return Array.from(map.values()).sort((x, y) => (x.ts || 0) - (y.ts || 0));
}

const _hydrated = new Set(); // trader별로 세션당 1회만 하이드레이션

export async function hydrateGameFromServer(trader = "A") {
  if (typeof window === "undefined" || _hydrated.has(trader)) return;
  _hydrated.add(trader);
  try {
    const r = await fetch(`/api/pwa/game-state?trader=${trader}`);
    const d = await r.json();
    if (!d || d.ok === false) return;
    let changed = false;
    if (d.seed && Number(d.seed) > 0 && Number(d.seed) !== getSeed()) {
      setSeed(d.seed); // setSeed 자체가 onehub-game-change를 쏘므로 아래서 별도 dispatch 불필요
      changed = true;
    }
    if (d.nickname && d.nickname !== getNickname()) {
      setNickname(d.nickname);
      changed = true;
    }
    if (Array.isArray(d.ledger) && d.ledger.length) {
      const merged = mergeLedgers(readLedgerRaw(), d.ledger);
      writeLedgerRaw(merged);
      changed = true;
    }
    if (changed && typeof window !== "undefined") window.dispatchEvent(new Event("onehub-game-change"));
    // 로컬에도 서버엔 없던 갱신분이 있었을 수 있으니, 병합 결과를 다시 서버로 밀어올려 정합성 유지.
    pushGameToServer(trader);
  } catch {}
}

let _pushTimer = null;
export function pushGameToServer(trader = "A") {
  if (typeof window === "undefined") return;
  clearTimeout(_pushTimer);
  // 짧은 디바운스 — 판단 연타·연속 스냅샷 저장 시 매번 요청 안 나가게.
  _pushTimer = setTimeout(() => {
    const seed = getSeed();
    const nickname = getNickname();
    const ledger = readLedgerRaw();
    if (!seed) return; // 시드조차 없으면(게임 시작 전) 보낼 게 없음
    fetch("/api/pwa/game-state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trader, seed, nickname, ledger }),
    }).catch(() => {});
  }, 500);
}

let _listenerAttached = false;
// 컴포넌트 마운트에서 1회 호출: 하이드레이션 + 이후 모든 변경을 서버로 미러링.
export function initGameSync(trader = "A") {
  if (typeof window === "undefined") return;
  hydrateGameFromServer(trader);
  if (!_listenerAttached) {
    _listenerAttached = true;
    window.addEventListener("onehub-game-change", () => pushGameToServer(trader));
  }
}
