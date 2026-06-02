param(
  [string]$BaseUrl = "http://127.0.0.1:8081",
  [string]$OutFile = "docs/unified/reports/desk-mainline-proof-latest.json",
  [string]$SummaryOutFile = "docs/unified/reports/desk-mainline-proof-summary-latest.md",
  [string]$HistoryDir = "docs/unified/reports/history",
  [string]$HistoryIndexOutFile = "docs/unified/reports/desk-mainline-proof-history-latest.md",
  [string]$DiffOutFile = "docs/unified/reports/desk-mainline-proof-diff-latest.json",
  [string]$ManifestOutFile = "docs/unified/reports/desk-mainline-proof-manifest-latest.json",
  [int]$MaxHistorySnapshots = 20,
  [switch]$IncludeSeedDemo,
  [switch]$ForceGpsProfileStress,
  [switch]$IncludeCommandPaginationStress,
  [switch]$IncludePaginationStress,
  [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$fullOutFile = Join-Path $repoRoot $OutFile
$fullSummaryOutFile = Join-Path $repoRoot $SummaryOutFile
$fullHistoryDir = Join-Path $repoRoot $HistoryDir
$fullHistoryIndexOutFile = Join-Path $repoRoot $HistoryIndexOutFile
$fullDiffOutFile = Join-Path $repoRoot $DiffOutFile
$fullManifestOutFile = Join-Path $repoRoot $ManifestOutFile

function Invoke-Step([string]$label, [scriptblock]$action) {
  Write-Host "==> $label" -ForegroundColor Cyan
  & $action
  if ($LASTEXITCODE -ne 0) {
    throw "$label failed (exit=$LASTEXITCODE)"
  }
}

function Invoke-JsonStep([string]$label, [scriptblock]$action) {
  Write-Host "==> $label" -ForegroundColor Cyan
  $output = & $action | Out-String
  if ($LASTEXITCODE -ne 0) {
    throw "$label failed (exit=$LASTEXITCODE)"
  }
  $trimmed = $output.Trim()
  if (-not $trimmed) {
    throw "$label returned empty output"
  }
  return $trimmed | ConvertFrom-Json
}

if ($IncludeSeedDemo) {
  Invoke-Step "Seed demo truth" {
    powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repoRoot "infra/compose/scripts/seed-demo.ps1")
  }
}

Invoke-Step "Restart local api service" {
  powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repoRoot "scripts/dev/restart-local-api-service.ps1") -SkipBuild
}

$health = Invoke-JsonStep "API health" {
  Invoke-WebRequest "$BaseUrl/health" -UseBasicParsing | Select-Object -ExpandProperty Content
}

if (-not $SkipBuild) {
  Invoke-Step "Desk build" {
    npm -w apps/desk run build
  }
}

$v1Core = Invoke-JsonStep "Desk v1 core proof" {
  powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repoRoot "scripts/dev/check-desk-http-v1-core.ps1")
}

$gpsProfileStressDeviceCount = [int]$v1Core.baselines.count
$includeGpsProfileStress = $ForceGpsProfileStress.IsPresent -or $gpsProfileStressDeviceCount -ge 3
$gpsProfileStressReason =
  "gps profile stress proofs require 3 baseline-backed devices; current runtime has $gpsProfileStressDeviceCount"

function New-SkippedGpsProfileProof([string]$rootProperty, [string]$reason) {
  $inner = [pscustomobject]@{
    skipped = $true
    reason = $reason
    profileCount = 0
    boardExecutionAlignmentStable = $null
    responseOrderingStable = $null
    escalationCoverageStable = $null
  }
  $wrapper = [pscustomobject]@{}
  $wrapper | Add-Member -NotePropertyName $rootProperty -NotePropertyValue $inner
  return $wrapper
}

$clientProof = Invoke-JsonStep "Desk client proof" {
  powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repoRoot "scripts/dev/check-desk-http-client.ps1")
}

$settingsActions = Invoke-JsonStep "Desk settings actions proof" {
  powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repoRoot "scripts/dev/check-desk-settings-actions.ps1")
}

$devicesPageActions = Invoke-JsonStep "Desk devices page actions proof" {
  powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repoRoot "scripts/dev/check-desk-devices-page-actions.ps1")
}

$stationsPageActions = Invoke-JsonStep "Desk stations page actions proof" {
  powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repoRoot "scripts/dev/check-desk-stations-page-actions.ps1")
}

$stationManagementPanel = Invoke-JsonStep "Desk station management panel proof" {
  powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repoRoot "scripts/dev/check-desk-station-management-panel.ps1")
}

$homeActions = Invoke-JsonStep "Desk home actions proof" {
  powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repoRoot "scripts/dev/check-desk-home-actions.ps1")
}

$analysisPageActions = Invoke-JsonStep "Desk analysis page proof" {
  powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repoRoot "scripts/dev/check-desk-analysis-page-actions.ps1")
}

$systemPageActions = Invoke-JsonStep "Desk system page proof" {
  powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repoRoot "scripts/dev/check-desk-system-page-actions.ps1")
}

$gpsMonitoringPage = Invoke-JsonStep "Desk GPS monitoring page proof" {
  powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repoRoot "scripts/dev/check-desk-gps-monitoring-page.ps1")
}

$gpsMonitoringExport = Invoke-JsonStep "Desk GPS monitoring export proof" {
  powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repoRoot "scripts/dev/check-desk-gps-monitoring-export.ps1")
}

$gpsThresholdConfig = Invoke-JsonStep "Desk GPS threshold config proof" {
  powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repoRoot "scripts/dev/check-desk-gps-threshold-config.ps1")
}

