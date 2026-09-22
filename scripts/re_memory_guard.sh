#!/usr/bin/env bash
# re_memory_guard.sh — [2026-09-22] realestate(:5002) 메모리 근본조치의 '격리' 층.
#
# 왜: 2026-09-09 realestate uvicorn 이 1.68GB 까지 부풀어 OOM-kill, 2026-09-22 엔 인스턴스
#     전체가 얼려 4개 서비스가 동시 다운됐다. 코드 캐시 수정(re_server/main.py _load_full_df)이
#     누수 '원인'을 없애지만, 만에 하나 무엇이든 또 새더라도 '한 서비스가 박스 전체를 죽이지
#     못하게' cgroup 메모리 상한으로 격리한다. 초과 시 realestate 만 OOM-kill → Restart=always
#     로 자동 복구, 나머지(engine/etf/news/★매매봇)는 무사.
#
# 사용(Lightsail 브라우저 SSH 콘솔 · 무암호 sudo):
#   ./re_memory_guard.sh          # 조사만(읽기 전용). 현재 메모리·유닛 설정을 본다.
#   ./re_memory_guard.sh --apply  # drop-in 생성 + daemon-reload + realestate 만 재기동
#
# ★매매봇 onehub / onehub-b 는 절대 건드리지 않는다.
set -u
SVC="onehub-realestate"
DROPIN_DIR="/etc/systemd/system/${SVC}.service.d"
DROPIN="${DROPIN_DIR}/50-memory.conf"

# 값: RAM 1910MB 기준. 정상 동작엔 넉넉, 1.68GB 급 폭주는 차단.
MEM_HIGH="1000M"   # 소프트 한계(초과 시 스로틀 시작)
MEM_MAX="1200M"    # 하드 한계(초과 시 이 서비스만 OOM-kill)

echo "==== realestate 메모리 격리 (${1:-조사}) ===="
echo "[현재 메모리]"; free -m | sed -n '1,2p'
echo "[realestate 현재 RSS]"
systemctl show "$SVC" -p MemoryCurrent -p MemoryHigh -p MemoryMax 2>/dev/null
echo "[유닛 ExecStart / 기존 drop-in]"
systemctl cat "$SVC" 2>/dev/null | grep -E "ExecStart|Restart|Memory|Environment" || echo "  (유닛 조회 실패 — SVC 이름 확인: systemctl list-units | grep -i real)"
echo "[최근 OOM 흔적]"
sudo journalctl -k --since "-14d" 2>/dev/null | grep -iE "out of memory|killed process .*(uvicorn|python|realestate)" | tail -5 || echo "  (없음/조회불가)"

if [ "${1:-}" != "--apply" ]; then
  echo
  echo ">> 조사만 했습니다. 값 확인 후  ./re_memory_guard.sh --apply  로 적용하세요."
  echo "   적용 예정: MemoryHigh=${MEM_HIGH}  MemoryMax=${MEM_MAX}  MALLOC_ARENA_MAX=2"
  exit 0
fi

echo
echo ">> 적용: ${DROPIN}"
sudo mkdir -p "$DROPIN_DIR"
[ -f "$DROPIN" ] && sudo cp -a "$DROPIN" "${DROPIN}.bak.$(date +%Y%m%d%H%M%S)"
sudo tee "$DROPIN" >/dev/null <<EOF
[Service]
# [2026-09-22 re 메모리 근본조치] 새더라도 인스턴스 전체를 얼리지 않게 격리.
MemoryHigh=${MEM_HIGH}
MemoryMax=${MEM_MAX}
# glibc arena 파편화↓ → 해제한 메모리를 OS 로 더 잘 반환(파이썬/pandas RSS 누적 완화)
Environment=MALLOC_ARENA_MAX=2
EOF

sudo systemctl daemon-reload
echo ">> ${SVC} 만 재기동(★매매봇 미접촉)"
sudo systemctl restart "$SVC"
sleep 4
echo "[적용 후]"
systemctl show "$SVC" -p MemoryHigh -p MemoryMax -p MemoryCurrent -p ActiveState -p SubState 2>/dev/null
echo "[포트 5002 응답]"
curl -s -o /dev/null -m 6 -w "  HTTP:%{http_code}\n" "http://127.0.0.1:5002/" || echo "  (down — 로그 확인: sudo journalctl -u ${SVC} -n 40 --no-pager)"
echo
echo ">> 완료. 되돌리려면: sudo rm ${DROPIN} && sudo systemctl daemon-reload && sudo systemctl restart ${SVC}"
