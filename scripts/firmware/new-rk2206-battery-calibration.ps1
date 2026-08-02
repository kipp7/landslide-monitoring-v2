[CmdletBinding()]
param(
  [Parameter(Mandatory = $true, ParameterSetName = "SharedReport")]
  [string]$ReportPath,
  [Parameter(Mandatory = $true, ParameterSetName = "PerNodeReports")]
  [string]$ReportPathA,
  [Parameter(Mandatory = $true, ParameterSetName = "PerNodeReports")]
  [string]$ReportPathB,
  [Parameter(Mandatory = $true, ParameterSetName = "PerNodeReports")]
  [string]$ReportPathC,
  [Parameter(Mandatory = $true)]
  [ValidateRange(8000, 13500)]
  [int]$MeasuredAMv,
  [Parameter(Mandatory = $true)]
  [ValidateRange(8000, 13500)]
  [int]$MeasuredBMv,
  [Parameter(Mandatory = $true)]
  [ValidateRange(8000, 13500)]
  [int]$MeasuredCMv,
  [ValidateRange(10, 1000)]
  [int]$MaxObservedSpanMv = 150,
  [string]$OutputPath = ""
)

$ErrorActionPreference = "Stop"

if ($PSCmdlet.ParameterSetName -eq "SharedReport") {
  $reportPathByNode = [ordered]@{
    A = $ReportPath
    B = $ReportPath
    C = $ReportPath
  }
} else {
  $reportPathByNode = [ordered]@{
    A = $ReportPathA
    B = $ReportPathB
    C = $ReportPathC
  }
}

$measuredByNode = @{
  A = $MeasuredAMv
  B = $MeasuredBMv
  C = $MeasuredCMv
}
$calibrationNodes = [ordered]@{}
$sourceReportsByNode = [ordered]@{}

foreach ($label in @("A", "B", "C")) {
  $resolvedReportPath = (Resolve-Path -LiteralPath $reportPathByNode[$label] -ErrorAction Stop).Path
  $report = Get-Content -LiteralPath $resolvedReportPath -Raw | ConvertFrom-Json
  if ($null -eq $report.result -or $null -eq $report.nodes) {
    throw "The input for node $label is not an XLS1 three-node report"
  }

  $stable = $report.result.stableProfile
  if ($null -eq $stable) {
    $stable = $report.result.stableOneSecondProfile
  }
  if ($stable -ne $true) {
    throw "Battery calibration requires a report that passed the strict stability gate for node $label"
  }

  $nodeProperty = $report.nodes.PSObject.Properties[$label]
  if ($null -eq $nodeProperty -or $null -eq $nodeProperty.Value.battery) {
    throw "Report is missing node $label battery evidence"
  }
  $battery = $nodeProperty.Value.battery
  if ([int]$battery.samples -lt 30) {
    throw "Node $label has fewer than 30 battery samples"
  }
  if ($battery.estimateQuality -ne "default-calibration") {
    throw "Node $label must run neutral default calibration before generating a one-point correction"
  }
  if ($null -eq $battery.voltageMedian -or
      $null -eq $battery.voltageMin -or
      $null -eq $battery.voltageMax) {
    throw "Node $label report lacks voltageMedian/min/max"
  }

  $reportedMv = [int][math]::Round([double]$battery.voltageMedian * 1000.0)
  $observedSpanMv = [int][math]::Round(
    ([double]$battery.voltageMax - [double]$battery.voltageMin) * 1000.0
  )
  if ($reportedMv -lt 8000 -or $reportedMv -gt 13500) {
    throw "Node $label reported median voltage is outside the valid 3S range: $reportedMv mV"
  }
  if ($observedSpanMv -gt $MaxObservedSpanMv) {
    throw "Node $label voltage changed by $observedSpanMv mV during capture; repeat with a stable load"
  }

  $measuredMv = [int]$measuredByNode[$label]
  $gainPpm = [int][math]::Round(($measuredMv * 1000000.0) / $reportedMv)
  if ($gainPpm -lt 800000 -or $gainPpm -gt 1200000) {
    throw "Node $label correction $gainPpm ppm exceeds the supported range; inspect PC0 wiring and divider values"
  }

  $calibrationNodes[$label] = [ordered]@{
    measuredPackMv = $measuredMv
    reportedPackMv = $reportedMv
    observedSpanMv = $observedSpanMv
    gainPpm = $gainPpm
    offsetMv = 0
    verified = $true
  }
  $sourceReportsByNode[$label] = [ordered]@{
    path = $resolvedReportPath
    sha256 = (Get-FileHash -LiteralPath $resolvedReportPath -Algorithm SHA256).Hash.ToLowerInvariant()
  }
}

if (-not $OutputPath) {
  $defaultReportPath = if ($PSCmdlet.ParameterSetName -eq "SharedReport") {
    $ReportPath
  } else {
    $ReportPathA
  }
  $resolvedDefaultReportPath = (Resolve-Path -LiteralPath $defaultReportPath -ErrorAction Stop).Path
  $OutputPath = Join-Path (
    Split-Path -Parent $resolvedDefaultReportPath
  ) ("battery-calibration-{0}.json" -f (Get-Date -Format "yyyyMMdd-HHmmss"))
}
$resolvedOutputPath = [System.IO.Path]::GetFullPath($OutputPath)
$outputDirectory = Split-Path -Parent $resolvedOutputPath
if ($outputDirectory) {
  New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null
}

$calibration = [ordered]@{
  schemaVersion = 1
  method = "one-point-multiplicative"
  generatedAt = (Get-Date).ToUniversalTime().ToString("o")
  sourceReportsByNode = $sourceReportsByNode
  nodes = $calibrationNodes
}
if ($PSCmdlet.ParameterSetName -eq "SharedReport") {
  $calibration["sourceReport"] = $sourceReportsByNode.A.path
  $calibration["sourceReportSha256"] = $sourceReportsByNode.A.sha256
}
$temporaryPath = "$resolvedOutputPath.tmp"
[System.IO.File]::WriteAllText(
  $temporaryPath,
  (($calibration | ConvertTo-Json -Depth 8) + [Environment]::NewLine),
  [System.Text.UTF8Encoding]::new($false)
)
Move-Item -LiteralPath $temporaryPath -Destination $resolvedOutputPath -Force

foreach ($label in @("A", "B", "C")) {
  $entry = $calibrationNodes[$label]
  Write-Host ("CALIBRATION node={0} measured_mv={1} reported_mv={2} gain_ppm={3}" -f `
      $label, $entry.measuredPackMv, $entry.reportedPackMv, $entry.gainPpm)
}
Write-Host "CALIBRATION_FILE path=$resolvedOutputPath"
