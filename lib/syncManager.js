// [기기 동기화] PC↔모바일 자산 입력을 네트워크로 정합.
//   설계(v2): 앱 로드 시 원격 상태를 pull → 로컬과 '키 단위 병합'(union) → 반영, 로컬 변경 시 debounce push.
//   백엔드(/api/user/state) 미배포/오프라인이면 조용히 로컬만 사용(기존 동작, 회귀 없음).
//
//   ★v2 변경 이유(버그 수정): 구버전은 "모바일 우선" 규칙이라
//     · 모바일은 PC가 쓴 원격을 절대 받지 않고(mobileWinsBlock) 자기 로컬만 덮어씀 → 두 기기가 영영 다름
//     · 새 기기(빈 로컬)로 로그인하면 빈 payload 를 서버에 push → 기존 데이터 소실
//   v2는 기기 우선순위를 없애고, 키 단위로 합친다:
//     · 양쪽에 있고 값이 다른 키 → 더 최근에 갱신된 쪽(updatedAt) 채택(LWW)
//     · 한쪽에만 있는 키 → 그대로 보존(union) → 서로 다른 기기에서 입력한 항목도 합쳐짐
//     · '빈 로컬'은 절대 원격을 덮어쓰지 않음(소실 방지)
import { getTrader } from "./trader";

// 동기화 대상 localStorage 키(자산 입력 관련만)
const SYNC_KEYS = [
  "onehub_onboard_assets",
  "onehub_etf_holdings",
  "onehub_stock_holdings",
  "onehub_re_my_property",
  "onehub_re_my",
  "onehub_re_scope",
  "onehub_re_budget",
  "onehub_re_jeonse",
  "onehub_pension_contrib",
  "onehub_etf_acct_filter",
  "onehub_etf_last_acct",
  "onehub_asset_history_A", // [S22-3] 총자산 일별 곡선(trader A) — 기기 변경·캐시 삭제에도 곡선 보존(해자)
  "onehub_asset_history_B", // [S22-3] 총자산 일별 곡선(trader B)
  "onehub_visit_days_A",    // [S23 T-10] 방문일·판단 기록일 계기판(trader A) — 주간 리포트가 읽음
  "onehub_visit_days_B",    // [S23 T-10] 방문일·판단 기록일 계기판(trader B)
  "onehub_funnel_A",        // [S30-8] 가입 깔때기 이정표(trader A) — 서버 user_state 로 올라가 운영자가 봄
  "onehub_funnel_B",        // [S30-8] 가입 깔때기 이정표(trader B)
  "onehub_tokens_A",        // [S24-12] 활동 토큰(trader A) — 현금 가치 없음, gameWallet 과 분리
  "onehub_tokens_B",        // [S24-12] 활동 토큰(trader B)
  "onehub_vocab_A",         // [S25-7] 내 단어장(trader A) — 폰에서 담고 PC에서 복습
  "onehub_vocab_B",         // [S25-7] 내 단어장(trader B)
  "onehub_target_class",    // [S22-4] 자산군(주식·ETF·부동산·현금) 목표 배분 — 이탈 판정 기준
  "onehub_target_alloc",    // [2026-08-22] ETF 목표 배분(리밸런싱 기준) — 기기 간 미동기화였음
  "onehub_etf_realized",    // [2026-08-22] ETF 실현손익 기록(손익통산 계산용) — 기기 간 미동기화였음
  "onehub_etf_other",       // [2026-08-23] 기타 금융자산(펀드·디폴트옵션 등 티커 없는 보유)
  "onehub_duel_base",       // [2026-08-23] 포트폴리오 대결 — 시작 시점 기준(KIS 실보유 또는 1500만원)
  "onehub_duel_decisions",  // [2026-08-23] 포트폴리오 대결 — 매수/매도 수용·거부 결정 로그
  "onehub_duel_snapshots",  // [2026-08-23] 포트폴리오 대결 — 일별 마크투마켓 스냅샷(차트용)
  // [M3-확장] 계정 데이터 추가 서버화 — 모두 단일 키(내부 항목별 trader 필터)라 안전.
  "onehub_ai_vs_me",       // 나 vs AI 판단 기록(verdictLedger)
  "onehub_game_seed",      // 가상 대결 게임 지갑(gameWallet)
  "onehub_rec_scores",     // 추천 종목 점수 기록
  "onehub_rec_seen",       // 추천 열람 기록
];
const META = "onehub_sync_meta";

