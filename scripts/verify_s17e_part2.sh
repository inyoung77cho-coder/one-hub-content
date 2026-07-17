#!/bin/bash
# S17-0 Part2 검증 — 버전 포렌식
#   ※ 지시서 원안을 실측에 맞춰 교정함(원안 그대로면 오탐 4건):
#      - 서비스명 onehub-stock(부재) → 실명 onehub / onehub-b / onehub-api
#      - STOCK_POOL 은 config 가 아니라 stock_screener 에 있음. venv 필요(yfinance)
#      - "APP_VERSION 정의 1곳" → main.py(파생)·patch_v91_engine.py(일회성 스크립트)가
#        같이 잡혀 오탐. 단일 소스는 version.py 이므로 그것으로 검사
#      - "v8.2 잔존 금지" → 현재 v10.0.0-ops. v8.2 는 2026-06-19 스냅샷일 뿐
FAIL=0
cd /home/ubuntu/one-hub/auto_trade || exit 2
echo "=== S17-0 Part2 검증 — 버전 포렌식 ==="

# 1. 스냅샷 (안전규칙 1) — 서버
ls -d /home/ubuntu/snapshot_* >/dev/null 2>&1 && echo "OK   서버 스냅샷 존재: $(ls -d /home/ubuntu/snapshot_* | tail -1)" || { echo "FAIL 스냅샷 없음"; FAIL=$((FAIL+1)); }

# 2. 산출물
[ -f RESTORE_SCENARIO.md ] && echo "OK   시나리오 판정서" || { echo "FAIL RESTORE_SCENARIO.md 없음"; FAIL=$((FAIL+1)); }
[ -f /tmp/v8_vs_v9_diff.txt ] && echo "OK   diff 인벤토리 ($(wc -l < /tmp/v8_vs_v9_diff.txt)줄)" || { echo "FAIL diff 인벤토리 없음"; FAIL=$((FAIL+1)); }

# 3. 문법
./venv/bin/python3 -m py_compile *.py 2>/dev/null && echo "OK   py_compile" || { echo "FAIL 문법 오류"; FAIL=$((FAIL+1)); }

# 4. APP_VERSION — 단일 소스(version.py)에서 확인. v8.2 잔존이면 오히려 롤백 사고
V=$(grep -ho 'APP_VERSION *= *"[^"]*"' version.py | head -1)
echo "  단일 소스: $V"
echo "$V" | grep -q '"v8\.2"' && { echo "FAIL APP_VERSION 이 v8.2 로 후퇴"; FAIL=$((FAIL+1)); } || echo "OK   APP_VERSION 후퇴 없음"
N=$(grep -c 'APP_VERSION *=' version.py)
[ "$N" -eq 1 ] && echo "OK   version.py 정의 1곳(단일 소스)" || { echo "FAIL version.py 정의 ${N}곳"; FAIL=$((FAIL+1)); }
grep -q 'from version import APP_VERSION' main.py && echo "OK   main.py 가 단일 소스 참조" || { echo "FAIL main.py 자체 정의"; FAIL=$((FAIL+1)); }

# 5. H-F 기능 생존 (복원이 아니라 '유실 없음'을 검증)
P=$(./venv/bin/python3 -c "import sys;sys.path.insert(0,'.');from stock_screener import STOCK_POOL as X;print(len(X))" 2>/dev/null)
if [ -n "$P" ] && [ "$P" -ge 92 ]; then echo "OK   STOCK_POOL ${P}종목 (>=92)"; else echo "FAIL STOCK_POOL ${P:-로드실패}"; FAIL=$((FAIL+1)); fi
grep -q "def get_stock_regime" stock_screener.py && echo "OK   get_stock_regime" || { echo "FAIL get_stock_regime 부재"; FAIL=$((FAIL+1)); }
grep -qE 'direction in \("hedge", "inverse"\)' stock_screener.py && echo "OK   방향성 예외(hedge/inverse)" || { echo "FAIL 방향성 예외 부재"; FAIL=$((FAIL+1)); }
grep -q '"defense"' stock_screener.py && echo "OK   방산 예외(defense)" || { echo "FAIL 방산 예외 부재"; FAIL=$((FAIL+1)); }
grep -q '_direction' stock_screener.py && echo "OK   _direction 주입(죽은 코드 아님)" || { echo "FAIL _direction 미주입"; FAIL=$((FAIL+1)); }

# 6. S-2 텔레그램 명령어
grep -q "aimode" main.py telegram_bot.py 2>/dev/null && echo "OK   /aimode 존재" || { echo "FAIL /aimode 부재"; FAIL=$((FAIL+1)); }

# 7. 안전규칙 2 — 키 파일 미변경
#   ★ .env 를 mtime 으로 판단하면 안 된다: 봇이 재시작할 때마다 [KAKAO_REFRESH] 로
#     access_token 을 .env 에 갱신한다(정상 동작). 즉 재시작만 해도 오늘 날짜가 된다.
#     사람이 건드리면 안 되는 것은 crypto_utils.py 쪽이다.
CU=$(stat -c %y crypto_utils.py 2>/dev/null | cut -c1-10)
if [ -n "$CU" ] && [ "$CU" != "$(date +%F)" ]; then
  echo "OK   crypto_utils.py 미변경 ($CU)"
else
  echo "FAIL crypto_utils.py 가 오늘 변경됨 — A/B 키 분리 파손 위험"; FAIL=$((FAIL+1))
fi
echo "  참고 .env mtime: $(stat -c %y .env 2>/dev/null | cut -c1-16) — 재시작 시 카카오 토큰 자동 갱신으로 바뀜(정상)"

# 8. 서비스 (실명)
for S in onehub onehub-b onehub-api onehub-realestate onehub-etf; do
  systemctl is-active --quiet $S && echo "OK   $S active" || { echo "FAIL $S inactive"; FAIL=$((FAIL+1)); }
done

# 9. 포렌식 단서 보존
BAKN=$(ls *.bak* 2>/dev/null | wc -l)
[ "$BAKN" -gt 0 ] && echo "OK   .bak ${BAKN}개 보존 중" || { echo "FAIL .bak 없음"; FAIL=$((FAIL+1)); }
[ -d ~/.vscode-server/data/User/History ] && echo "OK   vscode History 보존" || echo "WARN vscode History 없음"

echo "=================="
echo "FAIL=$FAIL"
exit $FAIL
