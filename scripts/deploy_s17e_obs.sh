#!/bin/bash
# S17-0 Part1 후속 — 관측성 3건 배포 (서버에서 실행)
#   안전규칙: ① 배포 전 스냅샷 ② .bak 필수 ③ 장 마감 후 ④ 실패 시 즉시 롤백
set -u
AT=/home/ubuntu/one-hub/auto_trade
TS=$(date +%Y%m%d_%H%M%S)
cd "$AT" || exit 2

echo "=== 0) 장중 여부 재확인 ==="
# 이 가드는 요일·시각만 본다 — 공휴일 휴장을 알지 못해 휴장일을 '장중'으로 오판한다.
#   그래서 가드를 지우지 않고, 사람이 휴장을 확인했을 때만 MARKET_CLOSED=1 로 명시 우회한다.
KH=$(TZ=Asia/Seoul date +%H%M); KD=$(TZ=Asia/Seoul date +%u)
if [ "$KD" -le 5 ] && [ "$KH" -ge 0900 ] && [ "$KH" -le 1530 ]; then
  if [ "${MARKET_CLOSED:-0}" = "1" ]; then
    echo "우회: 시각상 장중($KH KST)이나 휴장일로 확인됨(MARKET_CLOSED=1) — 사용자 확인 근거로 진행"
    # 휴장 근거 교차검증: 오늘 체결/신호가 있으면 장이 선 것이므로 중단
    TODAY_TRADES=$(sqlite3 /home/ubuntu/trading.db \
      "SELECT COUNT(*) FROM trades WHERE date(date)=date('now','+9 hours');" 2>/dev/null || echo 0)
    if [ "${TODAY_TRADES:-0}" -gt 0 ]; then
      echo "중단: 오늘 체결 ${TODAY_TRADES}건 존재 → 휴장이 아님. 배포 금지."; exit 3
    fi
    echo "  교차검증 OK: 오늘 체결 0건"
  else
    echo "중단: 장중($KH KST)입니다. 배포 금지. (휴장일이면 MARKET_CLOSED=1 로 실행)"; exit 3
  fi
else
  echo "OK 장 마감 후 ($KH KST, 요일=$KD)"
fi

echo "=== 1) 스냅샷 (코드 + DB) ==="
cp -p main.py      "main.py.bak_s17e_${TS}"       && echo "  main.py.bak_s17e_${TS}"
cp -p db_logger.py "db_logger.py.bak_s17e_${TS}"  && echo "  db_logger.py.bak_s17e_${TS}"
cp -p /home/ubuntu/trading.db "/home/ubuntu/trading.db.bak_s17e_${TS}" && echo "  trading.db.bak_s17e_${TS}"

echo "=== 2) 신규 파일 배치 (SCP 로 올라온 .new 를 교체) ==="
for f in main.py db_logger.py; do
  [ -f "${f}.new" ] || { echo "중단: ${f}.new 없음"; exit 4; }
  ./venv/bin/python3 -c "import ast,io;ast.parse(io.open('${f}.new',encoding='utf-8').read())" \
    || { echo "중단: ${f}.new 문법 오류"; exit 5; }
  mv "${f}.new" "$f" && echo "  $f 교체됨"
done

echo "=== 3) import 검증 (재시작 전에 죽는지 먼저 본다) ==="
ONEHUB_REPORT_ONLY=1 ./venv/bin/python3 -c "
import sys; sys.path.insert(0,'.')
import db_logger
print('  db_logger import OK — expire_all_pending 반환형:', db_logger.expire_all_pending.__annotations__.get('return'))
" || { echo "중단: import 실패 → 롤백"; cp -p "main.py.bak_s17e_${TS}" main.py; cp -p "db_logger.py.bak_s17e_${TS}" db_logger.py; exit 6; }

echo "=== 4) 3서비스 재시작 ==="
sudo systemctl restart onehub onehub-b onehub-api
sleep 8
for S in onehub onehub-b onehub-api; do
  systemctl is-active --quiet "$S" && echo "  OK $S active" || { echo "  FAIL $S — 롤백 실행"; \
    cp -p "main.py.bak_s17e_${TS}" main.py; cp -p "db_logger.py.bak_s17e_${TS}" db_logger.py; \
    sudo systemctl restart onehub onehub-b onehub-api; exit 7; }
done

echo "=== 5) 부팅 로그 (자율모드 복원·에러 확인) ==="
sudo journalctl -u onehub --since "1 min ago" --no-pager | grep -iE "자율 운영|Traceback|Error|ONE-HUB AI" | head -5

echo "=== 6) 스냅샷 파일 ==="
ls -la main.py.bak_s17e_${TS} db_logger.py.bak_s17e_${TS} /home/ubuntu/trading.db.bak_s17e_${TS}
echo "완료. 롤백: cp -p main.py.bak_s17e_${TS} main.py; cp -p db_logger.py.bak_s17e_${TS} db_logger.py; sudo systemctl restart onehub onehub-b onehub-api"
