$ErrorActionPreference = "Stop"

$generator = Join-Path $PSScriptRoot "new-rk2206-battery-calibration.ps1"
$testRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("rk2206-battery-calibration-test-" + [guid]::NewGuid().ToString("N"))
$reportPath = Join-Path $testRoot "report.json"
$outputPath = Join-Path $testRoot "calibration.json"

function New-TestReport {
  param([bool]$Stable)

  $nodes = [ordered]@{}
  foreach ($entry in @(
      @{ Label = "A"; Median = 12.000; Min = 11.990; Max = 12.010 },
      @{ Label = "B"; Median = 11.900; Min = 11.890; Max = 11.910 },
      @{ Label = "C"; Median = 12.100; Min = 12.090; Max = 12.110 }
    )) {
    $nodes[$entry.Label] = [ordered]@{
      battery = [ordered]@{
        samples = 60
        voltageMin = $entry.Min
        voltageMax = $entry.Max
        voltageMedian = $entry.Median
        voltageLast = $entry.Median
        percentLast = 80
        estimateQuality = "default-calibration"
      }
    }
  }
  return [ordered]@{
    schemaVersion = 1
    result = [ordered]@{ stableProfile = $Stable }
    nodes = $nodes
  }
}

try {
  New-Item -ItemType Directory -Force -Path $testRoot | Out-Null
  [System.IO.File]::WriteAllText(
    $reportPath,
    ((New-TestReport -Stable $true | ConvertTo-Json -Depth 8) + [Environment]::NewLine),
    [System.Text.UTF8Encoding]::new($false)
  )

  & $generator `
    -ReportPath $reportPath `
    -MeasuredAMv 12060 `
    -MeasuredBMv 11900 `
    -MeasuredCMv 12039 `
    -OutputPath $outputPath | Out-Null

  $calibration = Get-Content -LiteralPath $outputPath -Raw | ConvertFrom-Json
  if ($calibration.schemaVersion -ne 1 -or
      $calibration.method -ne "one-point-multiplicative" -or
      $calibration.nodes.A.gainPpm -ne 1005000 -or
      $calibration.nodes.B.gainPpm -ne 1000000 -or
      $calibration.nodes.C.gainPpm -ne 994959 -or
      $calibration.nodes.B.verified -ne $true) {
    throw "Generated per-node battery calibration did not match the golden values"
  }

  [System.IO.File]::WriteAllText(
    $reportPath,
    ((New-TestReport -Stable $false | ConvertTo-Json -Depth 8) + [Environment]::NewLine),
    [System.Text.UTF8Encoding]::new($false)
  )
  $rejected = $false
  try {
    & $generator `
      -ReportPath $reportPath `
      -MeasuredAMv 12060 `
      -MeasuredBMv 11900 `
      -MeasuredCMv 12039 `
      -OutputPath (Join-Path $testRoot "must-not-exist.json") | Out-Null
  } catch {
    $rejected = $true
  }
  if (-not $rejected) {
    throw "Calibration generator accepted a report that failed the stability gate"
  }

  Write-Host "BATTERY_CALIBRATION_TEST_OK per-node gains and unstable-report rejection passed"
} finally {
  if (Test-Path -LiteralPath $testRoot -PathType Container) {
    Remove-Item -LiteralPath $testRoot -Recurse -Force
  }
}
