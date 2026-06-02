[CmdletBinding()]
param(
  [string]$PromoteFile = "docs/unified/reports/desk-win-delivery-promote-latest.json",
  [string]$OutFile = "docs/unified/reports/desk-win-latest-package-verify-latest.json",
  [int]$WaitSeconds = 15,
  [int]$PostReadyQuietSeconds = 60
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$fullPromoteFile = Join-Path $repoRoot $PromoteFile
$fullOutFile = Join-Path $repoRoot $OutFile
$runtimeLog = Join-Path $env:LOCALAPPDATA "LandslideDesk.Win\runtime.log"

function Wait-ForDeskReady {
  param(
    [string]$LogPath,
    [int]$Seconds
  )

  for ($i = 0; $i -lt $Seconds; $i++) {
    if (Test-Path $LogPath) {
      $content = Get-Content -Path $LogPath -Raw -ErrorAction SilentlyContinue
      if ($content -match "App ready handshake received") {
        return $true
      }
    }
    Start-Sleep -Seconds 1
  }

  return $false
}

function Get-DeskRuntimeErrorInfo {
  param(
    [string]$LogPath
  )

  if (-not (Test-Path $LogPath)) {
    return [pscustomobject]@{
      count = 0
      sample = @()
    }
  }

  $content = Get-Content -Path $LogPath -Raw -ErrorAction SilentlyContinue
  $count = if ([string]::IsNullOrWhiteSpace($content)) { 0 } else { ([regex]::Matches($content, "Frontend runtime error:")).Count }
  $sample = @(
    Get-Content -Path $LogPath -ErrorAction SilentlyContinue |
      Where-Object { $_ -match "Frontend runtime error:" } |
      Select-Object -Last 5
  )

  return [pscustomobject]@{
    count = $count
    sample = $sample
  }
}

if (-not (Test-Path $fullPromoteFile)) {
  throw "desk-win latest promote report not found: $PromoteFile"
}

$promote = Get-Content -Path $fullPromoteFile -Raw -Encoding UTF8 | ConvertFrom-Json
$latestDir = [string]$promote.promotedDir
$exePath = Join-Path $latestDir "package\LandslideDesk.Win.exe"
$webIndex = Join-Path $latestDir "package\web\index.html"

foreach ($path in @($exePath, $webIndex)) {
  if (-not (Test-Path $path)) {
    throw "required latest package file not found: $path"
  }
}

$existing = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
  $_.Name -eq "LandslideDesk.Win.exe" -and $_.ExecutablePath -eq $exePath
})
if ($existing.Count -gt 0) {
  throw "latest package verify requires no running latest desk-win instance; currently running pids: $((@($existing | ForEach-Object { $_.ProcessId })) -join ',')"
}

Remove-Item Env:DESK_DEV_SERVER_URL -ErrorAction SilentlyContinue
Remove-Item -Path $runtimeLog -ErrorAction SilentlyContinue
$proc = Start-Process -FilePath $exePath -WorkingDirectory (Split-Path -Parent $exePath) -PassThru

$alive = $false
for ($i = 0; $i -lt $WaitSeconds; $i++) {
  Start-Sleep -Seconds 1
  try {
    $running = Get-Process -Id $proc.Id -ErrorAction Stop
    if ($running) {
      $alive = $true
      break
    }
  } catch {
    break
  }
}

$ready = Wait-ForDeskReady -LogPath $runtimeLog -Seconds $WaitSeconds
if ($ready -and $PostReadyQuietSeconds -gt 0) {
  Start-Sleep -Seconds $PostReadyQuietSeconds
}
$runtimeErrorInfo = Get-DeskRuntimeErrorInfo -LogPath $runtimeLog

$stopped = $false
try {
  Stop-Process -Id $proc.Id -Force -ErrorAction Stop
  $stopped = $true
} catch {
  if (-not (Get-Process -Id $proc.Id -ErrorAction SilentlyContinue)) {
    $stopped = $true
  }
}

$result = [ordered]@{
  generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  latestDir = $latestDir
  exePath = $exePath
  webIndex = $webIndex
  startedPid = $proc.Id
  aliveAfterLaunch = $alive
  readyAfterLaunch = $ready
  postReadyQuietSeconds = $PostReadyQuietSeconds
  runtimeErrorCount = $runtimeErrorInfo.count
  runtimeErrorSample = @($runtimeErrorInfo.sample)
  stoppedAfterVerify = $stopped
  runtimeLog = $runtimeLog
}

$json = $result | ConvertTo-Json -Depth 6
$outDir = Split-Path -Parent $fullOutFile
if ($outDir -and -not (Test-Path $outDir)) {
  New-Item -ItemType Directory -Path $outDir -Force | Out-Null
}
Set-Content -Path $fullOutFile -Value $json -Encoding UTF8

if (-not $alive) {
  throw "desk-win latest package did not stay alive during verification"
}

if (-not $ready) {
  throw "desk-win latest package did not report app ready during verification"
}

if ($runtimeErrorInfo.count -gt 0) {
  throw "desk-win latest package reported frontend runtime errors during verification"
}

$json
