[CmdletBinding()]
param(
  [ValidateSet("validate", "apply", "skip")]
  [string]$CenterDeployMode = "validate",
  [switch]$RestartGatewayService,
  [string]$ApiBaseUrl = "http://127.0.0.1:8080",
  [string]$WebBaseUrl = "http://127.0.0.1:3000",
  [string]$MqttUrl = "mqtt://127.0.0.1:1883",
  [string]$Username = "admin",
  [string]$Password = "123456",
  [string]$BoardHost = "192.168.124.172",
  [string]$BoardUser = "linaro",
  [string]$BoardPassword = "",
  [int]$BoardSshPort = 22,
  [string]$BoardRepoRoot = "/home/linaro/landslide-monitoring-v2-mainline",
  [string]$GatewayServiceName = "lsmv2-field-gateway",
  [int]$PostRestartDelaySeconds = 5,
  [int]$ObservationDurationSeconds = 60,
  [int]$ObservationPollSeconds = 10,
  [int]$BoardObservationMaxAttempts = 3,
  [int]$BoardObservationRetryDelaySeconds = 5,
  [int]$BoardObservationAllowedSchemaRejectedDelta = 1,
  [switch]$RequireZeroSchemaRejectedDelta,
  [int]$CommandMaxAttempts = 3,
  [int]$CommandRetryDelaySeconds = 3,
  [int]$StatePollTimeoutSeconds = 90,
  [int]$StatePollSeconds = 5,
  [int]$FreshnessSeconds = 180,
  [int]$ClosureMaxAttempts = 2,
  [int]$ClosureRetryDelaySeconds = 10,
  [switch]$AllowUnsafeSecrets,
  [string]$OutFile = "docs/unified/reports/field-rk3568-center-operational-recovery-latest.json"
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Resolve-RepoRoot() {
  $here = Get-Location
  $dir = $here.Path
  while ($dir -and -not (Test-Path (Join-Path $dir "package.json"))) {
    $parent = Split-Path -Parent $dir
    if ($parent -eq $dir) { break }
    $dir = $parent
  }
  if (-not $dir -or -not (Test-Path (Join-Path $dir "package.json"))) {
    throw "Cannot find repo root (package.json). Run this script from inside the repo."
  }
  return $dir
}

function Resolve-OutputPath {
  param(
    [string]$RootPath,
    [string]$CandidatePath
  )

  if ([System.IO.Path]::IsPathRooted($CandidatePath)) {
    return [System.IO.Path]::GetFullPath($CandidatePath)
  }

  return Join-Path $RootPath $CandidatePath
}

function Convert-TextToJsonObject {
  param(
    [string]$Text,
    [string]$Label
  )

  $trimmed = $Text.Trim()
  if (-not $trimmed) {
    throw "$Label returned empty output"
  }

  $jsonStart = $trimmed.IndexOf("{")
  $jsonEnd = $trimmed.LastIndexOf("}")
  if ($jsonStart -lt 0 -or $jsonEnd -lt $jsonStart) {
    throw "$Label did not return JSON output"
  }

  return ($trimmed.Substring($jsonStart, $jsonEnd - $jsonStart + 1) | ConvertFrom-Json)
}

function Invoke-JsonScript {
  param(
    [string]$Label,
    [scriptblock]$Action
  )

  Write-Host "==> $Label" -ForegroundColor Cyan
  $previousPreference = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    $output = & $Action 2>&1 | ForEach-Object { $_.ToString() } | Out-String
  } finally {
    $ErrorActionPreference = $previousPreference
  }
  if ($LASTEXITCODE -ne 0) {
    throw "$Label failed (exit=$LASTEXITCODE)"
  }

  return Convert-TextToJsonObject -Text $output -Label $Label
}