$gpsDataLimitConfig = Invoke-JsonStep "Desk GPS data limit config proof" {
  powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repoRoot "scripts/dev/check-desk-gps-data-limit-config.ps1")
}

$gpsV1AnalysisContract = Invoke-JsonStep "Desk GPS v1 analysis contract proof" {
  powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repoRoot "scripts/dev/check-desk-gps-v1-analysis-contract.ps1")
}

if ($includeGpsProfileStress) {
  $gpsSampleLibrary = Invoke-JsonStep "Desk GPS sample library proof" {
    powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repoRoot "scripts/dev/check-desk-gps-sample-library.ps1")
  }

  $gpsProfileEvaluation = Invoke-JsonStep "Desk GPS profile evaluation proof" {
    powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repoRoot "scripts/dev/check-desk-gps-profile-evaluation.ps1")
  }

  $gpsProfileBacktest = Invoke-JsonStep "Desk GPS profile backtest proof" {
    powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repoRoot "scripts/dev/check-desk-gps-profile-backtest.ps1")
  }

  $gpsProfileErrorDecomposition = Invoke-JsonStep "Desk GPS profile error decomposition proof" {
    powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repoRoot "scripts/dev/check-desk-gps-profile-error-decomposition.ps1")
  }

  $gpsProfileAlertSensitivity = Invoke-JsonStep "Desk GPS profile alert sensitivity proof" {
    powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repoRoot "scripts/dev/check-desk-gps-profile-alert-sensitivity.ps1")
  }

  $gpsThresholdPrecision = Invoke-JsonStep "Desk GPS threshold precision proof" {
    powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repoRoot "scripts/dev/check-desk-gps-threshold-precision.ps1")
  }

  $gpsThresholdErrorRates = Invoke-JsonStep "Desk GPS threshold error rates proof" {
    powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repoRoot "scripts/dev/check-desk-gps-threshold-error-rates.ps1")
  }

  $gpsThresholdHorizonMatrix = Invoke-JsonStep "Desk GPS threshold horizon matrix proof" {
    powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repoRoot "scripts/dev/check-desk-gps-threshold-horizon-matrix.ps1")
  }

  $gpsThresholdHorizonErrorMatrix = Invoke-JsonStep "Desk GPS threshold horizon error matrix proof" {
    powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repoRoot "scripts/dev/check-desk-gps-threshold-horizon-error-matrix.ps1")
  }

  $gpsThresholdGovernanceMatrix = Invoke-JsonStep "Desk GPS threshold governance matrix proof" {
    powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repoRoot "scripts/dev/check-desk-gps-threshold-governance-matrix.ps1")
  }

  $gpsThresholdFullMatrix = Invoke-JsonStep "Desk GPS threshold full matrix proof" {
    powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repoRoot "scripts/dev/check-desk-gps-threshold-full-matrix.ps1")
  }

  $gpsThresholdScorecard = Invoke-JsonStep "Desk GPS threshold scorecard proof" {
    powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repoRoot "scripts/dev/check-desk-gps-threshold-scorecard.ps1")
  }

  $gpsThresholdRanking = Invoke-JsonStep "Desk GPS threshold ranking proof" {
    powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repoRoot "scripts/dev/check-desk-gps-threshold-ranking.ps1")
  }

  $gpsThresholdPolicyBoard = Invoke-JsonStep "Desk GPS threshold policy board proof" {
    powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repoRoot "scripts/dev/check-desk-gps-threshold-policy-board.ps1")
  }

  $gpsThresholdExecutionMatrix = Invoke-JsonStep "Desk GPS threshold execution matrix proof" {
    powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repoRoot "scripts/dev/check-desk-gps-threshold-execution-matrix.ps1")
  }

  $gpsThresholdRunbook = Invoke-JsonStep "Desk GPS threshold runbook proof" {
    powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repoRoot "scripts/dev/check-desk-gps-threshold-runbook.ps1")
  }

  $gpsThresholdSlaMatrix = Invoke-JsonStep "Desk GPS threshold SLA matrix proof" {
    powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repoRoot "scripts/dev/check-desk-gps-threshold-sla-matrix.ps1")
  }

  $gpsThresholdOperatingModel = Invoke-JsonStep "Desk GPS threshold operating model proof" {
    powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repoRoot "scripts/dev/check-desk-gps-threshold-operating-model.ps1")
  }
} else {
  $gpsSampleLibrary = New-SkippedGpsProfileProof "gpsSampleLibrary" $gpsProfileStressReason
  $gpsProfileEvaluation = New-SkippedGpsProfileProof "gpsProfileEvaluation" $gpsProfileStressReason
  $gpsProfileBacktest = New-SkippedGpsProfileProof "gpsProfileBacktest" $gpsProfileStressReason
  $gpsProfileErrorDecomposition = New-SkippedGpsProfileProof "gpsProfileErrorDecomposition" $gpsProfileStressReason
  $gpsProfileAlertSensitivity = New-SkippedGpsProfileProof "gpsProfileAlertSensitivity" $gpsProfileStressReason
  $gpsThresholdPrecision = New-SkippedGpsProfileProof "gpsThresholdPrecision" $gpsProfileStressReason
  $gpsThresholdErrorRates = New-SkippedGpsProfileProof "gpsThresholdErrorRates" $gpsProfileStressReason
  $gpsThresholdHorizonMatrix = New-SkippedGpsProfileProof "gpsThresholdHorizonMatrix" $gpsProfileStressReason
  $gpsThresholdHorizonErrorMatrix = New-SkippedGpsProfileProof "gpsThresholdHorizonErrorMatrix" $gpsProfileStressReason
  $gpsThresholdGovernanceMatrix = New-SkippedGpsProfileProof "gpsThresholdGovernanceMatrix" $gpsProfileStressReason
  $gpsThresholdFullMatrix = New-SkippedGpsProfileProof "gpsThresholdFullMatrix" $gpsProfileStressReason
  $gpsThresholdScorecard = New-SkippedGpsProfileProof "gpsThresholdScorecard" $gpsProfileStressReason
  $gpsThresholdRanking = New-SkippedGpsProfileProof "gpsThresholdRanking" $gpsProfileStressReason
  $gpsThresholdPolicyBoard = New-SkippedGpsProfileProof "gpsThresholdPolicyBoard" $gpsProfileStressReason
  $gpsThresholdExecutionMatrix = New-SkippedGpsProfileProof "gpsThresholdExecutionMatrix" $gpsProfileStressReason
  $gpsThresholdRunbook = New-SkippedGpsProfileProof "gpsThresholdRunbook" $gpsProfileStressReason
  $gpsThresholdSlaMatrix = New-SkippedGpsProfileProof "gpsThresholdSlaMatrix" $gpsProfileStressReason
  $gpsThresholdOperatingModel = New-SkippedGpsProfileProof "gpsThresholdOperatingModel" $gpsProfileStressReason
}

