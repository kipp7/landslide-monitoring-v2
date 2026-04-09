[CmdletBinding()]
param(
  [string]$RuntimeFreezeScript = "scripts/dev/check-field-center-runtime-freeze.ps1",
  [string]$CenterComposeAcceptanceFile = "docs/unified/reports/field-center-compose-acceptance-latest.json",
  [string]$PhaseReadinessFile = "docs/unified/reports/field-center-deployment-software-adaptation-readiness-latest.json",
  [string]$RunbookFile = "docs/guides/runbooks/single-host-runbook.md",
  [string]$OutJsonFile = "docs/unified/reports/field-center-production-handoff-latest.json",
  [string]$OutMdFile = "docs/unified/reports/field-center-production-handoff-latest.md",
  [switch]$AllowUnsafeSecrets
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

function Read-TextFile {
  param(
    [string]$Path,
    [string]$Label
  )

  if (-not (Test-Path -LiteralPath $Path)) {
    throw "$Label not found: $Path"
  }

  return Get-Content -LiteralPath $Path -Raw -Encoding UTF8
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

  $trimmed = $output.Trim()
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

function Test-TextContains {
  param(
    [string]$Text,
    [string]$Pattern
  )

  return $Text.Contains($Pattern)
}

$repoRoot = Resolve-RepoRoot
$resolvedRuntimeFreezeScript = Resolve-RepoPath -RootPath $repoRoot -CandidatePath $RuntimeFreezeScript
$resolvedCenterComposeAcceptanceFile = Resolve-RepoPath -RootPath $repoRoot -CandidatePath $CenterComposeAcceptanceFile
$resolvedPhaseReadinessFile = Resolve-RepoPath -RootPath $repoRoot -CandidatePath $PhaseReadinessFile
$resolvedRunbookFile = Resolve-RepoPath -RootPath $repoRoot -CandidatePath $RunbookFile
$resolvedOutJsonFile = Resolve-RepoPath -RootPath $repoRoot -CandidatePath $OutJsonFile
$resolvedOutMdFile = Resolve-RepoPath -RootPath $repoRoot -CandidatePath $OutMdFile

Push-Location $repoRoot
try {
  $runtimeFreezeArgs = @(
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", $resolvedRuntimeFreezeScript
  )
  if ($AllowUnsafeSecrets.IsPresent) {
    $runtimeFreezeArgs += "-AllowUnsafeSecrets"
  }

  $runtimeFreeze = Invoke-JsonScript "Refresh center runtime freeze" {
    powershell @runtimeFreezeArgs
  }

  $centerComposeAcceptance = Read-JsonFile -Path $resolvedCenterComposeAcceptanceFile -Label "Center compose acceptance report"
  $phaseReadiness = Read-JsonFile -Path $resolvedPhaseReadinessFile -Label "Phase readiness report"
  $runbookText = Read-TextFile -Path $resolvedRunbookFile -Label "Single-host runbook"

  $envChecklistFile = Resolve-RepoPath -RootPath $repoRoot -CandidatePath ([string]$runtimeFreeze.baselines.envChecklist.report)
  $dockerValidateFile = Resolve-RepoPath -RootPath $repoRoot -CandidatePath ([string]$runtimeFreeze.baselines.dockerValidate.report)
  $envChecklist = Read-JsonFile -Path $envChecklistFile -Label "Prod env checklist report"
  $dockerValidate = Read-JsonFile -Path $dockerValidateFile -Label "Docker deploy report"

  $composeBoundary = @($runtimeFreeze.freezeScope.composeBoundary | ForEach-Object { [string]$_ })
  $recoveryOrder = @($runtimeFreeze.freezeScope.recoveryOrder | ForEach-Object { [string]$_ })
  $mandatoryFiles = @(
    "docs/guides/runbooks/single-host-runbook.md",
    "docs/unified/reports/field-center-runtime-freeze-latest.json",
    "docs/unified/reports/field-center-compose-acceptance-latest.json",
    "docs/unified/reports/field-center-deployment-software-adaptation-readiness-latest.json",
    "docs/unified/reports/prod-env-checklist-latest.json",
    "docs/unified/reports/docker-deploy-latest.json"
  )

  $checks = @(
    (Get-Check -Key "centerRuntimeFreezeAccepted" -Ok:([bool]$runtimeFreeze.accepted) -Actual ([bool]$runtimeFreeze.accepted) -Expected $true),
    (Get-Check -Key "centerRuntimeFreezeBoundary" -Ok:([string]$runtimeFreeze.currentBoundary -eq "center-runtime-freeze-ready") -Actual ([string]$runtimeFreeze.currentBoundary) -Expected "center-runtime-freeze-ready"),
    (Get-Check -Key "centerComposeAcceptanceAccepted" -Ok:([bool]$centerComposeAcceptance.accepted) -Actual ([bool]$centerComposeAcceptance.accepted) -Expected $true),
    (Get-Check -Key "centerComposeAcceptanceBoundary" -Ok:([string]$centerComposeAcceptance.readiness.currentBoundary -eq "full-path-ready") -Actual ([string]$centerComposeAcceptance.readiness.currentBoundary) -Expected "full-path-ready"),
    (Get-Check -Key "phaseReadinessAccepted" -Ok:([bool]$phaseReadiness.accepted) -Actual ([bool]$phaseReadiness.accepted) -Expected $true),
    (Get-Check -Key "phaseReadinessBoundary" -Ok:([string]$phaseReadiness.currentBoundary -eq "center-deployment-software-adaptation-ready") -Actual ([string]$phaseReadiness.currentBoundary) -Expected "center-deployment-software-adaptation-ready"),
    (Get-Check -Key "envChecklistMissingZero" -Ok:([int]$envChecklist.summary.missing -eq 0) -Actual ([int]$envChecklist.summary.missing) -Expected 0),
    (Get-Check -Key "envChecklistPlaceholderZero" -Ok:([int]$envChecklist.summary.placeholder -eq 0) -Actual ([int]$envChecklist.summary.placeholder) -Expected 0),
    (Get-Check -Key "dockerValidateNoErrors" -Ok:(@($dockerValidate.errors).Count -eq 0) -Actual (@($dockerValidate.errors).Count) -Expected 0),
    (Get-Check -Key "composeBoundaryStable" -Ok:($composeBoundary.Count -eq 8) -Actual ($composeBoundary.Count) -Expected 8),
    (Get-Check -Key "recoveryOrderStable" -Ok:($recoveryOrder.Count -ge 5) -Actual ($recoveryOrder.Count) -Expected ">=5"),
    (Get-Check -Key "runbookMentionsRuntimeFreeze" -Ok:(Test-TextContains -Text $runbookText -Pattern "check-field-center-runtime-freeze.ps1") -Actual (Test-TextContains -Text $runbookText -Pattern "check-field-center-runtime-freeze.ps1") -Expected $true),
    (Get-Check -Key "runbookMentionsComposeAcceptance" -Ok:(Test-TextContains -Text $runbookText -Pattern "check-field-center-compose-acceptance.ps1") -Actual (Test-TextContains -Text $runbookText -Pattern "check-field-center-compose-acceptance.ps1") -Expected $true),
    (Get-Check -Key "runbookMentionsOperationalRecovery" -Ok:(Test-TextContains -Text $runbookText -Pattern "check-field-rk3568-center-operational-recovery.ps1") -Actual (Test-TextContains -Text $runbookText -Pattern "check-field-rk3568-center-operational-recovery.ps1") -Expected $true)
  )

  $accepted = (@($checks | Where-Object { -not $_.ok }).Count -eq 0)
  $failedKeys = @($checks | Where-Object { -not $_.ok } | ForEach-Object { $_.key })

  $result = [ordered]@{
    generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    accepted = $accepted
    mode = "field-center-production-handoff"
    currentBoundary = if ($accepted) { "center-production-handoff-ready" } else { "center-production-handoff-needs-review" }
    upstreamBaselines = [ordered]@{
      centerRuntimeFreeze = [ordered]@{
        file = "docs/unified/reports/field-center-runtime-freeze-latest.json"
        generatedAt = [string]$runtimeFreeze.generatedAt
        accepted = [bool]$runtimeFreeze.accepted
        boundary = [string]$runtimeFreeze.currentBoundary
      }
      centerComposeAcceptance = [ordered]@{
        file = $CenterComposeAcceptanceFile.Replace("\", "/")
        generatedAt = [string]$centerComposeAcceptance.generatedAt
        accepted = [bool]$centerComposeAcceptance.accepted
        boundary = [string]$centerComposeAcceptance.readiness.currentBoundary
      }
      phaseReadiness = [ordered]@{
        file = $PhaseReadinessFile.Replace("\", "/")
        generatedAt = [string]$phaseReadiness.generatedAt
        accepted = [bool]$phaseReadiness.accepted
        boundary = [string]$phaseReadiness.currentBoundary
      }
    }
    handoff = [ordered]@{
      primaryRunbook = $RunbookFile.Replace("\", "/")
      validateCommand = "powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\check-field-center-compose-acceptance.ps1 -DeployMode validate -AllowUnsafeSecrets"
      applyCommand = "powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\check-field-center-compose-acceptance.ps1 -DeployMode apply -AllowUnsafeSecrets"
      freezeRefreshCommand = "powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\check-field-center-runtime-freeze.ps1 -AllowUnsafeSecrets"
      handoffRefreshCommand = "powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\prepare-field-center-production-handoff.ps1 -AllowUnsafeSecrets"
      composeBoundary = $composeBoundary
      recoveryOrder = $recoveryOrder
      mandatoryFiles = $mandatoryFiles
      envSummary = [ordered]@{
        configured = [int]$envChecklist.summary.configured
        missing = [int]$envChecklist.summary.missing
        placeholder = [int]$envChecklist.summary.placeholder
        emptyOptional = [int]$envChecklist.summary.emptyOptional
      }
      deploymentFacts = [ordered]@{
        dockerCommandFound = [bool]$dockerValidate.docker.commandFound
        validateOnly = [bool]$dockerValidate.validateOnly
        dockerErrors = @($dockerValidate.errors)
        dockerWarnings = @($dockerValidate.warnings)
      }
      failureKeys = $failedKeys
    }
    nextUse = @(
      "refresh center handoff packet: powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\prepare-field-center-production-handoff.ps1 -AllowUnsafeSecrets",
      "refresh center runtime freeze: powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\check-field-center-runtime-freeze.ps1 -AllowUnsafeSecrets",
      "routine acceptance: powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\check-field-center-compose-acceptance.ps1 -DeployMode validate -AllowUnsafeSecrets",
      "full redeploy + acceptance: powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\check-field-center-compose-acceptance.ps1 -DeployMode apply -AllowUnsafeSecrets"
    )
    checks = $checks
  }

  $jsonDir = Split-Path -Parent $resolvedOutJsonFile
  if ($jsonDir -and -not (Test-Path -LiteralPath $jsonDir)) {
    New-Item -ItemType Directory -Path $jsonDir -Force | Out-Null
  }

  $json = $result | ConvertTo-Json -Depth 8
  Set-Content -LiteralPath $resolvedOutJsonFile -Value $json -Encoding UTF8

  $mdLines = @(
    "# Field Center Production Handoff",
    "",
    "> 目标：把当前中心部署线收敛成可交接、可复跑、可恢复的一页式说明。",
    "",
    "## 当前边界",
    "",
    "- generatedAt: ``$($result.generatedAt)``",
    "- accepted: ``$($result.accepted.ToString().ToLower())``",
    "- currentBoundary: ``$($result.currentBoundary)``",
    "- primaryRunbook: ``$($result.handoff.primaryRunbook)``",
    "",
    "## 固定 compose 边界",
    ""
  )

  foreach ($service in $composeBoundary) {
    $mdLines += "- ``$service``"
  }

  $mdLines += @(
    "",
    "## 标准命令",
    "",
    "- refresh handoff packet: ``$($result.handoff.handoffRefreshCommand)``",
    "- refresh freeze baseline: ``$($result.handoff.freezeRefreshCommand)``",
    "- routine acceptance: ``$($result.handoff.validateCommand)``",
    "- full redeploy + acceptance: ``$($result.handoff.applyCommand)``",
    "",
    "## 恢复顺序",
    ""
  )

  foreach ($step in $recoveryOrder) {
    $mdLines += "- ``$step``"
  }

  $mdLines += @(
    "",
    "## 必带物料",
    ""
  )

  foreach ($item in $mandatoryFiles) {
    $mdLines += "- ``$item``"
  }

  $mdLines += ""
  $mdLines += "## Env Summary"
  $mdLines += ""
  $mdLines += ('- configured: ``{0}``' -f $result.handoff.envSummary.configured)
  $mdLines += ('- missing: ``{0}``' -f $result.handoff.envSummary.missing)
  $mdLines += ('- placeholder: ``{0}``' -f $result.handoff.envSummary.placeholder)
  $mdLines += ('- emptyOptional: ``{0}``' -f $result.handoff.envSummary.emptyOptional)
  $mdLines += ""
  $mdLines += "## Current Conclusion"
  $mdLines += ""
  $mdLines += "- Current handoff boundary is the combined green line of ``center-runtime-freeze-ready``, ``full-path-ready``, and ``center-deployment-software-adaptation-ready``."
  $mdLines += "- No protocol scope needs to be reopened here; use the existing runbook, freeze, and acceptance entrypoints."
  $mdLines += "- ``node C`` remains a reserved config and capacity slot and does not block center deployment handoff."
  $mdLines += ""

  $mdDir = Split-Path -Parent $resolvedOutMdFile
  if ($mdDir -and -not (Test-Path -LiteralPath $mdDir)) {
    New-Item -ItemType Directory -Path $mdDir -Force | Out-Null
  }
  Set-Content -LiteralPath $resolvedOutMdFile -Value ($mdLines -join [Environment]::NewLine) -Encoding UTF8

  $json
}
finally {
  Pop-Location
}
