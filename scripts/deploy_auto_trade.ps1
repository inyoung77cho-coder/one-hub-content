# ONE-HUB auto_trade 배포 게이트 (S17-0 Part3 W3-8)
#   오늘부터 auto_trade/ 는 이 스크립트로만 배포한다. 손 SCP 금지.
#   ★ 정본은 이 파일(one-hub-content/scripts/)이다. git 이 관리하므로 사라지지 않는다.
#     C:\onehub\ 사본은 두지 않는다 — 2026-07-17 에 원인 불명으로 유실됐다.
#   사람이 scp 를 직접 치는 한 같은 사고는 재발한다.
#
#   지시서 원안에서 교정한 좌표:
#     - 키: onehub-key.pem → one-hub-key.pem (실측)
#     - 서비스: onehub-stock(부재) → onehub / onehub-b / onehub-api
#     - APP_VERSION: main.py 가 아니라 version.py 가 단일 소스(v10.0.0-ops)
#     - 버전 비교: [version] 캐스팅은 "v10.0.0-ops" 를 파싱 못 함 → 접미사 제거 후 비교
param(
  [Parameter(Mandatory=$true)][string]$File,
  [switch]$Force,
  [switch]$MarketClosed   # 공휴일 휴장 시 장중 가드 우회(사람이 확인했을 때만)
)

$KEY = "C:\onehub\one-hub-key.pem"
$SRV = "ubuntu@54.180.54.132"
$DST = "/home/ubuntu/one-hub/auto_trade"
$fn  = Split-Path $File -Leaf

Write-Host "=== ONE-HUB 배포 게이트 : $fn ==="

# ── 게이트 1: 로컬 파일 존재 ──────────────────────────────
if (-not (Test-Path $File)) { Write-Host "[중단] 파일 없음: $File"; exit 1 }

# ── 게이트 2: 문법 ────────────────────────────────────────
python -m py_compile $File
if ($LASTEXITCODE -ne 0) { Write-Host "[중단] 문법 오류"; exit 1 }
Write-Host "OK   문법"

# ── 게이트 3: 버전 후퇴 차단 (이번 사고의 직접 방지책) ────
#   version.py 를 올릴 때만 의미가 있다. 다른 파일이면 건너뛴다.
if ($fn -eq "version.py") {
  $m = Select-String -Path $File -Pattern 'APP_VERSION\s*=\s*["'']([^"'']+)'
  $localV = if ($m) { $m.Matches[0].Groups[1].Value } else { $null }
  $remoteV = ssh -i $KEY $SRV "grep -ho 'APP_VERSION *= *\`"[^\`"]*\`"' $DST/version.py | head -1 | sed 's/.*= *//' | tr -d '\`"'"
  Write-Host "  로컬: $localV / 서버: $remoteV"
  if ($localV -and $remoteV) {
    # "v10.0.0-ops" → "10.0.0" 로 정규화해 비교
    $lv = [version](($localV -replace '[^0-9.]', '') -replace '\.+$', '')
    $rv = [version](($remoteV -replace '[^0-9.]', '') -replace '\.+$', '')
    if ($lv -lt $rv) {
      Write-Host "[중단] 버전 후퇴 감지 ($remoteV -> $localV)"
      Write-Host "       의도한 롤백이면 -Force 로 재실행하십시오."
      if (-not $Force) { exit 1 }
      Write-Host "  -Force 지정됨 — 후퇴를 알고도 진행합니다"
    } else { Write-Host "OK   버전 후퇴 없음" }
  }
}

# ── 게이트 4: 장중 차단 — market_calendar 가 판정한다 (S18 D-4 #22) ──
#   시각을 하드코딩하지 않는다. 캘린더가 공휴일·수능일(10:00~16:30)·연초 개장일(10:00)·
#   애프터마켓 시행까지 자동으로 따라간다. 이전 판은 요일+09:00~15:30 하드코딩이라
#   공휴일을 장중으로 오판했고 -MarketClosed 우회가 필요했다.
#   fail-safe: 캘린더 판정 실패 시 개장으로 간주해 배포를 막는다.
#   (휴장일에 배포 못 하는 건 불편할 뿐이지만, 장중 배포는 실매매를 건드린다)
$kst = (Get-Date).ToUniversalTime().AddHours(9)
# 판정은 서버의 market_status.py 가 한다 — ssh 인라인 python 은 따옴표가 깨진다(실측).
$status = (ssh -i $KEY $SRV "cd $DST; ./venv/bin/python3 market_status.py KRX 2>/dev/null" | Select-Object -Last 1)
if (-not $status -or $status -eq "error") { $status = "open"; Write-Host "  경고: 캘린더 판정 실패 -> 개장으로 간주(fail-safe)" }
Write-Host "  캘린더 판정: $status ($($kst.ToString('HH:mm')) KST)"
if ($status -eq "open") {
  if ($MarketClosed) {
    # 캘린더는 개장이라는데 사람이 휴장이라 한다 -> 캘린더가 틀렸을 수 있다. 체결로 교차검증.
    $t = ssh -i $KEY $SRV "sqlite3 /home/ubuntu/trading.db `"SELECT COUNT(*) FROM trades WHERE date(date)=date('now','+9 hours');`""
    if ([int]$t -gt 0) { Write-Host "[중단] 오늘 체결 $t 건 -> 휴장이 아님"; exit 1 }
    Write-Host "  우회: -MarketClosed + 오늘 체결 0건 교차검증 OK (캘린더 갱신 필요할 수 있음)"
  } else {
    Write-Host "[중단] 장중 배포 금지. 휴장일이면 -MarketClosed"; exit 1
  }
} else { Write-Host "OK   장중 아님 ($status)" }