$gpsPageActions = Invoke-JsonStep "Desk GPS page actions proof" {
  powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repoRoot "scripts/dev/check-desk-gps-page-actions.ps1")
}

$userJourney = Invoke-JsonStep "Desk user journey proof" {
  powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repoRoot "scripts/dev/check-desk-user-journey.ps1")
}

$baselinesActions = Invoke-JsonStep "Desk baselines actions proof" {
  powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repoRoot "scripts/dev/check-desk-baselines-actions.ps1")
}

$deviceActions = Invoke-JsonStep "Desk device actions proof" {
  powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repoRoot "scripts/dev/check-desk-device-actions.ps1")
}

$commandNotifyOnAck = Invoke-JsonStep "Desk command notifyOnAck proof" {
  powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repoRoot "scripts/dev/check-desk-command-notify-on-ack.ps1")
}

$deviceManagementPage = Invoke-JsonStep "Desk device management page proof" {
  powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repoRoot "scripts/dev/check-desk-device-management-page.ps1")
}

$deviceManagementExport = Invoke-JsonStep "Desk device management export proof" {
  powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repoRoot "scripts/dev/check-desk-device-management-export.ps1")
}

$deviceDiagnostics = Invoke-JsonStep "Desk device diagnostics proof" {
  powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repoRoot "scripts/dev/check-desk-device-diagnostics.ps1")
}

$viewerBoundary = Invoke-JsonStep "Desk viewer boundary proof" {
  powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repoRoot "scripts/dev/check-desk-viewer-boundary.ps1")
}

$viewerJourney = Invoke-JsonStep "Desk viewer journey proof" {
  powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repoRoot "scripts/dev/check-desk-viewer-journey.ps1")
}

$pagination = $null
if ($IncludePaginationStress) {
  $pagination = Invoke-JsonStep "Desk pagination stress proof" {
    powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repoRoot "scripts/dev/check-desk-pagination-proof.ps1")
  }
}

$commandPagination = $null
if ($IncludeCommandPaginationStress) {
  $commandPagination = Invoke-JsonStep "Desk command pagination proof" {
    powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repoRoot "scripts/dev/check-desk-command-pagination.ps1")
  }
}

$viewerDeniedKeys = @($viewerBoundary.denied.PSObject.Properties | ForEach-Object { $_.Name })
$completedChecks = @(
  $(if ($IncludeSeedDemo) { "seed-demo.ps1" } else { "formal-runtime" }),
  "restart-local-api-service.ps1",
  "health",
  "check-desk-http-v1-core.ps1",
  "check-desk-http-client.ps1",
  "check-desk-settings-actions.ps1",
  "check-desk-devices-page-actions.ps1",
  "check-desk-stations-page-actions.ps1",
  "check-desk-station-management-panel.ps1",
  "check-desk-home-actions.ps1",
  "check-desk-analysis-page-actions.ps1",
  "check-desk-system-page-actions.ps1",
  "check-desk-gps-monitoring-page.ps1",
  "check-desk-gps-monitoring-export.ps1",
  "check-desk-gps-threshold-config.ps1",
  "check-desk-gps-data-limit-config.ps1",
  "check-desk-gps-v1-analysis-contract.ps1",
  "check-desk-gps-page-actions.ps1",
  "check-desk-user-journey.ps1",
  "check-desk-baselines-actions.ps1",
  "check-desk-device-actions.ps1",
  "check-desk-command-notify-on-ack.ps1",
  "check-desk-device-management-page.ps1",
  "check-desk-device-management-export.ps1",
  "check-desk-device-diagnostics.ps1",
  "check-desk-viewer-boundary.ps1",
  "check-desk-viewer-journey.ps1"
) + $(if ($includeGpsProfileStress) { @(
  "check-desk-gps-sample-library.ps1",
  "check-desk-gps-profile-evaluation.ps1",
  "check-desk-gps-profile-backtest.ps1",
  "check-desk-gps-profile-error-decomposition.ps1",
  "check-desk-gps-profile-alert-sensitivity.ps1",
  "check-desk-gps-threshold-precision.ps1",
  "check-desk-gps-threshold-error-rates.ps1",
  "check-desk-gps-threshold-horizon-matrix.ps1",
  "check-desk-gps-threshold-horizon-error-matrix.ps1",
  "check-desk-gps-threshold-governance-matrix.ps1",
  "check-desk-gps-threshold-full-matrix.ps1",
  "check-desk-gps-threshold-scorecard.ps1",
  "check-desk-gps-threshold-ranking.ps1",
  "check-desk-gps-threshold-policy-board.ps1",
  "check-desk-gps-threshold-execution-matrix.ps1",
  "check-desk-gps-threshold-runbook.ps1",
  "check-desk-gps-threshold-sla-matrix.ps1",
  "check-desk-gps-threshold-operating-model.ps1"
) } else { @() }) + $(if ($IncludePaginationStress) { @("check-desk-pagination-proof.ps1") } else { @() }) + $(if ($IncludeCommandPaginationStress) { @("check-desk-command-pagination.ps1") } else { @() })

