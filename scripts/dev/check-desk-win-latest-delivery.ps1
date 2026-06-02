[CmdletBinding()]
param(
  [string]$PromoteFile = "docs/unified/reports/desk-win-delivery-promote-latest.json",
  [string]$IndexFile = "docs/unified/reports/desk-win-delivery-index-latest.json",
  [string]$OutFile = "docs/unified/reports/desk-win-latest-delivery-latest.json"
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$fullPromoteFile = Join-Path $repoRoot $PromoteFile
$fullIndexFile = Join-Path $repoRoot $IndexFile
$fullOutFile = Join-Path $repoRoot $OutFile

foreach ($path in @($fullPromoteFile, $fullIndexFile)) {
  if (-not (Test-Path $path)) {
    throw "required report not found: $path"
  }
}

$promote = Get-Content -Path $fullPromoteFile -Raw -Encoding UTF8 | ConvertFrom-Json
$index = Get-Content -Path $fullIndexFile -Raw -Encoding UTF8 | ConvertFrom-Json

$latestDir = [string]$promote.promotedDir
$latestZip = [string]$promote.promotedZip

if (-not (Test-Path $latestDir)) {
  throw "latest delivery dir not found: $latestDir"
}
if (-not (Test-Path $latestZip)) {
  throw "latest delivery zip not found: $latestZip"
}

$requiredFiles = @(
  (Join-Path $latestDir "README.txt"),
  (Join-Path $latestDir "docs\desk-win-env-matrix.md"),
  (Join-Path $latestDir "docs\desk-win-delivery-checklist.md"),
  (Join-Path $latestDir "docs\desk-win-delivery-summary-latest.md"),
  (Join-Path $latestDir "docs\desk-win-release-notes-latest.md"),
  (Join-Path $latestDir "docs\desk-win-manual-acceptance-latest.md"),
  (Join-Path $latestDir "docs\desk-win-delivery-index-latest.json"),
  (Join-Path $latestDir "reports\desk-win-package-latest.json"),
  (Join-Path $latestDir "reports\desk-win-package-verify-latest.json"),
  (Join-Path $latestDir "reports\desk-win-prerequisites-latest.json"),
  (Join-Path $latestDir "reports\desk-api-boundary-latest.json"),
  (Join-Path $latestDir "reports\desk-win-delivery-latest.json"),
  (Join-Path $latestDir "reports\desk-win-delivery-hash-latest.json"),
  (Join-Path $latestDir "reports\desk-win-build-info-latest.json"),
  (Join-Path $latestDir "reports\desk-win-delivery-index-latest.json"),
  (Join-Path $latestDir "reports\desk-win-manual-acceptance-latest.json"),
  (Join-Path $latestDir "package\LandslideDesk.Win.exe"),
  (Join-Path $latestDir "package\web\index.html")
)

$missing = @($requiredFiles | Where-Object { -not (Test-Path $_) })

$result = [ordered]@{
  generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  ready = ($missing.Count -eq 0 -and [bool]$index.ready)
  latest = [ordered]@{
    directory = $latestDir
    zip = $latestZip
    indexReady = [bool]$index.ready
  }
  counts = [ordered]@{
    fileCount = @(Get-ChildItem -Path $latestDir -Recurse -File).Count
    missingRequiredFiles = $missing.Count
  }
  missingRequiredFiles = $missing
}

$json = $result | ConvertTo-Json -Depth 8
$outDir = Split-Path -Parent $fullOutFile
if ($outDir -and -not (Test-Path $outDir)) {
  New-Item -ItemType Directory -Path $outDir -Force | Out-Null
}
Set-Content -Path $fullOutFile -Value $json -Encoding UTF8

if ($missing.Count -gt 0) {
  throw "latest delivery check failed: missing files"
}

$json
