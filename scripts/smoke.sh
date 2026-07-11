#!/usr/bin/env bash
# [S0.2] 신규 엔드포인트 필드 존재 스모크 — 스텝마다 케이스 추가.
#   서버/PC에서 실행. API 기본값은 온헙 Flask(5001). RE는 X-RE-KEY 헤더 필요.
set -u
API=${API:-http://54.180.54.132:5001}
RE=${RE:-http://54.180.54.132:5002}
ETF=${ETF:-http://54.180.54.132:5003}
fail=0
check() { # $1=url $2=jq필터 $3=라벨 [$4=헤더]
  local hdr=("${4:+-H}" "${4:-}")
  if curl -s "${hdr[@]}" "$1" 2>/dev/null | jq -e "$2" >/dev/null 2>&1; then
    echo "[ ok ] $3"
  else
    echo "[FAIL] $3"; fail=1
  fi
}

# ── PHASE 1 ──
# S1.1 총자산 단일 소스
check "$API/api/assets/total" '.breakdown.stock and .breakdown.etf and .breakdown.realty and .breakdown.cash and (.realty_state != null)' "S1.1 /api/assets/total 필드(stock/etf/realty/cash + realty_state)"
# S1.4 부동산 ONE Score 랭킹 유일성
check "$RE/api/realty/onescore" '([.ranking[].rank]) == ([.ranking[].rank] | unique)' "S1.4 랭킹 rank 유일성" "X-RE-KEY:${RE_ACCESS_KEY:-}"

exit $fail
