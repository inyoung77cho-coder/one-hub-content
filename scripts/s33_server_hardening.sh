#!/usr/bin/env bash
# ============================================================================
# S33 HC — 서버 복원력 하드닝 (Lightsail 54.180.54.132 에서 ★직접 실행)
#   이 스크립트는 로컬/CI 가 아니라 서버 안에서 ubuntu 계정으로 돌린다.
#   (SSH 22 가 막혀 있어 원격 적용 대신 스크립트를 scp/콘솔로 올려 사람이 실행한다.)
#
# 근거: docs/S33_긴급_작업지시서.md 배치 HC · 원인=OOM(realestate uvicorn 1.68GB, RAM 1910MB)
#
#   조사 → 승인 → 적용 순서를 강제한다:
#     ./s33_server_hardening.sh            # S33-7 조사만(읽기 전용). 아무것도 안 바꿈.
#     ./s33_server_hardening.sh --apply    # S33-8(감시봇)·S33-9(systemd)·S33-10(조건부 스왑)
#     ./s33_server_hardening.sh --test     # etf SIGKILL → 자동 복구 확인
#
# ★불변 원칙:
#   · 매매봇 onehub / onehub-b 는 절대 건드리지 않는다(주문 중복 위험).
#   · 파일을 고치기 전 반드시 .bak 을 남긴다. 재실행해도 안전(멱등).
#   · 추측으로 서버 설정을 바꾸지 않는다 — 조사 결과를 먼저 보고 --apply.
# ============================================================================
set -uo pipefail

MODE="${1:-}"
SELF="$(basename "$0")"

# 자동 재기동 대상(비매매만). ★매매봇 제외.
NONTRADING_ALWAYS=(onehub-api onehub-realestate onehub-news)  # Restart=always + RestartSec=5
ALREADY_ALWAYS=(onehub-etf ca-bot)                            # 이미 always → RestartSec 만
TRADING_BOTS=(onehub onehub-b)                                # ★손대지 않음(참조용)
ALL_SERVICES=(onehub onehub-b onehub-api onehub-realestate onehub-etf ca-bot onehub-news)

G7=/home/ubuntu/G7_healthcheck.sh
TS="$(date +%s)"

c_ok()  { printf '  \033[32m✓\033[0m %s\n' "$*"; }
c_warn(){ printf '  \033[33m⚠\033[0m %s\n' "$*"; }
c_hd()  { printf '\n\033[1m== %s ==\033[0m\n' "$*"; }

need_sudo() {
  if ! sudo -n true 2>/dev/null; then
    c_warn "무암호 sudo 불가 — 이 스크립트는 sudo 권한이 필요합니다. 'sudo -v' 후 다시 실행하세요."
    return 1
  fi
  return 0
}

# ---------------------------------------------------------------------------
# S33-7 · 원인 조사 (읽기 전용 — 아무것도 바꾸지 않음)
# ---------------------------------------------------------------------------
investigate() {
  c_hd "S33-7 조사 (읽기 전용)"
  echo "[uptime]";  uptime
  echo; echo "[free -m]"; free -m
  echo; echo "[df -h /]"; df -h /
  echo; echo "[swap]"; swapon --show || echo "  (스왑 없음)"
  echo; echo "[서비스 상태]"
  for s in "${ALL_SERVICES[@]}"; do printf "  %-20s %s\n" "$s" "$(systemctl is-active "$s" 2>/dev/null || echo unknown)"; done
  echo; echo "[자동 재기동 설정]"
  for s in "${ALL_SERVICES[@]}"; do
    printf "  %-20s Restart=%s RestartSec=%s\n" "$s" \
      "$(systemctl show -p Restart --value "$s" 2>/dev/null)" \
      "$(systemctl show -p RestartUSec --value "$s" 2>/dev/null)"
  done
  echo; echo "[OOM 흔적(최근 7일)]"
  sudo -n journalctl --since "7 days ago" 2>/dev/null | grep -iE "out of memory|oom-kill|killed process" | tail -20
  echo "  (oom grep 끝)"
  echo; echo "[감시 봇]"
  [ -f "$G7" ] && echo "  $G7 존재" || echo "  ⚠ $G7 없음"
  crontab -l 2>/dev/null | grep -iE "healthcheck|watch|monitor" | sed 's/^/  cron: /'
}

