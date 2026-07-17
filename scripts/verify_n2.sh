#!/bin/bash
# [S16-N2] IA 통합 — 원 지적: 상단 5탭 + 하단 4탭 공존 · 종합자산 2개(34.29 vs 39.43)
cd "$(dirname "$0")/.." || exit 2
F=0
chk(){ if [ "$2" -eq 0 ]; then echo "  OK   $1"; else echo "  FAIL $1"; F=$((F+1)); fi; }

echo "── N2 IA 통합 ──"
[ -f pages/pwa/assets.js ]; chk "종합자산 단일 착지(/pwa/assets)" $?
[ -f components/BottomNav.js ]; chk "하단 4탭 내비" $?
grep -q "router.replace('/pwa/assets')" pages/pwa/index.js; chk "구 dashboard → /pwa/assets 리다이렉트" $?
# 리다이렉트는 반드시 isReady 가드 안에 있어야 한다(없으면 ?tab= 딥링크가 튕긴다 — 실제로 냈던 회귀)
grep -q "router.isReady" pages/pwa/index.js; chk "isReady 가드(딥링크 튕김 회귀 방지) ★" $?
[ ! -f components/shared/TraderSwitcher.js ]; chk "TraderSwitcher 제거(트레이더 전환 중복 진입점)" $?
[ -f components/shared/TraderBadge.js ]; chk "TraderBadge 대체" $?

# ★ 원 지적의 핵심: "상단 5탭 + 하단 4탭 공존". 한 화면에 내비가 둘이면 그게 지적 그대로다.
#   (TopNav 자체는 하단탭이 없는 페이지의 유일한 내비라 남겨둔다 — 공존만 금지)
CO=0
for f in pages/pwa/*.js; do
  case "$f" in *.bak*) continue;; esac
  if grep -q "<TopNav" "$f" && grep -q "<BottomNav" "$f"; then echo "     공존: $f"; CO=$((CO+1)); fi
done
[ "$CO" -eq 0 ]; chk "상단5탭·하단4탭 공존 0 (실측 $CO) ★" $?

echo "  → N2 FAIL=$F"
exit $F
