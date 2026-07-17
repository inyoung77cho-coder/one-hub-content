#!/bin/bash
# S18 후속 — block_accuracy 파이프라인 검증
F=0
cd /home/ubuntu/one-hub/auto_trade
chk(){ if [ "$2" -eq 0 ]; then echo "OK   $1"; else echo "FAIL $1"; F=$((F+1)); fi; }
echo '=== S18 block_accuracy 파이프라인 ==='
grep -q '_register_block_accuracy' db_logger.py; chk '파이프라인 함수 존재' $?
grep -q 'INSERT INTO block_accuracy' db_logger.py; chk 'block_accuracy INSERT 존재 ★' $?
grep -q 'WHERE NOT EXISTS' db_logger.py; chk '중복 방지(같은 날 같은 종목 1행)' $?
grep -q '등록 실패(차단 기록에는 영향 없음)' db_logger.py; chk '실패 격리(기존 동작 보장)' $?
[ "$(grep -c 'timedelta(days=3)' block_accuracy_checker.py)" -eq 0 ]; chk '채점기 거래일 계산' $?
grep -q 'add_trading_days' block_accuracy_checker.py; chk '채점기가 market_calendar 사용' $?
[ -f market_calendar.py ]; chk '캘린더 단일 모듈' $?
# 오늘 이후 새 행이 쌓이는지(다음 거래일 08:53 이후 확인)
N=$(sqlite3 /home/ubuntu/trading.db "SELECT COUNT(*) FROM block_accuracy WHERE date(block_date) > '2026-06-16';")
echo "  2026-06-16 이후 신규 행: ${N}건 (다음 거래일 최종결정 후 증가해야 정상)"
echo "FAIL=$F"; exit $F
