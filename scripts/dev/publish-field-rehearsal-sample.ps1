[CmdletBinding()]
param(
  [string]$Sample = "",
  [string]$PayloadFile = "",
  [ValidateSet("mqtt", "http")]
  [string]$Mode = "mqtt",
  [string]$MqttUrl = "mqtt://127.0.0.1:1883",
  [string]$Topic = "",
  [string]$Username = "",
  [string]$Password = "",
  [string]$HttpUrl = "http://127.0.0.1:8091/iot/huawei/telemetry",
  [string]$Token = ""
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Push-Location $repoRoot
try {
  if ([string]::IsNullOrWhiteSpace($Sample) -and [string]::IsNullOrWhiteSpace($PayloadFile)) {
    throw "Either -Sample or -PayloadFile is required"
  }

  $args = @("scripts/dev/publish-field-rehearsal-sample.js", "--mode", $Mode)
  if (-not [string]::IsNullOrWhiteSpace($Sample)) {
    $args += @("--sample", $Sample)
  }
  if (-not [string]::IsNullOrWhiteSpace($PayloadFile)) {
    $args += @("--payloadFile", $PayloadFile)
  }
  if ($Mode -eq "mqtt") {
    $args += @("--mqtt", $MqttUrl)
    if ($Topic) { $args += @("--topic", $Topic) }
    if ($Username) { $args += @("--username", $Username) }
    if ($Password) { $args += @("--password", $Password) }
  } else {
    $args += @("--http", $HttpUrl)
    if ($Token) { $args += @("--token", $Token) }
  }

  & node @args
  if ($LASTEXITCODE -ne 0) {
    throw "publish-field-rehearsal-sample failed (exit=$LASTEXITCODE)"
  }
} finally {
  Pop-Location
}
