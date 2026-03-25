[CmdletBinding()]
param(
  [string]$PackageManifestFile = "docs/unified/reports/desk-win-package-latest.json",
  [string]$OutFile = "docs/unified/reports/desk-win-build-info-latest.json"
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$fullPackageManifest = Join-Path $repoRoot $PackageManifestFile
$fullOutFile = Join-Path $repoRoot $OutFile

if (-not (Test-Path $fullPackageManifest)) {
  throw "desk-win package manifest not found: $PackageManifestFile"
}

$package = Get-Content -Path $fullPackageManifest -Raw -Encoding UTF8 | ConvertFrom-Json
$exePath = [string]$package.exe.path
if (-not $exePath -or -not (Test-Path $exePath)) {
  throw "packaged exe not found: $exePath"
}

$gitSha = $null
$gitShortSha = $null
$gitCmd = Get-Command git -ErrorAction SilentlyContinue
if ($gitCmd) {
  Push-Location $repoRoot
  try {
    $gitSha = (& git rev-parse HEAD 2>$null | Out-String).Trim()
    $gitShortSha = (& git rev-parse --short HEAD 2>$null | Out-String).Trim()
  } finally {
    Pop-Location
  }
}

$result = [ordered]@{
  generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  git = [ordered]@{
    sha = $gitSha
    shortSha = $gitShortSha
  }
  package = [ordered]@{
    outputDir = $package.outputDir
    exePath = $exePath
    webIndex = $package.web.indexPath
    packageFileCount = $package.package.fileCount
    packageTotalBytes = $package.package.totalBytes
  }
}

$json = $result | ConvertTo-Json -Depth 6

$packageDir = Split-Path -Parent $exePath
Set-Content -Path (Join-Path $packageDir "desk-win-build-info.json") -Value $json -Encoding UTF8

$outDir = Split-Path -Parent $fullOutFile
if ($outDir -and -not (Test-Path $outDir)) {
  New-Item -ItemType Directory -Path $outDir -Force | Out-Null
}
Set-Content -Path $fullOutFile -Value $json -Encoding UTF8

$json
