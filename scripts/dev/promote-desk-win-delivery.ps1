[CmdletBinding()]
param(
  [string]$DeliveryBundleFile = "docs/unified/reports/desk-win-delivery-bundle-latest.json",
  [string]$OutDir = "artifacts/desk-win/latest",
  [string]$OutZip = "artifacts/desk-win/latest.zip",
  [string]$OutFile = "docs/unified/reports/desk-win-delivery-promote-latest.json"
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$fullBundleFile = Join-Path $repoRoot $DeliveryBundleFile
$fullOutDir = Join-Path $repoRoot $OutDir
$fullOutZip = Join-Path $repoRoot $OutZip
$fullOutFile = Join-Path $repoRoot $OutFile

if (-not (Test-Path $fullBundleFile)) {
  throw "delivery bundle manifest not found: $DeliveryBundleFile"
}

$bundle = Get-Content -Path $fullBundleFile -Raw -Encoding UTF8 | ConvertFrom-Json
$bundleDir = [string]$bundle.bundleDir
$bundleZip = [string]$bundle.bundleZip

if (-not (Test-Path $bundleDir)) {
  throw "delivery bundle directory not found: $bundleDir"
}
if (-not (Test-Path $bundleZip)) {
  throw "delivery bundle zip not found: $bundleZip"
}

if (Test-Path $fullOutDir) {
  Remove-Item -Path $fullOutDir -Recurse -Force
}
New-Item -ItemType Directory -Path $fullOutDir -Force | Out-Null
Copy-Item -Path (Join-Path $bundleDir "*") -Destination $fullOutDir -Recurse -Force

$zipParent = Split-Path -Parent $fullOutZip
if ($zipParent -and -not (Test-Path $zipParent)) {
  New-Item -ItemType Directory -Path $zipParent -Force | Out-Null
}
Copy-Item -Path $bundleZip -Destination $fullOutZip -Force

if (-not (Test-Path $fullOutDir)) {
  throw "promoted delivery directory missing after copy: $fullOutDir"
}
if (-not (Test-Path $fullOutZip)) {
  throw "promoted delivery zip missing after copy: $fullOutZip"
}

$result = [ordered]@{
  generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  sourceBundleDir = $bundleDir
  sourceBundleZip = $bundleZip
  promotedDir = $fullOutDir
  promotedZip = $fullOutZip
}

$json = $result | ConvertTo-Json -Depth 6
$reportDir = Split-Path -Parent $fullOutFile
if ($reportDir -and -not (Test-Path $reportDir)) {
  New-Item -ItemType Directory -Path $reportDir -Force | Out-Null
}
Set-Content -Path $fullOutFile -Value $json -Encoding UTF8
$json