function Invoke-RemoteBash {
  param(
    [string]$TargetHost,
    [string]$TargetUser,
    [string]$TargetPassword,
    [int]$TargetPort,
    [string]$ScriptText
  )

  if ($TargetPassword) {
    $tempScriptFile = [System.IO.Path]::GetTempFileName()
    $pythonSnippet = @'
import sys
import paramiko
from pathlib import Path

host = sys.argv[1]
user = sys.argv[2]
password = sys.argv[3]
port = int(sys.argv[4])
script = Path(sys.argv[5]).read_text(encoding="utf-8")

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(hostname=host, username=user, password=password, port=port, timeout=15, banner_timeout=15, auth_timeout=15)
stdin, stdout, stderr = client.exec_command("bash -s --", timeout=180)
stdin.write(script)
stdin.flush()
stdin.channel.shutdown_write()
sys.stdout.write(stdout.read().decode("utf-8", errors="replace"))
sys.stderr.write(stderr.read().decode("utf-8", errors="replace"))
code = stdout.channel.recv_exit_status()
client.close()
raise SystemExit(code)
'@

    try {
      $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
      [System.IO.File]::WriteAllText($tempScriptFile, $ScriptText, $utf8NoBom)
      $pythonSnippet | & python - $TargetHost $TargetUser $TargetPassword ([string]$TargetPort) $tempScriptFile
    } finally {
      Remove-Item $tempScriptFile -Force -ErrorAction SilentlyContinue
    }
    return
  }

  $sshExe = (Get-Command ssh.exe -ErrorAction Stop).Source
  $sshArgs = @(
    "-p"
    ([string]$TargetPort)
    "-o"
    "StrictHostKeyChecking=accept-new"
    "-o"
    "ServerAliveInterval=15"
    "-o"
    "ServerAliveCountMax=3"
    ("{0}@{1}" -f $TargetUser, $TargetHost)
    "bash"
    "-s"
    "--"
  )

  $ScriptText | & $sshExe @sshArgs
}

function Convert-KeyValueTextToObject {
  param([string]$Text)

  $map = [ordered]@{}
  foreach ($line in ($Text -split "`r?`n")) {
    if ([string]::IsNullOrWhiteSpace($line)) {
      continue
    }

    $index = $line.IndexOf("=")
    if ($index -lt 1) {
      continue
    }

    $key = $line.Substring(0, $index).Trim()
    $value = $line.Substring($index + 1).Trim()
    $map[$key] = $value
  }

  return [pscustomobject]$map
}

function Restart-RemoteGatewayService {
  param(
    [string]$TargetHost,
    [string]$TargetUser,
    [string]$TargetPassword,
    [int]$TargetPort,
    [string]$ServiceName
  )

  $serviceNameBase64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($ServiceName))
  $remoteScript = @'
set -euo pipefail

service_name="$(printf '%s' '__SERVICE_NAME_B64__' | base64 -d)"

if command -v sudo >/dev/null 2>&1; then
  sudo -n systemctl restart "$service_name"
else
  systemctl restart "$service_name"
fi

systemctl show "$service_name" --property=MainPID,ExecMainStartTimestamp,ExecMainStatus,ActiveState,SubState,FragmentPath
'@

  $remoteScript = $remoteScript.Replace("__SERVICE_NAME_B64__", $serviceNameBase64)
  $raw = [string](Invoke-RemoteBash -TargetHost $TargetHost -TargetUser $TargetUser -TargetPassword $TargetPassword -TargetPort $TargetPort -ScriptText $remoteScript | Out-String)
  $parsed = Convert-KeyValueTextToObject -Text $raw

  return [pscustomobject][ordered]@{
    requested = $true
    serviceName = $ServiceName
    restartedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    mainPid = [string]$parsed.MainPID
    execMainStartTimestamp = [string]$parsed.ExecMainStartTimestamp
    execMainStatus = [string]$parsed.ExecMainStatus
    activeState = [string]$parsed.ActiveState
    subState = [string]$parsed.SubState
    fragmentPath = [string]$parsed.FragmentPath
    raw = $raw.Trim()
  }
}

function Get-Check {
  param(
    [string]$Key,
    [bool]$Ok,
    $Actual,
    $Expected
  )

  return [pscustomobject]@{
    key = $Key
    ok = $Ok
    actual = $Actual
    expected = $Expected
  }
}

