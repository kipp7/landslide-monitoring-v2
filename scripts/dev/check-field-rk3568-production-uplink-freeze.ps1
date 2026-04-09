[CmdletBinding()]
param(
  [string]$BoardHost = "192.168.124.172",
  [string]$User = "linaro",
  [string]$Password = "",
  [int]$SshPort = 22,
  [string]$RepoRoot = "/home/linaro/landslide-monitoring-v2-mainline",
  [string]$BoardEnvFile = "/etc/lsmv2/field-gateway.env",
  [string]$ExpectedMqttUrl = "mqtt://192.168.124.17:1883",
  [string]$ExpectedSerialDevice = "/dev/ttyS3",
  [int]$ExpectedSerialBaudRate = 115200,
  [string]$ExpectedTelemetryTopicPrefix = "telemetry/",
  [string]$ExpectedCommandTopicPrefix = "cmd/",
  [string]$ExpectedAckTopicPrefix = "cmd_ack/",
  [string]$ApiEnvFile = "services/api/.env",
  [string]$IngestEnvFile = "services/ingest/.env",
  [string]$CenterRuntimeFreezeFile = "docs/unified/reports/field-center-runtime-freeze-latest.json",
  [string]$PhaseReadinessFile = "docs/unified/reports/field-center-deployment-software-adaptation-readiness-latest.json",
  [string]$OutFile = "docs/unified/reports/field-rk3568-production-uplink-freeze-latest.json"
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

function Resolve-RepoPath {
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
  param(
    [string]$Path,
    [string]$Label
  )

  if (-not (Test-Path -LiteralPath $Path)) {
    throw "$Label not found: $Path"
  }

  return (Get-Content -LiteralPath $Path -Raw -Encoding UTF8) | ConvertFrom-Json
}

function Read-DotEnvMap {
  param(
    [string]$Path
  )

  $map = [ordered]@{}
  foreach ($line in Get-Content -LiteralPath $Path -Encoding UTF8) {
    $trimmed = $line.Trim()
    if (-not $trimmed -or $trimmed.StartsWith("#")) {
      continue
    }
    $idx = $trimmed.IndexOf("=")
    if ($idx -lt 1) {
      continue
    }
    $key = $trimmed.Substring(0, $idx).Trim()
    $value = $trimmed.Substring($idx + 1)
    $map[$key] = $value
  }
  return $map
}

function Invoke-RemoteBash {
  param(
    [string]$TargetHost,
    [string]$TargetUser,
    [string]$TargetPassword,
    [int]$TargetPort,
    [string]$ScriptText
  )

  if ($TargetPassword) {
    $tempScriptFile = [System.IO.Path]::GetTempFileName()
    $pythonSnippet = @'
import sys
import paramiko
from pathlib import Path

host = sys.argv[1]
user = sys.argv[2]
password = sys.argv[3]
port = int(sys.argv[4])
script = Path(sys.argv[5]).read_text(encoding="utf-8")

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(hostname=host, username=user, password=password, port=port, timeout=15, banner_timeout=15, auth_timeout=15)
stdin, stdout, stderr = client.exec_command("bash -s --", timeout=180)
stdin.write(script)
stdin.flush()
stdin.channel.shutdown_write()
sys.stdout.write(stdout.read().decode("utf-8", errors="replace"))
sys.stderr.write(stderr.read().decode("utf-8", errors="replace"))
code = stdout.channel.recv_exit_status()
client.close()
raise SystemExit(code)
'@

    try {
      $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
      [System.IO.File]::WriteAllText($tempScriptFile, $ScriptText, $utf8NoBom)
      $pythonSnippet | & python - $TargetHost $TargetUser $TargetPassword ([string]$TargetPort) $tempScriptFile
    } finally {
      Remove-Item $tempScriptFile -Force -ErrorAction SilentlyContinue
    }
    return
  }

  $sshExe = (Get-Command ssh.exe -ErrorAction Stop).Source
  $sshArgs = @(
    "-p"
    ([string]$TargetPort)
    "-o"
    "StrictHostKeyChecking=accept-new"
    "-o"
    "ServerAliveInterval=15"
    "-o"
    "ServerAliveCountMax=3"
    ("{0}@{1}" -f $TargetUser, $TargetHost)
    "bash"
    "-s"
    "--"
  )

  $ScriptText | & $sshExe @sshArgs
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
  $previousPreference = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    $output = & $Action 2>&1 | ForEach-Object { $_.ToString() } | Out-String
  } finally {
    $ErrorActionPreference = $previousPreference
  }

  if ($LASTEXITCODE -ne 0) {
    throw "$Label failed (exit=$LASTEXITCODE)"
  }

  return Convert-TextToJsonObject -Text $output -Label $Label
}

