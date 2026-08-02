[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$CalibrationFile,
  [Parameter(Mandatory = $true)]
  [string]$ReportPathA,
  [Parameter(Mandatory = $true)]
  [string]$ReportPathB,
  [Parameter(Mandatory = $true)]
  [string]$ReportPathC,
  [Parameter(Mandatory = $true)]
  [string]$ReleaseManifestPathA,
  [Parameter(Mandatory = $true)]
  [string]$ReleaseManifestPathB,
  [Parameter(Mandatory = $true)]
  [string]$ReleaseManifestPathC,
  [Parameter(Mandatory = $true)]
  [ValidateRange(8000, 13500)]
  [int]$MeasuredStartAMv,
  [Parameter(Mandatory = $true)]
  [ValidateRange(8000, 13500)]
  [int]$MeasuredEndAMv,
  [Parameter(Mandatory = $true)]
  [ValidateRange(8000, 13500)]
  [int]$MeasuredStartBMv,
  [Parameter(Mandatory = $true)]
  [ValidateRange(8000, 13500)]
  [int]$MeasuredEndBMv,
  [Parameter(Mandatory = $true)]
  [ValidateRange(8000, 13500)]
  [int]$MeasuredStartCMv,
  [Parameter(Mandatory = $true)]
  [ValidateRange(8000, 13500)]
  [int]$MeasuredEndCMv,
  [ValidateRange(1, 500)]
  [int]$MaxAbsErrorMv = 60,
  [ValidateRange(0, 500)]
  [int]$MaxMeterSpanMv = 50,
  [ValidateRange(1, 1000)]
  [int]$MaxObservedSpanMv = 150,
  [ValidateRange(30, 10000)]
  [int]$MinSamples = 30,
  [Parameter(Mandatory = $true)]
  [string]$OutputPath
)

$ErrorActionPreference = "Stop"

function Get-RequiredProperty {
  param(
    [Parameter(Mandatory = $true)]$Object,
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][string]$Context
  )

  $property = $Object.PSObject.Properties[$Name]
  if ($null -eq $property) {
    throw "$Context is missing required property '$Name'"
  }
  return $property.Value
}

function Copy-PropertiesToOrderedMap {
  param([Parameter(Mandatory = $true)]$Value)

  $copy = [ordered]@{}
  foreach ($property in $Value.PSObject.Properties) {
    $copy[$property.Name] = $property.Value
  }
  return $copy
}

function Read-JsonDocument {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Context
  )

  try {
    return Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
  } catch {
    throw "$Context is not valid JSON: $Path`n$($_.Exception.Message)"
  }
}

$resolvedCalibrationPath =
  (Resolve-Path -LiteralPath $CalibrationFile -ErrorAction Stop).Path
$resolvedOutputPath = [System.IO.Path]::GetFullPath($OutputPath)
if ($resolvedOutputPath -eq $resolvedCalibrationPath) {
  throw "Final calibration output must not overwrite its input"
}

$reportPathByNode = [ordered]@{
  A = (Resolve-Path -LiteralPath $ReportPathA -ErrorAction Stop).Path
  B = (Resolve-Path -LiteralPath $ReportPathB -ErrorAction Stop).Path
  C = (Resolve-Path -LiteralPath $ReportPathC -ErrorAction Stop).Path
}
$manifestPathByNode = [ordered]@{
  A = (Resolve-Path -LiteralPath $ReleaseManifestPathA -ErrorAction Stop).Path
  B = (Resolve-Path -LiteralPath $ReleaseManifestPathB -ErrorAction Stop).Path
  C = (Resolve-Path -LiteralPath $ReleaseManifestPathC -ErrorAction Stop).Path
}
$meterByNode = [ordered]@{
  A = [ordered]@{ StartMv = $MeasuredStartAMv; EndMv = $MeasuredEndAMv }
  B = [ordered]@{ StartMv = $MeasuredStartBMv; EndMv = $MeasuredEndBMv }
  C = [ordered]@{ StartMv = $MeasuredStartCMv; EndMv = $MeasuredEndCMv }
}

