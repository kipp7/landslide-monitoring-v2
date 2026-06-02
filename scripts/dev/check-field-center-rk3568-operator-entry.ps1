[CmdletBinding()]
param(
  [ValidateSet("validate", "apply", "skip")]
  [string]$CenterDeployMode = "validate",
  [string]$BoardPassword = "",
  [switch]$AllowUnsafeSecrets,
  [switch]$RequireZeroSchemaRejectedDelta,
  [string]$OutFile = "docs/unified/reports/field-center-rk3568-operator-entry-latest.json"
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

function Read-JsonFile {
  param(
    [string]$Path,
    [string]$Label
  )

  if (-not (Test-Path -LiteralPath $Path)) {
    throw "$Label not found: $Path"
  }

  return (Get-Content -LiteralPath $Path -Raw -Encoding UTF8) | ConvertFrom-Json
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

function Invoke-JsonScriptWithFileFallback {
  param(
    [string]$Label,
    [string[]]$Args,
    [string]$ReportPath
  )

  Write-Host "==> $Label" -ForegroundColor Cyan
  $previousPreference = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    $output = & powershell @Args 2>&1 | ForEach-Object { $_.ToString() } | Out-String
  } finally {
    $ErrorActionPreference = $previousPreference
  }

  if ($LASTEXITCODE -ne 0) {
    throw "$Label failed (exit=$LASTEXITCODE)"
  }

  try {
    return Convert-TextToJsonObject -Text $output -Label $Label
  } catch {
    if ($ReportPath -and (Test-Path -LiteralPath $ReportPath)) {
      return Read-JsonFile -Path $ReportPath -Label "$Label report"
    }

    throw
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

$repoRoot = Resolve-RepoRoot
$resolvedOutFile = Resolve-RepoPath -RootPath $repoRoot -CandidatePath $OutFile
$outDir = Split-Path -Parent $resolvedOutFile
if ($outDir -and -not (Test-Path -LiteralPath $outDir)) {
  New-Item -ItemType Directory -Path $outDir -Force | Out-Null
}

$composeAcceptanceReport = Resolve-RepoPath -RootPath $repoRoot -CandidatePath "docs/unified/reports/field-center-compose-acceptance-latest.json"
$routineGuardReport = Resolve-RepoPath -RootPath $repoRoot -CandidatePath "docs/unified/reports/field-center-rk3568-routine-guard-latest.json"
$liveClosureReport = Resolve-RepoPath -RootPath $repoRoot -CandidatePath "docs/unified/reports/field-rk3568-center-live-closure-latest.json"
$operatorEntryReport = "docs/unified/reports/field-center-rk3568-operator-entry-latest.json"

$composeArgs = @(
  "-NoProfile",
  "-ExecutionPolicy", "Bypass",
  "-File", ".\scripts\dev\check-field-center-compose-acceptance.ps1",
  "-DeployMode", $CenterDeployMode,
  "-OutFile", "docs/unified/reports/field-center-compose-acceptance-latest.json"
)
if ($AllowUnsafeSecrets.IsPresent) {
  $composeArgs += "-AllowUnsafeSecrets"
}

$routineArgs = @(
  "-NoProfile",
  "-ExecutionPolicy", "Bypass",
  "-File", ".\scripts\dev\check-field-center-rk3568-routine-guard.ps1",
  "-OutFile", "docs/unified/reports/field-center-rk3568-routine-guard-latest.json"
)
if (-not [string]::IsNullOrWhiteSpace($BoardPassword)) {
  $routineArgs += @("-BoardPassword", $BoardPassword)
}
if ($AllowUnsafeSecrets.IsPresent) {
  $routineArgs += "-AllowUnsafeSecrets"
}
if ($RequireZeroSchemaRejectedDelta.IsPresent) {
  $routineArgs += "-RequireZeroSchemaRejectedDelta"
}

$liveClosureArgs = @(
  "-NoProfile",
  "-ExecutionPolicy", "Bypass",
  "-File", ".\scripts\dev\check-field-rk3568-center-live-closure.ps1",
  "-OutFile", "docs/unified/reports/field-rk3568-center-live-closure-latest.json"
)
if (-not [string]::IsNullOrWhiteSpace($BoardPassword)) {
  $liveClosureArgs += @("-BoardPassword", $BoardPassword)
}
if ($AllowUnsafeSecrets.IsPresent) {
  $liveClosureArgs += "-AllowUnsafeSecrets"
}
if ($RequireZeroSchemaRejectedDelta.IsPresent) {
  $liveClosureArgs += "-RequireZeroSchemaRejectedDelta"
}

Push-Location $repoRoot
try {
  $composeAcceptance = Invoke-JsonScriptWithFileFallback `
    -Label "Center compose acceptance" `
    -Args $composeArgs `
    -ReportPath $composeAcceptanceReport

  $routineGuard = Invoke-JsonScriptWithFileFallback `
    -Label "Field center RK3568 routine guard" `
    -Args $routineArgs `
    -ReportPath $routineGuardReport

  $liveClosure = Invoke-JsonScriptWithFileFallback `
    -Label "Field RK3568 center live closure" `
    -Args $liveClosureArgs `
    -ReportPath $liveClosureReport

  $checks = @(
    (Get-Check -Key "composeAcceptanceAccepted" -Ok:([bool]$composeAcceptance.accepted) -Actual ([bool]$composeAcceptance.accepted) -Expected $true),
    (Get-Check -Key "composeAcceptanceBoundary" -Ok:([string]$composeAcceptance.readiness.currentBoundary -eq "full-path-ready") -Actual ([string]$composeAcceptance.readiness.currentBoundary) -Expected "full-path-ready"),
    (Get-Check -Key "routineGuardAccepted" -Ok:([bool]$routineGuard.accepted) -Actual ([bool]$routineGuard.accepted) -Expected $true),
    (Get-Check -Key "routineGuardBoundary" -Ok:([string]$routineGuard.currentBoundary -eq "field-center-rk3568-routine-guard-ready") -Actual ([string]$routineGuard.currentBoundary) -Expected "field-center-rk3568-routine-guard-ready"),
    (Get-Check -Key "liveClosureAccepted" -Ok:([bool]$liveClosure.accepted) -Actual ([bool]$liveClosure.accepted) -Expected $true),
    (Get-Check -Key "liveClosureBoundary" -Ok:([string]$liveClosure.currentBoundary -eq "rk3568-live-center-closure-ready") -Actual ([string]$liveClosure.currentBoundary) -Expected "rk3568-live-center-closure-ready")
  )

  $accepted = (@($checks | Where-Object { -not $_.ok }).Count -eq 0)
  $failureKeys = @($checks | Where-Object { -not $_.ok } | ForEach-Object { $_.key })

  $report = [ordered]@{
    generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    accepted = $accepted
    mode = "field-center-rk3568-operator-entry"
    currentBoundary = if ($accepted) { "field-center-rk3568-operator-entry-ready" } else { "field-center-rk3568-operator-entry-needs-review" }
    scope = [ordered]@{
      target = "center-operator-mainline-entry"
      centerDeployMode = $CenterDeployMode
      strictZeroNoiseRequired = [bool]$RequireZeroSchemaRejectedDelta.IsPresent
      failureKeys = $failureKeys
    }
    composeAcceptance = [ordered]@{
      file = "docs/unified/reports/field-center-compose-acceptance-latest.json"
      generatedAt = [string]$composeAcceptance.generatedAt
      accepted = [bool]$composeAcceptance.accepted
      boundary = [string]$composeAcceptance.readiness.currentBoundary
      fullProofConclusion = [string]$composeAcceptance.fullProof.conclusion
    }
    liveClosure = [ordered]@{
      file = "docs/unified/reports/field-rk3568-center-live-closure-latest.json"
      generatedAt = [string]$liveClosure.generatedAt
      accepted = [bool]$liveClosure.accepted
      boundary = [string]$liveClosure.currentBoundary
      nodeStatuses = [ordered]@{
        nodeA = [string]$liveClosure.productionUplink.nodeStatuses.nodeA
        nodeB = [string]$liveClosure.productionUplink.nodeStatuses.nodeB
        nodeC = [string]$liveClosure.productionUplink.nodeStatuses.nodeC
      }
    }
    routineGuard = [ordered]@{
      file = "docs/unified/reports/field-center-rk3568-routine-guard-latest.json"
      generatedAt = [string]$routineGuard.generatedAt
      accepted = [bool]$routineGuard.accepted
      boundary = [string]$routineGuard.currentBoundary
      centerRuntimeFreezeBoundary = [string]$routineGuard.baselines.centerRuntimeFreeze.boundary
      networkBootstrapBoundary = [string]$routineGuard.baselines.rk3568NetworkBootstrap.boundary
      productionFreezeBoundary = [string]$routineGuard.baselines.rk3568ProductionUplinkFreeze.boundary
      operationalRecoveryBoundary = [string]$routineGuard.baselines.operationalRecovery.boundary
      phaseReadinessBoundary = [string]$routineGuard.baselines.phaseReadiness.boundary
      centerProductionHandoffBoundary = [string]$routineGuard.baselines.centerProductionHandoff.boundary
    }
    nextUse = @(
      "operator mainline entry: powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\check-field-center-rk3568-operator-entry.ps1 -BoardPassword <password> -AllowUnsafeSecrets",
      "strict operator mainline entry: powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\check-field-center-rk3568-operator-entry.ps1 -BoardPassword <password> -AllowUnsafeSecrets -RequireZeroSchemaRejectedDelta",
      "compose-only acceptance: powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\check-field-center-compose-acceptance.ps1 -DeployMode validate -AllowUnsafeSecrets",
      "routine guard: powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\check-field-center-rk3568-routine-guard.ps1 -BoardPassword <password> -AllowUnsafeSecrets"
    )
    checks = $checks
  }

  $json = $report | ConvertTo-Json -Depth 8
  Set-Content -LiteralPath $resolvedOutFile -Value $json -Encoding UTF8
  $json
} finally {
  Pop-Location
}
