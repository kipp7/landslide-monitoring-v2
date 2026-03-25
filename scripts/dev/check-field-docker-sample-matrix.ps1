[CmdletBinding()]
param(
  [string]$Samples = "hf-normal,hf-duplicate,hf-out-of-order,hf-replay,lf-meta,hf-oversized",
  [string]$OutFile = "docs/unified/reports/field-docker-mqtt-matrix-latest.json"
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Read-JsonFile([string]$Path) {
  $raw = Get-Content -Raw -Encoding UTF8 $Path
  if ($raw.Length -gt 0 -and [int][char]$raw[0] -eq 65279) {
    $raw = $raw.Substring(1)
  }
  return $raw | ConvertFrom-Json
}

function Parse-JsonText([string]$Text) {
  if ([string]::IsNullOrWhiteSpace($Text)) {
    return $null
  }

  try {
    return $Text | ConvertFrom-Json
  } catch {
    return $null
  }
}

function Get-RelativePath([string]$BasePath, [string]$TargetPath) {
  $baseFull = [System.IO.Path]::GetFullPath($BasePath)
  if (-not $baseFull.EndsWith([System.IO.Path]::DirectorySeparatorChar)) {
    $baseFull += [System.IO.Path]::DirectorySeparatorChar
  }
  $targetFull = [System.IO.Path]::GetFullPath($TargetPath)
  $baseUri = [System.Uri]::new($baseFull)
  $targetUri = [System.Uri]::new($targetFull)
  return [System.Uri]::UnescapeDataString($baseUri.MakeRelativeUri($targetUri).ToString()).Replace('/', '\')
}

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Push-Location $repoRoot
try {
  $sampleList = @($Samples.Split(",") | ForEach-Object { $_.Trim() } | Where-Object { $_ })
  if ($sampleList.Count -eq 0) {
    throw "No samples provided."
  }

  $matrixRunDir = Join-Path $repoRoot ("backups/evidence/field-docker-mqtt-matrix-" + (Get-Date -Format "yyyyMMdd-HHmmss"))
  New-Item -ItemType Directory -Path $matrixRunDir -Force | Out-Null

  $results = [System.Collections.Generic.List[object]]::new()

  foreach ($sample in $sampleList) {
    $reportFile = Join-Path $matrixRunDir ("docker-path-" + $sample + ".json")
    $summaryFile = Join-Path $matrixRunDir ("docker-summary-" + $sample + ".json")
    $relativeReportFile = Get-RelativePath $repoRoot $reportFile
    $relativeSummaryFile = Get-RelativePath $repoRoot $summaryFile
    $startedAt = (Get-Date).ToUniversalTime().ToString("o")

    try {
      powershell -NoProfile -ExecutionPolicy Bypass -File "scripts/dev/run-field-rehearsal-docker.ps1" -Sample $sample -OutFile $relativeReportFile -CleanupAfter | Out-Null
      powershell -NoProfile -ExecutionPolicy Bypass -File "scripts/dev/render-field-docker-mqtt-summary.ps1" -InputFile $relativeReportFile -OutFile $relativeSummaryFile | Out-Null

      $report = Read-JsonFile $reportFile
      $summary = Read-JsonFile $summaryFile
      $stepFailures = @($report.steps | Where-Object { -not $_.ok } | ForEach-Object { $_.name })
      $publishEnvelope = Parse-JsonText $summary.publish
      $acceptanceEnvelope = Parse-JsonText $summary.acceptance

      $results.Add([ordered]@{
        sample = $sample
        startedAt = $startedAt
        ok = ($stepFailures.Count -eq 0)
        expectedDisposition = if ($sample -eq "hf-oversized") { "rejection-or-downgrade-candidate" } else { "transport-success-path" }
        stepCount = @($report.steps).Count
        failedSteps = $stepFailures
        deviceId = $report.device.deviceId
        publish = [ordered]@{
          mode = if ($publishEnvelope) { $publishEnvelope.mode } else { $null }
          sample = if ($publishEnvelope) { $publishEnvelope.sample } else { $null }
          topic = if ($publishEnvelope) { $publishEnvelope.topic } else { $null }
          mqttUrl = if ($publishEnvelope) { $publishEnvelope.mqttUrl } else { $null }
          bytes = if ($publishEnvelope) { $publishEnvelope.bytes } else { $null }
        }
        acceptance = [ordered]@{
          loginStatus = if ($acceptanceEnvelope) { $acceptanceEnvelope.login.status } else { $null }
          allChecksOk = if ($acceptanceEnvelope) { (@($acceptanceEnvelope.checks | Where-Object { -not $_.ok }).Count -eq 0) } else { $null }
          checkStatuses = if ($acceptanceEnvelope) {
            @($acceptanceEnvelope.checks | ForEach-Object {
              [ordered]@{
                url = $_.url
                status = $_.status
                ok = $_.ok
              }
            })
          } else {
            @()
          }
        }
        reportFile = $reportFile
        summaryFile = $summaryFile
        evidenceSummary = $summary.evidenceSummary
      }) | Out-Null
    } catch {
      $results.Add([ordered]@{
        sample = $sample
        startedAt = $startedAt
        ok = $false
        expectedDisposition = if ($sample -eq "hf-oversized") { "rejection-or-downgrade-candidate" } else { "transport-success-path" }
        failedSteps = @("matrix-run")
        error = ($_ | Out-String).Trim()
        reportFile = $reportFile
        summaryFile = $summaryFile
      }) | Out-Null
    }
  }

  $failedSamples = @($results | Where-Object { -not $_.ok } | ForEach-Object { $_.sample })
  $matrix = [ordered]@{
    generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    sampleCount = $sampleList.Count
    allPassed = ($failedSamples.Count -eq 0)
    failedSamples = $failedSamples
    notes = @(
      "This matrix verifies the Docker-network MQTT transport workflow across multiple rehearsal samples.",
      "hf-oversized remains a domain-level rejection/downgrade candidate; current matrix only proves transport and platform acceptance workflow execution."
    )
    samples = $results
    matrixRunDir = $matrixRunDir
  }

  $fullOutFile = Join-Path $repoRoot $OutFile
  $outDir = Split-Path -Parent $fullOutFile
  if ($outDir -and -not (Test-Path $outDir)) {
    New-Item -ItemType Directory -Path $outDir -Force | Out-Null
  }

  $json = $matrix | ConvertTo-Json -Depth 8
  Set-Content -Path $fullOutFile -Value $json -Encoding UTF8
  $json

  if ($failedSamples.Count -gt 0) {
    throw "field docker sample matrix failed for: $($failedSamples -join ', ')"
  }
} finally {
  Pop-Location
}
