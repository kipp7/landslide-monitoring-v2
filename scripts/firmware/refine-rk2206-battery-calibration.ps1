[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$ExistingCalibrationFile,
  [Parameter(Mandatory = $true)]
  [string]$CurrentReleaseManifestPath,
  [Parameter(Mandatory = $true)]
  [ValidateSet("A", "B", "C")]
  [string]$NodeLabel,
  [Parameter(Mandatory = $true)]
  [string]$ReportPath,
  [Parameter(Mandatory = $true)]
  [ValidateRange(8000, 13500)]
  [int]$MeasuredStartMv,
  [Parameter(Mandatory = $true)]
  [ValidateRange(8000, 13500)]
  [int]$MeasuredEndMv,
  [ValidateRange(1, 500)]
  [int]$MaxMeterSpanMv = 50,
  [ValidateRange(10, 1000)]
  [int]$MaxObservedSpanMv = 150,
  [ValidateRange(30, 10000)]
  [int]$MinSamples = 30,
  [Parameter(Mandatory = $true)]
  [string]$OutputPath
)

$ErrorActionPreference = "Stop"

function Copy-PropertiesToOrderedMap {
  param([Parameter(Mandatory = $true)]$Value)

  $copy = [ordered]@{}
  foreach ($property in $Value.PSObject.Properties) {
    $copy[$property.Name] = $property.Value
  }
  return $copy
}

$resolvedCalibrationPath =
  (Resolve-Path -LiteralPath $ExistingCalibrationFile -ErrorAction Stop).Path
$resolvedManifestPath =
  (Resolve-Path -LiteralPath $CurrentReleaseManifestPath -ErrorAction Stop).Path
$resolvedReportPath = (Resolve-Path -LiteralPath $ReportPath -ErrorAction Stop).Path
$resolvedOutputPath = [System.IO.Path]::GetFullPath($OutputPath)
if ($resolvedOutputPath -eq $resolvedCalibrationPath) {
  throw "Refinement output must not overwrite the input calibration file"
}

$calibration = Get-Content -LiteralPath $resolvedCalibrationPath -Raw | ConvertFrom-Json
$manifest = Get-Content -LiteralPath $resolvedManifestPath -Raw | ConvertFrom-Json
$report = Get-Content -LiteralPath $resolvedReportPath -Raw | ConvertFrom-Json
$calibrationSha256 =
  (Get-FileHash -LiteralPath $resolvedCalibrationPath -Algorithm SHA256).Hash.ToLowerInvariant()
$manifestCalibrationSha256 = [string]$manifest.battery.calibrationSourceSha256

if ($calibration.schemaVersion -ne 1 -or $null -eq $calibration.nodes) {
  throw "Existing battery calibration must use schemaVersion 1 and contain nodes"
}
if ($manifest.schemaVersion -ne 1 -or $manifest.sourceDirty -ne $false) {
  throw "Current release manifest must be schemaVersion 1 and sourceDirty=false"
}
if ($manifestCalibrationSha256 -ne $calibrationSha256) {
  throw "Current release manifest does not reference the existing calibration file"
}

$calibrationNodeProperty = $calibration.nodes.PSObject.Properties[$NodeLabel]
$manifestNodeProperty = $manifest.battery.calibrationByNode.PSObject.Properties[$NodeLabel]
if ($null -eq $calibrationNodeProperty -or $null -eq $manifestNodeProperty) {
  throw "Calibration or release manifest is missing node $NodeLabel"
}
$oldNode = $calibrationNodeProperty.Value
$manifestNode = $manifestNodeProperty.Value
foreach ($name in @("gainPpm", "offsetMv", "verified")) {
  if ($null -eq $oldNode.PSObject.Properties[$name] -or
      $null -eq $manifestNode.PSObject.Properties[$name]) {
    throw "Node $NodeLabel calibration is missing $name"
  }
}
$oldGainPpm = [int]$oldNode.gainPpm
$oldOffsetMv = [int]$oldNode.offsetMv
if ($oldNode.verified -ne $true -or $manifestNode.verified -ne $true -or
    [int]$manifestNode.gainPpm -ne $oldGainPpm -or
    [int]$manifestNode.offsetMv -ne $oldOffsetMv) {
  throw "Node $NodeLabel release calibration does not match the existing verified calibration"
}
if ($oldGainPpm -lt 800000 -or $oldGainPpm -gt 1200000 -or
    $oldOffsetMv -lt -2000 -or $oldOffsetMv -gt 2000) {
  throw "Node $NodeLabel existing calibration is outside the supported range"
}

if ($null -eq $report.result -or $null -eq $report.nodes) {
  throw "Refinement input is not an XLS1 three-node report"
}
$stable = $report.result.stableProfile
if ($null -eq $stable) {
  $stable = $report.result.stableOneSecondProfile
}
if ($stable -ne $true) {
  throw "Battery refinement requires a report that passed the strict stability gate"
}
$reportNodeProperty = $report.nodes.PSObject.Properties[$NodeLabel]
if ($null -eq $reportNodeProperty -or $null -eq $reportNodeProperty.Value.battery) {
  throw "Report is missing node $NodeLabel battery evidence"
}
$battery = $reportNodeProperty.Value.battery
if ([int]$battery.samples -lt $MinSamples) {
  throw "Node $NodeLabel has fewer than $MinSamples battery samples"
}
if ($battery.estimateQuality -ne "field-calibrated") {
  throw "Node $NodeLabel must run the existing field calibration before refinement"
}
if ($null -eq $battery.voltageMedian -or
    $null -eq $battery.voltageMin -or
    $null -eq $battery.voltageMax) {
  throw "Node $NodeLabel report lacks voltageMedian/min/max"
}
$expectedSensorMode = [string]$manifest.fieldSensorMode
$requiredSensorMode = [string]$report.configuration.requiredFieldSensorSource
if ($expectedSensorMode -notin @("simulated", "hardware") -or
    $requiredSensorMode -ne $expectedSensorMode) {
  throw "Report field-sensor mode does not match the current release manifest"
}

