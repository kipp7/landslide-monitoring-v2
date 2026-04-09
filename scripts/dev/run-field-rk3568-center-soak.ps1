[CmdletBinding()]
param(
  [int]$Rounds = 3,
  [int]$IntervalSeconds = 30,
  [switch]$RestartBeforeFirstRound,
  [ValidateSet("validate", "apply", "skip")]
  [string]$CenterDeployMode = "validate",
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
  [string]$OutFile = "docs/unified/reports/field-rk3568-center-soak-latest.json"
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

if ($Rounds -lt 1) {
  throw "Rounds must be >= 1"
}
if ($IntervalSeconds -lt 0) {
  throw "IntervalSeconds must be >= 0"
}

$repoRoot = Resolve-RepoRoot
$resolvedOutFile = Resolve-OutputPath -RootPath $repoRoot -CandidatePath $OutFile
$reportDir = Split-Path -Parent $resolvedOutFile
if ($reportDir -and -not (Test-Path -LiteralPath $reportDir)) {
  New-Item -ItemType Directory -Path $reportDir -Force | Out-Null
}

$tmpDir = Join-Path $repoRoot ".tmp"
if (-not (Test-Path -LiteralPath $tmpDir)) {
  New-Item -ItemType Directory -Path $tmpDir -Force | Out-Null
}

Push-Location $repoRoot
try {
  $roundReports = New-Object System.Collections.Generic.List[object]

  for ($round = 1; $round -le $Rounds; $round++) {
    $restartThisRound = ($RestartBeforeFirstRound.IsPresent -and $round -eq 1)
    $roundOutFile = Join-Path $tmpDir ("field-rk3568-center-soak-round-{0:000}.json" -f $round)

    $recoveryArgs = @(
      "-NoProfile",
      "-ExecutionPolicy", "Bypass",
      "-File", ".\scripts\dev\check-field-rk3568-center-operational-recovery.ps1",
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
      "-ClosureMaxAttempts", ([string]$ClosureMaxAttempts),
      "-ClosureRetryDelaySeconds", ([string]$ClosureRetryDelaySeconds),
      "-OutFile", $roundOutFile
    )
    if ($restartThisRound) {
      $recoveryArgs += "-RestartGatewayService"
    }
    if (-not [string]::IsNullOrWhiteSpace($BoardPassword)) {
      $recoveryArgs += @("-BoardPassword", $BoardPassword)
    }
    if ($RequireZeroSchemaRejectedDelta.IsPresent) {
      $recoveryArgs += "-RequireZeroSchemaRejectedDelta"
    }
    if ($AllowUnsafeSecrets.IsPresent) {
      $recoveryArgs += "-AllowUnsafeSecrets"
    }

    $result = Invoke-JsonScript ("RK3568 center soak round #{0}" -f $round) {
      powershell @recoveryArgs
    }

    $roundReports.Add([pscustomobject][ordered]@{
      round = $round
      accepted = [bool]$result.accepted
      recoveryBoundary = [string]$result.currentBoundary
      cleanWindowReopened = [bool]$result.cleanWindowReopened
      restartRequested = [bool]$result.restart.requested
      restartPid = if ($result.restart.requested) { [string]$result.restart.mainPid } else { $null }
      closureGeneratedAt = [string]$result.closure.generatedAt
      closureAccepted = [bool]$result.closure.accepted
      closureBoundary = [string]$result.closure.currentBoundary
      boardObservationConclusion = [string]$result.closure.boardObservationConclusion
      boardObservationSchemaRejectedDelta = [int]$result.closure.boardObservationSchemaRejectedDelta
      commandId = [string]$result.closure.commandId
      ackStatus = [string]$result.closure.ackStatus
      parseFailureCount = [int]$result.closure.parseFailureCount
      nodeAMetricsKeyCountApi = [int]$result.closure.nodeAMetricsKeyCountApi
      nodeBMetricsKeyCountApi = [int]$result.closure.nodeBMetricsKeyCountApi
      closureRetryCount = @($result.closure.attempts).Count
      closureAttempts = @($result.closure.attempts)
      reportFile = (Resolve-Path -LiteralPath $roundOutFile).Path
    })

    if ($round -lt $Rounds -and $IntervalSeconds -gt 0) {
      Start-Sleep -Seconds $IntervalSeconds
    }
  }

  $roundArray = @($roundReports.ToArray())
  $acceptedRounds = @($roundArray | Where-Object { $_.accepted }).Count
  $allAccepted = ($acceptedRounds -eq $Rounds)
  $maxParseFailureCount = (@($roundArray | Measure-Object -Property parseFailureCount -Maximum).Maximum)
  $maxClosureRetryCount = (@($roundArray | Measure-Object -Property closureRetryCount -Maximum).Maximum)
  $restartRounds = @($roundArray | Where-Object { $_.restartRequested }).Count

  $report = [ordered]@{
    generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    mode = "field-rk3568-center-soak"
    accepted = $allAccepted
    currentBoundary = if ($allAccepted) { "rk3568-center-soak-ready" } else { "rk3568-center-soak-needs-review" }
    rounds = $Rounds
    acceptedRounds = $acceptedRounds
    restartRounds = $restartRounds
    intervalSeconds = $IntervalSeconds
    centerDeployMode = $CenterDeployMode
    summary = [ordered]@{
      cleanWindowRounds = @($roundArray | Where-Object { $_.cleanWindowReopened }).Count
      maxBoardObservationSchemaRejectedDelta = (@($roundArray | Measure-Object -Property boardObservationSchemaRejectedDelta -Maximum).Maximum)
      maxParseFailureCount = $maxParseFailureCount
      maxClosureRetryCount = $maxClosureRetryCount
      allAcked = (@($roundArray | Where-Object { $_.ackStatus -ne "acked" }).Count -eq 0)
      allMetricsContractStable = (@($roundArray | Where-Object { $_.nodeAMetricsKeyCountApi -ne 14 -or $_.nodeBMetricsKeyCountApi -ne 14 }).Count -eq 0)
    }
    roundResults = $roundArray
    nextUse = @(
      "two-round soak after controlled restart: powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\run-field-rk3568-center-soak.ps1 -Rounds 2 -IntervalSeconds 30 -RestartBeforeFirstRound -BoardPassword <password> -AllowUnsafeSecrets",
      "longer routine soak: powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\run-field-rk3568-center-soak.ps1 -Rounds 3 -IntervalSeconds 60 -BoardPassword <password> -AllowUnsafeSecrets",
      "strict soak: powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\run-field-rk3568-center-soak.ps1 -Rounds 2 -IntervalSeconds 30 -BoardPassword <password> -AllowUnsafeSecrets -RequireZeroSchemaRejectedDelta"
    )
  }

  $json = $report | ConvertTo-Json -Depth 8
  Set-Content -Path $resolvedOutFile -Value $json -Encoding UTF8
  $json
} finally {
  Pop-Location
}
