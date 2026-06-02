[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$DeviceId,
  [ValidateSet("manual-collect", "set-report-5", "set-report-300", "set-report-custom")]
  [string]$Action = "manual-collect",
  [int]$ReportIntervalSeconds = 0,
  [string]$BoardHost = "192.168.124.179",
  [string]$User = "linaro",
  [string]$Password = "",
  [int]$SshPort = 22,
  [string]$ServiceName = "lsmv2-field-gateway.service",
  [string]$HealthFile = "/var/lib/lsmv2/field-gateway/health/runtime-health.json",
  [string]$RejectedDir = "/var/lib/lsmv2/field-gateway/spool/rejected",
  [string]$MqttUrl = "mqtt://127.0.0.1:1883",
  [string]$ApiEnvFile = "services/api/.env",
  [string]$ApiBaseUrl = "http://127.0.0.1:8080",
  [string]$ApiUsername = "admin",
  [string]$ApiPassword = "123456",
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
client.connect(hostname=host, username=user, password=password, port=port, timeout=20, banner_timeout=60, auth_timeout=30)
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

function Get-RemoteJournalForCommand {
  param(
    [string]$TargetHost,
    [string]$TargetUser,
    [string]$TargetPassword,
    [int]$TargetPort,
    [string]$RemoteServiceName,
    [string]$CommandId,
    [int]$LineCount = 600
  )

  $script = @"
set -euo pipefail
journalctl -u '$RemoteServiceName' -n $LineCount --no-pager | grep -F '$CommandId' || true
"@

  return [string](Invoke-RemoteBash -TargetHost $TargetHost -TargetUser $TargetUser -TargetPassword $TargetPassword -TargetPort $TargetPort -ScriptText $script | Out-String)
}

function Get-RemoteRejectedEvidence {
  param(
    [string]$TargetHost,
    [string]$TargetUser,
    [string]$TargetPassword,
    [int]$TargetPort,
    [string]$RemoteRejectedDir,
    [string]$CommandId,
    [string]$DeviceId
  )

  $pythonSnippet = @'
import json
from pathlib import Path

rejected_dir = Path("__REJECTED_DIR__")
command_id = "__COMMAND_ID__"
device_id = "__DEVICE_ID__"

summary = {
    "available": rejected_dir.exists(),
    "dir": str(rejected_dir),
    "commandId": command_id,
    "deviceId": device_id,
    "commandIdMatchCount": 0,
    "deviceIdMatchCount": 0,
    "ackMarkerCount": 0,
    "ackedStatusCount": 0,
    "commandIdAndAckMarkerCount": 0,
    "commandIdAndAckedStatusCount": 0,
    "samples": []
}

if rejected_dir.exists():
    files = sorted(rejected_dir.glob("*.json"), reverse=True)[:200]
    for path in files:
        try:
            text = path.read_text(encoding="utf-8", errors="replace")
        except Exception:
            continue

        has_command = command_id in text
        has_device = device_id in text
        has_ack_marker = '"ack_ts"' in text
        has_acked = '"status":"acked"' in text or '"status": "acked"' in text

        if has_command:
            summary["commandIdMatchCount"] += 1
        if has_device:
            summary["deviceIdMatchCount"] += 1
        if has_ack_marker:
            summary["ackMarkerCount"] += 1
        if has_acked:
            summary["ackedStatusCount"] += 1
        if has_command and has_ack_marker:
            summary["commandIdAndAckMarkerCount"] += 1
        if has_command and has_acked:
            summary["commandIdAndAckedStatusCount"] += 1

        if has_command or has_ack_marker:
            anchor = text.find(command_id)
            if anchor < 0:
                anchor = text.find('"ack_ts"')
            if anchor < 0:
                anchor = 0
            start = max(anchor - 180, 0)
            end = min(anchor + 220, len(text))
            excerpt = text[start:end].replace("\n", "\\n").replace("\r", "")
            summary["samples"].append({
                "file": str(path),
                "containsCommandId": has_command,
                "containsDeviceId": has_device,
                "containsAckMarker": has_ack_marker,
                "containsAckedStatus": has_acked,
                "excerpt": excerpt
            })

summary["samples"] = summary["samples"][:5]
print(json.dumps(summary, ensure_ascii=False))
'@

  $remoteScript = @"
set -euo pipefail
python3 - <<'PY'
$pythonSnippet
PY
"@

  $remoteScript = $remoteScript.Replace("__REJECTED_DIR__", $RemoteRejectedDir.Replace("\", "\\"))
  $remoteScript = $remoteScript.Replace("__COMMAND_ID__", $CommandId)
  $remoteScript = $remoteScript.Replace("__DEVICE_ID__", $DeviceId)

  return (Invoke-RemoteBash -TargetHost $TargetHost -TargetUser $TargetUser -TargetPassword $TargetPassword -TargetPort $TargetPort -ScriptText $remoteScript | ConvertFrom-Json)
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
    "set-report-custom" {
      if ($ReportIntervalSeconds -le 0) {
        throw "set-report-custom requires -ReportIntervalSeconds > 0"
      }

      return [ordered]@{
        commandType = "set_config"
        payload = [ordered]@{
          sampling_s = 5
          report_interval_s = $ReportIntervalSeconds
        }
        payloadLabel = ("set_report_interval_{0}s_runtime_node_proof" -f $ReportIntervalSeconds)
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

function New-ApiSession {
  param(
    [string]$BaseUrl,
    [string]$UserNameValue,
    [string]$PasswordValue
  )

  $loginUri = ($BaseUrl.TrimEnd("/") + "/api/v1/auth/login")
  $loginBody = @{
    username = $UserNameValue
    password = $PasswordValue
  } | ConvertTo-Json -Compress

  $login = Invoke-RestMethod -Uri $loginUri -Method Post -ContentType "application/json" -Body $loginBody -Headers @{
    Accept = "application/json"
  }

  $token = [string]$login.data.token
  if ([string]::IsNullOrWhiteSpace($token)) {
    throw "Auth token missing from $loginUri"
  }

  return [pscustomobject]@{
    baseUrl = $BaseUrl.TrimEnd("/")
    headers = @{
      Accept = "application/json"
      Authorization = "Bearer $token"
    }
  }
}

function Get-DeviceStateSnapshot {
  param(
    $Session,
    [string]$TargetDeviceId
  )

  return Invoke-RestMethod -Uri ($Session.baseUrl + "/api/v1/data/state/" + [uri]::EscapeDataString($TargetDeviceId)) -Method Get -Headers $Session.headers -TimeoutSec 10
}

function Try-Get-ReadPathEvidence {
  param(
    $Session,
    [string]$TargetDeviceId,
    [string]$ExpectedCommandId,
    [string]$ExpectedCommandType,
    [datetime]$IssuedAtUtc
  )

  if ($null -eq $Session) {
    return $null
  }

  try {
    $response = Get-DeviceStateSnapshot -Session $Session -TargetDeviceId $TargetDeviceId
    $stateData = $response.data
    $state = $stateData.state
    $meta = if ($state) { $state.meta } else { $null }
    $updatedAtText = if ($null -ne $stateData.PSObject.Properties["updatedAt"]) { [string]$stateData.updatedAt } else { "" }
    $updatedAtUtc = $null
    if (-not [string]::IsNullOrWhiteSpace($updatedAtText)) {
      $updatedAtUtc = [DateTime]::Parse($updatedAtText, [System.Globalization.CultureInfo]::InvariantCulture, [System.Globalization.DateTimeStyles]::AssumeUniversal -bor [System.Globalization.DateTimeStyles]::AdjustToUniversal)
    }

    $lastCommandId = if ($meta -and $null -ne $meta.PSObject.Properties["last_command_id"]) { [string]$meta.last_command_id } else { "" }
    $lastCommandType = if ($meta -and $null -ne $meta.PSObject.Properties["last_command_type"]) { [string]$meta.last_command_type } else { "" }
    $uploadTrigger = if ($meta -and $null -ne $meta.PSObject.Properties["upload_trigger"]) { [string]$meta.upload_trigger } else { "" }

    $commandIdMatch = ($lastCommandId -eq $ExpectedCommandId)
    $commandTypeMatch = ($lastCommandType -eq $ExpectedCommandType)
    $updatedAfterIssue = ($null -ne $updatedAtUtc -and $updatedAtUtc -ge $IssuedAtUtc)
    $telemetryAdvancedToCommand = ($commandIdMatch -and $commandTypeMatch -and $updatedAfterIssue)

    return [pscustomobject][ordered]@{
      available = $true
      error = $null
      updatedAt = $updatedAtText
      updatedAfterIssue = $updatedAfterIssue
      lastCommandId = $lastCommandId
      lastCommandType = $lastCommandType
      uploadTrigger = $uploadTrigger
      commandIdMatch = $commandIdMatch
      commandTypeMatch = $commandTypeMatch
      telemetryAdvancedToCommand = $telemetryAdvancedToCommand
    }
  } catch {
    return [pscustomobject][ordered]@{
      available = $false
      error = $_.Exception.Message
      updatedAt = $null
      updatedAfterIssue = $false
      lastCommandId = ""
      lastCommandType = ""
      uploadTrigger = ""
      commandIdMatch = $false
      commandTypeMatch = $false
      telemetryAdvancedToCommand = $false
    }
  }
}

function Get-ParseFailureEvidence {
  param(
    [string]$JournalText,
    [string]$CommandId,
    [Nullable[Int64]]$MinEventTime = $null
  )

  $evidence = @()
  if (-not $JournalText) { return @($evidence) }

  foreach ($line in ($JournalText -split "`r?`n")) {
    if ($line -notmatch "field gateway json parse failed") { continue }

    $event = Convert-JournalLineToStructuredEvent -Line $line
    if (-not $event) { continue }
    if ($MinEventTime -ne $null) {
      if ($null -eq $event.PSObject.Properties["time"]) { continue }
      if ([Int64]$event.time -lt $MinEventTime.Value) { continue }
    }

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

function Get-CommandEventEvidence {
  param(
    [string]$JournalText,
    [string]$CommandId,
    [string]$MessageText
  )

  if (-not $JournalText) { return $null }

  $eventMatches = @()
  foreach ($line in ($JournalText -split "`r?`n")) {
    if ($line -notmatch [regex]::Escape($MessageText)) { continue }

    $event = Convert-JournalLineToStructuredEvent -Line $line
    if (-not $event) { continue }
    if ($null -eq $event.PSObject.Properties["commandId"]) { continue }
    if ([string]$event.commandId -ne $CommandId) { continue }
    $eventMatches += $event
  }

  if (@($eventMatches).Count -le 0) { return $null }
  return @($eventMatches | Select-Object -Last 1)[0]
}

function Get-ProofDiagnosis {
  param(
    [bool]$ProofPassed,
    $HealthBefore,
    $HealthAfter,
    $BeforeNode,
    $AfterNode,
    $CommandForwardEvidence,
    $ReadPathEvidence,
    $RejectedEvidence,
    [string]$JournalText,
    [string]$CommandId,
    [string]$AckStatus = ""
  )

  $minEventTime = $null
  if ($CommandForwardEvidence -and $null -ne $CommandForwardEvidence.PSObject.Properties["time"]) {
    $minEventTime = [Int64]$CommandForwardEvidence.time
  }
  $parseFailureEvidence = @(Get-ParseFailureEvidence -JournalText $JournalText -CommandId $CommandId -MinEventTime $minEventTime)
  $failureModes = @($parseFailureEvidence | ForEach-Object { $_.failureMode } | Select-Object -Unique)
  $ackMessagesPublishedBefore = [int]$HealthBefore.stats.ackMessagesPublished
  $ackMessagesPublishedAfter = [int]$HealthAfter.stats.ackMessagesPublished
  $ackMessagesPublishedDelta = $ackMessagesPublishedAfter - $ackMessagesPublishedBefore
  $commandsForwardedBefore = [int]$HealthBefore.stats.commandsForwarded
  $commandsForwardedAfter = [int]$HealthAfter.stats.commandsForwarded
  $commandsForwardedDelta = $commandsForwardedAfter - $commandsForwardedBefore
  $nodeAckPublishesBefore = if ($BeforeNode -and $null -ne $BeforeNode.PSObject.Properties["ackPublishes"]) { [int]$BeforeNode.ackPublishes } else { 0 }
  $nodeAckPublishesAfter = if ($AfterNode -and $null -ne $AfterNode.PSObject.Properties["ackPublishes"]) { [int]$AfterNode.ackPublishes } else { 0 }
  $nodeAckPublishesDelta = $nodeAckPublishesAfter - $nodeAckPublishesBefore
  $nodeTelemetryBefore = if ($BeforeNode -and $null -ne $BeforeNode.PSObject.Properties["telemetryMessages"]) { [int]$BeforeNode.telemetryMessages } else { 0 }
  $nodeTelemetryAfter = if ($AfterNode -and $null -ne $AfterNode.PSObject.Properties["telemetryMessages"]) { [int]$AfterNode.telemetryMessages } else { 0 }
  $nodeTelemetryDelta = $nodeTelemetryAfter - $nodeTelemetryBefore
  $nodeStatusBefore = if ($BeforeNode -and $null -ne $BeforeNode.PSObject.Properties["status"]) { [string]$BeforeNode.status } else { "" }
  $nodeStatusAfter = if ($AfterNode -and $null -ne $AfterNode.PSObject.Properties["status"]) { [string]$AfterNode.status } else { "" }
  $targetTelemetryAdvancedToCommand = ($null -ne $ReadPathEvidence -and [bool]$ReadPathEvidence.telemetryAdvancedToCommand)
  $rejectedCommandIdMatchCount = if ($null -ne $RejectedEvidence -and $null -ne $RejectedEvidence.PSObject.Properties["commandIdMatchCount"]) { [int]$RejectedEvidence.commandIdMatchCount } else { 0 }
  $rejectedCommandIdAndAckMarkerCount = if ($null -ne $RejectedEvidence -and $null -ne $RejectedEvidence.PSObject.Properties["commandIdAndAckMarkerCount"]) { [int]$RejectedEvidence.commandIdAndAckMarkerCount } else { 0 }

  $summary = if ($ProofPassed) {
    "command-forward-and-ack-publish-succeeded"
  } elseif ($AckStatus -and $AckStatus -ne "acked") {
    "command-forwarded-but-ack-status-not-acked"
  } elseif ($commandsForwardedDelta -le 0) {
    "command-did-not-forward"
  } elseif ($targetTelemetryAdvancedToCommand -and $rejectedCommandIdMatchCount -gt 0 -and $rejectedCommandIdAndAckMarkerCount -le 0) {
    "target-consumed-command-and-command-id-appears-in-rejected-evidence-without-explicit-ack-marker"
  } elseif ($targetTelemetryAdvancedToCommand -and ($failureModes -contains "shared-stream-byte-interleaving")) {
    "target-consumed-command-but-ack-corrupted-by-shared-stream-byte-interleaving"
  } elseif ($targetTelemetryAdvancedToCommand -and ($failureModes -contains "southbound-json-fragmentation")) {
    "target-consumed-command-but-ack-corrupted-by-southbound-json-fragmentation"
  } elseif ($targetTelemetryAdvancedToCommand -and ($nodeAckPublishesDelta -le 0 -and $ackMessagesPublishedDelta -le 0)) {
    "target-consumed-command-but-ack-not-published"
  } elseif ($nodeAckPublishesDelta -gt 0 -or $ackMessagesPublishedDelta -gt 0) {
    "ack-published-outside-proof-classification"
  } elseif ($nodeStatusAfter -eq "offline" -and $nodeTelemetryDelta -le 0) {
    "command-forwarded-while-node-offline"
  } elseif ($failureModes -contains "shared-stream-byte-interleaving") {
    "forwarded-but-not-observed-at-target-with-shared-stream-byte-interleaving"
  } elseif ($failureModes -contains "southbound-json-fragmentation") {
    "forwarded-but-not-observed-at-target-with-southbound-json-fragmentation"
  } else {
    "forwarded-but-not-observed-at-target"
  }

  return [ordered]@{
    summary = $summary
    commandsForwardedDelta = $commandsForwardedDelta
    ackMessagesPublishedDelta = $ackMessagesPublishedDelta
    nodeAckPublishesDelta = $nodeAckPublishesDelta
    nodeTelemetryDelta = $nodeTelemetryDelta
    nodeStatusBefore = $nodeStatusBefore
    nodeStatusAfter = $nodeStatusAfter
    targetTelemetryAdvancedToCommand = $targetTelemetryAdvancedToCommand
    readPathAvailable = ($null -ne $ReadPathEvidence -and [bool]$ReadPathEvidence.available)
    readPathError = if ($null -ne $ReadPathEvidence) { $ReadPathEvidence.error } else { $null }
    rejectedCommandIdMatchCount = $rejectedCommandIdMatchCount
    rejectedCommandIdAndAckMarkerCount = $rejectedCommandIdAndAckMarkerCount
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
$issuedAtUtc = [DateTime]::Parse($issuedTs, [System.Globalization.CultureInfo]::InvariantCulture, [System.Globalization.DateTimeStyles]::AssumeUniversal -bor [System.Globalization.DateTimeStyles]::AdjustToUniversal)
$stamp = Get-Date -Format "yyyyMMdd-HHmmss-fff"
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
$apiSession = $null
try {
  $apiSession = New-ApiSession -BaseUrl $ApiBaseUrl -UserNameValue $ApiUsername -PasswordValue $ApiPassword
} catch {
  $apiSession = $null
}

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
$commandForwardEvidence = $null
$ackEvidence = $null
$ackStatus = ""
$readPathEvidence = $null
$rejectedEvidence = $null

while ((Get-Date) -lt $deadline) {
  Start-Sleep -Seconds ([Math]::Max(1, $PollSeconds))
  $healthAfter = Get-RemoteHealth -TargetHost $BoardHost -TargetUser $User -TargetPassword $Password -TargetPort $SshPort -RemoteHealthFile $HealthFile
  $readPathEvidence = Try-Get-ReadPathEvidence -Session $apiSession -TargetDeviceId $DeviceId -ExpectedCommandId $commandId -ExpectedCommandType $actionSpec.commandType -IssuedAtUtc $issuedAtUtc
  $journalTail = Get-RemoteJournalTail -TargetHost $BoardHost -TargetUser $User -TargetPassword $Password -TargetPort $SshPort -RemoteServiceName $ServiceName -LineCount 160
  $commandJournal = Get-RemoteJournalForCommand -TargetHost $BoardHost -TargetUser $User -TargetPassword $Password -TargetPort $SshPort -RemoteServiceName $ServiceName -CommandId $commandId -LineCount 600
  if ($commandJournal) {
    $journalTail = ($journalTail.TrimEnd() + "`n" + $commandJournal.Trim()).Trim()
  }

  $commandForwardEvidence = Get-CommandEventEvidence -JournalText $journalTail -CommandId $commandId -MessageText "field gateway command forwarded to serial"
  $ackEvidence = Get-CommandEventEvidence -JournalText $journalTail -CommandId $commandId -MessageText "field gateway command ack published"
  $ackStatus = if ($ackEvidence -and $null -ne $ackEvidence.PSObject.Properties["status"]) { [string]$ackEvidence.status } else { "" }

  $commandForwarded = ([int]$healthAfter.stats.commandsForwarded -gt $baselineCommandsForwarded) -or ($null -ne $commandForwardEvidence)
  $ackSucceeded = $ackStatus -eq "acked"

  if ($commandForwarded -and $ackSucceeded) {
    $proofPassed = $true
    break
  }
}

$afterNode = Get-NodeState -Health $healthAfter -TargetDeviceId $DeviceId
$rejectedEvidence = Get-RemoteRejectedEvidence -TargetHost $BoardHost -TargetUser $User -TargetPassword $Password -TargetPort $SshPort -RemoteRejectedDir $RejectedDir -CommandId $commandId -DeviceId $DeviceId
$diagnosis = Get-ProofDiagnosis -ProofPassed:$proofPassed -HealthBefore $healthBefore -HealthAfter $healthAfter -BeforeNode $beforeNode -AfterNode $afterNode -CommandForwardEvidence $commandForwardEvidence -ReadPathEvidence $readPathEvidence -RejectedEvidence $rejectedEvidence -JournalText $journalTail -CommandId $commandId -AckStatus $ackStatus
$result = [ordered]@{
  generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  passed = $proofPassed
  boardHost = $BoardHost
  serviceName = $ServiceName
  mqttUrl = $MqttUrl
  apiBaseUrl = $ApiBaseUrl
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
  commandEvidence = $commandForwardEvidence
  ackEvidence = $ackEvidence
  readPathEvidence = $readPathEvidence
  rejectedEvidence = $rejectedEvidence
  diagnosis = $diagnosis
  runtimeHealth = $healthAfter
  journalTail = $journalTail
}

$resultJson = $result | ConvertTo-Json -Depth 8
if ($OutFile) {
  Set-Content -Path $OutFile -Value $resultJson -Encoding UTF8
}
$resultJson