function Get-Check {
  param(
    [string]$Key,
    [bool]$Ok,
    $Actual,
    $Expected
  )

  [pscustomobject]@{
    key = $Key
    ok = $Ok
    actual = $Actual
    expected = $Expected
  }
}

function Get-ExpectedNodes {
  @(
    [ordered]@{
      fieldNodeId = "A"
      deviceId = "00000000-0000-0000-0000-000000000001"
      installLabel = "FIELD-NODE-A"
      southboundPort = "/dev/ttyS3"
      enabled = $true
    },
    [ordered]@{
      fieldNodeId = "B"
      deviceId = "00000000-0000-0000-0000-000000000002"
      installLabel = "FIELD-NODE-B"
      southboundPort = "/dev/ttyS3"
      enabled = $true
    },
    [ordered]@{
      fieldNodeId = "C"
      deviceId = "00000000-0000-0000-0000-000000000003"
      installLabel = "FIELD-NODE-C"
      southboundPort = "/dev/ttyS3"
      enabled = $false
    }
  )
}

function Compare-Nodes {
  param(
    [object[]]$ExpectedNodes,
    [object[]]$ActualNodes
  )

  if (@($ExpectedNodes).Count -ne @($ActualNodes).Count) {
    return $false
  }

  foreach ($expected in $ExpectedNodes) {
    $actual = @($ActualNodes | Where-Object { $_.deviceId -eq $expected.deviceId } | Select-Object -First 1)[0]
    if ($null -eq $actual) {
      return $false
    }
    if (
      [string]$actual.fieldNodeId -ne [string]$expected.fieldNodeId -or
      [string]$actual.installLabel -ne [string]$expected.installLabel -or
      [string]$actual.southboundPort -ne [string]$expected.southboundPort -or
      [bool]$actual.enabled -ne [bool]$expected.enabled
    ) {
      return $false
    }
  }

  return $true
}

$localRepoRoot = Resolve-RepoRoot
$resolvedApiEnvFile = Resolve-RepoPath -RootPath $localRepoRoot -CandidatePath $ApiEnvFile
$resolvedIngestEnvFile = Resolve-RepoPath -RootPath $localRepoRoot -CandidatePath $IngestEnvFile
$resolvedCenterRuntimeFreezeFile = Resolve-RepoPath -RootPath $localRepoRoot -CandidatePath $CenterRuntimeFreezeFile
$resolvedPhaseReadinessFile = Resolve-RepoPath -RootPath $localRepoRoot -CandidatePath $PhaseReadinessFile
$resolvedOutFile = Resolve-RepoPath -RootPath $localRepoRoot -CandidatePath $OutFile

if (-not (Test-Path -LiteralPath $resolvedApiEnvFile)) {
  throw "API env file not found: $resolvedApiEnvFile"
}
if (-not (Test-Path -LiteralPath $resolvedIngestEnvFile)) {
  throw "Ingest env file not found: $resolvedIngestEnvFile"
}

$apiEnv = Read-DotEnvMap -Path $resolvedApiEnvFile
$ingestEnv = Read-DotEnvMap -Path $resolvedIngestEnvFile
$centerRuntimeFreeze = Read-JsonFile -Path $resolvedCenterRuntimeFreezeFile -Label "Center runtime freeze report"
$phaseReadiness = Read-JsonFile -Path $resolvedPhaseReadinessFile -Label "Phase readiness report"

$expectedMqttUsername = if ($apiEnv.Contains("MQTT_INTERNAL_USERNAME") -and -not [string]::IsNullOrWhiteSpace([string]$apiEnv["MQTT_INTERNAL_USERNAME"])) {
  [string]$apiEnv["MQTT_INTERNAL_USERNAME"]
} elseif ($ingestEnv.Contains("MQTT_USERNAME") -and -not [string]::IsNullOrWhiteSpace([string]$ingestEnv["MQTT_USERNAME"])) {
  [string]$ingestEnv["MQTT_USERNAME"]
} else {
  "ingest-service"
}

