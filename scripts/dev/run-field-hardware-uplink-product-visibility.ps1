[CmdletBinding()]
param(
  [string]$WebBaseUrl = "http://127.0.0.1:3000",
  [string]$ReplayReport = "docs/unified/reports/field-hardware-uplink-replay-latest.json",
  [string]$OutFile = "docs/unified/reports/field-hardware-uplink-product-visibility-latest.json",
  [string]$Username = "admin",
  [string]$Password = "123456",
  [string]$DeviceId = ""
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$tsFile = Join-Path $repoRoot "scripts/dev/run-field-hardware-uplink-product-visibility.ts"
$tsxCmd = Join-Path $repoRoot "node_modules/.bin/tsx.cmd"

if (-not (Test-Path $tsxCmd)) {
  throw "tsx not found at $tsxCmd. Run 'npm install' in repo root first."
}

$args = @(
  $tsFile,
  "--webBaseUrl", $WebBaseUrl,
  "--replayReport", $ReplayReport,
  "--outFile", $OutFile,
  "--username", $Username,
  "--password", $Password
)

if ($DeviceId) {
  $args += @("--deviceId", $DeviceId)
}

& $tsxCmd @args

if ($LASTEXITCODE -ne 0) {
  throw "run-field-hardware-uplink-product-visibility failed (exit=$LASTEXITCODE)"
}
