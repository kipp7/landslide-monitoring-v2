[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$DeviceId,
  [ValidateSet("manual-collect", "set-report-5", "set-report-300")]
  [string]$Action = "manual-collect",
  [string]$BoardHost = "192.168.124.172",
  [string]$User = "linaro",
  [string]$Password = "",
  [int]$SshPort = 22,
  [string]$ServiceName = "lsmv2-field-gateway.service",
  [string]$HealthFile = "/var/lib/lsmv2/field-gateway/health/runtime-health.json",
  [string]$MqttUrl = "mqtt://127.0.0.1:1883",
  [string]$ApiEnvFile = "services/api/.env",
  [string]$MqttUsername = "",
  [string]$MqttPassword = "",
  [int]$WaitSeconds = 40,
  [int]$PollSeconds = 2,
  [string]$OutFile = ""
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Read-EnvValue {
  param(
    [string]$Path,
    [string]$Key,
    [string]$Fallback = ""
  )

  if (-not (Test-Path $Path)) { return $Fallback }
  $last = $null
  foreach ($line in Get-Content -Encoding UTF8 $Path) {
    $trimmed = $line.Trim()
    if ($trimmed.StartsWith("#")) { continue }
    if ($trimmed.StartsWith("$Key=")) {
      $value = $trimmed.Substring($Key.Length + 1).Trim()
      if ($value.Length -gt 0) { $last = $value }
    }
  }

  if ($last) { return $last }
  return $Fallback
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
stdin, stdout, stderr = client.exec_command("bash -s --", timeout=120)
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

function Get-RemoteHealth {
  param(
    [string]$TargetHost,
    [string]$TargetUser,
    [string]$TargetPassword,
    [int]$TargetPort,
    [string]$RemoteHealthFile
  )

  $script = @"
set -euo pipefail
cat '$RemoteHealthFile'
"@

  return (Invoke-RemoteBash -TargetHost $TargetHost -TargetUser $TargetUser -TargetPassword $TargetPassword -TargetPort $TargetPort -ScriptText $script | ConvertFrom-Json)
}

function Get-RemoteJournalTail {
  param(
    [string]$TargetHost,
    [string]$TargetUser,
    [string]$TargetPassword,
    [int]$TargetPort,
    [string]$RemoteServiceName,
    [int]$LineCount = 120
  )

  $script = @"
set -euo pipefail
journalctl -u '$RemoteServiceName' -n $LineCount --no-pager
"@

  return [string](Invoke-RemoteBash -TargetHost $TargetHost -TargetUser $TargetUser -TargetPassword $TargetPassword -TargetPort $TargetPort -ScriptText $script | Out-String)
}

function Get-ActionSpec {
  param([string]$ActionName)

  switch ($ActionName) {
    "manual-collect" {
      return [ordered]@{
        commandType = "manual_collect"
        payload = [ordered]@{
          source = "rk3568-multinode-command-proof"
        }
        payloadLabel = "manual_collect_runtime_node_proof"
      }
    }
    "set-report-5" {
      return [ordered]@{
        commandType = "set_config"
        payload = [ordered]@{
          sampling_s = 5
          report_interval_s = 5
        }
        payloadLabel = "set_report_interval_5s_runtime_node_proof"
      }
    }
    "set-report-300" {
      return [ordered]@{
        commandType = "set_config"
        payload = [ordered]@{
          sampling_s = 5
          report_interval_s = 300
        }
        payloadLabel = "set_report_interval_300s_runtime_node_proof"
      }
    }
    default {
      throw "Unsupported action: $ActionName"
    }
  }
}

function Get-NodeState {
  param(
    $Health,
    [string]$TargetDeviceId
  )

  return @($Health.southbound.nodes | Where-Object { $_.deviceId -eq $TargetDeviceId } | Select-Object -First 1)[0]
}

function To-RepoRelativePath {
  param(
    [string]$RootPath,
    [string]$TargetPath
  )

  $rootFull = [System.IO.Path]::GetFullPath($RootPath)
  $targetFull = [System.IO.Path]::GetFullPath($TargetPath)
  if ($targetFull.StartsWith($rootFull, [System.StringComparison]::OrdinalIgnoreCase)) {
    $trimmed = $targetFull.Substring($rootFull.Length).TrimStart('\', '/')
    return $trimmed.Replace("\", "/")
  }
  return $targetFull.Replace("\", "/")
}

function Convert-JournalLineToStructuredEvent {
  param(
    [string]$Line
  )

  if (-not $Line) { return $null }
  $trimmed = $Line.Trim()
  $jsonStart = $trimmed.IndexOf("{")
  if ($jsonStart -lt 0) { return $null }

  $jsonText = $trimmed.Substring($jsonStart)
  try {
    return $jsonText | ConvertFrom-Json
  } catch {
    return $null
  }
}

function Get-ParseFailureEvidence {
  param(
    [string]$JournalText,
    [string]$CommandId
  )

  $evidence = @()
  if (-not $JournalText) { return @($evidence) }

  foreach ($line in ($JournalText -split "`r?`n")) {
    if ($line -notmatch "field gateway json parse failed") { continue }

    $event = Convert-JournalLineToStructuredEvent -Line $line
    if (-not $event) { continue }

    $rawPayloadSnippet = ""
    if ($null -ne $event.PSObject.Properties["rawPayloadSnippet"]) {
      $rawPayloadSnippet = [string]$event.rawPayloadSnippet
    }

    $message = ""
    if ($null -ne $event.PSObject.Properties["err"] -and $null -ne $event.err -and $null -ne $event.err.PSObject.Properties["message"]) {
      $message = [string]$event.err.message
    }
    $failureMode = "unclassified-parse-failure"
    $containsCommandId = $rawPayloadSnippet -match [regex]::Escape($CommandId)
    $containsTelemetryMarkers = $rawPayloadSnippet -match '"seq"' -or $rawPayloadSnippet -match '"metrics"' -or $rawPayloadSnippet -match '"event_ts"'
    $containsAckMarkers = $rawPayloadSnippet -match '"command_id"' -or $rawPayloadSnippet -match '"ack_ts"' -or $rawPayloadSnippet -match '"collect_requested"' -or $rawPayloadSnippet -match '"applied_keys"'
    $schemaVersionCount = ([regex]::Matches($rawPayloadSnippet, '"schema_version"')).Count
    $deviceIdCount = ([regex]::Matches($rawPayloadSnippet, '"device_id"')).Count
    $containsCommandContextMarkers = $rawPayloadSnippet -match '"last_command_type"' -or $rawPayloadSnippet -match '"last_command_id"' -or $rawPayloadSnippet -match '"manual_collect"' -or $rawPayloadSnippet -match '"set_config"'

    if (
      ($containsCommandId -and $containsTelemetryMarkers) -or
      ($containsAckMarkers -and $containsTelemetryMarkers) -or
      ($schemaVersionCount -ge 2) -or
      ($deviceIdCount -ge 2) -or
      ($containsTelemetryMarkers -and $containsCommandContextMarkers)
    ) {
      $failureMode = "shared-stream-byte-interleaving"
    } elseif ($message -match "Unexpected token" -or $message -match "Expected ',' or '}'") {
      $failureMode = "southbound-json-fragmentation"
    }

    $evidence += [pscustomobject]@{
      time = $event.time
      failureMode = $failureMode
      errorMessage = $message
      rawPayloadSnippet = $rawPayloadSnippet
      containsCommandId = $containsCommandId
      containsTelemetryMarkers = $containsTelemetryMarkers
      containsAckMarkers = $containsAckMarkers
      containsCommandContextMarkers = $containsCommandContextMarkers
      schemaVersionCount = $schemaVersionCount
      deviceIdCount = $deviceIdCount
    }
  }

  return @($evidence)
}

function Get-ProofDiagnosis {
  param(
    [bool]$ProofPassed,
    $HealthAfter,
    [string]$JournalText,
    [string]$CommandId
  )

  $parseFailureEvidence = @(Get-ParseFailureEvidence -JournalText $JournalText -CommandId $CommandId)
  $failureModes = @($parseFailureEvidence | ForEach-Object { $_.failureMode } | Select-Object -Unique)
  $ackMessagesPublished = [int]$HealthAfter.stats.ackMessagesPublished
  $commandsForwarded = [int]$HealthAfter.stats.commandsForwarded

  $summary = if ($ProofPassed) {
    "command-forward-and-ack-publish-succeeded"
  } elseif ($commandsForwarded -le 0) {
    "command-did-not-forward"
  } elseif ($ackMessagesPublished -gt 0) {
    "ack-published-but-proof-did-not-classify-as-passed"
  } elseif ($failureModes -contains "shared-stream-byte-interleaving") {
    "ack-blocked-by-shared-stream-byte-interleaving"
  } elseif ($failureModes -contains "southbound-json-fragmentation") {
    "ack-blocked-by-southbound-json-fragmentation"
  } else {
    "ack-not-observed"
  }

  return [ordered]@{
    summary = $summary
    parseFailureCount = @($parseFailureEvidence).Count
    failureModes = @($failureModes)
    parseFailureEvidence = @($parseFailureEvidence | Select-Object -First 5)
  }
}

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$tmpDir = Join-Path $repoRoot ".tmp"
if (-not (Test-Path $tmpDir)) {
  New-Item -ItemType Directory -Path $tmpDir | Out-Null
}

[guid]::Parse($DeviceId) | Out-Null
$apiEnvPath = Join-Path $repoRoot $ApiEnvFile
$resolvedUsername = if ($MqttUsername) { $MqttUsername } else { Read-EnvValue -Path $apiEnvPath -Key "MQTT_INTERNAL_USERNAME" -Fallback "ingest-service" }
$resolvedPassword = if ($MqttPassword) { $MqttPassword } else { Read-EnvValue -Path $apiEnvPath -Key "MQTT_INTERNAL_PASSWORD" -Fallback "" }
if (-not $resolvedPassword) {
  throw "MQTT password is missing. Provide -MqttPassword or set MQTT_INTERNAL_PASSWORD in $ApiEnvFile"
}

$actionSpec = Get-ActionSpec -ActionName $Action
$commandId = [guid]::NewGuid().ToString()
$issuedTs = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$deviceSuffix = $DeviceId.Substring($DeviceId.Length - 4)
$payloadFile = Join-Path $tmpDir ("rk3568-node-command-{0}-{1}.json" -f $deviceSuffix, $stamp)

$payloadDoc = [ordered]@{
  schema_version = 1
  command_id = $commandId
  device_id = $DeviceId
  command_type = $actionSpec.commandType
  payload = $actionSpec.payload
  issued_ts = $issuedTs
}
$payloadDoc | ConvertTo-Json -Depth 8 -Compress | Set-Content -Path $payloadFile -Encoding UTF8

$healthBefore = Get-RemoteHealth -TargetHost $BoardHost -TargetUser $User -TargetPassword $Password -TargetPort $SshPort -RemoteHealthFile $HealthFile
$beforeNode = Get-NodeState -Health $healthBefore -TargetDeviceId $DeviceId

$injectScript = Join-Path $repoRoot "scripts/dev/inject-hardware-stable-version-command.ps1"
$publishArgs = @(
  "-NoProfile"
  "-ExecutionPolicy"
  "Bypass"
  "-File"
  $injectScript
  "-Mode"
  "mqtt"
  "-MqttUrl"
  $MqttUrl
  "-PayloadFile"
  $payloadFile
  "-PayloadLabel"
  $actionSpec.payloadLabel
  "-Username"
  $resolvedUsername
  "-Password"
  $resolvedPassword
)

$publishRaw = & powershell.exe @publishArgs | Out-String
if ($LASTEXITCODE -ne 0) {
  throw "inject-hardware-stable-version-command.ps1 mqtt failed (exit=$LASTEXITCODE)"
}
$publishResult = $publishRaw | ConvertFrom-Json

$baselineCommandsReceived = [int]$healthBefore.stats.commandsReceived
$baselineCommandsForwarded = [int]$healthBefore.stats.commandsForwarded
$baselineAckMessagesPublished = [int]$healthBefore.stats.ackMessagesPublished
$deadline = (Get-Date).AddSeconds($WaitSeconds)
$healthAfter = $healthBefore
$journalTail = ""
$proofPassed = $false

while ((Get-Date) -lt $deadline) {
  Start-Sleep -Seconds ([Math]::Max(1, $PollSeconds))
  $healthAfter = Get-RemoteHealth -TargetHost $BoardHost -TargetUser $User -TargetPassword $Password -TargetPort $SshPort -RemoteHealthFile $HealthFile
  $journalTail = Get-RemoteJournalTail -TargetHost $BoardHost -TargetUser $User -TargetPassword $Password -TargetPort $SshPort -RemoteServiceName $ServiceName -LineCount 160

  $commandForwarded = ([int]$healthAfter.stats.commandsForwarded -gt $baselineCommandsForwarded) -or ($journalTail -match [regex]::Escape($commandId) -and $journalTail -match "field gateway command forwarded to serial")
  $ackPublished = ([int]$healthAfter.stats.ackMessagesPublished -gt $baselineAckMessagesPublished) -or ($journalTail -match [regex]::Escape($commandId) -and $journalTail -match "field gateway command ack published")

  if ($commandForwarded -and $ackPublished) {
    $proofPassed = $true
    break
  }
}

$afterNode = Get-NodeState -Health $healthAfter -TargetDeviceId $DeviceId
$diagnosis = Get-ProofDiagnosis -ProofPassed:$proofPassed -HealthAfter $healthAfter -JournalText $journalTail -CommandId $commandId
$result = [ordered]@{
  generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  passed = $proofPassed
  boardHost = $BoardHost
  serviceName = $ServiceName
  mqttUrl = $MqttUrl
  action = $Action
  command = $payloadDoc
  payloadFile = To-RepoRelativePath -RootPath $repoRoot -TargetPath $payloadFile
  publishResult = $publishResult
  before = [ordered]@{
    commandsReceived = $baselineCommandsReceived
    commandsForwarded = $baselineCommandsForwarded
    ackMessagesPublished = $baselineAckMessagesPublished
    node = $beforeNode
  }
  after = [ordered]@{
    commandsReceived = [int]$healthAfter.stats.commandsReceived
    commandsForwarded = [int]$healthAfter.stats.commandsForwarded
    ackMessagesPublished = [int]$healthAfter.stats.ackMessagesPublished
    node = $afterNode
    lastCommandForwardedTs = $healthAfter.stats.lastCommandForwardedTs
    lastAckPublishedTs = $healthAfter.stats.lastAckPublishedTs
  }
  diagnosis = $diagnosis
  runtimeHealth = $healthAfter
  journalTail = $journalTail
}

$resultJson = $result | ConvertTo-Json -Depth 8
if ($OutFile) {
  Set-Content -Path $OutFile -Value $resultJson -Encoding UTF8
}
$resultJson
