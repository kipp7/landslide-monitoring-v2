[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$Sample,
  [ValidateSet("mqtt", "http")]
  [string]$Mode = "mqtt",
  [string]$Network = "landslide-monitoring-v2_default",
  [string]$MqttUrl = "mqtt://lsmv2_emqx:1883",
  [string]$HttpUrl = "http://field-rehearsal-adapter:8091/iot/huawei/telemetry",
  [string]$Topic = "",
  [string]$Username = "",
  [string]$Password = "",
  [string]$Token = ""
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)

$args = @(
  "run", "--rm",
  "--network", $Network,
  "-v", "${repoRoot}:/workspace",
  "-w", "/workspace",
  "node:20-alpine",
  "node", "scripts/dev/publish-field-rehearsal-sample.js",
  "--sample", $Sample,
  "--mode", $Mode
)

if ($Mode -eq "mqtt") {
  $args += @("--mqtt", $MqttUrl)
  if ($Topic) { $args += @("--topic", $Topic) }
  if ($Username) { $args += @("--username", $Username) }
  if ($Password) { $args += @("--password", $Password) }
} else {
  $args += @("--http", $HttpUrl)
  if ($Token) { $args += @("--token", $Token) }
}

& docker @args
if ($LASTEXITCODE -ne 0) {
  throw "publish-field-rehearsal-sample-docker failed (exit=$LASTEXITCODE)"
}
