#!/bin/bash
# [S16-N9] 자산군 교차판단 + 3층 처방 — 원 지적: AI 제안이 2층에서 멈춤 · 자산군 교차판단 없음
cd "$(dirname "$0")/.." || exit 2
F=0
chk(){ if [ "$2" -eq 0 ]; then echo "  OK   $1"; else echo "  FAIL $1"; F=$((F+1)); fi; }

echo "── N9 교차판단 엔진 ──"
[ -f lib/crossInsight.js ]; chk "엔진 존재" $?
R=$(grep -c 'id: "' lib/crossInsight.js); [ "$R" -ge 3 ]; chk "규칙 $R개 (≥3)" $?
grep -q "RULES.find" lib/crossInsight.js; chk "하루 1개만 노출(첫 일치 1개)" $?
grep -q "참고용" lib/crossInsight.js; chk "면책 각주 상시" $?
! grep -qE "사세요|매수하세요|추천합니다|보장" lib/crossInsight.js; chk "투자권유·보장 표현 0 ★" $?
# 원장이 준 비율만 읽는다 — 여기서 다시 더하면 N1 계약 위반
! grep -q "reduce" lib/crossInsight.js; chk "자산 재합산 0 (N1 계약 준수) ★" $?
# ?acct= 는 ACCOUNTS 실제 값이어야 한다('연금'은 없는 값 → 조용히 무시되는 죽은 링크)
grep -q "acct=개인연금" lib/crossInsight.js; chk "CTA 계좌명 실제값 일치(죽은 링크 방지)" $?

echo "── N9 3층 처방 ──"
grep -q "as-rx-do" pages/pwa/assets.js; chk "처방 문장 존재" $?
grep -q "moveUk" pages/pwa/assets.js;   chk "처방=숫자(이동액)" $?
grep -q "수단은" pages/pwa/assets.js;    chk "처방=수단" $?
grep -q "as-rx-lim" pages/pwa/assets.js; chk "처방=제약 ★" $?
grep -q "이 안으로 시뮬" pages/pwa/assets.js; chk "시뮬 CTA" $?
grep -q "simRows" pages/pwa/assets.js;  chk "시뮬 실제 착지(인라인 결과)" $?
grep -q "수익 예측 아님" pages/pwa/assets.js; chk "시뮬=산수임을 명시(수익 약속 금지)" $?

echo "  → N9 FAIL=$F"
exit $F
