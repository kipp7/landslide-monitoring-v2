[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$DeviceId,
  [ValidateSet("manual-collect", "set-report-5", "set-report-300")]
  [string]$Action = "manual-collect",
  [string]$BoardHost = "192.168.124.172",
  [string]$User = "linaro",
  [string]$Password = "",
  [int]$SshPort = 22,
  [string]$MqttUrl = "mqtt://127.0.0.1:1883",
  [int]$MaxAttempts = 3,
  [int]$RetryDelaySeconds = 3,
  [string]$OutFile = ""
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

if ($MaxAttempts -lt 1) {
  throw "MaxAttempts must be >= 1"
}

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$tmpDir = Join-Path $repoRoot ".tmp"
if (-not (Test-Path $tmpDir)) {
  New-Item -ItemType Directory -Path $tmpDir -Force | Out-Null
}

$proofScript = Join-Path $repoRoot "scripts/dev/run-rk3568-field-gateway-node-command-proof.ps1"
$attempts = New-Object System.Collections.Generic.List[object]
$successfulAttempt = $null

for ($attempt = 1; $attempt -le $MaxAttempts; $attempt += 1) {
  Write-Host ("[STABLE] attempt={0}/{1} action={2} deviceId={3}" -f $attempt, $MaxAttempts, $Action, $DeviceId)
  $attemptOutFile = Join-Path $tmpDir ("rk3568-node-command-stable-{0}-{1}-{2}.json" -f $DeviceId.Substring($DeviceId.Length - 4), $Action, $attempt)

  $args = @(
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", $proofScript,
    "-DeviceId", $DeviceId,
    "-Action", $Action,
    "-BoardHost", $BoardHost,
    "-User", $User,
    "-SshPort", ([string]$SshPort),
    "-MqttUrl", $MqttUrl,
    "-OutFile", $attemptOutFile
  )
  if ($Password) {
    $args += @("-Password", $Password)
  }

  $raw = & powershell.exe @args | Out-String
  if ($LASTEXITCODE -ne 0) {
    throw "run-rk3568-field-gateway-node-command-proof.ps1 failed (exit=$LASTEXITCODE)"
  }

  $parsed = if (Test-Path $attemptOutFile) {
    Get-Content -Path $attemptOutFile -Raw | ConvertFrom-Json
  } else {
    $raw | ConvertFrom-Json
  }

  $attemptSummary = [pscustomobject]@{
      attempt = $attempt
      passed = [bool]$parsed.passed
      commandId = $parsed.command.command_id
      ackStatus = if ($parsed.ackEvidence) { $parsed.ackEvidence.status } else { $null }
      summary = $parsed.diagnosis.summary
      parseFailureCount = $parsed.diagnosis.parseFailureCount
      failureModes = @($parsed.diagnosis.failureModes)
      beforeAckPublishes = $parsed.before.node.ackPublishes
      afterAckPublishes = $parsed.after.node.ackPublishes
      beforeLastAckTs = $parsed.before.node.lastAckTs
      afterLastAckTs = $parsed.after.node.lastAckTs
      proofFile = To-RepoRelativePath -RootPath $repoRoot -TargetPath $attemptOutFile
    }
  $attempts.Add($attemptSummary)

  if ([bool]$parsed.passed) {
    $successfulAttempt = $attemptSummary
    break
  }

  if ($attempt -lt $MaxAttempts) {
    Start-Sleep -Seconds ([Math]::Max(1, $RetryDelaySeconds))
  }
}

$finalAttempt = @($attempts | Select-Object -Last 1)[0]
$result = [ordered]@{
  generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
  mode = "rk3568-node-command-stable"
  boardHost = $BoardHost
  mqttUrl = $MqttUrl
  deviceId = $DeviceId
  action = $Action
  maxAttempts = $MaxAttempts
  retryDelaySeconds = $RetryDelaySeconds
  passed = $null -ne $successfulAttempt
  conclusion = if ($successfulAttempt) {
    if ([int]$successfulAttempt.attempt -eq 1) {
      "single-shot-proof-succeeded"
    } else {
      "shared-port-command-succeeded-after-retry"
    }
  } else {
    "shared-port-command-failed-after-max-attempts"
  }
  successfulAttempt = $successfulAttempt
  finalAttempt = $finalAttempt
  attemptCount = $attempts.Count
  attempts = @($attempts.ToArray())
}

$resultJson = $result | ConvertTo-Json -Depth 8
if ($OutFile) {
  Set-Content -Path $OutFile -Value $resultJson -Encoding UTF8
}
$resultJson
