#!/bin/bash
# [S19] 2026-08-30 지적사항 일괄 검증 — 합격선은 각 항목 옆 주석 참고.
#   기존 scripts/verify_n*.sh 형식(chk 함수 · FAIL 카운터)을 그대로 따른다.
#   실행: bash scripts/verify_s19.sh   → 마지막 줄 FAIL=0 이어야 완료.
cd "$(dirname "$0")/.." || exit 2
F=0
chk(){ if [ "$2" -eq 0 ]; then echo "  OK   $1"; else echo "  FAIL $1"; F=$((F+1)); fi; }

echo "── S19-1 자산 단일 소스 (동기화 이전 값 렌더 차단) ──"
grep -q "getSyncState" lib/syncManager.js;                    chk "동기화 상태 공개 함수" $?
grep -q "hasLocalAssets" lib/syncManager.js;                  chk "재방문 즉시렌더 판정(로컬 데이터 유무)" $?
N=$(grep -c "SYNC_EVENT" lib/syncManager.js); [ "$N" -ge 3 ]; chk "sync-ready 상수 정의+발화 3곳 이상 (실측 $N)" $?
grep -q "SYNC_EVENT" lib/ledger.js;                            chk "원장이 sync-ready 를 구독" $?
grep -q "finally {" lib/syncManager.js;                       chk "initSync 종료 경로 finally 보장" $?
grep -q "AbortSignal.timeout(6000)" lib/syncManager.js;       chk "pull 무한대기 차단(6s)" $?
grep -q "SYNC_PENDING" lib/ledger.js;                         chk "원장이 동기화 대기 경고 생성" $?
grep -q "sync_state" lib/ledger.js;                           chk "원장 반환에 sync_state" $?
grep -q "awaitSync" lib/ledger.js;                            chk "awaitSync 옵션" $?
grep -q "SYNC_PENDING" pages/pwa/assets.js;                   chk "자산 지도: 총자산 옆 동기화 고지" $?
grep -q "SYNC_PENDING" components/AssetSummaryBar.js;         chk "요약 바: 동기화 고지" $?
grep -q "curReady" components/shared/QuickAddSheet.js;        chk "빠른입력 '현재 등록' 조기 단정 방지" $?
grep -q "운용 제외" pages/pwa/assets.js;                       chk "부동산 '미입력' 오표기 정정(실거주 제외)" $?
# N1 회귀 방지 — 총자산을 더하는 곳은 원장 안 1줄뿐이어야 한다.
# (invProps 보증금 합산은 자산 총액이 아니라 부동산 순액 계산이라 대상이 아니다.)
R=$(grep -c "parts.reduce" lib/ledger.js); [ "$R" -eq 1 ]; chk "총액 합산 1곳 (실측 $R)" $?
NEW=$(grep -rhoE "onehub_(ledger|assets_cache|total)[a-z_]*" pages/ components/ lib/ --include=*.js | sort -u | wc -l)
[ "$NEW" -eq 0 ];                                             chk "새 자산 localStorage 키 0 (실측 $NEW)" $?

