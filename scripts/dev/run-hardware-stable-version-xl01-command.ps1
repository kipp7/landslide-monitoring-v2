[CmdletBinding()]
param(
  [ValidateSet("set-interval-5", "set-interval-300", "set-interval-custom", "set-report-5", "set-report-300", "set-report-custom", "manual-collect", "mismatch")]
  [string]$Action,
  [string]$Port = "COM9",
  [int]$BaudRate = 115200,
  [int]$ReadAfterWriteSeconds = 12,
  [int]$IntervalSeconds = 0,
  [ValidateSet("whole", "suggested", "fixed")]
  [string]$ChunkStrategy = "whole",
  [int]$ChunkSize = 0,
  [int]$InterChunkDelayMs = 0,
  [int]$PostWriteDelayMs = 150
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function New-CommandId {
  return [System.Guid]::NewGuid().ToString()
}

function New-IssuedTs {
  return (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
}

function Write-JsonPayload {
  param(
    [hashtable]$Document,
    [string]$OutputPath
  )

  $json = $Document | ConvertTo-Json -Depth 6 -Compress
  Set-Content -Path $OutputPath -Value $json -Encoding UTF8
}

function New-SetIntervalPayload {
  param(
    [int]$Seconds,
    [string]$OutputPath
  )

  if ($Seconds -le 0) {
    throw "IntervalSeconds must be > 0"
  }

  $document = [ordered]@{
    schema_version = 1
    command_id = New-CommandId
    device_id = "00000000-0000-0000-0000-000000000001"
    command_type = "set_sampling_interval"
    payload = [ordered]@{
      source = "field-test"
      intervalSeconds = $Seconds
    }
    issued_ts = New-IssuedTs
  }

  Write-JsonPayload -Document $document -OutputPath $OutputPath
}

function New-SetReportPayload {
  param(
    [int]$Seconds,
    [string]$OutputPath
  )

  if ($Seconds -le 0) {
    throw "IntervalSeconds must be > 0"
  }

  $document = [ordered]@{
    schema_version = 1
    command_id = New-CommandId
    device_id = "00000000-0000-0000-0000-000000000001"
    command_type = "set_config"
    payload = [ordered]@{
      sampling_s = 5
      report_interval_s = $Seconds
    }
    issued_ts = New-IssuedTs
  }

  Write-JsonPayload -Document $document -OutputPath $OutputPath
}

function New-ManualCollectPayload {
  param(
    [string]$OutputPath,
    [string]$DeviceId = "00000000-0000-0000-0000-000000000001"
  )

  $document = [ordered]@{
    schema_version = 1
    command_id = New-CommandId
    device_id = $DeviceId
    command_type = "manual_collect"
    payload = [ordered]@{
      source = "field-test"
    }
    issued_ts = New-IssuedTs
  }

  Write-JsonPayload -Document $document -OutputPath $OutputPath
}

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$injectScript = Join-Path $repoRoot "scripts/dev/inject-hardware-stable-version-command.ps1"
$tmpDir = Join-Path $repoRoot ".tmp"
if (-not (Test-Path $tmpDir)) {
  New-Item -ItemType Directory -Path $tmpDir -Force | Out-Null
}

$injectArgs = @(
  "-NoProfile",
  "-ExecutionPolicy", "Bypass",
  "-File", $injectScript,
  "-Mode", "uart-com",
  "-Port", $Port,
  "-BaudRate", $BaudRate,
  "-ChunkStrategy", $ChunkStrategy,
  "-InterChunkDelayMs", $InterChunkDelayMs,
  "-PostWriteDelayMs", $PostWriteDelayMs,
  "-ReadAfterWriteSeconds", $ReadAfterWriteSeconds
)

if ($ChunkStrategy -eq "fixed" -and $ChunkSize -gt 0) {
  $injectArgs += @("-ChunkSize", $ChunkSize)
}

switch ($Action) {
  "manual-collect" {
    $payloadPath = Join-Path $tmpDir "manual-collect.json"
    New-ManualCollectPayload -OutputPath $payloadPath
    $injectArgs += @("-PayloadFile", $payloadPath, "-PayloadLabel", "manual_collect_runtime")
  }
  "mismatch" {
    $payloadPath = Join-Path $tmpDir "manual-collect-mismatch.json"
    New-ManualCollectPayload -OutputPath $payloadPath -DeviceId "99999999-9999-4999-8999-999999999999"
    $injectArgs += @("-PayloadFile", $payloadPath, "-PayloadLabel", "manual_collect_mismatch_runtime")
  }
  "set-interval-5" {
    $payloadPath = Join-Path $tmpDir "set-sampling-5.json"
    New-SetIntervalPayload -Seconds 5 -OutputPath $payloadPath
    $injectArgs += @("-PayloadFile", $payloadPath, "-PayloadLabel", "set_sampling_interval_5s")
  }
  "set-interval-300" {
    $payloadPath = Join-Path $tmpDir "set-sampling-300.json"
    New-SetIntervalPayload -Seconds 300 -OutputPath $payloadPath
    $injectArgs += @("-PayloadFile", $payloadPath, "-PayloadLabel", "set_sampling_interval_300s")
  }
  "set-interval-custom" {
    if ($IntervalSeconds -le 0) {
      throw "set-interval-custom requires -IntervalSeconds > 0"
    }
    $payloadPath = Join-Path $tmpDir ("set-sampling-{0}.json" -f $IntervalSeconds)
    New-SetIntervalPayload -Seconds $IntervalSeconds -OutputPath $payloadPath
    $injectArgs += @("-PayloadFile", $payloadPath, "-PayloadLabel", ("set_sampling_interval_{0}s" -f $IntervalSeconds))
  }
  "set-report-5" {
    $payloadPath = Join-Path $tmpDir "set-report-5.json"
    New-SetReportPayload -Seconds 5 -OutputPath $payloadPath
    $injectArgs += @("-PayloadFile", $payloadPath, "-PayloadLabel", "set_report_interval_5s")
  }
  "set-report-300" {
    $payloadPath = Join-Path $tmpDir "set-report-300.json"
    New-SetReportPayload -Seconds 300 -OutputPath $payloadPath
    $injectArgs += @("-PayloadFile", $payloadPath, "-PayloadLabel", "set_report_interval_300s")
  }
  "set-report-custom" {
    if ($IntervalSeconds -le 0) {
      throw "set-report-custom requires -IntervalSeconds > 0"
    }
    $payloadPath = Join-Path $tmpDir ("set-report-{0}.json" -f $IntervalSeconds)
    New-SetReportPayload -Seconds $IntervalSeconds -OutputPath $payloadPath
    $injectArgs += @("-PayloadFile", $payloadPath, "-PayloadLabel", ("set_report_interval_{0}s" -f $IntervalSeconds))
  }
  default {
    throw "Unsupported action: $Action"
  }
}

& powershell @injectArgs
if ($LASTEXITCODE -ne 0) {
  throw "inject-hardware-stable-version-command.ps1 failed (exit=$LASTEXITCODE)"
}
