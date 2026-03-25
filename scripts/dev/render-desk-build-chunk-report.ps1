[CmdletBinding()]
param(
  [string]$DistDir = "apps/desk/dist",
  [string]$OutJsonFile = "docs/unified/reports/desk-build-chunks-latest.json",
  [string]$OutMdFile = "docs/unified/reports/desk-build-chunks-latest.md",
  [int]$WarningThresholdKb = 500,
  [switch]$BuildFirst
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$fullDistDir = Join-Path $repoRoot $DistDir
$fullOutJsonFile = Join-Path $repoRoot $OutJsonFile
$fullOutMdFile = Join-Path $repoRoot $OutMdFile

if ($BuildFirst) {
  Push-Location $repoRoot
  try {
    npm -w apps/desk run build | Out-Host
    if ($LASTEXITCODE -ne 0) {
      throw "desk build failed with exit code $LASTEXITCODE"
    }
  } finally {
    Pop-Location
  }
}

if (-not (Test-Path $fullDistDir)) {
  throw "dist directory not found: $DistDir"
}

$thresholdBytes = $WarningThresholdKb * 1KB
$assetsDir = Join-Path $fullDistDir "assets"
if (-not (Test-Path $assetsDir)) {
  throw "assets directory not found: $assetsDir"
}

$allFiles = Get-ChildItem -Path $assetsDir -File | Sort-Object LastWriteTime -Descending
if (@($allFiles).Count -eq 0) {
  throw "no asset files found in: $assetsDir"
}

$latestWriteTime = ($allFiles | Select-Object -First 1).LastWriteTime
$currentBuildWindowSeconds = 120
$files = @(
  $allFiles |
    Where-Object { [math]::Abs(($_.LastWriteTime - $latestWriteTime).TotalSeconds) -le $currentBuildWindowSeconds } |
    Sort-Object Name
)

function Get-AssetKind([string]$name) {
  $ext = [System.IO.Path]::GetExtension($name).ToLowerInvariant()
  switch ($ext) {
    ".js" { return "js" }
    ".css" { return "css" }
    default { return "other" }
  }
}

$rows = foreach ($file in $files) {
  $kind = Get-AssetKind $file.Name
  $isVendor = $file.Name.StartsWith("vendor-")
  [pscustomobject][ordered]@{
    name = $file.Name
    kind = $kind
    isVendor = $isVendor
    sizeBytes = [int64]$file.Length
    sizeKb = [math]::Round($file.Length / 1KB, 2)
    exceedsWarning = ($kind -eq "js" -and $file.Length -gt $thresholdBytes)
    lastWriteTime = $file.LastWriteTime.ToString("yyyy-MM-dd HH:mm:ss")
  }
}

$jsRows = @($rows | Where-Object { $_.kind -eq "js" } | Sort-Object sizeBytes -Descending)
$cssRows = @($rows | Where-Object { $_.kind -eq "css" } | Sort-Object sizeBytes -Descending)
$vendorRows = @($rows | Where-Object { $_.isVendor -and $_.kind -eq "js" } | Sort-Object sizeBytes -Descending)
$oversizeRows = @($jsRows | Where-Object { $_.exceedsWarning })

$summary = [ordered]@{
  generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  distDir = $DistDir
  latestWriteTime = $latestWriteTime.ToString("yyyy-MM-dd HH:mm:ss")
  currentBuildWindowSeconds = $currentBuildWindowSeconds
  warningThresholdKb = $WarningThresholdKb
  assetCount = @($rows).Count
  jsCount = @($jsRows).Count
  cssCount = @($cssRows).Count
  vendorJsCount = @($vendorRows).Count
  oversizeJsCount = @($oversizeRows).Count
  largestJs = if ($jsRows.Count -gt 0) { $jsRows[0] } else { $null }
  largestCss = if ($cssRows.Count -gt 0) { $cssRows[0] } else { $null }
}

$result = [ordered]@{
  summary = $summary
  oversizeJs = @($oversizeRows)
  topJs = @($jsRows | Select-Object -First 15)
  topVendorJs = @($vendorRows | Select-Object -First 15)
  topCss = @($cssRows | Select-Object -First 10)
  assets = @($rows)
}

$jsonDir = Split-Path -Parent $fullOutJsonFile
if ($jsonDir -and -not (Test-Path $jsonDir)) {
  New-Item -ItemType Directory -Path $jsonDir -Force | Out-Null
}
Set-Content -Path $fullOutJsonFile -Value ($result | ConvertTo-Json -Depth 8) -Encoding UTF8

$md = @(
  "# Desk Build Chunk Report",
  "",
  "- GeneratedAt: $($summary.generatedAt)",
  "- DistDir: $DistDir",
  "- WarningThresholdKb: $WarningThresholdKb",
  "- AssetCount: $($summary.assetCount)",
  "- JsCount: $($summary.jsCount)",
  "- CssCount: $($summary.cssCount)",
  "- VendorJsCount: $($summary.vendorJsCount)",
  "- OversizeJsCount: $($summary.oversizeJsCount)",
  "- LargestJs: $($summary.largestJs.name) ($($summary.largestJs.sizeKb) kB)",
  "- LargestCss: $($summary.largestCss.name) ($($summary.largestCss.sizeKb) kB)",
  "",
  "## Oversize JS",
  ""
)

if ($oversizeRows.Count -eq 0) {
  $md += "- None"
} else {
  foreach ($row in $oversizeRows) {
    $md += "- $($row.name): $($row.sizeKb) kB"
  }
}

$md += ""
$md += "## Top Vendor JS"
$md += ""
$md += "| File | Size (kB) | Exceeds |"
$md += "| --- | ---: | --- |"
foreach ($row in ($vendorRows | Select-Object -First 15)) {
  $md += "| $($row.name) | $($row.sizeKb) | $($row.exceedsWarning) |"
}

$md += ""
$md += "## Top JS"
$md += ""
$md += "| File | Size (kB) | Vendor | Exceeds |"
$md += "| --- | ---: | --- | --- |"
foreach ($row in ($jsRows | Select-Object -First 15)) {
  $md += "| $($row.name) | $($row.sizeKb) | $($row.isVendor) | $($row.exceedsWarning) |"
}

$md += ""
$md += "## Top CSS"
$md += ""
$md += "| File | Size (kB) |"
$md += "| --- | ---: |"
foreach ($row in ($cssRows | Select-Object -First 10)) {
  $md += "| $($row.name) | $($row.sizeKb) |"
}

$mdDir = Split-Path -Parent $fullOutMdFile
if ($mdDir -and -not (Test-Path $mdDir)) {
  New-Item -ItemType Directory -Path $mdDir -Force | Out-Null
}
Set-Content -Path $fullOutMdFile -Value ($md -join [Environment]::NewLine) -Encoding UTF8

$result | ConvertTo-Json -Depth 8
