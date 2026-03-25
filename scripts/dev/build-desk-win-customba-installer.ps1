[CmdletBinding()]
param(
  [string]$Configuration = "Release",
  [string]$Version = "0.1.0",
  [string]$OutputDir = "artifacts/desk-win/customba-installer",
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

function Stop-CustomBaProcesses([string]$bundlePath, [string]$shellPath) {
  Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object {
      ($_.ExecutablePath -and $bundlePath -and ([System.IO.Path]::GetFullPath($_.ExecutablePath) -eq [System.IO.Path]::GetFullPath($bundlePath))) -or
      ($_.ExecutablePath -and $shellPath -and ([System.IO.Path]::GetFullPath($_.ExecutablePath) -eq [System.IO.Path]::GetFullPath($shellPath))) -or
      ($_.Name -eq "LandslideDesk.CustomBA") -or
      ($_.Name -eq "wixstdba.exe")
    } |
    ForEach-Object {
      Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    }
}

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$customBaProject = Join-Path $repoRoot "apps/desk-win/installer-customba/LandslideDesk.CustomBA.csproj"
$bundleProject = Join-Path $repoRoot "apps/desk-win/installer-customba/LandslideDesk.CustomInstaller.wixproj"
$bundleInclude = Join-Path $repoRoot "apps/desk-win/installer-customba/BuildInfo.wxi"
$coreInstallerScript = Join-Path $repoRoot "scripts/dev/build-desk-win-installer.ps1"
$coreInstallerReport = Join-Path $repoRoot "docs/unified/reports/desk-win-installer-latest.json"
$customBaOutDir = Join-Path $repoRoot "artifacts/desk-win/customba-shell"
$bundleOutDir = Join-Path $repoRoot $OutputDir
$reportFile = Join-Path $repoRoot "docs/unified/reports/desk-win-customba-installer-latest.json"
$wixExe = Join-Path $env:USERPROFILE ".dotnet\tools\wix.exe"

if (-not (Test-Path $customBaProject)) {
  throw "custom BA project not found: $customBaProject"
}

if (-not (Test-Path $bundleProject)) {
  throw "custom BA bundle project not found: $bundleProject"
}

if (-not (Test-Path $wixExe)) {
  throw "wix.exe not found: $wixExe"
}

if (-not $SkipCoreInstallerBuild.IsPresent) {
  Invoke-Step "Build base Inno installer" {
    powershell -NoProfile -ExecutionPolicy Bypass -File $coreInstallerScript -SkipDeskBuild
  }
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
$timestampSuffix = (Get-Date).ToString("yyyyMMdd-HHmmss")
$outputBaseName = "LandslideDesk-CustomBA-Setup-$gitShortSha-$timestampSuffix"
$expectedBundlePath = Join-Path $bundleOutDir ($outputBaseName + ".exe")
$expectedShellPath = Join-Path $customBaOutDir "LandslideDesk.CustomBA.exe"

Stop-CustomBaProcesses -bundlePath $expectedBundlePath -shellPath $expectedShellPath

if (Test-Path $customBaOutDir) {
  Remove-Item -Path $customBaOutDir -Recurse -Force
}
New-Item -ItemType Directory -Path $customBaOutDir -Force | Out-Null

Invoke-Step "Build custom BA shell" {
  dotnet publish $customBaProject -c $Configuration -r win-x64 --self-contained false -o $customBaOutDir
}

$mbaNativeSource = Join-Path $env:USERPROFILE ".nuget\packages\wixtoolset.bootstrapperapplicationapi\6.0.2\runtimes\win-x64\native\mbanative.dll"
if (-not (Test-Path $mbaNativeSource)) {
  throw "mbanative.dll not found in package cache: $mbaNativeSource"
}
Copy-Item -Path $mbaNativeSource -Destination (Join-Path $customBaOutDir "mbanative.dll") -Force

$requiredPayloads = @(
  "LandslideDesk.CustomBA.exe",
  "LandslideDesk.CustomBA.dll",
  "LandslideDesk.CustomBA.deps.json",
  "LandslideDesk.CustomBA.runtimeconfig.json",
  "LandslideDesk.ico",
  "WixToolset.BootstrapperApplicationApi.dll",
  "mbanative.dll"
)
foreach ($file in $requiredPayloads) {
  $path = Join-Path $customBaOutDir $file
  if (-not (Test-Path $path)) {
    throw "custom BA payload missing: $path"
  }
}

New-Item -ItemType Directory -Path $bundleOutDir -Force | Out-Null

$wxi = @"
<Include>
  <?define CoreInstallerPath = "$coreInstallerPath" ?>
  <?define CustomBAOutputDir = "$customBaOutDir" ?>
  <?define BundleVersion = "$Version" ?>
  <?define AppVersion = "$Version" ?>
</Include>
"@
Set-Content -Path $bundleInclude -Value $wxi -Encoding UTF8

Invoke-Step "Build custom BA bundle" {
  dotnet build $bundleProject `
    -c $Configuration `
    /p:BundleOutputName="$outputBaseName" `
    /p:BundleOutputDir="$bundleOutDir"
}

$bundleExe = Join-Path $bundleOutDir ($outputBaseName + ".exe")
if (-not (Test-Path $bundleExe)) {
  throw "custom BA bundle output not found: $bundleExe"
}

$result = [ordered]@{
  generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  configuration = $Configuration
  version = $Version
  gitShortSha = $gitShortSha
  installer = [ordered]@{
    path = $bundleExe
    fileName = [System.IO.Path]::GetFileName($bundleExe)
  }
  customBa = [ordered]@{
    outputDir = $customBaOutDir
    exePath = (Join-Path $customBaOutDir "LandslideDesk.CustomBA.exe")
  }
  coreInstaller = [ordered]@{
    path = $coreInstallerPath
    sha256 = $coreReport.hashes.installer.sha256
  }
  hashes = [ordered]@{
    installer = (Get-HashEntry $bundleExe)
  }
}

$json = $result | ConvertTo-Json -Depth 8
Set-Content -Path $reportFile -Value $json -Encoding UTF8
$json