echo "── S19-2 판단 채점 복구 ──"
grep -q "pending_entry" lib/verdictLedger.js;                 chk "진입가 미확정 플래그" $?
grep -q "entry_backfilled" lib/verdictLedger.js;              chk "백필 구분 플래그" $?
awk '/if \(idx >= 0\)/,/^  } else \{/' lib/verdictLedger.js | grep -q "snaps = \[{ ts: now, price }\]"; chk "entry 백필 시 snaps 시드" $?
awk '/export async function matureLedger/,/^}/' lib/verdictLedger.js | grep -q "needEntry"; chk "matureLedger 진입가 백필 루틴" $?
! grep -q "slice(-120)" lib/verdictLedger.js;                 chk "원장 상한 120 → 상향(조용한 손실 방지)" $?
# [S23 T-1] entry 없이 먼저 기록하던 경로 제거 — 이제 공용 함수 recordDecisionWithPrice 로 추출.
#   logDecision 은 그 공용 함수를 1회 호출하고(today.js 와 공유), 공용 함수는 시세 확정 뒤 recordDecision 을 1회만 부른다.
C=$(awk '/const logDecision = useCallback/,/}, \[trader, codeNameMap\]\);/' pages/pwa/index.js | grep -c "recordDecisionWithPrice(")
[ "$C" -eq 1 ];                                               chk "logDecision 내 recordDecisionWithPrice 1회 (실측 $C)" $?
D=$(grep -c "recordDecision(" lib/recordDecision.js)
[ "$D" -eq 1 ];                                               chk "recordDecisionWithPrice 내 recordDecision 1회 (실측 $D)" $?
grep -q "no_price" lib/portfolioDuel.js;                      chk "채점 불가 사유 구분(기간경과 vs 대기)" $?
grep -q "기록 없음" components/PortfolioDuelCard.js;           chk "채점 불가 사유 화면 표기" $?
grep -q "pd-record" components/PortfolioDuelCard.js;          chk "누적 성적표(승률·평균·관망비율)" $?

echo "── S19-3 이야기 백엔드 ──"
! grep -q "setComments(d.comments || \[\])" components/Comments.js; chk "에러의 빈배열 흡수 제거" $?
grep -q "loadError" components/Comments.js;                   chk "불러오기 실패 상태 존재" $?
grep -q "comments-error" components/Comments.js;              chk "실패 문구·다시 시도 렌더" $?
grep -q "upstream_auth" pages/api/comments.js;                chk "업스트림 인증 실패 상태 구분(503)" $?
! grep -rq "GITHUB_TOKEN" components/ --include=*.js;         chk "클라이언트에 토큰 노출 0" $?

echo "── S19-4 AI 신호 정합성 ──"
awk '/function deriveRecMeta/,/^}/' pages/pwa/index.js | grep -q "ml_signal"; chk "_valid 분기가 ml_signal 참조" $?
grep -q "신호 상충" pages/pwa/index.js;                        chk "상충 배지 문구" $?
grep -q "_isMlConflict" pages/pwa/index.js;                   chk "상충 종목 top3 제외" $?
grep -q "buyWithinCash" lib/portfolioDuel.js;                 chk "매수 잔액 가드 함수" $?
! grep -qE "^\s*cash -= amt;\s*$" lib/portfolioDuel.js;       chk "무조건 차감 경로 제거" $?
grep -q "clampCash" lib/portfolioDuel.js;                     chk "현금 음수 최종 방지" $?
grep -q "pd-vs-skip" components/PortfolioDuelCard.js;         chk "AI 미체결(예수금 부족) 고지" $?
grep -q "자기검증에서 확인" components/PortfolioDuelCard.js;    chk "'추천 없음' 문구에 소스 명시" $?

echo "── 사용자 지적: 종합자산 주식 보유 탭 ──"
[ -f components/shared/KisHoldingsCard.js ];                  chk "KIS 보유 종목 공용 카드 존재" $?
[ -f components/shared/ManualHoldingsCard.js ];               chk "직접입력 보유 공용 카드 존재" $?
grep -q "KisHoldingsCard" pages/pwa/assets.js;                chk "종합자산 보유 탭에 KIS 카드" $?
grep -q "ManualHoldingsCard" pages/pwa/assets.js;             chk "종합자산 보유 탭에 직접입력 카드" $?
grep -q "KisHoldingsCard" pages/pwa/index.js;                 chk "주식 상세 페이지도 같은 컴포넌트 사용" $?
grep -q "ManualHoldingsCard" pages/pwa/index.js;              chk "주식 상세 페이지도 같은 직접입력 카드" $?
! grep -q "보유 자세히 · 매도 →" pages/pwa/assets.js;          chk "페이지 이동 유도 제거(그 자리에서 상세·매도)" $?
! grep -q "주식 › 추천 탭에서 확인하세요" pages/pwa/assets.js;  chk "추천 탭 자기참조 문구 제거" $?
grep -q "as-tabnote" pages/pwa/assets.js;                     chk "보유/추천 탭 전용 요약 줄(전환 인지)" $?
# 같은 UI 중복 정의 금지 — deriveStance/deriveUrgency 는 공용 카드에만 있어야 한다
D=$(grep -rc "^function deriveStance" pages/pwa/index.js); [ "$D" -eq 0 ]; chk "index.js 중복 deriveStance 제거" $?

