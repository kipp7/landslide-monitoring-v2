[CmdletBinding()]
param(
  [ValidateSet("manual-collect", "set-report-300", "set-report-5", "mismatch")]
  [string]$Action,
  [string]$Port,
  [string]$RemoteAddress = "0003",
  [int]$BaudRate = 115200,
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function New-CommandId {
  return [System.Guid]::NewGuid().ToString()
}

function New-IssuedTs {
  return (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
}

function New-PayloadDocument {
  param(
    [string]$Kind
  )

  switch ($Kind) {
    "manual-collect" {
      return [ordered]@{
        schema_version = 1
        command_id = New-CommandId
        device_id = "00000000-0000-0000-0000-000000000001"
        command_type = "manual_collect"
        payload = [ordered]@{
          source = "field-test-cmd-uplink"
        }
        issued_ts = New-IssuedTs
      }
    }
    "mismatch" {
      return [ordered]@{
        schema_version = 1
        command_id = New-CommandId
        device_id = "99999999-9999-4999-8999-999999999999"
        command_type = "manual_collect"
        payload = [ordered]@{
          source = "field-test-cmd-uplink"
        }
        issued_ts = New-IssuedTs
      }
    }
    "set-report-300" {
      return [ordered]@{
        schema_version = 1
        command_id = New-CommandId
        device_id = "00000000-0000-0000-0000-000000000001"
        command_type = "set_config"
        payload = [ordered]@{
          sampling_s = 5
          report_interval_s = 300
        }
        issued_ts = New-IssuedTs
      }
    }
    "set-report-5" {
      return [ordered]@{
        schema_version = 1
        command_id = New-CommandId
        device_id = "00000000-0000-0000-0000-000000000001"
        command_type = "set_config"
        payload = [ordered]@{
          sampling_s = 5
          report_interval_s = 5
        }
        issued_ts = New-IssuedTs
      }
    }
    default {
      throw "Unsupported action: $Kind"
    }
  }
}

if (-not $Port) {
  throw "-Port is required and must be the center-node XL01 CMD port"
}

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$tmpDir = Join-Path $repoRoot ".tmp"
if (-not (Test-Path $tmpDir)) {
  New-Item -ItemType Directory -Path $tmpDir -Force | Out-Null
}

$payloadPath = Join-Path $tmpDir ("dl-xlxx-{0}.json" -f $Action)
$document = New-PayloadDocument -Kind $Action
$document | ConvertTo-Json -Depth 6 | Set-Content -Path $payloadPath -Encoding UTF8

$cmdScript = Join-Path $repoRoot "scripts/dev/send-dl-xlxx-cmd-usr-payload.ps1"
$args = @(
  "-NoProfile",
  "-ExecutionPolicy", "Bypass",
  "-File", $cmdScript,
  "-Port", $Port,
  "-BaudRate", $BaudRate,
  "-RemoteAddress", $RemoteAddress,
  "-PayloadFile", $payloadPath
)

if ($DryRun) {
  $args += "-DryRun"
}

& powershell @args
if ($LASTEXITCODE -ne 0) {
  throw "send-dl-xlxx-cmd-usr-payload.ps1 failed (exit=$LASTEXITCODE)"
}
