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

$manifest = Get-Content $fullManifestFile -Raw -Encoding UTF8 | ConvertFrom-Json
$summary = $manifest.summarySnapshot
$gpsProfileStressIncluded = [bool]$summary.stress.gpsProfileStressIncluded
$operatingModel = if ($gpsProfileStressIncluded) {
  Invoke-JsonScript "Desk GPS threshold operating model proof" {
    powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repoRoot "scripts/dev/check-desk-gps-threshold-operating-model.ps1")
  }
} else {
  $manifest.gpsThresholdOperatingModel
}

$coordinationStatus = Invoke-JsonScript "Mainline coordination status" {
  powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repoRoot "scripts/dev/show-mainline-coordination-status.ps1")
}

$openGaps = Invoke-JsonScript "Mainline open gaps" {
  powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repoRoot "scripts/dev/show-mainline-open-gaps.ps1")
}

$checks = @(
  [pscustomobject]@{
    key = "completedChecks"
    ok = if ($gpsProfileStressIncluded) { ([int]$summary.completedChecks -ge 44) } else { ([int]$summary.completedChecks -ge 26) }
    actual = [int]$summary.completedChecks
    expected = if ($gpsProfileStressIncluded) { ">=44" } else { ">=26" }
  },
  [pscustomobject]@{
    key = "operatingProfiles"
    ok = if ($gpsProfileStressIncluded) { ([int]$summary.pageProofs.gpsThresholdOperatingProfiles -eq 3) } else { $true }
    actual = if ($gpsProfileStressIncluded) { [int]$summary.pageProofs.gpsThresholdOperatingProfiles } else { "skipped" }
    expected = if ($gpsProfileStressIncluded) { 3 } else { "skipped" }
  },
  [pscustomobject]@{
    key = "operatingModelAlignment"
    ok = if ($gpsProfileStressIncluded) { [bool]$operatingModel.gpsThresholdOperatingModel.boardExecutionAlignmentStable } else { $true }
    actual = if ($gpsProfileStressIncluded) { [bool]$operatingModel.gpsThresholdOperatingModel.boardExecutionAlignmentStable } else { "skipped" }
    expected = if ($gpsProfileStressIncluded) { $true } else { "skipped" }
  },
  [pscustomobject]@{
    key = "responseOrdering"
    ok = if ($gpsProfileStressIncluded) { [bool]$operatingModel.gpsThresholdOperatingModel.responseOrderingStable } else { $true }
    actual = if ($gpsProfileStressIncluded) { [bool]$operatingModel.gpsThresholdOperatingModel.responseOrderingStable } else { "skipped" }
    expected = if ($gpsProfileStressIncluded) { $true } else { "skipped" }
  },
  [pscustomobject]@{
    key = "escalationCoverage"
    ok = if ($gpsProfileStressIncluded) { [bool]$operatingModel.gpsThresholdOperatingModel.escalationCoverageStable } else { $true }
    actual = if ($gpsProfileStressIncluded) { [bool]$operatingModel.gpsThresholdOperatingModel.escalationCoverageStable } else { "skipped" }
    expected = if ($gpsProfileStressIncluded) { $true } else { "skipped" }
  },
  [pscustomobject]@{
    key = "openGaps"
    ok = ([int]$openGaps.totalItems -eq 0)
    actual = [int]$openGaps.totalItems
    expected = 0
  },
  [pscustomobject]@{
    key = "rainfallTruth"
    ok = ([int]$coordinationStatus.proof.rainfall -ge 0)
    actual = [int]$coordinationStatus.proof.rainfall
    expected = ">=0"
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
