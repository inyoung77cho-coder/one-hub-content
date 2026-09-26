# S37 후속 C-2 · C-4 — Astra 독립 검수용 자료

작성 2026-09-26. 대상 = 종합자산 PWA(one-hub-content). 이 문서는 외부 검수 도구/검수자가
코드·테스트를 독립적으로 재확인할 수 있도록 사실과 명령만 정리한다.

---

## 1. 기준 SHA / 최종 SHA / 미커밋 변경

| 항목 | 값 |
|---|---|
| 기준 SHA(직전 검수본 = 패키지 C 최종) | `5147fa8` |
| 최종 SHA | `6d20dbd` |
| 미커밋 변경 | **없음**(working tree clean) |

세션 커밋(기준 이후, 3건):
```
6d20dbd docs(C-2): 자산 곡선 영향 정정 — 곡선은 항상 ledger.total_uk 로 적립돼 무영향
ad8cf7f feat(C-4): 기기 동기화 레코드 단위 병합 1단계(union·tombstone)
81580b0 fix(C-2): 홈·AI 총자산 KIS 예수금 이중계상 제거(ledger 단일 소스 통일)
```
확인 명령: `git log --oneline 5147fa8..HEAD` · `git status --short`(빈 출력).

---

## 2. 사용자에게 달라진 동작 + 변경 파일

### C-2 — 홈·AI 총자산 표시 정정(이중계상 제거)
- **달라진 동작**: KIS 예수금이 있는 사용자는 **홈·AI의 총자산 '표시값'이 예수금만큼 줄어든다**.
  이전에는 홈·AI가 `ledger.total_uk` 에 `dash.balance.cash`(KIS 예수금)를 **한 번 더** 더해
  이중계상했고, 자산·오늘 화면은 `ledger.total_uk` 만 써서 **화면마다 총자산이 달랐다**. 수정 후
  네 화면(홈·AI·자산·오늘)이 모두 `ledger.total_uk` 단일 소스로 일치한다. 예수금 0·미연동 사용자는 무변화.
- **변경 파일**(커밋 `81580b0`): `pages/pwa/index.js`, `pages/pwa/ai-advisor.js`, `docs/API_CONTRACT.md`.
  문서 정정 1건(커밋 `6d20dbd`, `docs/API_CONTRACT.md`).

### C-4 — 기기 동기화 레코드 단위 병합(1단계)
- **달라진 동작**: 두 기기(PC·폰)에서 보유 목록을 편집할 때
  - 서로 다른 종목을 각각 추가 → 예전엔 한쪽이 통째로 사라졌으나 **이제 둘 다 보존**.
  - 한 기기에서 삭제 → 예전엔 다른 기기 값이 이기면 되살아났으나 **이제 삭제가 유지**(tombstone).
  대상 = 배열형 4키: `onehub_stock_holdings`·`onehub_etf_holdings`·`onehub_etf_other`·`onehub_re_properties`.
  화면 렌더·읽기 경로는 **변경 없음**(삭제 표식은 배열 밖 별도 로그에 둠).
- **변경 파일**(커밋 `ad8cf7f`): 신규 `lib/recordSync.js`; 수정 `lib/syncManager.js`,
  `lib/stockHoldings.js`, `lib/etfHoldings.js`, `pages/pwa/realestate.js`, `docs/API_CONTRACT.md`;
  테스트 신규 `scripts/recordSync.merge.test.mjs`, 재작성 `scripts/syncMerge.loss.test.mjs`.

---

## 3. 재현 사례별 변경 전·후 + 실행 명령 + 실제 통과/실패

### C-2 (근거 = 서버 읽기전용 확인, 자동 재현 테스트는 없음)
- **서버 확인**(auto_trade `main.py`): `total_asset = int(out2.get("tot_evlu_amt", 0))`
  (주석 `tot_evlu_amt = prvs_rcdl_excc_amt + scts_evlu_amt`), `balance.cash = dnca_tot_amt`.
  → KIS 예수금(dnca)은 `tot_evlu_amt` 에 **이미 포함**. 프록시 `/api/realestate/v2/total-asset` 가
  `stock_uk = total_asset/1e8` 로 매핑하므로 `ledger.total_uk` 는 예수금을 이미 1회 포함.
