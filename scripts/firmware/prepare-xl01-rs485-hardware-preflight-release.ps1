[CmdletBinding()]
param(
  [string]$SdkRoot = "F:\2\openharmony\txsmartropenharmony",
  [string]$ContainerName = "openharmony-dev",
  [Parameter(Mandatory = $true)]
  [string]$ArtifactDirectory,
  [Parameter(Mandatory = $true)]
  [string]$BatteryCalibrationFile,
  [ValidateSet("A", "B", "C")]
  [string[]]$NodeLabels = @("A", "B", "C")
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$resolvedCalibrationPath =
  (Resolve-Path -LiteralPath $BatteryCalibrationFile -ErrorAction Stop).Path
$dirty = @(& git -C $repoRoot status --porcelain --untracked-files=normal)
if ($LASTEXITCODE -ne 0) {
  throw "Cannot inspect repository state before release"
}
if ($dirty.Count -ne 0) {
  throw "Refusing to create an official hardware preflight release from uncommitted source"
}

$headCommit = (& git -C $repoRoot rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or -not $headCommit) {
  throw "Cannot resolve repository HEAD"
}
$builder = Join-Path $PSScriptRoot "build-xl01-compact-broadcast-v2.ps1"
$verifier = Join-Path $PSScriptRoot "verify-rk2206-release-safety.ps1"
foreach ($requiredTool in @($builder, $verifier)) {
  if (-not (Test-Path -LiteralPath $requiredTool -PathType Leaf)) {
    throw "Required release tool is missing: $requiredTool"
  }
}

& $builder `
  -SdkRoot $SdkRoot `
  -ContainerName $ContainerName `
  -ArtifactDirectory $ArtifactDirectory `
  -GnssRtcmInjectionMode disabled `
  -FieldSensorMode hardware `
  -BatteryCalibrationFile $resolvedCalibrationPath `
  -NodeLabels $NodeLabels
if ($LASTEXITCODE -ne 0) {
  throw "RS485 hardware preflight build failed"
}

& $verifier `
  -ArtifactDirectory $ArtifactDirectory `
  -ExpectedFieldSensorMode hardware `
  -ExpectedGnssRtcmInjectionMode disabled `
  -ExpectedBatteryCalibrationState field-calibrated `
  -ExpectedSourceCommit $headCommit `
  -NodeLabels $NodeLabels
if ($LASTEXITCODE -ne 0) {
  throw "RS485 hardware preflight package failed the release safety verifier"
}

$manifestPath = Join-Path $ArtifactDirectory "manifest.json"
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$calibrationSha256 =
  (Get-FileHash -LiteralPath $resolvedCalibrationPath -Algorithm SHA256).Hash.ToLowerInvariant()
if ($manifest.battery.calibrationSourceSha256 -ne $calibrationSha256) {
  throw "Hardware preflight manifest does not reference the requested calibration file"
}

$guardPath = Join-Path $ArtifactDirectory "DO-NOT-FLASH-UNTIL-RS485-INSTALLED.txt"
$guard = @"
RK2206 RS485 hardware preflight package

DO NOT FLASH THIS PACKAGE UNTIL THE SC16IS752/RS485 INTERFACE IS INSTALLED
AND EVERY POWER-OFF AND FIRST-POWER CHECK BELOW HAS PASSED.

Profile
  Field sensors: hardware (soil/EC and tilt over SC16IS752/RS485)
  GNSS: real UM220 on EUART0_M0 PB6/PB7
  Battery: real field-calibrated PC0/SARADC channel 0, input only
  XLS1: EUART2_M1 PB2/PB3
  RTCM injection: disabled
  Source commit: $headCommit
  Calibration SHA-256: $calibrationSha256

Power-off gate
  1. Confirm the RK2206 and SC16IS752 module are aligned with no one-pin offset.
  2. Confirm PB4 reaches SC16IS752 SDA and PB5 reaches SC16IS752 SCL.
  3. Confirm 3.3 V and GND continuity and no short between either rail.
  4. Confirm the SC16IS752 address straps match 0x4D.
  5. Confirm each RS485 transceiver and sensor A/B/power connection.

First-power gate before flashing
  1. Power on without field sensors connected.
  2. Confirm the SC16IS752 supply is near 3.3 V and GND remains 0 V.
  3. Confirm PB4 and PB5 idle near 3.3 V; power off immediately if either rail is shorted.

Post-flash gate
  1. Flash only the .img matching the physical node label A, B, or C.
  2. Confirm firmware reports SC16IS752 ready at address 0x4D.
  3. Confirm soil/EC and tilt validity before starting the 600-second three-node gate.
  4. Keep RTCM disabled until the real-sensor gate passes.

Release verification
  powershell -ExecutionPolicy Bypass -File scripts/firmware/verify-rk2206-release-safety.ps1 `
    -ArtifactDirectory $ArtifactDirectory `
    -ExpectedFieldSensorMode hardware `
    -ExpectedGnssRtcmInjectionMode disabled `
    -ExpectedBatteryCalibrationState field-calibrated `
    -ExpectedSourceCommit $headCommit
"@
[System.IO.File]::WriteAllText(
  $guardPath,
  $guard,
  [System.Text.UTF8Encoding]::new($false)
)

Write-Host "RS485_HARDWARE_PREFLIGHT_OK path=$ArtifactDirectory source=$headCommit"
Write-Host "DO_NOT_FLASH guard=$guardPath"