function Invoke-ClosureWithRetry {
  param(
    [string[]]$ClosureArgs,
    [string]$ClosureReportPath,
    [int]$MaxAttempts,
    [int]$RetryDelaySeconds
  )

  $attemptHistory = New-Object System.Collections.Generic.List[object]
  $lastFailure = ""

  for ($attempt = 1; $attempt -le [Math]::Max(1, $MaxAttempts); $attempt++) {
    Write-Host ("==> Field RK3568 center live closure (attempt {0}/{1})" -f $attempt, [Math]::Max(1, $MaxAttempts)) -ForegroundColor Cyan
    $previousPreference = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
      $output = & powershell @ClosureArgs 2>&1 | ForEach-Object { $_.ToString() } | Out-String
    } finally {
      $ErrorActionPreference = $previousPreference
    }
    $exitCode = $LASTEXITCODE

    if ($exitCode -eq 0) {
      $closureObject = Convert-TextToJsonObject -Text $output -Label "Field RK3568 center live closure"
      return [pscustomobject][ordered]@{
        success = $true
        result = $closureObject
        attempts = @($attemptHistory.ToArray())
      }
    }

    $failureReport = $null
    if (Test-Path -LiteralPath $ClosureReportPath) {
      try {
        $failureReport = (Get-Content -LiteralPath $ClosureReportPath -Raw -Encoding UTF8) | ConvertFrom-Json
      } catch {
        $failureReport = $null
      }
    }

    $lastFailure = ($output.Trim() -replace "\s+", " ").Trim()
    $attemptHistory.Add([pscustomobject][ordered]@{
      attempt = $attempt
      exitCode = $exitCode
      currentBoundary = if ($failureReport) { [string]$failureReport.currentBoundary } else { $null }
      accepted = if ($failureReport) { [bool]$failureReport.accepted } else { $null }
      failure = $lastFailure
    })

    if ($attempt -lt [Math]::Max(1, $MaxAttempts)) {
      Start-Sleep -Seconds ([Math]::Max(1, $RetryDelaySeconds))
    }
  }

  throw ("Field RK3568 center live closure failed after {0} attempt(s): {1}" -f [Math]::Max(1, $MaxAttempts), $lastFailure)
}

$repoRoot = Resolve-RepoRoot
$resolvedOutFile = Resolve-OutputPath -RootPath $repoRoot -CandidatePath $OutFile
$reportDir = Split-Path -Parent $resolvedOutFile
if ($reportDir -and -not (Test-Path -LiteralPath $reportDir)) {
  New-Item -ItemType Directory -Path $reportDir -Force | Out-Null
}

$runtimeOutFile = Join-Path $repoRoot "docs/unified/reports/field-rk3568-gateway-runtime-latest.json"
$closureOutFile = Join-Path $repoRoot "docs/unified/reports/field-rk3568-center-live-closure-latest.json"