# ---------------------------------------------------------------------------
# S33-8 · 감시 봇 수정(KST·복구알림·상태전이 발송·원인로그) — 수정본 전체를 안전하게 교체
# ---------------------------------------------------------------------------
apply_watchdog() {
  c_hd "S33-8 감시 봇 수정"
  if [ -f "$G7" ] && grep -q "TZ=Asia/Seoul" "$G7" && grep -q "g7_state" "$G7"; then
    c_ok "이미 S33-8 반영됨(TZ=Asia/Seoul·g7_state) — 건너뜀"
    return 0
  fi
  [ -f "$G7" ] && { cp "$G7" "${G7}.bak.${TS}"; c_ok "원본 백업: ${G7}.bak.${TS}"; }
  cat > "$G7" <<'G7EOF'
#!/usr/bin/env bash
# G7_healthcheck.sh — 항목7 서버 헬스체크 + 텔레그램 알림 (서버에서 실행)
#   --watch : 서비스/포트 점검 → 상태 전이일 때만 🔴/🟢 (정상 유지면 침묵). 크론 5~10분.
#   --daily : 매일 1회 요약. 침묵도 신호가 되게.
# 설정: /home/ubuntu/g7_notify.conf 에 TG_TOKEN= / TG_CHAT= 두 줄.
MODE="${1:---watch}"
export TZ=Asia/Seoul   # [S33-8] 메시지 시각 KST(전엔 UTC 라 9h 어긋남)
STATE=/home/ubuntu/g7_state   # [S33-8] 직전 상태(상태 전이일 때만 발송)
CONF=/home/ubuntu/g7_notify.conf
[ -f "$CONF" ] && . "$CONF"
TG_TOKEN="${TG_TOKEN:-${TELEGRAM_BOT_TOKEN:-}}"
TG_CHAT="${TG_CHAT:-${CHAT_ID:-}}"

send() {
  if [ -z "$TG_TOKEN" ] || [ -z "$TG_CHAT" ]; then
    echo "[경고] TG_TOKEN/TG_CHAT 미설정 — 전송 생략. 내용:"; echo "$1"; return
  fi
  curl -s -m 15 "https://api.telegram.org/bot${TG_TOKEN}/sendMessage" \
    --data-urlencode "chat_id=${TG_CHAT}" \
    --data-urlencode "text=$1" \
    -d disable_web_page_preview=true >/dev/null
}

SERVICES=(onehub onehub-b onehub-api onehub-realestate onehub-etf ca-bot onehub-news)
svc_state() { systemctl is-active "$1" 2>/dev/null || echo unknown; }
port_up() { local c; c=$(curl -s -o /dev/null -m 5 -w "%{http_code}" "http://127.0.0.1:$1/" 2>/dev/null); [ -n "$c" ] && [ "$c" != "000" ]; }

check_down() {
  local down=""
  port_up 5001 || down="$down engine(:5001)"
  port_up 5002 || down="$down realestate(:5002)"
  port_up 5003 || down="$down etf(:5003)"
  port_up 5004 || down="$down news(:5004)"
  for s in "${SERVICES[@]}"; do
    st=$(svc_state "$s")
    [ "$st" = failed ] || [ "$st" = inactive ] && down="$down svc:${s}=${st}"
  done
  echo "$down" | sed 's/^ *//'
}

# [S33-8] down 토큰 → 유닛명. ★매매봇(onehub/onehub-b) 제외(자동 재기동 안 함).
tok_to_svc() {
  case "$1" in
    engine*) echo onehub-api;; realestate*) echo onehub-realestate;;
    etf*) echo onehub-etf;; news*) echo onehub-news;;
    svc:*) local s="${1#svc:}"; echo "${s%%=*}";;
    *) echo "";;
  esac
}

if [ "$MODE" = "--watch" ]; then
  DOWN="$(check_down)"
  PREV=""; DOWN_TS=""
  [ -f "$STATE" ] && { PREV=$(sed -n 1p "$STATE"); DOWN_TS=$(sed -n 2p "$STATE"); }
  NOW=$(date +%s)
  # [S33-8] ★상태 전이일 때만 발송(같은 상태 반복 발송 금지)
  if [ "$DOWN" != "$PREV" ]; then
    if [ -n "$DOWN" ]; then
      SVCS=$(for t in $DOWN; do s=$(tok_to_svc "$t"); [ -n "$s" ] && echo "$s"; done | grep -vE '^(onehub|onehub-b)$' | sort -u)
      LOGS=""
      for svc in $SVCS; do
        # [S33-9b] 1회만 재기동 시도(반복 루프 아님 — 상태 전이일 때만 진입)
        if sudo -n systemctl restart "$svc" 2>/dev/null; then RES="재기동 시도 OK"; else RES="재기동 실패"; fi
        L=$(sudo -n journalctl -u "$svc" -n 3 --no-pager 2>/dev/null | tail -3)
        LOGS="${LOGS}
