#!/bin/bash
# S17-0 Part1 검증 — 긴급 트리아지
#   ※ 지시서 원안의 좌표를 실측값으로 교정함:
#      - 서비스명: onehub-stock(존재하지 않음) → onehub / onehub-b / onehub-api / onehub-realestate / onehub-etf
#      - .bak 패턴: *.bak(0개 매칭) → *.bak*  (실제 파일은 *.bak_20260615_125319 형식)
FAIL=0
echo "=== S17-0 Part1 트리아지 ==="

# 1. 포렌식 단서 보존 (이걸 지웠으면 복원 불가)
[ -d ~/.vscode-server/data/User/History ] && echo "OK   vscode History 보존됨 ($(du -sh ~/.vscode-server/data/User/History 2>/dev/null | cut -f1))" || echo "WARN vscode History 없음"
BAKN=$(ls /home/ubuntu/one-hub/auto_trade/*.bak* 2>/dev/null | wc -l)
[ "$BAKN" -gt 0 ] && echo "OK   .bak ${BAKN}개 보존" || { echo "FAIL .bak 0개 — 복원 소스 상실 위험"; FAIL=$((FAIL+1)); }

# 2. 디스크 (H-A)
AV=$(df -BG --output=avail / | tail -1 | tr -dc '0-9')
[ "$AV" -ge 2 ] && echo "OK   디스크 여유 ${AV}G" || { echo "FAIL 디스크 여유 ${AV}G (<2G)"; FAIL=$((FAIL+1)); }
# 지시서 원안 `df -i --output=pcent /` 는 -i 와 --output 이 상호배타라 실행 자체가 안 됨 → awk 로 교정
IU=$(df -i / | tail -1 | awk '{print $5}' | tr -dc '0-9')
[ "$IU" -lt 90 ] && echo "OK   inode ${IU}%" || { echo "FAIL inode ${IU}%"; FAIL=$((FAIL+1)); }
sqlite3 /home/ubuntu/trading.db "CREATE TABLE _wt(a); DROP TABLE _wt;" 2>/dev/null && echo "OK   DB 쓰기 가능" || { echo "FAIL DB 쓰기 불가 (H-A 확정)"; FAIL=$((FAIL+1)); }

# 3. 서비스 (실명)
for S in onehub onehub-b onehub-api onehub-realestate onehub-etf; do
  systemctl is-active --quiet $S && echo "OK   $S active" || { echo "FAIL $S inactive"; FAIL=$((FAIL+1)); }
done

# 4. H-F 관측 (관측 결과 출력용)
echo "--- H-F 관측 ---"
grep -q "get_stock_regime" /home/ubuntu/one-hub/auto_trade/*.py && echo "  get_stock_regime: 존재" || echo "  WARN get_stock_regime: 부재 → H-F 유력"
grep -riqE "방산|defense|hedge|inverse" /home/ubuntu/one-hub/auto_trade/*.py && echo "  방향성 예외 키워드: 존재" || echo "  WARN 방향성 예외 키워드: 부재 → H-F 유력"
POOLN=$(cd /home/ubuntu/one-hub/auto_trade && ./venv/bin/python3 -c "import sys;sys.path.insert(0,'.');from stock_screener import STOCK_POOL as P;print(len(P))" 2>/dev/null)
echo "  STOCK_POOL 종목 수: ${POOLN:-측정실패} (지시서 기대치 92)"

# 5. 판정서
[ -f /home/ubuntu/one-hub/auto_trade/TRIAGE_RESULT.md ] && echo "OK   판정서 작성됨" || { echo "FAIL TRIAGE_RESULT.md 미작성"; FAIL=$((FAIL+1)); }

echo "=================="
echo "FAIL=$FAIL"
exit $FAIL
