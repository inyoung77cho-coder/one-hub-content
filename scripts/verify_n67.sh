#!/bin/bash
# [S16] N6 오염 평단·평형 마스터 — 원 지적: 평단 1,920,209원 · 시범한신 70평 입력 불가
#   ※ 이 스크립트는 '아직 못 한 것'을 숨기지 않고 드러내기 위해 존재한다.
#      FAIL 이 나오는 것이 현재의 정직한 상태다(WO3-99 규칙 ⑤).
cd "$(dirname "$0")/.." || exit 2
F=0
chk(){ if [ "$2" -eq 0 ]; then echo "  OK   $1"; else echo "  FAIL $1"; F=$((F+1)); fi; }

echo "── N6 오염 평단 ──"
# 자동 보정 금지 — 원본이 평단인지 총매입액인지는 사람만 안다. 앱은 '격리하고 묻기'까지만.
grep -q "AVG_PRICE_OUT_OF_RANGE" lib/ledger.js; chk "이상 평단 격리(총자산 오염 차단)" $?
grep -q "saneAvg" lib/ledger.js; chk "평단 상한 규칙(정수·≤300만원)" $?
grep -rq "이 값이 맞습니다" pages/ components/ --include=*.js; chk "사용자 확인 플로우([평단 수정][이 값이 맞습니다])" $?
grep -q "verifyStockAvg" lib/stockHoldings.js; chk "verified 플래그(확인 후 재질문 없음)" $?
grep -q "h.verified === true" lib/ledger.js; chk "확인된 평단은 총자산에 포함(사람 판단 우선)" $?
grep -q "updateStockAvg" lib/stockHoldings.js; chk "평단 수정 경로(사용자 입력값 그대로)" $?
! grep -qE "avgPrice\s*/\s*shares|추정 평단|auto.?correct" lib/stockHoldings.js; chk "자동 보정 없음 ★(원본이 평단인지 총매입액인지는 사람만 안다)" $?

echo "── N6 평형 마스터 ──"
grep -rq "complex_area_master\|/api/realestate/areas" pages/ lib/ --include=*.js; chk "평형 마스터 API 연동" $?
[ -f lib/realestate/area.js ]; chk "평형 정규화 모듈(±3㎡ 밴드)" $?
grep -rq "평형 칩\|areaChip" pages/pwa/input.js pages/pwa/realestate.js 2>/dev/null; chk "평형 칩 UI(시범한신 70평 입력)" $?

echo "  → N67 FAIL=$F"
exit $F
