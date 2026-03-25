[CmdletBinding()]
param(
  [string]$InputFile = "docs/unified/reports/field-docker-mqtt-path-latest.json",
  [string]$OutFile = "docs/unified/reports/field-docker-mqtt-summary-latest.json"
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Read-JsonFile([string]$path) {
  if (-not (Test-Path $path)) {
    throw "Missing report: $path"
  }
  $raw = Get-Content -Raw -Encoding UTF8 $path
  if ($raw.Length -gt 0 -and [int][char]$raw[0] -eq 65279) {
    $raw = $raw.Substring(1)
  }
  return $raw | ConvertFrom-Json
}

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$report = Read-JsonFile (Join-Path $repoRoot $InputFile)

$summary = [ordered]@{
  generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  sample = $report.sample
  deviceId = $report.device.deviceId
  allStepsOk = (@($report.steps | Where-Object { -not $_.ok }).Count -eq 0)
  stepCount = @($report.steps).Count
  steps = @($report.steps | ForEach-Object {
    [ordered]@{
      name = $_.name
      ok = $_.ok
    }
  })
  publish = $report.outputs.publish
  acceptance = $report.outputs.acceptance
  evidenceSummary = $report.evidenceSummary
}

$fullOutFile = Join-Path $repoRoot $OutFile
$outDir = Split-Path -Parent $fullOutFile
if ($outDir -and -not (Test-Path $outDir)) {
  New-Item -ItemType Directory -Path $outDir -Force | Out-Null
}

$json = $summary | ConvertTo-Json -Depth 8
Set-Content -Path $fullOutFile -Value $json -Encoding UTF8
$json
