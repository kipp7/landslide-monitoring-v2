[CmdletBinding()]
param(
  [string]$BoardHost = "192.168.124.179",
  [string]$User = "linaro",
  [string]$Password = "",
  [int]$SshPort = 22,
  [string]$RepoRoot = "/home/linaro/landslide-monitoring-v2-mainline",
  [string]$MqttUrl = "mqtt://192.168.124.17:1883",
  [string]$DeviceId = "00000000-0000-0000-0000-000000000002",
  [int]$ManualCollectAttempts = 3,
  [int]$SetConfigAttempts = 3,
  [int]$RetryDelaySeconds = 3,
  [int]$ObservationDurationSeconds = 60,
  [int]$ObservationPollSeconds = 5,
  [string]$OutFile = "docs/unified/reports/field-rk3568-shared-port-closure-phase-latest.json"
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Resolve-RepoRoot {
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

function Resolve-OutputPath {
  param(
    [string]$RootPath,
    [string]$CandidatePath
  )

  if ([System.IO.Path]::IsPathRooted($CandidatePath)) {
    return [System.IO.Path]::GetFullPath($CandidatePath)
  }

  return Join-Path $RootPath $CandidatePath
}

function Read-JsonFile {
  param([string]$Path)

  if (-not (Test-Path -LiteralPath $Path)) {
    throw "JSON file not found: $Path"
  }

  return (Get-Content -LiteralPath $Path -Raw -Encoding UTF8) | ConvertFrom-Json
}

function Invoke-Step {
  param(
    [string]$Label,
    [scriptblock]$Action
  )

  Write-Host "==> $Label" -ForegroundColor Cyan
  & $Action | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "$Label failed (exit=$LASTEXITCODE)"
  }
}

function Invoke-StableProof {
  param(
    [string]$RepoRootLocal,
    [string]$TargetDeviceId,
    [string]$ActionName,
    [int]$MaxAttempts,
    [int]$RetryDelay,
    [string]$TargetBoardHost,
    [string]$TargetUser,
    [string]$TargetPassword,
    [int]$TargetSshPort,
    [string]$TargetMqttUrl,
    [string]$TargetOutFile
  )

  Invoke-Step ("Stable proof: {0}" -f $ActionName) {
    $args = @(
      "-NoProfile",
      "-ExecutionPolicy", "Bypass",
      "-File", (Join-Path $RepoRootLocal "scripts/dev/run-rk3568-field-gateway-node-command-stable.ps1"),
      "-DeviceId", $TargetDeviceId,
      "-Action", $ActionName,
      "-BoardHost", $TargetBoardHost,
      "-User", $TargetUser,
      "-SshPort", ([string]$TargetSshPort),
      "-MqttUrl", $TargetMqttUrl,
      "-MaxAttempts", ([string]$MaxAttempts),
      "-RetryDelaySeconds", ([string]$RetryDelay),
      "-OutFile", $TargetOutFile
    )
    if ($TargetPassword) {
      $args += @("-Password", $TargetPassword)
    }
    & powershell.exe @args
  }

  return Read-JsonFile -Path $TargetOutFile
}

function Get-StabilityClass {
  param($StableProof)

  if (-not [bool]$StableProof.passed) {
    return "failed"
  }

  $successfulAttempt = $StableProof.successfulAttempt
  if ($null -eq $successfulAttempt) {
    return "failed"
  }

  if ([int]$successfulAttempt.attempt -eq 1) {
    return "single-shot"
  }

  return "after-retry"
}

$repoRootLocal = Resolve-RepoRoot
$resolvedOutFile = Resolve-OutputPath -RootPath $repoRootLocal -CandidatePath $OutFile
$outDir = Split-Path -Parent $resolvedOutFile
if ($outDir -and -not (Test-Path -LiteralPath $outDir)) {
  New-Item -ItemType Directory -Path $outDir -Force | Out-Null
}

$reportDir = Join-Path $repoRootLocal "docs/unified/reports"
$tmpDir = Join-Path $repoRootLocal ".tmp"
if (-not (Test-Path -LiteralPath $tmpDir)) {
  New-Item -ItemType Directory -Path $tmpDir -Force | Out-Null
}

$runtimeOutFile = Join-Path $reportDir "field-rk3568-gateway-runtime-latest.json"
$observationOutFile = Join-Path $reportDir "field-rk3568-gateway-observation-latest.json"
$edgeQualityOutFile = Join-Path $reportDir "field-rk3568-edge-link-quality-latest.json"
$observationOutFileRelative = "docs/unified/reports/field-rk3568-gateway-observation-latest.json"
$manualStableOutFile = Join-Path $tmpDir "rk3568-shared-port-closure-manual-collect.json"
$setConfigStableOutFile = Join-Path $tmpDir "rk3568-shared-port-closure-set-report-5.json"

Push-Location $repoRootLocal
$originalPythonWarnings = $env:PYTHONWARNINGS
$originalPythonIoEncoding = $env:PYTHONIOENCODING
$originalPythonUtf8 = $env:PYTHONUTF8
$env:PYTHONWARNINGS = "ignore"
$env:PYTHONIOENCODING = "utf-8"
$env:PYTHONUTF8 = "1"
try {
  Invoke-Step "Refresh RK3568 runtime snapshot" {
    powershell -NoProfile -ExecutionPolicy Bypass -File ".\scripts\dev\check-rk3568-field-gateway-runtime.ps1" `
      -BoardHost $BoardHost `
      -User $User `
      -Password $Password `
      -SshPort $SshPort `
      -RepoRoot $RepoRoot `
      -OutFile $runtimeOutFile
  }
  $runtimeReport = Read-JsonFile -Path $runtimeOutFile

  $manualCollectStable = Invoke-StableProof `
    -RepoRootLocal $repoRootLocal `
    -TargetDeviceId $DeviceId `
    -ActionName "manual-collect" `
    -MaxAttempts $ManualCollectAttempts `
    -RetryDelay $RetryDelaySeconds `
    -TargetBoardHost $BoardHost `
    -TargetUser $User `
    -TargetPassword $Password `
    -TargetSshPort $SshPort `
    -TargetMqttUrl $MqttUrl `
    -TargetOutFile $manualStableOutFile

  $setConfigStable = Invoke-StableProof `
    -RepoRootLocal $repoRootLocal `
    -TargetDeviceId $DeviceId `
    -ActionName "set-report-5" `
    -MaxAttempts $SetConfigAttempts `
    -RetryDelay $RetryDelaySeconds `
    -TargetBoardHost $BoardHost `
    -TargetUser $User `
    -TargetPassword $Password `
    -TargetSshPort $SshPort `
    -TargetMqttUrl $MqttUrl `
    -TargetOutFile $setConfigStableOutFile

  Invoke-Step "Run RK3568 observation window" {
    powershell -NoProfile -ExecutionPolicy Bypass -File ".\scripts\dev\run-rk3568-field-gateway-observation-window.ps1" `
      -AcceptanceMode "skip" `
      -BoardHost $BoardHost `
      -User $User `
      -Password $Password `
      -SshPort $SshPort `
      -RepoRoot $RepoRoot `
      -MqttUrl $MqttUrl `
      -DurationSeconds $ObservationDurationSeconds `
      -PollSeconds $ObservationPollSeconds `
      -OutFile $observationOutFileRelative
  }
  $observationReport = Read-JsonFile -Path $observationOutFile

  Invoke-Step "Refresh RK3568 edge-link-quality summary" {
    powershell -NoProfile -ExecutionPolicy Bypass -File ".\scripts\dev\check-rk3568-edge-link-quality.ps1" `
      -RuntimeFile "docs/unified/reports/field-rk3568-gateway-runtime-latest.json" `
      -OutFile $edgeQualityOutFile
  }
  $edgeQualityReport = Read-JsonFile -Path $edgeQualityOutFile

  $manualCollectClass = Get-StabilityClass -StableProof $manualCollectStable
  $setConfigClass = Get-StabilityClass -StableProof $setConfigStable
  $intermittentObserved = @($manualCollectClass, $setConfigClass) -contains "after-retry"
  $hardFailureObserved = @($manualCollectClass, $setConfigClass) -contains "failed"
  $singleShotStable = ($manualCollectClass -eq "single-shot" -and $setConfigClass -eq "single-shot")
  $qualityAttentionOrWorse = @("attention", "degraded", "critical") -contains [string]$edgeQualityReport.summary.overallLevel

  $conclusion = if ($singleShotStable -and [bool]$observationReport.passed -and -not $qualityAttentionOrWorse) {
    "shared-port-closure-stable"
  } elseif (-not $hardFailureObserved -and [bool]$observationReport.passed) {
    "shared-port-closure-visible-but-intermittent"
  } else {
    "shared-port-closure-not-yet-stable"
  }

  $accepted = (
    $singleShotStable -and
    [bool]$observationReport.passed -and
    -not $qualityAttentionOrWorse
  )

  $report = [ordered]@{
    generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    mode = "rk3568-shared-port-closure-phase"
    accepted = $accepted
    currentBoundary = $conclusion
    board = [ordered]@{
      host = $BoardHost
      sshPort = $SshPort
      repoRoot = $RepoRoot
      mqttUrl = $MqttUrl
      deviceId = $DeviceId
    }
    runtime = [ordered]@{
      report = "docs/unified/reports/field-rk3568-gateway-runtime-latest.json"
      serviceActive = [string]$runtimeReport.serviceState.isActive.stdout
      mqttConnected = [bool]$runtimeReport.runtimeHealth.mqtt.connected
      serialOpen = [bool]$runtimeReport.runtimeHealth.serial.open
      configuredNodes = [int]$runtimeReport.runtimeHealth.southbound.configuredNodes
    }
    manualCollect = [ordered]@{
      stabilityClass = $manualCollectClass
      passed = [bool]$manualCollectStable.passed
      conclusion = [string]$manualCollectStable.conclusion
      attemptCount = [int]$manualCollectStable.attemptCount
      successfulAttempt = $manualCollectStable.successfulAttempt
      finalAttempt = $manualCollectStable.finalAttempt
      report = ".tmp/rk3568-shared-port-closure-manual-collect.json"
    }
    setConfig = [ordered]@{
      stabilityClass = $setConfigClass
      passed = [bool]$setConfigStable.passed
      conclusion = [string]$setConfigStable.conclusion
      attemptCount = [int]$setConfigStable.attemptCount
      successfulAttempt = $setConfigStable.successfulAttempt
      finalAttempt = $setConfigStable.finalAttempt
      report = ".tmp/rk3568-shared-port-closure-set-report-5.json"
    }
    observation = [ordered]@{
      report = "docs/unified/reports/field-rk3568-gateway-observation-latest.json"
      passed = [bool]$observationReport.passed
      conclusion = [string]$observationReport.conclusion
      sampleCount = [int]$observationReport.sampleCount
      rejectedMessagesDelta = [int]$observationReport.window.counterDelta.rejectedMessages
      schemaRejectedDelta = [int]$observationReport.window.counterDelta.schemaRejected
      commandProofAckStatus = [string]$observationReport.acceptance.commandProofAckStatus
    }
    edgeQuality = [ordered]@{
      report = "docs/unified/reports/field-rk3568-edge-link-quality-latest.json"
      accepted = [bool]$edgeQualityReport.accepted
      overallLevel = [string]$edgeQualityReport.summary.overallLevel
      score = [int]$edgeQualityReport.summary.score
      interleavingSuspected = [int]$edgeQualityReport.summary.interleavingSuspected
      rejectedMessages = [int]$edgeQualityReport.summary.rejectedMessages
    }
    summary = [ordered]@{
      singleShotStable = $singleShotStable
      intermittentObserved = $intermittentObserved
      hardFailureObserved = $hardFailureObserved
      qualityAttentionOrWorse = $qualityAttentionOrWorse
    }
    nextUse = @(
      "shared-port closure phase check: powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\check-rk3568-shared-port-closure-phase.ps1 -Password <password>",
      "manual_collect stability only: powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\run-rk3568-field-gateway-node-command-stable.ps1 -DeviceId $DeviceId -Action manual-collect -Password <password>",
      "set_config stability only: powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\run-rk3568-field-gateway-node-command-stable.ps1 -DeviceId $DeviceId -Action set-report-5 -Password <password>"
    )
  }

  $reportJson = $report | ConvertTo-Json -Depth 8
  Set-Content -Path $resolvedOutFile -Value $reportJson -Encoding UTF8
  $reportJson
} finally {
  $env:PYTHONWARNINGS = $originalPythonWarnings
  $env:PYTHONIOENCODING = $originalPythonIoEncoding
  $env:PYTHONUTF8 = $originalPythonUtf8
  Pop-Location
}
