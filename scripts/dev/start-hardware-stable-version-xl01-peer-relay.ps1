[CmdletBinding()]
param(
  [string]$PeerPort = "",
  [string]$LogPort = "COM5",
  [string]$MqttUrl = "mqtt://127.0.0.1:1883",
  [string]$Topic = "",
  [string]$DeviceId = "",
  [ValidateSet("suggested", "whole", "fixed")]
  [string]$ChunkStrategy = "whole",
  [int]$InterChunkDelayMs = 50,
  [int]$BaudRate = 115200,
  [int]$WaitForPeerPortSeconds = 0,
  [int]$TimeoutSeconds = 0,
  [string]$OutFile = ".tmp/hardware-stable-version-xl01-peer-relay-live.json",
  [switch]$RunInBackground,
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Normalize-PortName {
  param([string]$Value)
  return ([string]$Value).Trim().ToUpperInvariant()
}

function Redact-CommandArgs {
  param([object[]]$CommandArgs)

  if (-not $CommandArgs) {
    return $null
  }

  $redacted = @()
  for ($i = 0; $i -lt $CommandArgs.Count; $i++) {
    $item = $CommandArgs[$i]
    $redacted += $item
    if ([string]$item -eq "--password" -and $i + 1 -lt $CommandArgs.Count) {
      $redacted += "<redacted>"
      $i++
    }
  }
  return $redacted
}

if (-not $PeerPort) {
  throw "PeerPort is required. It must be the peer XL01 USB-UART port, not the board log port."
}

$resolvedPeerPort = $PeerPort.Trim()
$resolvedLogPort = if ($LogPort) { $LogPort.Trim() } else { "COM5" }
if ((Normalize-PortName $resolvedPeerPort) -eq (Normalize-PortName $resolvedLogPort)) {
  throw "PeerPort must not equal LogPort. $resolvedLogPort is for board logs only."
}

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$relayScript = Join-Path $repoRoot "scripts/dev/start-hardware-stable-version-mqtt-uart-relay.ps1"

$relayArgs = @(
  "-NoProfile",
  "-ExecutionPolicy", "Bypass",
  "-File", $relayScript,
  "-MqttUrl", $MqttUrl,
  "-Sink", "uart-com",
  "-Port", $resolvedPeerPort,
  "-BaudRate", $BaudRate,
  "-ChunkStrategy", $ChunkStrategy,
  "-InterChunkDelayMs", $InterChunkDelayMs,
  "-OutFile", $OutFile
)

if ($Topic) {
  $relayArgs += @("-Topic", $Topic)
}
if ($DeviceId) {
  $relayArgs += @("-DeviceId", $DeviceId)
}
if ($WaitForPeerPortSeconds -gt 0) {
  $relayArgs += @("-WaitForPortSeconds", $WaitForPeerPortSeconds)
}
if ($TimeoutSeconds -gt 0) {
  $relayArgs += @("-TimeoutSeconds", $TimeoutSeconds)
}
if ($RunInBackground) {
  $relayArgs += "-RunInBackground"
}
if ($DryRun) {
  $relayArgs += "-DryRun"
}

$plan = [ordered]@{
  generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  mode = if ($DryRun) { "dry-run" } elseif ($RunInBackground) { "background" } else { "live" }
  topology = [ordered]@{
    commandIngress = "MQTT broker -> relay -> $resolvedPeerPort @ $BaudRate"
    boardLogObservation = "$resolvedLogPort @ 115200"
    boardSideUart = "PB2/PB3 (EUART2_M1)"
    path = "MQTT cmd/{device_id} -> host relay -> peer XL01 -> air -> board XL01 -> PB2/PB3 -> RK2206"
    guardrail = "do not point the relay at the board log port"
  }
  relay = [ordered]@{
    mqttUrl = $MqttUrl
    topic = if ($Topic) { $Topic } else { $null }
    deviceId = if ($DeviceId) { $DeviceId } else { $null }
    peerPort = $resolvedPeerPort
    chunkStrategy = $ChunkStrategy
    interChunkDelayMs = $InterChunkDelayMs
    outFile = $OutFile
  }
  command = @("powershell") + $relayArgs
}

$raw = & powershell @relayArgs | Out-String
if ($LASTEXITCODE -ne 0) {
  throw "start-hardware-stable-version-mqtt-uart-relay.ps1 failed (exit=$LASTEXITCODE)"
}

$relayResult = $null
if ($raw.Trim()) {
  $relayResult = $raw | ConvertFrom-Json
}

if ($relayResult -and $relayResult.command) {
  $relayResult.command = @(Redact-CommandArgs -CommandArgs $relayResult.command)
}

$result = [ordered]@{}
foreach ($entry in $plan.GetEnumerator()) {
  $result[$entry.Key] = $entry.Value
}
$result.result = $relayResult

$result | ConvertTo-Json -Depth 8
