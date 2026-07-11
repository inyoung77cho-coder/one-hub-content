#!/usr/bin/env bash
# [S0.2] ONE-HUB 서비스/포트/DB 헬스 — 서버(AWS)에서 실행.
#   프런트 개발 환경에서는 백엔드(5001/5002/5003)에 도달할 수 없으므로 서버에서만 유효.
set -u
echo "== 포트 헬스 =="
for p in 5001 5002 5003; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "localhost:$p/health" 2>/dev/null || echo "000")
  echo "  $p: $code"
done
echo "== 서비스 상태 =="
systemctl is-active onehub onehub-b onehub-api onehub-realestate 2>/dev/null || \
  echo "  (systemctl 미가용 — 서버에서 실행하세요)"
