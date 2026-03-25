[CmdletBinding()]
param(
  [string]$Configuration = "Release",
  [string]$Runtime = "win-x64",
  [string]$PublishOutputDir = "artifacts/desk-win/win-x64"
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$summaryFile = Join-Path $repoRoot "docs/unified/reports/desk-win-delivery-pipeline-latest.json"

function Invoke-Step([string]$label, [scriptblock]$action) {
  Write-Host "==> $label" -ForegroundColor Cyan
  & $action
  if ($LASTEXITCODE -ne 0) {
    throw "$label failed (exit=$LASTEXITCODE)"
  }
}

Invoke-Step "Publish desk-win package" {
  powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repoRoot "scripts/dev/publish-desk-win.ps1") -Configuration $Configuration -Runtime $Runtime -OutputDir $PublishOutputDir
}

Invoke-Step "Stamp desk-win delivery metadata" {
  powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repoRoot "scripts/dev/stamp-desk-win-delivery.ps1")
}

Invoke-Step "Verify desk-win package" {
  powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repoRoot "scripts/dev/verify-desk-win-package.ps1")
}

Invoke-Step "Check desk-win prerequisites" {
  powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repoRoot "scripts/dev/check-desk-win-prerequisites.ps1")
}

Invoke-Step "Check desk-win delivery" {
  powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repoRoot "scripts/dev/check-desk-win-delivery.ps1")
}

Invoke-Step "Hash desk-win delivery" {
  powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repoRoot "scripts/dev/hash-desk-win-delivery.ps1")
}

Invoke-Step "Render desk build chunk report" {
  powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repoRoot "scripts/dev/render-desk-build-chunk-report.ps1")
}

Invoke-Step "Build desk-win installer" {
  powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repoRoot "scripts/dev/build-desk-win-installer.ps1") -SkipDeskBuild
}

Invoke-Step "Verify desk-win installer" {
  powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repoRoot "scripts/dev/verify-desk-win-installer.ps1")
}

Invoke-Step "Build desk-win custom BA installer" {
  powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repoRoot "scripts/dev/build-desk-win-customba-installer.ps1") -SkipCoreInstallerBuild
}

Invoke-Step "Verify desk-win custom BA installer" {
  powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repoRoot "scripts/dev/verify-desk-win-modern-installer.ps1") -InstallerReportFile "docs/unified/reports/desk-win-customba-installer-latest.json" -OutFile "docs/unified/reports/desk-win-customba-installer-verify-latest.json" -BundleUpgradeCode "{{F3F4BEB7-6F61-4B44-B86D-2B79F7B4AFD2}}"
}

Invoke-Step "Render desk-win delivery summary" {
  powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repoRoot "scripts/dev/render-desk-win-delivery-summary.ps1")
}

Invoke-Step "Render desk-win release notes" {
  powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repoRoot "scripts/dev/render-desk-win-release-notes.ps1")
}

Invoke-Step "Render desk-win manual acceptance checklist" {
  powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repoRoot "scripts/dev/render-desk-win-manual-acceptance.ps1")
}

Invoke-Step "Render desk-win production handoff" {
  powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repoRoot "scripts/dev/render-desk-win-production-handoff.ps1")
}

Invoke-Step "Render desk-win delivery index" {
  powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repoRoot "scripts/dev/render-desk-win-delivery-index.ps1")
}

Invoke-Step "Package desk-win delivery bundle" {
  powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repoRoot "scripts/dev/package-desk-win-delivery.ps1")
}

Invoke-Step "Promote latest desk-win delivery bundle" {
  powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repoRoot "scripts/dev/promote-desk-win-delivery.ps1")
}

Invoke-Step "Check latest desk-win delivery bundle" {
  powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repoRoot "scripts/dev/check-desk-win-latest-delivery.ps1")
}

Invoke-Step "Verify latest packaged desk-win bundle" {
  powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repoRoot "scripts/dev/verify-desk-win-latest-package.ps1")
}

Invoke-Step "Prune old desk-win deliveries" {
  powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repoRoot "scripts/dev/prune-desk-win-deliveries.ps1")
}