- **변경 전**: 홈 `totalUk = ledger.total_uk + balance.cash`(이중) / AI `cash = cash_uk + balance.cash`(이중).
- **변경 후**: 홈 `totalUk = ledger.total_uk` / AI `cash = cash_uk`. 자산·오늘과 일치.
- **자산 곡선 영향(중요)**: `recordSnapshot(tr, ledger)` 가 항상 `ledger.total_uk` 로 적립해 왔음을
  코드로 확인(`pages/pwa/index.js:557` `recordAssetSnapshot(trader, a)` 는 원장 `a` 를 그대로 전달;
  `ai-advisor.js:69`·`assets.js:102` 동일). **곡선 값은 처음부터 옳았고, 이번 수정으로 홈/AI 표시값이
  곡선·자산·오늘과 일치하게 될 뿐 하향 계단 없음.** (이전 서술을 `6d20dbd` 에서 정정.)

### C-4 (자동 재현 테스트 있음)
실행 명령·실제 결과:
```
node --import ./scripts/extless-loader.mjs scripts/recordSync.merge.test.mjs   → 16 passed, 0 failed
node --import ./scripts/extless-loader.mjs scripts/syncMerge.loss.test.mjs     →  3 passed, 0 failed
```
`syncMerge.loss.test.mjs` 는 **예전에 두 손실을 '재현'하던 테스트**였고, 이번에 '손실이 사라졌음을
검증'하도록 재작성했다(같은 파일에서 전/후가 뒤집힌 것이 증거). 구체 케이스:

| 케이스 | 변경 전(통값 LWW) | 변경 후(레코드 병합) | 검증 |
|---|---|---|---|
| 두 기기가 같은 키에 서로 다른 종목 추가 | 한쪽 소실 | **둘 다 보존(union)** | recordSync.merge: "손실1 해소" PASS |
| 삭제 후 원격이 더 최근 | 되살아남 | **삭제 유지(tombstone)** | recordSync.merge: "손실2 해소" PASS |
| 삭제보다 최근에 수정(edit-after-delete) | — | **레코드 생존** | PASS |
| 같은 id 충돌 | 통값 우선 | **recTime(updatedAt→ts→0) 큰 쪽** | PASS |
| 변화 없음 | — | **결과==로컬(재기록·헛푸시 없음)** | PASS |
| 서로 다른 스칼라 키 | union | **통값 LWW 유지(회귀 없음)** | PASS |
| tombstone TTL(180일) | — | **만료분 청소** | PASS |

회귀 전체 확인(4개 스위트):
```
aiAdvisor.dataquality  11 passed, 0 failed
etfLive.state           6 passed, 0 failed
recordSync.merge       16 passed, 0 failed
syncMerge.loss          3 passed, 0 failed
```
빌드: `npm run build`(webpack) → `✓ Compiled successfully`(190 페이지 정적 생성).

---

## 4. 미실행 검증과 이유

| 항목 | 상태 | 이유 |
|---|---|---|
| 홈/AI 총자산 표시(예수금 보유 계정) 실화면 대조 | 미실행 | `/pwa` 는 카카오 로그인 게이트 뒤 → Claude가 실화면 직접 못 봄. 사용자 폰 확인 몫. |
| C-4 실기기 2대 동시 편집·삭제 전파 | 미실행 | 배포 PWA × 2계정 × Service Worker 필요, 이 환경에서 재현 불가. 로직은 순수함수 테스트로 확정. |
| ETF 페이지 폰 육안(보유/추천·파이·추천·기타자산) | **사용자 실행 완료** | 렌더·탭·URL 딥링크(`?etf=rec`) 정상 확인. 미확인 잔여 = 기타자산 CRUD·총자산 반영 실동작. |
| 서버 코드(auto_trade `main.py` 등) | 읽기전용 확인만 | 이번 변경은 전부 프런트(one-hub-content). 서버 파일 수정·배포 없음. |

프런트 커밋은 GitHub push 완료 → Vercel 자동 배포. 서버(:5001~:5005) 재시작·배포 없음.

---

## 5. API·저장 데이터 호환성 + 롤백