// [S19-1] 동기화 상태 공개 — 화면이 '아직 원격 데이터가 안 왔다'를 알 수 있어야 한다.
//   pending: 최초 pull 진행 중 / ready: 병합 완료 / offline: 백엔드 미도달(로컬만 사용)
//   ★ initSync 의 모든 종료 경로에서 반드시 확정하고 1회 발화한다(try/finally 로 보장).
//     이 확정을 놓치면 원장이 3.5초를 기다렸다가 매번 SYNC_PENDING 으로 떨어진다.
//   문제의 실체(2026-08-30 실측): 로그인 직후 로컬이 비어 있는 상태에서 getLedger 가 먼저 돌아
//     총자산 10.64억(부동산 미입력)로 확정 → 수 초 뒤 39.44억으로 바뀌었다. 새 기기 첫 로그인마다 재현.
export const SYNC_EVENT = "onehub-sync-ready";
let _syncState = "pending";
export function getSyncState() { return _syncState; }
// [S27] push(로컬→서버 저장) 실패를 화면이 알 수 있게 공개. 지금까진 catch{} 로 조용히 죽었다.
//   null=정상 / "offline"=네트워크 실패 / "server"=서버가 저장 거부(HTTP 오류·ok:false).
//   이 값이 있으면 "이 기기에만 저장됨"을 고지해 다른 기기·리포트에 반영 안 됨을 사용자가 인지한다.
export const SYNC_PUSH_EVENT = "onehub-sync-push";
let _pushError = null;
export function getPushError() { return _pushError; }
function setPushError(err) {
  if (_pushError === err) return;
  _pushError = err;
  if (typeof window === "undefined") return;
  try { window.dispatchEvent(new CustomEvent(SYNC_PUSH_EVENT, { detail: { error: err } })); }
  catch { try { window.dispatchEvent(new Event(SYNC_PUSH_EVENT)); } catch {} }
}
// 로컬에 이미 자산 데이터가 있으면(재방문) 원격을 기다릴 이유가 없다 — 첫 화면 체감 속도 회귀 방지.
export function hasLocalAssets() {
  if (typeof window === "undefined") return false;
  return SYNC_KEYS.some((k) => { try { return localStorage.getItem(k) != null; } catch { return false; } });
}
function settleSync(state) {
  _syncState = state;
  if (typeof window === "undefined") return;
  try { window.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail: { state } })); }
  catch { try { window.dispatchEvent(new Event(SYNC_EVENT)); } catch {} }
}