$package = Get-Content -Path (Join-Path $repoRoot "docs/unified/reports/desk-win-package-latest.json") -Raw -Encoding UTF8 | ConvertFrom-Json
$buildInfo = Get-Content -Path (Join-Path $repoRoot "docs/unified/reports/desk-win-build-info-latest.json") -Raw -Encoding UTF8 | ConvertFrom-Json
$verify = Get-Content -Path (Join-Path $repoRoot "docs/unified/reports/desk-win-package-verify-latest.json") -Raw -Encoding UTF8 | ConvertFrom-Json
$prereq = Get-Content -Path (Join-Path $repoRoot "docs/unified/reports/desk-win-prerequisites-latest.json") -Raw -Encoding UTF8 | ConvertFrom-Json
$delivery = Get-Content -Path (Join-Path $repoRoot "docs/unified/reports/desk-win-delivery-latest.json") -Raw -Encoding UTF8 | ConvertFrom-Json
$hash = Get-Content -Path (Join-Path $repoRoot "docs/unified/reports/desk-win-delivery-hash-latest.json") -Raw -Encoding UTF8 | ConvertFrom-Json
$chunk = Get-Content -Path (Join-Path $repoRoot "docs/unified/reports/desk-build-chunks-latest.json") -Raw -Encoding UTF8 | ConvertFrom-Json
$installer = Get-Content -Path (Join-Path $repoRoot "docs/unified/reports/desk-win-installer-latest.json") -Raw -Encoding UTF8 | ConvertFrom-Json
$installerVerify = Get-Content -Path (Join-Path $repoRoot "docs/unified/reports/desk-win-installer-verify-latest.json") -Raw -Encoding UTF8 | ConvertFrom-Json
$customInstaller = Get-Content -Path (Join-Path $repoRoot "docs/unified/reports/desk-win-customba-installer-latest.json") -Raw -Encoding UTF8 | ConvertFrom-Json
$customInstallerVerify = Get-Content -Path (Join-Path $repoRoot "docs/unified/reports/desk-win-customba-installer-verify-latest.json") -Raw -Encoding UTF8 | ConvertFrom-Json
$index = Get-Content -Path (Join-Path $repoRoot "docs/unified/reports/desk-win-delivery-index-latest.json") -Raw -Encoding UTF8 | ConvertFrom-Json
$bundle = Get-Content -Path (Join-Path $repoRoot "docs/unified/reports/desk-win-delivery-bundle-latest.json") -Raw -Encoding UTF8 | ConvertFrom-Json
$promote = Get-Content -Path (Join-Path $repoRoot "docs/unified/reports/desk-win-delivery-promote-latest.json") -Raw -Encoding UTF8 | ConvertFrom-Json
$latestCheck = Get-Content -Path (Join-Path $repoRoot "docs/unified/reports/desk-win-latest-delivery-latest.json") -Raw -Encoding UTF8 | ConvertFrom-Json
$latestVerify = Get-Content -Path (Join-Path $repoRoot "docs/unified/reports/desk-win-latest-package-verify-latest.json") -Raw -Encoding UTF8 | ConvertFrom-Json
$retention = Get-Content -Path (Join-Path $repoRoot "docs/unified/reports/desk-win-delivery-retention-latest.json") -Raw -Encoding UTF8 | ConvertFrom-Json

$summary = [ordered]@{
  generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  configuration = $Configuration
  runtime = $Runtime
  publishOutputDir = $PublishOutputDir
  ready = [bool]$delivery.ready
  package = [ordered]@{
    exePath = $package.exe.path
    webIndex = $package.web.indexPath
    fileCount = $package.package.fileCount
  }
  build = [ordered]@{
    generatedAt = $buildInfo.generatedAt
    gitShortSha = $buildInfo.git.shortSha
  }
  verify = [ordered]@{
    aliveAfterLaunch = [bool]$verify.aliveAfterLaunch
    stoppedAfterVerify = [bool]$verify.stoppedAfterVerify
  }
  prerequisites = [ordered]@{
    dotnet = [bool](($prereq.checks | Where-Object { $_.key -eq "dotnetCommand" } | Select-Object -First 1).ok)
    windowsDesktopRuntime = [bool](($prereq.checks | Where-Object { $_.key -eq "windowsDesktopRuntime8" } | Select-Object -First 1).ok)
    webView2 = [bool](($prereq.checks | Where-Object { $_.key -eq "webView2Runtime" } | Select-Object -First 1).ok)
  }
  bundle = [ordered]@{
    bundleDir = $bundle.bundleDir
    bundleZip = $bundle.bundleZip
    fileCount = $bundle.fileCount
  }
  latest = [ordered]@{
    promotedDir = $promote.promotedDir
    promotedZip = $promote.promotedZip
    ready = [bool]$latestCheck.ready
    fileCount = $latestCheck.counts.fileCount
    verifyAliveAfterLaunch = [bool]$latestVerify.aliveAfterLaunch
    verifyStoppedAfterVerify = [bool]$latestVerify.stoppedAfterVerify
  }
  retention = [ordered]@{
    keep = [int]$retention.keep
    keptDirectories = @($retention.keptDirectories)
    keptZips = @($retention.keptZips)
  }
  index = [ordered]@{
    ready = [bool]$index.ready
    packageDir = $index.latest.packageDir
    packageZip = $index.latest.packageZip
  }
  hashes = [ordered]@{
    exe = $hash.targets.exe.sha256
    webIndex = $hash.targets.webIndex.sha256
    bundleZip = $hash.targets.bundleZip.sha256
  }
  installer = [ordered]@{
    path = $installer.installer.path
    sha256 = $installer.hashes.installer.sha256
    verified = [bool]$installerVerify.ready
  }
  customInstaller = [ordered]@{
    path = $customInstaller.installer.path
    sha256 = $customInstaller.hashes.installer.sha256
    verified = [bool]$customInstallerVerify.ready
  }
  buildChunks = [ordered]@{
    report = "docs/unified/reports/desk-build-chunks-latest.json"
    oversizeJsCount = [int]$chunk.summary.oversizeJsCount
    largestJs = [string]$chunk.summary.largestJs.name
    largestJsKb = [double]$chunk.summary.largestJs.sizeKb
  }
}

$json = $summary | ConvertTo-Json -Depth 8
$summaryDir = Split-Path -Parent $summaryFile
if ($summaryDir -and -not (Test-Path $summaryDir)) {
  New-Item -ItemType Directory -Path $summaryDir -Force | Out-Null
}
Set-Content -Path $summaryFile -Value $json -Encoding UTF8
$json
