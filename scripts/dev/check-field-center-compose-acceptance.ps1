[CmdletBinding()]
param(
  [ValidateSet("skip", "validate", "apply")]
  [string]$DeployMode = "validate",
  [string]$ApiBaseUrl = "http://127.0.0.1:8080",
  [string]$WebBaseUrl = "http://127.0.0.1:3000",
  [string]$MqttUrl = "mqtt://127.0.0.1:1883",
  [string]$Username = "admin",
  [string]$Password = "123456",
  [string]$PayloadFile = "docs/tools/field-rehearsal/payload-samples/hf-hardware-real-20260406-seq21.json",
  [switch]$AllowUnsafeSecrets,
  [string]$OutFile = "docs/unified/reports/field-center-compose-acceptance-latest.json"
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Resolve-RepoRoot() {
  $here = Get-Location
  $dir = $here.Path
  while ($dir -and -not (Test-Path (Join-Path $dir "package.json"))) {
    $parent = Split-Path -Parent $dir
    if ($parent -eq $dir) { break }
    $dir = $parent
  }
  if (-not $dir -or -not (Test-Path (Join-Path $dir "package.json"))) {
    throw "Cannot find repo root (package.json). Run this script from inside the repo."
  }
  return $dir
}

function Invoke-JsonScript([string]$Label, [scriptblock]$Action) {
  Write-Host "==> $Label" -ForegroundColor Cyan
  $output = & $Action | Out-String
  if ($LASTEXITCODE -ne 0) {
    throw "$Label failed (exit=$LASTEXITCODE)"
  }
  $trimmed = $output.Trim()
  if (-not $trimmed) {
    throw "$Label returned empty output"
  }
  return $trimmed | ConvertFrom-Json
}

function Invoke-Step([string]$Label, [scriptblock]$Action) {
  Write-Host "==> $Label" -ForegroundColor Cyan
  & $Action | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "$Label failed (exit=$LASTEXITCODE)"
  }
}

function Read-JsonFile([string]$Path) {
  if (-not (Test-Path $Path)) {
    throw "JSON file not found: $Path"
  }
  return (Get-Content -Path $Path -Raw -Encoding UTF8) | ConvertFrom-Json
}

$repoRoot = Resolve-RepoRoot
$resolvedOutFile = Join-Path $repoRoot $OutFile
$deployReportFile = Join-Path $repoRoot "docs/unified/reports/docker-deploy-latest.json"
$readinessReportFile = Join-Path $repoRoot "docs/unified/reports/field-full-path-readiness-latest.json"
$fullProofReportFile = Join-Path $repoRoot "docs/unified/reports/field-hardware-uplink-full-proof-latest.json"

