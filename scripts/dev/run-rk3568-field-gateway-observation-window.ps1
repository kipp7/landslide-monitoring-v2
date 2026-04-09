[CmdletBinding()]
param(
  [ValidateSet("skip", "install")]
  [string]$AcceptanceMode = "skip",
  [string]$BoardHost = "192.168.124.172",
  [string]$User = "linaro",
  [string]$Password = "",
  [int]$SshPort = 22,
  [string]$RepoRoot = "/home/linaro/landslide-monitoring-v2-mainline",
  [string]$MqttUrl = "mqtt://192.168.124.17:1883",
  [int]$DurationSeconds = 60,
  [int]$PollSeconds = 5,
  [switch]$RequireAcceptance,
  [string]$OutFile = "docs/unified/reports/field-rk3568-gateway-observation-latest.json"
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

function Convert-TextToJsonObject {
  param(
    [string]$Text,
    [string]$Label
  )

  $trimmed = $Text.Trim()
  if (-not $trimmed) {
    throw "$Label returned empty output"
  }

  $jsonStart = $trimmed.IndexOf("{")
  $jsonEnd = $trimmed.LastIndexOf("}")
  if ($jsonStart -lt 0 -or $jsonEnd -lt $jsonStart) {
    throw "$Label did not return JSON output"
  }

  return ($trimmed.Substring($jsonStart, $jsonEnd - $jsonStart + 1) | ConvertFrom-Json)
}

function Invoke-JsonScript {
  param(
    [string]$Label,
    [scriptblock]$Action
  )

  Write-Host "==> $Label" -ForegroundColor Cyan
  $output = & $Action | Out-String
  if ($LASTEXITCODE -ne 0) {
    throw "$Label failed (exit=$LASTEXITCODE)"
  }
  return Convert-TextToJsonObject -Text $output -Label $Label
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

function Read-JsonFile {
  param([string]$Path)

  if (-not (Test-Path -LiteralPath $Path)) {
    throw "JSON file not found: $Path"
  }

  return (Get-Content -LiteralPath $Path -Raw -Encoding UTF8) | ConvertFrom-Json
}

function Get-NodeByDeviceId {
  param(
    $RuntimeReport,
    [string]$DeviceId
  )

  return @($RuntimeReport.runtimeHealth.southbound.nodes | Where-Object { $_.deviceId -eq $DeviceId } | Select-Object -First 1)[0]
}

function Get-PortState {
  param($RuntimeReport)

  return @($RuntimeReport.runtimeHealth.southbound.ports | Select-Object -First 1)[0]
}

function Get-SampleSummary {
  param($RuntimeReport)

  $runtimeHealth = $RuntimeReport.runtimeHealth
  $statsPropertyNames = @($runtimeHealth.stats.PSObject.Properties | ForEach-Object { $_.Name })
  $port = Get-PortState -RuntimeReport $RuntimeReport
  $nodeA = Get-NodeByDeviceId -RuntimeReport $RuntimeReport -DeviceId "00000000-0000-0000-0000-000000000001"
  $nodeB = Get-NodeByDeviceId -RuntimeReport $RuntimeReport -DeviceId "00000000-0000-0000-0000-000000000002"
  $nodeC = Get-NodeByDeviceId -RuntimeReport $RuntimeReport -DeviceId "00000000-0000-0000-0000-000000000003"

  return [pscustomobject][ordered]@{
    emittedTs = [string]$runtimeHealth.emitted_ts
    serviceActive = [string]$RuntimeReport.serviceState.isActive.stdout
    mqttConnected = [bool]$runtimeHealth.mqtt.connected
    serialOpen = [bool]$runtimeHealth.serial.open
    portStatus = [string]$port.status
    reconnectScheduled = [bool]$port.reconnectScheduled
    reconnectAttempts = [int]$port.reconnectAttempts
    consecutiveReconnectFailures = [int]$port.consecutiveReconnectFailures
    spoolPending = [int]$runtimeHealth.stats.spoolPending
    parsedMessages = [int]$runtimeHealth.stats.parsedMessages
    publishedMessages = [int]$runtimeHealth.stats.publishedMessages
    schemaRejected = [int]$runtimeHealth.stats.schemaRejected
    rejectedStatsPresent = (($statsPropertyNames -contains "rejectedMessages") -and ($statsPropertyNames -contains "rejectedWriteFailures"))
    rejectedMessages = [int]$runtimeHealth.stats.rejectedMessages
    rejectedWriteFailures = [int]$runtimeHealth.stats.rejectedWriteFailures
    publishFailures = [int]$runtimeHealth.stats.publishFailures
    nodeAStatus = [string]$nodeA.status
    nodeATelemetryMessages = [int]$nodeA.telemetryMessages
    nodeALastTelemetryTs = [string]$nodeA.lastTelemetryTs
    nodeBStatus = [string]$nodeB.status
    nodeBTelemetryMessages = [int]$nodeB.telemetryMessages
    nodeBLastTelemetryTs = [string]$nodeB.lastTelemetryTs
    nodeCStatus = [string]$nodeC.status
  }
}

if ($DurationSeconds -lt 10) {
  throw "DurationSeconds must be >= 10"
}
if ($PollSeconds -lt 1) {
  throw "PollSeconds must be >= 1"
}

$repoRootLocal = Resolve-RepoRoot
$resolvedOutFile = Join-Path $repoRootLocal $OutFile
$reportDir = Split-Path -Parent $resolvedOutFile
if ($reportDir -and -not (Test-Path -LiteralPath $reportDir)) {
  New-Item -ItemType Directory -Path $reportDir -Force | Out-Null
}

$acceptanceOutFile = Join-Path $repoRootLocal "docs/unified/reports/field-rk3568-gateway-acceptance-latest.json"
$runtimeOutFile = Join-Path $repoRootLocal "docs/unified/reports/field-rk3568-gateway-runtime-latest.json"
$tmpDir = Join-Path $repoRootLocal ".tmp"
if (-not (Test-Path -LiteralPath $tmpDir)) {
  New-Item -ItemType Directory -Path $tmpDir -Force | Out-Null
}

Push-Location $repoRootLocal
$originalPythonWarnings = $env:PYTHONWARNINGS
$env:PYTHONWARNINGS = "ignore"
try {
  $acceptanceError = $null
  try {
    $acceptance = Invoke-JsonScript "RK3568 field gateway acceptance" {
      powershell -NoProfile -ExecutionPolicy Bypass -File ".\scripts\dev\check-rk3568-field-gateway-acceptance.ps1" `
        -DeployMode $AcceptanceMode `
        -BoardHost $BoardHost `
        -User $User `
        -Password $Password `
        -SshPort $SshPort `
        -RepoRoot $RepoRoot `
        -MqttUrl $MqttUrl `
        -OutFile $acceptanceOutFile
    }
  } catch {
    $acceptanceError = $_.Exception.Message
    if (-not (Test-Path -LiteralPath $acceptanceOutFile)) {
      throw
    }
    Write-Host "==> RK3568 acceptance did not pass; continuing observation with recorded failure state" -ForegroundColor Yellow
    $acceptance = Read-JsonFile -Path $acceptanceOutFile
    if ($RequireAcceptance) {
      throw "RK3568 acceptance is required for observation: $acceptanceError"
    }
  }

  $deadline = (Get-Date).AddSeconds($DurationSeconds)
  $samples = New-Object System.Collections.Generic.List[object]
  $sampleIndex = 0

  while ($true) {
    $sampleIndex += 1
    $sampleRuntimeOutFile = Join-Path $tmpDir ("rk3568-observation-runtime-{0:000}.json" -f $sampleIndex)

    Invoke-Step ("Observation runtime sample #{0}" -f $sampleIndex) {
      powershell -NoProfile -ExecutionPolicy Bypass -File ".\scripts\dev\check-rk3568-field-gateway-runtime.ps1" `
        -BoardHost $BoardHost `
        -User $User `
        -Password $Password `
        -SshPort $SshPort `
        -RepoRoot $RepoRoot `
        -OutFile $sampleRuntimeOutFile
    }

    $runtimeReport = Read-JsonFile -Path $sampleRuntimeOutFile
    Set-Content -Path $runtimeOutFile -Value (($runtimeReport | ConvertTo-Json -Depth 8)) -Encoding UTF8
    $samples.Add((Get-SampleSummary -RuntimeReport $runtimeReport))

    if ((Get-Date) -ge $deadline) {
      break
    }

    Start-Sleep -Seconds $PollSeconds
  }

  $sampleArray = @($samples.ToArray())
  $firstSample = @($sampleArray | Select-Object -First 1)[0]
  $lastSample = @($sampleArray | Select-Object -Last 1)[0]

  $statusContinuous = [ordered]@{
    serviceActive = (@($sampleArray | Where-Object { $_.serviceActive -ne "active" }).Count -eq 0)
    mqttConnected = (@($sampleArray | Where-Object { -not $_.mqttConnected }).Count -eq 0)
    serialOpen = (@($sampleArray | Where-Object { -not $_.serialOpen }).Count -eq 0)
    portOnline = (@($sampleArray | Where-Object { $_.portStatus -ne "online" }).Count -eq 0)
    rejectedStatsPresent = (@($sampleArray | Where-Object { -not $_.rejectedStatsPresent }).Count -eq 0)
    nodeAOnline = (@($sampleArray | Where-Object { $_.nodeAStatus -ne "online" }).Count -eq 0)
    nodeBOnline = (@($sampleArray | Where-Object { $_.nodeBStatus -ne "online" }).Count -eq 0)
    nodeAReachable = (@($sampleArray | Where-Object { $_.nodeAStatus -notin @("online", "degraded") }).Count -eq 0)
    nodeBReachable = (@($sampleArray | Where-Object { $_.nodeBStatus -notin @("online", "degraded") }).Count -eq 0)
    nodeCPrepared = (@($sampleArray | Where-Object { $_.nodeCStatus -notin @("configured", "online") }).Count -eq 0)
  }

  $counterDelta = [ordered]@{
    parsedMessages = [int]$lastSample.parsedMessages - [int]$firstSample.parsedMessages
    publishedMessages = [int]$lastSample.publishedMessages - [int]$firstSample.publishedMessages
    schemaRejected = [int]$lastSample.schemaRejected - [int]$firstSample.schemaRejected
    rejectedMessages = [int]$lastSample.rejectedMessages - [int]$firstSample.rejectedMessages
    rejectedWriteFailures = [int]$lastSample.rejectedWriteFailures - [int]$firstSample.rejectedWriteFailures
    publishFailures = [int]$lastSample.publishFailures - [int]$firstSample.publishFailures
    nodeATelemetryMessages = [int]$lastSample.nodeATelemetryMessages - [int]$firstSample.nodeATelemetryMessages
    nodeBTelemetryMessages = [int]$lastSample.nodeBTelemetryMessages - [int]$firstSample.nodeBTelemetryMessages
  }

  $maxObserved = [ordered]@{
    spoolPending = (@($sampleArray | Measure-Object -Property spoolPending -Maximum).Maximum)
    schemaRejected = (@($sampleArray | Measure-Object -Property schemaRejected -Maximum).Maximum)
    rejectedMessages = (@($sampleArray | Measure-Object -Property rejectedMessages -Maximum).Maximum)
    rejectedWriteFailures = (@($sampleArray | Measure-Object -Property rejectedWriteFailures -Maximum).Maximum)
    publishFailures = (@($sampleArray | Measure-Object -Property publishFailures -Maximum).Maximum)
    reconnectAttempts = (@($sampleArray | Measure-Object -Property reconnectAttempts -Maximum).Maximum)
    consecutiveReconnectFailures = (@($sampleArray | Measure-Object -Property consecutiveReconnectFailures -Maximum).Maximum)
  }

  $reconnectObserved = (@($sampleArray | Where-Object { $_.reconnectScheduled -or $_.reconnectAttempts -gt 0 -or $_.consecutiveReconnectFailures -gt 0 }).Count -gt 0)
  $rejectedEvidenceAligned = ([int]$counterDelta.rejectedMessages -eq [int]$counterDelta.schemaRejected)

  $passed = (
    [bool]$acceptance.accepted -and
    $statusContinuous.serviceActive -and
    $statusContinuous.mqttConnected -and
    $statusContinuous.serialOpen -and
    $statusContinuous.portOnline -and
    $statusContinuous.rejectedStatsPresent -and
    $statusContinuous.nodeAReachable -and
    $statusContinuous.nodeBReachable -and
    $statusContinuous.nodeCPrepared -and
    ([int]$counterDelta.nodeATelemetryMessages -gt 0) -and
    ([int]$counterDelta.nodeBTelemetryMessages -gt 0) -and
    ([int]$counterDelta.rejectedWriteFailures -eq 0) -and
    $rejectedEvidenceAligned -and
    ([int]$counterDelta.publishFailures -eq 0) -and
    ([int]$maxObserved.spoolPending -eq 0) -and
    (-not $reconnectObserved)
  )

  $conclusion = if ($passed -and [int]$counterDelta.schemaRejected -eq 0 -and [int]$counterDelta.rejectedMessages -eq 0) {
    "rk3568-runtime-observation-window-clean"
  } elseif ($passed) {
    "rk3568-runtime-observation-window-online-with-parser-noise"
  } else {
    "rk3568-runtime-observation-window-not-accepted"
  }

  $report = [ordered]@{
    generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    mode = "rk3568-field-gateway-observation-window"
    passed = $passed
    conclusion = $conclusion
    acceptanceMode = $AcceptanceMode
    durationSeconds = $DurationSeconds
    pollSeconds = $PollSeconds
    sampleCount = $sampleArray.Count
    board = [ordered]@{
      host = $BoardHost
      sshPort = $SshPort
      repoRoot = $RepoRoot
      mqttUrl = $MqttUrl
    }
    acceptance = [ordered]@{
      report = "docs/unified/reports/field-rk3568-gateway-acceptance-latest.json"
      accepted = [bool]$acceptance.accepted
      error = $acceptanceError
      currentBoundary = [string]$acceptance.currentBoundary
      commandProofDeviceId = [string]$acceptance.commandProof.deviceId
      commandProofAction = [string]$acceptance.commandProof.action
      commandProofCommandId = [string]$acceptance.commandProof.commandId
      commandProofAckStatus = [string]$acceptance.commandProof.ackStatus
    }
    window = [ordered]@{
      firstSample = $firstSample
      lastSample = $lastSample
      counterDelta = $counterDelta
      maxObserved = $maxObserved
      rejectedEvidenceAligned = $rejectedEvidenceAligned
      reconnectObserved = $reconnectObserved
      statusContinuous = $statusContinuous
    }
    samples = $sampleArray
    nextUse = @(
      "short board observation after acceptance: powershell -NoProfile -ExecutionPolicy Bypass -File .\\scripts\\dev\\run-rk3568-field-gateway-observation-window.ps1 -AcceptanceMode skip -DurationSeconds 60 -PollSeconds 5 -Password <password>",
      "redeploy plus board observation: powershell -NoProfile -ExecutionPolicy Bypass -File .\\scripts\\dev\\run-rk3568-field-gateway-observation-window.ps1 -AcceptanceMode install -DurationSeconds 60 -PollSeconds 5 -Password <password>"
    )
  }

  $reportJson = $report | ConvertTo-Json -Depth 8
  Set-Content -Path $resolvedOutFile -Value $reportJson -Encoding UTF8

  if (-not $passed) {
    throw "rk3568 field gateway observation window did not pass"
  }

  $reportJson
} finally {
  $env:PYTHONWARNINGS = $originalPythonWarnings
  Pop-Location
}