$summarySnapshot = [ordered]@{
  generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  baseUrl = $BaseUrl
  buildExecuted = (-not $SkipBuild.IsPresent)
  completedChecks = $completedChecks.Count
  healthOk = [bool]$health.ok
  auth = [ordered]@{
    username = $v1Core.auth.username
    role = $clientProof.auth.role
    hasRefreshToken = [bool]$v1Core.auth.hasRefreshToken
    refreshWorks = [bool]$v1Core.auth.refreshWorks
  }
  demoTruth = [ordered]@{
    stationCount = [int]$v1Core.summary.stationCount
    totalDevices = [int]$v1Core.summary.totalDevices
    onlineDevices = [int]$v1Core.summary.deviceOnlineCount
    alertCountToday = [int]$v1Core.summary.alertCountToday
    rainfallSum = [int]$v1Core.weeklyTrend.rainfallSum
    alertSum = [int]$v1Core.weeklyTrend.alertSum
    missingBaselineCount = [int]$v1Core.devices.missingBaselineCount
  }
  pageProofs = [ordered]@{
    homeRefreshStable = [bool]$homeActions.homePage.refreshStable
    analysisAnomalies = [int]$analysisPageActions.analysisPage.anomalies
    stationManagementStations = [int]$stationManagementPanel.stationManagementPanel.totalStations
    gpsCandidateCount = [int]$gpsMonitoringPage.gpsMonitoringPage.candidateCount
    gpsTrendDirection = [string]$gpsV1AnalysisContract.gpsV1AnalysisContract.trendDirection
    gpsTrendSlopeMmPerHour = [double]$gpsV1AnalysisContract.gpsV1AnalysisContract.trendSlopeMmPerHour
    gpsTrendFitR2 = [double]$gpsV1AnalysisContract.gpsV1AnalysisContract.trendFitR2
    gpsThresholdBlue = [double]$gpsThresholdConfig.gpsThresholdConfig.blue
    gpsThresholdBlueForecastBreached = [bool]$gpsV1AnalysisContract.gpsV1AnalysisContract.shortBlueBreached
    gpsThresholdRedForecastBreached = [bool]$gpsV1AnalysisContract.gpsV1AnalysisContract.longRedBreached
    gpsThresholdRedForecastEtaHours = if ($null -eq $gpsV1AnalysisContract.gpsV1AnalysisContract.longRedEtaHours) { $null } else { [double]$gpsV1AnalysisContract.gpsV1AnalysisContract.longRedEtaHours }
    gpsSampleProfiles = [int]$gpsSampleLibrary.gpsSampleLibrary.deviceCount
    gpsProfileEvaluationProfiles = [int]$gpsProfileEvaluation.gpsProfileEvaluation.profileCount
    gpsProfileBacktestProfiles = [int]$gpsProfileBacktest.gpsProfileBacktest.profileCount
    gpsProfileErrorProfiles = [int]$gpsProfileErrorDecomposition.gpsProfileErrorDecomposition.profileCount
    gpsProfileAlertProfiles = [int]$gpsProfileAlertSensitivity.gpsProfileAlertSensitivity.profileCount
    gpsThresholdPrecisionProfiles = [int]$gpsThresholdPrecision.gpsThresholdPrecision.profileCount
    gpsThresholdErrorProfiles = [int]$gpsThresholdErrorRates.gpsThresholdErrorRates.profileCount
    gpsThresholdMatrixProfiles = [int]$gpsThresholdHorizonMatrix.gpsThresholdHorizonMatrix.profileCount
    gpsThresholdHorizonErrorProfiles = [int]$gpsThresholdHorizonErrorMatrix.gpsThresholdHorizonErrorMatrix.profileCount
    gpsThresholdGovernanceProfiles = [int]$gpsThresholdGovernanceMatrix.gpsThresholdGovernanceMatrix.profileCount
    gpsThresholdFullMatrixProfiles = [int]$gpsThresholdFullMatrix.gpsThresholdFullMatrix.profileCount
    gpsThresholdScorecardProfiles = [int]$gpsThresholdScorecard.gpsThresholdScorecard.profileCount
    gpsThresholdRankingProfiles = [int]$gpsThresholdRanking.gpsThresholdRanking.profileCount
    gpsThresholdPolicyProfiles = [int]$gpsThresholdPolicyBoard.gpsThresholdPolicyBoard.profileCount
    gpsThresholdExecutionProfiles = [int]$gpsThresholdExecutionMatrix.gpsThresholdExecutionMatrix.profileCount
    gpsThresholdRunbookProfiles = [int]$gpsThresholdRunbook.gpsThresholdRunbook.profileCount
    gpsThresholdSlaProfiles = [int]$gpsThresholdSlaMatrix.gpsThresholdSlaMatrix.profileCount
    gpsThresholdOperatingProfiles = [int]$gpsThresholdOperatingModel.gpsThresholdOperatingModel.profileCount
    gpsDataLimit = [int]$gpsDataLimitConfig.gpsDataLimitConfig.limit
    gpsV1AnalysisImfCount = [int]$gpsV1AnalysisContract.gpsV1AnalysisContract.ceemdImfCount
    gpsShortPredictionBandPoints = [int]$gpsV1AnalysisContract.gpsV1AnalysisContract.shortPredictionLowerPoints
    gpsLongPredictionBandPoints = [int]$gpsV1AnalysisContract.gpsV1AnalysisContract.longPredictionLowerPoints
    deviceCommandsLoaded = [int]$deviceManagementPage.deviceManagementPage.commandsLoaded
    commandNotifyOnAckDefault = [bool](-not $commandNotifyOnAck.commandNotifyOnAck.defaultNotifyOnAck)
    commandNotifyOnAckOptIn = [bool]$commandNotifyOnAck.commandNotifyOnAck.optInNotifyOnAck
    diagnosticsType = $deviceDiagnostics.diagnostics.analysisType
  }
  exports = [ordered]@{
    gpsChart = $gpsMonitoringExport.export.chartFilename
    gpsCsv = $gpsMonitoringExport.export.csvFilename
    deviceCsv = $deviceManagementExport.export.devicesFilename
    deviceDetailCopyReady = [bool]$deviceManagementExport.export.detailContainsDeviceName
  }
  viewerBoundary = [ordered]@{
    deniedCount = $viewerDeniedKeys.Count
    deniedKeys = $viewerDeniedKeys
  }
  stress = [ordered]@{
    gpsProfileStressIncluded = [bool]$includeGpsProfileStress
    gpsProfileStressDeviceCount = [int]$gpsProfileStressDeviceCount
    paginationIncluded = [bool]($null -ne $pagination)
    commandPaginationIncluded = [bool]($null -ne $commandPagination)
  }
}

