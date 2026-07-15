# verify_s8.ps1 — S8(신뢰 복구) 스프린트 종료 게이트 (실제 저장소 좌표판)
#   ※ 마스터 문서 §9 verify_master.ps1은 App Router/TypeScript(app/api/*.ts, *.tsx)를 전제하나
#     이 저장소는 Pages Router + JavaScript(.js) + styled-jsx(Tailwind 없음)라 그 경로는 항상 FAIL.
#     아래는 실제 파일 좌표로 교정한 S8 게이트다. 최종 게이트는 `npm run build`(next build --webpack) 클린.
#   사용: powershell -File scripts\verify_s8.ps1

$FAIL = 0
$root = Split-Path -Parent $PSScriptRoot   # = one-hub-content
$pwa = Join-Path $root "pages\pwa"

function Check($name, $cond) {
  if ($cond) { Write-Host "  OK   $name" -ForegroundColor Green }
  else       { Write-Host "  FAIL $name" -ForegroundColor Red; $script:FAIL++ }
}

Write-Host "=== ONE-HUB S8 검증 (신뢰 복구) ===" -ForegroundColor Cyan

# --- CSS 하드코딩 색상 금지 — S8이 만진 파일 기준(전체 게이트는 `bash scripts/check-colors.sh`).
#     ※ 레거시 프로토타입 pages/pwa/pwa_index_new.js 는 다크 목업이라 하드코딩 다수(S8 범위 밖·기존 부채).
$s8Files = @("pages\pwa\index.js", "pages\pwa\realestate.js", "components\shared\AssetForms.js") |
           ForEach-Object { Join-Path $root $_ }
$hard = Select-String -Path $s8Files -Pattern "#[0-9a-fA-F]{3,8}\b" -ErrorAction SilentlyContinue |
        Where-Object { $_.Line -notmatch 'var\(' -and $_.Line -notmatch '#fff{1,5}\b' -and $_.Line -notmatch '#000{1,5}\b' -and $_.Line -notmatch 'rgba|theme-color|favicon' }
Check "S8 파일 CSS 하드코딩 색상 0건" (($hard | Measure-Object).Count -eq 0)

# --- E4: 사용자 노출 'AVM' 원문 0건 (PWA 표면 .js) ---
#   ※ 대문자 'AVM'(사용자 노출 라벨)만 검사. 소문자 식별자 avm_total_uk(백엔드 필드)·scr-avm(CSS 클래스)·
#     myAvm(변수)는 내부 코드라 대상 아님 → -CaseSensitive + \bAVM\b. 코드 주석은 제외.
$avm = Select-String -Path (Join-Path $pwa "*.js") -Pattern '\bAVM\b' -CaseSensitive -ErrorAction SilentlyContinue |
       Where-Object { $_.Line -notmatch '^\s*//' -and $_.Line -notmatch '/\*' }
Check "E4 사용자 노출 AVM 원문 0건" (($avm | Measure-Object).Count -eq 0)

# --- B1: 직접입력 KRW 평단 정수화(Math.round) 적용 ---
$b1 = Select-String -Path (Join-Path $pwa "index.js") -Pattern "h.ccy === 'KRW' \? Math.round\(Number\(h.avgPrice\)\)" -ErrorAction SilentlyContinue
Check "B1 직접입력 KRW 평단 정수 표시" (($b1 | Measure-Object).Count -ge 1)

# --- B4: 매도 확인 라벨이 '실제 매도주문'임을 명시 ---
$b4 = Select-String -Path (Join-Path $pwa "index.js") -Pattern '실제 매도주문 실행' -ErrorAction SilentlyContinue
Check "B4 매도 실주문 명확화 라벨" (($b4 | Measure-Object).Count -ge 1)

# --- 존재성(실제 경로) ---
Check "G1 자산 원장 단일 소스 API"   (Test-Path (Join-Path $root "pages\api\assets\total.js"))
Check "G1 자산 원장 클라이언트 헬퍼"  (Test-Path (Join-Path $root "lib\assetsTotal.js"))
Check "G4 입력검증 단일 소스"         (Test-Path (Join-Path $root "lib\validateAsset.js"))
Check "E4 용어사전 'AI 추정 시세'"    ((Select-String -Path (Join-Path $root "data\glossary.json") -Pattern 'AI 추정 시세' -ErrorAction SilentlyContinue | Measure-Object).Count -ge 1)
Check "F1 소표본 정책 단일 소스"      (Test-Path (Join-Path $root "lib\sampleSize.js"))

Write-Host ""
if ($FAIL -eq 0) { Write-Host "FAIL=0 — S8 정적 게이트 통과 (다음: npm run build)" -ForegroundColor Green; exit 0 }
else             { Write-Host "FAIL=$FAIL — S8 미완료" -ForegroundColor Red; exit 1 }