echo "── 사용자 지적: 시간외 거래 08:00 시작 ──"
grep -q "t >= 8 \* 60 && t < 8 \* 60 + 30" lib/marketHours.js; chk "KRX 장전 시간외 08:00 시작" $?

echo "── 사용자 지적: AI 갱신 여부 먼저 ──"
grep -q "aiFreshness" pages/pwa/index.js;                     chk "갱신 스탬프 계산" $?
grep -q "ai-fresh" pages/pwa/index.js;                        chk "갱신 스탬프 렌더(3개 섹션 공통 최상단)" $?

echo "── 사용자 지적: 현장경제 ──"
grep -q "vidTs" pages/pwa/english.js;                         chk "라이브 영상 발행일 정렬" $?
grep -q "LIVE_MAX_AGE_DAYS" pages/pwa/english.js;             chk "오래된 영상 제외" $?
grep -q "live-vdate" pages/pwa/english.js;                    chk "영상 발행일 화면 표기" $?
grep -q "zh-CN-YunxiNeural" pages/api/english/speak.js;       chk "중국어 기본 음성 남성" $?

echo "── [S26-3] 디자인 통일 계측 (FAIL 아님 · 숫자만 · 0/목표로 수렴하는지 추적) ──"
# 집계 대상: pages/pwa/*.js 에서 백업(*.bak*)·고아(pwa_index_new.js) 제외.
#   pwa_index_new.js 는 앱 코드 어디서도 import/route 되지 않는 고아 파일이라 뺀다(2026-09-04 확인).
PWA=$(ls pages/pwa/*.js 2>/dev/null | grep -vE '\.bak|pwa_index_new\.js')
M1=$(grep -hoE "font-size:\s*[0-9.]+(rem|px)" $PWA | grep -oE "[0-9.]+(rem|px)" | sort -u | wc -l)
M2=$(grep -hoE "border-radius:\s*[0-9][0-9.]*(px|rem)" $PWA | wc -l)
M3=$(grep -hoiE "\.[a-z0-9_-]*card[a-z0-9_-]*\s*\{" $PWA | sort -u | wc -l)
M4=$(grep -hoE "\.(td-seg|as-stocktabs|etf-subtab|re-tab-btn|pwa-subtab|en-subtabs|en-tabs|en-langs|vc-seg|seg3|itab|mv-tabs|mf-tabs|alloc-seg|af-seg|tn-tabs|rp-aitab|ba-tabs|pwa-tabs|story-chip|scope-chip)\b" $PWA | sort -u | wc -l)
M5=0; for f in $PWA; do if grep -q "BottomNav" "$f" && ! grep -q -- "--nav-clearance" "$f"; then M5=$((M5+1)); fi; done
printf "[측정] font-size 리터럴 고유값   : %s  (목표 8)\n" "$M1"
printf "[측정] border-radius 리터럴 선언 : %s  (목표 0)\n" "$M2"
printf "[측정] 카드 클래스 정의(이름 card): %s  (목표 1)\n" "$M3"
printf "[측정] 탭 구현체(클래스 루트)     : %s  (목표 1)\n" "$M4"
printf "[측정] 하단여백 토큰 미적용 페이지: %s  (목표 0)\n" "$M5"

echo "FAIL=$F"; [ "$F" -eq 0 ]
