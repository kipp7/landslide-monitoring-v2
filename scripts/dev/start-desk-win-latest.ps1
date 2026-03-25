[CmdletBinding()]
param(
  [string]$PromoteFile = "docs/unified/reports/desk-win-delivery-promote-latest.json"
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$fullPromoteFile = Join-Path $repoRoot $PromoteFile

if (-not (Test-Path $fullPromoteFile)) {
  throw "desk-win latest promote report not found: $PromoteFile"
}

$promote = Get-Content -Path $fullPromoteFile -Raw -Encoding UTF8 | ConvertFrom-Json
$latestDir = [string]$promote.promotedDir
$exePath = Join-Path $latestDir "package\LandslideDesk.Win.exe"
$webIndex = Join-Path $latestDir "package\web\index.html"

if (-not (Test-Path $exePath)) {
  throw "latest packaged exe not found: $exePath"
}
if (-not (Test-Path $webIndex)) {
  throw "latest packaged web assets missing: $webIndex"
}

$existing = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
  $_.Name -eq "LandslideDesk.Win.exe" -and $_.ExecutablePath -eq $exePath
} | Select-Object -First 1

if ($existing) {
  [pscustomobject]@{
    started = $false
    alreadyRunning = $true
    pid = $existing.ProcessId
    exePath = $exePath
  } | ConvertTo-Json -Depth 4
  exit 0
}

Remove-Item Env:DESK_DEV_SERVER_URL -ErrorAction SilentlyContinue
$proc = Start-Process -FilePath $exePath -WorkingDirectory (Split-Path -Parent $exePath) -PassThru

[pscustomobject]@{
  started = $true
  alreadyRunning = $false
  pid = $proc.Id
  exePath = $exePath
} | ConvertTo-Json -Depth 4
