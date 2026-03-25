[CmdletBinding()]
param(
  [string]$ManifestFile = "docs/unified/reports/desk-mainline-proof-manifest-latest.json"
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$fullManifestFile = Join-Path $repoRoot $ManifestFile

if (-not (Test-Path $fullManifestFile)) {
  throw "manifest not found: $ManifestFile"
}

$manifest = Get-Content $fullManifestFile -Raw | ConvertFrom-Json
$summary = $manifest.summarySnapshot
$diff = $manifest.diff

$status = [ordered]@{
  generatedAt = $manifest.generatedAt
  baseUrl = $manifest.baseUrl
  latest = $manifest.latest
  history = $manifest.history
  summary = [ordered]@{
    completedChecks = [int]$summary.completedChecks
    stations = [int]$summary.demoTruth.stationCount
    devices = [int]$summary.demoTruth.totalDevices
    online = [int]$summary.demoTruth.onlineDevices
    alerts = [int]$summary.demoTruth.alertCountToday
    rainfall = [int]$summary.demoTruth.rainfallSum
    missingBaselines = [int]$summary.demoTruth.missingBaselineCount
    viewerDenied = [int]$summary.viewerBoundary.deniedCount
    diagnosticsType = $summary.pageProofs.diagnosticsType
  }
  diff = [ordered]@{
    hasPrevious = [bool]$diff.hasPrevious
    currentStamp = $diff.current.stamp
    previousStamp = $diff.previous.stamp
    delta = $diff.delta
    unchanged = if ($diff.hasPrevious -and $diff.delta) {
      (($diff.delta.PSObject.Properties | ForEach-Object { [int]$_.Value }) | Measure-Object -Sum).Sum -eq 0
    } else {
      $null
    }
  }
}

$status | ConvertTo-Json -Depth 20
