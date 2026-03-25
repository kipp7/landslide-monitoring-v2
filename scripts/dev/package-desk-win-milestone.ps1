[CmdletBinding()]
param(
  [string]$Tag = "",
  [string]$OutDir = "artifacts/desk-win/milestones",
  [string]$OutFile = "docs/unified/reports/desk-win-milestone-latest.json"
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$fullOutDir = Join-Path $repoRoot $OutDir
$fullOutFile = Join-Path $repoRoot $OutFile

$requiredFiles = @(
  "artifacts/desk-win/latest.zip",
  "artifacts/desk-win/installer/LandslideDesk-Setup-win-x64-938f86e.exe",
  "docs/unified/reports/desk-win-delivery-index-latest.json",
  "docs/unified/reports/desk-win-delivery-summary-latest.md",
  "docs/unified/reports/desk-win-release-notes-latest.md",
  "docs/unified/reports/desk-win-production-handoff-latest.md",
  "docs/unified/reports/desk-win-installer-verify-latest.json",
  "docs/unified/reports/desk-win-customba-installer-latest.json",
  "docs/unified/reports/desk-win-customba-installer-verify-latest.json",
  "docs/unified/reports/desk-win-latest-package-verify-latest.json",
  "docs/unified/reports/desk-win-manual-acceptance-latest.md",
  "docs/unified/reports/desk-win-manual-acceptance-latest.json"
)

foreach ($path in $requiredFiles) {
  $full = Join-Path $repoRoot $path
  if (-not (Test-Path $full)) {
    throw "required file not found: $path"
  }
}

$customInstaller = Get-Content -Path (Join-Path $repoRoot "docs/unified/reports/desk-win-customba-installer-latest.json") -Raw -Encoding UTF8 | ConvertFrom-Json
$customInstallerPath = [string]$customInstaller.installer.path
if (-not (Test-Path $customInstallerPath)) {
  throw "custom installer not found: $customInstallerPath"
}

if (-not $Tag) {
  $Tag = Get-Date -Format "yyyyMMdd-HHmmss"
}

$milestoneName = "desk-win-milestone-$Tag"
$milestoneDir = Join-Path $fullOutDir $milestoneName
$milestoneZip = Join-Path $fullOutDir "$milestoneName.zip"

if (Test-Path $milestoneDir) {
  Remove-Item -Path $milestoneDir -Recurse -Force
}
if (Test-Path $milestoneZip) {
  Remove-Item -Path $milestoneZip -Force
}

New-Item -ItemType Directory -Path $milestoneDir -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $milestoneDir "deliverables") -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $milestoneDir "docs") -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $milestoneDir "reports") -Force | Out-Null

Copy-Item -Path (Join-Path $repoRoot "artifacts/desk-win/latest.zip") -Destination (Join-Path $milestoneDir "deliverables/latest.zip") -Force
Copy-Item -Path (Join-Path $repoRoot "artifacts/desk-win/installer/LandslideDesk-Setup-win-x64-938f86e.exe") -Destination (Join-Path $milestoneDir "deliverables") -Force
Copy-Item -Path $customInstallerPath -Destination (Join-Path $milestoneDir "deliverables") -Force

Copy-Item -Path (Join-Path $repoRoot "docs/unified/reports/desk-win-delivery-index-latest.json") -Destination (Join-Path $milestoneDir "docs") -Force
Copy-Item -Path (Join-Path $repoRoot "docs/unified/reports/desk-win-delivery-summary-latest.md") -Destination (Join-Path $milestoneDir "docs") -Force
Copy-Item -Path (Join-Path $repoRoot "docs/unified/reports/desk-win-release-notes-latest.md") -Destination (Join-Path $milestoneDir "docs") -Force
Copy-Item -Path (Join-Path $repoRoot "docs/unified/reports/desk-win-production-handoff-latest.md") -Destination (Join-Path $milestoneDir "docs") -Force
Copy-Item -Path (Join-Path $repoRoot "docs/unified/reports/desk-win-manual-acceptance-latest.md") -Destination (Join-Path $milestoneDir "docs") -Force

Copy-Item -Path (Join-Path $repoRoot "docs/unified/reports/desk-win-installer-verify-latest.json") -Destination (Join-Path $milestoneDir "reports") -Force
Copy-Item -Path (Join-Path $repoRoot "docs/unified/reports/desk-win-customba-installer-latest.json") -Destination (Join-Path $milestoneDir "reports") -Force
Copy-Item -Path (Join-Path $repoRoot "docs/unified/reports/desk-win-customba-installer-verify-latest.json") -Destination (Join-Path $milestoneDir "reports") -Force
Copy-Item -Path (Join-Path $repoRoot "docs/unified/reports/desk-win-latest-package-verify-latest.json") -Destination (Join-Path $milestoneDir "reports") -Force
Copy-Item -Path (Join-Path $repoRoot "docs/unified/reports/desk-win-delivery-pipeline-latest.json") -Destination (Join-Path $milestoneDir "reports") -Force
Copy-Item -Path (Join-Path $repoRoot "docs/unified/reports/desk-win-manual-acceptance-latest.json") -Destination (Join-Path $milestoneDir "reports") -Force
Copy-Item -Path (Join-Path $repoRoot "docs/unified/reports/desk-win-delivery-hash-latest.json") -Destination (Join-Path $milestoneDir "reports") -Force

$readme = @"
Desk-win Milestone Package

Contents:
- deliverables/latest.zip
- deliverables/LandslideDesk-Setup-win-x64-938f86e.exe
- deliverables/$([System.IO.Path]::GetFileName($customInstallerPath))
- docs/desk-win-delivery-summary-latest.md
- docs/desk-win-release-notes-latest.md
- docs/desk-win-production-handoff-latest.md
- docs/desk-win-manual-acceptance-latest.md
- reports/*.json

Recommended use:
1. Read delivery summary and production handoff
2. Use manual acceptance checklist for stage review
3. Prefer custom BA as the premium branded path
4. Keep Inno as fallback install path
"@
Set-Content -Path (Join-Path $milestoneDir "README.txt") -Value $readme -Encoding UTF8

Compress-Archive -Path (Join-Path $milestoneDir "*") -DestinationPath $milestoneZip -Force

$result = [ordered]@{
  generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  milestoneName = $milestoneName
  milestoneDir = $milestoneDir
  milestoneZip = $milestoneZip
  customInstaller = $customInstallerPath
  innoInstaller = Join-Path $repoRoot "artifacts/desk-win/installer/LandslideDesk-Setup-win-x64-938f86e.exe"
  latestZip = Join-Path $repoRoot "artifacts/desk-win/latest.zip"
}

$outReportDir = Split-Path -Parent $fullOutFile
if ($outReportDir -and -not (Test-Path $outReportDir)) {
  New-Item -ItemType Directory -Path $outReportDir -Force | Out-Null
}
Set-Content -Path $fullOutFile -Value ($result | ConvertTo-Json -Depth 6) -Encoding UTF8

$result | ConvertTo-Json -Depth 6
