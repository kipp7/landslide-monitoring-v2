[CmdletBinding()]
param(
  [string]$PackageManifestFile = "docs/unified/reports/desk-win-package-latest.json",
  [string]$DeliveryBundleFile = "docs/unified/reports/desk-win-delivery-bundle-latest.json",
  [string]$OutFile = "docs/unified/reports/desk-win-delivery-hash-latest.json"
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$fullPackageManifest = Join-Path $repoRoot $PackageManifestFile
$fullDeliveryBundle = Join-Path $repoRoot $DeliveryBundleFile
$fullOutFile = Join-Path $repoRoot $OutFile

foreach ($path in @($fullPackageManifest, $fullDeliveryBundle)) {
  if (-not (Test-Path $path)) {
    throw "required report not found: $path"
  }
}

$package = Get-Content -Path $fullPackageManifest -Raw -Encoding UTF8 | ConvertFrom-Json
$bundle = Get-Content -Path $fullDeliveryBundle -Raw -Encoding UTF8 | ConvertFrom-Json

$exePath = [string]$package.exe.path
$webIndex = [string]$package.web.indexPath
$bundleZip = [string]$bundle.bundleZip

foreach ($path in @($exePath, $webIndex, $bundleZip)) {
  if (-not $path -or -not (Test-Path $path)) {
    throw "delivery hash target missing: $path"
  }
}

function Get-HashEntry([string]$path) {
  $hash = Get-FileHash -Path $path -Algorithm SHA256
  [ordered]@{
    path = $path
    sha256 = $hash.Hash.ToLowerInvariant()
    sizeBytes = (Get-Item -Path $path).Length
  }
}

$result = [ordered]@{
  generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  targets = [ordered]@{
    exe = Get-HashEntry $exePath
    webIndex = Get-HashEntry $webIndex
    bundleZip = Get-HashEntry $bundleZip
  }
}

$json = $result | ConvertTo-Json -Depth 8
$outDir = Split-Path -Parent $fullOutFile
if ($outDir -and -not (Test-Path $outDir)) {
  New-Item -ItemType Directory -Path $outDir -Force | Out-Null
}
Set-Content -Path $fullOutFile -Value $json -Encoding UTF8
$json