Push-Location $repoRoot
$originalPythonWarnings = $env:PYTHONWARNINGS
$env:PYTHONWARNINGS = "ignore"
try {
  if ($RestartGatewayService.IsPresent) {
    Write-Host "==> Restart RK3568 field gateway service" -ForegroundColor Cyan
    $restart = Restart-RemoteGatewayService `
      -TargetHost $BoardHost `
      -TargetUser $BoardUser `
      -TargetPassword $BoardPassword `
      -TargetPort $BoardSshPort `
      -ServiceName $GatewayServiceName

    if ($PostRestartDelaySeconds -gt 0) {
      Start-Sleep -Seconds $PostRestartDelaySeconds
    }
  } else {
    $restart = [pscustomobject][ordered]@{
      requested = $false
      serviceName = $GatewayServiceName
    }
  }

  $runtime = Invoke-JsonScript "RK3568 field gateway runtime snapshot" {
    $runtimeArgs = @(
      "-NoProfile",
      "-ExecutionPolicy", "Bypass",
      "-File", ".\scripts\dev\check-rk3568-field-gateway-runtime.ps1",
      "-BoardHost", $BoardHost,
      "-User", $BoardUser,
      "-SshPort", ([string]$BoardSshPort),
      "-RepoRoot", $BoardRepoRoot,
      "-ServiceName", $GatewayServiceName,
      "-OutFile", $runtimeOutFile
    )
    if (-not [string]::IsNullOrWhiteSpace($BoardPassword)) {
      $runtimeArgs += @("-Password", $BoardPassword)
    }
    powershell @runtimeArgs
  }

  $closureArgs = @(
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", ".\scripts\dev\check-field-rk3568-center-live-closure.ps1",
    "-CenterDeployMode", $CenterDeployMode,
    "-ApiBaseUrl", $ApiBaseUrl,
    "-WebBaseUrl", $WebBaseUrl,
    "-MqttUrl", $MqttUrl,
    "-Username", $Username,
    "-Password", $Password,
    "-BoardHost", $BoardHost,
    "-BoardUser", $BoardUser,
    "-BoardSshPort", ([string]$BoardSshPort),
    "-BoardRepoRoot", $BoardRepoRoot,
    "-ObservationDurationSeconds", ([string]$ObservationDurationSeconds),
    "-ObservationPollSeconds", ([string]$ObservationPollSeconds),
    "-BoardObservationMaxAttempts", ([string]$BoardObservationMaxAttempts),
    "-BoardObservationRetryDelaySeconds", ([string]$BoardObservationRetryDelaySeconds),
    "-BoardObservationAllowedSchemaRejectedDelta", ([string]$BoardObservationAllowedSchemaRejectedDelta),
    "-CommandMaxAttempts", ([string]$CommandMaxAttempts),
    "-CommandRetryDelaySeconds", ([string]$CommandRetryDelaySeconds),
    "-StatePollTimeoutSeconds", ([string]$StatePollTimeoutSeconds),
    "-StatePollSeconds", ([string]$StatePollSeconds),
    "-FreshnessSeconds", ([string]$FreshnessSeconds),
    "-OutFile", $closureOutFile
  )
  if (-not [string]::IsNullOrWhiteSpace($BoardPassword)) {
    $closureArgs += @("-BoardPassword", $BoardPassword)
  }
  if ($RequireZeroSchemaRejectedDelta.IsPresent) {
    $closureArgs += "-RequireZeroSchemaRejectedDelta"
  }
  if ($AllowUnsafeSecrets.IsPresent) {
    $closureArgs += "-AllowUnsafeSecrets"
  }

  $closureAttemptResult = Invoke-ClosureWithRetry `
    -ClosureArgs $closureArgs `
    -ClosureReportPath $closureOutFile `
    -MaxAttempts $ClosureMaxAttempts `
    -RetryDelaySeconds $ClosureRetryDelaySeconds

  $closure = $closureAttemptResult.result

  $runtimeShow = Convert-KeyValueTextToObject -Text ([string]$runtime.serviceState.show.stdout)
  $runtimeNodeA = @($runtime.runtimeHealth.southbound.nodes | Where-Object { $_.deviceId -eq "00000000-0000-0000-0000-000000000001" } | Select-Object -First 1)[0]
  $runtimeNodeB = @($runtime.runtimeHealth.southbound.nodes | Where-Object { $_.deviceId -eq "00000000-0000-0000-0000-000000000002" } | Select-Object -First 1)[0]
  $runtimeNodeC = @($runtime.runtimeHealth.southbound.nodes | Where-Object { $_.deviceId -eq "00000000-0000-0000-0000-000000000003" } | Select-Object -First 1)[0]
  $closureBoardWindow = $closure.boardObservation.window
  $closureStableCommand = $closure.stableCommand
  $closureNodeAApi = $closure.livePlatform.nodeA.api.check
  $closureNodeAWeb = $closure.livePlatform.nodeA.web.check
  $closureNodeBApi = $closure.livePlatform.nodeB.api.check
  $closureNodeBWeb = $closure.livePlatform.nodeB.web.check

  $checks = @(
    (Get-Check -Key "runtimeServiceActive" -Ok:([string]$runtime.serviceState.isActive.stdout -eq "active") -Actual ([string]$runtime.serviceState.isActive.stdout) -Expected "active"),
    (Get-Check -Key "runtimeMqttConnected" -Ok:([bool]$runtime.runtimeHealth.mqtt.connected) -Actual ([bool]$runtime.runtimeHealth.mqtt.connected) -Expected $true),
    (Get-Check -Key "runtimeSerialOpen" -Ok:([bool]$runtime.runtimeHealth.serial.open) -Actual ([bool]$runtime.runtimeHealth.serial.open) -Expected $true),
    (Get-Check -Key "runtimeRejectedWriteFailuresZero" -Ok:([int]$runtime.runtimeHealth.stats.rejectedWriteFailures -eq 0) -Actual ([int]$runtime.runtimeHealth.stats.rejectedWriteFailures) -Expected 0),
    (Get-Check -Key "closureAccepted" -Ok:([bool]$closure.accepted) -Actual ([bool]$closure.accepted) -Expected $true),
    (Get-Check -Key "closureBoundary" -Ok:([string]$closure.currentBoundary -eq "rk3568-live-center-closure-ready") -Actual ([string]$closure.currentBoundary) -Expected "rk3568-live-center-closure-ready"),
    (Get-Check -Key "boardWindowStable" -Ok:([bool]$closureBoardWindow.stable) -Actual ([bool]$closureBoardWindow.stable) -Expected $true),
    (Get-Check -Key "boardWindowStrictlyClean" -Ok:([bool]$closureBoardWindow.strictlyClean) -Actual ([bool]$closureBoardWindow.strictlyClean) -Expected $true),
    (Get-Check -Key "boardParserNoiseWithinBudget" -Ok:([bool]$closureBoardWindow.parserNoiseWithinBudget) -Actual ([bool]$closureBoardWindow.parserNoiseWithinBudget) -Expected $true),
    (Get-Check -Key "boardRejectedEvidenceAligned" -Ok:([bool]$closureBoardWindow.rejectedEvidenceAligned) -Actual ([bool]$closureBoardWindow.rejectedEvidenceAligned) -Expected $true),
    (Get-Check -Key "boardRejectedWriteFailuresDeltaZero" -Ok:([int]$closureBoardWindow.counterDelta.rejectedWriteFailures -eq 0) -Actual ([int]$closureBoardWindow.counterDelta.rejectedWriteFailures) -Expected 0),
    (Get-Check -Key "stableCommandAcked" -Ok:([string]$closureStableCommand.ackStatus -eq "acked") -Actual ([string]$closureStableCommand.ackStatus) -Expected "acked"),
    (Get-Check -Key "nodeAApiMetricsContract" -Ok:([bool]$closureNodeAApi.metricsContractOk) -Actual ([bool]$closureNodeAApi.metricsContractOk) -Expected $true),
    (Get-Check -Key "nodeAWebMetricsContract" -Ok:([bool]$closureNodeAWeb.metricsContractOk) -Actual ([bool]$closureNodeAWeb.metricsContractOk) -Expected $true),
    (Get-Check -Key "nodeBApiMetricsContract" -Ok:([bool]$closureNodeBApi.metricsContractOk) -Actual ([bool]$closureNodeBApi.metricsContractOk) -Expected $true),
    (Get-Check -Key "nodeBWebMetricsContract" -Ok:([bool]$closureNodeBWeb.metricsContractOk) -Actual ([bool]$closureNodeBWeb.metricsContractOk) -Expected $true)
  )

  if ($RestartGatewayService.IsPresent) {
    $checks += (Get-Check -Key "restartResultVisibleInRuntime" `
      -Ok:(([string]$restart.mainPid -eq [string]$runtimeShow.MainPID) -and ([string]$restart.execMainStartTimestamp -eq [string]$runtimeShow.ExecMainStartTimestamp)) `
      -Actual ([string]$runtimeShow.MainPID + " @ " + [string]$runtimeShow.ExecMainStartTimestamp) `
      -Expected ([string]$restart.mainPid + " @ " + [string]$restart.execMainStartTimestamp))
  }

  $accepted = (@($checks | Where-Object { -not $_.ok }).Count -eq 0)
  $cleanWindowReopened = (
    [bool]$closure.accepted -and
    [bool]$closureBoardWindow.strictlyClean -and
    [int]$closureBoardWindow.counterDelta.schemaRejected -eq 0
  )

  $report = [ordered]@{
    generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    accepted = $accepted
    mode = "field-rk3568-center-operational-recovery"
    currentBoundary = if ($accepted) { "rk3568-center-operational-recovery-ready" } else { "rk3568-center-operational-recovery-needs-review" }
    cleanWindowReopened = $cleanWindowReopened
    centerDeployMode = $CenterDeployMode
    restart = $restart
    runtime = [ordered]@{
      report = "docs/unified/reports/field-rk3568-gateway-runtime-latest.json"
      mainPid = [string]$runtimeShow.MainPID
      execMainStartTimestamp = [string]$runtimeShow.ExecMainStartTimestamp
      serviceActive = [string]$runtime.serviceState.isActive.stdout
      mqttConnected = [bool]$runtime.runtimeHealth.mqtt.connected
      serialOpen = [bool]$runtime.runtimeHealth.serial.open
      parsedMessages = [int]$runtime.runtimeHealth.stats.parsedMessages
      publishedMessages = [int]$runtime.runtimeHealth.stats.publishedMessages
      schemaRejected = [int]$runtime.runtimeHealth.stats.schemaRejected
      rejectedMessages = [int]$runtime.runtimeHealth.stats.rejectedMessages
      rejectedWriteFailures = [int]$runtime.runtimeHealth.stats.rejectedWriteFailures
      nodeAStatus = [string]$runtimeNodeA.status
      nodeBStatus = [string]$runtimeNodeB.status
      nodeCStatus = [string]$runtimeNodeC.status
    }
    closure = [ordered]@{
      report = "docs/unified/reports/field-rk3568-center-live-closure-latest.json"
      generatedAt = [string]$closure.generatedAt
      accepted = [bool]$closure.accepted
      currentBoundary = [string]$closure.currentBoundary
      attempts = @($closureAttemptResult.attempts)
      centerComposeBoundary = [string]$closure.centerAcceptance.currentBoundary
      boardObservationConclusion = [string]$closure.boardObservation.conclusion
      boardObservationSchemaRejectedDelta = [int]$closureBoardWindow.counterDelta.schemaRejected
      boardObservationRejectedMessagesDelta = [int]$closureBoardWindow.counterDelta.rejectedMessages
      boardObservationRejectedWriteFailuresDelta = [int]$closureBoardWindow.counterDelta.rejectedWriteFailures
      boardObservationRejectedEvidenceAligned = [bool]$closureBoardWindow.rejectedEvidenceAligned
      boardObservationSampleCount = [int]$closure.boardObservation.sampleCount
      commandId = [string]$closureStableCommand.commandId
      ackStatus = [string]$closureStableCommand.ackStatus
      parseFailureCount = [int]$closureStableCommand.successfulAttempt.parseFailureCount
      nodeAMetricsKeyCountApi = [int]$closure.livePlatform.nodeA.api.snapshot.metricsKeyCount
      nodeAMetricsKeyCountWeb = [int]$closure.livePlatform.nodeA.web.snapshot.metricsKeyCount
      nodeBMetricsKeyCountApi = [int]$closure.livePlatform.nodeB.api.snapshot.metricsKeyCount
      nodeBMetricsKeyCountWeb = [int]$closure.livePlatform.nodeB.web.snapshot.metricsKeyCount
    }
    checks = $checks
    nextUse = @(
      "standard recovery check: powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\check-field-rk3568-center-operational-recovery.ps1 -BoardPassword <password> -AllowUnsafeSecrets",
      "controlled restart + recovery check: powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\check-field-rk3568-center-operational-recovery.ps1 -RestartGatewayService -BoardPassword <password> -AllowUnsafeSecrets",
      "strict zero-noise recovery check: powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\check-field-rk3568-center-operational-recovery.ps1 -BoardPassword <password> -AllowUnsafeSecrets -RequireZeroSchemaRejectedDelta"
    )
  }

  $json = $report | ConvertTo-Json -Depth 8
  Set-Content -Path $resolvedOutFile -Value $json -Encoding UTF8
  $json
} finally {
  $env:PYTHONWARNINGS = $originalPythonWarnings
  Pop-Location
}