# ── 게이트 5: 배포 전 git 커밋 (현재 상태 고정) ───────────
ssh -i $KEY $SRV "cd $DST ; git add -A ; git commit -q -m 'pre-deploy snapshot' --allow-empty"
Write-Host "OK   배포 전 git 스냅샷"

# ── 게이트 6: .bak 백업 ───────────────────────────────────
$D = Get-Date -Format "yyyyMMdd_HHmmss"
ssh -i $KEY $SRV "cp -p $DST/$fn $DST/$fn.bak_$D 2>/dev/null; echo '  bak: $fn.bak_$D'"

# ── 배포 ──────────────────────────────────────────────────
scp -i $KEY $File "${SRV}:$DST/"
if ($LASTEXITCODE -ne 0) { Write-Host "[중단] SCP 실패"; exit 1 }
Write-Host "OK   업로드"

# ── 게이트 7: 원격 문법 → 재시작 → 검증 (실패 시 롤백) ────
$restart = @"
cd $DST
./venv/bin/python3 -m py_compile *.py || { echo '[중단] 원격 문법 오류 — 롤백'; cp -p $fn.bak_$D $fn; exit 1; }
git add -A ; git commit -q -m 'deploy $fn $D'
sudo systemctl restart onehub onehub-b onehub-api
sleep 6
for S in onehub onehub-b onehub-api; do
  systemctl is-active --quiet `$S || { echo "[실패] `$S inactive — 롤백"; cp -p $fn.bak_$D $fn; sudo systemctl restart onehub onehub-b onehub-api; exit 1; }
done
echo '  서비스 3종 active'
curl -s http://localhost:5001/api/version | head -c 120
"@
ssh -i $KEY $SRV $restart
if ($LASTEXITCODE -ne 0) { Write-Host "[중단] 배포 후 검증 실패 — 서버에서 롤백됨"; exit 1 }

Write-Host ""
Write-Host "배포 완료: $fn"
Write-Host "롤백: ssh -i $KEY $SRV `"cd $DST; cp -p $fn.bak_$D $fn; sudo systemctl restart onehub onehub-b onehub-api`""
