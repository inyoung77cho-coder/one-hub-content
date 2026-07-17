#!/bin/bash
# [S16] N4 정렬 근거 · N5 렌더/범례 · N8 톤·구조 · N9 교차판단(얕은 검사)
cd "$(dirname "$0")/.." || exit 2
F=0
chk(){ if [ "$2" -eq 0 ]; then echo "  OK   $1"; else echo "  FAIL $1"; F=$((F+1)); fi; }

echo "── N4 정렬 근거 ──"
# 원 지적: Top3 정렬 근거 없음 (기대 7.3%가 4위)
grep -q "recSort" pages/pwa/index.js; chk "정렬 칩(관심도순/기대수익순) 존재" $?
grep -q "sortBasisNote" pages/pwa/index.js; chk "현재 정렬 기준 화면 명시 ★" $?
grep -q "bottomSheet.tie" pages/pwa/index.js; chk "동점 2차 정렬 근거 시트 착지" $?

echo "── N5 렌더·범례 ──"
# 원 지적: 설정 도움말 2회 렌더 · 도넛 범례 글자 잘림
grep -q "minmax(0, 1fr)" pages/pwa/assets.js; chk "도넛 범례 grid minmax(0,1fr)" $?
grep -q "text-overflow: ellipsis" pages/pwa/assets.js; chk "범례 라벨 말줄임(잘림 방지)" $?
grep -q "tabular-nums" pages/pwa/assets.js; chk "금액 자릿수 정렬" $?
grep -qE "padding: 0 14px calc\(env\(safe-area-inset-bottom, 0px\) \+ 140px\)" pages/pwa/assets.js; chk "FAB 가림 방지 여백(140px)" $?

echo "── N7 소표본 게이트 ──"
# 원 지적: 100% (1/1건)이 "ML이 신뢰하는 신호" 1위
grep -q "MIN_SHOW" pages/pwa/index.js; chk "표본 하한 게이트 존재" $?
# 화면 문자열은 템플릿 리터럴(표본 {MIN_SHOW}건 …) — 리터럴 5를 찾으면 오탐이 난다
grep -q "건 이상만 표시" pages/pwa/index.js; chk "게이트 사실을 화면에 명시" $?
! grep -q "ML이 신뢰하는 신호" pages/pwa/index.js; chk "과장 문구 제거" $?

echo "── N8 톤·구조 ──"
# 원 지적: 매수하기 최강 시각신호 · ISA 탭 없음 · 15종목 나열
! grep -q '>매수하기 →<' pages/pwa/index.js; chk "'매수하기' 라벨 제거(주문 안 함 → 약속 금지)" $?
grep -q '>주문 방법 →<' pages/pwa/index.js; chk "'주문 방법' 정직 라벨" $?
grep -q '\["전체", \.\.\.ACCOUNTS\]' pages/pwa/etf.js; chk "ETF 계좌 5탭(ISA 포함)" $?
[ "$(grep -c 'tie-note' pages/pwa/index.js)" -eq 0 ]; chk "카드 동점줄 접힘 + 죽은 CSS 0" $?

echo "── N9 교차판단(얕은) ──"
[ -f lib/crossInsight.js ]; chk "교차판단 엔진 존재" $?
grep -q "pickInsight" pages/pwa/today.js; chk "오늘 탭 노출" $?

echo "  → N4589 FAIL=$F"
exit $F
