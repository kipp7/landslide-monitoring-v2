[CmdletBinding()]
param(
  [string]$EnvTemplateFile = "infra/compose/env.prod.example",
  [string]$EnvFile = "infra/compose/.env",
  [string]$ComposeBaseFile = "infra/compose/docker-compose.yml",
  [string]$ComposeAppFile = "infra/compose/docker-compose.app.yml",
  [string]$RunbookFile = "docs/guides/runbooks/single-host-runbook.md",
  [string]$CenterComposeAcceptanceFile = "docs/unified/reports/field-center-compose-acceptance-latest.json",
  [string]$PhaseReadinessFile = "docs/unified/reports/field-center-deployment-software-adaptation-readiness-latest.json",
  [switch]$AllowUnsafeSecrets,
  [string]$OutFile = "docs/unified/reports/field-center-runtime-freeze-latest.json"
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

function Test-ServiceDeclared {
  param(
    [string]$ComposeText,
    [string]$ServiceName
  )

  return [regex]::IsMatch($ComposeText, "(?m)^\s{2}$([regex]::Escape($ServiceName)):")
}

function Test-TextContains {
  param(
    [string]$Text,
    [string]$Pattern
  )

  return $Text.Contains($Pattern)
}

$repoRoot = Resolve-RepoRoot
$resolvedOutFile = Resolve-RepoPath -RootPath $repoRoot -CandidatePath $OutFile
$resolvedComposeBaseFile = Resolve-RepoPath -RootPath $repoRoot -CandidatePath $ComposeBaseFile
$resolvedComposeAppFile = Resolve-RepoPath -RootPath $repoRoot -CandidatePath $ComposeAppFile
$resolvedRunbookFile = Resolve-RepoPath -RootPath $repoRoot -CandidatePath $RunbookFile
$resolvedCenterComposeAcceptanceFile = Resolve-RepoPath -RootPath $repoRoot -CandidatePath $CenterComposeAcceptanceFile
$resolvedPhaseReadinessFile = Resolve-RepoPath -RootPath $repoRoot -CandidatePath $PhaseReadinessFile

Push-Location $repoRoot
try {
  $envChecklistArgs = @(
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", ".\scripts\release\render-prod-env-checklist.ps1",
    "-EnvTemplateFile", $EnvTemplateFile,
    "-EnvFile", $EnvFile
  )

  $deployArgs = @(
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", ".\scripts\release\deploy-docker-oneclick.ps1",
    "-ValidateOnly"
  )
  if ($AllowUnsafeSecrets.IsPresent) {
    $deployArgs += "-AllowUnsafeSecrets"
  }

  $envChecklist = Invoke-JsonScript "Render prod env checklist" {
    powershell @envChecklistArgs
  }
  $deployValidate = Invoke-JsonScript "Docker one-click validate" {
    powershell @deployArgs
  }

  $centerComposeAcceptance = Read-JsonFile -Path $resolvedCenterComposeAcceptanceFile -Label "Center compose acceptance report"
  $phaseReadiness = Read-JsonFile -Path $resolvedPhaseReadinessFile -Label "Phase readiness report"
  $composeBaseText = Read-TextFile -Path $resolvedComposeBaseFile -Label "Compose base file"
  $composeAppText = Read-TextFile -Path $resolvedComposeAppFile -Label "Compose app file"
  $runbookText = Read-TextFile -Path $resolvedRunbookFile -Label "Runbook file"

  $checks = @(
    [pscustomobject]@{
      key = "envChecklistMissingZero"
      ok = ([int]$envChecklist.summary.missing -eq 0)
      actual = [int]$envChecklist.summary.missing
      expected = 0
    },
    [pscustomobject]@{
      key = "envChecklistPlaceholderZero"
      ok = ([int]$envChecklist.summary.placeholder -eq 0)
      actual = [int]$envChecklist.summary.placeholder
      expected = 0
    },
    [pscustomobject]@{
      key = "deployValidateNoErrors"
      ok = (@($deployValidate.errors).Count -eq 0)
      actual = @($deployValidate.errors).Count
      expected = 0
    },
    [pscustomobject]@{
      key = "deployValidateDockerFound"
      ok = [bool]$deployValidate.docker.commandFound
      actual = [bool]$deployValidate.docker.commandFound
      expected = $true
    },
    [pscustomobject]@{
      key = "baseComposeIncludesEmqx"
      ok = (Test-ServiceDeclared -ComposeText $composeBaseText -ServiceName "emqx")
      actual = (Test-ServiceDeclared -ComposeText $composeBaseText -ServiceName "emqx")
      expected = $true
    },
    [pscustomobject]@{
      key = "baseComposeIncludesKafka"
      ok = (Test-ServiceDeclared -ComposeText $composeBaseText -ServiceName "kafka")
      actual = (Test-ServiceDeclared -ComposeText $composeBaseText -ServiceName "kafka")
      expected = $true
    },
    [pscustomobject]@{
      key = "baseComposeIncludesPostgres"
      ok = (Test-ServiceDeclared -ComposeText $composeBaseText -ServiceName "postgres")
      actual = (Test-ServiceDeclared -ComposeText $composeBaseText -ServiceName "postgres")
      expected = $true
    },
    [pscustomobject]@{
      key = "baseComposeIncludesClickhouse"
      ok = (Test-ServiceDeclared -ComposeText $composeBaseText -ServiceName "clickhouse")
      actual = (Test-ServiceDeclared -ComposeText $composeBaseText -ServiceName "clickhouse")
      expected = $true
    },
    [pscustomobject]@{
      key = "appComposeIncludesApi"
      ok = (Test-ServiceDeclared -ComposeText $composeAppText -ServiceName "api")
      actual = (Test-ServiceDeclared -ComposeText $composeAppText -ServiceName "api")
      expected = $true
    },
    [pscustomobject]@{
      key = "appComposeIncludesWeb"
      ok = (Test-ServiceDeclared -ComposeText $composeAppText -ServiceName "web")
      actual = (Test-ServiceDeclared -ComposeText $composeAppText -ServiceName "web")
      expected = $true
    },
    [pscustomobject]@{
      key = "appComposeIncludesIngest"
      ok = (Test-ServiceDeclared -ComposeText $composeAppText -ServiceName "ingest")
      actual = (Test-ServiceDeclared -ComposeText $composeAppText -ServiceName "ingest")
      expected = $true
    },
    [pscustomobject]@{
      key = "appComposeIncludesTelemetryWriter"
      ok = (Test-ServiceDeclared -ComposeText $composeAppText -ServiceName "telemetry-writer")
      actual = (Test-ServiceDeclared -ComposeText $composeAppText -ServiceName "telemetry-writer")
      expected = $true
    },
    [pscustomobject]@{
      key = "centerComposeAcceptanceAccepted"
      ok = [bool]$centerComposeAcceptance.accepted
      actual = [bool]$centerComposeAcceptance.accepted
      expected = $true
    },
    [pscustomobject]@{
      key = "centerComposeAcceptanceBoundary"
      ok = ([string]$centerComposeAcceptance.readiness.currentBoundary -eq "full-path-ready")
      actual = [string]$centerComposeAcceptance.readiness.currentBoundary
      expected = "full-path-ready"
    },
    [pscustomobject]@{
      key = "phaseReadinessAccepted"
      ok = [bool]$phaseReadiness.accepted
      actual = [bool]$phaseReadiness.accepted
      expected = $true
    },
    [pscustomobject]@{
      key = "phaseReadinessBoundary"
      ok = ([string]$phaseReadiness.currentBoundary -eq "center-deployment-software-adaptation-ready")
      actual = [string]$phaseReadiness.currentBoundary
      expected = "center-deployment-software-adaptation-ready"
    },
    [pscustomobject]@{
      key = "runbookMentionsCenterAcceptance"
      ok = (Test-TextContains -Text $runbookText -Pattern "check-field-center-compose-acceptance.ps1")
      actual = (Test-TextContains -Text $runbookText -Pattern "check-field-center-compose-acceptance.ps1")
      expected = $true
    },
    [pscustomobject]@{
      key = "runbookMentionsOperationalRecovery"
      ok = (Test-TextContains -Text $runbookText -Pattern "check-field-rk3568-center-operational-recovery.ps1")
      actual = (Test-TextContains -Text $runbookText -Pattern "check-field-rk3568-center-operational-recovery.ps1")
      expected = $true
    }
  )

  $accepted = (@($checks | Where-Object { -not $_.ok }).Count -eq 0)
  $failedKeys = @($checks | Where-Object { -not $_.ok } | ForEach-Object { $_.key })

  $report = [ordered]@{
    generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    accepted = $accepted
    mode = "field-center-runtime-freeze"
    currentBoundary = if ($accepted) { "center-runtime-freeze-ready" } else { "center-runtime-freeze-needs-review" }
    freezeScope = [ordered]@{
      composeBoundary = @("emqx", "kafka", "postgres", "clickhouse", "api", "web", "ingest-service", "telemetry-writer")
      composeFiles = @(
        $ComposeBaseFile.Replace("\", "/"),
        $ComposeAppFile.Replace("\", "/")
      )
      envSources = @(
        $EnvTemplateFile.Replace("\", "/"),
        $EnvFile.Replace("\", "/")
      )
      recoveryOrder = @(
        "emqx -> kafka -> postgres -> clickhouse",
        "ingest-service -> telemetry-writer",
        "api -> web",
        "check-field-center-compose-acceptance.ps1",
        "check-field-rk3568-center-operational-recovery.ps1"
      )
      failureKeys = $failedKeys
    }
    baselines = [ordered]@{
      envChecklist = [ordered]@{
        report = "docs/unified/reports/prod-env-checklist-latest.json"
        generatedAt = [string]$envChecklist.summary.generatedAt
        missing = [int]$envChecklist.summary.missing
        placeholder = [int]$envChecklist.summary.placeholder
        configured = [int]$envChecklist.summary.configured
      }
      dockerValidate = [ordered]@{
        report = "docs/unified/reports/docker-deploy-latest.json"
        generatedAt = [string]$deployValidate.generatedAt
        validateOnly = [bool]$deployValidate.validateOnly
        errors = @($deployValidate.errors)
        warnings = @($deployValidate.warnings)
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
    nextUse = @(
      "refresh runtime freeze baseline: powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\check-field-center-runtime-freeze.ps1 -AllowUnsafeSecrets",
      "refresh center acceptance: powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\check-field-center-compose-acceptance.ps1 -DeployMode validate -AllowUnsafeSecrets",
      "refresh phase readiness: powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\check-field-center-deployment-software-adaptation-readiness.ps1"
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
} finally {
  Pop-Location
}