$expectedMqttPassword = if ($apiEnv.Contains("MQTT_INTERNAL_PASSWORD") -and -not [string]::IsNullOrWhiteSpace([string]$apiEnv["MQTT_INTERNAL_PASSWORD"])) {
  [string]$apiEnv["MQTT_INTERNAL_PASSWORD"]
} elseif ($ingestEnv.Contains("MQTT_PASSWORD")) {
  [string]$ingestEnv["MQTT_PASSWORD"]
} else {
  throw "Cannot resolve expected MQTT internal password from services/api/.env or services/ingest/.env"
}

$expectedNodes = @(Get-ExpectedNodes)

$remoteEnv = Invoke-JsonScript "Read RK3568 field gateway env" {
  Invoke-RemoteBash -TargetHost $BoardHost -TargetUser $User -TargetPassword $Password -TargetPort $SshPort -ScriptText @"
set -euo pipefail
python3 - "$BoardEnvFile" <<'PY'
import json
import pathlib
import sys

env_path = pathlib.Path(sys.argv[1])
result = {}
if env_path.exists():
    for raw in env_path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        result[key.strip()] = value

print(json.dumps(result, ensure_ascii=False))
PY
"@
}

$runtimeReport = Invoke-JsonScript "Check RK3568 field gateway runtime" {
  powershell -NoProfile -ExecutionPolicy Bypass -File ".\scripts\dev\check-rk3568-field-gateway-runtime.ps1" `
    -BoardHost $BoardHost `
    -User $User `
    -Password $Password `
    -SshPort $SshPort `
    -RepoRoot $RepoRoot
}

$actualNodes = @()
if ($remoteEnv.SOUTHBOUND_NODES_JSON) {
  $actualNodes = @([System.Management.Automation.PSObject[]](ConvertFrom-Json -InputObject ([string]$remoteEnv.SOUTHBOUND_NODES_JSON)))
}

$runtimeHealth = $runtimeReport.runtimeHealth
$serviceState = $runtimeReport.serviceState
$nodeA = @($runtimeHealth.southbound.nodes | Where-Object { $_.deviceId -eq "00000000-0000-0000-0000-000000000001" } | Select-Object -First 1)[0]
$nodeB = @($runtimeHealth.southbound.nodes | Where-Object { $_.deviceId -eq "00000000-0000-0000-0000-000000000002" } | Select-Object -First 1)[0]
$nodeC = @($runtimeHealth.southbound.nodes | Where-Object { $_.deviceId -eq "00000000-0000-0000-0000-000000000003" } | Select-Object -First 1)[0]
$boardPasswordActual = if ([string]::IsNullOrWhiteSpace([string]$remoteEnv.MQTT_PASSWORD)) { "missing" } else { "***" }
$runtimeStatsPropertyNames = @($runtimeHealth.stats.PSObject.Properties | ForEach-Object { $_.Name })
$rejectedStatsPresent = (($runtimeStatsPropertyNames -contains "rejectedMessages") -and ($runtimeStatsPropertyNames -contains "rejectedWriteFailures"))

$checks = @(
  (Get-Check -Key "centerRuntimeFreezeAccepted" -Ok:([bool]$centerRuntimeFreeze.accepted) -Actual ([bool]$centerRuntimeFreeze.accepted) -Expected $true),
  (Get-Check -Key "centerRuntimeFreezeBoundary" -Ok:([string]$centerRuntimeFreeze.currentBoundary -eq "center-runtime-freeze-ready") -Actual ([string]$centerRuntimeFreeze.currentBoundary) -Expected "center-runtime-freeze-ready"),
  (Get-Check -Key "phaseReadinessAccepted" -Ok:([bool]$phaseReadiness.accepted) -Actual ([bool]$phaseReadiness.accepted) -Expected $true),
  (Get-Check -Key "phaseReadinessBoundary" -Ok:([string]$phaseReadiness.currentBoundary -eq "center-deployment-software-adaptation-ready") -Actual ([string]$phaseReadiness.currentBoundary) -Expected "center-deployment-software-adaptation-ready"),
  (Get-Check -Key "serviceActive" -Ok:([string]$serviceState.isActive.stdout -eq "active") -Actual ([string]$serviceState.isActive.stdout) -Expected "active"),
  (Get-Check -Key "serviceEnabled" -Ok:([string]$serviceState.isEnabled.stdout -eq "enabled") -Actual ([string]$serviceState.isEnabled.stdout) -Expected "enabled"),
  (Get-Check -Key "runtimeMqttConnected" -Ok:([bool]$runtimeHealth.mqtt.connected) -Actual ([bool]$runtimeHealth.mqtt.connected) -Expected $true),
  (Get-Check -Key "runtimeSerialOpen" -Ok:([bool]$runtimeHealth.serial.open) -Actual ([bool]$runtimeHealth.serial.open) -Expected $true),
  (Get-Check -Key "boardMqttUrlMatchesCenter" -Ok:([string]$remoteEnv.MQTT_URL -eq $ExpectedMqttUrl) -Actual ([string]$remoteEnv.MQTT_URL) -Expected $ExpectedMqttUrl),
  (Get-Check -Key "boardMqttUsernameMatchesCenter" -Ok:([string]$remoteEnv.MQTT_USERNAME -eq $expectedMqttUsername) -Actual ([string]$remoteEnv.MQTT_USERNAME) -Expected $expectedMqttUsername),
  (Get-Check -Key "boardMqttPasswordMatchesCenter" -Ok:([string]$remoteEnv.MQTT_PASSWORD -eq $expectedMqttPassword) -Actual $boardPasswordActual -Expected "***"),
  (Get-Check -Key "serialDeviceMatchesExpected" -Ok:([string]$remoteEnv.SERIAL_DEVICE -eq $ExpectedSerialDevice) -Actual ([string]$remoteEnv.SERIAL_DEVICE) -Expected $ExpectedSerialDevice),
  (Get-Check -Key "serialBaudRateMatchesExpected" -Ok:([string]$remoteEnv.SERIAL_BAUD_RATE -eq ([string]$ExpectedSerialBaudRate)) -Actual ([string]$remoteEnv.SERIAL_BAUD_RATE) -Expected ([string]$ExpectedSerialBaudRate)),
  (Get-Check -Key "telemetryTopicPrefixMatchesExpected" -Ok:([string]$remoteEnv.MQTT_TOPIC_TELEMETRY_PREFIX -eq $ExpectedTelemetryTopicPrefix) -Actual ([string]$remoteEnv.MQTT_TOPIC_TELEMETRY_PREFIX) -Expected $ExpectedTelemetryTopicPrefix),
  (Get-Check -Key "commandTopicPrefixMatchesExpected" -Ok:([string]$remoteEnv.MQTT_TOPIC_COMMAND_PREFIX -eq $ExpectedCommandTopicPrefix) -Actual ([string]$remoteEnv.MQTT_TOPIC_COMMAND_PREFIX) -Expected $ExpectedCommandTopicPrefix),
  (Get-Check -Key "ackTopicPrefixMatchesExpected" -Ok:([string]$remoteEnv.MQTT_TOPIC_ACK_PREFIX -eq $ExpectedAckTopicPrefix) -Actual ([string]$remoteEnv.MQTT_TOPIC_ACK_PREFIX) -Expected $ExpectedAckTopicPrefix),
  (Get-Check -Key "southboundNodesFrozen" -Ok:(Compare-Nodes -ExpectedNodes $expectedNodes -ActualNodes $actualNodes) -Actual (@($actualNodes).Count) -Expected (@($expectedNodes).Count)),
  (Get-Check -Key "runtimeNodeAOnline" -Ok:([string]$nodeA.status -eq "online") -Actual ([string]$nodeA.status) -Expected "online"),
  (Get-Check -Key "runtimeNodeBOnline" -Ok:([string]$nodeB.status -eq "online") -Actual ([string]$nodeB.status) -Expected "online"),
  (Get-Check -Key "runtimeNodeCReserved" -Ok:([string]$nodeC.status -eq "configured") -Actual ([string]$nodeC.status) -Expected "configured"),
  (Get-Check -Key "publishFailuresZero" -Ok:([int]$runtimeHealth.stats.publishFailures -eq 0) -Actual ([int]$runtimeHealth.stats.publishFailures) -Expected 0),
  (Get-Check -Key "rejectedStatsPresent" -Ok:$rejectedStatsPresent -Actual $rejectedStatsPresent -Expected $true),
  (Get-Check -Key "rejectedWriteFailuresZero" -Ok:([int]$runtimeHealth.stats.rejectedWriteFailures -eq 0) -Actual ([int]$runtimeHealth.stats.rejectedWriteFailures) -Expected 0),
  (Get-Check -Key "spoolPendingZero" -Ok:([int]$runtimeHealth.stats.spoolPending -eq 0) -Actual ([int]$runtimeHealth.stats.spoolPending) -Expected 0),
  (Get-Check -Key "commandPathObserved" -Ok:([int]$runtimeHealth.stats.commandsForwarded -ge 1 -and [int]$runtimeHealth.stats.ackMessagesPublished -ge 1) -Actual ("forwarded={0},acked={1}" -f [int]$runtimeHealth.stats.commandsForwarded, [int]$runtimeHealth.stats.ackMessagesPublished) -Expected "forwarded>=1,acked>=1")
)

$accepted = (@($checks | Where-Object { -not $_.ok }).Count -eq 0)
$failedKeys = @($checks | Where-Object { -not $_.ok } | ForEach-Object { $_.key })

$report = [ordered]@{
  generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  accepted = $accepted
  mode = "field-rk3568-production-uplink-freeze"
  currentBoundary = if ($accepted) { "rk3568-production-uplink-freeze-ready" } else { "rk3568-production-uplink-freeze-needs-review" }
  board = [ordered]@{
    host = $BoardHost
    sshPort = $SshPort
    repoRoot = $RepoRoot
    envFile = $BoardEnvFile
    serviceName = "lsmv2-field-gateway.service"
  }
  center = [ordered]@{
    runtimeFreezeReport = $CenterRuntimeFreezeFile.Replace("\", "/")
    phaseReadinessReport = $PhaseReadinessFile.Replace("\", "/")
    mqttUrl = $ExpectedMqttUrl
    mqttUsername = $expectedMqttUsername
    mqttPasswordMatched = ([string]$remoteEnv.MQTT_PASSWORD -eq $expectedMqttPassword)
  }
  frozenUplink = [ordered]@{
    serialDevice = [string]$remoteEnv.SERIAL_DEVICE
    serialBaudRate = [string]$remoteEnv.SERIAL_BAUD_RATE
    telemetryTopicPrefix = [string]$remoteEnv.MQTT_TOPIC_TELEMETRY_PREFIX
    commandTopicPrefix = [string]$remoteEnv.MQTT_TOPIC_COMMAND_PREFIX
    ackTopicPrefix = [string]$remoteEnv.MQTT_TOPIC_ACK_PREFIX
    southboundNodes = @($actualNodes)
    failureKeys = $failedKeys
  }
  runtime = [ordered]@{
    serviceActive = [string]$serviceState.isActive.stdout
    serviceEnabled = [string]$serviceState.isEnabled.stdout
    mqttConnected = [bool]$runtimeHealth.mqtt.connected
    serialOpen = [bool]$runtimeHealth.serial.open
    publishedMessages = [int]$runtimeHealth.stats.publishedMessages
    publishFailures = [int]$runtimeHealth.stats.publishFailures
    rejectedMessages = [int]$runtimeHealth.stats.rejectedMessages
    rejectedWriteFailures = [int]$runtimeHealth.stats.rejectedWriteFailures
    spoolPending = [int]$runtimeHealth.stats.spoolPending
    commandsForwarded = [int]$runtimeHealth.stats.commandsForwarded
    ackMessagesPublished = [int]$runtimeHealth.stats.ackMessagesPublished
    nodeStatuses = [ordered]@{
      nodeA = [string]$nodeA.status
      nodeB = [string]$nodeB.status
      nodeC = [string]$nodeC.status
    }
  }
  nextUse = @(
    "refresh board runtime snapshot: powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\check-rk3568-field-gateway-runtime.ps1 -Password <password>",
    "refresh production uplink freeze: powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\check-field-rk3568-production-uplink-freeze.ps1 -Password <password>",
    "rewrite southbound node map if needed: powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\set-rk3568-field-gateway-southbound-nodes.ps1 -Password <password> -NodeSpec 'A|00000000-0000-0000-0000-000000000001|/dev/ttyS3|FIELD-NODE-A|true' -NodeSpec 'B|00000000-0000-0000-0000-000000000002|/dev/ttyS3|FIELD-NODE-B|true' -NodeSpec 'C|00000000-0000-0000-0000-000000000003|/dev/ttyS3|FIELD-NODE-C|false'"
  )
  checks = $checks
}

$outDir = Split-Path -Parent $resolvedOutFile
if ($outDir -and -not (Test-Path -LiteralPath $outDir)) {
  New-Item -ItemType Directory -Path $outDir -Force | Out-Null
}

$json = $report | ConvertTo-Json -Depth 8
Set-Content -LiteralPath $resolvedOutFile -Value $json -Encoding UTF8
$json
