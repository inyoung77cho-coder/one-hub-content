#!/bin/bash
# [S16-N3] 오늘 탭 — 원 지적: "할 게 없다"만 말함 · 화면 절반 여백
cd "$(dirname "$0")/.." || exit 2
F=0
chk(){ if [ "$2" -eq 0 ]; then echo "  OK   $1"; else echo "  FAIL $1"; F=$((F+1)); fi; }

echo "── N3 오늘 탭 5블록 ──"
[ -f pages/pwa/today.js ]; chk "오늘 탭 존재" $?
grep -q "결정 대기" pages/pwa/today.js;   chk "① 결정 대기" $?
grep -q "통합 판단" pages/pwa/today.js;   chk "② 통합 판단" $?
grep -q "내 자산 오늘" pages/pwa/today.js; chk "③ 내 자산 오늘" $?
grep -q "나 vs AI" pages/pwa/today.js;    chk "④ 나 vs AI" $?
grep -q "AI 학습" pages/pwa/today.js;     chk "⑤ 학습 진행" $?
# 관망일에도 화면이 차야 한다 — 차단 종목 수를 말할 것
grep -q "걸렀습니다" pages/pwa/today.js; chk "관망일 콘텐츠(차단 N종목 서술) ★" $?
# [S18 B-1] 앱은 자기 상태를 시장 판단으로 말하지 않는다 — 차단 건수에 시장 단정을 덧붙이지 않는다.
#   (같은 시각 추천 탭에 관심 종목이 떠 있으면 두 화면이 서로를 반박한다)
! grep -qE "살 만한 게 (없|None)|살 게 없" pages/pwa/today.js; chk "B-1 시장 단정 오역 0 ★" $?
# 없는 손절선을 0원이라 말하지 않는다(라이브에서 잡힌 오표시)
grep -q "sl > 0" pages/pwa/today.js; chk "손절선 미설정 시 '0원' 오표시 방지" $?
# 남의 단지 신고가를 내 것으로 오해시키지 않는다
grep -q "내 단지 아님" pages/pwa/today.js; chk "신고가 오해 방지 라벨" $?

echo "  → N3 FAIL=$F"
exit $F
