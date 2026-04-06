param(
  [string]$MetaFile = ".tmp/hardware-stable-version-mqtt-uart-relay-latest.json"
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$fullMetaFile = Join-Path $repoRoot $MetaFile

if (-not (Test-Path $fullMetaFile)) {
  throw "Relay metadata file not found: $MetaFile"
}

$meta = Get-Content -Raw -Encoding UTF8 $fullMetaFile | ConvertFrom-Json
$processIdToStop = [int]$meta.processId

$stopped = $false
$reason = $null
try {
  $proc = Get-Process -Id $processIdToStop -ErrorAction Stop
  Stop-Process -Id $processIdToStop -Force
  $stopped = $true
} catch {
  $reason = $_.Exception.Message
}

[ordered]@{
  generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  processId = $processIdToStop
  stopped = $stopped
  reason = $reason
  topic = $meta.topic
  sink = $meta.sink
  stdout = $meta.stdout
  stderr = $meta.stderr
  outFile = $meta.outFile
} | ConvertTo-Json -Depth 5
