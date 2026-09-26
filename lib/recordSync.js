// [C-4 1단계] 기기 동기화 '레코드 단위' 병합 — 배열형 고위험 키만.
//   배경(docs/API_CONTRACT.md C-4): syncManager 의 통값 LWW 는 두 기기가 같은 키(보유목록)에
//   서로 다른 레코드를 각각 추가하면 한쪽을 통째로 잃고(손실1), 삭제 표식(tombstone)이 없어
//   지운 레코드가 되살아난다(손실2). 여기서는 '값 통짜'가 아니라 레코드 id 단위로 합친다.
//
//   ★설계 원칙(단번 교체 금지·범위 좁게):
//     · 대상은 아래 RECORD_SYNC_KEYS(배열형)뿐. 스칼라/설정 키는 기존 통값 LWW 그대로(syncManager).
//     · tombstone 은 레코드 배열 '밖'의 별도 로그(onehub_sync_tombstones)에 둔다 →
//       화면(읽기 경로)은 하나도 안 바뀐다(배열에는 여전히 살아있는 레코드만 남음).
//     · 마이그레이션 불필요: 기존 레코드에 updatedAt 이 없으면 ts(생성시각), 그것도 없으면 0 으로 본다.
//       값을 쪼개거나 추정하지 않는다.

// 대상 키 → 레코드 식별 필드(전부 'id'). 값이 바뀌면 syncManager 병합 분기도 함께 본다.
export const RECORD_SYNC_KEYS = {
  onehub_stock_holdings: "id",
  onehub_etf_holdings: "id",
  onehub_etf_other: "id",
  onehub_re_properties: "id",
};

// 삭제 로그(기기 간 동기화됨) 구조: { [storeKey]: { [id]: deletedAt(ms) } }
export const TOMB_KEY = "onehub_sync_tombstones";
// 오래된 tombstone 청소 기준(이 기간이 지나면 삭제 사실을 잊는다 — 모든 기기가 이미 반영했다고 본다).
export const TOMB_TTL_MS = 180 * 24 * 60 * 60 * 1000; // 180일

// 레코드의 '최근 갱신 시각'. updatedAt 우선, 없으면 생성시각 ts, 둘 다 없으면 0(가장 오래됨).
export function recTime(rec) {
  const u = Number(rec && rec.updatedAt);
  if (Number.isFinite(u) && u > 0) return u;
  const t = Number(rec && rec.ts);
  return Number.isFinite(t) && t > 0 ? t : 0;
}

function parseArr(s) {
  if (Array.isArray(s)) return s;
  if (typeof s !== "string") return [];
  try { const a = JSON.parse(s); return Array.isArray(a) ? a : []; } catch { return []; }
}
function parseObj(s) {
  if (s && typeof s === "object" && !Array.isArray(s)) return s;
  if (typeof s !== "string") return {};
  try { const o = JSON.parse(s); return o && typeof o === "object" && !Array.isArray(o) ? o : {}; } catch { return {}; }
}

// 두 삭제 로그를 합친다(같은 id 는 더 최근 deletedAt). TTL 지난 항목은 이때 청소한다.
export function mergeTombstones(a, b, now = Date.now()) {
  a = parseObj(a); b = parseObj(b);
  const out = {};
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  keys.forEach((k) => {
    const ma = a[k] && typeof a[k] === "object" ? a[k] : {};
    const mb = b[k] && typeof b[k] === "object" ? b[k] : {};
    const ids = new Set([...Object.keys(ma), ...Object.keys(mb)]);
    const m = {};
    ids.forEach((id) => {
      const t = Math.max(Number(ma[id]) || 0, Number(mb[id]) || 0);
      if (t > 0 && now - t <= TOMB_TTL_MS) m[id] = t; // 만료된 tombstone 은 버린다
    });
    if (Object.keys(m).length) out[k] = m;
  });
  return out;
}

// 레코드 배열 병합: id 기준 union + recTime LWW + tombstone 반영.
//   · 순서 안정: 로컬 순서를 유지하고, 원격에만 있는 id 를 뒤에 붙인다(변화 없을 때 결과==로컬 → 헛된 재기록/푸시 방지).
//   · 같은 id 충돌: recTime 큰 쪽. 동률이면 로컬 유지(원격이 이기게 하려면 remoteWins=true).
//   · tombstone: deletedAt >= 레코드 recTime 이면 삭제 반영(=드롭). 단, 삭제 후 더 최근에 수정됐으면(edit-after-delete) 살린다.
//   · id 없는 레코드(이상치)는 잃지 않도록 그대로 뒤에 보존한다.
export function mergeRecordArray(localArr, remoteArr, tombs, remoteWins) {
  const L = parseArr(localArr), R = parseArr(remoteArr);
  tombs = tombs && typeof tombs === "object" ? tombs : {};
  const byId = new Map();
  const order = [];
  const noId = [];
  const consider = (rec, fromRemote) => {
    if (!rec || typeof rec !== "object") return;
    const id = rec.id != null ? String(rec.id) : null;
    if (id == null) { noId.push(rec); return; }
    if (!byId.has(id)) { byId.set(id, rec); order.push(id); return; }
    const cur = byId.get(id);
    const tc = recTime(cur), tr = recTime(rec);
    if (tr > tc) byId.set(id, rec);
    else if (tr === tc && fromRemote && remoteWins) byId.set(id, rec);
  };
  L.forEach((r) => consider(r, false));
  R.forEach((r) => consider(r, true));
  const out = [];
  order.forEach((id) => {
    const rec = byId.get(id);
    const dt = Number(tombs[id]) || 0;
    if (dt > 0 && dt >= recTime(rec)) return; // 삭제됨(삭제 후 수정 아님) → 드롭
    out.push(rec);
  });
  return out.concat(noId);
}

// [클라 전용] 삭제 시 호출 — 삭제 로그에 {storeKey→{id→now}} 기록. 배열 자체는 호출부가 그대로 하드삭제한다.
//   (읽기 경로 불변: 화면은 살아있는 레코드만 든 배열을 계속 본다. 삭제 사실만 로그로 동기화된다.)
export function markDeleted(storeKey, id, now = Date.now()) {
  if (typeof window === "undefined" || id == null || !storeKey) return;
  try {
    const all = parseObj(localStorage.getItem(TOMB_KEY));
    const m = all[storeKey] && typeof all[storeKey] === "object" ? all[storeKey] : {};
    m[String(id)] = now;
    all[storeKey] = m;
    localStorage.setItem(TOMB_KEY, JSON.stringify(all));
  } catch {}
}
