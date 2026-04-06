[CmdletBinding()]
param(
  [int]$ReportIntervalSeconds,
  [int]$SamplingSeconds = 5,
  [string]$Port = "COM5",
  [int]$BaudRate = 115200,
  [string]$MqttUrl = "mqtt://127.0.0.1:1883",
  [string]$DeviceId = "00000000-0000-0000-0000-000000000001",
  [ValidateSet("suggested", "whole", "fixed")]
  [string]$ChunkStrategy = "whole",
  [int]$ChunkSize = 0,
  [int]$InterChunkDelayMs = 0,
  [int]$ReadAfterWriteSeconds = 20,
  [int]$TimeoutSeconds = 60,
  [int]$PublishDelaySeconds = 3,
  [string]$PayloadLabel = "",
  [string]$PayloadFile = "",
  [string]$OutFile = ""
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function New-Utf8NoBomEncoding {
  return New-Object System.Text.UTF8Encoding($false)
}

function Ensure-Directory {
  param([string]$Path)
  if ($Path -and -not (Test-Path $Path)) {
    New-Item -ItemType Directory -Path $Path -Force | Out-Null
  }
}

function Convert-MixedJsonText {
  param([string]$Raw)

  if (-not $Raw) {
    return $null
  }

  $trimmed = $Raw.Trim()
  if (-not $trimmed) {
    return $null
  }

  $lines = @($trimmed -split "`r?`n")
  $jsonStart = -1
  for ($i = $lines.Count - 1; $i -ge 0; $i--) {
    if ($lines[$i] -match '^\{') {
      $jsonStart = $i
      break
    }
  }

  $jsonText = if ($jsonStart -ge 0) {
    (($lines[$jsonStart..($lines.Count - 1)]) -join "`n").Trim()
  } else {
    $trimmed
  }

  try {
    return $jsonText | ConvertFrom-Json
  } catch {
    return $null
  }
}

function Get-AbsolutePath {
  param(
    [string]$RepoRoot,
    [string]$Path
  )

  if ([System.IO.Path]::IsPathRooted($Path)) {
    return $Path
  }

  return Join-Path $RepoRoot $Path
}

function Read-JsonFile {
  param([string]$Path)

  if (-not (Test-Path $Path)) {
    return $null
  }

  $raw = Get-Content -Raw -Encoding UTF8 $Path
  if (-not $raw.Trim()) {
    return $null
  }

  return $raw | ConvertFrom-Json
}

function Read-TextIfExists {
  param([string]$Path)

  if (-not (Test-Path $Path)) {
    return ""
  }

  return [string](Get-Content -Raw -Encoding UTF8 $Path)
}

function Get-RepoRelativePath {
  param(
    [string]$BasePath,
    [string]$TargetPath
  )

  $baseFull = [System.IO.Path]::GetFullPath($BasePath)
  $targetFull = [System.IO.Path]::GetFullPath($TargetPath)

  try {
    $baseUri = New-Object System.Uri(($baseFull.TrimEnd('\') + '\'))
    $targetUri = New-Object System.Uri($targetFull)
    $relativeUri = $baseUri.MakeRelativeUri($targetUri)
    return [System.Uri]::UnescapeDataString($relativeUri.ToString()).Replace('/', '/')
  } catch {
    return $targetFull.Replace('\', '/')
  }
}

if ($ReportIntervalSeconds -le 0) {
  throw "ReportIntervalSeconds must be > 0"
}

if ($SamplingSeconds -le 0) {
  throw "SamplingSeconds must be > 0"
}

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$helperScript = Join-Path $repoRoot "scripts/dev/run-hardware-stable-version-mqtt-uart-relay-live.ps1"
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$defaultLabel = "set_report_interval_{0}s_runtime_live" -f $ReportIntervalSeconds
$defaultOutFile = ".tmp/hardware-stable-version-mqtt-uart-relay-live-set-report-{0}-latest.json" -f $ReportIntervalSeconds

if ($PayloadFile) {
  $resolvedPayloadFile = Get-AbsolutePath -RepoRoot $repoRoot -Path $PayloadFile
} else {
  $resolvedPayloadFile = Join-Path $repoRoot (".tmp/set-report-runtime-{0}-{1}.json" -f $ReportIntervalSeconds, $stamp)
}

if ($OutFile) {
  $resolvedOutPathInput = $OutFile
} else {
  $resolvedOutPathInput = $defaultOutFile
}
$resolvedOutFile = Get-AbsolutePath -RepoRoot $repoRoot -Path $resolvedOutPathInput

$helperOutFile = Join-Path $repoRoot (".tmp/hardware-stable-version-mqtt-uart-relay-live-set-report-{0}-helper-{1}.json" -f $ReportIntervalSeconds, $stamp)
$helperStdoutFile = Join-Path $repoRoot (".tmp/hardware-stable-version-mqtt-uart-relay-live-set-report-{0}-helper-{1}.stdout.log" -f $ReportIntervalSeconds, $stamp)
$helperStderrFile = Join-Path $repoRoot (".tmp/hardware-stable-version-mqtt-uart-relay-live-set-report-{0}-helper-{1}.stderr.log" -f $ReportIntervalSeconds, $stamp)
$helperRunnerFile = Join-Path $repoRoot (".tmp/hardware-stable-version-mqtt-uart-relay-live-set-report-{0}-helper-{1}.runner.ps1" -f $ReportIntervalSeconds, $stamp)

if ($PayloadLabel) {
  $resolvedPayloadLabel = $PayloadLabel
} else {
  $resolvedPayloadLabel = $defaultLabel
}

Ensure-Directory -Path (Split-Path -Parent $resolvedPayloadFile)
Ensure-Directory -Path (Split-Path -Parent $resolvedOutFile)
Ensure-Directory -Path (Split-Path -Parent $helperOutFile)
Ensure-Directory -Path (Split-Path -Parent $helperStdoutFile)
Ensure-Directory -Path (Split-Path -Parent $helperStderrFile)
Ensure-Directory -Path (Split-Path -Parent $helperRunnerFile)

$commandId = [guid]::NewGuid().ToString()
$issuedTs = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
$payloadDoc = [ordered]@{
  schema_version = 1
  command_id = $commandId
  device_id = $DeviceId
  command_type = "set_config"
  payload = [ordered]@{
    sampling_s = $SamplingSeconds
    report_interval_s = $ReportIntervalSeconds
  }
  issued_ts = $issuedTs
}

$payloadJson = $payloadDoc | ConvertTo-Json -Depth 6 -Compress
[System.IO.File]::WriteAllText($resolvedPayloadFile, $payloadJson, (New-Utf8NoBomEncoding))
Write-Host ("[LIVE] payload ready commandId={0} reportInterval={1}s" -f $commandId, $ReportIntervalSeconds)

$runnerLines = New-Object System.Collections.Generic.List[string]
$runnerLines.Add('$ErrorActionPreference = ''Stop''')
$runnerLines.Add('[Console]::OutputEncoding = [System.Text.Encoding]::UTF8')
$runnerLines.Add(("Set-Location '{0}'" -f $repoRoot.Replace("'", "''")))
$runnerLines.Add('$params = @{}')
$runnerLines.Add(('$params[''PayloadFile''] = ''{0}''' -f $resolvedPayloadFile.Replace("'", "''")))
$runnerLines.Add(('$params[''PayloadLabel''] = ''{0}''' -f $resolvedPayloadLabel.Replace("'", "''")))
$runnerLines.Add(('$params[''MqttUrl''] = ''{0}''' -f $MqttUrl.Replace("'", "''")))
$runnerLines.Add(('$params[''Port''] = ''{0}''' -f $Port.Replace("'", "''")))
$runnerLines.Add(('$params[''BaudRate''] = {0}' -f $BaudRate))
$runnerLines.Add(('$params[''ChunkStrategy''] = ''{0}''' -f $ChunkStrategy.Replace("'", "''")))
$runnerLines.Add(('$params[''InterChunkDelayMs''] = {0}' -f $InterChunkDelayMs))
$runnerLines.Add(('$params[''ReadAfterWriteSeconds''] = {0}' -f $ReadAfterWriteSeconds))
$runnerLines.Add(('$params[''TimeoutSeconds''] = {0}' -f $TimeoutSeconds))
$runnerLines.Add(('$params[''PublishDelaySeconds''] = {0}' -f $PublishDelaySeconds))
$runnerLines.Add(('$params[''OutFile''] = ''{0}''' -f $helperOutFile.Replace("'", "''")))
if ($ChunkStrategy -eq "fixed" -and $ChunkSize -gt 0) {
  $runnerLines.Add(('$params[''ChunkSize''] = {0}' -f $ChunkSize))
}
$runnerLines.Add(("& '{0}' @params" -f $helperScript.Replace("'", "''")))
$runnerContent = ($runnerLines -join "`r`n") + "`r`n"
[System.IO.File]::WriteAllText($helperRunnerFile, $runnerContent, (New-Utf8NoBomEncoding))
$helperEncoded = [Convert]::ToBase64String([System.Text.Encoding]::Unicode.GetBytes($runnerContent))

$overallTimeoutSeconds = $PublishDelaySeconds + $TimeoutSeconds + $ReadAfterWriteSeconds + 45
if ($overallTimeoutSeconds -lt 90) {
  $overallTimeoutSeconds = 90
}

$helperProcess = Start-Process -FilePath "powershell.exe" `
  -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-EncodedCommand", $helperEncoded) `
  -WorkingDirectory $repoRoot `
  -RedirectStandardOutput $helperStdoutFile `
  -RedirectStandardError $helperStderrFile `
  -PassThru

Write-Host ("[LIVE] helper started pid={0} overallTimeout={1}s" -f $helperProcess.Id, $overallTimeoutSeconds)

$helperTimedOut = $false
$startedAt = Get-Date
$lastHeartbeat = $startedAt
$deadline = $startedAt.AddSeconds($overallTimeoutSeconds)

while (-not $helperProcess.HasExited) {
  if ((Get-Date) -ge $deadline) {
    $helperTimedOut = $true
    try {
      $helperProcess.Kill()
    } catch {
    }
    break
  }

  if (((Get-Date) - $lastHeartbeat).TotalSeconds -ge 5) {
    $elapsed = [int]((Get-Date) - $startedAt).TotalSeconds
    Write-Host ("[LIVE] waiting elapsed={0}s payload={1}" -f $elapsed, (Get-RepoRelativePath -BasePath $repoRoot -TargetPath $resolvedPayloadFile))
    $lastHeartbeat = Get-Date
  }

  Start-Sleep -Seconds 1
}

$helperRaw = Read-TextIfExists -Path $helperStdoutFile
$helperFailureText = Read-TextIfExists -Path $helperStderrFile

if (-not $helperProcess.HasExited) {
  $helperTimedOut = $true
} elseif ($helperProcess.ExitCode -ne 0 -and -not $helperFailureText) {
  $helperFailureText = "helper exit code: $($helperProcess.ExitCode)"
}

$helperResult = Read-JsonFile -Path $helperOutFile
if (-not $helperResult) {
  $helperResult = Convert-MixedJsonText -Raw $helperRaw
}

if (-not $helperResult) {
  if ($helperTimedOut) {
    $detail = "helper timed out after ${overallTimeoutSeconds}s"
  } elseif ($helperFailureText) {
    $detail = $helperFailureText
  } else {
    $detail = $helperRaw
  }
  throw "run-hardware-stable-version-mqtt-uart-relay-live.ps1 failed.`n$detail"
}

if ($helperFailureText) {
  $resolvedHelperFailureText = $helperFailureText
} else {
  $resolvedHelperFailureText = $null
}

$result = [ordered]@{
  generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  mode = "runtime-set-report-via-live-helper"
  port = $Port
  baudRate = $BaudRate
  mqttUrl = $MqttUrl
  deviceId = $DeviceId
  commandId = $commandId
  commandType = "set_config"
  samplingSeconds = $SamplingSeconds
  reportIntervalSeconds = $ReportIntervalSeconds
  issuedTs = $issuedTs
  payloadLabel = $resolvedPayloadLabel
  payloadFile = Get-RepoRelativePath -BasePath $repoRoot -TargetPath $resolvedPayloadFile
  helperOutFile = Get-RepoRelativePath -BasePath $repoRoot -TargetPath $helperOutFile
  helperRunnerFile = Get-RepoRelativePath -BasePath $repoRoot -TargetPath $helperRunnerFile
  helperStdoutFile = Get-RepoRelativePath -BasePath $repoRoot -TargetPath $helperStdoutFile
  helperStderrFile = Get-RepoRelativePath -BasePath $repoRoot -TargetPath $helperStderrFile
  helperTimedOut = $helperTimedOut
  helperReportedFailureText = $resolvedHelperFailureText
  liveResult = $helperResult
}

$resultJson = $result | ConvertTo-Json -Depth 10
[System.IO.File]::WriteAllText($resolvedOutFile, $resultJson, (New-Utf8NoBomEncoding))
$resultJson
