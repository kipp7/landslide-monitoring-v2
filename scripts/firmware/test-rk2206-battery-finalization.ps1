$ErrorActionPreference = "Stop"

$finalizer = Join-Path $PSScriptRoot "finalize-rk2206-battery-calibration.ps1"
$testRoot = Join-Path ([System.IO.Path]::GetTempPath()) (
  "rk2206-battery-finalization-test-" + [guid]::NewGuid().ToString("N")
)
$calibrationPath = Join-Path $testRoot "calibration.json"
$outputPath = Join-Path $testRoot "final.json"
$sourceCommit = "a" * 40

function Write-Utf8Json {
  param([string]$Path, $Value)

  $parent = Split-Path -Parent $Path
  if ($parent) {
    New-Item -ItemType Directory -Force -Path $parent | Out-Null
  }
  [System.IO.File]::WriteAllText(
    $Path,
    (($Value | ConvertTo-Json -Depth 12) + [Environment]::NewLine),
    [System.Text.UTF8Encoding]::new($false)
  )
}

function New-TestReport {
  param(
    [bool]$Stable = $true,
    [int]$DecodeErrors = 0
  )

  return [ordered]@{
    schemaVersion = 1
    configuration = [ordered]@{
      requiredCompactVersion = 2
      requiredFieldSensorSource = "simulated"
      requireBatteryValid = $true
      requireFieldSensorsValid = $true
    }
    result = [ordered]@{
      stableProfile = $Stable
      stableOneSecondProfile = $Stable
      expectedTelemetry = 93
      matchedTelemetry = 93
      missingTelemetry = 0
      batchesSent = 31
      decodeOrJsonErrors = $DecodeErrors
      profileViolations = 0
      unmatchedTelemetry = 0
      duplicateTelemetry = 0
      trailingUndelimitedBytes = 0
      broadcastRetryCommands = 0
      broadcastRetryRounds = 0
      redundantRetryTelemetry = 0
      batchCompleteness = [ordered]@{
        completeBatches = 31
        partialBatches = 0
        emptyBatches = 0
      }
    }
    nodes = [ordered]@{
      A = [ordered]@{ battery = [ordered]@{ samples = 31; voltageMin = 11.429; voltageMedian = 11.429; voltageMax = 11.429; estimateQuality = "field-calibrated" } }
      B = [ordered]@{ battery = [ordered]@{ samples = 31; voltageMin = 11.507; voltageMedian = 11.507; voltageMax = 11.507; estimateQuality = "field-calibrated" } }
      C = [ordered]@{ battery = [ordered]@{ samples = 31; voltageMin = 11.490; voltageMedian = 11.491; voltageMax = 11.492; estimateQuality = "field-calibrated" } }
    }
  }
}

function New-TestReleaseManifest {
  param(
    [string]$Path,
    [object]$Calibration,
    [string]$NodeLabel
  )

  $releaseRoot = Split-Path -Parent $Path
  $releaseCalibrationPath = Join-Path $releaseRoot "battery-calibration.json"
  Write-Utf8Json -Path $releaseCalibrationPath -Value $Calibration
  $calibrationSha256 =
    (Get-FileHash -LiteralPath $releaseCalibrationPath -Algorithm SHA256).Hash.ToLowerInvariant()
  $manifest = [ordered]@{
    schemaVersion = 1
    sourceCommit = $sourceCommit
    sourceDirty = $false
    fieldSensorMode = "simulated"
    gnssRtcmInjectionMode = "disabled"
    battery = [ordered]@{
      calibrationSourceSha256 = $calibrationSha256
      calibrationByNode = $Calibration.nodes
    }
    testNode = $NodeLabel
  }
  Write-Utf8Json -Path $Path -Value $manifest
}

function Invoke-Finalizer {
  param(
    [string]$Destination,
    [int]$MeasuredStartAMv = 11420,
    [int]$MeasuredEndAMv = 11420
  )

  & $finalizer `
    -CalibrationFile $calibrationPath `
    -ReportPathA (Join-Path $testRoot "report-A.json") `
    -ReportPathB (Join-Path $testRoot "report-B.json") `
    -ReportPathC (Join-Path $testRoot "report-C.json") `
    -ReleaseManifestPathA (Join-Path $testRoot "release-A\manifest.json") `
    -ReleaseManifestPathB (Join-Path $testRoot "release-B\manifest.json") `
    -ReleaseManifestPathC (Join-Path $testRoot "release-C\manifest.json") `
    -MeasuredStartAMv $MeasuredStartAMv `
    -MeasuredEndAMv $MeasuredEndAMv `
    -MeasuredStartBMv 11500 `
    -MeasuredEndBMv 11500 `
    -MeasuredStartCMv 11490 `
    -MeasuredEndCMv 11500 `
    -OutputPath $Destination | Out-Null
}

