// C-4 검증 — 기기 동기화 손실 재현. 실행: node scripts/syncMerge.loss.test.mjs
// 실제 mergePayloads(lib/syncManager) 를 호출해 '통값 LWW' 의 두 가지 손실을 재현한다.
//   (syncManager 가 ./trader 를 확장자 없이 import 하므로 --import 로 확장자 해석 로더를 붙인다.)
const { mergePayloads } = await import("../lib/syncManager.js");
let P=0,F=0; const chk=(n,c)=>{console.log((c?"PASS ":"FAIL ")+n); c?P++:F++;};
const K = "onehub_stock_holdings";
const j = (arr) => JSON.stringify(arr);

// [손실1] 두 기기가 같은 키에 '서로 다른 종목'을 각각 추가 → 통값 LWW 로 한쪽 레코드 통째 소실
//   기기A: [삼성] · 기기B: [카카오] · 원격(B) 이 더 최근이라 원격 채택 → 병합 결과에 삼성이 없음
const A = { [K]: j([{ id: "s1", name: "삼성" }]) };
const Bremote = { [K]: j([{ id: "k1", name: "카카오" }]) };
const m1 = mergePayloads(A, Bremote, /*remoteWins*/ true).merged;
const ids1 = JSON.parse(m1[K]).map(x => x.id);
chk("[재현] 두 기기 동시 추가 → 한쪽 레코드 소실(레코드 병합 아님)", ids1.length === 1 && !ids1.includes("s1"));

// [손실2] 삭제 되살아남: 기기A가 카카오를 삭제([삼성])했는데, 원격(B)이 더 최근이면 [삼성,카카오] 로 복원
const Adel = { [K]: j([{ id: "s1", name: "삼성" }]) };                       // A: 카카오 삭제함
const Bold = { [K]: j([{ id: "s1", name: "삼성" }, { id: "k1", name: "카카오" }]) }; // B: 아직 카카오 있음(더 최근 push)
const m2 = mergePayloads(Adel, Bold, true).merged;
const ids2 = JSON.parse(m2[K]).map(x => x.id);
chk("[재현] 삭제가 tombstone 없어 되살아남(k1 복원)", ids2.includes("k1"));

// [정상] 서로 다른 키는 union 으로 보존됨(키 단위 병합은 이 경우엔 정확)
const L = { onehub_re_budget: "5" };
const R = { onehub_target_class: "aggressive" };
const m3 = mergePayloads(L, R, true).merged;
chk("[대조] 서로 다른 키는 union 보존(정상 동작)", m3.onehub_re_budget === "5" && m3.onehub_target_class === "aggressive");

console.log(`\n${P} passed, ${F} failed`); process.exit(F?1:0);