$report = [ordered]@{
  generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  baseUrl = $BaseUrl
  buildExecuted = (-not $SkipBuild.IsPresent)
  summarySnapshot = $summarySnapshot
  health = $health
  v1Core = $v1Core
  client = $clientProof
  settingsActions = $settingsActions
  devicesPageActions = $devicesPageActions
  stationsPageActions = $stationsPageActions
  stationManagementPanel = $stationManagementPanel
  homeActions = $homeActions
  analysisPageActions = $analysisPageActions
  systemPageActions = $systemPageActions
  gpsMonitoringPage = $gpsMonitoringPage
  gpsMonitoringExport = $gpsMonitoringExport
  gpsThresholdConfig = $gpsThresholdConfig
  gpsDataLimitConfig = $gpsDataLimitConfig
  gpsV1AnalysisContract = $gpsV1AnalysisContract
  gpsSampleLibrary = $gpsSampleLibrary
  gpsProfileEvaluation = $gpsProfileEvaluation
  gpsProfileBacktest = $gpsProfileBacktest
  gpsProfileErrorDecomposition = $gpsProfileErrorDecomposition
  gpsProfileAlertSensitivity = $gpsProfileAlertSensitivity
  gpsThresholdPrecision = $gpsThresholdPrecision
  gpsThresholdErrorRates = $gpsThresholdErrorRates
  gpsThresholdHorizonMatrix = $gpsThresholdHorizonMatrix
  gpsThresholdHorizonErrorMatrix = $gpsThresholdHorizonErrorMatrix
  gpsThresholdGovernanceMatrix = $gpsThresholdGovernanceMatrix
  gpsThresholdFullMatrix = $gpsThresholdFullMatrix
  gpsThresholdScorecard = $gpsThresholdScorecard
  gpsThresholdRanking = $gpsThresholdRanking
  gpsThresholdPolicyBoard = $gpsThresholdPolicyBoard
  gpsThresholdExecutionMatrix = $gpsThresholdExecutionMatrix
  gpsThresholdRunbook = $gpsThresholdRunbook
  gpsThresholdSlaMatrix = $gpsThresholdSlaMatrix
  gpsThresholdOperatingModel = $gpsThresholdOperatingModel
  gpsPageActions = $gpsPageActions
  userJourney = $userJourney
  baselinesActions = $baselinesActions
  deviceActions = $deviceActions
  commandNotifyOnAck = $commandNotifyOnAck
  deviceManagementPage = $deviceManagementPage
  deviceManagementExport = $deviceManagementExport
  deviceDiagnostics = $deviceDiagnostics
  viewerBoundary = $viewerBoundary
  viewerJourney = $viewerJourney
  paginationStress = $pagination
  commandPaginationStress = $commandPagination
  completed = $completedChecks
}

$json = $report | ConvertTo-Json -Depth 100
$outDir = Split-Path -Parent $fullOutFile
if ($outDir -and -not (Test-Path $outDir)) {
  New-Item -ItemType Directory -Path $outDir -Force | Out-Null
}
Set-Content -Path $fullOutFile -Value $json -Encoding UTF8

$summaryOutDir = Split-Path -Parent $fullSummaryOutFile
if ($summaryOutDir -and -not (Test-Path $summaryOutDir)) {
  New-Item -ItemType Directory -Path $summaryOutDir -Force | Out-Null
}

