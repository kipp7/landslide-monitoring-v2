[CmdletBinding()]
param(
  [string]$DeliveryDir = "artifacts/desk-win/delivery",
  [int]$Keep = 3,
  [string]$OutFile = "docs/unified/reports/desk-win-delivery-retention-latest.json"
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$fullDeliveryDir = Join-Path $repoRoot $DeliveryDir
$fullOutFile = Join-Path $repoRoot $OutFile

if (-not (Test-Path $fullDeliveryDir)) {
  throw "delivery dir not found: $DeliveryDir"
}

$dirs = @(Get-ChildItem -Path $fullDeliveryDir -Directory | Where-Object { $_.Name -like "desk-win-delivery-*" } | Sort-Object LastWriteTime -Descending)
$zips = @(Get-ChildItem -Path $fullDeliveryDir -File | Where-Object { $_.Name -like "desk-win-delivery-*.zip" } | Sort-Object LastWriteTime -Descending)

$dirsToKeep = @($dirs | Select-Object -First $Keep)
$dirsToDelete = @($dirs | Select-Object -Skip $Keep)
$zipsToKeep = @($zips | Select-Object -First $Keep)
$zipsToDelete = @($zips | Select-Object -Skip $Keep)

foreach ($item in $dirsToDelete) {
  Remove-Item -Path $item.FullName -Recurse -Force
}
foreach ($item in $zipsToDelete) {
  Remove-Item -Path $item.FullName -Force
}

$result = [ordered]@{
  generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  deliveryDir = $DeliveryDir
  keep = $Keep
  keptDirectories = @($dirsToKeep | ForEach-Object { $_.Name })
  deletedDirectories = @($dirsToDelete | ForEach-Object { $_.Name })
  keptZips = @($zipsToKeep | ForEach-Object { $_.Name })
  deletedZips = @($zipsToDelete | ForEach-Object { $_.Name })
}

$json = $result | ConvertTo-Json -Depth 8
$outDir = Split-Path -Parent $fullOutFile
if ($outDir -and -not (Test-Path $outDir)) {
  New-Item -ItemType Directory -Path $outDir -Force | Out-Null
}
Set-Content -Path $fullOutFile -Value $json -Encoding UTF8
$json
