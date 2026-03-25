[CmdletBinding()]
param(
  [string]$ManifestFile = "docs/unified/reports/desk-mainline-proof-manifest-latest.json",
  [string]$TaskQueueFile = "docs/unified/task-queue.md",
  [string]$OutFile = "docs/unified/reports/mainline-coordination-status-latest.json"
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$fullManifestFile = Join-Path $repoRoot $ManifestFile
$fullTaskQueueFile = Join-Path $repoRoot $TaskQueueFile
$fullOutFile = Join-Path $repoRoot $OutFile

if (-not (Test-Path $fullManifestFile)) {
  throw "manifest not found: $ManifestFile"
}
if (-not (Test-Path $fullTaskQueueFile)) {
  throw "task queue not found: $TaskQueueFile"
}

$manifest = Get-Content $fullManifestFile -Raw -Encoding UTF8 | ConvertFrom-Json
$taskQueueLines = Get-Content $fullTaskQueueFile -Encoding UTF8
$batchRows =
  $taskQueueLines |
  Where-Object { $_ -match '^\|\s*\d+\s*\|\s*`desk-batch-[^`]+`\s*\|' }

$latestBatch = $null
if ($batchRows.Count -gt 0) {
  $lastRow = $batchRows[-1]
  $cells = @($lastRow -split '\|').ForEach({ $_.Trim() }) | Where-Object { $_ -ne "" }
  if ($cells.Count -ge 5) {
    $latestBatch = [ordered]@{
      order = [int]$cells[0]
      taskId = ($cells[1] -replace '^`|`$', '')
      status = ($cells[2] -replace '^`|`$', '')
      topic = $cells[3]
      note = $cells[4]
    }
  }
}

$summary = $manifest.summarySnapshot
$diff = $manifest.diff

$status = [ordered]@{
  generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  manifestGeneratedAt = $manifest.generatedAt
  latestBatch = $latestBatch
  proof = [ordered]@{
    completedChecks = [int]$summary.completedChecks
    stations = [int]$summary.demoTruth.stationCount
    devices = [int]$summary.demoTruth.totalDevices
    online = [int]$summary.demoTruth.onlineDevices
    alerts = [int]$summary.demoTruth.alertCountToday
    rainfall = [int]$summary.demoTruth.rainfallSum
    viewerDenied = [int]$summary.viewerBoundary.deniedCount
  }
  history = [ordered]@{
    totalSnapshots = [int]$manifest.history.totalSnapshots
    currentStamp = $manifest.history.currentStamp
    previousStamp = $manifest.history.previousStamp
  }
  diff = [ordered]@{
    hasPrevious = [bool]$diff.hasPrevious
    unchanged = if ($diff.hasPrevious -and $diff.delta) {
      (($diff.delta.PSObject.Properties | ForEach-Object { [int]$_.Value }) | Measure-Object -Sum).Sum -eq 0
    } else {
      $null
    }
    hasLastMatching = [bool]$diff.hasLastMatching
    lastMatchingStamp = if ($diff.lastMatching) { $diff.lastMatching.stamp } else { $null }
    unchangedVsLastMatching = if ($diff.hasLastMatching -and $diff.deltaFromLastMatching) {
      (($diff.deltaFromLastMatching.PSObject.Properties | ForEach-Object { [int]$_.Value }) | Measure-Object -Sum).Sum -eq 0
    } else {
      $null
    }
    delta = $diff.delta
    deltaFromLastMatching = $diff.deltaFromLastMatching
  }
}

$json = $status | ConvertTo-Json -Depth 20
$outDir = Split-Path -Parent $fullOutFile
if ($outDir -and -not (Test-Path $outDir)) {
  New-Item -ItemType Directory -Path $outDir -Force | Out-Null
}
Set-Content -Path $fullOutFile -Value $json -Encoding UTF8
$json