$reportedMv = [int][math]::Round([double]$battery.voltageMedian * 1000.0)
$observedSpanMv = [int][math]::Round(
  ([double]$battery.voltageMax - [double]$battery.voltageMin) * 1000.0
)
$meterSpanMv = [math]::Abs($MeasuredEndMv - $MeasuredStartMv)
$measuredMv = [int][math]::Round(
  ($MeasuredStartMv + $MeasuredEndMv) / 2.0,
  [System.MidpointRounding]::AwayFromZero
)
if ($reportedMv -lt 8000 -or $reportedMv -gt 13500) {
  throw "Node $NodeLabel reported median voltage is outside the valid 3S range: $reportedMv mV"
}
if ($observedSpanMv -gt $MaxObservedSpanMv) {
  throw "Node $NodeLabel voltage changed by $observedSpanMv mV during capture"
}
if ($meterSpanMv -gt $MaxMeterSpanMv) {
  throw "Node $NodeLabel meter voltage changed by $meterSpanMv mV during capture"
}

$reportedWithoutOffsetMv = $reportedMv - $oldOffsetMv
$measuredWithoutOffsetMv = $measuredMv - $oldOffsetMv
if ($reportedWithoutOffsetMv -le 0 -or $measuredWithoutOffsetMv -le 0) {
  throw "Node $NodeLabel offset leaves no positive voltage for multiplicative refinement"
}
$newGainPpm = [int][math]::Round(
  ($oldGainPpm * [double]$measuredWithoutOffsetMv) / $reportedWithoutOffsetMv,
  [System.MidpointRounding]::AwayFromZero
)
if ($newGainPpm -lt 800000 -or $newGainPpm -gt 1200000) {
  throw "Node $NodeLabel refined correction $newGainPpm ppm exceeds the supported range"
}

$sourceReportsByNode = [ordered]@{}
if ($null -ne $calibration.sourceReportsByNode) {
  foreach ($property in $calibration.sourceReportsByNode.PSObject.Properties) {
    $sourceReportsByNode[$property.Name] = $property.Value
  }
}
$reportSha256 =
  (Get-FileHash -LiteralPath $resolvedReportPath -Algorithm SHA256).Hash.ToLowerInvariant()
$sourceReportsByNode[$NodeLabel] = [ordered]@{
  path = $resolvedReportPath
  sha256 = $reportSha256
}

$nodes = [ordered]@{}
foreach ($label in @("A", "B", "C")) {
  $property = $calibration.nodes.PSObject.Properties[$label]
  if ($null -eq $property) {
    throw "Existing battery calibration is missing node $label"
  }
  $nodes[$label] = Copy-PropertiesToOrderedMap -Value $property.Value
}
$refinedNode = $nodes[$NodeLabel]
$refinedNode["measuredPackMv"] = $measuredMv
$refinedNode["measuredStartMv"] = $MeasuredStartMv
$refinedNode["measuredEndMv"] = $MeasuredEndMv
$refinedNode["meterSpanMv"] = $meterSpanMv
$refinedNode["reportedPackMv"] = $reportedMv
$refinedNode["observedSpanMv"] = $observedSpanMv
$refinedNode["previousGainPpm"] = $oldGainPpm
$refinedNode["gainPpm"] = $newGainPpm
$refinedNode["offsetMv"] = $oldOffsetMv
$refinedNode["verified"] = $true

$refinements = @()
if ($null -ne $calibration.refinements) {
  $refinements = @($calibration.refinements)
}
$refinements += [ordered]@{
  node = $NodeLabel
  measuredStartMv = $MeasuredStartMv
  measuredEndMv = $MeasuredEndMv
  measuredPackMv = $measuredMv
  reportedPackMv = $reportedMv
  errorBeforeMv = $reportedMv - $measuredMv
  previousGainPpm = $oldGainPpm
  refinedGainPpm = $newGainPpm
  offsetMv = $oldOffsetMv
  reportPath = $resolvedReportPath
  reportSha256 = $reportSha256
}

$output = [ordered]@{
  schemaVersion = 1
  method = "iterative-one-point-multiplicative"
  generatedAt = (Get-Date).ToUniversalTime().ToString("o")
  previousCalibration = [ordered]@{
    path = $resolvedCalibrationPath
    sha256 = $calibrationSha256
  }
  sourceReportsByNode = $sourceReportsByNode
  nodes = $nodes
  refinements = $refinements
}
$outputDirectory = Split-Path -Parent $resolvedOutputPath
if ($outputDirectory) {
  New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null
}
$temporaryPath = "$resolvedOutputPath.tmp"
[System.IO.File]::WriteAllText(
  $temporaryPath,
  (($output | ConvertTo-Json -Depth 10) + [Environment]::NewLine),
  [System.Text.UTF8Encoding]::new($false)
)
Move-Item -LiteralPath $temporaryPath -Destination $resolvedOutputPath -Force

Write-Host ("BATTERY_REFINEMENT node={0} measured_mv={1} reported_mv={2} error_before_mv={3} old_gain_ppm={4} new_gain_ppm={5}" -f `
    $NodeLabel, $measuredMv, $reportedMv, ($reportedMv - $measuredMv), $oldGainPpm, $newGainPpm)
Write-Host "CALIBRATION_FILE path=$resolvedOutputPath"
