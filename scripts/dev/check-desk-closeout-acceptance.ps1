[CmdletBinding()]
param(
  [string]$ManifestFile = "docs/unified/reports/desk-mainline-proof-manifest-latest.json",
  [string]$CoordinationStatusFile = "docs/unified/reports/mainline-coordination-status-latest.json",
  [string]$OpenGapsFile = "docs/unified/reports/mainline-open-gaps-latest.json",
  [string]$OutFile = "docs/unified/reports/desk-closeout-acceptance-latest.json"
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$fullManifestFile = Join-Path $repoRoot $ManifestFile
$fullCoordinationStatusFile = Join-Path $repoRoot $CoordinationStatusFile
$fullOpenGapsFile = Join-Path $repoRoot $OpenGapsFile
$fullOutFile = Join-Path $repoRoot $OutFile

function Invoke-JsonScript([string]$label, [scriptblock]$action) {
  Write-Host "==> $label" -ForegroundColor Cyan
  $output = & $action | Out-String
  if ($LASTEXITCODE -ne 0) {
    throw "$label failed (exit=$LASTEXITCODE)"
  }
  $trimmed = $output.Trim()
  if (-not $trimmed) {
    throw "$label returned empty output"
  }
  return $trimmed | ConvertFrom-Json
}

if (-not (Test-Path $fullManifestFile)) {
  throw "manifest not found: $ManifestFile"
}

$operatingModel = Invoke-JsonScript "Desk GPS threshold operating model proof" {
  powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repoRoot "scripts/dev/check-desk-gps-threshold-operating-model.ps1")
}

$coordinationStatus = Invoke-JsonScript "Mainline coordination status" {
  powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repoRoot "scripts/dev/show-mainline-coordination-status.ps1")
}

$openGaps = Invoke-JsonScript "Mainline open gaps" {
  powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repoRoot "scripts/dev/show-mainline-open-gaps.ps1")
}

$manifest = Get-Content $fullManifestFile -Raw -Encoding UTF8 | ConvertFrom-Json

$summary = $manifest.summarySnapshot
$checks = @(
  [pscustomobject]@{
    key = "completedChecks"
    ok = ([int]$summary.completedChecks -ge 44)
    actual = [int]$summary.completedChecks
    expected = ">=44"
  },
  [pscustomobject]@{
    key = "operatingProfiles"
    ok = ([int]$summary.pageProofs.gpsThresholdOperatingProfiles -eq 3)
    actual = [int]$summary.pageProofs.gpsThresholdOperatingProfiles
    expected = 3
  },
  [pscustomobject]@{
    key = "operatingModelAlignment"
    ok = [bool]$operatingModel.gpsThresholdOperatingModel.boardExecutionAlignmentStable
    actual = [bool]$operatingModel.gpsThresholdOperatingModel.boardExecutionAlignmentStable
    expected = $true
  },
  [pscustomobject]@{
    key = "responseOrdering"
    ok = [bool]$operatingModel.gpsThresholdOperatingModel.responseOrderingStable
    actual = [bool]$operatingModel.gpsThresholdOperatingModel.responseOrderingStable
    expected = $true
  },
  [pscustomobject]@{
    key = "escalationCoverage"
    ok = [bool]$operatingModel.gpsThresholdOperatingModel.escalationCoverageStable
    actual = [bool]$operatingModel.gpsThresholdOperatingModel.escalationCoverageStable
    expected = $true
  },
  [pscustomobject]@{
    key = "openGaps"
    ok = ([int]$openGaps.totalItems -eq 0)
    actual = [int]$openGaps.totalItems
    expected = 0
  },
  [pscustomobject]@{
    key = "rainfallTruth"
    ok = ([int]$coordinationStatus.proof.rainfall -eq 79)
    actual = [int]$coordinationStatus.proof.rainfall
    expected = 79
  },
  [pscustomobject]@{
    key = "viewerBoundary"
    ok = ([int]$coordinationStatus.proof.viewerDenied -eq 5)
    actual = [int]$coordinationStatus.proof.viewerDenied
    expected = 5
  },
  [pscustomobject]@{
    key = "healthOk"
    ok = [bool]$summary.healthOk
    actual = [bool]$summary.healthOk
    expected = $true
  }
)

$failed = @($checks | Where-Object { -not $_.ok })
if ($failed.Count -gt 0) {
  $failedKeys = ($failed | ForEach-Object { $_.key }) -join ", "
  throw "desk closeout acceptance failed: $failedKeys"
}

$report = [ordered]@{
  generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  accepted = $true
  closeout = [ordered]@{
    readyToFreeze = $true
    latestBatchTaskId = $coordinationStatus.latestBatch.taskId
    completedChecks = [int]$coordinationStatus.proof.completedChecks
    rainfall = [int]$coordinationStatus.proof.rainfall
    openGaps = [int]$openGaps.totalItems
    operatingProfiles = [int]$summary.pageProofs.gpsThresholdOperatingProfiles
  }
  checks = $checks
}

$json = $report | ConvertTo-Json -Depth 20
$outDir = Split-Path -Parent $fullOutFile
if ($outDir -and -not (Test-Path $outDir)) {
  New-Item -ItemType Directory -Path $outDir -Force | Out-Null
}
Set-Content -Path $fullOutFile -Value $json -Encoding UTF8
$json
