[CmdletBinding()]
param(
  [string]$PipelineFile = "docs/unified/reports/desk-win-delivery-pipeline-latest.json",
  [string]$SummaryFile = "docs/unified/reports/desk-win-delivery-summary-latest.md",
  [string]$ReleaseNotesFile = "docs/unified/reports/desk-win-release-notes-latest.md",
  [string]$ProductionHandoffFile = "docs/unified/reports/desk-win-production-handoff-latest.md",
  [string]$InstallerReportFile = "docs/unified/reports/desk-win-installer-latest.json",
  [string]$InstallerVerifyFile = "docs/unified/reports/desk-win-installer-verify-latest.json",
  [string]$CustomInstallerReportFile = "docs/unified/reports/desk-win-customba-installer-latest.json",
  [string]$CustomInstallerVerifyFile = "docs/unified/reports/desk-win-customba-installer-verify-latest.json",
  [string]$BoundaryReportFile = "docs/unified/reports/desk-api-boundary-latest.json",
  [string]$HashFile = "docs/unified/reports/desk-win-delivery-hash-latest.json",
  [string]$BuildChunkFile = "docs/unified/reports/desk-build-chunks-latest.json",
  [string]$OutJsonFile = "docs/unified/reports/desk-win-delivery-index-latest.json",
  [string]$OutMdFile = "docs/unified/reports/desk-win-delivery-index-latest.md"
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$fullPipelineFile = Join-Path $repoRoot $PipelineFile
$fullSummaryFile = Join-Path $repoRoot $SummaryFile
$fullReleaseNotesFile = Join-Path $repoRoot $ReleaseNotesFile
$fullProductionHandoffFile = Join-Path $repoRoot $ProductionHandoffFile
$fullInstallerReportFile = Join-Path $repoRoot $InstallerReportFile
$fullInstallerVerifyFile = Join-Path $repoRoot $InstallerVerifyFile
$fullCustomInstallerReportFile = Join-Path $repoRoot $CustomInstallerReportFile
$fullCustomInstallerVerifyFile = Join-Path $repoRoot $CustomInstallerVerifyFile
$fullBoundaryReportFile = Join-Path $repoRoot $BoundaryReportFile
$fullHashFile = Join-Path $repoRoot $HashFile
$fullBuildChunkFile = Join-Path $repoRoot $BuildChunkFile
$fullOutJsonFile = Join-Path $repoRoot $OutJsonFile
$fullOutMdFile = Join-Path $repoRoot $OutMdFile

foreach ($path in @($fullPipelineFile, $fullSummaryFile, $fullReleaseNotesFile, $fullProductionHandoffFile, $fullInstallerReportFile, $fullInstallerVerifyFile, $fullCustomInstallerReportFile, $fullCustomInstallerVerifyFile, $fullBoundaryReportFile, $fullHashFile, $fullBuildChunkFile)) {
  if (-not (Test-Path $path)) {
    throw "required file not found: $path"
  }
}

$pipeline = Get-Content -Path $fullPipelineFile -Raw -Encoding UTF8 | ConvertFrom-Json
$installer = Get-Content -Path $fullInstallerReportFile -Raw -Encoding UTF8 | ConvertFrom-Json
$installerVerify = Get-Content -Path $fullInstallerVerifyFile -Raw -Encoding UTF8 | ConvertFrom-Json
$customInstaller = Get-Content -Path $fullCustomInstallerReportFile -Raw -Encoding UTF8 | ConvertFrom-Json
$customInstallerVerify = Get-Content -Path $fullCustomInstallerVerifyFile -Raw -Encoding UTF8 | ConvertFrom-Json
$hash = Get-Content -Path $fullHashFile -Raw -Encoding UTF8 | ConvertFrom-Json
$chunk = Get-Content -Path $fullBuildChunkFile -Raw -Encoding UTF8 | ConvertFrom-Json

$index = [ordered]@{
  generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  ready = [bool]$pipeline.ready
  latest = [ordered]@{
    packageDir = "artifacts/desk-win/latest"
    packageZip = "artifacts/desk-win/latest.zip"
    executable = $pipeline.package.exePath
    webIndex = $pipeline.package.webIndex
    installerExe = $installer.installer.path
    customInstallerExe = $customInstaller.installer.path
  }
  reports = [ordered]@{
    pipeline = $PipelineFile
    summary = $SummaryFile
    releaseNotes = $ReleaseNotesFile
    productionHandoff = $ProductionHandoffFile
    installer = $InstallerReportFile
    installerVerify = $InstallerVerifyFile
    customInstaller = $CustomInstallerReportFile
    customInstallerVerify = $CustomInstallerVerifyFile
    boundary = $BoundaryReportFile
    hashes = $HashFile
    buildChunks = $BuildChunkFile
  }
  hashes = [ordered]@{
    exe = $hash.targets.exe.sha256
    webIndex = $hash.targets.webIndex.sha256
    bundleZip = $hash.targets.bundleZip.sha256
  }
  buildChunks = [ordered]@{
    oversizeJsCount = [int]$chunk.summary.oversizeJsCount
    largestJs = [string]$chunk.summary.largestJs.name
    largestJsKb = [double]$chunk.summary.largestJs.sizeKb
  }
  installer = [ordered]@{
    exe = $installer.installer.path
    sha256 = $installer.hashes.installer.sha256
    verified = [bool]$installerVerify.ready
  }
  customInstaller = [ordered]@{
    exe = $customInstaller.installer.path
    sha256 = $customInstaller.hashes.installer.sha256
    verified = [bool]$customInstallerVerify.ready
  }
}

$json = $index | ConvertTo-Json -Depth 8
$jsonDir = Split-Path -Parent $fullOutJsonFile
if ($jsonDir -and -not (Test-Path $jsonDir)) {
  New-Item -ItemType Directory -Path $jsonDir -Force | Out-Null
}
Set-Content -Path $fullOutJsonFile -Value $json -Encoding UTF8

$md = @(
  "# Desk-win Delivery Index",
  "",
  "- GeneratedAt: $($index.generatedAt)",
  "- Ready: $($index.ready)",
  "",
  "## Latest",
  "",
  "- PackageDir: $($index.latest.packageDir)",
  "- PackageZip: $($index.latest.packageZip)",
  "- Executable: $($index.latest.executable)",
  "- WebIndex: $($index.latest.webIndex)",
  "- InstallerExe: $($index.latest.installerExe)",
  "- CustomInstallerExe: $($index.latest.customInstallerExe)",
  "",
  "## Reports",
  "",
  "- Pipeline: $($index.reports.pipeline)",
  "- Summary: $($index.reports.summary)",
  "- ReleaseNotes: $($index.reports.releaseNotes)",
  "- ProductionHandoff: $($index.reports.productionHandoff)",
  "- Installer: $($index.reports.installer)",
  "- InstallerVerify: $($index.reports.installerVerify)",
  "- CustomInstaller: $($index.reports.customInstaller)",
  "- CustomInstallerVerify: $($index.reports.customInstallerVerify)",
  "- Boundary: $($index.reports.boundary)",
  "- Hashes: $($index.reports.hashes)",
  "- BuildChunks: $($index.reports.buildChunks)",
  "",
  "## Hashes",
  "",
  "- ExeSha256: $($index.hashes.exe)",
  "- WebIndexSha256: $($index.hashes.webIndex)",
  "- BundleZipSha256: $($index.hashes.bundleZip)",
  "",
  "## Build Chunks",
  "",
  "- OversizeJsCount: $($index.buildChunks.oversizeJsCount)",
  "- LargestJs: $($index.buildChunks.largestJs)",
  "- LargestJsKb: $($index.buildChunks.largestJsKb)",
  "",
  "## Installer",
  "",
  "- InstallerExe: $($index.installer.exe)",
  "- InstallerSha256: $($index.installer.sha256)",
  "- InstallerVerified: $($index.installer.verified)",
  "",
  "## Custom Installer",
  "",
  "- CustomInstallerExe: $($index.customInstaller.exe)",
  "- CustomInstallerSha256: $($index.customInstaller.sha256)",
  "- CustomInstallerVerified: $($index.customInstaller.verified)"
)

$mdDir = Split-Path -Parent $fullOutMdFile
if ($mdDir -and -not (Test-Path $mdDir)) {
  New-Item -ItemType Directory -Path $mdDir -Force | Out-Null
}
Set-Content -Path $fullOutMdFile -Value ($md -join [Environment]::NewLine) -Encoding UTF8

$json
