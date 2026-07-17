#!/bin/bash
# [S16] 통합 검증 — 9항목(N1~N9). 종료코드 = 총 FAIL 수.
#   WO3-99 원안의 루프에 n67 을 추가했다: N6·N7 이 어느 스크립트에도 없으면
#   '검증되지 않은 항목'이 조용히 통과로 보인다(이 리포트가 막으려는 바로 그 일).
cd "$(dirname "$0")/.." || exit 2
T=0
for s in n1 n2 n3 n4589 n67 n9; do
  [ -f scripts/verify_$s.sh ] || continue
  echo ""; echo "═══════════ $s ═══════════"
  bash scripts/verify_$s.sh; T=$((T+$?))
done
echo ""; echo "═══════════════════════════"
if [ $T -eq 0 ]; then echo "ALL PASS — S16 9/9"; else echo "TOTAL FAIL=$T"; fi
exit $T
