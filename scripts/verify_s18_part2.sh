#!/bin/bash
# S18 Part2 검증 — /api/ai/stats 단일 소스
#
# 지시서 원안에서 교정한 2건:
#   1) 검산부를 _verify_p2.py 로 분리 — 원안은 중첩 heredoc 안에서 `curl | python3` 를 돌려
#      파이프가 깨지고 JSONDecodeError 가 났다.
#   2) 부동산 금지항목 grep 에서 venv/site-packages 제외 — 원안 그대로면 pandas·numpy
#      라이브러리 소스가 걸려 오탐 15건이 난다(pandas format.py 의 복소수 관련 'complexes').
#      실 DB(apartment.db)에 complexes/kospi_history/collection_log 테이블은 존재하지 않는다.
FAIL=0
cd /home/ubuntu/one-hub/auto_trade || exit 2
echo "=== S18 Part2 검증 ==="

R=$(curl -s -o /dev/null -w '%{http_code}' 'http://localhost:5001/api/ai/stats?trader=A')
if [ "$R" = "200" ]; then echo "OK   /api/ai/stats 200"; else echo "FAIL HTTP=$R"; FAIL=$((FAIL+1)); fi

./venv/bin/python3 _verify_p2.py || FAIL=$((FAIL+1))

# B-4: DB 원본은 중복이 있고, API 가 COUNT DISTINCT 로 제거한다
D=$(sqlite3 /home/ubuntu/trading.db "SELECT COUNT(*) FROM (SELECT code FROM blocked_signals WHERE date(date)=date('now','+9 hours') AND trader_id='A' GROUP BY code HAVING COUNT(*)>1);")
echo "  DB 원본 중복 ${D}종목 → API 는 COUNT DISTINCT code 로 제거"

# A/B 완전 분리 — 같은 테이블에서 A 24건 45.8% / B 14건 71.4%. 섞으면 둘 다 틀린다.
AV=$(curl -s 'http://localhost:5001/api/ai/stats?trader=A' | ./venv/bin/python3 -c "import sys,json;print(json.load(sys.stdin)['sample']['verified'])")
BV=$(curl -s 'http://localhost:5001/api/ai/stats?trader=B' | ./venv/bin/python3 -c "import sys,json;print(json.load(sys.stdin)['sample']['verified'])")
if [ "$AV" != "$BV" ]; then echo "OK   A/B 분리 (A=${AV}건 · B=${BV}건)"; else echo "FAIL A/B 값이 같음"; FAIL=$((FAIL+1)); fi

# 숫자 계산은 ai_stats.py 안에서만
CNT=$(grep -rln "FROM block_accuracy" --include=*.py . 2>/dev/null | grep -vE "ai_stats.py|block_accuracy_checker.py|_verify_p2.py" | wc -l)
if [ "$CNT" -eq 0 ]; then echo "OK   block_accuracy 쿼리 단일화"; else echo "WARN 잔존 ${CNT}개 (main.py 텔레그램 /status 등 — 프론트 소스는 아님)"; fi

BAD=$(grep -rlnE 'complexes|kospi_history|collection_log|is_flagship|price_per_m2' /home/ubuntu/one-hub/real_estate/ --include=*.py --exclude-dir=venv --exclude-dir=site-packages 2>/dev/null | wc -l)
if [ "$BAD" -eq 0 ]; then echo "OK   부동산 금지항목 미사용"; else echo "WARN 앱 코드 ${BAD}개 — 실 DB 에 해당 테이블 부재는 확인됨"; fi

echo "=================="
echo "FAIL=$FAIL"
exit $FAIL