$summaryLines = @(
  "# Desk Mainline Proof Summary",
  "",
  "- GeneratedAt: $($summarySnapshot.generatedAt)",
  "- BaseUrl: $($summarySnapshot.baseUrl)",
  "- BuildExecuted: $($summarySnapshot.buildExecuted)",
  "- CompletedChecks: $($summarySnapshot.completedChecks)",
  "- HealthOk: $($summarySnapshot.healthOk)",
  "",
  "## Runtime Truth",
  "",
  "- Stations: $($summarySnapshot.demoTruth.stationCount)",
  "- TotalDevices: $($summarySnapshot.demoTruth.totalDevices)",
  "- OnlineDevices: $($summarySnapshot.demoTruth.onlineDevices)",
  "- AlertCountToday: $($summarySnapshot.demoTruth.alertCountToday)",
  "- WeeklyRainfallSum: $($summarySnapshot.demoTruth.rainfallSum)",
  "- WeeklyAlertSum: $($summarySnapshot.demoTruth.alertSum)",
  "- MissingBaselineCount: $($summarySnapshot.demoTruth.missingBaselineCount)",
  "",
  "## Auth",
  "",
  "- Username: $($summarySnapshot.auth.username)",
  "- Role: $($summarySnapshot.auth.role)",
  "- HasRefreshToken: $($summarySnapshot.auth.hasRefreshToken)",
  "- RefreshWorks: $($summarySnapshot.auth.refreshWorks)",
  "",
  "## Page Proofs",
  "",
  "- HomeRefreshStable: $($summarySnapshot.pageProofs.homeRefreshStable)",
  "- AnalysisAnomalies: $($summarySnapshot.pageProofs.analysisAnomalies)",
  "- StationManagementStations: $($summarySnapshot.pageProofs.stationManagementStations)",
  "- GpsCandidateCount: $($summarySnapshot.pageProofs.gpsCandidateCount)",
  "- GpsTrendDirection: $($summarySnapshot.pageProofs.gpsTrendDirection)",
  "- GpsTrendSlopeMmPerHour: $($summarySnapshot.pageProofs.gpsTrendSlopeMmPerHour)",
  "- GpsTrendFitR2: $($summarySnapshot.pageProofs.gpsTrendFitR2)",
  "- GpsThresholdBlue: $($summarySnapshot.pageProofs.gpsThresholdBlue)",
  "- GpsThresholdBlueForecastBreached: $($summarySnapshot.pageProofs.gpsThresholdBlueForecastBreached)",
  "- GpsThresholdRedForecastBreached: $($summarySnapshot.pageProofs.gpsThresholdRedForecastBreached)",
  "- GpsThresholdRedForecastEtaHours: $($summarySnapshot.pageProofs.gpsThresholdRedForecastEtaHours)",
  "- GpsSampleProfiles: $($summarySnapshot.pageProofs.gpsSampleProfiles)",
  "- GpsProfileEvaluationProfiles: $($summarySnapshot.pageProofs.gpsProfileEvaluationProfiles)",
  "- GpsProfileBacktestProfiles: $($summarySnapshot.pageProofs.gpsProfileBacktestProfiles)",
  "- GpsProfileErrorProfiles: $($summarySnapshot.pageProofs.gpsProfileErrorProfiles)",
  "- GpsProfileAlertProfiles: $($summarySnapshot.pageProofs.gpsProfileAlertProfiles)",
  "- GpsThresholdPrecisionProfiles: $($summarySnapshot.pageProofs.gpsThresholdPrecisionProfiles)",
  "- GpsThresholdErrorProfiles: $($summarySnapshot.pageProofs.gpsThresholdErrorProfiles)",
  "- GpsThresholdMatrixProfiles: $($summarySnapshot.pageProofs.gpsThresholdMatrixProfiles)",
  "- GpsThresholdHorizonErrorProfiles: $($summarySnapshot.pageProofs.gpsThresholdHorizonErrorProfiles)",
  "- GpsThresholdGovernanceProfiles: $($summarySnapshot.pageProofs.gpsThresholdGovernanceProfiles)",
  "- GpsThresholdFullMatrixProfiles: $($summarySnapshot.pageProofs.gpsThresholdFullMatrixProfiles)",
  "- GpsThresholdScorecardProfiles: $($summarySnapshot.pageProofs.gpsThresholdScorecardProfiles)",
  "- GpsThresholdRankingProfiles: $($summarySnapshot.pageProofs.gpsThresholdRankingProfiles)",
  "- GpsThresholdPolicyProfiles: $($summarySnapshot.pageProofs.gpsThresholdPolicyProfiles)",
  "- GpsThresholdExecutionProfiles: $($summarySnapshot.pageProofs.gpsThresholdExecutionProfiles)",
  "- GpsThresholdRunbookProfiles: $($summarySnapshot.pageProofs.gpsThresholdRunbookProfiles)",
  "- GpsThresholdSlaProfiles: $($summarySnapshot.pageProofs.gpsThresholdSlaProfiles)",
  "- GpsThresholdOperatingProfiles: $($summarySnapshot.pageProofs.gpsThresholdOperatingProfiles)",
  "- GpsDataLimit: $($summarySnapshot.pageProofs.gpsDataLimit)",
  "- GpsV1AnalysisImfCount: $($summarySnapshot.pageProofs.gpsV1AnalysisImfCount)",
  "- GpsShortPredictionBandPoints: $($summarySnapshot.pageProofs.gpsShortPredictionBandPoints)",
  "- GpsLongPredictionBandPoints: $($summarySnapshot.pageProofs.gpsLongPredictionBandPoints)",
  "- DeviceCommandsLoaded: $($summarySnapshot.pageProofs.deviceCommandsLoaded)",
  "- CommandNotifyOnAckDefault: $($summarySnapshot.pageProofs.commandNotifyOnAckDefault)",
  "- CommandNotifyOnAckOptIn: $($summarySnapshot.pageProofs.commandNotifyOnAckOptIn)",
  "- DiagnosticsType: $($summarySnapshot.pageProofs.diagnosticsType)",
  "",
  "## Exports",
  "",
  "- GpsChart: $($summarySnapshot.exports.gpsChart)",
  "- GpsCsv: $($summarySnapshot.exports.gpsCsv)",
  "- DeviceCsv: $($summarySnapshot.exports.deviceCsv)",
  "- DeviceDetailCopyReady: $($summarySnapshot.exports.deviceDetailCopyReady)",
  "",
  "## Viewer Boundary",
  "",
  "- DeniedCount: $($summarySnapshot.viewerBoundary.deniedCount)",
  "- DeniedKeys: $([string]::Join(', ', $summarySnapshot.viewerBoundary.deniedKeys))",
  "",
  "## Stress",
  "",
  "- GpsProfileStressIncluded: $($summarySnapshot.stress.gpsProfileStressIncluded)",
  "- GpsProfileStressDeviceCount: $($summarySnapshot.stress.gpsProfileStressDeviceCount)",
  "- PaginationIncluded: $($summarySnapshot.stress.paginationIncluded)",
  "- CommandPaginationIncluded: $($summarySnapshot.stress.commandPaginationIncluded)"
)
Set-Content -Path $fullSummaryOutFile -Value ($summaryLines -join "`r`n") -Encoding UTF8

