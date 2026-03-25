[CmdletBinding()]
param(
  [ValidateSet("prepare", "mqtt", "http")]
  [string]$Mode = "prepare",
  [string]$Scope = "node-gateway",
  [string]$Stamp = "",
  [string]$Samples = "hf-normal,hf-duplicate,hf-out-of-order,hf-oversized,hf-replay,lf-meta",
  [string]$MqttUrl = "mqtt://127.0.0.1:1883",
  [string]$HttpUrl = "http://127.0.0.1:8091/iot/huawei/telemetry",
  [string]$Username = "",
  [string]$Password = "",
  [string]$Token = ""
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Push-Location $repoRoot
try {
  $args = @(
    "scripts/dev/run-field-rehearsal.js",
    "--mode", $Mode,
    "--scope", $Scope,
    "--samples", $Samples
  )

  if ($Stamp) { $args += @("--stamp", $Stamp) }
  if ($MqttUrl) { $args += @("--mqtt", $MqttUrl) }
  if ($HttpUrl) { $args += @("--http", $HttpUrl) }
  if ($Username) { $args += @("--username", $Username) }
  if ($Password) { $args += @("--password", $Password) }
  if ($Token) { $args += @("--token", $Token) }

  & node @args
  if ($LASTEXITCODE -ne 0) {
    throw "run-field-rehearsal failed (exit=$LASTEXITCODE)"
  }
} finally {
  Pop-Location
}
