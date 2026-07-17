# ONE-HUB auto_trade 배포 게이트 (S17-0 Part3 W3-8)
#   오늘부터 auto_trade/ 는 이 스크립트로만 배포한다. 손 SCP 금지.
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

# ── 게이트 4: 장중 차단 ───────────────────────────────────
$kst = (Get-Date).ToUniversalTime().AddHours(9)
$isWeekday = $kst.DayOfWeek -notin 'Saturday', 'Sunday'
$hm = [int]$kst.ToString("HHmm")
if ($isWeekday -and $hm -ge 900 -and $hm -le 1530) {
  if ($MarketClosed) {
    # 가드는 요일·시각만 안다 — 공휴일 휴장을 모른다. 사람 확인 시에만 우회하고 교차검증한다.
    $t = ssh -i $KEY $SRV "sqlite3 /home/ubuntu/trading.db `"SELECT COUNT(*) FROM trades WHERE date(date)=date('now','+9 hours');`""
    if ([int]$t -gt 0) { Write-Host "[중단] 오늘 체결 $t 건 → 휴장이 아님"; exit 1 }
    Write-Host "  우회: 휴장일 확인됨(-MarketClosed) · 오늘 체결 0건 교차검증 OK"
  } else {
    Write-Host "[중단] 장중 배포 금지 ($($kst.ToString('HH:mm')) KST). 휴장일이면 -MarketClosed"; exit 1
  }
} else { Write-Host "OK   장 마감 후 ($($kst.ToString('HH:mm')) KST)" }

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
  systemctl is-active --quiet \$S || { echo "[실패] \$S inactive — 롤백"; cp -p $fn.bak_$D $fn; sudo systemctl restart onehub onehub-b onehub-api; exit 1; }
done
echo '  서비스 3종 active'
curl -s http://localhost:5001/api/version | head -c 120
"@
ssh -i $KEY $SRV $restart
if ($LASTEXITCODE -ne 0) { Write-Host "[중단] 배포 후 검증 실패 — 서버에서 롤백됨"; exit 1 }

Write-Host ""
Write-Host "배포 완료: $fn"
Write-Host "롤백: ssh -i $KEY $SRV `"cd $DST; cp -p $fn.bak_$D $fn; sudo systemctl restart onehub onehub-b onehub-api`""