if (-not (Test-Path $fullHistoryDir)) {
  New-Item -ItemType Directory -Path $fullHistoryDir -Force | Out-Null
}

$historyStamp = Get-Date -Format "yyyyMMdd-HHmmss"
$historyJsonFile = Join-Path $fullHistoryDir "desk-mainline-proof-$historyStamp.json"
$historySummaryFile = Join-Path $fullHistoryDir "desk-mainline-proof-summary-$historyStamp.md"
Set-Content -Path $historyJsonFile -Value $json -Encoding UTF8
Set-Content -Path $historySummaryFile -Value ($summaryLines -join "`r`n") -Encoding UTF8

$historyJsonEntriesAll = @(Get-ChildItem -Path $fullHistoryDir -Filter "desk-mainline-proof-*.json" | Sort-Object LastWriteTime -Descending)
if ($MaxHistorySnapshots -gt 0 -and $historyJsonEntriesAll.Count -gt $MaxHistorySnapshots) {
  $entriesToRemove = @($historyJsonEntriesAll | Select-Object -Skip $MaxHistorySnapshots)
  foreach ($entry in $entriesToRemove) {
    $stamp = $entry.BaseName -replace "^desk-mainline-proof-", ""
    $pairedSummary = Join-Path $fullHistoryDir "desk-mainline-proof-summary-$stamp.md"
    Remove-Item -Path $entry.FullName -Force -ErrorAction SilentlyContinue
    if (Test-Path $pairedSummary) {
      Remove-Item -Path $pairedSummary -Force -ErrorAction SilentlyContinue
    }
  }
}

$historyIndexDir = Split-Path -Parent $fullHistoryIndexOutFile
if ($historyIndexDir -and -not (Test-Path $historyIndexDir)) {
  New-Item -ItemType Directory -Path $historyIndexDir -Force | Out-Null
}

$historyJsonEntries = @(Get-ChildItem -Path $fullHistoryDir -Filter "desk-mainline-proof-*.json" | Sort-Object LastWriteTime -Descending)
$historyRows = @()
foreach ($entry in $historyJsonEntries | Select-Object -First 10) {
  $parsed = Get-Content $entry.FullName -Raw | ConvertFrom-Json
  $snapshot = $parsed.summarySnapshot
  $historyRows += [ordered]@{
    stamp = $entry.BaseName -replace "^desk-mainline-proof-", ""
    generatedAt = $snapshot.generatedAt
    checks = [int]$snapshot.completedChecks
    stations = [int]$snapshot.demoTruth.stationCount
    devices = [int]$snapshot.demoTruth.totalDevices
    online = [int]$snapshot.demoTruth.onlineDevices
    alerts = [int]$snapshot.demoTruth.alertCountToday
    rainfall = [int]$snapshot.demoTruth.rainfallSum
    missingBaselines = [int]$snapshot.demoTruth.missingBaselineCount
    denied = [int]$snapshot.viewerBoundary.deniedCount
  }
}

function Get-HistoryFingerprint($row) {
  if ($null -eq $row) { return "" }
  return @(
    [string]$row.checks,
    [string]$row.stations,
    [string]$row.devices,
    [string]$row.online,
    [string]$row.alerts,
    [string]$row.rainfall,
    [string]$row.missingBaselines,
    [string]$row.denied
  ) -join "|"
}

$currentRow = if ($historyRows.Count -ge 1) { $historyRows[0] } else { $null }
$previousRow = if ($historyRows.Count -ge 2) { $historyRows[1] } else { $null }
$currentFingerprint = Get-HistoryFingerprint $currentRow
$lastMatchingRow = $null
if ($historyRows.Count -ge 2 -and $currentFingerprint) {
  $lastMatchingRow =
    @($historyRows | Select-Object -Skip 1 | Where-Object { (Get-HistoryFingerprint $_) -eq $currentFingerprint } | Select-Object -First 1)[0]
}

$historyIndexLines = @(
  "# Desk Mainline Proof History",
  "",
  "- LatestJson: $([System.IO.Path]::GetFileName($historyJsonFile))",
  "- LatestSummary: $([System.IO.Path]::GetFileName($historySummaryFile))",
  "- TotalSnapshots: $($historyJsonEntries.Count)",
  "",
  "## Recent Snapshots",
  "",
  "| Stamp | GeneratedAt | Checks | Stations | Devices | Online | Alerts | Rainfall | MissingBaselines | ViewerDenied |",
  "|---|---|---:|---:|---:|---:|---:|---:|---:|---:|"
)

