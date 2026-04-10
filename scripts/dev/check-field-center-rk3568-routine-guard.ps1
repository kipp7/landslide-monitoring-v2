[CmdletBinding()]
param(
  [string]$CenterRuntimeFreezeScript = "scripts/dev/check-field-center-runtime-freeze.ps1",
  [string]$Rk3568ProductionUplinkFreezeScript = "scripts/dev/check-field-rk3568-production-uplink-freeze.ps1",
  [string]$OperationalRecoveryScript = "scripts/dev/check-field-rk3568-center-operational-recovery.ps1",
  [string]$PhaseReadinessScript = "scripts/dev/check-field-center-deployment-software-adaptation-readiness.ps1",
  [string]$CenterProductionHandoffScript = "scripts/dev/prepare-field-center-production-handoff.ps1",
  [string]$BoardPassword = "",
  [switch]$AllowUnsafeSecrets,
  [switch]$RequireZeroSchemaRejectedDelta,
  [string]$OutFile = "docs/unified/reports/field-center-rk3568-routine-guard-latest.json"
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

function Resolve-RepoPath {
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

function Get-Check {
  param(
    [string]$Key,
    [bool]$Ok,
    $Actual,
    $Expected
  )

  [pscustomobject]@{
    key = $Key
    ok = $Ok
    actual = $Actual
    expected = $Expected
  }
}

$repoRoot = Resolve-RepoRoot
$resolvedCenterRuntimeFreezeScript = Resolve-RepoPath -RootPath $repoRoot -CandidatePath $CenterRuntimeFreezeScript
$resolvedRk3568ProductionUplinkFreezeScript = Resolve-RepoPath -RootPath $repoRoot -CandidatePath $Rk3568ProductionUplinkFreezeScript
$resolvedOperationalRecoveryScript = Resolve-RepoPath -RootPath $repoRoot -CandidatePath $OperationalRecoveryScript
$resolvedPhaseReadinessScript = Resolve-RepoPath -RootPath $repoRoot -CandidatePath $PhaseReadinessScript
$resolvedCenterProductionHandoffScript = Resolve-RepoPath -RootPath $repoRoot -CandidatePath $CenterProductionHandoffScript
$resolvedOutFile = Resolve-RepoPath -RootPath $repoRoot -CandidatePath $OutFile

$commonUnsafeArgs = @()
if ($AllowUnsafeSecrets.IsPresent) {
  $commonUnsafeArgs += "-AllowUnsafeSecrets"
}

$boardPasswordArgs = @()
if (-not [string]::IsNullOrWhiteSpace($BoardPassword)) {
  $boardPasswordArgs += @("-Password", $BoardPassword)
}

$boardRecoveryPasswordArgs = @()
if (-not [string]::IsNullOrWhiteSpace($BoardPassword)) {
  $boardRecoveryPasswordArgs += @("-BoardPassword", $BoardPassword)
}

Push-Location $repoRoot
try {
  $centerRuntimeFreeze = Invoke-JsonScript "Center runtime freeze" {
    powershell -NoProfile -ExecutionPolicy Bypass -File $resolvedCenterRuntimeFreezeScript @commonUnsafeArgs
  }

  $rk3568ProductionUplinkFreeze = Invoke-JsonScript "RK3568 production uplink freeze" {
    powershell -NoProfile -ExecutionPolicy Bypass -File $resolvedRk3568ProductionUplinkFreezeScript @boardPasswordArgs
  }

  $operationalRecoveryArgs = @(
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", $resolvedOperationalRecoveryScript
  ) + $boardRecoveryPasswordArgs + $commonUnsafeArgs

  if ($RequireZeroSchemaRejectedDelta.IsPresent) {
    $operationalRecoveryArgs += "-RequireZeroSchemaRejectedDelta"
  }

  $operationalRecovery = Invoke-JsonScript "RK3568 operational recovery" {
    powershell @operationalRecoveryArgs
  }

  $phaseReadiness = Invoke-JsonScript "Center deployment software adaptation readiness" {
    powershell -NoProfile -ExecutionPolicy Bypass -File $resolvedPhaseReadinessScript
  }

  $centerProductionHandoff = Invoke-JsonScript "Center production handoff" {
    powershell -NoProfile -ExecutionPolicy Bypass -File $resolvedCenterProductionHandoffScript @commonUnsafeArgs
  }

  $checks = @(
    (Get-Check -Key "centerRuntimeFreezeAccepted" -Ok:([bool]$centerRuntimeFreeze.accepted) -Actual ([bool]$centerRuntimeFreeze.accepted) -Expected $true),
    (Get-Check -Key "centerRuntimeFreezeBoundary" -Ok:([string]$centerRuntimeFreeze.currentBoundary -eq "center-runtime-freeze-ready") -Actual ([string]$centerRuntimeFreeze.currentBoundary) -Expected "center-runtime-freeze-ready"),
    (Get-Check -Key "rk3568ProductionUplinkFreezeAccepted" -Ok:([bool]$rk3568ProductionUplinkFreeze.accepted) -Actual ([bool]$rk3568ProductionUplinkFreeze.accepted) -Expected $true),
    (Get-Check -Key "rk3568ProductionUplinkFreezeBoundary" -Ok:([string]$rk3568ProductionUplinkFreeze.currentBoundary -eq "rk3568-production-uplink-freeze-ready") -Actual ([string]$rk3568ProductionUplinkFreeze.currentBoundary) -Expected "rk3568-production-uplink-freeze-ready"),
    (Get-Check -Key "rk3568ProductionRejectedWriteFailuresZero" -Ok:([int]$rk3568ProductionUplinkFreeze.runtime.rejectedWriteFailures -eq 0) -Actual ([int]$rk3568ProductionUplinkFreeze.runtime.rejectedWriteFailures) -Expected 0),
    (Get-Check -Key "operationalRecoveryAccepted" -Ok:([bool]$operationalRecovery.accepted) -Actual ([bool]$operationalRecovery.accepted) -Expected $true),
    (Get-Check -Key "operationalRecoveryBoundary" -Ok:([string]$operationalRecovery.currentBoundary -eq "rk3568-center-operational-recovery-ready") -Actual ([string]$operationalRecovery.currentBoundary) -Expected "rk3568-center-operational-recovery-ready"),
    (Get-Check -Key "operationalRecoveryRejectedWriteFailuresZero" -Ok:([int]$operationalRecovery.runtime.rejectedWriteFailures -eq 0) -Actual ([int]$operationalRecovery.runtime.rejectedWriteFailures) -Expected 0),
    (Get-Check -Key "phaseReadinessAccepted" -Ok:([bool]$phaseReadiness.accepted) -Actual ([bool]$phaseReadiness.accepted) -Expected $true),
    (Get-Check -Key "phaseReadinessBoundary" -Ok:([string]$phaseReadiness.currentBoundary -eq "center-deployment-software-adaptation-ready") -Actual ([string]$phaseReadiness.currentBoundary) -Expected "center-deployment-software-adaptation-ready"),
    (Get-Check -Key "centerProductionHandoffAccepted" -Ok:([bool]$centerProductionHandoff.accepted) -Actual ([bool]$centerProductionHandoff.accepted) -Expected $true),
    (Get-Check -Key "centerProductionHandoffBoundary" -Ok:([string]$centerProductionHandoff.currentBoundary -eq "center-production-handoff-ready") -Actual ([string]$centerProductionHandoff.currentBoundary) -Expected "center-production-handoff-ready")
  )

  $accepted = (@($checks | Where-Object { -not $_.ok }).Count -eq 0)
  $failureKeys = @($checks | Where-Object { -not $_.ok } | ForEach-Object { $_.key })

  $report = [ordered]@{
    generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    accepted = $accepted
    mode = "field-center-rk3568-routine-guard"
    currentBoundary = if ($accepted) { "field-center-rk3568-routine-guard-ready" } else { "field-center-rk3568-routine-guard-needs-review" }
    scope = [ordered]@{
      target = "center-runtime-and-rk3568-routine-operations"
      strictZeroNoiseRequired = [bool]$RequireZeroSchemaRejectedDelta.IsPresent
      failureKeys = $failureKeys
    }
    baselines = [ordered]@{
      centerRuntimeFreeze = [ordered]@{
        file = "docs/unified/reports/field-center-runtime-freeze-latest.json"
        generatedAt = [string]$centerRuntimeFreeze.generatedAt
        accepted = [bool]$centerRuntimeFreeze.accepted
        boundary = [string]$centerRuntimeFreeze.currentBoundary
      }
      rk3568ProductionUplinkFreeze = [ordered]@{
        file = "docs/unified/reports/field-rk3568-production-uplink-freeze-latest.json"
        generatedAt = [string]$rk3568ProductionUplinkFreeze.generatedAt
        accepted = [bool]$rk3568ProductionUplinkFreeze.accepted
        boundary = [string]$rk3568ProductionUplinkFreeze.currentBoundary
        rejectedWriteFailures = [int]$rk3568ProductionUplinkFreeze.runtime.rejectedWriteFailures
      }
      operationalRecovery = [ordered]@{
        file = "docs/unified/reports/field-rk3568-center-operational-recovery-latest.json"
        generatedAt = [string]$operationalRecovery.generatedAt
        accepted = [bool]$operationalRecovery.accepted
        boundary = [string]$operationalRecovery.currentBoundary
        cleanWindowReopened = [bool]$operationalRecovery.cleanWindowReopened
        rejectedWriteFailures = [int]$operationalRecovery.runtime.rejectedWriteFailures
      }
      phaseReadiness = [ordered]@{
        file = "docs/unified/reports/field-center-deployment-software-adaptation-readiness-latest.json"
        generatedAt = [string]$phaseReadiness.generatedAt
        accepted = [bool]$phaseReadiness.accepted
        boundary = [string]$phaseReadiness.currentBoundary
      }
      centerProductionHandoff = [ordered]@{
        file = "docs/unified/reports/field-center-production-handoff-latest.json"
        generatedAt = [string]$centerProductionHandoff.generatedAt
        accepted = [bool]$centerProductionHandoff.accepted
        boundary = [string]$centerProductionHandoff.currentBoundary
      }
    }
    nextUse = @(
      "routine guard: powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\check-field-center-rk3568-routine-guard.ps1 -BoardPassword <password> -AllowUnsafeSecrets",
      "strict routine guard: powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\check-field-center-rk3568-routine-guard.ps1 -BoardPassword <password> -AllowUnsafeSecrets -RequireZeroSchemaRejectedDelta",
      "board-only recovery: powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\check-field-rk3568-center-operational-recovery.ps1 -BoardPassword <password> -AllowUnsafeSecrets",
      "center-only handoff refresh: powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\prepare-field-center-production-handoff.ps1 -AllowUnsafeSecrets"
    )
    checks = $checks
  }

  $outDir = Split-Path -Parent $resolvedOutFile
  if ($outDir -and -not (Test-Path -LiteralPath $outDir)) {
    New-Item -ItemType Directory -Path $outDir -Force | Out-Null
  }

  $json = $report | ConvertTo-Json -Depth 8
  Set-Content -LiteralPath $resolvedOutFile -Value $json -Encoding UTF8
  $json
}
finally {
  Pop-Location
}