### C-2
- **API 변경 없음. 저장 데이터 변경 없음.** 순수 표시 계산만 수정.
- **롤백**: `git revert 81580b0 6d20dbd`. 자산 곡선(assetHistory) 데이터 불변이라 롤백 후에도 일관.

### C-4
- **새 localStorage 키**: `onehub_sync_tombstones`(삭제 로그, `SYNC_KEYS` 포함 → 서버 `/api/user/state`
  payload 에 문자열 값으로 실려 동기화). 서버는 payload 를 불투명 저장이므로 **서버 스키마 변경 없음**.
- **레코드 필드 추가**: 4키 레코드에 `updatedAt`(생성·수정 시 스탬프). **가산적·하위호환**:
  - 구버전 앱이 이 배열을 읽어도 `updatedAt` 을 무시(무해).
  - 구버전 앱이 수정 후 다시 쓰면 그 레코드의 `updatedAt` 이 빠질 수 있으나, 병합이 `ts`(생성시각)→0
    으로 폴백하므로 **크래시·손상 없음**(해당 레코드만 LWW 정밀도 저하).
  - 구버전은 `onehub_sync_tombstones` 키를 모르지만 `SYNC_KEYS` 화이트리스트로만 적용하므로 무시(무해).
- **마이그레이션 없음**: 기존 레코드 값 그대로. 분할·추정 없음.
- **롤백**: `git revert ad8cf7f`. 롤백 후 —
  - `onehub_sync_tombstones` 키는 고아가 되나 구 코드가 무시(무해, 원하면 수동 삭제 가능).
  - 레코드의 `updatedAt` 필드는 남지만 구 병합이 무시(무해).
  - 병합이 통값 LWW 로 되돌아가 **두 손실이 재발**(데이터 손상은 아님, 병합 정책만 후퇴).
  - **롤백으로 인한 데이터 유실은 없음.**

---

## 6. 새 증거로 우선순위가 바뀐 후속 과제

1. **C-2 자산 곡선 마이그레이션 — 불필요로 확정(우선순위 소멸)**. 당초 "예수금 이중계상이 곡선에도
   적립돼 하향 계단이 생길 수 있다"고 우려했으나, `recordSnapshot` 이 항상 `ledger.total_uk` 로
   적립해 온 것을 코드로 확인 → 곡선은 원래 옳았음. 별도 보정 작업 없음.
2. **C-4 2단계 승격**. 1단계(레코드 병합·tombstone) 완료로, 남은 것은 (a) 실기기 2대 동시편집·
   오프라인 재진입 실측(배포 PWA 필요), (b) `onehub_re_properties` id 가 `Date.now()`(number)라
   동시각 충돌 가능성 → 필요 시 UUID 승격, (c) tombstone 로그 크기 모니터. 구현이 아니라 **검증·관측**이 남음.
3. **C-3 잔여 경합 — 우선순위 불변**. A→B 전환 초경합·오프라인 재진입은 여전히 2계정×배포 PWA×SW
   필요라 미재현. 현 완화(`clearApiCaches().finally(reload)`)는 캐시 삭제 후 리로드까지 대기. 재현 없이
   추가 abort 기계장치를 넣지 않음(검증 불가 변경 지양).
4. **화면 간 자산 정합성 전수 감사 — 신규 후보(착수 전)**. C-2(현금축)만 고쳤으므로, 나머지 버킷
   (주식·ETF·부동산·운용/실거주)이 홈·자산·오늘·AI에서 동일 계산인지 전수 대조가 후속으로 유효.
   (이번 세션에 소비 지점 매핑까지만 조사, 코드 변경 없음.)

---

### 참고 — 핵심 코드 위치
- C-2: `pages/pwa/index.js`(히어로·자산 구성 2블록), `pages/pwa/ai-advisor.js:41`(`buildAssets`).
- C-4: `lib/recordSync.js`(`mergeRecordArray`·`mergeTombstones`·`markDeleted`),
  `lib/syncManager.js`(`mergePayloads`·`SYNC_KEYS`), mutator 스탬프/tombstone =
  `lib/stockHoldings.js`·`lib/etfHoldings.js`·`pages/pwa/realestate.js`.
- 계약 문서: `docs/API_CONTRACT.md`(C-1~C-5 절).
