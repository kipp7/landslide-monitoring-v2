[CmdletBinding()]
param(
  [string]$CenterProductionHandoffScript = "scripts/dev/prepare-field-center-production-handoff.ps1",
  [string]$DbApiLiveProofScript = "scripts/dev/check-field-center-db-api-live-proof.ps1",
  [string]$DeskLatestDeliveryScript = "scripts/dev/check-desk-win-latest-delivery.ps1",
  [string]$PlatformAcceptanceScript = "scripts/dev/check-field-platform-acceptance.ps1",
  [string]$Rk3568OperatorEntryFile = "docs/unified/reports/field-center-rk3568-operator-entry-latest.json",
  [string]$Rk3568ProductionUplinkFreezeFile = "docs/unified/reports/field-rk3568-production-uplink-freeze-latest.json",
  [string]$OutJsonFile = "docs/unified/reports/field-first-formal-deployment-readiness-latest.json",
  [string]$OutMdFile = "docs/unified/reports/field-first-formal-deployment-readiness-latest.md",
  [switch]$AllowUnsafeSecrets
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function New-Utf8NoBomEncoding {
  return New-Object System.Text.UTF8Encoding($false)
}

function Write-Utf8NoBomFile {
  param(
    [string]$Path,
    [string]$Value
  )

  [System.IO.File]::WriteAllText($Path, $Value, (New-Utf8NoBomEncoding))
}

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

$repoRoot = Resolve-RepoRoot
$resolvedCenterProductionHandoffScript = Resolve-RepoPath -RootPath $repoRoot -CandidatePath $CenterProductionHandoffScript
$resolvedDbApiLiveProofScript = Resolve-RepoPath -RootPath $repoRoot -CandidatePath $DbApiLiveProofScript
$resolvedDeskLatestDeliveryScript = Resolve-RepoPath -RootPath $repoRoot -CandidatePath $DeskLatestDeliveryScript
$resolvedPlatformAcceptanceScript = Resolve-RepoPath -RootPath $repoRoot -CandidatePath $PlatformAcceptanceScript
$resolvedRk3568OperatorEntryFile = Resolve-RepoPath -RootPath $repoRoot -CandidatePath $Rk3568OperatorEntryFile
$resolvedRk3568ProductionUplinkFreezeFile = Resolve-RepoPath -RootPath $repoRoot -CandidatePath $Rk3568ProductionUplinkFreezeFile
$resolvedOutJsonFile = Resolve-RepoPath -RootPath $repoRoot -CandidatePath $OutJsonFile
$resolvedOutMdFile = Resolve-RepoPath -RootPath $repoRoot -CandidatePath $OutMdFile

Push-Location $repoRoot
try {
  $centerProductionHandoffArgs = @(
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", $resolvedCenterProductionHandoffScript
  )
  if ($AllowUnsafeSecrets.IsPresent) {
    $centerProductionHandoffArgs += "-AllowUnsafeSecrets"
  }

  $centerProductionHandoff = Invoke-JsonScript "Refresh center production handoff" {
    powershell @centerProductionHandoffArgs
  }

  $dbApiLiveProof = Invoke-JsonScript "Refresh DB/API live proof" {
    powershell -NoProfile -ExecutionPolicy Bypass -File $resolvedDbApiLiveProofScript
  }

  $deskLatestDelivery = Invoke-JsonScript "Refresh desk latest delivery" {
    powershell -NoProfile -ExecutionPolicy Bypass -File $resolvedDeskLatestDeliveryScript
  }

  $platformAcceptance = Invoke-JsonScript "Refresh field platform acceptance" {
    powershell -NoProfile -ExecutionPolicy Bypass -File $resolvedPlatformAcceptanceScript
  }

  $rk3568OperatorEntry = Read-JsonFile -Path $resolvedRk3568OperatorEntryFile -Label "RK3568 operator entry report"
  $rk3568ProductionFreeze = Read-JsonFile -Path $resolvedRk3568ProductionUplinkFreezeFile -Label "RK3568 production uplink freeze report"

  $platformSummary = $platformAcceptance.summary
  $platformChecksPassed = ([int]$platformSummary.failedChecks -eq 0)
  $deskLatestDirectory = if ($deskLatestDelivery.latest -and $deskLatestDelivery.latest.directory) { [string]$deskLatestDelivery.latest.directory } else { "" }
  $deskLatestZip = if ($deskLatestDelivery.latest -and $deskLatestDelivery.latest.zip) { [string]$deskLatestDelivery.latest.zip } else { "" }
  $rkNodeStatuses = $rk3568ProductionFreeze.runtime.nodeStatuses
  $deferredNodeIds = @()
  if ($rk3568ProductionFreeze.frozenUplink -and $rk3568ProductionFreeze.frozenUplink.southboundNodes) {
    foreach ($node in @($rk3568ProductionFreeze.frozenUplink.southboundNodes)) {
      $fieldNodeId = [string]$node.fieldNodeId
      $statusKey = "node" + $fieldNodeId
      $status = if ($rkNodeStatuses.PSObject.Properties.Name -contains $statusKey) { [string]$rkNodeStatuses.$statusKey } else { "" }
      if ($status -eq "configured") {
        $deferredNodeIds += $fieldNodeId
      }
    }
  }

  $checks = @(
    (Get-Check -Key "centerProductionHandoffAccepted" -Ok:([bool]$centerProductionHandoff.accepted) -Actual ([bool]$centerProductionHandoff.accepted) -Expected $true),
    (Get-Check -Key "dbApiOperationallyReady" -Ok:([bool]$dbApiLiveProof.operationallyReady) -Actual ([bool]$dbApiLiveProof.operationallyReady) -Expected $true),
    (Get-Check -Key "deskLatestDeliveryReady" -Ok:([bool]$deskLatestDelivery.ready) -Actual ([bool]$deskLatestDelivery.ready) -Expected $true),
    (Get-Check -Key "platformAcceptancePassed" -Ok:$platformChecksPassed -Actual ([int]$platformSummary.failedChecks) -Expected 0),
    (Get-Check -Key "rk3568OperatorEntryAccepted" -Ok:([bool]$rk3568OperatorEntry.accepted) -Actual ([bool]$rk3568OperatorEntry.accepted) -Expected $true),
    (Get-Check -Key "rk3568MqttConnected" -Ok:([bool]$rk3568ProductionFreeze.runtime.mqttConnected) -Actual ([bool]$rk3568ProductionFreeze.runtime.mqttConnected) -Expected $true),
    (Get-Check -Key "rk3568SerialOpen" -Ok:([bool]$rk3568ProductionFreeze.runtime.serialOpen) -Actual ([bool]$rk3568ProductionFreeze.runtime.serialOpen) -Expected $true),
    (Get-Check -Key "rk3568ABOnline" -Ok:(([string]$rkNodeStatuses.nodeA -eq "online") -and ([string]$rkNodeStatuses.nodeB -eq "online")) -Actual ("A={0},B={1}" -f [string]$rkNodeStatuses.nodeA, [string]$rkNodeStatuses.nodeB) -Expected "A=online,B=online")
  )

  $accepted = (@($checks | Where-Object { -not $_.ok }).Count -eq 0)
  $result = [ordered]@{
    generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    accepted = $accepted
    mode = "field-first-formal-deployment-readiness"
    currentBoundary = if ($accepted) { "field-first-formal-deployment-ready" } else { "field-first-formal-deployment-needs-review" }
    deploymentDecision = [ordered]@{
      recommended = if ($accepted) { "proceed-to-server-deployment" } else { "hold-and-fix" }
      scope = "docker-center-first-formal-deployment"
      note = "node C may remain explicitly deferred while A/B online and center/API/Web/desk delivery are green"
    }
    upstream = [ordered]@{
      centerProductionHandoff = [ordered]@{
        file = "docs/unified/reports/field-center-production-handoff-latest.json"
        accepted = [bool]$centerProductionHandoff.accepted
        boundary = [string]$centerProductionHandoff.currentBoundary
        runbook = [string]$centerProductionHandoff.handoff.primaryRunbook
      }
      dbApiLiveProof = [ordered]@{
        file = "docs/unified/reports/field-center-db-api-live-proof-latest.json"
        accepted = [bool]$dbApiLiveProof.accepted
        operationallyReady = [bool]$dbApiLiveProof.operationallyReady
        boundary = [string]$dbApiLiveProof.currentBoundary
        operationalBoundary = [string]$dbApiLiveProof.operationalBoundary
      }
      deskLatestDelivery = [ordered]@{
        file = "docs/unified/reports/desk-win-latest-delivery-latest.json"
        ready = [bool]$deskLatestDelivery.ready
        latestDir = $deskLatestDirectory
        latestZip = $deskLatestZip
      }
      rk3568OperatorEntry = [ordered]@{
        file = $Rk3568OperatorEntryFile.Replace("\", "/")
        accepted = [bool]$rk3568OperatorEntry.accepted
        boundary = [string]$rk3568OperatorEntry.currentBoundary
        nodeStatuses = [ordered]@{
          nodeA = [string]$rk3568OperatorEntry.liveClosure.nodeStatuses.nodeA
          nodeB = [string]$rk3568OperatorEntry.liveClosure.nodeStatuses.nodeB
          nodeC = [string]$rk3568OperatorEntry.liveClosure.nodeStatuses.nodeC
        }
      }
      platformAcceptance = [ordered]@{
        baseUrl = [string]$platformSummary.baseUrl
        totalChecks = [int]$platformSummary.totalChecks
        okChecks = [int]$platformSummary.okChecks
        failedChecks = [int]$platformSummary.failedChecks
      }
      rk3568ProductionUplink = [ordered]@{
        file = $Rk3568ProductionUplinkFreezeFile.Replace("\", "/")
        accepted = [bool]$rk3568ProductionFreeze.accepted
        boundary = [string]$rk3568ProductionFreeze.currentBoundary
        mqttConnected = [bool]$rk3568ProductionFreeze.runtime.mqttConnected
        serialOpen = [bool]$rk3568ProductionFreeze.runtime.serialOpen
        nodeStatuses = $rkNodeStatuses
        deferredNodeIds = @($deferredNodeIds)
      }
    }
    serverDeployment = [ordered]@{
      standardCommands = [ordered]@{
        envChecklist = "powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\release\render-prod-env-checklist.ps1"
        validate = "powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\check-field-center-compose-acceptance.ps1 -DeployMode validate -AllowUnsafeSecrets"
        apply = "powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\check-field-center-compose-acceptance.ps1 -DeployMode apply -AllowUnsafeSecrets"
        rk3568Recovery = "powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\check-field-rk3568-center-operational-recovery.ps1 -BoardPassword <password> -AllowUnsafeSecrets"
      }
      frozenComposeBoundary = @($centerProductionHandoff.handoff.composeBoundary | ForEach-Object { [string]$_ })
      mandatoryArtifacts = @($centerProductionHandoff.handoff.mandatoryFiles | ForEach-Object { [string]$_ })
    }
    checks = $checks
    nextUse = @(
      "prepare first formal deployment packet: powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\prepare-field-first-formal-deployment.ps1 -AllowUnsafeSecrets",
      "validate docker server before rollout: powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\check-field-center-compose-acceptance.ps1 -DeployMode validate -AllowUnsafeSecrets",
      "apply docker server rollout: powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\check-field-center-compose-acceptance.ps1 -DeployMode apply -AllowUnsafeSecrets",
      "recover RK3568 after server rollout: powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\check-field-rk3568-center-operational-recovery.ps1 -BoardPassword <password> -AllowUnsafeSecrets"
    )
  }

  $jsonDir = Split-Path -Parent $resolvedOutJsonFile
  if ($jsonDir -and -not (Test-Path -LiteralPath $jsonDir)) {
    New-Item -ItemType Directory -Path $jsonDir -Force | Out-Null
  }
  $json = $result | ConvertTo-Json -Depth 10
  Write-Utf8NoBomFile -Path $resolvedOutJsonFile -Value $json

  $lines = @(
    "# Field First Formal Deployment Readiness",
    "",
    "- generatedAt: ``$($result.generatedAt)``",
    "- accepted: ``$($result.accepted.ToString().ToLower())``",
    "- currentBoundary: ``$($result.currentBoundary)``",
    "- decision: ``$($result.deploymentDecision.recommended)``",
    "",
    "## Current Truth",
    "",
    "- center handoff accepted: ``$([string]$centerProductionHandoff.accepted).ToLower()``",
    "- db/api operationally ready: ``$([string]$dbApiLiveProof.operationallyReady).ToLower()``",
    "- desk latest delivery ready: ``$([string]$deskLatestDelivery.ready).ToLower()``",
    "- rk3568 operator entry accepted: ``$([string]$rk3568OperatorEntry.accepted).ToLower()``",
    "- platform acceptance failedChecks: ``$([int]$platformSummary.failedChecks)``",
    "- rk3568 node statuses: ``A=$([string]$rkNodeStatuses.nodeA),B=$([string]$rkNodeStatuses.nodeB),C=$([string]$rkNodeStatuses.nodeC)``",
    "- deferred nodes: ``$((@($deferredNodeIds) -join ','))``",
    "",
    "## Standard Commands",
    "",
    "- env checklist: ``$($result.serverDeployment.standardCommands.envChecklist)``",
    "- validate: ``$($result.serverDeployment.standardCommands.validate)``",
    "- apply: ``$($result.serverDeployment.standardCommands.apply)``",
    "- rk3568 recovery: ``$($result.serverDeployment.standardCommands.rk3568Recovery)``",
    "",
    "## Mandatory Artifacts",
    ""
  )

  foreach ($artifact in @($result.serverDeployment.mandatoryArtifacts)) {
    $lines += "- ``$artifact``"
  }

  $mdDir = Split-Path -Parent $resolvedOutMdFile
  if ($mdDir -and -not (Test-Path -LiteralPath $mdDir)) {
    New-Item -ItemType Directory -Path $mdDir -Force | Out-Null
  }
  Write-Utf8NoBomFile -Path $resolvedOutMdFile -Value ($lines -join [Environment]::NewLine)

  $json
} finally {
  Pop-Location
}
