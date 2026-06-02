[CmdletBinding()]
param(
  [string]$DeviceId = "00000000-0000-0000-0000-000000000003",
  [string]$BoardHost = "192.168.124.179",
  [string]$User = "linaro",
  [string]$Password = "",
  [int]$SshPort = 22,
  [string]$SerialDevice = "/dev/ttyS3",
  [int]$BaudRate = 115200,
  [int]$CaptureSeconds = 20,
  [string]$ServiceName = "lsmv2-field-gateway.service",
  [string]$OutFile = "docs/unified/reports/field-rk3568-node-c-raw-serial-split-latest.json"
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function To-RepoRelativePath {
  param(
    [string]$RootPath,
    [string]$TargetPath
  )

  $rootFull = [System.IO.Path]::GetFullPath($RootPath)
  $targetFull = [System.IO.Path]::GetFullPath($TargetPath)
  if ($targetFull.StartsWith($rootFull, [System.StringComparison]::OrdinalIgnoreCase)) {
    $trimmed = $targetFull.Substring($rootFull.Length).TrimStart('\', '/')
    return $trimmed.Replace("\", "/")
  }
  return $targetFull.Replace("\", "/")
}

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$tmpDir = Join-Path $repoRoot ".tmp"
if (-not (Test-Path $tmpDir)) {
  New-Item -ItemType Directory -Path $tmpDir | Out-Null
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss-fff"
$rawScript = Join-Path $repoRoot "scripts/dev/run-rk3568-raw-serial-command-capture.ps1"
$manualOut = Join-Path $tmpDir ("rk3568-raw-upstream-boundary-manual-{0}.json" -f $stamp)
$set5Out = Join-Path $tmpDir ("rk3568-raw-upstream-boundary-set5-{0}.json" -f $stamp)

$commonArgs = @(
  "-NoProfile"
  "-ExecutionPolicy"
  "Bypass"
  "-File"
  $rawScript
  "-DeviceId"
  $DeviceId
  "-BoardHost"
  $BoardHost
  "-User"
  $User
  "-Password"
  $Password
  "-SshPort"
  ([string]$SshPort)
  "-SerialDevice"
  $SerialDevice
  "-BaudRate"
  ([string]$BaudRate)
  "-CaptureSeconds"
  ([string]$CaptureSeconds)
  "-ServiceName"
  $ServiceName
)

& powershell.exe @commonArgs -Action "manual-collect" -OutFile $manualOut | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw "run-rk3568-raw-serial-command-capture.ps1 manual-collect failed (exit=$LASTEXITCODE)"
}

& powershell.exe @commonArgs -Action "set-report-5" -OutFile $set5Out | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw "run-rk3568-raw-serial-command-capture.ps1 set-report-5 failed (exit=$LASTEXITCODE)"
}

$manual = Get-Content -Path $manualOut -Raw | ConvertFrom-Json
$set5 = Get-Content -Path $set5Out -Raw | ConvertFrom-Json
$summary = [ordered]@{
  manualCollectAckForCommandCount = [int]$manual.rawCapture.targetAckForCommandCount
  manualCollectTelemetryAdvancedToCommand = [bool]$manual.rawCapture.targetTelemetryAdvancedToCommand
  setReport5AckForCommandCount = [int]$set5.rawCapture.targetAckForCommandCount
  setReport5TelemetryAdvancedToCommand = [bool]$set5.rawCapture.targetTelemetryAdvancedToCommand
  targetLastCommandTypesRemainEmpty = ((@($manual.rawCapture.targetLastCommandTypes) + @($set5.rawCapture.targetLastCommandTypes) | Where-Object { $_ -ne "" }).Count -eq 0)
  targetUploadTriggersAllPeriodic = ((@($manual.rawCapture.targetUploadTriggers) + @($set5.rawCapture.targetUploadTriggers) | Where-Object { $_ -ne "periodic" }).Count -eq 0)
}

$result = [ordered]@{
  generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  conclusion = if (
    $summary.manualCollectAckForCommandCount -eq 0 -and
    -not $summary.manualCollectTelemetryAdvancedToCommand -and
    $summary.setReport5AckForCommandCount -eq 0 -and
    -not $summary.setReport5TelemetryAdvancedToCommand
  ) {
    "node-command-not-observed-at-target-before-rk3568-publish"
  } else {
    "target-command-window-needs-review"
  }
  boardHost = $BoardHost
  serialDevice = $SerialDevice
  deviceId = $DeviceId
  summary = $summary
  manualCollect = $manual
  setReport5 = $set5
  sourceFiles = [ordered]@{
    manualCollect = To-RepoRelativePath -RootPath $repoRoot -TargetPath $manualOut
    setReport5 = To-RepoRelativePath -RootPath $repoRoot -TargetPath $set5Out
  }
}

$outPath = if ([System.IO.Path]::IsPathRooted($OutFile)) { $OutFile } else { Join-Path $repoRoot $OutFile }
$outDir = Split-Path -Parent $outPath
if ($outDir -and -not (Test-Path $outDir)) {
  New-Item -ItemType Directory -Path $outDir -Force | Out-Null
}

$resultJson = $result | ConvertTo-Json -Depth 8
Set-Content -Path $outPath -Value $resultJson -Encoding UTF8
$resultJson
