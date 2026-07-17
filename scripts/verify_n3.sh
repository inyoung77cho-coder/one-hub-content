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
# [S18 C-6] '부근'은 완곡어다. 현재가<손절선이면 이미 '이탈'이고, 보유 화면은 그렇게 말한다.
! grep -q "원 부근" pages/pwa/today.js; chk "C-6 '손절선 부근' 완곡표현 0 ★" $?
grep -q "이탈 — 매도 검토 필요" pages/pwa/today.js; chk "C-6 '이탈' 카피" $?
# 손실률은 상태이지 이벤트가 아니다 — pnl_rate 단독으로 결정대기를 띄우지 않는다
! grep -qE "r <= -7|pnl_rate\) <= -7" pages/pwa/today.js; chk "C-6 손실률 단독 발동 제거" $?
# 남의 단지 신고가를 내 것으로 오해시키지 않는다
grep -q "내 단지 아님" pages/pwa/today.js; chk "신고가 오해 방지 라벨" $?

echo "  → N3 FAIL=$F"
exit $F