$calibration = Read-JsonDocument -Path $resolvedCalibrationPath -Context "Calibration input"
if ($calibration.schemaVersion -ne 1 -or $null -eq $calibration.nodes) {
  throw "Calibration input must use schemaVersion 1 and contain nodes"
}
$calibrationSha256 =
  (Get-FileHash -LiteralPath $resolvedCalibrationPath -Algorithm SHA256).Hash.ToLowerInvariant()

$nodes = [ordered]@{}
$acceptanceByNode = [ordered]@{}
$zeroResultFields = @(
  "missingTelemetry",
  "decodeOrJsonErrors",
  "profileViolations",
  "unmatchedTelemetry",
  "duplicateTelemetry",
  "trailingUndelimitedBytes",
  "broadcastRetryCommands",
  "broadcastRetryRounds",
  "redundantRetryTelemetry"
)

foreach ($label in @("A", "B", "C")) {
  $calibrationProperty = $calibration.nodes.PSObject.Properties[$label]
  if ($null -eq $calibrationProperty) {
    throw "Calibration input is missing node $label"
  }
  $calibrationNode = $calibrationProperty.Value
  foreach ($name in @("gainPpm", "offsetMv", "verified")) {
    Get-RequiredProperty -Object $calibrationNode -Name $name -Context "Calibration node $label" | Out-Null
  }
  $gainPpm = [int]$calibrationNode.gainPpm
  $offsetMv = [int]$calibrationNode.offsetMv
  if ($gainPpm -lt 800000 -or $gainPpm -gt 1200000 -or
      $offsetMv -lt -2000 -or $offsetMv -gt 2000 -or
      $calibrationNode.verified -ne $true) {
    throw "Calibration node $label is outside the accepted range or is not verified"
  }

  $manifestPath = $manifestPathByNode[$label]
  $manifest = Read-JsonDocument -Path $manifestPath -Context "Release manifest for node $label"
  if ($manifest.schemaVersion -ne 1 -or
      $manifest.sourceDirty -ne $false -or
      [string]$manifest.sourceCommit -notmatch '^[0-9a-f]{40}$' -or
      [string]$manifest.fieldSensorMode -notin @("simulated", "hardware") -or
      $manifest.gnssRtcmInjectionMode -ne "disabled") {
    throw "Release manifest for node $label is not a clean disabled-RTCM calibration profile"
  }
  $manifestCalibrationProperty =
    $manifest.battery.calibrationByNode.PSObject.Properties[$label]
  if ($null -eq $manifestCalibrationProperty) {
    throw "Release manifest is missing battery calibration for node $label"
  }
  $manifestCalibrationNode = $manifestCalibrationProperty.Value
  if ([int]$manifestCalibrationNode.gainPpm -ne $gainPpm -or
      [int]$manifestCalibrationNode.offsetMv -ne $offsetMv -or
      $manifestCalibrationNode.verified -ne $true) {
    throw "Release manifest does not match the accepted calibration for node $label"
  }
  $releaseCalibrationPath = Join-Path (Split-Path -Parent $manifestPath) "battery-calibration.json"
  if (-not (Test-Path -LiteralPath $releaseCalibrationPath -PathType Leaf)) {
    throw "Release package is missing battery-calibration.json for node $label"
  }
  $releaseCalibrationSha256 =
    (Get-FileHash -LiteralPath $releaseCalibrationPath -Algorithm SHA256).Hash.ToLowerInvariant()
  if ([string]$manifest.battery.calibrationSourceSha256 -ne $releaseCalibrationSha256) {
    throw "Release manifest calibration hash is invalid for node $label"
  }
  $releaseCalibration =
    Read-JsonDocument -Path $releaseCalibrationPath -Context "Release calibration for node $label"
  $releaseCalibrationProperty = $releaseCalibration.nodes.PSObject.Properties[$label]
  if ($null -eq $releaseCalibrationProperty -or
      [int]$releaseCalibrationProperty.Value.gainPpm -ne $gainPpm -or
      [int]$releaseCalibrationProperty.Value.offsetMv -ne $offsetMv -or
      $releaseCalibrationProperty.Value.verified -ne $true) {
    throw "Release calibration file does not match node $label"
  }

  $reportPath = $reportPathByNode[$label]
  $report = Read-JsonDocument -Path $reportPath -Context "Verification report for node $label"
  if ($report.schemaVersion -ne 1 -or $null -eq $report.result -or $null -eq $report.nodes) {
    throw "Verification report for node $label is not an XLS1 three-node report"
  }
  $stable = $report.result.stableProfile
  if ($null -eq $stable) {
    $stable = $report.result.stableOneSecondProfile
  }
  if ($stable -ne $true) {
    throw "Verification report did not pass the strict profile for node $label"
  }
  foreach ($name in $zeroResultFields) {
    $value = Get-RequiredProperty -Object $report.result -Name $name -Context "Report result for node $label"
    if ([int64]$value -ne 0) {
      throw "Verification report has non-zero $name for node $label"
    }
  }
  $expectedTelemetry = [int](
    Get-RequiredProperty -Object $report.result -Name "expectedTelemetry" -Context "Report result for node $label"
  )
  $matchedTelemetry = [int](
    Get-RequiredProperty -Object $report.result -Name "matchedTelemetry" -Context "Report result for node $label"
  )
  $batchesSent = [int](
    Get-RequiredProperty -Object $report.result -Name "batchesSent" -Context "Report result for node $label"
  )
  $batchCompleteness =
    Get-RequiredProperty -Object $report.result -Name "batchCompleteness" -Context "Report result for node $label"
  if ($expectedTelemetry -le 0 -or
      $matchedTelemetry -ne $expectedTelemetry -or
      $batchesSent -le 0 -or
      [int]$batchCompleteness.completeBatches -ne $batchesSent -or
      [int]$batchCompleteness.partialBatches -ne 0 -or
      [int]$batchCompleteness.emptyBatches -ne 0) {
    throw "Verification report is not 100% complete for node $label"
  }

  if ([int]$report.configuration.requiredCompactVersion -ne 2 -or
      [string]$report.configuration.requiredFieldSensorSource -ne [string]$manifest.fieldSensorMode -or
      $report.configuration.requireBatteryValid -ne $true -or
      $report.configuration.requireFieldSensorsValid -ne $true) {
    throw "Verification report profile does not match the release manifest for node $label"
  }

  $reportNodeProperty = $report.nodes.PSObject.Properties[$label]
  if ($null -eq $reportNodeProperty -or $null -eq $reportNodeProperty.Value.battery) {
    throw "Verification report is missing battery evidence for node $label"
  }
  $battery = $reportNodeProperty.Value.battery
  foreach ($name in @("samples", "voltageMin", "voltageMedian", "voltageMax", "estimateQuality")) {
    Get-RequiredProperty -Object $battery -Name $name -Context "Report battery for node $label" | Out-Null
  }
  if ([int]$battery.samples -lt $MinSamples -or $battery.estimateQuality -ne "field-calibrated") {
    throw "Node $label lacks enough field-calibrated battery samples"
  }
  $reportedMedianMv = [int][math]::Round([double]$battery.voltageMedian * 1000.0)
  $observedSpanMv = [int][math]::Round(
    ([double]$battery.voltageMax - [double]$battery.voltageMin) * 1000.0
  )
  if ($reportedMedianMv -lt 8000 -or $reportedMedianMv -gt 13500 -or
      $observedSpanMv -lt 0 -or $observedSpanMv -gt $MaxObservedSpanMv) {
    throw "Node $label reported battery voltage is invalid or unstable"
  }

  $measuredStartMv = [int]$meterByNode[$label].StartMv
  $measuredEndMv = [int]$meterByNode[$label].EndMv
  $meterSpanMv = [math]::Abs($measuredEndMv - $measuredStartMv)
  $errorAtStartMv = $reportedMedianMv - $measuredStartMv
  $errorAtEndMv = $reportedMedianMv - $measuredEndMv
  $worstAbsErrorMv = [math]::Max(
    [math]::Abs($errorAtStartMv),
    [math]::Abs($errorAtEndMv)
  )
  if ($meterSpanMv -gt $MaxMeterSpanMv) {
    throw "Node $label meter voltage changed by $meterSpanMv mV during verification"
  }
  if ($worstAbsErrorMv -gt $MaxAbsErrorMv) {
    throw "Node $label worst battery error $worstAbsErrorMv mV exceeds $MaxAbsErrorMv mV"
  }

  $acceptedNode = Copy-PropertiesToOrderedMap -Value $calibrationNode
  $acceptedNode["accepted"] = $true
  $acceptedNode["acceptedMaxAbsErrorMv"] = $worstAbsErrorMv
  $nodes[$label] = $acceptedNode
  $acceptanceByNode[$label] = [ordered]@{
    accepted = $true
    acceptedGainPpm = $gainPpm
    acceptedOffsetMv = $offsetMv
    reportName = Split-Path -Leaf $reportPath
    reportSha256 =
      (Get-FileHash -LiteralPath $reportPath -Algorithm SHA256).Hash.ToLowerInvariant()
    releaseManifestName = Split-Path -Leaf $manifestPath
    releaseManifestSha256 =
      (Get-FileHash -LiteralPath $manifestPath -Algorithm SHA256).Hash.ToLowerInvariant()
    releaseSourceCommit = [string]$manifest.sourceCommit
    verificationFieldSensorMode = [string]$manifest.fieldSensorMode
    verificationGnssRtcmInjectionMode = [string]$manifest.gnssRtcmInjectionMode
    measuredStartMv = $measuredStartMv
    measuredEndMv = $measuredEndMv
    meterSpanMv = $meterSpanMv
    reportedMedianMv = $reportedMedianMv
    observedSpanMv = $observedSpanMv
    errorAtStartMv = $errorAtStartMv
    errorAtEndMv = $errorAtEndMv
    maxAbsErrorMv = $worstAbsErrorMv
    batterySamples = [int]$battery.samples
    reportStable = $true
    expectedTelemetry = $expectedTelemetry
    matchedTelemetry = $matchedTelemetry
    completeBatches = [int]$batchCompleteness.completeBatches
    communicationErrorCount = 0
  }
}