function Assert-Rejected {
  param([string]$Reason, [scriptblock]$Action)

  $rejected = $false
  try {
    & $Action
  } catch {
    $rejected = $true
  }
  if (-not $rejected) {
    throw "Battery finalizer accepted invalid evidence: $Reason"
  }
}

try {
  New-Item -ItemType Directory -Force -Path $testRoot | Out-Null
  $calibration = [ordered]@{
    schemaVersion = 1
    method = "iterative-one-point-multiplicative"
    nodes = [ordered]@{
      A = [ordered]@{ gainPpm = 1046565; offsetMv = 0; verified = $true }
      B = [ordered]@{ gainPpm = 1048458; offsetMv = 0; verified = $true }
      C = [ordered]@{ gainPpm = 993702; offsetMv = 0; verified = $true }
    }
  }
  Write-Utf8Json -Path $calibrationPath -Value $calibration
  foreach ($label in @("A", "B", "C")) {
    Write-Utf8Json -Path (Join-Path $testRoot "report-$label.json") -Value (New-TestReport)
    New-TestReleaseManifest `
      -Path (Join-Path $testRoot "release-$label\manifest.json") `
      -Calibration $calibration `
      -NodeLabel $label
  }

  Invoke-Finalizer -Destination $outputPath
  $final = Get-Content -LiteralPath $outputPath -Raw | ConvertFrom-Json
  if ($final.schemaVersion -ne 1 -or
      $final.finalAcceptance.allNodesAccepted -ne $true -or
      $final.finalAcceptance.maxAllowedAbsErrorMv -ne 60 -or
      $final.nodes.A.gainPpm -ne 1046565 -or
      $final.nodes.B.gainPpm -ne 1048458 -or
      $final.nodes.C.gainPpm -ne 993702 -or
      $final.acceptanceByNode.A.maxAbsErrorMv -ne 9 -or
      $final.acceptanceByNode.B.maxAbsErrorMv -ne 7 -or
      $final.acceptanceByNode.C.maxAbsErrorMv -ne 9 -or
      $final.acceptanceByNode.C.matchedTelemetry -ne 93) {
    throw "Final battery calibration did not match the golden acceptance values"
  }

  Write-Utf8Json -Path (Join-Path $testRoot "report-A.json") -Value (New-TestReport -Stable $false)
  Assert-Rejected -Reason "unstable report" -Action {
    Invoke-Finalizer -Destination (Join-Path $testRoot "unstable.json")
  }
  Write-Utf8Json -Path (Join-Path $testRoot "report-A.json") -Value (New-TestReport)

  Write-Utf8Json -Path (Join-Path $testRoot "report-B.json") -Value (New-TestReport -DecodeErrors 1)
  Assert-Rejected -Reason "non-zero communication error" -Action {
    Invoke-Finalizer -Destination (Join-Path $testRoot "communication-error.json")
  }
  Write-Utf8Json -Path (Join-Path $testRoot "report-B.json") -Value (New-TestReport)

  Assert-Rejected -Reason "meter error above 60 mV" -Action {
    Invoke-Finalizer `
      -Destination (Join-Path $testRoot "meter-error.json") `
      -MeasuredStartAMv 11300 `
      -MeasuredEndAMv 11300
  }

  $manifestPathB = Join-Path $testRoot "release-B\manifest.json"
  $manifestB = Get-Content -LiteralPath $manifestPathB -Raw | ConvertFrom-Json
  $manifestB.battery.calibrationByNode.B.gainPpm = 1000000
  Write-Utf8Json -Path $manifestPathB -Value $manifestB
  Assert-Rejected -Reason "release manifest calibration mismatch" -Action {
    Invoke-Finalizer -Destination (Join-Path $testRoot "manifest-mismatch.json")
  }

  Write-Host "BATTERY_FINALIZATION_TEST_OK three-node acceptance and rejection paths passed"
} finally {
  if (Test-Path -LiteralPath $testRoot -PathType Container) {
    Remove-Item -LiteralPath $testRoot -Recurse -Force
  }
}
