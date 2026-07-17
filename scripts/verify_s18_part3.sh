#!/bin/bash
# S18 Part3 검증 — 표기 정정 (C-1~C-6)
#
# 지시서 원안(verify_s18_part3.ps1)에서 교정한 것:
#   · 경로 app/**/*.tsx → 실제는 Pages Router + JS (pages/**/*.js)
#   · MetricCard.tsx 신설 요구 → 4개 타일이 index.js 한 곳(tiles 배열)에 모여 있어
#     별도 컴포넌트 없이 그 자리에서 잠금이 강제된다. 컴포넌트 추상화는 이득 없이
#     4,100줄 파일을 더 건드리는 위험만 늘린다 → 타일 생성부에서 차단.
#   · "이탈"·"as_of" 등 일부 패턴은 이미 어제(C-5/C-6) 반영됨 — 회귀 검사로 유지
FAIL=0
cd "$(dirname "$0")/.." || exit 2
chk(){ if [ "$2" -eq 0 ]; then echo "OK   $1"; else echo "FAIL $1"; FAIL=$((FAIL+1)); fi; }
echo "=== S18 Part3 검증 — 표기 정정 ==="

# ── C-1: 잠긴 지표의 숫자 자리에 분수 금지 ──────────────────
#   기존 `${nTrade}/30` 이 손익비 자리에 박혀 "손익비 0.03"(파산 직전 수치)으로 읽혔다.
! grep -qE 'v: `\$\{nTrade\}/30`' pages/pwa/index.js; chk "C-1 잠김 자리 분수표기 제거 ★" $?
grep -q "v: '🔒'" pages/pwa/index.js; chk "C-1 잠김은 🔒 렌더" $?
grep -q "30건부터 공개" pages/pwa/index.js; chk "C-1 진행도는 캡션으로만" $?

# ── C-2: 다른 축의 숫자로 '정식 통계'를 선언하지 않는다 ─────
#   오늘 탭의 진행도는 '내 판단 기록'(나 vs AI 채점 대상)이지 sample.verified 가 아니다.
! grep -q "정식 통계 구간입니다" pages/pwa/today.js; chk "C-2 '정식 통계 구간' 거짓 선언 제거 ★" $?
grep -q "누적 판단 기록" pages/pwa/today.js; chk "C-2 judgments_total 라벨 정확화" $?

# ── C-3: 적중률은 삭제가 아니라 잠금. 미채점을 패로 세지 않는다 ─
grep -q "accLocked" pages/pwa/index.js; chk "C-3 적중률 50건 잠금(삭제 아님)" $?
grep -q "표본 50건부터 공개" pages/pwa/index.js; chk "C-3 잠금 사유 캡션" $?
grep -q "나 vs AI" pages/pwa/index.js; chk "C-3 승률 → 나vsAI 통합" $?
grep -q "아직 채점된 승부가 없습니다" pages/pwa/index.js; chk "C-3 미채점을 패로 안 셈 ★" $?

# ── C-5 / C-6 회귀 (어제 배포분) ────────────────────────────
grep -q "hasTarget" pages/pwa/etf.js; chk "C-5 목표배분 잠금 회귀 없음" $?
grep -q "sector_cap_pct" pages/pwa/etf.js; chk "C-5 상한 프리셋 파생 회귀 없음" $?
grep -q "이탈 — 매도 검토 필요" pages/pwa/today.js; chk "C-6 손절선 이탈 카피 회귀 없음" $?
! grep -q "원 부근" pages/pwa/today.js; chk "C-6 완곡표현 0" $?

# ── 엔진 단일 소스가 살아 있는가 (Part2 선행) ───────────────
if command -v ssh >/dev/null 2>&1; then
  R=$(ssh -i /c/onehub/one-hub-key.pem -o StrictHostKeyChecking=no -o ConnectTimeout=15 ubuntu@54.180.54.132 \
      "curl -s -o /dev/null -w '%{http_code}' 'http://localhost:5001/api/ai/stats?trader=A'" 2>/dev/null)
  [ "$R" = "200" ]; chk "Part2 /api/ai/stats 200 (선행 조건)" $?
fi

npm run build > /tmp/p3build.log 2>&1; chk "npm run build (webpack)" $?
echo "=================="
echo "FAIL=$FAIL"
exit $FAIL
