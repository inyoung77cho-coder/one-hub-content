// [기기 동기화] PC↔모바일 자산 입력을 네트워크로 정합. 충돌 시 '모바일 입력값' 우선.
//   설계: 앱 로드 시 원격 상태를 pull → (모바일 우선 규칙에 따라) 로컬 반영, 로컬 변경 시 debounce push.
//   백엔드(/api/pwa/user-state) 미배포/오프라인이면 조용히 로컬만 사용(기존 동작, 회귀 없음).
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
    return standalone || mobileUA ? "mobile" : "pc";
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

let applying = false;   // 원격 반영 중에는 push 억제(에코 루프 방지)
let pushTimer = null;

async function pushLocal(trader) {
  const device = deviceType();
  const updatedAt = Date.now();
  const payload = readPayload();
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

// 원격 pull + 충돌 해소(모바일 우선). 반환: 정리 함수
export async function initSync(traderArg) {
  if (typeof window === "undefined") return () => {};
  const trader = traderArg || getTrader();
  const device = deviceType();
  try {
    const r = await fetch(`/api/user/state?trader=${encodeURIComponent(trader)}`);
    const d = await r.json().catch(() => ({}));
    const validRemote = d && d.ok && d.payload && typeof d.payload === "object" && Number(d.updatedAt) > 0;
    if (validRemote) {
      const localMeta = readMeta();
      const remoteNewer = Number(d.updatedAt) > Number(localMeta.updatedAt || 0);
      // 충돌 시 모바일 우선: 이 기기가 모바일이고 원격이 PC면 원격 미적용(로컬 모바일 유지)
      const mobileWinsBlock = device === "mobile" && d.device === "pc";
      if (remoteNewer && !mobileWinsBlock) {
        applying = true;
        const changed = applyPayload(d.payload);
        writeMeta({ updatedAt: Number(d.updatedAt), device: d.device || "pc" });
        applying = false;
        if (changed) window.dispatchEvent(new Event("onehub-assets-change"));
      } else {
        // 로컬이 최신 또는 모바일 우선 → 원격에 반영
        schedulePush(trader);
      }
    } else {
      // 원격 없음/미배포 → 로컬을 초기 업로드(백엔드 있으면 저장, 없으면 무해)
      schedulePush(trader);
    }
  } catch {
    // 오프라인/백엔드 미배포 — 로컬만(회귀 없음)
  }
  const onChange = () => { if (!applying) schedulePush(trader); };
  window.addEventListener("onehub-assets-change", onChange);
  return () => window.removeEventListener("onehub-assets-change", onChange);
}
