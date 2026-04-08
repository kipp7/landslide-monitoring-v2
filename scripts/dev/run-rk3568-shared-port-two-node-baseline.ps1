[CmdletBinding()]
param(
  [string]$DeviceId = "00000000-0000-0000-0000-000000000002",
  [string]$BoardHost = "192.168.124.172",
  [string]$User = "linaro",
  [string]$Password = "",
  [int]$SshPort = 22,
  [string]$MqttUrl = "mqtt://127.0.0.1:1883",
  [string]$OutFile = "docs/unified/reports/field-rk3568-shared-port-two-node-baseline-latest.json"
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
$proofScript = Join-Path $repoRoot "scripts/dev/run-rk3568-field-gateway-node-command-proof.ps1"
$resolvedOutFile = Join-Path $repoRoot $OutFile
$reportDir = Split-Path -Parent $resolvedOutFile
if ($reportDir -and -not (Test-Path $reportDir)) {
  New-Item -ItemType Directory -Path $reportDir -Force | Out-Null
}

$actionOrder = @(
  "manual-collect",
  "set-report-300",
  "set-report-5"
)

$stepResults = New-Object System.Collections.Generic.List[object]
$restoreAttempted = $false
$restorePassed = $false
$currentFailure = $null

foreach ($action in $actionOrder) {
  Write-Host ("[BASELINE] running action={0} deviceId={1}" -f $action, $DeviceId)

  $args = @(
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", $proofScript,
    "-DeviceId", $DeviceId,
    "-Action", $action,
    "-BoardHost", $BoardHost,
    "-User", $User,
    "-SshPort", ([string]$SshPort),
    "-MqttUrl", $MqttUrl
  )
  if ($Password) {
    $args += @("-Password", $Password)
  }

  $raw = & powershell.exe @args | Out-String
  if ($LASTEXITCODE -ne 0) {
    $currentFailure = "proof script failed for action=$action (exit=$LASTEXITCODE)"
    break
  }

  $parsed = $raw | ConvertFrom-Json
  $stepResults.Add($parsed)
  if (-not [bool]$parsed.passed) {
    $currentFailure = "proof returned passed=false for action=$action"
    break
  }
}

if ($currentFailure -and (($stepResults | Where-Object { $_.action -eq "set-report-5" }).Count -eq 0)) {
  $restoreAttempted = $true
  Write-Host "[BASELINE] restoring set-report-5 after earlier failure"

  $restoreArgs = @(
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", $proofScript,
    "-DeviceId", $DeviceId,
    "-Action", "set-report-5",
    "-BoardHost", $BoardHost,
    "-User", $User,
    "-SshPort", ([string]$SshPort),
    "-MqttUrl", $MqttUrl
  )
  if ($Password) {
    $restoreArgs += @("-Password", $Password)
  }

  $restoreRaw = & powershell.exe @restoreArgs | Out-String
  if ($LASTEXITCODE -eq 0) {
    try {
      $restoreParsed = $restoreRaw | ConvertFrom-Json
      $stepResults.Add($restoreParsed)
      $restorePassed = [bool]$restoreParsed.passed
    } catch {
      $restorePassed = $false
    }
  }
}

$manual = @($stepResults | Where-Object { $_.action -eq "manual-collect" } | Select-Object -Last 1)[0]
$set300 = @($stepResults | Where-Object { $_.action -eq "set-report-300" } | Select-Object -Last 1)[0]
$set5 = @($stepResults | Where-Object { $_.action -eq "set-report-5" } | Select-Object -Last 1)[0]
$allPassed = ($stepResults.Count -ge 3) -and @($stepResults | Where-Object { -not $_.passed }).Count -eq 0 -and (-not $currentFailure)

$result = [ordered]@{
  generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
  mode = "rk3568-shared-port-two-node-baseline"
  conclusion = if ($allPassed) {
    "two-node-shared-port-baseline-reproved"
  } elseif ($restoreAttempted -and $restorePassed) {
    "baseline-failed-but-report-interval-restored-to-5s"
  } else {
    "baseline-failed-and-restore-state-unknown"
  }
  passed = $allPassed
  deviceId = $DeviceId
  boardHost = $BoardHost
  mqttUrl = $MqttUrl
  fixedActionOrder = $actionOrder
  restoreAttempted = $restoreAttempted
  restorePassed = $restorePassed
  failure = $currentFailure
  latestCounters = if ($set5) {
    [ordered]@{
      commandsReceived = $set5.after.commandsReceived
      commandsForwarded = $set5.after.commandsForwarded
      ackMessagesPublished = $set5.after.ackMessagesPublished
      nodeCommandForwards = $set5.after.node.commandForwards
      nodeAckPublishes = $set5.after.node.ackPublishes
      nodeStatus = $set5.after.node.status
    }
  } else {
    $null
  }
  proofs = [ordered]@{
    manualCollect = $manual
    setReport300 = $set300
    setReport5 = $set5
  }
  nextPhase = @(
    "bring node C onto the same center-fed /dev/ttyS3 stream",
    "re-run this same fixed baseline after node C is visible",
    "run a longer stability window to reduce parse-failure noise"
  )
}

$resultJson = $result | ConvertTo-Json -Depth 8
Set-Content -Path $resolvedOutFile -Value $resultJson -Encoding UTF8
$resultJson
