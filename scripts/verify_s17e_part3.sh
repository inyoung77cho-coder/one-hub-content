#!/bin/bash
# S17-0 Part3 검증 — PWA 연동 & 재발 방지
#   ※ 지시서 원안(verify_s17e_part3.ps1)을 실측에 맞춰 교정. 원안대로면 오탐 6건:
#      1) app/**/*.tsx 경로 — 실제는 Pages Router + JS (pages/**/*.js)
#      2) "?? 0 / || 0 개수 == 0" — 실측 207건이 전부 정렬·산술용 정당 사용.
#         무차별 제거하면 NaN 으로 깨진다 → '실패를 0으로 그리지 않는 장치'가 있는지로 검사
#      3) 키: onehub-key.pem → one-hub-key.pem
#      4) 서비스: onehub-stock(부재) → onehub / onehub-b / onehub-api
#      5) "api/decision 사용" — 신설하면 오히려 창구 3벌. 기존 단일 상태기계 확인으로 대체
#      6) PowerShell → bash (이 환경은 Git Bash 로 검증)
FAIL=0
ROOT="/c/onehub/one-hub-content"
KEY="/c/onehub/one-hub-key.pem"
SRV="ubuntu@54.180.54.132"
chk(){ if [ "$2" -eq 0 ]; then echo "OK   $1"; else echo "FAIL $1"; FAIL=$((FAIL+1)); fi; }
cd "$ROOT" || exit 2
echo "=== S17-0 Part3 검증 ==="

# ── S-3 / H-G ─────────────────────────────────────────────
[ -f docs/API_CONTRACT.md ]; chk "API 계약표 작성" $?
grep -q "assets/total" docs/API_CONTRACT.md; chk "계약표에 404 목록 명시" $?

# ── 실패를 0으로 그리지 않는 장치 (지시서 의도) ───────────
[ -f components/DataState.js ]; chk "DataState (실패 시 값 대신 재시도 UI)" $?
grep -q "BACKEND_UNAVAILABLE" lib/ledger.js; chk "백엔드 부재를 0 아닌 경고로 표면화" $?
! grep -qE "(res|upstream)\.ok[^;]*\?\?\s*0" pages/api/*.js pages/pwa/*.js 2>/dev/null; chk "API 응답에 직접 붙은 '?? 0' 0건 ★" $?

# ── 버전 불일치 배너 (이 Part 의 핵심 산출물) ─────────────
[ -f components/EngineVersionBanner.js ]; chk "엔진 버전 불일치 배너 구현 ★" $?
grep -q "EXPECTED_CONTRACT" components/EngineVersionBanner.js; chk "계약 기대값 상수" $?
grep -q "EngineVersionBanner" pages/_app.js; chk "배너 전역 배선(_app.js)" $?
[ -f pages/api/version.js ]; chk "버전 프록시 라우트" $?

# ── W3-4 /api/version (엔진) ──────────────────────────────
V=$(ssh -i "$KEY" -o StrictHostKeyChecking=no -o ConnectTimeout=15 "$SRV" \
    "curl -s -o /dev/null -w '%{http_code}' http://localhost:5001/api/version" 2>/dev/null)
[ "$V" = "200" ]; chk "/api/version 200 (실측 $V)" $?
C=$(ssh -i "$KEY" -o StrictHostKeyChecking=no "$SRV" \
    "curl -s http://localhost:5001/api/version | grep -o '\"api_contract\":\"[^\"]*\"'" 2>/dev/null)
echo "  엔진 계약: $C"
echo "$C" | grep -q "2026-07"; chk "엔진 계약 = 프론트 기대값(2026-07)" $?

# ── 재발 방지: 서버 로컬 git ──────────────────────────────
G=$(ssh -i "$KEY" -o StrictHostKeyChecking=no "$SRV" \
    "cd /home/ubuntu/one-hub/auto_trade && git log --oneline 2>/dev/null | wc -l" 2>/dev/null)
[ "${G:-0}" -ge 1 ]; chk "서버 로컬 git 도입 (커밋 ${G:-0}개)" $?
LEAK=$(ssh -i "$KEY" -o StrictHostKeyChecking=no "$SRV" \
    "cd /home/ubuntu/one-hub/auto_trade && git ls-files | grep -cE '\.env|token|secret|\.key|\.pem'" 2>/dev/null)
[ "${LEAK:-1}" -eq 0 ]; chk "키/토큰 git 미추적 (실측 ${LEAK}건) ★" $?

# ── 재발 방지: 배포 게이트 ────────────────────────────────
[ -f /c/onehub/deploy_auto_trade.ps1 ]; chk "배포 스크립트 존재" $?
grep -q "버전 후퇴" /c/onehub/deploy_auto_trade.ps1; chk "게이트: 버전 후퇴 차단" $?
grep -q "장중" /c/onehub/deploy_auto_trade.ps1; chk "게이트: 장중 차단" $?
grep -q "bak_" /c/onehub/deploy_auto_trade.ps1; chk "게이트: .bak 백업" $?
grep -q "git commit" /c/onehub/deploy_auto_trade.ps1; chk "게이트: git 커밋" $?

# ── 재발 방지: 버전 감시 크론 ─────────────────────────────
W=$(ssh -i "$KEY" -o StrictHostKeyChecking=no "$SRV" "crontab -l 2>/dev/null | grep -c version_watch" 2>/dev/null)
[ "${W:-0}" -ge 1 ]; chk "버전 감시 크론 등록" $?

# ── 승인/거절 단일 상태기계 (신설 대신 기존 확인) ─────────
[ -f pages/api/approve-pending.js ]; chk "승인 창구 = 단일 엔드포인트 경유" $?

# ── 빌드 ──────────────────────────────────────────────────
npm run build > /tmp/p3build.log 2>&1; chk "npm run build (webpack)" $?

echo "=================="
echo "FAIL=$FAIL"
exit $FAIL
