#!/usr/bin/env bash
# [S0.2] 신규 엔드포인트 필드 존재 스모크 — v11.0-ux 지시서 데이터·API 계약 검사.
#   서버/PC에서 실행. API=온헙 Flask(5001) · RE=부동산 FastAPI(5002, X-RE-KEY) · ETF=엔진(5003).
#   각 페이지가 기대하는 응답 필드가 실제로 오는지 한 줄로 확인한다.
#   프런트는 이 계약대로 소비하므로, 백엔드 배포 후 이 스크립트가 전부 [ ok ] 여야 자동 연결된다.
set -u
API=${API:-http://54.180.54.132:5001}
RE=${RE:-http://54.180.54.132:5002}
ETF=${ETF:-http://54.180.54.132:5003}
fail=0
check() { # $1=url $2=jq필터 $3=라벨 [$4="헤더키:값"]
  local args=(-s --max-time 8)
  [ -n "${4:-}" ] && args+=(-H "$4")
  if curl "${args[@]}" "$1" 2>/dev/null | jq -e "$2" >/dev/null 2>&1; then
    echo "[ ok ] $3"
  else
    echo "[FAIL] $3   ($1)"; fail=1
  fi
}
section() { echo; echo "── $1 ──"; }

section "PHASE 1 · 정합성"
check "$API/api/assets/total" '.breakdown.stock and .breakdown.etf and .breakdown.realty and .breakdown.cash and (.realty_state|test("none|entered"))' "S1.1 /api/assets/total (stock/etf/realty/cash + realty_state)"

section "§3-1 홈"
check "$API/api/home/brief" '(.verdict|type=="string") and (.scope|type=="array") and (.todos|type=="array") and (.pulse|type=="array")' "/api/home/brief (verdict/scope/todos/pulse)"

section "§3-2 AI자산"
check "$API/api/aiasset/diagnosis" '.score.fit and .score.spread and (.top_issue|type=="string") and (.realty_state!=null) and .rebalance.target and .rebalance.reasons' "/api/aiasset/diagnosis (score.fit/spread, top_issue, realty_state, rebalance.target/reasons)"

section "§3-3 추천 / §3-4 보유"
check "$API/api/stock/recommend" '.items[0] | (.target_price!=null) and (.expected_return!=null) and (.reason_short|type=="string")' "/api/stock/recommend (target_price/expected_return/reason_short)"
check "$API/api/stock/holdings" '(.positions[0].ai_stance|type=="string") and (.positions[0].stance_reason|type=="string") and (.blocked[0].unblock_condition|type=="string")' "/api/stock/holdings (ai_stance/stance_reason, blocked.unblock_condition)"

section "§3-5 기록"
check "$API/api/stock/journal/today" '.timeline|type=="array"' "/api/stock/journal/today (timeline[])"
check "$API/api/stock/journal/review" '.reviews[0] | (.verdict|test("맞음|틀림|보류")) and (.actual_change!=null)' "/api/stock/journal/review (reviews.verdict/actual_change)"
check "$API/api/stock/journal/scorecard?period=week" '(.win_rate!=null) or (.scorecard!=null)' "/api/stock/journal/scorecard (win_rate)"
check "$API/api/stock/journal/changelog" '(.changelog|type=="array") or (.items|type=="array")' "/api/stock/journal/changelog"

section "§3-6 ETF (port 5003)"
check "$ETF/api/etf/summary" '.real_krw_return.etf and .real_krw_return.fx and .real_krw_return.cross and (.top_risk!=null)' "/api/etf/summary (real_krw_return.etf/fx/cross, top_risk)"
check "$ETF/api/etf/rebalance" '(.current|type=="array") and (.target|type=="array") and (.reasons|type=="array")' "/api/etf/rebalance (current/target/reasons)"
check "$ETF/api/etf/timeseries?range=M" '(.timeseries|type=="array") and (.forecast|type=="array")' "/api/etf/timeseries (timeseries[] + forecast[])"

section "§3-7 부동산 (port 5002 · X-RE-KEY)"
RH="X-RE-KEY:${RE_ACCESS_KEY:-}"
check "$RE/api/realty/brief" '(.region|type=="string") and (.phase|type=="string") and (.leader|type=="string")' "/api/realty/brief (region/phase/leader:string)" "$RH"
check "$RE/api/realty/feed" '.transactions[0].단지명 or .feed[0].단지명' "/api/realty/feed (transactions/feed[].단지명)" "$RH"
check "$RE/api/realty/onescore" '([.ranking[].단지명]|length>0) and ([.ranking[].rank] == ([.ranking[].rank]|unique))' "/api/realty/onescore (ranking[] · rank 유일)" "$RH"

section "§3-9 운영자"
check "$API/api/ops/traders" '.traders[0] | (.channels.tg!=null) and (.channels.kakao!=null) and (.autonomous!=null)' "/api/ops/traders (channels.tg/kakao, autonomous)"
check "$API/api/ops/usage" '(.month_total!=null) and .kis.quota_pct and (.claude.cost!=null) and (.server.cost!=null)' "/api/ops/usage (month_total, kis.quota_pct, claude.cost, server.cost)"

echo
[ $fail -eq 0 ] && echo "✅ 모든 엔드포인트 계약 통과" || echo "❌ 일부 FAIL — 위 항목 백엔드 확인"
exit $fail