[$svc] ${RES}
${L}"
      done
      send "🔴 ONE-HUB · $(date '+%m-%d %H:%M') KST
죽은 축:${DOWN}
자동 재기동(1회) 시도함
최근 로그:${LOGS}
→ 확인 필요"
      [ -z "$DOWN_TS" ] && DOWN_TS=$NOW
      printf "%s\n%s\n" "$DOWN" "$DOWN_TS" > "$STATE"
    else
      DUR="?"; [ -n "$DOWN_TS" ] && DUR=$(( (NOW - DOWN_TS) / 60 ))
      send "🟢 ONE-HUB 복구 · $(date '+%m-%d %H:%M') KST
직전 다운:${PREV}
다운 지속 약 ${DUR}분"
      : > "$STATE"
    fi
  fi
  exit 0
fi

# ---- --daily ----
DOWN="$(check_down)"
ICON="🟢"; TXT="정상"
[ -n "$DOWN" ] && { ICON="🟠"; TXT="이상:${DOWN}"; }
svcline=""
for s in "${SERVICES[@]}"; do svcline="${svcline}${s}=$(svc_state "$s") "; done
BK=$(ls -1dt /home/ubuntu/_backups/*/ 2>/dev/null | head -1)
if [ -n "$BK" ]; then
  age_h=$(( ( $(date +%s) - $(stat -c %Y "$BK") ) / 3600 ))
  bkline="최근 ${age_h}h 전"; [ "$age_h" -gt 30 ] && bkline="⚠️ ${bkline}(26h 초과)"
else bkline="⚠️ 백업 없음"; fi
DB=/home/ubuntu/one-hub/real_estate/data/apartment.db
friends="n/a"
if command -v sqlite3 >/dev/null 2>&1 && [ -f "$DB" ]; then
  cnt=$(sqlite3 "$DB" "SELECT COUNT(DISTINCT trader_id) FROM wishlist WHERE trader_id LIKE 'u%';" 2>/dev/null)
  [ -n "$cnt" ] && friends="관심단지 남긴 지인 ${cnt}명(누적)"
fi
VER=$(curl -s -m 5 "http://127.0.0.1:5001/api/version" 2>/dev/null | grep -oE '"app_version"[^,}]*' | head -1)
[ -z "$VER" ] && VER="버전 확인불가"
send "${ICON} ONE-HUB ${TXT} · $(date '+%Y-%m-%d')
· 서비스: ${svcline}
· 포트: 5001/5002/5003/5004 $( [ -z "$DOWN" ] && echo 정상 || echo 일부이상 )
· 백업: ${bkline}
· 지인: ${friends}
· ${VER}
(매일 이 메시지가 안 오면 = 뭔가 이상)"
G7EOF
  chmod +x "$G7"
  if bash -n "$G7"; then c_ok "감시 봇 수정 완료·문법 OK: $G7"; else c_warn "감시 봇 문법 오류 — 백업本으로 되돌리세요: ${G7}.bak.${TS}"; return 1; fi
}

# ---------------------------------------------------------------------------
# S33-9 · systemd 자동 재기동 (drop-in · 원본 유닛 미변경 · ★매매봇 제외)
# ---------------------------------------------------------------------------
apply_systemd() {
  c_hd "S33-9 systemd 자동 재기동"
  local changed=0
  for svc in "${NONTRADING_ALWAYS[@]}"; do
    local d="/etc/systemd/system/${svc}.service.d"
    sudo -n mkdir -p "$d"
    printf '[Service]\nRestart=always\nRestartSec=5\n' | sudo -n tee "$d/override.conf" >/dev/null
    c_ok "$svc → Restart=always + RestartSec=5"; changed=1
  done
  for svc in "${ALREADY_ALWAYS[@]}"; do
    local d="/etc/systemd/system/${svc}.service.d"
    sudo -n mkdir -p "$d"
    printf '[Service]\nRestartSec=5\n' | sudo -n tee "$d/override.conf" >/dev/null
    c_ok "$svc → RestartSec=5 (이미 always)"; changed=1
  done
  c_warn "매매봇은 손대지 않음: ${TRADING_BOTS[*]} (주문 중복 위험)"
  if [ "$changed" = 1 ]; then
    sudo -n systemctl daemon-reload && c_ok "daemon-reload"
  fi
  echo "[반영 확인]"
  for s in "${NONTRADING_ALWAYS[@]}" "${ALREADY_ALWAYS[@]}" "${TRADING_BOTS[@]}"; do
    printf "  %-20s Restart=%s RestartSec=%s\n" "$s" \
      "$(systemctl show -p Restart --value "$s")" "$(systemctl show -p RestartUSec --value "$s")"
  done
}

# ---------------------------------------------------------------------------
# S33-10 · 메모리 조치 — ★OOM 확인 & 스왑 없을 때만. 있으면 건너뜀(현 서버는 스왑 2GB 존재).
# ---------------------------------------------------------------------------
apply_swap() {
  c_hd "S33-10 메모리 조치(조건부)"
  if swapon --show | grep -q .; then
    c_ok "스왑 이미 존재 → 추가 불필요"; swapon --show
    c_warn "근본 원인(realestate 메모리 증가)은 별도 조사 권장 — 스왑으로는 안 풀림"
    return 0
  fi
  local oom=""; oom=$(sudo -n journalctl --since "14 days ago" 2>/dev/null | grep -ic "oom-kill")
  if [ "${oom:-0}" -lt 1 ]; then
    c_ok "OOM 흔적 없음 → 스왑 추가 안 함(S33-10 건너뜀)"
    return 0
  fi
  c_warn "OOM 확인 + 스왑 없음 → 스왑 2G 생성. /etc/fstab 수정(부팅 영향) 전 백업."
  sudo -n cp /etc/fstab "/etc/fstab.bak.${TS}" && c_ok "fstab 백업: /etc/fstab.bak.${TS}"
  sudo -n fallocate -l 2G /swapfile && sudo -n chmod 600 /swapfile
  sudo -n mkswap /swapfile && sudo -n swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo -n tee -a /etc/fstab >/dev/null
  c_ok "스왑 2G 생성 완료"; free -m
}

# ---------------------------------------------------------------------------
# 검증 · etf SIGKILL → 자동 복구 (죽어도 영향 가장 작은 etf 로 시험)
# ---------------------------------------------------------------------------
run_test() {
  c_hd "검증: onehub-etf SIGKILL → 자동 복구"
  echo "kill 전: $(systemctl is-active onehub-etf) (pid $(systemctl show -p MainPID --value onehub-etf))"
  sudo -n systemctl kill -s SIGKILL onehub-etf
  echo "kill 직후: $(systemctl is-active onehub-etf)"
  sleep 10
  local st; st=$(systemctl is-active onehub-etf)
  echo "10초 후: $st (pid $(systemctl show -p MainPID --value onehub-etf)) · NRestarts=$(systemctl show -p NRestarts --value onehub-etf)"
  echo "포트 5003: $(curl -s -o /dev/null -m 5 -w '%{http_code}' http://127.0.0.1:5003/ 2>/dev/null)"
  [ "$st" = active ] && c_ok "자동 복구 PASS" || c_warn "복구 실패 — override.conf / daemon-reload 확인"
}

usage() {
  cat <<USAGE
S33 HC 서버 하드닝 — 서버(ubuntu)에서 실행
  $SELF               S33-7 조사만(읽기 전용)
  $SELF --apply       S33-8·S33-9 적용 + S33-10(조건부)
  $SELF --test        etf SIGKILL 복구 테스트
USAGE
}

case "$MODE" in
  ""|--investigate)
    investigate
    echo; c_warn "조사 결과를 확인한 뒤 적용하세요:  $SELF --apply"
    ;;
  --apply)
    need_sudo || exit 1
    investigate
    apply_watchdog || exit 1
    apply_systemd
    apply_swap
    echo; c_ok "적용 완료. 검증:  $SELF --test"
    ;;
  --test)
    need_sudo || exit 1
    run_test
    ;;
  *)
    usage; exit 1
    ;;
esac
