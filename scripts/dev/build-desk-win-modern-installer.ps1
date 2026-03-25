[CmdletBinding()]
param(
  [string]$Configuration = "Release",
  [string]$Runtime = "win-x64",
  [string]$Version = "0.1.0",
  [string]$OutputDir = "artifacts/desk-win/modern-installer",
  [switch]$SkipCoreInstallerBuild
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Invoke-Step([string]$label, [scriptblock]$action) {
  Write-Host "==> $label" -ForegroundColor Cyan
  & $action
  if ($LASTEXITCODE -ne 0) {
    throw "$label failed (exit=$LASTEXITCODE)"
  }
}

function Get-HashEntry([string]$path) {
  $hash = Get-FileHash -Path $path -Algorithm SHA256
  return [ordered]@{
    path = $path
    sha256 = $hash.Hash.ToLowerInvariant()
    sizeBytes = (Get-Item $path).Length
  }
}

function Stop-ExistingBundleProcesses([string]$targetPath) {
  $normalizedTarget = [System.IO.Path]::GetFullPath($targetPath)
  Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object {
      ($_.ExecutablePath -and ([System.IO.Path]::GetFullPath($_.ExecutablePath) -eq $normalizedTarget)) -or
      ($_.Name -eq "wixstdba.exe")
    } |
    ForEach-Object {
      Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    }
}

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$modernProject = Join-Path $repoRoot "apps/desk-win/installer-modern/LandslideDesk.ModernInstaller.wixproj"
$modernInclude = Join-Path $repoRoot "apps/desk-win/installer-modern/BuildInfo.wxi"
$modernAssetsScript = Join-Path $repoRoot "scripts/dev/render-desk-win-modern-installer-assets.ps1"
$coreInstallerScript = Join-Path $repoRoot "scripts/dev/build-desk-win-installer.ps1"
$coreInstallerReport = Join-Path $repoRoot "docs/unified/reports/desk-win-installer-latest.json"
$outDir = Join-Path $repoRoot $OutputDir
$reportFile = Join-Path $repoRoot "docs/unified/reports/desk-win-modern-installer-latest.json"
$wixExe = Join-Path $env:USERPROFILE ".dotnet\tools\wix.exe"

if (-not (Test-Path $modernProject)) {
  throw "modern installer project not found: $modernProject"
}

if (-not (Test-Path $wixExe)) {
  Invoke-Step "Install WiX toolchain" {
    dotnet tool install --global wix --version 6.0.2
  }
}

if (-not $SkipCoreInstallerBuild.IsPresent) {
  Invoke-Step "Build base Inno installer" {
    powershell -NoProfile -ExecutionPolicy Bypass -File $coreInstallerScript -SkipDeskBuild
  }
}

Invoke-Step "Render modern installer assets" {
  powershell -NoProfile -ExecutionPolicy Bypass -File $modernAssetsScript
}

if (-not (Test-Path $coreInstallerReport)) {
  throw "core installer report not found: $coreInstallerReport"
}

$coreReport = Get-Content -Path $coreInstallerReport -Raw -Encoding UTF8 | ConvertFrom-Json
$coreInstallerPath = [string]$coreReport.installer.path
if (-not $coreInstallerPath -or -not (Test-Path $coreInstallerPath)) {
  throw "core installer path not found: $coreInstallerPath"
}

$buildInfoFile = Join-Path $repoRoot "docs/unified/reports/desk-win-build-info-latest.json"
$gitShortSha = if (Test-Path $buildInfoFile) {
  ([string](Get-Content -Path $buildInfoFile -Raw -Encoding UTF8 | ConvertFrom-Json).git.shortSha)
} else {
  (git rev-parse --short HEAD).Trim()
}
$outputBaseName = "LandslideDesk-Modern-Setup-$Runtime-$gitShortSha"
$expectedBundlePath = Join-Path $outDir "$outputBaseName.exe"

New-Item -ItemType Directory -Path $outDir -Force | Out-Null
Stop-ExistingBundleProcesses -targetPath $expectedBundlePath

$wxi = @"
<Include>
  <?define CoreInstallerPath = "$coreInstallerPath" ?>
  <?define BundleVersion = "$Version" ?>
  <?define AppVersion = "$Version" ?>
</Include>
"@
Set-Content -Path $modernInclude -Value $wxi -Encoding UTF8

Invoke-Step "Build modern WiX bundle" {
  dotnet build $modernProject `
    -c $Configuration `
    /p:BundleOutputName="$outputBaseName" `
    /p:BundleOutputDir="$outDir"
}

$bundleExe = Join-Path $outDir "$outputBaseName.exe"
if (-not (Test-Path $bundleExe)) {
  $bundleExe = Get-ChildItem -Path $outDir -Filter "*.exe" -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1 -ExpandProperty FullName
}

if (-not $bundleExe -or -not (Test-Path $bundleExe)) {
  throw "modern installer output not found in: $outDir"
}

$result = [ordered]@{
  generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  configuration = $Configuration
  runtime = $Runtime
  version = $Version
  gitShortSha = $gitShortSha
  installer = [ordered]@{
    path = $bundleExe
    fileName = [System.IO.Path]::GetFileName($bundleExe)
  }
  coreInstaller = [ordered]@{
    path = $coreInstallerPath
    sha256 = $coreReport.hashes.installer.sha256
  }
  reuse = [ordered]@{
    selfContained = $true
    webView2Bootstrapper = $true
    installerSmokeScripts = $true
    deliveryPipeline = $true
  }
  hashes = [ordered]@{
    installer = (Get-HashEntry $bundleExe)
  }
  toolchain = [ordered]@{
    wix = $wixExe
    project = $modernProject
  }
}

$json = $result | ConvertTo-Json -Depth 8
$reportDir = Split-Path -Parent $reportFile
if ($reportDir -and -not (Test-Path $reportDir)) {
  New-Item -ItemType Directory -Path $reportDir -Force | Out-Null
}
Set-Content -Path $reportFile -Value $json -Encoding UTF8
$json