function deviceType() {
  if (typeof window === "undefined") return "pc";
  try {
    const standalone = (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || window.navigator.standalone;
    const mobileUA = /Android|iPhone|iPad|iPod|Mobile/i.test(window.navigator.userAgent || "");
    // standalone(설치형)은 PC에서도 참일 수 있으므로 UA 로 최종 판정(라벨 용도).
    return mobileUA ? "mobile" : (standalone ? "app" : "pc");
  } catch { return "pc"; }
}

function readPayload() {
  const p = {};
  SYNC_KEYS.forEach((k) => { try { const v = localStorage.getItem(k); if (v != null) p[k] = v; } catch {} });
  return p;
}
function applyPayload(p) {
  let changed = false;
  Object.keys(p || {}).forEach((k) => {
    if (!SYNC_KEYS.includes(k)) return;
    try { const cur = localStorage.getItem(k); if (typeof p[k] === "string" && cur !== p[k]) { localStorage.setItem(k, p[k]); changed = true; } } catch {}
  });
  return changed;
}
function readMeta() { try { return JSON.parse(localStorage.getItem(META) || "null") || {}; } catch { return {}; } }
function writeMeta(m) { try { localStorage.setItem(META, JSON.stringify(m)); } catch {} }

function isEmptyPayload(p) { return !p || Object.keys(p).length === 0; }

// 키 단위 병합. 반환: { merged, changedVsLocal, changedVsRemote }
//   remoteWinsConflicts=true 면 값이 충돌하는 키에서 원격 채택, 아니면 로컬 채택.
function mergePayloads(local, remote, remoteWinsConflicts) {
  const merged = {};
  const keys = new Set([...Object.keys(local || {}), ...Object.keys(remote || {})]);
  let changedVsLocal = false;   // 병합 결과가 로컬과 다른가(로컬 반영 필요)
  let changedVsRemote = false;  // 병합 결과가 원격과 다른가(서버 push 필요)
  keys.forEach((k) => {
    const inL = Object.prototype.hasOwnProperty.call(local || {}, k);
    const inR = Object.prototype.hasOwnProperty.call(remote || {}, k);
    let val;
    if (inL && inR) {
      val = local[k] === remote[k] ? local[k] : (remoteWinsConflicts ? remote[k] : local[k]);
    } else if (inR) {
      val = remote[k];            // 서버에만 있는 키 → 채택(다른 기기 입력분)
    } else {
      val = local[k];             // 로컬에만 있는 키 → 보존
    }
    merged[k] = val;
    if (!inL || local[k] !== val) changedVsLocal = true;
    if (!inR || remote[k] !== val) changedVsRemote = true;
  });
  return { merged, changedVsLocal, changedVsRemote };
}

let applying = false;   // 원격 반영 중에는 push 억제(에코 루프 방지)
let pushTimer = null;

async function pushLocal(trader) {
  const device = deviceType();
  const payload = readPayload();
  if (isEmptyPayload(payload)) return;   // ★빈 로컬로 서버를 덮어쓰지 않음(소실 방지)
  const updatedAt = Date.now();
  writeMeta({ updatedAt, device });
  try {
    const r = await fetch(`/api/user/state?trader=${encodeURIComponent(trader)}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ device, updatedAt, payload }),
    });
    // [S27] HTTP 오류(fetch 는 4xx/5xx 에 reject 안 함) + 프록시가 {ok:false} 준 경우까지 실패로 잡는다.
    let ok = r.ok;
    if (ok) { try { const d = await r.json(); if (d && d.ok === false) ok = false; } catch {} }
    setPushError(ok ? null : "server");
  } catch {
    setPushError("offline");
  }
}
function schedulePush(trader) {
  if (typeof window === "undefined") return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => pushLocal(trader), 1500);
}

// 원격 pull + 키 단위 병합. 반환: 정리 함수
export async function initSync(traderArg) {
  if (typeof window === "undefined") return () => {};
  const trader = traderArg || getTrader();
  const device = deviceType();
  let settled = "ready";           // [S19-1] catch 로 빠지면 offline 으로 내린다
  try {
    // [S19-1] 응답이 영영 안 오면 화면이 계속 기다린다 — 6초에서 끊고 로컬로 진행한다.
    let _sig;
    try { _sig = AbortSignal.timeout(6000); } catch { _sig = undefined; }
    const r = await fetch(`/api/user/state?trader=${encodeURIComponent(trader)}`, { signal: _sig });
    const d = await r.json().catch(() => ({}));
    const remotePayload = d && d.ok && d.payload && typeof d.payload === "object" ? d.payload : null;
    const remoteUpdatedAt = Number(d && d.updatedAt) || 0;
    const localPayload = readPayload();
    const localMeta = readMeta();
    const localUpdatedAt = Number(localMeta.updatedAt) || 0;

    const remoteHasData = remotePayload && (remoteUpdatedAt > 0 || !isEmptyPayload(remotePayload));

    if (remoteHasData) {
      // 충돌 키는 더 최근에 갱신된 쪽 채택(기기 우선순위 없음 = LWW). 동률이면 로컬 유지.
      const remoteWinsConflicts = remoteUpdatedAt > localUpdatedAt;
      const { merged, changedVsLocal, changedVsRemote } = mergePayloads(localPayload, remotePayload, remoteWinsConflicts);

      if (changedVsLocal) {
        applying = true;
        const changed = applyPayload(merged);
        applying = false;
        // 병합 결과가 원격 시각 이상으로 최신임을 반영(원격을 그대로 받은 경우 원격 시각 유지).
        writeMeta({ updatedAt: Math.max(localUpdatedAt, remoteUpdatedAt) || Date.now(), device });
        if (changed) window.dispatchEvent(new Event("onehub-assets-change"));
      } else {
        writeMeta({ updatedAt: Math.max(localUpdatedAt, remoteUpdatedAt) || localUpdatedAt, device });
      }

      // 로컬에만 있던/로컬이 이긴 키가 있으면 서버에 병합분 반영(다른 기기가 받도록).
      if (changedVsRemote && !isEmptyPayload(merged)) schedulePush(trader);
    } else {
      // 원격 없음/비어있음 → 로컬이 비어있지 않을 때만 초기 업로드(빈 로컬 업로드 금지).
      if (!isEmptyPayload(localPayload)) schedulePush(trader);
    }
  } catch {
    // 오프라인/백엔드 미배포 — 로컬만(회귀 없음)
    settled = "offline";
  } finally {
    // [S19-1] 성공·원격없음·예외 어느 경로로 끝나든 여기서 반드시 확정·발화한다.
    settleSync(settled);
  }
  const onChange = () => { if (!applying) schedulePush(trader); };
  window.addEventListener("onehub-assets-change", onChange);
  return () => window.removeEventListener("onehub-assets-change", onChange);
}
