#!/usr/bin/env bash
# [S0.2] 하드코딩 색상 검출 — v11 PWA 표면은 디자인 토큰(var(--color-*))만 사용.
#   범위: pages/pwa/ + PWA 공용 컴포넌트. (레거시 비-PWA 페이지는 UX 범위 밖이라 제외)
#   허용 예외: 순수 #fff/#000, rgba() 그림자, <meta theme-color>(브라우저 크롬 · 리터럴 필수), 이모지 favicon.
set -u
ROOTS="pages/pwa components/TopNav.js"
HITS=$(grep -rnE "#[0-9a-fA-F]{3,8}\b" $ROOTS 2>/dev/null \
  | grep -viE "var\(" \
  | grep -viE "#fff(f{3})?\b|#000(0{3})?\b" \
  | grep -viE "theme-color|favicon" \
  || true)
if [ -n "$HITS" ]; then
  echo "❌ 하드코딩 색상 발견 (var(--color-*)로 교체 필요):"
  echo "$HITS"
  exit 1
fi
echo "✅ 색상 하드코딩 0건 — 디자인 토큰만 사용 (범위: $ROOTS)"