Push-Location $repoRoot
try {
  $deployReport = $null
  $deployArgs = @()
  if ($AllowUnsafeSecrets.IsPresent) {
    $deployArgs += "-AllowUnsafeSecrets"
  }
  if ($DeployMode -eq "validate") {
    $deployReport = Invoke-JsonScript "Docker one-click validate" {
      powershell -NoProfile -ExecutionPolicy Bypass -File ".\scripts\release\deploy-docker-oneclick.ps1" -ValidateOnly @deployArgs
    }
  } elseif ($DeployMode -eq "apply") {
    $deployReport = Invoke-JsonScript "Docker one-click apply" {
      powershell -NoProfile -ExecutionPolicy Bypass -File ".\scripts\release\deploy-docker-oneclick.ps1" @deployArgs
    }
  } elseif (Test-Path $deployReportFile) {
    $deployReport = Read-JsonFile -Path $deployReportFile
  }

  Invoke-Step "Field full-path readiness" {
    powershell -NoProfile -ExecutionPolicy Bypass -File ".\scripts\dev\check-field-full-path-readiness.ps1"
  }
  $readiness = Read-JsonFile -Path $readinessReportFile

  Invoke-Step "Field hardware uplink full proof" {
    powershell -NoProfile -ExecutionPolicy Bypass -File ".\scripts\dev\run-field-hardware-uplink-full-proof.ps1" `
      -ApiBaseUrl $ApiBaseUrl `
      -WebBaseUrl $WebBaseUrl `
      -MqttUrl $MqttUrl `
      -Username $Username `
      -Password $Password `
      -PayloadFile $PayloadFile
  }
  $fullProof = Read-JsonFile -Path $fullProofReportFile

  $checks = @(
    [pscustomobject]@{
      key = "composeIncludesIngest"
      ok = [bool]$readiness.compose.appComposeIncludesIngest
      actual = [bool]$readiness.compose.appComposeIncludesIngest
      expected = $true
    },
    [pscustomobject]@{
      key = "composeIncludesTelemetryWriter"
      ok = [bool]$readiness.compose.appComposeIncludesTelemetryWriter
      actual = [bool]$readiness.compose.appComposeIncludesTelemetryWriter
      expected = $true
    },
    [pscustomobject]@{
      key = "ingestRunningFromCompose"
      ok = ([string]$readiness.runtime.downstreamRuntime.ingestSource -eq "compose")
      actual = [string]$readiness.runtime.downstreamRuntime.ingestSource
      expected = "compose"
    },
    [pscustomobject]@{
      key = "telemetryWriterRunningFromCompose"
      ok = ([string]$readiness.runtime.downstreamRuntime.telemetryWriterSource -eq "compose")
      actual = [string]$readiness.runtime.downstreamRuntime.telemetryWriterSource
      expected = "compose"
    },
    [pscustomobject]@{
      key = "readinessBoundary"
      ok = ([string]$readiness.currentBoundary -eq "full-path-ready")
      actual = [string]$readiness.currentBoundary
      expected = "full-path-ready"
    },
    [pscustomobject]@{
      key = "runtimeBootstrapApiReady"
      ok = [bool]$fullProof.runtimeBootstrap.apiReady
      actual = [bool]$fullProof.runtimeBootstrap.apiReady
      expected = $true
    },
    [pscustomobject]@{
      key = "runtimeBootstrapWebReady"
      ok = [bool]$fullProof.runtimeBootstrap.webReady
      actual = [bool]$fullProof.runtimeBootstrap.webReady
      expected = $true
    },
    [pscustomobject]@{
      key = "replayProofConclusion"
      ok = ([string]$fullProof.replayProof.conclusion -eq "real-hardware-uplink-replay-reached-platform-api-state")
      actual = [string]$fullProof.replayProof.conclusion
      expected = "real-hardware-uplink-replay-reached-platform-api-state"
    },
    [pscustomobject]@{
      key = "productVisibilityConclusion"
      ok = ([string]$fullProof.productVisibilityProof.conclusion -eq "real-hardware-uplink-visible-through-web-product-read-path")
      actual = [string]$fullProof.productVisibilityProof.conclusion
      expected = "real-hardware-uplink-visible-through-web-product-read-path"
    },
    [pscustomobject]@{
      key = "fullProofConclusion"
      ok = ([string]$fullProof.conclusion -eq "real-hardware-uplink-full-path-reached-platform-and-web")
      actual = [string]$fullProof.conclusion
      expected = "real-hardware-uplink-full-path-reached-platform-and-web"
    }
  )

  $accepted = (@($checks | Where-Object { -not $_.ok }).Count -eq 0)
  if (-not $accepted) {
    $failedKeys = (@($checks | Where-Object { -not $_.ok } | ForEach-Object { $_.key })) -join ", "
    throw "field center compose acceptance failed: $failedKeys"
  }

  $reportDir = Split-Path -Parent $resolvedOutFile
  if ($reportDir -and -not (Test-Path $reportDir)) {
    New-Item -ItemType Directory -Path $reportDir -Force | Out-Null
  }

  $report = [ordered]@{
    generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    accepted = $accepted
    mode = "field-center-compose-acceptance"
    deployMode = $DeployMode
    environment = [ordered]@{
      apiBaseUrl = $ApiBaseUrl
      webBaseUrl = $WebBaseUrl
      mqttUrl = $MqttUrl
      payloadFile = $PayloadFile.Replace("\", "/")
    }
    deploy = if ($null -eq $deployReport) {
      [ordered]@{
        mode = "not-run"
      }
    } else {
      [ordered]@{
        validateOnly = if ($null -ne $deployReport.validateOnly) { [bool]$deployReport.validateOnly } else { $null }
        started = if ($null -ne $deployReport.status.started) { [bool]$deployReport.status.started } else { $null }
        initialized = if ($null -ne $deployReport.status.initialized) { [bool]$deployReport.status.initialized } else { $null }
        warnings = @($deployReport.warnings)
        errors = @($deployReport.errors)
      }
    }
    readiness = [ordered]@{
      report = "docs/unified/reports/field-full-path-readiness-latest.json"
      currentBoundary = [string]$readiness.currentBoundary
      ingestSource = [string]$readiness.runtime.downstreamRuntime.ingestSource
      telemetryWriterSource = [string]$readiness.runtime.downstreamRuntime.telemetryWriterSource
      nextAction = [string]$readiness.nextAction
    }
    fullProof = [ordered]@{
      report = "docs/unified/reports/field-hardware-uplink-full-proof-latest.json"
      conclusion = [string]$fullProof.conclusion
      replayConclusion = [string]$fullProof.replayProof.conclusion
      productVisibilityConclusion = [string]$fullProof.productVisibilityProof.conclusion
      deviceId = [string]$fullProof.replayProof.deviceId
    }
    checks = $checks
    nextUse = @(
      "routine acceptance: powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\check-field-center-compose-acceptance.ps1 -DeployMode validate -AllowUnsafeSecrets",
      "full center redeploy + acceptance: powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\check-field-center-compose-acceptance.ps1 -DeployMode apply -AllowUnsafeSecrets"
    )
  }

  $json = $report | ConvertTo-Json -Depth 8
  Set-Content -Path $resolvedOutFile -Value $json -Encoding UTF8
  $json
} finally {
  Pop-Location
}