$output = [ordered]@{
  schemaVersion = 1
  method = "accepted-iterative-one-point-multiplicative"
  generatedAt = (Get-Date).ToUniversalTime().ToString("o")
  baseCalibration = [ordered]@{
    name = Split-Path -Leaf $resolvedCalibrationPath
    sha256 = $calibrationSha256
    method = [string]$calibration.method
  }
  finalAcceptance = [ordered]@{
    schemaVersion = 1
    allNodesAccepted = $true
    maxAllowedAbsErrorMv = $MaxAbsErrorMv
    maxAllowedMeterSpanMv = $MaxMeterSpanMv
    maxAllowedObservedSpanMv = $MaxObservedSpanMv
    minimumSamplesPerNode = $MinSamples
    strictCommunicationRequired = $true
    evidenceBinding = "operator-supplied release manifests + strict reports + synchronous meter endpoints"
  }
  nodes = $nodes
  acceptanceByNode = $acceptanceByNode
}

$outputDirectory = Split-Path -Parent $resolvedOutputPath
if ($outputDirectory) {
  New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null
}
$temporaryPath = "$resolvedOutputPath.tmp"
[System.IO.File]::WriteAllText(
  $temporaryPath,
  (($output | ConvertTo-Json -Depth 12) + [Environment]::NewLine),
  [System.Text.UTF8Encoding]::new($false)
)
Move-Item -LiteralPath $temporaryPath -Destination $resolvedOutputPath -Force

foreach ($label in @("A", "B", "C")) {
  $entry = $acceptanceByNode[$label]
  Write-Host (
    "BATTERY_ACCEPTED node={0} gain_ppm={1} reported_mv={2} meter_mv={3}..{4} max_abs_error_mv={5} frames={6}/{7}" -f `
      $label,
      $entry.acceptedGainPpm,
      $entry.reportedMedianMv,
      $entry.measuredStartMv,
      $entry.measuredEndMv,
      $entry.maxAbsErrorMv,
      $entry.matchedTelemetry,
      $entry.expectedTelemetry
  )
}
Write-Host "FINAL_CALIBRATION_FILE path=$resolvedOutputPath"
