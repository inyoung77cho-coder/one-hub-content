// C-4 회귀 검증 — 예전 '통값 LWW' 가 내던 두 손실이 레코드 병합으로 해소됐는지 확인.
//   (원래 이 파일은 손실을 '재현'했었다. C-4 1단계 적용 후엔 손실이 사라졌음을 '검증'한다.)
// 실행: node --import ./scripts/extless-loader.mjs scripts/syncMerge.loss.test.mjs
const { mergePayloads } = await import("../lib/syncManager.js");
import { TOMB_KEY } from "../lib/recordSync.js";
let P=0,F=0; const chk=(n,c)=>{console.log((c?"PASS ":"FAIL ")+n); c?P++:F++;};
const K = "onehub_stock_holdings";
const j = (arr) => JSON.stringify(arr);

// [손실1 해소] 두 기기가 같은 키에 '서로 다른 종목'을 각각 추가 → 이제 레코드 union 으로 둘 다 보존
const A = { [K]: j([{ id: "s1", name: "삼성", updatedAt: 100 }]) };
const Bremote = { [K]: j([{ id: "k1", name: "카카오", updatedAt: 200 }]) };
const m1 = mergePayloads(A, Bremote, /*remoteWins*/ true).merged;
const ids1 = JSON.parse(m1[K]).map(x => x.id);
chk("[해소] 두 기기 동시 추가 → 둘 다 보존(s1·k1)", ids1.length === 2 && ids1.includes("s1") && ids1.includes("k1"));

// [손실2 해소] 삭제된 종목은 tombstone 로그로 반영 → 원격이 더 최근이어도 되살아나지 않음
const delAt = Date.now();
const Adel = { [K]: j([{ id: "s1", name: "삼성", updatedAt: delAt - 5000 }]),
               [TOMB_KEY]: j({ [K]: { k1: delAt } }) };                       // A: 카카오 삭제(tombstone)
const Bold = { [K]: j([{ id: "s1", name: "삼성", updatedAt: delAt - 5000 },
                       { id: "k1", name: "카카오", updatedAt: delAt - 9000 }]) }; // B: 아직 카카오 있음
const m2 = mergePayloads(Adel, Bold, true).merged;
const ids2 = JSON.parse(m2[K]).map(x => x.id);
chk("[해소] 삭제가 tombstone 으로 반영되어 되살아나지 않음(k1 없음)", !ids2.includes("k1") && ids2.includes("s1"));

// [대조] 서로 다른 키는 union 으로 보존됨(기존 정상 동작 회귀 없음)
const L = { onehub_re_budget: "5" };
const R = { onehub_target_class: "aggressive" };
const m3 = mergePayloads(L, R, true).merged;
chk("[대조] 서로 다른 키는 union 보존(정상 동작)", m3.onehub_re_budget === "5" && m3.onehub_target_class === "aggressive");

console.log(`\n${P} passed, ${F} failed`); process.exit(F?1:0);
