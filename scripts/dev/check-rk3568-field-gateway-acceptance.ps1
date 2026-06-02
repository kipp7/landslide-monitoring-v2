[CmdletBinding()]
param(
  [ValidateSet("skip", "install")]
  [string]$DeployMode = "skip",
  [string]$BoardHost = "192.168.124.179",
  [string]$User = "linaro",
  [string]$Password = "",
  [int]$SshPort = 22,
  [string]$RepoRoot = "/home/linaro/landslide-monitoring-v2-mainline",
  [string]$MqttUrl = "mqtt://192.168.124.17:1883",
  [string]$CommandDeviceId = "00000000-0000-0000-0000-000000000002",
  [ValidateSet("manual-collect", "set-report-5", "set-report-300")]
  [string]$CommandAction = "set-report-5",
  [int]$WarmupTimeoutSeconds = 60,
  [int]$WarmupPollSeconds = 5,
  [string]$OutFile = "docs/unified/reports/field-rk3568-gateway-acceptance-latest.json"
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

function Invoke-RuntimeSnapshot {
  param(
    [string]$SnapshotOutFile
  )

  Invoke-Step "Check RK3568 field gateway runtime" {
    powershell -NoProfile -ExecutionPolicy Bypass -File ".\scripts\dev\check-rk3568-field-gateway-runtime.ps1" `
      -BoardHost $BoardHost `
      -User $User `
      -Password $Password `
      -SshPort $SshPort `
      -RepoRoot $RepoRoot `
      -OutFile $SnapshotOutFile
  }

  return Read-JsonFile -Path $SnapshotOutFile
}

function Test-RuntimeReady {
  param($RuntimeReport)

  $runtimeHealth = $RuntimeReport.runtimeHealth
  $portState = @($runtimeHealth.southbound.ports | Select-Object -First 1)[0]
  $nodeA = Get-NodeByDeviceId -RuntimeReport $RuntimeReport -DeviceId "00000000-0000-0000-0000-000000000001"
  $nodeB = Get-NodeByDeviceId -RuntimeReport $RuntimeReport -DeviceId "00000000-0000-0000-0000-000000000002"
  $nodeC = Get-NodeByDeviceId -RuntimeReport $RuntimeReport -DeviceId "00000000-0000-0000-0000-000000000003"

  return (
    [bool]$runtimeHealth.serial.open -and
    [bool]$runtimeHealth.mqtt.connected -and
    [int]$runtimeHealth.southbound.configuredNodes -eq 3 -and
    [int]$portState.enabledNodeCount -eq 3 -and
    [string]$portState.status -eq "online" -and
    [string]$nodeA.status -in @("online", "degraded") -and
    [string]$nodeB.status -in @("online", "degraded") -and
    [string]$nodeC.status -in @("online", "degraded") -and
    [int]$runtimeHealth.stats.parsedMessages -gt 0
  )
}

function Get-NodeByDeviceId {
  param(
    $RuntimeReport,
    [string]$DeviceId
  )

  return @($RuntimeReport.runtimeHealth.southbound.nodes | Where-Object { $_.deviceId -eq $DeviceId } | Select-Object -First 1)[0]
}

function Get-Check {
  param(
    [string]$Key,
    [bool]$Ok,
    $Actual,
    $Expected
  )

  return [pscustomobject]@{
    key = $Key
    ok = $Ok
    actual = $Actual
    expected = $Expected
  }
}

$repoRootLocal = Resolve-RepoRoot
$resolvedOutFile = Resolve-OutputPath -RootPath $repoRootLocal -CandidatePath $OutFile
$reportDir = Split-Path -Parent $resolvedOutFile
if ($reportDir -and -not (Test-Path -LiteralPath $reportDir)) {
  New-Item -ItemType Directory -Path $reportDir -Force | Out-Null
}

$runtimeOutFile = Join-Path $repoRootLocal "docs/unified/reports/field-rk3568-gateway-runtime-latest.json"
$commandProofOutFile = Join-Path $repoRootLocal "docs/unified/reports/field-rk3568-gateway-node-command-proof-latest.json"
$installReport = $null
$warmupSatisfied = $false
$warmupApplied = $false
$warmupElapsedSeconds = 0

Push-Location $repoRootLocal
$originalPythonWarnings = $env:PYTHONWARNINGS
$env:PYTHONWARNINGS = "ignore"
try {
  if ($DeployMode -eq "install") {
    $installReport = Invoke-JsonScript "Install RK3568 field gateway" {
      powershell -NoProfile -ExecutionPolicy Bypass -File ".\scripts\dev\install-rk3568-field-gateway.ps1" `
        -BoardHost $BoardHost `
        -User $User `
        -Password $Password `
        -SshPort $SshPort `
        -RepoRoot $RepoRoot `
        -MqttUrl $MqttUrl
    }
  }

  $runtimeReport = Invoke-RuntimeSnapshot -SnapshotOutFile $runtimeOutFile
  $warmupApplied = $true
  $deadline = (Get-Date).AddSeconds([Math]::Max(1, $WarmupTimeoutSeconds))
  while (-not (Test-RuntimeReady -RuntimeReport $runtimeReport) -and (Get-Date) -lt $deadline) {
    Start-Sleep -Seconds ([Math]::Max(1, $WarmupPollSeconds))
    $warmupElapsedSeconds += [Math]::Max(1, $WarmupPollSeconds)
    Write-Host ("==> Waiting for RK3568 runtime warmup ({0}s/{1}s)" -f $warmupElapsedSeconds, $WarmupTimeoutSeconds) -ForegroundColor DarkCyan
    $runtimeReport = Invoke-RuntimeSnapshot -SnapshotOutFile $runtimeOutFile
  }
  $warmupSatisfied = Test-RuntimeReady -RuntimeReport $runtimeReport

  Invoke-Step "Run RK3568 node command proof" {
    powershell -NoProfile -ExecutionPolicy Bypass -File ".\scripts\dev\run-rk3568-field-gateway-node-command-proof.ps1" `
      -DeviceId $CommandDeviceId `
      -Action $CommandAction `
      -BoardHost $BoardHost `
      -User $User `
      -Password $Password `
      -SshPort $SshPort `
      -MqttUrl $MqttUrl `
      -OutFile $commandProofOutFile
  }
  $commandProof = Read-JsonFile -Path $commandProofOutFile

  $runtimeHealth = $runtimeReport.runtimeHealth
  $serviceState = $runtimeReport.serviceState
  $portState = @($runtimeHealth.southbound.ports | Select-Object -First 1)[0]
  $nodeA = Get-NodeByDeviceId -RuntimeReport $runtimeReport -DeviceId "00000000-0000-0000-0000-000000000001"
  $nodeB = Get-NodeByDeviceId -RuntimeReport $runtimeReport -DeviceId "00000000-0000-0000-0000-000000000002"
  $nodeC = Get-NodeByDeviceId -RuntimeReport $runtimeReport -DeviceId "00000000-0000-0000-0000-000000000003"
  $proofAckStatus = if ($commandProof.ackEvidence) { [string]$commandProof.ackEvidence.status } else { "" }
  $statsPropertyNames = @($runtimeHealth.stats.PSObject.Properties | ForEach-Object { $_.Name })
  $rejectedStatsPresent = (($statsPropertyNames -contains "rejectedMessages") -and ($statsPropertyNames -contains "rejectedWriteFailures"))

  $checks = @(
    (Get-Check -Key "serviceActive" -Ok:($serviceState.isActive.stdout -eq "active") -Actual $serviceState.isActive.stdout -Expected "active"),
    (Get-Check -Key "serviceEnabled" -Ok:($serviceState.isEnabled.stdout -eq "enabled") -Actual $serviceState.isEnabled.stdout -Expected "enabled"),
    (Get-Check -Key "mqttConnected" -Ok:([bool]$runtimeHealth.mqtt.connected) -Actual ([bool]$runtimeHealth.mqtt.connected) -Expected $true),
    (Get-Check -Key "serialOpen" -Ok:([bool]$runtimeHealth.serial.open) -Actual ([bool]$runtimeHealth.serial.open) -Expected $true),
    (Get-Check -Key "southboundRouteMode" -Ok:([string]$runtimeHealth.southbound.routeMode -eq "configured-node-routing") -Actual ([string]$runtimeHealth.southbound.routeMode) -Expected "configured-node-routing"),
    (Get-Check -Key "configuredNodes" -Ok:([int]$runtimeHealth.southbound.configuredNodes -eq 3) -Actual ([int]$runtimeHealth.southbound.configuredNodes) -Expected 3),
    (Get-Check -Key "enabledNodeCount" -Ok:([int]$portState.enabledNodeCount -eq 3) -Actual ([int]$portState.enabledNodeCount) -Expected 3),
    (Get-Check -Key "nodeAOnline" -Ok:([string]$nodeA.status -in @("online", "degraded")) -Actual ([string]$nodeA.status) -Expected "online|degraded"),
    (Get-Check -Key "nodeBOnline" -Ok:([string]$nodeB.status -in @("online", "degraded")) -Actual ([string]$nodeB.status) -Expected "online|degraded"),
    (Get-Check -Key "nodeCPrepared" -Ok:([string]$nodeC.status -in @("online", "degraded")) -Actual ([string]$nodeC.status) -Expected "online|degraded"),
    (Get-Check -Key "telemetryTopicPrefix" -Ok:([string]$runtimeReport.configuredEnv.MQTT_TOPIC_TELEMETRY_PREFIX -eq "telemetry/") -Actual ([string]$runtimeReport.configuredEnv.MQTT_TOPIC_TELEMETRY_PREFIX) -Expected "telemetry/"),
    (Get-Check -Key "commandTopicPrefix" -Ok:([string]$runtimeReport.configuredEnv.MQTT_TOPIC_COMMAND_PREFIX -eq "cmd/") -Actual ([string]$runtimeReport.configuredEnv.MQTT_TOPIC_COMMAND_PREFIX) -Expected "cmd/"),
    (Get-Check -Key "ackTopicPrefix" -Ok:([string]$runtimeReport.configuredEnv.MQTT_TOPIC_ACK_PREFIX -eq "cmd_ack/") -Actual ([string]$runtimeReport.configuredEnv.MQTT_TOPIC_ACK_PREFIX) -Expected "cmd_ack/"),
    (Get-Check -Key "rejectedStatsPresent" -Ok:$rejectedStatsPresent -Actual $rejectedStatsPresent -Expected $true),
    (Get-Check -Key "rejectedWriteFailuresZero" -Ok:([int]$runtimeHealth.stats.rejectedWriteFailures -eq 0) -Actual ([int]$runtimeHealth.stats.rejectedWriteFailures) -Expected 0),
    (Get-Check -Key "commandProofPassed" -Ok:([bool]$commandProof.passed) -Actual ([bool]$commandProof.passed) -Expected $true),
    (Get-Check -Key "commandProofAckStatus" -Ok:($proofAckStatus -eq "acked") -Actual $proofAckStatus -Expected "acked")
  )

  $accepted = (@($checks | Where-Object { -not $_.ok }).Count -eq 0)

  $report = [ordered]@{
    generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    accepted = $accepted
    mode = "rk3568-field-gateway-acceptance"
    deployMode = $DeployMode
    currentBoundary = if ($accepted) {
      "board-runtime-and-command-proof-ready"
    } else {
      "board-runtime-or-command-proof-not-yet-accepted"
    }
    board = [ordered]@{
      host = $BoardHost
      sshPort = $SshPort
      repoRoot = $RepoRoot
      southboundSerialDevice = [string]$runtimeReport.configuredEnv.SERIAL_DEVICE
      southboundBaudRate = [string]$runtimeReport.configuredEnv.SERIAL_BAUD_RATE
      mqttUrl = [string]$runtimeReport.configuredEnv.MQTT_URL
    }
    contract = [ordered]@{
      telemetryTopicPrefix = [string]$runtimeReport.configuredEnv.MQTT_TOPIC_TELEMETRY_PREFIX
      commandTopicPrefix = [string]$runtimeReport.configuredEnv.MQTT_TOPIC_COMMAND_PREFIX
      ackTopicPrefix = [string]$runtimeReport.configuredEnv.MQTT_TOPIC_ACK_PREFIX
    }
    warmup = [ordered]@{
      applied = $warmupApplied
      satisfied = $warmupSatisfied
      timeoutSeconds = $WarmupTimeoutSeconds
      pollSeconds = $WarmupPollSeconds
      elapsedSeconds = $warmupElapsedSeconds
    }
    deploy = if ($null -eq $installReport) {
      [ordered]@{
        mode = "not-run"
      }
    } else {
      [ordered]@{
        mode = "install"
        serviceActive = [string]$installReport.serviceState.isActive.stdout
        serviceEnabled = [string]$installReport.serviceState.isEnabled.stdout
        mainPid = [string]$installReport.serviceState.show.stdout
      }
    }
    runtime = [ordered]@{
      report = "docs/unified/reports/field-rk3568-gateway-runtime-latest.json"
      serviceActive = [string]$serviceState.isActive.stdout
      serviceEnabled = [string]$serviceState.isEnabled.stdout
      mqttConnected = [bool]$runtimeHealth.mqtt.connected
      serialOpen = [bool]$runtimeHealth.serial.open
      routeMode = [string]$runtimeHealth.southbound.routeMode
      configuredNodes = [int]$runtimeHealth.southbound.configuredNodes
      configuredPorts = [int]$runtimeHealth.southbound.configuredPorts
      spoolPending = [int]$runtimeHealth.stats.spoolPending
      schemaRejected = [int]$runtimeHealth.stats.schemaRejected
      rejectedMessages = [int]$runtimeHealth.stats.rejectedMessages
      rejectedWriteFailures = [int]$runtimeHealth.stats.rejectedWriteFailures
      port = $portState
      nodes = @($runtimeHealth.southbound.nodes)
    }
    commandProof = [ordered]@{
      report = "docs/unified/reports/field-rk3568-gateway-node-command-proof-latest.json"
      deviceId = $CommandDeviceId
      action = $CommandAction
      passed = [bool]$commandProof.passed
      commandId = [string]$commandProof.command.command_id
      ackStatus = $proofAckStatus
      diagnosisSummary = [string]$commandProof.diagnosis.summary
      parseFailureCount = [int]$commandProof.diagnosis.parseFailureCount
      commandForwardsBefore = [int]$commandProof.before.node.commandForwards
      commandForwardsAfter = [int]$commandProof.after.node.commandForwards
      ackPublishesBefore = [int]$commandProof.before.node.ackPublishes
      ackPublishesAfter = [int]$commandProof.after.node.ackPublishes
    }
    checks = $checks
    nextUse = @(
      "board runtime + strict command proof: powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\check-rk3568-field-gateway-acceptance.ps1 -DeployMode skip -Password <password>",
      "board redeploy + runtime + strict command proof: powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\check-rk3568-field-gateway-acceptance.ps1 -DeployMode install -Password <password>"
    )
  }

  $reportJson = $report | ConvertTo-Json -Depth 8
  Set-Content -Path $resolvedOutFile -Value $reportJson -Encoding UTF8

  if (-not $accepted) {
    $failedKeys = (@($checks | Where-Object { -not $_.ok } | ForEach-Object { $_.key })) -join ", "
    throw "rk3568 field gateway acceptance failed: $failedKeys"
  }

  $reportJson
} finally {
  $env:PYTHONWARNINGS = $originalPythonWarnings
  Pop-Location
}
