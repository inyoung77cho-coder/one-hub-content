#!/bin/bash
# [S16-N1] 자산 원장 단일화 — 합격선: 덧셈이 한 곳에서만 일어난다.
#   원 지적: ETF 이중합산 5.15→10.34 · 직접입력 주식 2.13억 누락 · 부동산 소스 불일치
cd "$(dirname "$0")/.." || exit 2
F=0
chk(){ if [ "$2" -eq 0 ]; then echo "  OK   $1"; else echo "  FAIL $1"; F=$((F+1)); fi; }

echo "── N1 자산 원장 단일화 ──"
[ -f lib/ledger.js ]; chk "lib/ledger.js 단일 원장 존재" $?

# 덧셈은 total 계산 1곳뿐이어야 한다(재합산 = 3종 총자산의 원인)
R=$(grep -c "reduce" lib/ledger.js); [ "$R" -le 1 ]; chk "원장 내 reduce 합산 1곳 이하 (실측 $R)" $?

# 과거 4벌 머지 구현의 잔재가 없어야 한다
! grep -rq "mergeOnboardAssets" pages/ components/ lib/ --include=*.js; chk "mergeOnboardAssets 잔재 0" $?

# ETF 는 '더하기'가 아니라 '대체'다(onb.etf_uk 는 완전 미러 → 더하면 항상 이중계상)
grep -q "fetchLiveEtfKrw" lib/ledger.js; chk "ETF 라이브 대체 경로" $?
! grep -q "onehub_onboard_assets" pages/pwa/etf.js; chk "etf.js 온보딩 미러 쓰기 제거" $?
# ★ 금지 대상은 '미러' 쓰기(stock·etf)뿐이다.
#   onb.realestate_uk / onb.cash_uk 는 미러가 아니라 그 자산군의 유일한 입력 경로이고
#   원장이 sources=onboard 폴백으로 읽는다 → 지우면 부동산·현금 입력이 통째로 깨진다.
! grep -qE "onb\.(etf|stock)_uk\s*=" components/shared/AssetForms.js; chk "AssetForms 미러 쓰기(stock·etf) 제거" $?
grep -qE "onb\.realestate_uk\s*=" components/shared/AssetForms.js; chk "부동산 입력 경로 보존(지우면 안 됨)" $?

# 소비자는 자체 합산하지 않고 원장만 읽는다
for f in pages/pwa/assets.js pages/pwa/today.js components/AssetSummaryBar.js components/shared/QuickAddSheet.js; do
  grep -q "getLedger" "$f"; chk "$(basename $f) 원장 사용" $?
done
grep -q "getLedger as getAssetLedger" pages/pwa/index.js; chk "index.js 원장 사용(별칭 — verdictLedger 이름충돌 회피)" $?

# 저장소를 늘리지 않았다(N1 의 정반대 행위)
NEW=$(grep -rhoE "onehub_(ledger|assets_cache|total)[a-z_]*" pages/ components/ lib/ --include=*.js | sort -u | wc -l)
[ "$NEW" -eq 0 ]; chk "새 자산 localStorage 키 0 (실측 $NEW)" $?

# ★ 백엔드 원장이 죽으면 KIS 보유가 통째로 빠져 총자산이 조용히 수억 줄어든다(실측: Upstream 404).
#   숫자를 보여주는 곳이면 어디서든 '불완전'을 함께 말해야 한다.
grep -q "BACKEND_UNAVAILABLE" lib/ledger.js; chk "백엔드 부재 경고 생성" $?
grep -q "BACKEND_UNAVAILABLE" pages/pwa/assets.js; chk "자산 지도: 총자산 옆 불완전 고지" $?
grep -q "BACKEND_UNAVAILABLE" pages/pwa/today.js; chk "오늘 탭: 총자산 옆 불완전 고지" $?
grep -q "BACKEND_UNAVAILABLE" components/AssetSummaryBar.js; chk "요약 바: 불완전 표식" $?

echo "  → N1 FAIL=$F"
exit $F
