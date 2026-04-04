[CmdletBinding()]
param(
  [string]$PeerPort = "",
  [string]$LogPort = "COM5",
  [string]$Sample = "",
  [string]$PayloadFile = "",
  [string]$PayloadLabel = "",
  [ValidateSet("suggested", "whole", "fixed")]
  [string]$ChunkStrategy = "whole",
  [int]$ChunkSize = 0,
  [int]$InterChunkDelayMs = 0,
  [int]$BaudRate = 115200,
  [string]$OutFile = "",
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Normalize-PortName {
  param([string]$Value)
  return ([string]$Value).Trim().ToUpperInvariant()
}

function Ensure-ValidPorts {
  param(
    [string]$PeerPortValue,
    [string]$LogPortValue
  )

  if (-not $PeerPortValue) {
    throw "PeerPort is required. It must be the USB-UART/peer-XL01 side port, not the board log port."
  }

  if ((Normalize-PortName $PeerPortValue) -eq (Normalize-PortName $LogPortValue)) {
    throw "PeerPort must not equal LogPort. $LogPortValue is reserved for board logs; inject commands through the peer XL01 port."
  }
}

function Build-InjectArgs {
  param(
    [string]$RepoRoot,
    [string]$ResolvedPeerPort
  )

  $args = @(
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", (Join-Path $RepoRoot "scripts/dev/inject-hardware-stable-version-command.ps1"),
    "-Mode", "uart-com",
    "-Port", $ResolvedPeerPort,
    "-BaudRate", $BaudRate,
    "-ChunkStrategy", $ChunkStrategy,
    "-InterChunkDelayMs", $InterChunkDelayMs
  )

  if ($PayloadFile) {
    $args += @("-PayloadFile", $PayloadFile)
    if ($PayloadLabel) {
      $args += @("-PayloadLabel", $PayloadLabel)
    }
  } elseif ($Sample) {
    $args += @("-Sample", $Sample)
  } else {
    throw "Either -Sample or -PayloadFile is required."
  }

  if ($ChunkStrategy -eq "fixed" -and $ChunkSize -gt 0) {
    $args += @("-ChunkSize", $ChunkSize)
  }

  if ($OutFile) {
    $args += @("-OutFile", $OutFile)
  }

  return $args
}

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$resolvedPeerPort = $PeerPort.Trim()
$resolvedLogPort = if ($LogPort) { $LogPort.Trim() } else { "COM5" }

Ensure-ValidPorts -PeerPortValue $resolvedPeerPort -LogPortValue $resolvedLogPort

$injectArgs = Build-InjectArgs -RepoRoot $repoRoot -ResolvedPeerPort $resolvedPeerPort

$plan = [ordered]@{
  generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  mode = if ($DryRun) { "dry-run" } else { "live" }
  topology = [ordered]@{
    commandEgress = "$resolvedPeerPort @ $BaudRate"
    boardLogObservation = "$resolvedLogPort @ 115200"
    boardSideUart = "PB2/PB3 (EUART2_M1)"
    path = "host USB-UART -> peer XL01 -> air -> board XL01 -> PB2/PB3 -> RK2206"
    guardrail = "do not inject commands into the board log port"
  }
  payload = [ordered]@{
    sample = if ($Sample) { $Sample } else { $null }
    payloadFile = if ($PayloadFile) { $PayloadFile } else { $null }
    payloadLabel = if ($PayloadLabel) { $PayloadLabel } else { $null }
    chunkStrategy = $ChunkStrategy
    chunkSize = if ($ChunkStrategy -eq "fixed" -and $ChunkSize -gt 0) { $ChunkSize } else { $null }
    interChunkDelayMs = $InterChunkDelayMs
  }
  command = @("powershell") + $injectArgs
}

if ($DryRun) {
  $plan | ConvertTo-Json -Depth 6
  return
}

$raw = & powershell @injectArgs | Out-String
if ($LASTEXITCODE -ne 0) {
  throw "inject-hardware-stable-version-command.ps1 failed (exit=$LASTEXITCODE)"
}

$execution = $null
if ($raw.Trim()) {
  $execution = $raw | ConvertFrom-Json
}

$result = [ordered]@{}
foreach ($entry in $plan.GetEnumerator()) {
  $result[$entry.Key] = $entry.Value
}
$result.mode = "live"
$result.execution = $execution

$result | ConvertTo-Json -Depth 8