foreach ($row in $historyRows) {
  $historyIndexLines += "| $($row.stamp) | $($row.generatedAt) | $($row.checks) | $($row.stations) | $($row.devices) | $($row.online) | $($row.alerts) | $($row.rainfall) | $($row.missingBaselines) | $($row.denied) |"
}

if ($historyRows.Count -ge 2) {
  $historyIndexLines += @(
    "",
    "## Current Vs Previous",
    "",
    "- CurrentStamp: $($currentRow.stamp)",
    "- PreviousStamp: $($previousRow.stamp)",
    "- DeltaChecks: $($currentRow.checks - $previousRow.checks)",
    "- DeltaStations: $($currentRow.stations - $previousRow.stations)",
    "- DeltaDevices: $($currentRow.devices - $previousRow.devices)",
    "- DeltaOnline: $($currentRow.online - $previousRow.online)",
    "- DeltaAlerts: $($currentRow.alerts - $previousRow.alerts)",
    "- DeltaRainfall: $($currentRow.rainfall - $previousRow.rainfall)",
    "- DeltaMissingBaselines: $($currentRow.missingBaselines - $previousRow.missingBaselines)",
    "- DeltaViewerDenied: $($currentRow.denied - $previousRow.denied)"
  )
}

if ($null -ne $lastMatchingRow) {
  $historyIndexLines += @(
    "",
    "## Current Vs Last Matching Truth",
    "",
    "- LastMatchingStamp: $($lastMatchingRow.stamp)",
    "- LastMatchingGeneratedAt: $($lastMatchingRow.generatedAt)",
    "- DeltaChecks: $($currentRow.checks - $lastMatchingRow.checks)",
    "- DeltaStations: $($currentRow.stations - $lastMatchingRow.stations)",
    "- DeltaDevices: $($currentRow.devices - $lastMatchingRow.devices)",
    "- DeltaOnline: $($currentRow.online - $lastMatchingRow.online)",
    "- DeltaAlerts: $($currentRow.alerts - $lastMatchingRow.alerts)",
    "- DeltaRainfall: $($currentRow.rainfall - $lastMatchingRow.rainfall)",
    "- DeltaMissingBaselines: $($currentRow.missingBaselines - $lastMatchingRow.missingBaselines)",
    "- DeltaViewerDenied: $($currentRow.denied - $lastMatchingRow.denied)"
  )
}

Set-Content -Path $fullHistoryIndexOutFile -Value ($historyIndexLines -join "`r`n") -Encoding UTF8

$diffOutDir = Split-Path -Parent $fullDiffOutFile
if ($diffOutDir -and -not (Test-Path $diffOutDir)) {
  New-Item -ItemType Directory -Path $diffOutDir -Force | Out-Null
}

$latestDiff = [ordered]@{
  generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  hasPrevious = $historyRows.Count -ge 2
  current = $currentRow
  previous = $previousRow
  delta = if ($historyRows.Count -ge 2) {
    [ordered]@{
      checks = $currentRow.checks - $previousRow.checks
      stations = $currentRow.stations - $previousRow.stations
      devices = $currentRow.devices - $previousRow.devices
      online = $currentRow.online - $previousRow.online
      alerts = $currentRow.alerts - $previousRow.alerts
      rainfall = $currentRow.rainfall - $previousRow.rainfall
      missingBaselines = $currentRow.missingBaselines - $previousRow.missingBaselines
      viewerDenied = $currentRow.denied - $previousRow.denied
    }
  } else {
    $null
  }
  hasLastMatching = $null -ne $lastMatchingRow
  lastMatching = $lastMatchingRow
  deltaFromLastMatching = if ($null -ne $lastMatchingRow) {
    [ordered]@{
      checks = $currentRow.checks - $lastMatchingRow.checks
      stations = $currentRow.stations - $lastMatchingRow.stations
      devices = $currentRow.devices - $lastMatchingRow.devices
      online = $currentRow.online - $lastMatchingRow.online
      alerts = $currentRow.alerts - $lastMatchingRow.alerts
      rainfall = $currentRow.rainfall - $lastMatchingRow.rainfall
      missingBaselines = $currentRow.missingBaselines - $lastMatchingRow.missingBaselines
      viewerDenied = $currentRow.denied - $lastMatchingRow.denied
    }
  } else {
    $null
  }
}

$latestDiffJson = $latestDiff | ConvertTo-Json -Depth 20
Set-Content -Path $fullDiffOutFile -Value $latestDiffJson -Encoding UTF8

$manifestOutDir = Split-Path -Parent $fullManifestOutFile
if ($manifestOutDir -and -not (Test-Path $manifestOutDir)) {
  New-Item -ItemType Directory -Path $manifestOutDir -Force | Out-Null
}

$latestManifest = [ordered]@{
  generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  baseUrl = $BaseUrl
  latest = [ordered]@{
    json = $OutFile
    summary = $SummaryOutFile
    historyIndex = $HistoryIndexOutFile
    diff = $DiffOutFile
  }
  history = [ordered]@{
    dir = $HistoryDir
    totalSnapshots = $historyJsonEntries.Count
    currentStamp = if ($historyRows.Count -ge 1) { $historyRows[0].stamp } else { $null }
    previousStamp = if ($historyRows.Count -ge 2) { $historyRows[1].stamp } else { $null }
    maxSnapshots = $MaxHistorySnapshots
  }
  summarySnapshot = $summarySnapshot
  diff = $latestDiff
}

$latestManifestJson = $latestManifest | ConvertTo-Json -Depth 30
Set-Content -Path $fullManifestOutFile -Value $latestManifestJson -Encoding UTF8

$json
