# S28-XC 결과 — 검증과 사람의 한 칸 (제안 백테스트 · 승인 화면)

> 2026-09-04 · 선행 S28-XB(`0eaca8d`) · ⑤승인·⑥적용만 사람. 서버(백테스트·엔드포인트)+프론트(승인 카드).
> XB에서 실제 제안이 0건이므로 XC는 **닫힌 고리 기계장치**를 만들고, 빈 상태를 정직하게 처리한다.

## S28-5 · 제안 백테스트 (`proposal_backtest.py`, 서버 신규)
- `run_backtest(con, proposal)` → **셋만**: `n_change`(판단건수) · `acc_change`(정확도 %p) · `pnl_change`(누적수익). 지표 안 늘림.
- **한계 문구 필수(항상 반환)**: "차단된 종목은 매수 후 결과 알 수 없음(반사실) → 추정치", "백테스트가 좋다고 미래가 좋은 게 아니다", 표본<50이면 "표본 짧음".
- **누적수익 = None(정직)**: 차단 해제 종목의 매수 결과가 없어 **추정하지 않음**(지어내지 않는다). 화면은 "추정 불가(반사실)"로 표기.
- 정확도 변화는 per-signal 점수 재계산 데이터가 없어 **카테고리 누적 통계로 근사**(추정치임을 한계에 명시).
- **개선이 뚜렷하지 않으면 버린다**: `clear = acc_change >= 3%p`. 애매한 제안은 승인 화면에 안 올라옴(S28-5 #4).
- selftest(`__main__`): 3숫자·수익 None·한계 문구·clear 판정 검증(합성 100건 → acc_change +7.5%p·clear=True).

## S28-6 · 제안 원장과 승인 화면
- **`improve_proposer.py` 배선**: 후보 생성 → 백테스트 → **뚜렷한 개선 아니면 폐기**, 통과분만 `engine_proposals(status=pending, backtest=JSON)`. **거절된 제안은 같은 내용(target+to)으로 다시 안 올림**. **되돌리기(⑦)**: 적용 후 20영업일 성적이 이전보다 뚜렷이 나쁜 applied 제안 → 되돌리기 제안 먼저(`check_reverts`, 우선 실행).
- **엔드포인트(engine_status_api.py, :5001)**:
  - `GET /api/pwa/proposals` → pending/approved + backtest(JSON 파싱).
  - `POST /api/pwa/proposals/decide` {id, decision: approve|reject|later} — 키 검증(401). **approve = 서버 코드 안 바꿈**, 상태만 `approved` + **패치 텍스트 + 배포명령(`C:\onehub\deploy_auto_trade.ps1`) 생성해 반환**. reject = `rejected`. later = 무변경.
- **적용 감지**: `version_watch.sh` 가 버전 변경 감지 시 `approved`→`applied`(+applied_version). 버전 원장(engine_changes)과 applied_version 으로 연결.
- **프론트 `components/EngineProposals.js`**: 승인 카드(제안·근거·예상 3숫자·한계·[승인][거절][나중에]). 승인 시 패치/명령 노출("서버는 아직 그대로"). **대기 없으면 "표본 50건+·백테스트 뚜렷할 때만 올라옵니다"** 정직 문구. `pages/api/pwa/proposals.js` 프록시(GET/POST·PWA_API_KEY). `accuracy.js`(정비소 예비)에 마운트 — XD가 정비소 SegTabs 로 이관 예정.

## 배포/검증 (서버 `/home/ubuntu/one-hub/auto_trade`)
- `proposal_backtest.py`(신규)·`improve_proposer.py`·`engine_status_api.py`·`version_watch.sh` 배포(백업·py_compile·`onehub-api` 재시작 active). 서버 git `7de6e7d`.
- **셀프테스트**: backtest OK, proposer 가드 4종 OK, 실제 실행 `result=None pending=0`.
- **엔드포인트 e2e**(임시 테스트 제안 삽입→검증→삭제): `GET` 이 backtest.clear=True 로 노출 → `POST approve` → **status=approved · patch 생성 · deploy_cmd 반환**(서버 코드 불변) → 상태 approved 확인 → 정리 삭제. 실 데이터 오염 없음.

## 합격선
- [x] 제안마다 세 숫자와 한계 문구가 함께 (수익은 반사실이라 None+문구)
- [x] 개선 폭 미미한 제안은 승인 화면에 안 올라옴(clear 게이트 3%p)
- [x] 승인해도 서버 즉시 안 바뀜(패치+명령만, e2e 확인)
- [x] 적용 후 원장 자동 연결(version_watch approved→applied+version)
- [x] 성적 나빠지면 되돌리기 제안(check_reverts, 우선)
- [x] 거절한 제안 같은 내용으로 다시 안 올라옴(already_rejected)
- [x] verify_s19 FAIL=0 · webpack build 통과
- ⚠️ 현재 실제 대기 제안 0건(표본 미달) — 화면은 "왜 없는지" 정직 표기. 실 제안·실 승인 흐름은 표본이 차거나 실기기(로그인)에서 사용자 확인.

## 커밋
- (repo) `S28 XC: 제안 백테스트+승인화면(EngineProposals·프록시)` · (서버 git) `7de6e7d`
