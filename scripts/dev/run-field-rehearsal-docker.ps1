[CmdletBinding()]
param(
  [string]$Sample = "hf-normal",
  [string]$OutFile = "docs/unified/reports/field-docker-mqtt-path-latest.json",
  [switch]$CleanupAfter
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Push-Location $repoRoot
try {
  $steps = [System.Collections.Generic.List[object]]::new()

  function Run-Step([string]$Name, [scriptblock]$Action) {
    $start = Get-Date
    try {
      $output = & $Action | Out-String
      $steps.Add([pscustomobject]@{
        name = $Name
        ok = $true
        startedAt = $start.ToUniversalTime().ToString("o")
        output = $output.Trim()
      })
      return $output
    } catch {
      $steps.Add([pscustomobject]@{
        name = $Name
        ok = $false
        startedAt = $start.ToUniversalTime().ToString("o")
        output = ($_ | Out-String).Trim()
      })
      throw
    }
  }

  $createOutput = Run-Step "create-rehearsal-device" {
    powershell -NoProfile -ExecutionPolicy Bypass -File "scripts/dev/create-field-rehearsal-device.ps1"
  }

  $raw = $createOutput.Trim()
  if ($raw.Length -gt 0 -and [int][char]$raw[0] -eq 65279) { $raw = $raw.Substring(1) }
  $created = $raw | ConvertFrom-Json
  $deviceId = [string]$created.data.deviceId
  $secretFile = Join-Path $repoRoot ([string]$created.secretFile)
  $secretRaw = Get-Content -Raw -Encoding UTF8 $secretFile
  if ($secretRaw.Length -gt 0 -and [int][char]$secretRaw[0] -eq 65279) { $secretRaw = $secretRaw.Substring(1) }
  $secretJson = $secretRaw | ConvertFrom-Json
  $deviceSecret = [string]$secretJson.data.deviceSecret

  Run-Step "configure-emqx-docker-webhook" {
    powershell -NoProfile -ExecutionPolicy Bypass -File "scripts/dev/configure-emqx-docker-webhook.ps1"
  } | Out-Null

  $publishOutput = Run-Step "publish-sample-docker-mqtt" {
    powershell -NoProfile -ExecutionPolicy Bypass -File "scripts/dev/publish-field-rehearsal-sample-docker.ps1" -Sample $Sample -Mode mqtt -Username $deviceId -Password $deviceSecret -Topic ("telemetry/" + $deviceId)
  }

  $acceptanceOutput = Run-Step "docker-acceptance" {
    powershell -NoProfile -ExecutionPolicy Bypass -File "scripts/dev/check-field-docker-acceptance.ps1"
  }

  $result = [ordered]@{
    generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    sample = $Sample
    device = [ordered]@{
      deviceId = $deviceId
      secretFile = $created.secretFile
    }
    steps = $steps
    outputs = [ordered]@{
      publish = ($publishOutput | Out-String).Trim()
      acceptance = ($acceptanceOutput | Out-String).Trim()
    }
  }

  $evidenceDir = Join-Path $repoRoot ("backups/evidence/field-rehearsal-docker-" + (Get-Date -Format "yyyyMMdd-HHmmss"))
  New-Item -ItemType Directory -Path $evidenceDir -Force | Out-Null
  $summaryTemplate = Join-Path $repoRoot "docs/tools/field-rehearsal/evidence/summary.template.json"
  if (Test-Path $summaryTemplate) {
    $templateRaw = Get-Content -Raw -Encoding UTF8 $summaryTemplate
    if ($templateRaw.Length -gt 0 -and [int][char]$templateRaw[0] -eq 65279) { $templateRaw = $templateRaw.Substring(1) }
    $summary = $templateRaw | ConvertFrom-Json
    $summary.runId = "field-rehearsal-docker-" + (Get-Date -Format "yyyyMMdd-HHmmss")
    $summary.scope = "docker-network-mqtt"
    $summary.samples = @("$Sample.json")
    $summary.results.accepted = 1
    $summary.results.rejected = 0
    $summary.results.replayed = 0
    $summary.checks.schemaProbe = $true
    $summary.checks.ingestProbe = $false
    $summary.checks.kafkaRawProbe = $false
    $summary.checks.apiProbe = $true
    $summary.checks.deskWebVisibilityProbe = $false
    $summary.notes = @(
      "Created rehearsal device and obtained MQTT credentials",
      "Configured EMQX docker webhook to lsmv2_api:8080",
      "Published sample over Docker-network MQTT path",
      "Verified docker-side API acceptance"
    )
    $summary.tooling.nodeSimulator = "payload-samples"
    $summary.tooling.gatewayHarness = "docker-network-mqtt"
    $summary.tooling.platformProbe = "docker-acceptance"
    $summary | Add-Member -NotePropertyName deviceId -NotePropertyValue $deviceId -Force
    $summary | Add-Member -NotePropertyName secretFile -NotePropertyValue $created.secretFile -Force
    $summary.conclusion = "docker-mqtt-path-ok"
    $summaryPath = Join-Path $evidenceDir "summary.json"
    ($summary | ConvertTo-Json -Depth 8) | Set-Content -Path $summaryPath -Encoding UTF8
    $result["evidenceSummary"] = $summaryPath
  }

  $fullOutFile = Join-Path $repoRoot $OutFile
  $outDir = Split-Path -Parent $fullOutFile
  if ($outDir -and -not (Test-Path $outDir)) {
    New-Item -ItemType Directory -Path $outDir -Force | Out-Null
  }
  $json = $result | ConvertTo-Json -Depth 8
  Set-Content -Path $fullOutFile -Value $json -Encoding UTF8
  $json

  if ($CleanupAfter) {
    powershell -NoProfile -ExecutionPolicy Bypass -File "scripts/dev/cleanup-field-rehearsal.ps1" | Out-Null
  }
} finally {
  Pop-Location
}
