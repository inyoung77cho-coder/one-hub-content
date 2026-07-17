#!/bin/bash
# S18 Part5 검증 — 공휴일·시장 캘린더 (E-1~E-8)
#
# 지시서 원안 교정:
#   · python3 → ./venv/bin/python3 (exchange_calendars 는 venv 에만 있다)
#   · 검산부를 _verify_p5.py 로 분리 (중첩 heredoc 이 파이프를 깨뜨린다 — Part2 에서 실증)
FAIL=0
cd /home/ubuntu/one-hub/auto_trade || exit 2
chk(){ if [ "$2" -eq 0 ]; then echo "OK   $1"; else echo "FAIL $1"; FAIL=$((FAIL+1)); fi; }
echo "=== S18 Part5 검증 — 공휴일·시장 캘린더 ==="

# ── E-1 단일 모듈 ────────────────────────────────────────
[ -f market_calendar.py ]; chk "E-1 market_calendar.py" $?
[ -f market_status.py ];   chk "E-1 market_status CLI(배포게이트·크론용)" $?

# 금지 패턴 — 날짜를 다른 파일에서 직접 계산하지 않는다
BAD=$(grep -rln "timedelta(days=3)\|timedelta(days=7)" *.py 2>/dev/null | grep -v market_calendar.py | wc -l)
[ "$BAD" -eq 0 ]; chk "E-1 거래일 계산 단일화 (실측 ${BAD}개)" $?
BAD=$(grep -rlnE "HOLIDAYS *= *\[" *.py 2>/dev/null | grep -vE "market_calendar.py|kis_holiday.py" | wc -l)
[ "$BAD" -eq 0 ]; chk "E-1 공휴일 하드코딩 0 (실측 ${BAD}개)" $?

# ── E-2 KIS 휴장조회 (K5 임시공휴일 대응) ────────────────
[ -f kis_holiday.py ]; chk "E-2 KIS 국내휴장일조회 연동 ★" $?
grep -q "kis_holiday" market_calendar.py; chk "E-2 KRX 1차 소스 = KIS" $?
grep -q "CTCA0903R" kis_holiday.py; chk "E-2 TR_ID 실측값" $?
grep -q "kis_holiday_cache" kis_holiday.py; chk "E-2 캐시 + 당일·익일 재확인" $?

# ── E-1~E-4 정확도 ───────────────────────────────────────
./venv/bin/python3 _verify_p5.py || FAIL=$((FAIL+1))

# ── E-4 산출물 ───────────────────────────────────────────
[ -f RECHECK_RESULT.md ]; chk "E-4 거래일 재검증 결과서" $?
[ "$(grep -c 'timedelta(days=3)' block_accuracy_checker.py)" -eq 0 ]; chk "E-4 채점기 거래일 계산" $?

# ── E-5 스케줄러 게이트 ──────────────────────────────────
grep -q "HOLIDAY" main.py; chk "E-5 휴장일 잡 게이트 ★" $?
grep -q "_mc.is_open" main.py; chk "E-5 게이트가 캘린더로 판정" $?

# ── E-6 not_bought_reason ────────────────────────────────
curl -s "http://localhost:5001/api/ai/stats?trader=A" | grep -q "not_bought_reason"; chk "E-6 not_bought_reason" $?

# SPECIAL_HOURS 미등록 연도 경고
./venv/bin/python3 -c "
import sys; sys.path.insert(0,'.')
import market_calendar as mc
ks = getattr(mc,'SPECIAL_HOURS',{})
print('  SPECIAL_HOURS 등록:', sorted(ks) or '없음')
print('  ' + ('OK   2026 수능일 등록됨' if any(k.startswith('2026-11') for k in ks) else 'WARN 2026 수능일 미등록 — 교육부 공고로 날짜 확정 필요(K4)'))
"
echo "=================="
echo "FAIL=$FAIL"
exit $FAIL
