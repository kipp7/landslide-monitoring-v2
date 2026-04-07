[CmdletBinding()]
param(
  [string]$Port = "COM9",
  [int]$BaudRate = 115200,
  [string]$MqttUrl = "mqtt://127.0.0.1:1883",
  [string]$DeviceId = "00000000-0000-0000-0000-000000000001",
  [string]$Source = "next-step-runtime",
  [ValidateSet("suggested", "whole", "fixed")]
  [string]$ChunkStrategy = "whole",
  [int]$ChunkSize = 0,
  [int]$InterChunkDelayMs = 0,
  [int]$ReadAfterWriteSeconds = 20,
  [int]$TimeoutSeconds = 60,
  [int]$PublishDelaySeconds = 3,
  [string]$PayloadLabel = "manual_collect_runtime_live",
  [string]$PayloadFile = "",
  [string]$OutFile = ".tmp/hardware-stable-version-mqtt-uart-relay-live-manual-collect-latest.json"
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function New-Utf8NoBomEncoding {
  return New-Object System.Text.UTF8Encoding($false)
}

function Ensure-Directory {
  param([string]$Path)
  if ($Path -and -not (Test-Path $Path)) {
    New-Item -ItemType Directory -Path $Path -Force | Out-Null
  }
}

function Convert-MixedJsonText {
  param([string]$Raw)

  if (-not $Raw) {
    return $null
  }

  $trimmed = $Raw.Trim()
  if (-not $trimmed) {
    return $null
  }

  $lines = @($trimmed -split "`r?`n")
  $jsonStart = -1
  for ($i = $lines.Count - 1; $i -ge 0; $i--) {
    if ($lines[$i] -match '^\{') {
      $jsonStart = $i
      break
    }
  }

  $jsonText = if ($jsonStart -ge 0) {
    (($lines[$jsonStart..($lines.Count - 1)]) -join "`n").Trim()
  } else {
    $trimmed
  }

  return $jsonText | ConvertFrom-Json
}

function Get-AbsolutePath {
  param(
    [string]$RepoRoot,
    [string]$Path
  )

  if ([System.IO.Path]::IsPathRooted($Path)) {
    return $Path
  }

  return Join-Path $RepoRoot $Path
}

function Read-JsonFile {
  param([string]$Path)

  if (-not (Test-Path $Path)) {
    return $null
  }

  $raw = Get-Content -Raw -Encoding UTF8 $Path
  if (-not $raw.Trim()) {
    return $null
  }

  return $raw | ConvertFrom-Json
}

function Get-RepoRelativePath {
  param(
    [string]$BasePath,
    [string]$TargetPath
  )

  $baseFull = [System.IO.Path]::GetFullPath($BasePath)
  $targetFull = [System.IO.Path]::GetFullPath($TargetPath)

  try {
    $baseUri = New-Object System.Uri(($baseFull.TrimEnd('\') + '\'))
    $targetUri = New-Object System.Uri($targetFull)
    $relativeUri = $baseUri.MakeRelativeUri($targetUri)
    return [System.Uri]::UnescapeDataString($relativeUri.ToString()).Replace('/', '/')
  } catch {
    return $targetFull.Replace('\', '/')
  }
}

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$helperScript = Join-Path $repoRoot "scripts/dev/run-hardware-stable-version-mqtt-uart-relay-live.ps1"
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"

$resolvedPayloadFile = if ($PayloadFile) {
  Get-AbsolutePath -RepoRoot $repoRoot -Path $PayloadFile
} else {
  Join-Path $repoRoot (".tmp/manual-collect-runtime-{0}.json" -f $stamp)
}
$resolvedOutFile = Get-AbsolutePath -RepoRoot $repoRoot -Path $OutFile
$helperOutFile = Join-Path $repoRoot (".tmp/hardware-stable-version-mqtt-uart-relay-live-manual-collect-helper-{0}.json" -f $stamp)

Ensure-Directory -Path (Split-Path -Parent $resolvedPayloadFile)
Ensure-Directory -Path (Split-Path -Parent $resolvedOutFile)
Ensure-Directory -Path (Split-Path -Parent $helperOutFile)

$commandId = [guid]::NewGuid().ToString()
$issuedTs = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
$payloadDoc = [ordered]@{
  schema_version = 1
  command_id = $commandId
  device_id = $DeviceId
  command_type = "manual_collect"
  payload = [ordered]@{
    source = $Source
  }
  issued_ts = $issuedTs
}

$payloadJson = $payloadDoc | ConvertTo-Json -Depth 6 -Compress
[System.IO.File]::WriteAllText($resolvedPayloadFile, $payloadJson, (New-Utf8NoBomEncoding))

$helperParams = @{
  PayloadFile = $resolvedPayloadFile
  PayloadLabel = $PayloadLabel
  MqttUrl = $MqttUrl
  Port = $Port
  BaudRate = $BaudRate
  ChunkStrategy = $ChunkStrategy
  InterChunkDelayMs = $InterChunkDelayMs
  ReadAfterWriteSeconds = $ReadAfterWriteSeconds
  TimeoutSeconds = $TimeoutSeconds
  PublishDelaySeconds = $PublishDelaySeconds
  OutFile = $helperOutFile
}

if ($ChunkStrategy -eq "fixed" -and $ChunkSize -gt 0) {
  $helperParams["ChunkSize"] = $ChunkSize
}

$helperRaw = $null
$helperFailureText = $null
try {
  $helperRaw = (& $helperScript @helperParams 2>&1 | Out-String)
} catch {
  $helperFailureText = if ($helperRaw -and $helperRaw.Trim()) {
    $helperRaw.Trim()
  } elseif (Test-Path $helperOutFile) {
    Get-Content -Raw -Encoding UTF8 $helperOutFile
  } else {
    $_.ToString()
  }
}

$helperResult = Read-JsonFile -Path $helperOutFile
if (-not $helperResult) {
  $helperResult = Convert-MixedJsonText -Raw $helperRaw
}

if (-not $helperResult) {
  $detail = if ($helperFailureText) { $helperFailureText } else { $helperRaw }
  throw "run-hardware-stable-version-mqtt-uart-relay-live.ps1 failed.`n$detail"
}

$result = [ordered]@{
  generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  mode = "runtime-manual-collect-via-live-helper"
  port = $Port
  baudRate = $BaudRate
  mqttUrl = $MqttUrl
  deviceId = $DeviceId
  commandId = $commandId
  commandType = "manual_collect"
  source = $Source
  issuedTs = $issuedTs
  payloadLabel = $PayloadLabel
  payloadFile = Get-RepoRelativePath -BasePath $repoRoot -TargetPath $resolvedPayloadFile
  helperOutFile = Get-RepoRelativePath -BasePath $repoRoot -TargetPath $helperOutFile
  helperReportedFailureText = if ($helperFailureText) { $helperFailureText } else { $null }
  liveResult = $helperResult
}

$resultJson = $result | ConvertTo-Json -Depth 10
[System.IO.File]::WriteAllText($resolvedOutFile, $resultJson, (New-Utf8NoBomEncoding))
$resultJson
