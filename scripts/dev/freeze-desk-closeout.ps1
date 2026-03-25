[CmdletBinding()]
param(
  [string]$AcceptanceFile = "docs/unified/reports/desk-closeout-acceptance-latest.json",
  [string]$ManifestFile = "docs/unified/reports/desk-mainline-proof-manifest-latest.json",
  [string]$CoordinationStatusFile = "docs/unified/reports/mainline-coordination-status-latest.json",
  [string]$OpenGapsFile = "docs/unified/reports/mainline-open-gaps-latest.json",
  [string]$OutJsonFile = "docs/unified/reports/desk-closeout-freeze-latest.json",
  [string]$OutMdFile = "docs/unified/reports/desk-closeout-freeze-latest.md"
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$fullAcceptanceFile = Join-Path $repoRoot $AcceptanceFile
$fullManifestFile = Join-Path $repoRoot $ManifestFile
$fullCoordinationStatusFile = Join-Path $repoRoot $CoordinationStatusFile
$fullOpenGapsFile = Join-Path $repoRoot $OpenGapsFile
$fullOutJsonFile = Join-Path $repoRoot $OutJsonFile
$fullOutMdFile = Join-Path $repoRoot $OutMdFile

foreach ($path in @($fullAcceptanceFile, $fullManifestFile, $fullCoordinationStatusFile, $fullOpenGapsFile)) {
  if (-not (Test-Path $path)) {
    throw "required file not found: $path"
  }
}

$acceptance = Get-Content $fullAcceptanceFile -Raw -Encoding UTF8 | ConvertFrom-Json
$manifest = Get-Content $fullManifestFile -Raw -Encoding UTF8 | ConvertFrom-Json
$coordination = Get-Content $fullCoordinationStatusFile -Raw -Encoding UTF8 | ConvertFrom-Json
$openGaps = Get-Content $fullOpenGapsFile -Raw -Encoding UTF8 | ConvertFrom-Json

if (-not $acceptance.accepted -or -not $acceptance.closeout.readyToFreeze) {
  throw "closeout freeze blocked: acceptance has not passed"
}

$frozenAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
$freezeStamp = (Get-Date).ToUniversalTime().ToString("yyyyMMdd-HHmmss")

$report = [ordered]@{
  frozenAt = $frozenAt
  freezeStamp = $freezeStamp
  freezeDate = "2026-03-20"
  accepted = [bool]$acceptance.accepted
  readyToFreeze = [bool]$acceptance.closeout.readyToFreeze
  baseline = [ordered]@{
    latestBatchTaskId = $coordination.latestBatch.taskId
    completedChecks = [int]$coordination.proof.completedChecks
    rainfall = [int]$coordination.proof.rainfall
    viewerDenied = [int]$coordination.proof.viewerDenied
    openGaps = [int]$openGaps.totalItems
    operatingProfiles = [int]$acceptance.closeout.operatingProfiles
    historyStamp = $manifest.history.currentStamp
    manifestGeneratedAt = $manifest.generatedAt
    summaryGeneratedAt = $manifest.summarySnapshot.generatedAt
  }
  constraints = [ordered]@{
    freezeScope = "Desk mainline closeout baseline"
    uiChangesAllowed = $false
    nextActionPolicy = "only_fix_required_defects"
  }
  checks = $acceptance.checks
}

$json = $report | ConvertTo-Json -Depth 20
$jsonDir = Split-Path -Parent $fullOutJsonFile
if ($jsonDir -and -not (Test-Path $jsonDir)) {
  New-Item -ItemType Directory -Path $jsonDir -Force | Out-Null
}
Set-Content -Path $fullOutJsonFile -Value $json -Encoding UTF8

$md = @(
  "# Desk Closeout Freeze",
  "",
  "- FrozenAt: $($report.frozenAt)",
  "- FreezeStamp: $($report.freezeStamp)",
  "- FreezeDate: $($report.freezeDate)",
  "- Accepted: $($report.accepted)",
  "- ReadyToFreeze: $($report.readyToFreeze)",
  "",
  "## Baseline",
  "",
  "- LatestBatchTaskId: $($report.baseline.latestBatchTaskId)",
  "- CompletedChecks: $($report.baseline.completedChecks)",
  "- Rainfall: $($report.baseline.rainfall)",
  "- ViewerDenied: $($report.baseline.viewerDenied)",
  "- OpenGaps: $($report.baseline.openGaps)",
  "- OperatingProfiles: $($report.baseline.operatingProfiles)",
  "- HistoryStamp: $($report.baseline.historyStamp)",
  "- ManifestGeneratedAt: $($report.baseline.manifestGeneratedAt)",
  "- SummaryGeneratedAt: $($report.baseline.summaryGeneratedAt)",
  "",
  "## Constraints",
  "",
  "- FreezeScope: $($report.constraints.freezeScope)",
  "- UiChangesAllowed: $($report.constraints.uiChangesAllowed)",
  "- NextActionPolicy: $($report.constraints.nextActionPolicy)"
)

$mdDir = Split-Path -Parent $fullOutMdFile
if ($mdDir -and -not (Test-Path $mdDir)) {
  New-Item -ItemType Directory -Path $mdDir -Force | Out-Null
}
Set-Content -Path $fullOutMdFile -Value ($md -join [Environment]::NewLine) -Encoding UTF8

$json
