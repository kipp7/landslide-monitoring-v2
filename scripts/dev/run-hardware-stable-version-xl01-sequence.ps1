[CmdletBinding()]
param(
  [string]$Port = "COM9",
  [int]$BaudRate = 115200,
  [int]$ReadAfterWriteSeconds = 12,
  [ValidateSet("whole", "suggested", "fixed")]
  [string]$ChunkStrategy = "whole",
  [int]$ChunkSize = 0,
  [int]$InterChunkDelayMs = 0,
  [int]$PostWriteDelayMs = 150,
  [switch]$NoPause
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Wait-Step {
  param(
    [string]$Message
  )

  if ($NoPause) {
    return
  }

  Write-Host ""
  Read-Host $Message | Out-Null
}

function Invoke-ActionStep {
  param(
    [string]$RepoRoot,
    [string]$Action,
    [string]$Title,
    [string]$ObserveHint
  )

  $commandScript = Join-Path $RepoRoot "scripts/dev/run-hardware-stable-version-xl01-command.ps1"
  $args = @(
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", $commandScript,
    "-Action", $Action,
    "-Port", $Port,
    "-BaudRate", $BaudRate,
    "-ReadAfterWriteSeconds", $ReadAfterWriteSeconds,
    "-ChunkStrategy", $ChunkStrategy,
    "-InterChunkDelayMs", $InterChunkDelayMs,
    "-PostWriteDelayMs", $PostWriteDelayMs
  )

  if ($ChunkStrategy -eq "fixed" -and $ChunkSize -gt 0) {
    $args += @("-ChunkSize", $ChunkSize)
  }

  Write-Host ""
  Write-Host ("[{0}] {1}" -f $Action, $Title)
  $raw = & powershell @args | Out-String
  if ($LASTEXITCODE -ne 0) {
    throw "Step '$Action' failed (exit=$LASTEXITCODE)"
  }

  $rawTrimmed = $raw.Trim()
  if (-not $rawTrimmed) {
    throw "Step '$Action' returned empty output"
  }

  $parsed = $rawTrimmed | ConvertFrom-Json
  $summary = [ordered]@{
    action = $Action
    generatedAt = $parsed.generatedAt
    port = $parsed.port
    commandType = $parsed.commandType
    commandId = $parsed.commandId
    deviceId = $parsed.deviceId
    payloadBytes = $parsed.payloadBytes
    captureBytes = if ($parsed.capture) { $parsed.capture.bytes } else { $null }
    captureLineCount = if ($parsed.capture) { $parsed.capture.lineCount } else { $null }
  }

  $summaryJson = $summary | ConvertTo-Json -Depth 4
  Write-Host $summaryJson

  Wait-Step -Message $ObserveHint

  return [ordered]@{
    action = $Action
    title = $Title
    observeHint = $ObserveHint
    execution = $parsed
  }
}

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$outDir = Join-Path $repoRoot ".tmp/hardware-stable-version-xl01-sequence"
if (-not (Test-Path $outDir)) {
  New-Item -ItemType Directory -Path $outDir -Force | Out-Null
}

$results = @()

$results += Invoke-ActionStep `
  -RepoRoot $repoRoot `
  -Action "set-report-5" `
  -Title "Restore 5s report interval and confirm fast uplink is back" `
  -ObserveHint "After you confirm fast uplink has resumed, press Enter"

$results += Invoke-ActionStep `
  -RepoRoot $repoRoot `
  -Action "set-report-300" `
  -Title "Set report interval to 300s and verify downlink takes effect" `
  -ObserveHint "After you confirm uplink slowed or paused, press Enter"

$results += Invoke-ActionStep `
  -RepoRoot $repoRoot `
  -Action "manual-collect" `
  -Title "Send manual_collect and watch for an immediate upload" `
  -ObserveHint "After you observe the manual_collect behavior, press Enter"

$results += Invoke-ActionStep `
  -RepoRoot $repoRoot `
  -Action "mismatch" `
  -Title "Send mismatch sample and confirm wrong device_id is ignored" `
  -ObserveHint "After you confirm mismatch caused no action, press Enter"

$results += Invoke-ActionStep `
  -RepoRoot $repoRoot `
  -Action "set-report-5" `
  -Title "Restore 5s report interval for normal operation" `
  -ObserveHint "All steps finished. Press Enter to exit"

$final = [ordered]@{
  generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  port = $Port
  baudRate = $BaudRate
  readAfterWriteSeconds = $ReadAfterWriteSeconds
  chunkStrategy = $ChunkStrategy
  chunkSize = if ($ChunkStrategy -eq "fixed" -and $ChunkSize -gt 0) { $ChunkSize } else { $null }
  interChunkDelayMs = $InterChunkDelayMs
  postWriteDelayMs = $PostWriteDelayMs
  noPause = [bool]$NoPause
  steps = $results
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$outFile = Join-Path $outDir ("xl01-sequence-{0}.json" -f $timestamp)
$finalJson = $final | ConvertTo-Json -Depth 8
Set-Content -Path $outFile -Value $finalJson -Encoding UTF8

Write-Host ""
Write-Host ("Sequence result saved to: {0}" -f $outFile)
$finalJson
