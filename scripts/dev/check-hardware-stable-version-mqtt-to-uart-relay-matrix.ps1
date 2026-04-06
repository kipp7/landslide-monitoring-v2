param(
  [string]$MqttUrl = "mqtt://127.0.0.1:1883",
  [int]$TimeoutSeconds = 15,
  [string]$OutFile = "docs/unified/reports/hardware-stable-version-mqtt-to-uart-relay-matrix-latest.json"
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Read-JsonFile {
  param([string]$Path)
  return (Get-Content -Raw -Encoding UTF8 $Path | ConvertFrom-Json)
}

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$sampleReportFile = Join-Path $repoRoot "docs/unified/reports/hardware-stable-version-gateway-command-samples-latest.json"
$proofScript = Join-Path $repoRoot "scripts/dev/check-hardware-stable-version-mqtt-to-uart-relay-proof.ps1"

Push-Location $repoRoot
try {
  $sampleReport = Read-JsonFile $sampleReportFile
  $sampleNames = @()
  foreach ($sample in $sampleReport.alignedSamples) {
    $sampleNames += [string]$sample.commandType
  }
  $sampleNames += "mismatch"

  $results = @()
  foreach ($sampleName in $sampleNames) {
    $raw = powershell -NoProfile -ExecutionPolicy Bypass -File $proofScript -Sample $sampleName -MqttUrl $MqttUrl -TimeoutSeconds $TimeoutSeconds | Out-String
    if ($LASTEXITCODE -ne 0) {
      throw "relay proof failed for sample=$sampleName (exit=$LASTEXITCODE)"
    }

    $proof = $raw | ConvertFrom-Json
    $results += [ordered]@{
      sample = $sampleName
      sampleTopic = $proof.sampleTopic
      publishCommandSucceeded = $proof.checks.publishCommandSucceeded
      relayExited = $proof.checks.relayExited
      relayReceivedCommand = $proof.checks.relayReceivedCommand
      relayTopicMatches = $proof.checks.relayTopicMatches
      relayCommandTypeMatches = $proof.checks.relayCommandTypeMatches
      relayGeneratedChunks = $proof.checks.relayGeneratedChunks
      relayUsedSuggestedChunking = $proof.checks.relayUsedSuggestedChunking
      commandId = $proof.publish.commandId
      commandType = $proof.publish.commandType
      chunkCount = $proof.relay.report.plan.chunkCount
      chunkStrategy = $proof.relay.report.plan.chunkStrategy
      sink = $proof.relay.report.sink
    }
  }

  $allPassed = $results.Count -gt 0 -and @($results | Where-Object {
      -not ($_.publishCommandSucceeded -and $_.relayExited -and $_.relayReceivedCommand -and $_.relayTopicMatches -and $_.relayCommandTypeMatches -and $_.relayGeneratedChunks -and $_.relayUsedSuggestedChunking)
    }).Count -eq 0

  $report = [ordered]@{
    generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    conclusion = "hardware-stable-version-command-matrix-can-flow-from-local-mqtt-broker-into-gateway-style-uart-relay-plans"
    hardwareDeviceId = $sampleReport.hardwareDeviceId
    checks = [ordered]@{
      allSamplesPassed = $allPassed
      alignedSampleCount = @($sampleReport.alignedSamples).Count
      mismatchSampleIncluded = $true
      totalScenarioCount = $results.Count
    }
    scenarios = $results
    remainingGaps = @(
      "switch relay sink from file to uart-com when a real COM port becomes visible",
      "capture board-side receive evidence for at least one aligned sample through the same relay path",
      "capture board-side ignore evidence for mismatch through the same relay path"
    )
  }

  $json = $report | ConvertTo-Json -Depth 8
  $fullOutFile = Join-Path $repoRoot $OutFile
  $outDir = Split-Path -Parent $fullOutFile
  if ($outDir -and -not (Test-Path $outDir)) {
    New-Item -ItemType Directory -Path $outDir -Force | Out-Null
  }
  Set-Content -Path $fullOutFile -Value $json -Encoding UTF8
  $json
} finally {
  Pop-Location
}
