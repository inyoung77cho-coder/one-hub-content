// C-4 1단계 검증 — 레코드 단위 병합이 두 손실(union 소실·삭제 되살아남)을 고치는지 확인.
// 실행: node --import ./scripts/extless-loader.mjs scripts/recordSync.merge.test.mjs
//   (syncManager 가 ./trader·./recordSync 를 확장자 없이 import 하므로 로더 필요.)
import { mergeRecordArray, mergeTombstones, recTime, TOMB_KEY, TOMB_TTL_MS } from "../lib/recordSync.js";
const { mergePayloads } = await import("../lib/syncManager.js");

let P = 0, F = 0;
const chk = (n, c) => { console.log((c ? "PASS " : "FAIL ") + n); c ? P++ : F++; };
const j = (v) => JSON.stringify(v);
const ids = (arr) => arr.map((x) => String(x.id)).sort();

// ── mergeRecordArray ────────────────────────────────────────────────
// [손실1 해소] 두 기기가 같은 키에 서로 다른 레코드 추가 → 둘 다 보존(union)
{
  const local = [{ id: "s1", name: "삼성", updatedAt: 100 }];
  const remote = [{ id: "k1", name: "카카오", updatedAt: 200 }];
  const m = mergeRecordArray(local, remote, {}, true);
  chk("[손실1 해소] 서로 다른 레코드 각각 추가 → union 보존(s1·k1 둘 다)", j(ids(m)) === j(["k1", "s1"]));
}

// [손실2 해소] 삭제된 레코드는 원격에 남아 있어도 되살아나지 않음
{
  const local = [{ id: "s1", name: "삼성", updatedAt: 100 }];                                  // 로컬: k1 삭제함
  const remote = [{ id: "s1", name: "삼성", updatedAt: 100 }, { id: "k1", name: "카카오", updatedAt: 90 }]; // 원격: 아직 k1 있음
  const tombs = { k1: 150 };                                                                    // k1 삭제 시각 150 > k1.updatedAt 90
  const m = mergeRecordArray(local, remote, tombs, true);
  chk("[손실2 해소] tombstone 이 삭제 반영 → k1 복원 안 됨", j(ids(m)) === j(["s1"]));
}

// [edit-after-delete] 삭제 후 더 최근에 수정됐으면 살린다
{
  const remote = [{ id: "k1", name: "카카오", updatedAt: 300 }]; // 삭제(150) 후 다른 기기가 300 에 수정
  const tombs = { k1: 150 };
  const m = mergeRecordArray([], remote, tombs, true);
  chk("[edit-after-delete] 삭제보다 최근 수정은 생존(k1 유지)", j(ids(m)) === j(["k1"]));
}

// [LWW] 같은 id 충돌 → recTime 큰 쪽
{
  const local = [{ id: "s1", name: "옛값", updatedAt: 100 }];
  const remote = [{ id: "s1", name: "새값", updatedAt: 200 }];
  const m = mergeRecordArray(local, remote, {}, false);
  chk("[LWW] 같은 id 는 updatedAt 큰 쪽 채택(새값)", m.length === 1 && m[0].name === "새값");
}

// [순서 안정] 원격 추가·tombstone 없으면 결과가 로컬과 동일(헛된 재기록/푸시 방지)
{
  const local = [{ id: "a", updatedAt: 1 }, { id: "b", updatedAt: 2 }];
  const m = mergeRecordArray(local, [], {}, true);
  chk("[순서 안정] 변화 없으면 로컬 순서·내용 그대로", j(m) === j(local));
}

// [id 없는 이상 레코드 보존]
{
  const local = [{ name: "노아이디" }];
  const m = mergeRecordArray(local, [], {}, true);
  chk("[방어] id 없는 레코드도 잃지 않음", m.length === 1 && m[0].name === "노아이디");
}

// [recTime] updatedAt→ts→0 폴백
chk("[recTime] updatedAt 우선", recTime({ updatedAt: 5, ts: 9 }) === 5);
chk("[recTime] updatedAt 없으면 ts", recTime({ ts: 9 }) === 9);
chk("[recTime] 둘 다 없으면 0", recTime({}) === 0);

// ── mergeTombstones ─────────────────────────────────────────────────
{
  const a = { onehub_stock_holdings: { x: 100 } };
  const b = { onehub_stock_holdings: { x: 200, y: 50 } };
  const m = mergeTombstones(a, b, 1000);
  chk("[tombstone union] 같은 id 는 더 최근 deletedAt(x=200), y 보존", m.onehub_stock_holdings.x === 200 && m.onehub_stock_holdings.y === 50);
}
{
  const now = Date.now();
  const a = { k: { old: now - TOMB_TTL_MS - 1000, fresh: now - 1000 } };
  const m = mergeTombstones(a, {}, now);
  chk("[tombstone TTL] 만료분 청소, 최근분 유지", m.k && m.k.fresh && !m.k.old);
}

// ── mergePayloads 통합(syncManager) ─────────────────────────────────
// 레코드 키는 union, 스칼라 키는 통값 LWW 유지, tombstone 반영
{
  const K = "onehub_stock_holdings";
  const local = { [K]: j([{ id: "s1", name: "삼성", updatedAt: 100 }]), onehub_re_budget: "5" };
  const remote = { [K]: j([{ id: "k1", name: "카카오", updatedAt: 200 }]), onehub_re_budget: "9" };
  const { merged } = mergePayloads(local, remote, /*remoteWins*/ true);
  const arr = JSON.parse(merged[K]);
  chk("[통합] 레코드 키 union(둘 다 보존)", j(ids(arr)) === j(["k1", "s1"]));
  chk("[통합] 스칼라 키는 통값 LWW 유지(원격 채택 9)", merged.onehub_re_budget === "9");
}
// tombstone 이 payload 에 실려 삭제가 다른 기기로 전파
// (deletedAt 은 TTL 청소 대상이라 실제 최근 시각을 써야 한다 — 작은 상수는 만료로 청소됨)
{
  const K = "onehub_etf_holdings";
  const delAt = Date.now();
  const local = { [K]: j([{ id: "a", updatedAt: delAt - 5000 }]), [TOMB_KEY]: j({ [K]: { b: delAt } }) }; // 로컬: b 삭제
  const remote = { [K]: j([{ id: "a", updatedAt: delAt - 5000 }, { id: "b", updatedAt: delAt - 9000 }]) };  // 원격: b 남음
  const { merged } = mergePayloads(local, remote, true);
  const arr = JSON.parse(merged[K]);
  chk("[통합] tombstone 반영 → 삭제된 b 복원 안 됨", j(ids(arr)) === j(["a"]));
  chk("[통합] 병합된 tombstone 로그가 payload 에 실림", JSON.parse(merged[TOMB_KEY])[K].b === delAt);
}
// 무변화 시 changedVsLocal=false(헛된 로컬 재기록/이벤트 방지)
{
  const K = "onehub_etf_other";
  const same = { [K]: j([{ id: "o1", name: "펀드", updatedAt: 10 }]) };
  const { changedVsLocal } = mergePayloads(same, same, true);
  chk("[통합] 로컬==원격이면 changedVsLocal=false(재기록 안 함)", changedVsLocal === false);
}

console.log(`\n${P} passed, ${F} failed`);
process.exit(F ? 1 : 0);
