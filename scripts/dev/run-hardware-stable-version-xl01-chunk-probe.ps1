[CmdletBinding()]
param(
  [ValidateSet("set-report-5", "set-report-300", "manual-collect", "mismatch")]
  [string]$Action = "manual-collect",
  [string]$Port = "COM9",
  [int]$BaudRate = 115200,
  [int]$ReadAfterWriteSeconds = 20,
  [object[]]$ChunkSizes = @(32, 48, 64, 80),
  [int]$InterChunkDelayMs = 30,
  [int]$PostWriteDelayMs = 150,
  [int]$PauseBetweenRunsMs = 1200,
  [switch]$IncludeWholeBaseline
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$commandScript = Join-Path $repoRoot "scripts/dev/run-hardware-stable-version-xl01-command.ps1"
$outDir = Join-Path $repoRoot ".tmp/xl01-chunk-probe"
if (-not (Test-Path $outDir)) {
  New-Item -ItemType Directory -Path $outDir -Force | Out-Null
}

function Resolve-ChunkSizes {
  param(
    [object[]]$RawValues
  )

  $resolved = New-Object System.Collections.Generic.List[int]
  foreach ($rawValue in $RawValues) {
    if ($null -eq $rawValue) {
      continue
    }

    foreach ($segment in ([string]$rawValue -split ",")) {
      $text = $segment.Trim()
      if (-not $text) {
        continue
      }

      $parsed = 0
      if (-not [int]::TryParse($text, [ref]$parsed)) {
        throw "Invalid chunk size: $text"
      }

      if ($parsed -gt 0) {
        [void]$resolved.Add($parsed)
      }
    }
  }

  return $resolved.ToArray()
}

function Invoke-ProbeRun {
  param(
    [string]$RunLabel,
    [string]$RunChunkStrategy,
    [int]$RunChunkSize
  )

  $args = @(
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", $commandScript,
    "-Action", $Action,
    "-Port", $Port,
    "-BaudRate", $BaudRate,
    "-ReadAfterWriteSeconds", $ReadAfterWriteSeconds,
    "-ChunkStrategy", $RunChunkStrategy,
    "-InterChunkDelayMs", $InterChunkDelayMs,
    "-PostWriteDelayMs", $PostWriteDelayMs
  )

  if ($RunChunkStrategy -eq "fixed" -and $RunChunkSize -gt 0) {
    $args += @("-ChunkSize", $RunChunkSize)
  }

  Write-Host ""
  Write-Host ("[{0}] action={1} strategy={2} chunkSize={3} delayMs={4}" -f $RunLabel, $Action, $RunChunkStrategy, $RunChunkSize, $InterChunkDelayMs)

  $raw = & powershell @args | Out-String
  if ($LASTEXITCODE -ne 0) {
    throw "Probe run '$RunLabel' failed (exit=$LASTEXITCODE)"
  }

  $parsed = $raw | ConvertFrom-Json
  $summary = [ordered]@{
    label = $RunLabel
    action = $Action
    generatedAt = $parsed.generatedAt
    port = $parsed.port
    chunkStrategy = $parsed.chunkStrategy
    chunkSize = $parsed.chunkSize
    chunkCount = $parsed.chunkCount
    payloadBytes = $parsed.payloadBytes
    interChunkDelayMs = $parsed.interChunkDelayMs
    postWriteDelayMs = $parsed.postWriteDelayMs
    captureBytes = if ($parsed.capture) { $parsed.capture.bytes } else { $null }
    captureLineCount = if ($parsed.capture) { $parsed.capture.lineCount } else { $null }
    commandType = $parsed.commandType
    commandId = $parsed.commandId
  }

  Write-Host ($summary | ConvertTo-Json -Depth 5)

  return [ordered]@{
    summary = $summary
    execution = $parsed
  }
}

$resolvedChunkSizes = Resolve-ChunkSizes -RawValues $ChunkSizes
$runs = @()
if ($IncludeWholeBaseline) {
  $runs += [ordered]@{
    label = "whole-baseline"
    strategy = "whole"
    chunkSize = 0
  }
}

foreach ($chunkSize in $resolvedChunkSizes) {
  if ($chunkSize -le 0) {
    continue
  }

  $runs += [ordered]@{
    label = ("fixed-{0}" -f $chunkSize)
    strategy = "fixed"
    chunkSize = $chunkSize
  }
}

if ($runs.Count -eq 0) {
  throw "No valid runs configured. Provide -IncludeWholeBaseline or at least one positive -ChunkSizes entry."
}

$results = @()
for ($i = 0; $i -lt $runs.Count; $i++) {
  $run = $runs[$i]
  $results += Invoke-ProbeRun -RunLabel $run.label -RunChunkStrategy $run.strategy -RunChunkSize $run.chunkSize

  if ($PauseBetweenRunsMs -gt 0 -and $i -lt ($runs.Count - 1)) {
    Start-Sleep -Milliseconds $PauseBetweenRunsMs
  }
}

$final = [ordered]@{
  generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  action = $Action
  port = $Port
  baudRate = $BaudRate
  readAfterWriteSeconds = $ReadAfterWriteSeconds
  interChunkDelayMs = $InterChunkDelayMs
  postWriteDelayMs = $PostWriteDelayMs
  pauseBetweenRunsMs = $PauseBetweenRunsMs
  results = $results
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$outFile = Join-Path $outDir ("{0}-{1}.json" -f $Action, $timestamp)
$finalJson = $final | ConvertTo-Json -Depth 8
Set-Content -Path $outFile -Value $finalJson -Encoding UTF8

Write-Host ""
Write-Host ("Chunk probe saved to: {0}" -f $outFile)
$finalJson
