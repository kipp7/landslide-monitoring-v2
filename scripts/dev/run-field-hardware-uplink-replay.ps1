[CmdletBinding()]
param(
  [string]$ApiBaseUrl = "http://127.0.0.1:8080",
  [string]$MqttUrl = "mqtt://127.0.0.1:1883",
  [string]$Username = "admin",
  [string]$Password = "123456",
  [string]$PayloadFile = "docs/tools/field-rehearsal/payload-samples/hf-hardware-real-20260406-seq21.json",
  [string]$OutFile = "docs/unified/reports/field-hardware-uplink-replay-latest.json",
  [int]$TimeoutMs = 30000,
  [int]$PollMs = 2000
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Push-Location $repoRoot
try {
  $args = @(
    "scripts/dev/run-field-hardware-uplink-replay.js",
    "--apiBaseUrl", $ApiBaseUrl,
    "--mqttUrl", $MqttUrl,
    "--username", $Username,
    "--password", $Password,
    "--payloadFile", $PayloadFile,
    "--outFile", $OutFile,
    "--timeoutMs", $TimeoutMs,
    "--pollMs", $PollMs
  )

  & node @args
  if ($LASTEXITCODE -ne 0) {
    throw "run-field-hardware-uplink-replay failed (exit=$LASTEXITCODE)"
  }
} finally {
  Pop-Location
}
