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
  "onehub_target_alloc",    // [2026-08-22] ETF 목표 배분(리밸런싱 기준) — 기기 간 미동기화였음
  "onehub_etf_realized",    // [2026-08-22] ETF 실현손익 기록(손익통산 계산용) — 기기 간 미동기화였음
  // [M3-확장] 계정 데이터 추가 서버화 — 모두 단일 키(내부 항목별 trader 필터)라 안전.
  "onehub_ai_vs_me",       // 나 vs AI 판단 기록(verdictLedger)
  "onehub_game_seed",      // 가상 대결 게임 지갑(gameWallet)
  "onehub_rec_scores",     // 추천 종목 점수 기록
  "onehub_rec_seen",       // 추천 열람 기록
];
const META = "onehub_sync_meta";

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
    await fetch(`/api/user/state?trader=${encodeURIComponent(trader)}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ device, updatedAt, payload }),
    });
  } catch {}
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
  try {
    const r = await fetch(`/api/user/state?trader=${encodeURIComponent(trader)}`);
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
  }
  const onChange = () => { if (!applying) schedulePush(trader); };
  window.addEventListener("onehub-assets-change", onChange);
  return () => window.removeEventListener("onehub-assets-change", onChange);
}
