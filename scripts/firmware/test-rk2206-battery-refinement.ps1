$ErrorActionPreference = "Stop"

$refiner = Join-Path $PSScriptRoot "refine-rk2206-battery-calibration.ps1"
$testRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("rk2206-battery-refinement-test-" + [guid]::NewGuid().ToString("N"))
$calibrationPath = Join-Path $testRoot "calibration.json"
$manifestPath = Join-Path $testRoot "manifest.json"
$reportPath = Join-Path $testRoot "report.json"
$outputPath = Join-Path $testRoot "refined.json"

function Write-Utf8Json {
  param([string]$Path, $Value)

  [System.IO.File]::WriteAllText(
    $Path,
    (($Value | ConvertTo-Json -Depth 10) + [Environment]::NewLine),
    [System.Text.UTF8Encoding]::new($false)
  )
}

function New-TestReport {
  param(
    [bool]$Stable = $true,
    [string]$Quality = "field-calibrated",
    [double]$Min = 11.584,
    [double]$Median = 11.586,
    [double]$Max = 11.586
  )

  return [ordered]@{
    schemaVersion = 1
    configuration = [ordered]@{ requiredFieldSensorSource = "simulated" }
    result = [ordered]@{ stableProfile = $Stable }
    nodes = [ordered]@{
      A = [ordered]@{ battery = [ordered]@{ samples = 31; estimateQuality = $Quality; voltageMin = 11.438; voltageMedian = 11.438; voltageMax = 11.438 } }
      B = [ordered]@{ battery = [ordered]@{ samples = 31; estimateQuality = $Quality; voltageMin = $Min; voltageMedian = $Median; voltageMax = $Max } }
      C = [ordered]@{ battery = [ordered]@{ samples = 31; estimateQuality = $Quality; voltageMin = 11.389; voltageMedian = 11.389; voltageMax = 11.390 } }
    }
  }
}

function Invoke-ExpectedRejection {
  param([string]$Description, [scriptblock]$Action)

  $rejected = $false
  try {
    & $Action
  } catch {
    $rejected = $true
  }
  if (-not $rejected) {
    throw "Battery refinement accepted $Description"
  }
}

try {
  New-Item -ItemType Directory -Force -Path $testRoot | Out-Null
  $nodes = [ordered]@{
    A = [ordered]@{ measuredPackMv = 11440; reportedPackMv = 10931; observedSpanMv = 0; gainPpm = 1046565; offsetMv = 0; verified = $true }
    B = [ordered]@{ measuredPackMv = 11520; reportedPackMv = 10906; observedSpanMv = 1; gainPpm = 1056299; offsetMv = 0; verified = $true }
    C = [ordered]@{ measuredPackMv = 11520; reportedPackMv = 11706; observedSpanMv = 2; gainPpm = 984111; offsetMv = 0; verified = $true }
  }
  Write-Utf8Json -Path $calibrationPath -Value ([ordered]@{
      schemaVersion = 1
      method = "one-point-multiplicative"
      sourceReportsByNode = [ordered]@{}
      nodes = $nodes
    })
  $calibrationSha256 = (Get-FileHash -LiteralPath $calibrationPath -Algorithm SHA256).Hash.ToLowerInvariant()
  Write-Utf8Json -Path $manifestPath -Value ([ordered]@{
      schemaVersion = 1
      sourceDirty = $false
      fieldSensorMode = "simulated"
      battery = [ordered]@{
        calibrationSourceSha256 = $calibrationSha256
        calibrationByNode = $nodes
      }
    })
  Write-Utf8Json -Path $reportPath -Value (New-TestReport)

  & $refiner `
    -ExistingCalibrationFile $calibrationPath `
    -CurrentReleaseManifestPath $manifestPath `
    -NodeLabel B `
    -ReportPath $reportPath `
    -MeasuredStartMv 11500 `
    -MeasuredEndMv 11500 `
    -OutputPath $outputPath | Out-Null

  $refined = Get-Content -LiteralPath $outputPath -Raw | ConvertFrom-Json
  if ($refined.schemaVersion -ne 1 -or
      $refined.method -ne "iterative-one-point-multiplicative" -or
      $refined.nodes.A.gainPpm -ne 1046565 -or
      $refined.nodes.B.previousGainPpm -ne 1056299 -or
      $refined.nodes.B.gainPpm -ne 1048458 -or
      $refined.nodes.B.measuredStartMv -ne 11500 -or
      $refined.nodes.B.measuredEndMv -ne 11500 -or
      $refined.nodes.C.gainPpm -ne 984111 -or
      $refined.previousCalibration.sha256 -ne $calibrationSha256 -or
      $refined.refinements[0].errorBeforeMv -ne 86) {
    throw "Refined battery calibration did not match the golden values"
  }

  Write-Utf8Json -Path $reportPath -Value (New-TestReport -Stable $false)
  Invoke-ExpectedRejection -Description "an unstable report" -Action {
    & $refiner -ExistingCalibrationFile $calibrationPath -CurrentReleaseManifestPath $manifestPath `
      -NodeLabel B -ReportPath $reportPath -MeasuredStartMv 11500 -MeasuredEndMv 11500 `
      -OutputPath (Join-Path $testRoot "unstable.json") | Out-Null
  }

  Write-Utf8Json -Path $reportPath -Value (New-TestReport -Quality "default-calibration")
  Invoke-ExpectedRejection -Description "a neutral-calibration report" -Action {
    & $refiner -ExistingCalibrationFile $calibrationPath -CurrentReleaseManifestPath $manifestPath `
      -NodeLabel B -ReportPath $reportPath -MeasuredStartMv 11500 -MeasuredEndMv 11500 `
      -OutputPath (Join-Path $testRoot "neutral.json") | Out-Null
  }

  Write-Utf8Json -Path $reportPath -Value (New-TestReport)
  Invoke-ExpectedRejection -Description "an unstable meter window" -Action {
    & $refiner -ExistingCalibrationFile $calibrationPath -CurrentReleaseManifestPath $manifestPath `
      -NodeLabel B -ReportPath $reportPath -MeasuredStartMv 11500 -MeasuredEndMv 11560 `
      -OutputPath (Join-Path $testRoot "meter-span.json") | Out-Null
  }

  $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
  $manifest.battery.calibrationSourceSha256 = "0" * 64
  Write-Utf8Json -Path $manifestPath -Value $manifest
  Invoke-ExpectedRejection -Description "a release with mismatched calibration provenance" -Action {
    & $refiner -ExistingCalibrationFile $calibrationPath -CurrentReleaseManifestPath $manifestPath `
      -NodeLabel B -ReportPath $reportPath -MeasuredStartMv 11500 -MeasuredEndMv 11500 `
      -OutputPath (Join-Path $testRoot "wrong-release.json") | Out-Null
  }

  Write-Host "BATTERY_REFINEMENT_TEST_OK golden gain and rejection paths passed"
} finally {
  if (Test-Path -LiteralPath $testRoot -PathType Container) {
    Remove-Item -LiteralPath $testRoot -Recurse -Force
  }
}
