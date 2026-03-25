[CmdletBinding()]
param(
  [string]$BaseUrl = "http://127.0.0.1:8081",
  [string]$Bearer = "dev",
  [string]$DeviceId = ""
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Push-Location $repoRoot
try {
  $args = @(
    "scripts/dev/check-field-platform-acceptance.js",
    "--baseUrl", $BaseUrl,
    "--bearer", $Bearer
  )
  if ($DeviceId) {
    $args += @("--deviceId", $DeviceId)
  }

  & node @args
  if ($LASTEXITCODE -ne 0) {
    throw "field platform acceptance check failed (exit=$LASTEXITCODE)"
  }
} finally {
  Pop-Location
}
